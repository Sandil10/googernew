import 'dart:convert';
import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as image_lib;
import 'package:ionicons/ionicons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api.dart';
import '../data/mock.dart';
import '../services/app_notifications.dart';
import '../services/home_feed_refresh_bus.dart';
import '../theme/colors.dart';
import '../util/upload_picker.dart';
import '../util/subscription_limits.dart';
import '../util/video_trim.dart';
import '../util/web_video.dart';
import '../widgets/upgrade_plan_sheet.dart';
import 'profile_screen.dart';
import 'subscription_screen.dart';

Map<String, dynamic> _uploadPlanExtra(Map<String, dynamic>? plan) {
  final raw = plan?['extra'];
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String && raw.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}
  }
  return const {};
}

/// Web `createNextAdId` parity for upload content: the last seven timestamp
/// digits followed by a three-digit random suffix.
String buildUploadContentId({DateTime? now, math.Random? random}) {
  final timestamp = (now ?? DateTime.now()).millisecondsSinceEpoch.toString();
  final timestampPart = timestamp.length <= 7
      ? timestamp.padLeft(7, '0')
      : timestamp.substring(timestamp.length - 7);
  final randomPart = 100 + (random ?? math.Random()).nextInt(900);
  return '$timestampPart$randomPart';
}

String uploadContentIdAfterPublish({
  required bool isEditing,
  required String originalContentId,
  required String serverContentId,
}) {
  return isEditing ? originalContentId.trim() : serverContentId.trim();
}

/// Resolves the same active plan used by the web upload-content editor.
///
/// `/subscription-plans/my` is authoritative when available. Some sessions
/// briefly return null there while `/subscriptions/me` and the public plan
/// list are already available, so use the active subscription identity as a
/// fallback instead of silently dropping the user to Basic limits.
Map<String, dynamic>? resolveUploadContentPlan(
  Map<String, dynamic>? myPlan,
  Map<String, dynamic>? subscription,
  List<Map<String, dynamic>> publicPlans,
) {
  Map<String, dynamic>? nestedPlan(Map<String, dynamic>? row) {
    if (row == null) return null;
    for (final key in const [
      'data',
      'plan',
      'current_plan',
      'subscription_plan',
    ]) {
      final value = row[key];
      if (value is Map) return Map<String, dynamic>.from(value);
    }
    return row;
  }

  final direct = nestedPlan(myPlan);
  final fromSubscription = nestedPlan(
    subscription?['plan'] is Map
        ? Map<String, dynamic>.from(subscription!['plan'] as Map)
        : null,
  );
  final wantedId = int.tryParse(
    '${subscription?['plan_id'] ?? direct?['id'] ?? fromSubscription?['id'] ?? ''}',
  );
  final wantedSlug =
      '${subscription?['plan_slug'] ?? direct?['slug'] ?? fromSubscription?['slug'] ?? ''}'
          .trim()
          .toLowerCase();

  Map<String, dynamic>? publicMatch;
  for (final candidate in publicPlans) {
    final candidateId = int.tryParse('${candidate['id'] ?? ''}');
    final candidateSlug = '${candidate['slug'] ?? ''}'.trim().toLowerCase();
    if ((wantedId != null && candidateId == wantedId) ||
        (wantedSlug.isNotEmpty && candidateSlug == wantedSlug)) {
      publicMatch = candidate;
      break;
    }
  }

  final resolved = direct ?? fromSubscription ?? publicMatch;
  if (resolved == null) return null;
  return <String, dynamic>{
    if (publicMatch != null) ...publicMatch,
    ...resolved,
    if (_uploadPlanExtra(resolved).isEmpty && publicMatch != null)
      'extra': publicMatch['extra'],
  };
}

double uploadContentVideoLimitMinutes(Map<String, dynamic>? plan) {
  final isBasic =
      plan?['is_basic'] == true ||
      '${plan?['slug'] ?? ''}'.toLowerCase() == 'basic' ||
      (double.tryParse('${plan?['price'] ?? 0}') ?? 0) == 0;
  final fallback = isBasic ? 1.0 : 5.0;
  final value = double.tryParse(
    '${_uploadPlanExtra(plan)['content_video_limit_minutes'] ?? fallback}',
  );
  return value != null && value > 0 ? value : fallback;
}

Map<String, dynamic>? recommendedVideoPlanForDuration(
  List<Map<String, dynamic>> plans, {
  required num currentLimitMinutes,
  required num videoDurationSeconds,
}) {
  num planLimit(Map<String, dynamic> plan) {
    dynamic extra = plan['extra'];
    if (extra is String && extra.trim().isNotEmpty) {
      try {
        extra = jsonDecode(extra);
      } catch (_) {
        extra = null;
      }
    }
    final basic =
        plan['is_basic'] == true ||
        '${plan['slug'] ?? ''}'.toLowerCase() == 'basic' ||
        (num.tryParse('${plan['price'] ?? 0}') ?? 0) == 0;
    final fallback = basic ? 1 : 5;
    final value = extra is Map
        ? num.tryParse('${extra['content_video_limit_minutes'] ?? fallback}')
        : null;
    return value != null && value > 0 ? value : fallback;
  }

  final higher =
      plans
          .where((plan) => (num.tryParse('${plan['price'] ?? 0}') ?? 0) > 0)
          .map(
            (plan) =>
                Map<String, dynamic>.from(plan)
                  ..['_video_limit_minutes'] = planLimit(plan),
          )
          .where(
            (plan) =>
                (plan['_video_limit_minutes'] as num) > currentLimitMinutes,
          )
          .toList()
        ..sort((a, b) {
          final byLimit = (a['_video_limit_minutes'] as num).compareTo(
            b['_video_limit_minutes'] as num,
          );
          if (byLimit != 0) return byLimit;
          return (num.tryParse('${a['price'] ?? 0}') ?? 0).compareTo(
            num.tryParse('${b['price'] ?? 0}') ?? 0,
          );
        });
  if (higher.isEmpty) return null;
  return higher.firstWhere(
    (plan) =>
        (plan['_video_limit_minutes'] as num) * 60 >= videoDurationSeconds,
    orElse: () => higher.first,
  );
}

String? uploadContentMediaSelectionProblem(
  List<String?> contentTypes, {
  required bool isFlash,
}) {
  final videoCount = contentTypes
      .where((type) => (type ?? '').startsWith('video/'))
      .length;
  final imageCount = contentTypes
      .where((type) => (type ?? '').startsWith('image/'))
      .length;
  if (isFlash) {
    if (contentTypes.length != 1 || videoCount != 1) {
      return 'Flash Content supports one video upload only.';
    }
    return null;
  }
  if (videoCount > 0 && imageCount > 0) {
    return 'Choose either one video or up to 5 images, not both.';
  }
  if (videoCount > 1) return 'Vault Content supports one video at a time.';
  if (imageCount > 5) return 'Vault Content supports up to 5 images.';
  if (videoCount == 0 && imageCount == 0) {
    return 'Choose an image or video file.';
  }
  return null;
}

/// Matches the Web editor's mode immediately after a media selection.
/// Vault videos start in Thumbnail mode so the user can either upload a
/// thumbnail or deselect it and create the mutually-exclusive 3-second preview.
String uploadPreviewModeAfterMediaSelection({
  required bool isFlash,
  required bool hasVideo,
}) {
  if (isFlash) return 'auto_preview';
  return hasVideo ? 'thumbnail' : 'none';
}

String uploadPreviewModeForPublish({
  required bool isEditing,
  required bool hasNewMedia,
  required bool hasVideo,
  required bool hasNewThumbnail,
  required String selectedMode,
}) {
  if (selectedMode == 'blurred') return 'thumbnail';
  if (hasNewThumbnail) return 'thumbnail';
  if (isEditing && !hasNewMedia) return selectedMode;
  return selectedMode;
}

bool isExclusiveVaultPreviewMode(String mode) =>
    mode == 'thumbnail' || mode == 'auto_preview' || mode == 'blurred';

bool vaultPreviewChoiceDisabled({
  required String choice,
  required String selectedMode,
  required bool hasVideoLikeContent,
  required bool hasRawVideo,
  required bool canBlur,
  required bool hasImageLikeContent,
}) {
  final exclusive =
      hasVideoLikeContent && isExclusiveVaultPreviewMode(selectedMode);
  switch (choice) {
    case 'thumbnail':
      return exclusive && selectedMode != 'thumbnail';
    case 'auto_preview':
      return !hasRawVideo || (exclusive && selectedMode != 'auto_preview');
    case 'blurred':
      return !canBlur || (exclusive && selectedMode != 'blurred');
    case 'unblurred':
      return hasImageLikeContent || exclusive;
    default:
      return true;
  }
}

bool useExistingUploadContentMedia({
  required bool isEditing,
  required bool removed,
  required bool hasNewMedia,
}) {
  return isEditing && !removed && !hasNewMedia;
}

bool preserveExistingUploadContentThumbnail({
  required bool hasNewThumbnail,
  required bool removed,
  required String existingThumbnail,
}) {
  return !hasNewThumbnail && !removed && existingThumbnail.trim().isNotEmpty;
}

bool uploadContentShowLinkedContentOnHomeForPublish({
  required String activeLink,
  required bool selected,
}) {
  return activeLink.trim().isNotEmpty && selected;
}

String uploadContentMediaPreviewForPublish({
  required String activeLink,
  required String linkPreviewImage,
  required bool hasNewMedia,
  required String existingMediaPreview,
}) {
  if (activeLink.trim().isNotEmpty && linkPreviewImage.trim().isNotEmpty) {
    return linkPreviewImage.trim();
  }
  if (!hasNewMedia && existingMediaPreview.trim().isNotEmpty) {
    return existingMediaPreview.trim();
  }
  return '';
}

List<String> mergeUploadContentTags(List<String> current, String draft) {
  final merged = [...current];
  for (final part in draft.replaceAll(',', ' ').split(RegExp(r'\s+'))) {
    final tag = part.trim().replaceAll(RegExp(r'^#+'), '');
    if (tag.isEmpty || merged.contains(tag)) continue;
    merged.add(tag);
    if (merged.length == 20) break;
  }
  return merged.take(20).toList(growable: false);
}

class _VerticalTrimThumbShape extends RangeSliderThumbShape {
  const _VerticalTrimThumbShape();

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) => const Size(14, 34);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    bool isDiscrete = false,
    bool isEnabled = false,
    bool? isOnTop,
    required SliderThemeData sliderTheme,
    TextDirection? textDirection,
    Thumb? thumb,
    bool? isPressed,
  }) {
    final canvas = context.canvas;
    final outer = RRect.fromRectAndRadius(
      Rect.fromCenter(center: center, width: 13, height: 34),
      const Radius.circular(7),
    );
    canvas.drawShadow(
      Path()..addRRect(outer),
      const Color(0xFFFF3F73),
      7,
      true,
    );
    canvas.drawRRect(outer, Paint()..color = const Color(0xFFFF6388));
    final inner = RRect.fromRectAndRadius(
      Rect.fromCenter(center: center, width: 3, height: 17),
      const Radius.circular(2),
    );
    canvas.drawRRect(inner, Paint()..color = Colors.white);
  }
}

class _VideoTrimResult {
  final ApiUploadFile file;
  final double start;
  final double end;
  final double originalDuration;

  const _VideoTrimResult({
    required this.file,
    required this.start,
    required this.end,
    required this.originalDuration,
  });
}

/// Vault Content Studio — mobile port of the web `UploadContentCampaignEditor`.
///
/// Flash and Vault are two modes of one screen, swapped by the ⇄ control in the
/// header, and they differ in more than labels:
///
/// | | Flash | Vault |
/// | --- | --- | --- |
/// | Media | one video only | one video **or** up to 5 images |
/// | Thumbnail | optional, pre-roll poster | always offered |
/// | Content Access | always unblurred | Blurred / Non-blurred |
/// | Price | fixed by admin | seller picks within the admin range |
/// | Share commission | ✕ | ✅ |
///
/// This is deliberately *not* built on `CampaignEditor`: upload content has no
/// budget, targeting or ad-delivery concepts, and routing it through the ad
/// builder is what put budget sliders and reach estimates on a content upload.
class UploadContentStudio extends StatefulWidget {
  /// 'flash' or 'vault' — the mode the studio opens in.
  final String initialMode;
  final UploadContent? initialContent;

  const UploadContentStudio({
    super.key,
    this.initialMode = 'vault',
    this.initialContent,
  });

  @override
  State<UploadContentStudio> createState() => _UploadContentStudioState();
}

class _UploadContentStudioState extends State<UploadContentStudio> {
  static const _accent = Color(0xFFF43F5E);
  static const _publishRed = Color(0xFFE0555F);
  static const _greenBorder = Color(0xFF34D399);
  static const _studioBlack = Colors.black;
  static const _panelBlack = Color(0xFF0A0A0B);
  static const _panelSoft = Color(0xFF151515);
  static const _uploadButtonBg = Color(0xFF242322);

  late String _mode = widget.initialMode == 'flash' ? 'flash' : 'vault';
  bool get _isFlash => _mode == 'flash';

  // ---- Apply link ----
  final _link = TextEditingController();
  String _activeLink = '';
  String _linkPreviewTitle = '';
  String _linkPreviewImage = '';

  // ---- Media ----
  List<ApiUploadFile> _media = const [];
  ApiUploadFile? _thumbnail;
  bool _removeExistingMedia = false;
  bool _removeExistingThumbnail = false;
  double? _selectedVideoDurationSeconds;
  double _selectedVideoTrimStartSeconds = 0;
  double _selectedVideoTrimEndSeconds = 0;
  double _selectedVideoOriginalDurationSeconds = 0;
  int _selectedVideoWidth = 0;
  int _selectedVideoHeight = 0;
  String _selectedVideoPreviewUrl = '';
  Uint8List? _selectedVideoThumbnailBytes;
  int _selectedImageIndex = 0;
  int _selectedImageWidth = 0;
  int _selectedImageHeight = 0;
  late String _uploadPreviewMode = _isFlash ? 'auto_preview' : 'none';

  // ---- Vault-only ----
  String _contentAccessMode = 'unblurred';
  double _price = 0;
  final _priceController = TextEditingController();
  bool _showLinkedContentOnHome = false;
  bool _subscriptionAccessEnabled = false;
  List<_SubscriptionTier> _subscriptionTiers = const [];
  List<_CommissionTier> _subscriptionCommissionTiers = const [];
  final _shareCommissionPct = TextEditingController();
  final _shareCommissionAmount = TextEditingController();

  // ---- Shared ----
  final _title = TextEditingController();
  String _topic = '';
  final _hashtags = TextEditingController();
  final _tagDraft = TextEditingController();
  final _tagFocus = FocusNode();
  final _topicLayerLink = LayerLink();
  final _topicScrollController = ScrollController();
  OverlayEntry? _topicOverlay;
  List<String> _tags = const [];
  String _visibility = 'public';
  bool _allowComments = true;
  bool _acceptedTerms = false;
  String _previewMode = 'mobile';
  String _publishedContentId = '';
  bool _showPublishedPopup = false;
  bool _publishedPendingApproval = true;
  String _publishedMessage = '';
  bool _topicsOpen = false;
  bool _visibilityOpen = false;

  // ---- Admin config ----
  double _minUploadPrice = 1;
  double _maxUploadPrice = 100;
  double _flashPrice = 0;
  int _flashPreviewSeconds = 5;
  int _videoLimitSeconds = 60;
  List<Map<String, dynamic>> _publicPlans = const [];
  bool _settingsLoaded = false;
  bool? _userHasPaidSubscription;
  String _contentExpiryLabel = '30 days';

  bool _submitting = false;
  double _uploadProgress = 0;
  Timer? _draftSaveTimer;
  bool _draftReady = false;
  UploadContent? get _editingContent => widget.initialContent;
  bool get _isEditing => _editingContent != null;
  List<String> get _existingMedia {
    if (_removeExistingMedia) return const [];
    final item = _editingContent;
    if (item == null) return const [];
    return item.mediaGallerySource.isNotEmpty
        ? item.mediaGallerySource
        : item.mediaGallery;
  }

  String get _existingMediaPreview {
    final item = _editingContent;
    if (item == null) return '';
    if (item.mediaPreviewSource.isNotEmpty) return item.mediaPreviewSource;
    return _existingMedia.isEmpty ? '' : _existingMedia.first;
  }

  String get _existingThumbnail {
    if (_removeExistingThumbnail) return '';
    final item = _editingContent;
    if (item == null) return '';
    return item.thumbnailSource.isNotEmpty
        ? item.thumbnailSource
        : item.thumbnail;
  }

  String get _existingPreviewUrl {
    final item = _editingContent;
    if (item == null) return '';
    return item.previewUrlSource.isNotEmpty
        ? item.previewUrlSource
        : item.previewUrl;
  }

  String get _existingDisplayMediaUrl {
    if (_removeExistingMedia) return '';
    return _editingContent?.mediaUrl.trim() ?? '';
  }

  String get _existingDisplayThumbnailUrl {
    if (_removeExistingThumbnail) return '';
    return _editingContent?.thumbnail.trim() ?? '';
  }

  static const _topics = [
    'Comedy',
    'Food & Cooking',
    'Education',
    'Technology',
    'Business',
    'Finance',
    'Health',
    'Sports',
    'Entertainment',
    'Science',
    'Travel',
    'Music',
    'Gaming',
    'AI',
    'Programming',
    'News',
    'Lifestyle',
    'Agriculture',
    'Real Estate',
    'Automotive',
    'Marketing',
    'Beauty & Fashion',
    'Pets & Animals',
    'Kids & Family',
    'Films & Animation',
  ];

  static const _visibilityOptions = <String, (String, IconData)>{
    'public': ('Public', Ionicons.earth_outline),
    'subscribers_only': ('Subscribers Only', Ionicons.people_outline),
    'private': ('Private', Ionicons.lock_closed_outline),
  };

  @override
  void initState() {
    super.initState();
    _prefillEditContent();
    _tagFocus.addListener(_commitTagOnBlur);
    for (final controller in [
      _link,
      _title,
      _priceController,
      _shareCommissionPct,
      _shareCommissionAmount,
      _tagDraft,
    ]) {
      controller.addListener(_scheduleDraftSave);
    }
    if (!_isEditing) {
      _loadDraft().whenComplete(() {
        if (!mounted) return;
        _draftReady = true;
      });
    }
    _loadSettings();
  }

  void _prefillEditContent() {
    final item = _editingContent;
    if (item == null) return;
    _mode = item.type.toLowerCase() == 'flash' ? 'flash' : 'vault';
    _activeLink = item.externalLink;
    _link.text = item.externalLink;
    _title.text = item.description;
    _topic = item.topic;
    _tags = item.hashtags
        .split(RegExp(r'[\s,]+'))
        .map((tag) => tag.trim().replaceFirst(RegExp(r'^#'), ''))
        .where((tag) => tag.isNotEmpty)
        .toList(growable: false);
    _hashtags.text = _tags.map((tag) => '#$tag').join(' ');
    _visibility = item.visibility.isEmpty ? 'public' : item.visibility;
    _allowComments = item.allowComments;
    _contentAccessMode = item.contentAccessMode.isEmpty
        ? 'unblurred'
        : item.contentAccessMode;
    _price = item.coins;
    _priceController.text = _formatEditableNumber(item.coins);
    _showLinkedContentOnHome = item.showLinkOnHome;
    _shareCommissionPct.text = '${item.affiliateCommission}';
    _syncCommissionAmountFromPercent();
    _subscriptionTiers = item.subscriptionPackages
        .map(
          (package) => _SubscriptionTier(
            label: package.id,
            price: package.price,
            minutes: package.minutes,
            affiliateCommission: package.affiliateCommission,
          ),
        )
        .toList(growable: false);
    _subscriptionAccessEnabled = _subscriptionTiers.isNotEmpty;
    _selectedVideoDurationSeconds = item.videoDurationSeconds > 0
        ? item.videoDurationSeconds
        : null;
    _selectedVideoTrimStartSeconds = item.videoTrimStartSeconds;
    _selectedVideoTrimEndSeconds = item.videoTrimEndSeconds;
    _selectedVideoOriginalDurationSeconds = item.videoOriginalDurationSeconds;
    _uploadPreviewMode = item.previewMode;
    _acceptedTerms = true;
  }

  String get _draftKey => 'googer-upload-content-draft-$_mode-v1';

  Future<void> _loadDraft() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_draftKey);
    if (raw == null || !mounted) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final draft = Map<String, dynamic>.from(decoded);
      final tierRows = draft['subscriptionTiers'];
      final tiers = <_SubscriptionTier>[];
      final draftMedia = _decodeDraftFiles(draft['media']);
      final draftThumbnail = _decodeDraftFile(draft['thumbnail']);
      final draftPrimaryImage = draftMedia.isEmpty
          ? null
          : image_lib.decodeImage(draftMedia.first.bytes);
      if (tierRows is List) {
        for (var i = 0; i < tierRows.length && tiers.length < 3; i++) {
          final rawTier = tierRows[i];
          if (rawTier is! Map) continue;
          final tier = Map<String, dynamic>.from(rawTier);
          final price = double.tryParse('${tier['price'] ?? 0}') ?? 0;
          final minutes = int.tryParse('${tier['minutes'] ?? 0}') ?? 0;
          if (price <= 0 || minutes <= 0) continue;
          tiers.add(
            _SubscriptionTier(
              label: '${tier['label'] ?? 'Package ${i + 1}'}',
              price: price,
              minutes: minutes,
              affiliateCommission:
                  double.tryParse('${tier['affiliateCommission'] ?? 0}') ?? 0,
            ),
          );
        }
      }
      if (!mounted) return;
      setState(() {
        _activeLink = '${draft['activeLink'] ?? ''}';
        _link.text = '${draft['link'] ?? _activeLink}';
        _linkPreviewTitle = _activeLink.isEmpty
            ? ''
            : _defaultLinkTitle(_activeLink);
        _linkPreviewImage = _activeLink.isEmpty
            ? ''
            : _linkPreviewThumbnail(_activeLink);
        _title.text = '${draft['title'] ?? ''}'.characters.take(50).toString();
        _topic = '${draft['topic'] ?? ''}';
        final rawTags = draft['tags'];
        _tags = rawTags is List
            ? mergeUploadContentTags(
                const [],
                rawTags.map((tag) => '$tag').join(' '),
              )
            : const [];
        _hashtags.text = _tags.map((tag) => '#$tag').join(' ');
        final visibility = '${draft['visibility'] ?? 'public'}';
        _visibility = _visibilityOptions.containsKey(visibility)
            ? visibility
            : 'public';
        _allowComments = draft['allowComments'] != false;
        _acceptedTerms = draft['acceptedTerms'] == true;
        _showLinkedContentOnHome = draft['showLinkedContentOnHome'] == true;
        _contentAccessMode = draft['contentAccessMode'] == 'blurred'
            ? 'blurred'
            : 'unblurred';
        _uploadPreviewMode = '${draft['uploadPreviewMode'] ?? 'none'}';
        // Drafts created before the empty-price behavior may contain the
        // automatically assigned admin minimum. Never restore that value for
        // a new upload; published-content edits are prefilled separately.
        _price = 0;
        _priceController.clear();
        _shareCommissionPct.text = '${draft['shareCommissionPct'] ?? ''}';
        _shareCommissionAmount.text = '${draft['shareCommissionAmount'] ?? ''}';
        _subscriptionTiers = tiers;
        _subscriptionAccessEnabled = tiers.isNotEmpty;
        _media = draftMedia;
        _selectedImageIndex = 0;
        _selectedImageWidth = draftPrimaryImage?.width ?? 0;
        _selectedImageHeight = draftPrimaryImage?.height ?? 0;
        _thumbnail = draftThumbnail;
      });
    } catch (_) {
      // A malformed local draft must never block the editor.
    }
  }

  Future<void> _saveDraft() async {
    final preferences = await SharedPreferences.getInstance();
    final payload = <String, dynamic>{
      'activeLink': _activeLink,
      'link': _link.text.trim(),
      'title': _title.text.trim(),
      'topic': _topic,
      'tags': _tags,
      'visibility': _visibility,
      'allowComments': _allowComments,
      'acceptedTerms': _acceptedTerms,
      'showLinkedContentOnHome': _showLinkedContentOnHome,
      'contentAccessMode': _contentAccessMode,
      'uploadPreviewMode': _uploadPreviewMode,
      'price': _price,
      'shareCommissionPct': _shareCommissionPct.text.trim(),
      'shareCommissionAmount': _shareCommissionAmount.text.trim(),
      'subscriptionTiers': _subscriptionPayload,
      'media': _encodeDraftFiles(_media),
      'thumbnail': _encodeDraftFile(_thumbnail),
    };
    try {
      await preferences.setString(_draftKey, jsonEncode(payload));
    } catch (_) {
      payload
        ..remove('media')
        ..remove('thumbnail');
      await preferences.setString(_draftKey, jsonEncode(payload));
    }
  }

  void _scheduleDraftSave() {
    if (_isEditing ||
        !_draftReady ||
        _submitting ||
        _publishedContentId.isNotEmpty) {
      return;
    }
    _draftSaveTimer?.cancel();
    _draftSaveTimer = Timer(const Duration(milliseconds: 250), _saveDraft);
  }

  Map<String, dynamic>? _encodeDraftFile(ApiUploadFile? file) {
    if (file == null || file.bytes.length > 1200000) return null;
    final type = file.contentType ?? '';
    if (!type.startsWith('image/')) return null;
    return {
      'filename': file.filename,
      'contentType': type,
      'bytes': base64Encode(file.bytes),
    };
  }

  List<Map<String, dynamic>> _encodeDraftFiles(List<ApiUploadFile> files) =>
      files
          .map(_encodeDraftFile)
          .whereType<Map<String, dynamic>>()
          .take(5)
          .toList(growable: false);

  ApiUploadFile? _decodeDraftFile(dynamic raw) {
    if (raw is! Map) return null;
    try {
      final map = Map<String, dynamic>.from(raw);
      final bytes = base64Decode('${map['bytes'] ?? ''}');
      if (bytes.isEmpty) return null;
      return ApiUploadFile(
        field: 'preview',
        filename: '${map['filename'] ?? 'draft-image.jpg'}',
        bytes: bytes,
        contentType: '${map['contentType'] ?? 'image/jpeg'}',
      );
    } catch (_) {
      return null;
    }
  }

  List<ApiUploadFile> _decodeDraftFiles(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .map(_decodeDraftFile)
        .whereType<ApiUploadFile>()
        .map((file) => file.withField('images'))
        .take(5)
        .toList(growable: false);
  }

  Future<void> _clearDraft() async {
    _draftSaveTimer?.cancel();
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_draftKey);
  }

  @override
  void dispose() {
    _draftSaveTimer?.cancel();
    _releaseSelectedVideoPreview();
    _link.dispose();
    _priceController.dispose();
    _title.dispose();
    _hashtags.dispose();
    _tagDraft.dispose();
    _tagFocus.removeListener(_commitTagOnBlur);
    _tagFocus.dispose();
    _topicOverlay?.remove();
    _topicScrollController.dispose();
    _shareCommissionPct.dispose();
    _shareCommissionAmount.dispose();
    super.dispose();
  }

  Future<void> _loadSettings() async {
    final results = await Future.wait([
      Api.uploadControlSettings(),
      Api.myPlan(),
      Api.mySubscription(),
      Api.publicPlans(),
    ]);
    final settings = results[0] as Map<String, dynamic>?;
    final myPlan = results[1] as Map<String, dynamic>?;
    final subscription = results[2] as Map<String, dynamic>?;
    final publicPlans = results[3] as List<Map<String, dynamic>>;
    final plan = resolveUploadContentPlan(myPlan, subscription, publicPlans);
    if (!mounted) return;

    double num$(dynamic v, double fallback) =>
        double.tryParse('${v ?? ''}') ?? fallback;
    int int$(dynamic v, int fallback) =>
        int.tryParse('${v ?? ''}') ?? num$(v, fallback.toDouble()).round();
    // A paid plan raises the video ceiling; the label has to reflect the
    // viewer's own plan, not the free-tier default.
    final subscribed =
        subscription != null &&
        '${subscription['status'] ?? 'active'}'.toLowerCase() == 'active' &&
        '${subscription['plan_slug'] ?? plan?['slug'] ?? ''}'.toLowerCase() !=
            'basic';
    final planVideoLimitMinutes = uploadContentVideoLimitMinutes(plan);
    final planExtra = plan?['extra'] is Map
        ? Map<String, dynamic>.from(plan!['extra'] as Map)
        : const <String, dynamic>{};
    final expiryValue = math.max(
      1,
      int$('${planExtra['content_expiry_value'] ?? 1}', 1),
    );
    final expiryUnit = '${planExtra['content_expiry_unit'] ?? 'days'}'
        .toLowerCase()
        .replaceFirst(RegExp(r's$'), '');

    setState(() {
      if (settings != null) {
        _minUploadPrice = num$(settings['min_upload_price'], 1);
        _maxUploadPrice = num$(settings['max_upload_price'], 100);
        _flashPrice = num$(settings['flash_content_price'], 0);
        _flashPreviewSeconds = int$(settings['flash_preview_seconds'], 5);
        final rawCommissionTiers = settings['subscription_commission_tiers'];
        _subscriptionCommissionTiers = rawCommissionTiers is List
            ? rawCommissionTiers
                  .whereType<Map>()
                  .map((raw) {
                    final tier = Map<String, dynamic>.from(raw);
                    return _CommissionTier(
                      min: num$(tier['min'], 0),
                      max: num$(tier['max'], 0),
                      commission: num$(tier['commission'], 0).clamp(0, 100),
                    );
                  })
                  .where((tier) => tier.max >= tier.min)
                  .toList(growable: false)
            : const [];
        final fallbackSeconds = subscribed
            ? int$(settings['subscribed_user_video_limit_seconds'], 180)
            : int$(settings['normal_user_video_limit_seconds'], 60);
        _videoLimitSeconds = planVideoLimitMinutes > 0
            ? (planVideoLimitMinutes * 60).round()
            : fallbackSeconds;
        _contentAccessMode =
            '${settings['default_content_access_mode'] ?? 'unblurred'}';
      }
      if (_maxUploadPrice < _minUploadPrice) _maxUploadPrice = _minUploadPrice;
      if (!_isEditing) {
        // Keep the admin range as validation guidance, but let creators enter
        // the price themselves instead of pre-filling the minimum value.
        _price = double.tryParse(_priceController.text.trim()) ?? 0;
      }
      _publicPlans = publicPlans;
      _userHasPaidSubscription = subscribed;
      _contentExpiryLabel =
          '$expiryValue $expiryUnit${expiryValue == 1 ? '' : 's'}';
      _settingsLoaded = true;
    });
  }

  void _releaseSelectedVideoPreview() {
    if (_selectedVideoPreviewUrl.isNotEmpty) {
      releaseVideoUrl(_selectedVideoPreviewUrl);
    }
    _selectedVideoPreviewUrl = '';
    _selectedVideoThumbnailBytes = null;
  }

  void _clearSelectedMediaState() {
    _releaseSelectedVideoPreview();
    _media = const [];
    _selectedVideoDurationSeconds = null;
    _selectedVideoTrimStartSeconds = 0;
    _selectedVideoTrimEndSeconds = 0;
    _selectedVideoOriginalDurationSeconds = 0;
    _selectedVideoWidth = 0;
    _selectedVideoHeight = 0;
    _selectedImageIndex = 0;
    _selectedImageWidth = 0;
    _selectedImageHeight = 0;
    _uploadPreviewMode = 'none';
  }

  String get _videoLimitLabel {
    final minutes = _videoLimitSeconds ~/ 60;
    final seconds = _videoLimitSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  bool get _hasVideo =>
      (_media.isNotEmpty &&
          (_media.first.contentType ?? '').startsWith('video/')) ||
      (useExistingUploadContentMedia(
            isEditing: _isEditing,
            removed: _removeExistingMedia,
            hasNewMedia: _media.isNotEmpty,
          ) &&
          _editingContent?.mediaType == 'video');

  bool get _hasVideoLikeContent =>
      _hasVideo ||
      (_activeLink.isNotEmpty &&
          (_isVideoLikeUrl(_activeLink) || _isSocialEmbed(_activeLink)));

  bool get _hasImageLikeContent =>
      (_media.isNotEmpty && !_hasVideo) ||
      (_activeLink.isNotEmpty && _isImageLikeUrl(_activeLink)) ||
      (useExistingUploadContentMedia(
            isEditing: _isEditing,
            removed: _removeExistingMedia,
            hasNewMedia: _media.isNotEmpty,
          ) &&
          _editingContent?.mediaType == 'image');

  bool get _canBlurVaultContent =>
      !_isFlash && (_hasVideoLikeContent || _hasImageLikeContent);

  bool get _showBlurredContentPreview =>
      _contentAccessMode == 'blurred' && _canBlurVaultContent;

  // ---- Build ----

  @override
  Widget build(BuildContext context) {
    _scheduleDraftSave();
    if (_publishedContentId.isNotEmpty) return _publishedReviewScreen();
    return Scaffold(
      backgroundColor: _studioBlack,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(9, 10, 9, 40),
          children: [
            _header(),
            const SizedBox(height: 18),
            _applyLinkSection(),
            const SizedBox(height: 8),
            const Divider(height: 26, color: AppColors.borderWhite10),
            _mediaSection(),
            const SizedBox(height: 16),
            _thumbnailSection(),
            if (!_isFlash && _canBlurVaultContent) ...[
              const SizedBox(height: 16),
              _contentAccessSection(),
            ],
            const SizedBox(height: 16),
            _priceSection(),
            const SizedBox(height: 18),
            _detailsSection(),
            if (!_isFlash) ...[
              const SizedBox(height: 16),
              _shareCommissionSection(),
            ],
            const SizedBox(height: 16),
            _termsRow(),
            if (_submitting) ...[
              const SizedBox(height: 12),
              _publishingProgressPanel(),
            ],
            const SizedBox(height: 16),
            _actionsRow(),
            const SizedBox(height: 20),
            _previewSection(),
          ],
        ),
      ),
    );
  }

  Widget _publishedReviewScreen() {
    void viewContent() {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const ProfileScreen()),
      );
    }

    final reviewTitle = _publishedPendingApproval
        ? 'Your content is under review'
        : 'Your content was updated';
    final reviewMessage = _publishedPendingApproval
        ? 'This usually takes up to 24 hours. You cannot edit this content while it is being reviewed.'
        : (_publishedMessage.isNotEmpty
              ? _publishedMessage
              : 'Your approved content is live with the latest changes.');
    final reviewCard = Container(
      width: double.infinity,
      constraints: const BoxConstraints(maxWidth: 410),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF101113),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 50,
            height: 50,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0xFF34D399).withOpacity(0.1),
              borderRadius: BorderRadius.circular(15),
            ),
            child: const Icon(
              Ionicons.time_outline,
              size: 23,
              color: Color(0xFF6EE7B7),
            ),
          ),
          const SizedBox(height: 16),
          const Text(
            'CONTENT REVIEW',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 2,
              fontWeight: FontWeight.w700,
              color: AppColors.textGray600,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            reviewTitle,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            reviewMessage,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11,
              height: 1.5,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 18),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.24),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              children: [
                const Text(
                  'CONTENT ID',
                  style: TextStyle(
                    fontSize: 8,
                    letterSpacing: 1.6,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textGray600,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  _publishedContentId,
                  key: const Key('upload-content-published-id'),
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    return Scaffold(
      backgroundColor: _studioBlack,
      body: SafeArea(
        child: Stack(
          children: [
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(18),
                child: Column(
                  children: [
                    reviewCard,
                    const SizedBox(height: 14),
                    SizedBox(
                      width: 180,
                      child: _whitePill('VIEW CONTENT', viewContent),
                    ),
                  ],
                ),
              ),
            ),
            if (_showPublishedPopup)
              Positioned.fill(
                child: Container(
                  color: Colors.black.withOpacity(0.82),
                  padding: const EdgeInsets.all(18),
                  alignment: Alignment.center,
                  child: Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(maxWidth: 360),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: const Color(0xFF07140F),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: const Color(0xFF34D399).withOpacity(0.3),
                      ),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Ionicons.checkmark_circle_outline,
                          size: 42,
                          color: Color(0xFF6EE7B7),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          _publishedPendingApproval ? 'PUBLISHED' : 'UPDATED',
                          style: TextStyle(
                            fontSize: 9,
                            letterSpacing: 2,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF6EE7B7),
                          ),
                        ),
                        const SizedBox(height: 7),
                        Text(
                          reviewTitle,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _publishedPendingApproval
                              ? 'This usually takes up to 24 hours.'
                              : 'Your changes are live now.',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.textGray400,
                          ),
                        ),
                        const SizedBox(height: 15),
                        GestureDetector(
                          onTap: () {
                            Clipboard.setData(
                              ClipboardData(text: _publishedContentId),
                            );
                            AppNotifications.success('Content ID copied');
                          },
                          child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.05),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: AppColors.borderWhite10,
                              ),
                            ),
                            child: Column(
                              children: [
                                const Text(
                                  'CONTENT ID',
                                  style: TextStyle(
                                    fontSize: 8,
                                    letterSpacing: 1.5,
                                    color: AppColors.textGray600,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _publishedContentId,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                const Text(
                                  'TAP TO COPY',
                                  style: TextStyle(
                                    fontSize: 8,
                                    letterSpacing: 1.2,
                                    color: AppColors.textGray600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Expanded(
                              child: _dialogAction(
                                'CANCEL',
                                Colors.white.withValues(alpha: 0.06),
                                () async {
                                  setState(() => _showPublishedPopup = false);
                                  if (!mounted) return;
                                  Navigator.pushReplacement(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => const ProfileScreen(),
                                    ),
                                  );
                                },
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: _whitePill('VIEW CONTENT', viewContent),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _header() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _showCancelDialog,
          behavior: HitTestBehavior.opaque,
          child: Container(
            width: 36,
            height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withOpacity(0.06),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: const Icon(
              Ionicons.chevron_back_outline,
              size: 18,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          _isFlash ? 'FLASH CONTENT STUDIO' : 'VAULT CONTENT STUDIO',
          style: const TextStyle(
            fontSize: 9,
            letterSpacing: 2.8,
            fontWeight: FontWeight.w600,
            color: AppColors.textGray500,
          ),
        ),
        const SizedBox(height: 9),
        Row(
          children: [
            Flexible(
              child: GestureDetector(
                onTap: () => _switchMode('flash'),
                child: Text(
                  'Flash Content',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: _isFlash ? Colors.white : AppColors.textGray600,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            GestureDetector(
              onTap: () => _switchMode(_isFlash ? 'vault' : 'flash'),
              child: Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.borderWhite10),
                  color: Colors.white.withOpacity(0.04),
                ),
                child: const Icon(
                  Ionicons.swap_horizontal_outline,
                  size: 16,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Flexible(
              child: GestureDetector(
                onTap: () => _switchMode('vault'),
                child: Text(
                  'Vault Content',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: _isFlash ? AppColors.textGray600 : Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  /// Swapping modes clears media, because what counts as valid media differs
  /// (Flash is video-only) and silently carrying an image into Flash would fail
  /// at publish instead of at the point of choice. The applied link remains
  /// shared between modes, matching the web studio's Flash/Vault switch.
  void _switchMode(String mode) {
    if (mode == _mode) return;
    _closeTopicOverlay();
    setState(() {
      _mode = mode;
      _clearSelectedMediaState();
      _thumbnail = null;
      if (_isFlash) {
        _contentAccessMode = 'unblurred';
        _uploadPreviewMode = 'auto_preview';
      } else {
        _contentAccessMode = 'unblurred';
        _uploadPreviewMode = 'none';
      }
    });
  }

  // ---- Apply link ----

  Widget _applyLinkSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _headingBlock(
                'Apply Link',
                _activeLink.isNotEmpty && _linkPreviewTitle.isNotEmpty
                    ? _linkPreviewTitle
                    : 'Paste a social media, photo, or video link',
              ),
            ),
            if (_activeLink.isNotEmpty)
              _miniAction('REMOVE', _removeLink)
            else
              const Icon(
                Ionicons.link_outline,
                size: 18,
                color: AppColors.textGray400,
              ),
          ],
        ),
        const SizedBox(height: 12),
        _input(_link, 'https://your-content-link.com'),
        const SizedBox(height: 10),
        _whitePill('APPLY', _applyLink),
      ],
    );
  }

  Future<void> _applyLink() async {
    final raw = _link.text.trim();
    if (raw.isEmpty) {
      AppNotifications.error('Enter a link before applying');
      return;
    }
    final url = _normalizeUrl(raw);
    setState(() {
      _activeLink = url;
      _linkPreviewTitle = _defaultLinkTitle(url);
      _linkPreviewImage = _linkPreviewThumbnail(url);
    });
    AppNotifications.success('Link applied');

    try {
      final youtubeId = _youTubeVideoId(url);
      final host = _tryUri(url)?.host.toLowerCase() ?? '';
      final endpoint = youtubeId.isNotEmpty
          ? Uri.parse(
              'https://www.youtube.com/oembed?url=${Uri.encodeComponent(url)}&format=json',
            )
          : host.contains('tiktok.com')
          ? Uri.parse(
              'https://www.tiktok.com/oembed?url=${Uri.encodeComponent(url)}',
            )
          : Uri.parse(
              'https://noembed.com/embed?url=${Uri.encodeComponent(url)}',
            );
      final response = await http
          .get(endpoint)
          .timeout(const Duration(seconds: 8));
      if (response.statusCode < 200 || response.statusCode >= 300) return;
      final decoded = jsonDecode(response.body);
      if (decoded is! Map || !mounted || _activeLink != url) return;
      final title = '${decoded['title'] ?? ''}'.trim();
      final thumbnail = '${decoded['thumbnail_url'] ?? ''}'.trim();
      if (title.isEmpty && thumbnail.isEmpty) return;
      setState(() {
        if (title.isNotEmpty) _linkPreviewTitle = title;
        if (thumbnail.isNotEmpty) _linkPreviewImage = thumbnail;
      });
    } catch (_) {
      // Keep the deterministic platform title and thumbnail fallback.
    }
  }

  // ---- Media ----

  Widget _mediaSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _headingBlock(
          _isFlash ? 'Flash Content Media' : 'Vault Content Media',
          'Upload image or video',
        ),
        const SizedBox(height: 8),
        Text(
          'Your plan video limit: $_videoLimitLabel. '
          'Crop longer videos or upgrade.',
          style: const TextStyle(
            fontSize: 10.5,
            height: 1.5,
            fontWeight: FontWeight.w500,
            color: AppColors.textGray600,
          ),
        ),
        const SizedBox(height: 12),
        _tileButton('Upload Media', Ionicons.image_outline, _pickMedia),
        const SizedBox(height: 12),
        _mediaPreviewPanel(),
      ],
    );
  }

  Widget _mediaPreviewPanel() {
    if (_media.isEmpty && _existingMedia.isEmpty) {
      return _placeholderPanel(
        _isFlash ? 'SELECT VIDEO ONLY' : 'SELECT VIDEO OR UP TO 5 IMAGES',
        height: 118,
      );
    }
    if (_media.isEmpty && _existingMedia.isNotEmpty) {
      final item = _editingContent!;
      final isVideo = item.mediaType == 'video';
      final poster = item.thumbnail.trim();
      final videoSource = item.mediaUrl.trim();
      return Row(
        children: [
          GestureDetector(
            onTap: isVideo && item.externalLink.isEmpty
                ? _editExistingVideo
                : null,
            child: Container(
              width: 96,
              height: 58,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (isVideo && videoSource.isNotEmpty)
                    webVideo(
                      videoSource,
                      poster: poster,
                      interactive: false,
                      autoPlay: false,
                      instanceKey: 'upload-edit-${item.contentId}',
                      trimStartSeconds: item.videoTrimStartSeconds,
                    )
                  else if (poster.isNotEmpty || item.mediaUrl.isNotEmpty)
                    Image.network(
                      poster.isNotEmpty ? poster : item.mediaUrl,
                      fit: BoxFit.cover,
                      webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                      errorBuilder: (_, _, _) => const ColoredBox(
                        color: Colors.black,
                        child: Icon(
                          Ionicons.image_outline,
                          color: AppColors.textGray500,
                        ),
                      ),
                    )
                  else
                    const Icon(
                      Ionicons.videocam_outline,
                      color: AppColors.textGray500,
                    ),
                  if (isVideo && item.externalLink.isEmpty) ...[
                    ColoredBox(color: Colors.black.withValues(alpha: 0.14)),
                    const Center(
                      child: Icon(
                        Ionicons.create_outline,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isVideo ? 'Uploaded video' : 'Uploaded media',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  isVideo ? 'Creative ready' : 'Media ready',
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.textGray500,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => setState(() {
              _clearSelectedMediaState();
              _removeExistingMedia = true;
            }),
            child: Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accent.withValues(alpha: 0.12),
              ),
              child: const Icon(
                Ionicons.close_outline,
                size: 18,
                color: Colors.white,
              ),
            ),
          ),
        ],
      );
    }
    if (_hasVideo) {
      return Row(
        children: [
          GestureDetector(
            onTap: _editSelectedVideo,
            child: Container(
              width: 96,
              height: 58,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (_selectedVideoThumbnailBytes != null)
                    Image.memory(
                      _selectedVideoThumbnailBytes!,
                      fit: BoxFit.cover,
                    )
                  else
                    const Icon(
                      Ionicons.videocam_outline,
                      size: 22,
                      color: AppColors.textGray500,
                    ),
                  Container(color: Colors.black.withValues(alpha: 0.16)),
                  const Center(
                    child: Icon(
                      Ionicons.create_outline,
                      size: 16,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _media.first.filename,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                if (_selectedVideoWidth > 0 && _selectedVideoHeight > 0) ...[
                  const SizedBox(height: 4),
                  Text(
                    '$_selectedVideoWidth x $_selectedVideoHeight  |  '
                    '${_formatSeconds(_selectedVideoDurationSeconds ?? 0)}',
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
                const SizedBox(height: 5),
                GestureDetector(
                  onTap: _editSelectedVideo,
                  child: const Text(
                    'EDIT CLIP',
                    style: TextStyle(
                      fontSize: 8.5,
                      letterSpacing: 1.1,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textGray300,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => setState(_clearSelectedMediaState),
            child: Container(
              width: 34,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: _accent.withValues(alpha: 0.12),
              ),
              child: const Icon(
                Ionicons.close_outline,
                size: 18,
                color: Colors.white,
              ),
            ),
          ),
        ],
      );
    }
    final selectedIndex = math.min(_selectedImageIndex, _media.length - 1);
    final selectedImage = _media[selectedIndex];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              key: const Key('upload-selected-image-preview'),
              width: 96,
              height: 58,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Image.memory(selectedImage.bytes, fit: BoxFit.cover),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _media.length == 1
                        ? selectedImage.filename
                        : '${_media.length} images selected',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _selectedImageWidth > 0 && _selectedImageHeight > 0
                        ? '$_selectedImageWidth x $_selectedImageHeight'
                        : 'Creative ready',
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => setState(_clearSelectedMediaState),
              child: Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _accent.withValues(alpha: 0.12),
                ),
                child: const Icon(
                  Ionicons.close_outline,
                  size: 18,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
        if (_media.length > 1) const SizedBox(height: 12),
        if (_media.length > 1)
          SizedBox(
            height: 62,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _media.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) => GestureDetector(
                key: ValueKey('upload-gallery-image-$i'),
                onTap: () => _selectUploadedImage(i),
                child: Container(
                  width: 62,
                  height: 62,
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selectedIndex == i
                          ? Colors.white.withValues(alpha: 0.80)
                          : AppColors.borderWhite10,
                      width: selectedIndex == i ? 2 : 1,
                    ),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.memory(_media[i].bytes, fit: BoxFit.cover),
                        if (i == 0)
                          Positioned(
                            left: 3,
                            right: 3,
                            bottom: 3,
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.65),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                'MAIN',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 7.5,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.7,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        const SizedBox(height: 8),
        _clearMediaButton(),
      ],
    );
  }

  void _selectUploadedImage(int index) {
    if (index < 0 || index >= _media.length) return;
    final decoded = image_lib.decodeImage(_media[index].bytes);
    setState(() {
      _selectedImageIndex = index;
      _selectedImageWidth = decoded?.width ?? 0;
      _selectedImageHeight = decoded?.height ?? 0;
    });
  }

  Widget _clearMediaButton() {
    return GestureDetector(
      onTap: () => setState(_clearSelectedMediaState),
      child: const Text(
        'REMOVE MEDIA',
        style: TextStyle(
          fontSize: 9,
          letterSpacing: 1.2,
          fontWeight: FontWeight.w600,
          color: AppColors.likeRed,
        ),
      ),
    );
  }

  Future<void> _pickMedia() async {
    // Flash is video-only; Vault takes one video or up to five images.
    final files = await pickUploadFiles(
      field: 'images',
      allowMultiple: !_isFlash,
      type: _isFlash ? FileType.video : FileType.media,
    );
    if (!mounted || files.isEmpty) return;

    final selectionProblem = uploadContentMediaSelectionProblem(
      files.map((file) => file.contentType).toList(growable: false),
      isFlash: _isFlash,
    );
    if (selectionProblem != null) {
      await _showRequiredFieldDialog(selectionProblem);
      return;
    }
    _removeExistingMedia = false;
    if (_activeLink.isNotEmpty) _removeLink();

    if (_isFlash) {
      final first = files.first;
      final accepted = await _acceptPlanVideo(first);
      if (!mounted) return;
      if (accepted == null) {
        setState(_clearSelectedMediaState);
        return;
      }
      setState(() {
        _media = [accepted];
        _uploadPreviewMode = uploadPreviewModeAfterMediaSelection(
          isFlash: true,
          hasVideo: true,
        );
      });
      return;
    }

    final videos = files
        .where((f) => (f.contentType ?? '').startsWith('video/'))
        .toList();
    if (videos.isNotEmpty) {
      final accepted = await _acceptPlanVideo(videos.first);
      if (!mounted) return;
      if (accepted == null) {
        setState(_clearSelectedMediaState);
        return;
      }
      setState(() {
        _media = [accepted];
        _uploadPreviewMode = uploadPreviewModeAfterMediaSelection(
          isFlash: false,
          hasVideo: true,
        );
      });
      return;
    }
    final decoded = image_lib.decodeImage(files.first.bytes);
    setState(() {
      _releaseSelectedVideoPreview();
      _selectedVideoDurationSeconds = null;
      _selectedVideoTrimStartSeconds = 0;
      _selectedVideoTrimEndSeconds = 0;
      _selectedVideoOriginalDurationSeconds = 0;
      _selectedVideoTrimStartSeconds = 0;
      _selectedVideoTrimEndSeconds = 0;
      _selectedVideoOriginalDurationSeconds = 0;
      _selectedVideoWidth = 0;
      _selectedVideoHeight = 0;
      _media = files;
      _selectedImageIndex = 0;
      _selectedImageWidth = decoded?.width ?? 0;
      _selectedImageHeight = decoded?.height ?? 0;
      _uploadPreviewMode = 'none';
    });
  }

  Future<ApiUploadFile?> _acceptPlanVideo(ApiUploadFile file) async {
    final info = await inspectVideo(file.bytes, file.filename);
    if (info == null || info.duration <= 0) {
      _releaseSelectedVideoPreview();
      _selectedVideoDurationSeconds = null;
      _selectedVideoWidth = 0;
      _selectedVideoHeight = 0;
      return file;
    }
    if (info.duration > _videoLimitSeconds) {
      final selection = await _openVideoTrimSheet(file, info);
      if (selection == null || !mounted) {
        releaseVideoUrl(info.sourceUrl);
        return null;
      }
      final thumbnail = await captureVideoThumbnail(info.sourceUrl);
      _setSelectedVideoInfo(
        info,
        thumbnail,
        trimStart: selection.start,
        trimEnd: selection.end,
        originalDuration: selection.originalDuration,
      );
      return selection.file;
    }
    final thumbnail = await captureVideoThumbnail(info.sourceUrl);
    _setSelectedVideoInfo(
      info,
      thumbnail,
      trimEnd: info.duration,
      originalDuration: info.duration,
    );
    return file;
  }

  void _setSelectedVideoInfo(
    PendingVideoTrim? info,
    Uint8List? thumbnail, {
    double trimStart = 0,
    double? trimEnd,
    double? originalDuration,
  }) {
    _releaseSelectedVideoPreview();
    final resolvedEnd = trimEnd ?? info?.duration ?? 0;
    _selectedVideoDurationSeconds = math.max(0, resolvedEnd - trimStart);
    _selectedVideoTrimStartSeconds = trimStart;
    _selectedVideoTrimEndSeconds = resolvedEnd;
    _selectedVideoOriginalDurationSeconds =
        originalDuration ?? info?.duration ?? 0;
    _selectedVideoWidth = info?.width ?? 0;
    _selectedVideoHeight = info?.height ?? 0;
    _selectedVideoPreviewUrl = info?.sourceUrl ?? '';
    _selectedVideoThumbnailBytes = thumbnail;
  }

  Future<void> _editSelectedVideo() async {
    if (!_hasVideo) return;
    final file = _media.first;
    final info = await inspectVideo(file.bytes, file.filename);
    if (!mounted || info == null || info.duration <= 0) return;
    final selection = await _openVideoTrimSheet(file, info, forceOpen: true);
    if (!mounted || selection == null) {
      releaseVideoUrl(info.sourceUrl);
      return;
    }
    final thumbnail = await captureVideoThumbnail(info.sourceUrl);
    if (!mounted) return;
    setState(() {
      _media = [selection.file];
      _setSelectedVideoInfo(
        info,
        thumbnail,
        trimStart: selection.start,
        trimEnd: selection.end,
        originalDuration: selection.originalDuration,
      );
      _uploadPreviewMode = 'auto_preview';
    });
  }

  Future<void> _editExistingVideo() async {
    final item = _editingContent;
    final source = item?.mediaUrl.trim() ?? '';
    if (item == null || source.isEmpty || item.externalLink.isNotEmpty) return;
    try {
      final response = await http
          .get(Uri.parse(source))
          .timeout(const Duration(seconds: 60));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception('Video could not be loaded.');
      }
      final uri = Uri.tryParse(source);
      final filename = uri?.pathSegments.isNotEmpty == true
          ? uri!.pathSegments.last
          : 'uploaded-video.mp4';
      final file = ApiUploadFile(
        field: 'images',
        filename: filename,
        bytes: response.bodyBytes,
        contentType: response.headers['content-type'] ?? 'video/mp4',
      );
      final info = await inspectVideo(file.bytes, file.filename);
      if (!mounted || info == null || info.duration <= 0) return;
      final selection = await _openVideoTrimSheet(file, info, forceOpen: true);
      if (!mounted || selection == null) {
        releaseVideoUrl(info.sourceUrl);
        return;
      }
      final thumbnail = await captureVideoThumbnail(info.sourceUrl);
      if (!mounted) return;
      setState(() {
        _removeExistingMedia = false;
        _media = [selection.file];
        _setSelectedVideoInfo(
          info,
          thumbnail,
          trimStart: selection.start,
          trimEnd: selection.end,
          originalDuration: selection.originalDuration,
        );
        _uploadPreviewMode = 'auto_preview';
      });
    } catch (error) {
      if (!mounted) return;
      AppNotifications.error('Unable to edit video', '$error');
    }
  }

  Future<_VideoTrimResult?> _openVideoTrimSheet(
    ApiUploadFile file,
    PendingVideoTrim info, {
    bool forceOpen = false,
  }) async {
    if (!forceOpen && info.duration <= _videoLimitSeconds) {
      return _VideoTrimResult(
        file: file,
        start: 0,
        end: info.duration,
        originalDuration: info.duration,
      );
    }
    var start = forceOpen ? _selectedVideoTrimStartSeconds : 0.0;
    var end = forceOpen && _selectedVideoTrimEndSeconds > start
        ? _selectedVideoTrimEndSeconds
        : _videoLimitSeconds.toDouble().clamp(0.0, info.duration).toDouble();
    var trimming = false;
    var trimError = '';
    final recommended = recommendedVideoPlanForDuration(
      _publicPlans,
      currentLimitMinutes: _videoLimitSeconds / 60,
      videoDurationSeconds: info.duration,
    );

    return showModalBottomSheet<_VideoTrimResult?>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) {
          final selectedSeconds = end - start;
          return SafeArea(
            top: false,
            child: Container(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.92,
              ),
              decoration: const BoxDecoration(
                color: Color(0xFF0C0D10),
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                border: Border(top: BorderSide(color: AppColors.borderWhite10)),
              ),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'VIDEO LIMIT',
                                style: TextStyle(
                                  fontSize: 8,
                                  letterSpacing: 1.5,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFFFDA4AF),
                                ),
                              ),
                              SizedBox(height: 5),
                              Text(
                                'Trim or subscribe',
                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: trimming
                              ? null
                              : () => Navigator.pop(sheetContext),
                          child: Container(
                            width: 32,
                            height: 32,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withValues(alpha: 0.06),
                            ),
                            child: const Icon(
                              Ionicons.close_outline,
                              size: 18,
                              color: Colors.white70,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Your plan allows $_videoLimitLabel videos. Drag the '
                      'handles to trim or subscribe for a higher limit.',
                      style: const TextStyle(
                        fontSize: 10.5,
                        height: 1.45,
                        color: AppColors.textGray400,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      height: 178,
                      width: double.infinity,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: Colors.black,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: webVideo(info.sourceUrl),
                    ),
                    if (recommended != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 11,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(
                            0xFFFACC15,
                          ).withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: const Color(
                              0xFFFACC15,
                            ).withValues(alpha: 0.35),
                          ),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                'Recommended: '
                                '${recommended['name'] ?? recommended['title'] ?? 'Plan'} '
                                '(${_formatSeconds((recommended['_video_limit_minutes'] as num) * 60)} video limit).',
                                style: const TextStyle(
                                  fontSize: 9.5,
                                  height: 1.35,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.textGray300,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            GestureDetector(
                              onTap: trimming
                                  ? null
                                  : () {
                                      Navigator.pop(sheetContext);
                                      Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              const SubscriptionScreen(),
                                        ),
                                      );
                                    },
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFACC15),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: const Text(
                                  'BUY PLAN',
                                  style: TextStyle(
                                    fontSize: 8,
                                    letterSpacing: 1,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.black,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: _panelDecoration(),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  'Selected clip',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 9,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  color: _accent.withValues(alpha: 0.14),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  _formatSeconds(selectedSeconds),
                                  style: const TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFFFFC2CC),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: _trimTimeBox(
                                  'START',
                                  _formatSeconds(start),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _trimTimeBox(
                                  'END',
                                  _formatSeconds(end),
                                  right: true,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Container(
                            height: 48,
                            clipBehavior: Clip.none,
                            decoration: BoxDecoration(
                              color: const Color(0xFF020306),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: AppColors.borderWhite10,
                              ),
                            ),
                            child: Stack(
                              clipBehavior: Clip.none,
                              children: [
                                Positioned.fill(
                                  top: -9,
                                  child: SliderTheme(
                                    data: SliderTheme.of(sheetContext).copyWith(
                                      activeTrackColor: const Color(0xFFFF3F73),
                                      inactiveTrackColor: const Color(
                                        0xFF24252B,
                                      ),
                                      disabledActiveTrackColor: const Color(
                                        0xFFFF3F73,
                                      ).withValues(alpha: 0.45),
                                      disabledInactiveTrackColor: const Color(
                                        0xFF24252B,
                                      ),
                                      rangeThumbShape:
                                          const _VerticalTrimThumbShape(),
                                      overlayShape:
                                          SliderComponentShape.noOverlay,
                                      trackHeight: 2,
                                    ),
                                    child: RangeSlider(
                                      min: 0,
                                      max: info.duration,
                                      values: RangeValues(start, end),
                                      onChanged: trimming
                                          ? null
                                          : (values) => setSheet(() {
                                              final cap = _videoLimitSeconds
                                                  .toDouble();
                                              var nextStart = values.start;
                                              var nextEnd = values.end;
                                              if (nextEnd - nextStart > cap) {
                                                if ((values.start - start)
                                                        .abs() >
                                                    (values.end - end).abs()) {
                                                  nextStart = nextEnd - cap;
                                                } else {
                                                  nextEnd = nextStart + cap;
                                                }
                                              }
                                              start = nextStart.clamp(
                                                0,
                                                info.duration,
                                              );
                                              end = nextEnd.clamp(
                                                0,
                                                info.duration,
                                              );
                                              trimError = '';
                                            }),
                                    ),
                                  ),
                                ),
                                const Positioned(
                                  left: 12,
                                  bottom: 5,
                                  child: Text(
                                    '0:00',
                                    style: TextStyle(
                                      fontSize: 8,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.textGray600,
                                    ),
                                  ),
                                ),
                                Positioned(
                                  right: 12,
                                  bottom: 5,
                                  child: Text(
                                    _formatSeconds(info.duration),
                                    style: const TextStyle(
                                      fontSize: 8,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.textGray600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (trimError.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        trimError,
                        style: const TextStyle(
                          fontSize: 10,
                          color: Color(0xFFFFA1AB),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: _trimActionButton(
                            'CANCEL',
                            trimming ? null : () => Navigator.pop(sheetContext),
                            secondary: true,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _trimActionButton(
                            trimming ? 'SAVING...' : 'SAVE CLIP',
                            trimming
                                ? null
                                : () async {
                                    setSheet(() {
                                      trimming = true;
                                      trimError = '';
                                    });
                                    if (!sheetContext.mounted) return;
                                    Navigator.pop(
                                      sheetContext,
                                      _VideoTrimResult(
                                        file: file,
                                        start: start,
                                        end: end,
                                        originalDuration: info.duration,
                                      ),
                                    );
                                  },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _trimTimeBox(String label, String value, {bool right = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: right
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 8,
              letterSpacing: 1,
              color: AppColors.textGray600,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  Widget _trimActionButton(
    String label,
    VoidCallback? onTap, {
    bool secondary = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: secondary
              ? Colors.white.withValues(alpha: 0.05)
              : onTap == null
              ? _accent.withValues(alpha: 0.45)
              : _accent,
          borderRadius: BorderRadius.circular(11),
          border: secondary ? Border.all(color: AppColors.borderWhite10) : null,
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 9,
            letterSpacing: 1.3,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  // ---- Thumbnail ----

  Widget _thumbnailSection() {
    final supportsAutoPreview = !_isFlash && _hasVideoLikeContent;
    final thumbnailDisabled =
        !_isFlash &&
        vaultPreviewChoiceDisabled(
          choice: 'thumbnail',
          selectedMode: _uploadPreviewMode,
          hasVideoLikeContent: _hasVideoLikeContent,
          hasRawVideo: _hasVideo,
          canBlur: _canBlurVaultContent,
          hasImageLikeContent: _hasImageLikeContent,
        );
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _panelDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _headingBlock(
            supportsAutoPreview ? 'Thumbnail / Preview' : 'Thumbnail',
            supportsAutoPreview
                ? 'Upload a custom thumbnail or create a three-second automatic video preview.'
                : 'Keep a custom thumbnail ready for images, image links, videos, or video links.',
            titleSize: 14,
          ),
          const SizedBox(height: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _previewModeButton(
                'THUMBNAIL',
                _uploadPreviewMode == 'thumbnail',
                () => setState(() {
                  if (!_isFlash && _uploadPreviewMode == 'thumbnail') {
                    _uploadPreviewMode = 'none';
                    return;
                  }
                  _uploadPreviewMode = 'thumbnail';
                  _contentAccessMode = 'unblurred';
                }),
                disabled: thumbnailDisabled,
              ),
              if (supportsAutoPreview) ...[
                const SizedBox(height: 8),
                _previewModeButton(
                  '3-SEC PREVIEW',
                  _uploadPreviewMode == 'auto_preview',
                  () => setState(() {
                    if (_uploadPreviewMode == 'auto_preview') {
                      _uploadPreviewMode = 'none';
                      return;
                    }
                    _uploadPreviewMode = 'auto_preview';
                    _contentAccessMode = 'unblurred';
                  }),
                  disabled: vaultPreviewChoiceDisabled(
                    choice: 'auto_preview',
                    selectedMode: _uploadPreviewMode,
                    hasVideoLikeContent: _hasVideoLikeContent,
                    hasRawVideo: _hasVideo,
                    canBlur: _canBlurVaultContent,
                    hasImageLikeContent: _hasImageLikeContent,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          if (!_isFlash &&
              _hasVideoLikeContent &&
              _uploadPreviewMode == 'auto_preview')
            _vaultAutoPreview()
          else if (!_isFlash && _uploadPreviewMode == 'blurred')
            _thumbnailLockedByBlur()
          else if (_thumbnail == null && _existingThumbnail.isEmpty)
            Column(
              children: [
                _thumbnailEmpty(disabled: thumbnailDisabled),
                if (_media.isEmpty &&
                    _existingMedia.isEmpty &&
                    _activeLink.isEmpty) ...[
                  const SizedBox(height: 10),
                  const Text(
                    'Thumbnail box always stays available here.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ],
            )
          else
            _thumbnailPreviewRow(),
        ],
      ),
    );
  }

  Widget _previewModeButton(
    String label,
    bool selected,
    VoidCallback onTap, {
    bool disabled = false,
  }) {
    return GestureDetector(
      key: Key(
        'upload-preview-mode-${label.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-')}',
      ),
      onTap: disabled ? null : onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 39,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 9.5,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w700,
            color: disabled
                ? AppColors.textGray700
                : selected
                ? _studioBlack
                : AppColors.textGray500,
          ),
        ),
      ),
    );
  }

  Widget _vaultAutoPreview() {
    final source =
        (_selectedVideoPreviewUrl.trim().isNotEmpty
                ? _selectedVideoPreviewUrl
                : _editingContent?.previewUrl ?? '')
            .trim();
    if (source.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
        decoration: _fieldDecoration(),
        child: const Text(
          'Click 3-sec Preview after selecting a raw video.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 10.5, color: AppColors.textGray600),
        ),
      );
    }
    final available = _selectedVideoDurationSeconds ?? 3;
    final seconds = math.min(3.0, math.max(0.1, available));
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.black,
          border: Border.all(color: const Color(0xFF75D9F1).withOpacity(0.25)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            AspectRatio(
              aspectRatio: 2.65,
              child: webVideo(
                source,
                interactive: false,
                autoPlay: true,
                instanceKey:
                    'vault-three-second-${_media.isEmpty ? 'video' : _media.first.filename}',
                trimStartSeconds: _selectedVideoTrimStartSeconds,
                previewDurationSeconds: seconds,
                loopPreview: true,
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'PUBLISHED PREVIEW',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                      color: Color(0xFF9BE9FA),
                    ),
                  ),
                  Text(
                    '3 SECONDS',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                      color: Color(0xFF9BE9FA),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _thumbnailEmpty({bool disabled = false}) {
    return GestureDetector(
      onTap: disabled ? null : _pickThumbnail,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 86,
        width: double.infinity,
        alignment: Alignment.center,
        decoration: _fieldDecoration(),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Ionicons.images_outline,
              size: 17,
              color: disabled ? AppColors.textGray700 : Colors.white,
            ),
            const SizedBox(width: 8),
            Text(
              'UPLOAD THUMBNAIL',
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.5,
                fontWeight: FontWeight.w600,
                color: disabled ? AppColors.textGray700 : Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _thumbnailLockedByBlur() {
    return Container(
      height: 86,
      width: double.infinity,
      alignment: Alignment.center,
      decoration: _fieldDecoration(),
      child: const Text(
        'Blurred is selected, so thumbnail is locked.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: AppColors.textGray500,
        ),
      ),
    );
  }

  Widget _thumbnailPreviewRow() {
    final selectedThumbnail = _thumbnail;
    final existingDisplayThumbnail = _existingDisplayThumbnailUrl;
    return Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: selectedThumbnail != null
              ? Image.memory(
                  selectedThumbnail.bytes,
                  width: 118,
                  height: 70,
                  fit: BoxFit.cover,
                )
              : Image.network(
                  existingDisplayThumbnail,
                  width: 118,
                  height: 70,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Container(
                    width: 118,
                    height: 70,
                    alignment: Alignment.center,
                    color: Colors.white.withOpacity(0.04),
                    child: const Icon(
                      Ionicons.image_outline,
                      color: AppColors.textGray600,
                    ),
                  ),
                ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                selectedThumbnail?.filename ?? 'Current thumbnail',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Thumbnail preview',
                style: TextStyle(fontSize: 11, color: AppColors.textGray500),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: () => setState(() {
            _thumbnail = null;
            _removeExistingThumbnail = true;
            if (_uploadPreviewMode == 'thumbnail') _uploadPreviewMode = 'none';
          }),
          child: Container(
            height: 38,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(999),
            ),
            child: const Text(
              'REMOVE',
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray300,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _pickThumbnail() async {
    final files = await pickUploadFiles(field: 'preview', type: FileType.image);
    if (!mounted || files.isEmpty) return;
    setState(() {
      _thumbnail = files.first;
      _removeExistingThumbnail = false;
      _uploadPreviewMode = 'thumbnail';
      _contentAccessMode = 'unblurred';
    });
  }

  void _removeLink() {
    setState(() {
      _activeLink = '';
      _linkPreviewTitle = '';
      _linkPreviewImage = '';
      _link.clear();
      _showLinkedContentOnHome = false;
      if (!_isFlash) {
        _contentAccessMode = 'unblurred';
        _uploadPreviewMode = 'none';
      }
    });
  }

  // ---- Content access (vault only) ----

  Widget _contentAccessSection() {
    Widget card(String id, String title, String body) {
      final disabled = vaultPreviewChoiceDisabled(
        choice: id,
        selectedMode: _uploadPreviewMode,
        hasVideoLikeContent: _hasVideoLikeContent,
        hasRawVideo: _hasVideo,
        canBlur: _canBlurVaultContent,
        hasImageLikeContent: _hasImageLikeContent,
      );
      final selected =
          !disabled &&
          (id == 'blurred'
              ? _uploadPreviewMode == 'blurred'
              : _contentAccessMode == 'unblurred');
      final selectedColor = id == 'blurred'
          ? const Color(0xFFD9B524)
          : _greenBorder;
      return Expanded(
        child: GestureDetector(
          key: Key('upload-content-access-$id'),
          onTap: disabled
              ? null
              : () => setState(() {
                  if (id == 'blurred') {
                    if (_uploadPreviewMode == 'blurred') {
                      _contentAccessMode = 'unblurred';
                      _uploadPreviewMode = 'none';
                    } else {
                      _contentAccessMode = 'blurred';
                      _uploadPreviewMode = 'blurred';
                      if (_hasImageLikeContent) {
                        _thumbnail = null;
                        _removeExistingThumbnail = true;
                      }
                    }
                  } else {
                    _contentAccessMode = 'unblurred';
                  }
                }),
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              color: selected
                  ? selectedColor.withOpacity(0.12)
                  : Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected ? selectedColor : AppColors.borderWhite10,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 10.5,
                    letterSpacing: 1.3,
                    fontWeight: FontWeight.w600,
                    color: disabled
                        ? AppColors.textGray700
                        : selected
                        ? Colors.white
                        : AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  body,
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.45,
                    color: disabled
                        ? AppColors.textGray700
                        : AppColors.textGray400,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _panelDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _headingBlock('Content Access', '', titleSize: 15),
          const SizedBox(height: 12),
          // IntrinsicHeight so the two cards match height. `stretch` alone
          // cannot resolve inside a scroll view, where the Row's height is
          // unbounded.
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                card(
                  'blurred',
                  'BLURRED',
                  'Preview stays partly visible, rest stays blurred.',
                ),
                const SizedBox(width: 10),
                card(
                  'unblurred',
                  'NON BLURRED',
                  _hasImageLikeContent
                      ? 'Image content uses Blur or Thumbnail only.'
                      : 'Full media preview opens normally.',
                ),
              ],
            ),
          ),
          if (_activeLink.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Text(
              'SHOW LINKED CONTENT ON HOME PAGE',
              style: TextStyle(
                fontSize: 9.5,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray600,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _toggleBox(
                    'Yes',
                    _showLinkedContentOnHome,
                    () => setState(() => _showLinkedContentOnHome = true),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _toggleBox(
                    'No',
                    !_showLinkedContentOnHome,
                    () => setState(() => _showLinkedContentOnHome = false),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'When enabled, the public home card can open the linked content.',
              style: TextStyle(
                fontSize: 10.5,
                height: 1.35,
                color: AppColors.textGray500,
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ---- Price ----

  String _formatEditableNumber(num value) => value % 1 == 0
      ? value.toInt().toString()
      : value
            .toStringAsFixed(2)
            .replaceFirst(RegExp(r'0+$'), '')
            .replaceFirst(RegExp(r'\.$'), '');

  void _syncCommissionAmountFromPercent() {
    final percentage = double.tryParse(_shareCommissionPct.text.trim()) ?? 0;
    final amount = _price > 0 ? _price * percentage / 100 : 0;
    _shareCommissionAmount.text = amount > 0 ? amount.toStringAsFixed(2) : '';
  }

  void _syncCommissionPercentFromAmount() {
    final amount = double.tryParse(_shareCommissionAmount.text.trim()) ?? 0;
    final percentage = _price > 0 ? (amount / _price * 100).clamp(0, 100) : 0;
    _shareCommissionPct.text = percentage > 0
        ? _formatEditableNumber(percentage)
        : '';
  }

  Widget _priceSection() {
    if (_isFlash) {
      return Row(
        children: [
          Expanded(
            child: _readOnlyTile(
              'FIXED PRICE',
              _settingsLoaded ? 'R ${_flashPrice.toStringAsFixed(0)}' : '—',
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _readOnlyTile('PREVIEW TIME', '$_flashPreviewSeconds sec'),
          ),
        ],
      );
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _panelDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'SET PRICE',
                  style: TextStyle(
                    fontSize: 9.5,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray600,
                  ),
                ),
              ),
              _miniAction(
                '+ ADD SUBSCRIPTION ACCESS',
                _openSubscriptionTiers,
                danger: true,
              ),
            ],
          ),
          const SizedBox(height: 14),
          _microLabel('PRICE *'),
          const SizedBox(height: 6),
          _priceField(),
          const SizedBox(height: 8),
          if (!_settingsLoaded)
            const Text(
              'Loading admin price range...',
              style: TextStyle(fontSize: 10.5, color: AppColors.textGray600),
            )
          else ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Min Rupieer ${_minUploadPrice.toStringAsFixed(0)}',
                  style: const TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray600,
                  ),
                ),
                Text(
                  'Max Rupieer ${_maxUploadPrice.toStringAsFixed(0)}',
                  style: const TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray600,
                  ),
                ),
              ],
            ),
            if (_subscriptionAccessEnabled &&
                _subscriptionTiers.isNotEmpty) ...[
              const SizedBox(height: 12),
              _appliedSubscriptionPackages(),
            ],
          ],
        ],
      ),
    );
  }

  Widget _appliedSubscriptionPackages() {
    String number(double value) => value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toStringAsFixed(2);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'APPLIED SUBSCRIPTION PACKAGES (${_subscriptionTiers.length}/3)',
          style: const TextStyle(
            fontSize: 8.5,
            letterSpacing: 1.2,
            fontWeight: FontWeight.w700,
            color: AppColors.textGray600,
          ),
        ),
        const SizedBox(height: 8),
        for (var i = 0; i < _subscriptionTiers.length; i++) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.20),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Package ${i + 1}',
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textGray300,
                    ),
                  ),
                ),
                Text(
                  'Rupieer ${number(_subscriptionTiers[i].price)} / ${_subscriptionTiers[i].minutes} Minutes / ${number(_subscriptionTiers[i].affiliateCommission)}%',
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray300,
                  ),
                ),
              ],
            ),
          ),
          if (i != _subscriptionTiers.length - 1) const SizedBox(height: 7),
        ],
      ],
    );
  }

  Widget _priceField() {
    return TextField(
      key: const Key('upload-content-price'),
      controller: _priceController,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
      onChanged: (value) {
        final next = double.tryParse(value);
        setState(() {
          _price = next ?? 0;
          _syncCommissionAmountFromPercent();
        });
      },
      style: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: Colors.white,
      ),
      decoration: InputDecoration(
        hintText: 'Enter price',
        hintStyle: const TextStyle(fontSize: 12, color: AppColors.textGray600),
        filled: true,
        fillColor: _panelBlack,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 12,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
      ),
    );
  }

  Widget _readOnlyTile(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: _panelDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 9,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  // ---- Title / topics / tags ----

  Widget _detailsSection() {
    return Container(
      key: const Key('upload-content-details-panel'),
      padding: const EdgeInsets.all(14),
      decoration: _panelDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _headingBlock('Title', '', titleSize: 13),
          const SizedBox(height: 8),
          _input(_title, 'Write short description...', maxLength: 50),
          const SizedBox(height: 16),
          _topicsSection(),
          const SizedBox(height: 16),
          _tagsSection(),
        ],
      ),
    );
  }

  Widget _topicsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'Topics',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
            ),
            const Text(
              ' *',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.likeRed,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) => CompositedTransformTarget(
            link: _topicLayerLink,
            child: GestureDetector(
              onTap: () => _toggleTopicOverlay(constraints.maxWidth),
              behavior: HitTestBehavior.opaque,
              child: Container(
                key: const Key('upload-content-topic-field'),
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: _fieldDecoration(),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _topic.isEmpty ? 'Choose topics' : _topic,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: _topic.isEmpty
                              ? AppColors.textGray500
                              : Colors.white,
                        ),
                      ),
                    ),
                    Icon(
                      _topicsOpen
                          ? Ionicons.chevron_up_outline
                          : Ionicons.chevron_down_outline,
                      size: 15,
                      color: AppColors.textGray300,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _toggleTopicOverlay(double width) {
    if (_topicOverlay != null) {
      _closeTopicOverlay();
      return;
    }
    setState(() => _topicsOpen = true);
    _topicOverlay = OverlayEntry(
      builder: (_) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: _closeTopicOverlay,
            ),
          ),
          CompositedTransformFollower(
            link: _topicLayerLink,
            showWhenUnlinked: false,
            offset: const Offset(0, 52),
            child: Material(
              color: Colors.transparent,
              child: Container(
                key: const Key('upload-content-topic-menu'),
                width: width,
                height: 278,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: const Color(0xFF101115),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderWhite10),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x99000000),
                      blurRadius: 22,
                      offset: Offset(0, 10),
                    ),
                  ],
                ),
                child: Scrollbar(
                  controller: _topicScrollController,
                  thumbVisibility: true,
                  child: ListView.builder(
                    controller: _topicScrollController,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: _topics.length,
                    itemBuilder: (_, i) {
                      final topic = _topics[i];
                      final selected = topic == _topic;
                      return InkWell(
                        onTap: () {
                          if (mounted) setState(() => _topic = topic);
                          _closeTopicOverlay();
                        },
                        child: SizedBox(
                          height: 48,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    topic,
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: selected
                                          ? Colors.white
                                          : AppColors.textGray300,
                                    ),
                                  ),
                                ),
                                if (selected)
                                  const Icon(
                                    Ionicons.checkmark,
                                    size: 15,
                                    color: Colors.white,
                                  ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
    Overlay.of(context).insert(_topicOverlay!);
  }

  void _closeTopicOverlay() {
    _topicOverlay?.remove();
    _topicOverlay = null;
    if (mounted && _topicsOpen) setState(() => _topicsOpen = false);
  }

  Widget _tagsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Tags',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Flexible(child: _visibilityControl()),
            const SizedBox(width: 10),
            Flexible(child: _allowCommentsControl()),
          ],
        ),
        if (_visibilityOpen) ...[
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF121216),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              children: _visibilityOptions.entries.map((entry) {
                final selected = _visibility == entry.key;
                return ListTile(
                  dense: true,
                  onTap: () => setState(() {
                    _visibility = entry.key;
                    _visibilityOpen = false;
                  }),
                  leading: Icon(
                    entry.value.$2,
                    size: 16,
                    color: selected ? Colors.white : AppColors.textGray500,
                  ),
                  title: Text(
                    entry.value.$1,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: selected ? Colors.white : AppColors.textGray300,
                    ),
                  ),
                  trailing: selected
                      ? const Icon(
                          Ionicons.checkmark,
                          size: 15,
                          color: Colors.white,
                        )
                      : null,
                );
              }).toList(),
            ),
          ),
        ],
        const SizedBox(height: 10),
        _tagInput(),
        if (_tags.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: [
              for (final tag in _tags)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '#$tag',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(width: 7),
                      GestureDetector(
                        onTap: () => setState(() {
                          _tags = _tags
                              .where((item) => item != tag)
                              .toList(growable: false);
                          _hashtags.text = _tags
                              .map((item) => '#$item')
                              .join(' ');
                        }),
                        child: const Icon(
                          Ionicons.close_outline,
                          size: 13,
                          color: AppColors.textGray500,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _tagInput() {
    return Focus(
      onKeyEvent: (_, event) {
        if (event is KeyDownEvent &&
            event.logicalKey == LogicalKeyboardKey.tab) {
          if (_tagDraft.text.trim().isNotEmpty) {
            _commitTag();
            return KeyEventResult.handled;
          }
        }
        if (event is KeyDownEvent &&
            event.logicalKey == LogicalKeyboardKey.backspace &&
            _tagDraft.text.isEmpty &&
            _tags.isNotEmpty) {
          setState(() {
            _tags = _tags.sublist(0, _tags.length - 1);
            _hashtags.text = _tags.map((tag) => '#$tag').join(' ');
          });
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: TextField(
        controller: _tagDraft,
        focusNode: _tagFocus,
        onChanged: (value) {
          if (value.contains(',')) _commitTag();
        },
        onSubmitted: (_) => _commitTag(),
        textInputAction: TextInputAction.done,
        style: const TextStyle(fontSize: 11, color: Colors.white),
        cursorColor: _accent,
        decoration: InputDecoration(
          prefixIcon: const Icon(
            Ionicons.pricetag_outline,
            size: 16,
            color: AppColors.textGray400,
          ),
          hintText: _tags.isEmpty ? 'Type tag and press Enter' : 'Add tag',
          hintStyle: const TextStyle(
            fontSize: 11,
            color: AppColors.textGray600,
          ),
          filled: true,
          fillColor: _panelBlack,
          constraints: const BoxConstraints(minHeight: 44, maxHeight: 44),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 10,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.borderWhite10),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.borderWhite10),
          ),
        ),
      ),
    );
  }

  void _commitTag() {
    final next = mergeUploadContentTags(_tags, _tagDraft.text);
    if (_tagDraft.text.isEmpty) return;
    setState(() {
      _tags = next;
      _hashtags.text = _tags.map((tag) => '#$tag').join(' ');
      _tagDraft.clear();
    });
  }

  void _commitTagOnBlur() {
    if (!_tagFocus.hasFocus && _tagDraft.text.trim().isNotEmpty && mounted) {
      _commitTag();
    }
  }

  Widget _visibilityControl() {
    final option = _visibilityOptions[_visibility]!;
    return GestureDetector(
      onTap: () => setState(() => _visibilityOpen = !_visibilityOpen),
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 38,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(option.$2, size: 14, color: const Color(0xFF67E8F9)),
            const SizedBox(width: 7),
            Flexible(
              child: Text(
                'Visibility: ${option.$1}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 4),
            Icon(
              _visibilityOpen
                  ? Ionicons.chevron_up_outline
                  : Ionicons.chevron_down_outline,
              size: 13,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }

  Widget _allowCommentsControl() {
    return GestureDetector(
      onTap: () => setState(() => _allowComments = !_allowComments),
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 38,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 18,
              height: 18,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: _allowComments ? Colors.white : Colors.transparent,
                borderRadius: BorderRadius.circular(5),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Icon(
                Ionicons.checkmark,
                size: 12,
                color: _allowComments ? Colors.black : Colors.transparent,
              ),
            ),
            const SizedBox(width: 8),
            const Flexible(
              child: Text(
                'Allow comments',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---- Share commission (vault only) ----

  Widget _shareCommissionSection() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _panelDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'SHARE COMMISSION',
            style: TextStyle(
              fontSize: 10.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Reward user who share and help sell your content.',
            style: TextStyle(
              fontSize: 11,
              height: 1.45,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _microLabel('SHARE COMMISSION (%)'),
                    const SizedBox(height: 6),
                    _input(
                      _shareCommissionPct,
                      'Auto',
                      numeric: true,
                      onChanged: (_) => _syncCommissionAmountFromPercent(),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _microLabel('COM AMOUNT'),
                    const SizedBox(height: 6),
                    _input(
                      _shareCommissionAmount,
                      'Auto',
                      numeric: true,
                      onChanged: (_) => _syncCommissionPercentFromAmount(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ---- Terms / actions ----

  Widget _termsRow() {
    return GestureDetector(
      key: const Key('upload-content-terms-toggle'),
      onTap: () => setState(() => _acceptedTerms = !_acceptedTerms),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: _panelDecoration(),
        child: Row(
          children: [
            Container(
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: _acceptedTerms ? Colors.white : Colors.transparent,
                borderRadius: BorderRadius.circular(5),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Icon(
                Ionicons.checkmark,
                size: 13,
                color: _acceptedTerms ? Colors.black : Colors.transparent,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text.rich(
                    TextSpan(
                      text: 'I agree to the ',
                      children: [
                        TextSpan(
                          text: 'terms and conditions.',
                          style: TextStyle(
                            decoration: TextDecoration.underline,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.45,
                      color: AppColors.textGray300,
                    ),
                  ),
                  if (_userHasPaidSubscription == false) ...[
                    const SizedBox(height: 7),
                    Text(
                      'This content will be deleted from your profile after $_contentExpiryLabel. Get a subscription package to keep it on your profile.',
                      key: Key('upload-content-basic-expiry-notice'),
                      style: const TextStyle(
                        fontSize: 10,
                        height: 1.55,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showCancelDialog() async {
    if (_submitting || !mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: const Color(0xFF111114),
        insetPadding: const EdgeInsets.symmetric(horizontal: 28),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Ionicons.document_text_outline,
                  size: 20,
                  color: Color(0xFFFFA3B2),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'CANCEL ${_isFlash ? 'FLASH CONTENT' : 'VAULT CONTENT'}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  letterSpacing: 1.8,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Save this ${_isFlash ? 'flash' : 'vault'} content form as a draft or close it right away.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11,
                  height: 1.45,
                  color: AppColors.textGray500,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _dialogAction(
                      'SAVE DRAFT',
                      Colors.white.withValues(alpha: 0.06),
                      () async {
                        await _saveDraft();
                        if (!mounted || !dialogContext.mounted) return;
                        Navigator.pop(dialogContext);
                        Navigator.maybePop(context);
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _dialogAction('DISCARD', _accent, () async {
                      await _clearDraft();
                      if (!mounted || !dialogContext.mounted) return;
                      Navigator.pop(dialogContext);
                      Navigator.maybePop(context);
                    }),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _dialogAction(
    String label,
    Color color,
    Future<void> Function() onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(9),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 9,
            letterSpacing: 1.2,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  Widget _actionsRow() {
    final publishDisabled = _submitting || !_acceptedTerms;
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        GestureDetector(
          onTap: _submitting ? null : _showCancelDialog,
          child: Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Ionicons.close_outline, size: 15, color: Colors.white),
                SizedBox(width: 8),
                Text(
                  'CANCEL',
                  style: TextStyle(
                    fontSize: 10.5,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        GestureDetector(
          key: const Key('upload-content-publish'),
          onTap: publishDisabled ? null : _publish,
          child: Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 22),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: publishDisabled
                  ? _publishRed.withOpacity(0.6)
                  : _publishRed,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_submitting)
                  const SizedBox(
                    width: 15,
                    height: 15,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                else
                  const Icon(
                    Ionicons.rocket_outline,
                    size: 15,
                    color: Colors.white,
                  ),
                const SizedBox(width: 8),
                Text(
                  _submitting ? 'PUBLISHING' : 'PUBLISH',
                  style: const TextStyle(
                    fontSize: 10.5,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _publishingProgressPanel() {
    final percent = (_uploadProgress * 100).round().clamp(0, 100);
    final processing = percent >= 100;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(10, 9, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF26191B),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF704049)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  processing
                      ? 'PROCESSING CONTENT'
                      : _hasVideo
                      ? 'UPLOADING VIDEO'
                      : 'UPLOADING MEDIA',
                  style: const TextStyle(
                    fontSize: 9.5,
                    letterSpacing: 1.1,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              Text(
                '$percent%',
                key: const Key('upload-content-progress-percent'),
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFFFFD4DC),
                ),
              ),
            ],
          ),
          const SizedBox(height: 9),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(end: processing ? 1 : _uploadProgress),
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOut,
              builder: (context, value, _) => LinearProgressIndicator(
                minHeight: 7,
                value: value,
                backgroundColor: const Color(0xFF4A2A30),
                valueColor: const AlwaysStoppedAnimation(Color(0xFFFFB8C5)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---- Preview ----

  Widget _previewSection() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _panelDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _headingBlock(
                  'Content Preview',
                  '${_isFlash ? 'Flash' : 'Vault'} Content preview',
                  titleSize: 17,
                ),
              ),
              _previewToggle(),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      _previewMode == 'mobile'
                          ? Ionicons.phone_portrait_outline
                          : Ionicons.desktop_outline,
                      size: 13,
                      color: AppColors.textGray500,
                    ),
                    const SizedBox(width: 7),
                    Text(
                      '${_previewMode.toUpperCase()} PREVIEW',
                      style: const TextStyle(
                        fontSize: 8.5,
                        letterSpacing: 2,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Center(
                  child: _previewMode == 'mobile'
                      ? _phoneMock()
                      : _desktopMock(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _previewToggle() {
    Widget option(String mode, String label, IconData icon) {
      final selected = _previewMode == mode;
      return GestureDetector(
        onTap: () => setState(() => _previewMode = mode),
        behavior: HitTestBehavior.opaque,
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Row(
            children: [
              Icon(
                icon,
                size: 14,
                color: selected ? Colors.black : AppColors.textGray500,
              ),
              const SizedBox(width: 5),
              Text(
                label,
                style: TextStyle(
                  fontSize: 9,
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.black : AppColors.textGray500,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          option('mobile', 'MOBILE', Ionicons.phone_portrait_outline),
          option('desktop', 'DESKTOP', Ionicons.desktop_outline),
        ],
      ),
    );
  }

  Widget _phoneMock() {
    final title = _title.text.trim();
    return Container(
      width: 190,
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0B0D),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: AppColors.borderWhite10, width: 2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _mockTab('CONTENT', true),
              const SizedBox(width: 14),
              _mockTab('FEATURED', false),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: const Color(0xFF15161A),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Row(
                    children: [
                      Container(
                        width: 26,
                        height: 26,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.07),
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          Api.displayName.trim().isEmpty
                              ? 'G'
                              : Api.displayName.trim()[0].toUpperCase(),
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              Api.displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                            const Text(
                              'Content Post',
                              style: TextStyle(
                                fontSize: 8,
                                color: AppColors.textGray600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                _mockMediaFrame(),
                Padding(
                  padding: const EdgeInsets.all(9),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        height: 5,
                        width: 90,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.07),
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        title.isEmpty ? 'Write short description...' : title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 9.5,
                          color: title.isEmpty
                              ? AppColors.textGray600
                              : AppColors.textGray200,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        _activeLink.isEmpty
                            ? 'Media Content'
                            : (_linkPreviewTitle.isEmpty
                                  ? _defaultLinkTitle(_activeLink)
                                  : _linkPreviewTitle),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _activeLink.isEmpty
                            ? 'Add a link or upload medi...'
                            : _activeLink,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 8,
                          color: AppColors.textGray600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _mockTab(String label, bool active) => Text(
    label,
    style: TextStyle(
      fontSize: 8,
      letterSpacing: 1.2,
      fontWeight: FontWeight.w600,
      color: active ? Colors.white : AppColors.textGray700,
    ),
  );

  Widget _desktopMock() {
    final title = _title.text.trim();
    final previewImage = _contentPreviewImage();
    final isPlayable =
        _hasVideo ||
        _isVideoLikeUrl(_activeLink) ||
        _isSocialEmbed(_activeLink);
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(maxWidth: 390),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF08090B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10, width: 2),
      ),
      child: Column(
        children: [
          Row(
            children: [
              for (final color in const [
                Color(0xFFF87171),
                Color(0xFFF59E0B),
                Color(0xFF10B981),
              ]) ...[
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
              ],
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  height: 10,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(99),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 150,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF121318),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Media Content',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        title.isEmpty
                            ? 'Upload or link content to preview the final card.'
                            : title,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          height: 1.55,
                          color: AppColors.textGray400,
                        ),
                      ),
                      const Spacer(),
                      Container(
                        height: 6,
                        width: 100,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: GestureDetector(
                  onTap: isPlayable ? _openPreviewPlayer : null,
                  child: SizedBox(
                    width: 150,
                    height: 150,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        previewImage ?? _mockMediaFallback(false),
                        if (_showBlurredContentPreview)
                          _blurredPreviewOverlay(compact: false),
                        if (isPlayable)
                          Center(
                            child: Container(
                              width: 38,
                              height: 38,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.58),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Ionicons.play,
                                size: 17,
                                color: Colors.white,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _mockMediaFrame() {
    final hasPreview = _contentPreviewImage() != null;
    final isPlayable =
        _hasVideo ||
        _isVideoLikeUrl(_activeLink) ||
        _isSocialEmbed(_activeLink);

    return GestureDetector(
      onTap: isPlayable ? _openPreviewPlayer : null,
      child: Container(
        height: 96,
        width: double.infinity,
        color: Colors.black,
        child: Stack(
          fit: StackFit.expand,
          children: [
            _contentPreviewImage() ?? _mockMediaFallback(hasPreview),
            if (_showBlurredContentPreview)
              _blurredPreviewOverlay(compact: true),
            if (isPlayable)
              Center(
                child: Container(
                  width: 46,
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.55),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Ionicons.play,
                    size: 20,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _blurredPreviewOverlay({required bool compact}) {
    return Stack(
      children: [
        Positioned(
          left: 0,
          right: 0,
          top: 0,
          height: compact ? 30 : 48,
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.02),
                    Colors.black.withValues(alpha: 0.16),
                  ],
                ),
              ),
            ),
          ),
        ),
        Positioned.fill(
          top: compact ? 30 : 48,
          child: ClipRect(
            child: BackdropFilter(
              filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
              child: Container(color: Colors.black.withValues(alpha: 0.42)),
            ),
          ),
        ),
        Positioned(
          left: compact ? 8 : 10,
          right: compact ? 8 : 10,
          bottom: compact ? 7 : 10,
          child: Container(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 8 : 10,
              vertical: compact ? 5 : 7,
            ),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(compact ? 10 : 12),
              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'BLURRED CONTENT',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: compact ? 7.5 : 8.5,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFFFDE68A),
                  ),
                ),
                SizedBox(height: compact ? 2 : 3),
                Text(
                  compact
                      ? 'Unlock to view full preview.'
                      : 'Only the top preview stays clear until unlocked.',
                  maxLines: compact ? 1 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: compact ? 7.5 : 9,
                    height: 1.25,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withValues(alpha: 0.78),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget? _contentPreviewImage() {
    if (_thumbnail != null) {
      return Image.memory(_thumbnail!.bytes, fit: BoxFit.cover);
    }
    if (_media.isNotEmpty && !_hasVideo) {
      return Image.memory(_media.first.bytes, fit: BoxFit.cover);
    }
    if (_hasVideo && _selectedVideoThumbnailBytes != null) {
      return Image.memory(
        _selectedVideoThumbnailBytes!,
        key: const Key('upload-content-video-preview-thumbnail'),
        fit: BoxFit.cover,
      );
    }
    final thumbnail = _linkPreviewImage.isNotEmpty
        ? _linkPreviewImage
        : _linkPreviewThumbnail(_activeLink);
    final existingThumbnail = _existingDisplayThumbnailUrl;
    if (_media.isEmpty && existingThumbnail.isNotEmpty) {
      return Image.network(
        existingThumbnail,
        key: const Key('upload-content-existing-preview-thumbnail'),
        fit: BoxFit.cover,
        webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
        errorBuilder: (_, __, ___) =>
            _existingVideoPreview() ?? _mockMediaFallback(true),
        loadingBuilder: (context, child, progress) =>
            progress == null ? child : _mockMediaFallback(true),
      );
    }
    final existingVideo = _existingVideoPreview();
    if (existingVideo != null) return existingVideo;
    if (thumbnail.isEmpty) return null;
    return Image.network(
      thumbnail,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => _mockMediaFallback(true),
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : _mockMediaFallback(true),
    );
  }

  Widget? _existingVideoPreview() {
    final item = _editingContent;
    final source = _existingDisplayMediaUrl;
    if (_media.isNotEmpty ||
        item == null ||
        item.mediaType != 'video' ||
        source.isEmpty) {
      return null;
    }
    return KeyedSubtree(
      key: const Key('upload-content-existing-video-preview'),
      child: webVideo(
        source,
        poster: _existingDisplayThumbnailUrl,
        interactive: false,
        autoPlay: false,
        instanceKey: 'studio-${_previewMode}-${item.contentId}',
        trimStartSeconds: item.videoTrimStartSeconds,
        trimEndSeconds: item.videoTrimEndSeconds,
      ),
    );
  }

  void _openPreviewPlayer() {
    final selectedVideo = _hasVideo
        ? (_selectedVideoPreviewUrl.trim().isNotEmpty
              ? _selectedVideoPreviewUrl.trim()
              : _existingDisplayMediaUrl)
        : '';
    final normalized = _normalizeUrl(_activeLink);
    final embed = _socialEmbedUrl(normalized);
    final directVideo = _isVideoLikeUrl(normalized);
    if (selectedVideo.isEmpty && embed.isEmpty && !directVideo) {
      AppNotifications.error('Preview player opens after a playable link.');
      return;
    }
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(18),
        backgroundColor: Colors.black,
        child: AspectRatio(
          aspectRatio: 9 / 16,
          child: Stack(
            children: [
              Positioned.fill(
                child: selectedVideo.isNotEmpty
                    ? webVideo(selectedVideo)
                    : directVideo
                    ? webVideo(
                        normalized,
                        poster: _linkPreviewThumbnail(normalized),
                      )
                    : webEmbed(embed),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: GestureDetector(
                  onTap: () => Navigator.maybePop(context),
                  child: Container(
                    width: 36,
                    height: 36,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.65),
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: const Icon(
                      Ionicons.close_outline,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _mockMediaFallback(bool hasPreview) {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          hasPreview ? 'LOADING PREVIEW' : 'LIVE CONTENT',
          style: const TextStyle(
            fontSize: 8,
            letterSpacing: 1.1,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  String _normalizeUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return '';
    return RegExp(r'^https?://', caseSensitive: false).hasMatch(trimmed)
        ? trimmed
        : 'https://$trimmed';
  }

  Uri? _tryUri(String value) {
    try {
      return Uri.parse(_normalizeUrl(value));
    } catch (_) {
      return null;
    }
  }

  String _mediaUrlFromQuery(String value) {
    final uri = _tryUri(value);
    if (uri == null) return '';
    const keys = [
      'imgurl',
      'image',
      'image_url',
      'media',
      'media_url',
      'file',
      'src',
      'url',
    ];
    for (final key in keys) {
      final candidate = uri.queryParameters[key]?.trim();
      if (candidate != null && candidate.isNotEmpty) {
        return Uri.decodeComponent(candidate);
      }
    }
    return '';
  }

  String _googleImageSourceUrl(String value) {
    final uri = _tryUri(value);
    if (uri == null) return '';
    final host = uri.host
        .replaceFirst(RegExp(r'^www\.', caseSensitive: false), '')
        .toLowerCase();
    if (!host.contains('google.') || uri.path != '/imgres') return '';
    final imageUrl = uri.queryParameters['imgurl'];
    return imageUrl == null ? '' : Uri.decodeComponent(imageUrl);
  }

  bool _isImageLikeUrl(String value) {
    final normalized = _normalizeUrl(value);
    if (normalized.isEmpty) return false;
    final imagePattern = RegExp(
      r'\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$',
      caseSensitive: false,
    );
    if (imagePattern.hasMatch(normalized)) return true;
    final mediaQueryUrl = _mediaUrlFromQuery(normalized);
    if (mediaQueryUrl.isNotEmpty && imagePattern.hasMatch(mediaQueryUrl)) {
      return true;
    }
    return RegExp(
      r'[?&](format|fm|ext|type)=((p|jpe?g|png|gif|webp|bmp|svg|avif))',
      caseSensitive: false,
    ).hasMatch(normalized);
  }

  bool _isVideoLikeUrl(String value) {
    final normalized = _normalizeUrl(value);
    if (normalized.isEmpty) return false;
    final videoPattern = RegExp(
      r'\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?.*)?$',
      caseSensitive: false,
    );
    if (videoPattern.hasMatch(normalized)) return true;
    final mediaQueryUrl = _mediaUrlFromQuery(normalized);
    if (mediaQueryUrl.isNotEmpty && videoPattern.hasMatch(mediaQueryUrl)) {
      return true;
    }
    return RegExp(
      r'[?&](format|ext|type)=(mp4|webm|ogg|mov|m4v|avi|mkv)',
      caseSensitive: false,
    ).hasMatch(normalized);
  }

  String _youTubeVideoId(String value) {
    final uri = _tryUri(value);
    if (uri == null) return '';
    final host = uri.host
        .replaceFirst(RegExp(r'^www\.', caseSensitive: false), '')
        .toLowerCase();
    if (host == 'youtu.be') {
      return uri.pathSegments.isEmpty ? '' : uri.pathSegments.first;
    }
    if (host.contains('youtube.com')) {
      if (uri.path.startsWith('/shorts/') || uri.path.startsWith('/embed/')) {
        return uri.pathSegments.length > 1 ? uri.pathSegments[1] : '';
      }
      return uri.queryParameters['v'] ?? '';
    }
    return '';
  }

  bool _isSocialEmbed(String value) {
    final uri = _tryUri(value);
    if (uri == null) return false;
    final host = uri.host
        .replaceFirst(RegExp(r'^www\.', caseSensitive: false), '')
        .toLowerCase();
    if (host == 'youtu.be' || host.contains('youtube.com')) return true;
    if (host.contains('instagram.com')) return true;
    if (host.contains('tiktok.com')) return true;
    return host.contains('facebook.com') || host.contains('fb.watch');
  }

  String _socialEmbedUrl(String value) {
    final normalized = _normalizeUrl(value);
    final uri = _tryUri(normalized);
    if (uri == null) return '';
    final host = uri.host
        .replaceFirst(RegExp(r'^www\.', caseSensitive: false), '')
        .toLowerCase();

    final youtubeId = _youTubeVideoId(normalized);
    if (youtubeId.isNotEmpty) {
      return 'https://www.youtube.com/embed/$youtubeId?autoplay=1&rel=0&modestbranding=1';
    }

    if (host.contains('instagram.com')) {
      final parts = uri.pathSegments;
      if (parts.length >= 2 && ['p', 'reel', 'tv'].contains(parts[0])) {
        return 'https://www.instagram.com/${parts[0]}/${parts[1]}/embed';
      }
    }

    if (host.contains('tiktok.com')) {
      final parts = uri.pathSegments;
      final videoIndex = parts.indexOf('video');
      if (videoIndex >= 0 && parts.length > videoIndex + 1) {
        return 'https://www.tiktok.com/embed/v2/${parts[videoIndex + 1]}';
      }
    }

    if (host.contains('facebook.com') || host.contains('fb.watch')) {
      final isVideo = RegExp(
        r'/videos/|/watch/|\?v=|fb\.watch',
        caseSensitive: false,
      ).hasMatch(normalized);
      final plugin = isVideo ? 'video.php' : 'post.php';
      return 'https://www.facebook.com/plugins/$plugin?href=${Uri.encodeComponent(normalized)}&show_text=false&width=560';
    }

    return '';
  }

  String _linkPreviewThumbnail(String value) {
    final normalized = _normalizeUrl(value);
    if (normalized.isEmpty) return '';

    final googleImageSource = _googleImageSourceUrl(normalized);
    if (googleImageSource.isNotEmpty) return googleImageSource;

    if (_isImageLikeUrl(normalized)) {
      final queryMedia = _mediaUrlFromQuery(normalized);
      return queryMedia.isNotEmpty ? queryMedia : normalized;
    }

    final youtubeId = _youTubeVideoId(normalized);
    if (youtubeId.isNotEmpty) {
      return 'https://img.youtube.com/vi/$youtubeId/hqdefault.jpg';
    }

    return 'https://api.microlink.io?url=${Uri.encodeComponent(normalized)}&screenshot=true&meta=false&embed=screenshot.url';
  }

  String _defaultLinkTitle(String value) {
    final uri = _tryUri(value);
    if (uri == null) return 'Media Content';
    final host = uri.host
        .replaceFirst(RegExp(r'^www\.', caseSensitive: false), '')
        .toLowerCase();
    if (host == 'youtu.be' || host.contains('youtube.com')) {
      return 'YouTube preview';
    }
    if (host.contains('instagram.com')) return 'Instagram preview';
    if (host.contains('tiktok.com')) return 'TikTok preview';
    if (host.contains('facebook.com') || host.contains('fb.watch')) {
      return 'Facebook preview';
    }
    if (host == 'x.com' || host.contains('twitter.com')) return 'X preview';
    return host.isEmpty ? 'Media Content' : host;
  }

  String get _tagsCsv => _tags.isEmpty
      ? _hashtags.text.trim()
      : _tags.map((tag) => '#$tag').join(' ');

  List<Map<String, dynamic>> get _subscriptionPayload {
    if (!_subscriptionAccessEnabled) return const [];
    return _subscriptionTiers
        .map(
          (tier) => {
            'label': tier.label,
            'price': tier.price,
            'minutes': tier.minutes,
            'affiliateCommission': tier.affiliateCommission,
          },
        )
        .toList(growable: false);
  }

  Future<void> _openSubscriptionTiers() async {
    const presetKey = 'googer-upload-content-subscription-packages-v2';
    final preferences = await SharedPreferences.getInstance();
    final savedTiers = <_SubscriptionTier>[];
    try {
      final rawPreset = preferences.getString(presetKey);
      final decoded = rawPreset == null ? null : jsonDecode(rawPreset);
      if (decoded is List) {
        for (var i = 0; i < decoded.length && savedTiers.length < 3; i++) {
          final raw = decoded[i];
          if (raw is! Map) continue;
          final row = Map<String, dynamic>.from(raw);
          final price = double.tryParse('${row['price'] ?? 0}') ?? 0;
          final minutes =
              int.tryParse('${row['minutes'] ?? row['days'] ?? 0}') ?? 0;
          if (price <= 0 || minutes <= 0) continue;
          savedTiers.add(
            _SubscriptionTier(
              label: '${row['label'] ?? 'Package ${i + 1}'}',
              price: price,
              minutes: minutes,
              affiliateCommission:
                  double.tryParse('${row['affiliateCommission'] ?? 0}') ?? 0,
            ),
          );
        }
      }
    } catch (_) {}
    if (!mounted) return;
    final initial = _subscriptionTiers.isNotEmpty
        ? _subscriptionTiers
        : savedTiers.isNotEmpty
        ? savedTiers
        : [const _SubscriptionTier(label: 'Package 1', price: 0, minutes: 10)];
    final result = await showModalBottomSheet<_SubscriptionTierResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SubscriptionTiersSheet(
        enabled: true,
        tiers: initial,
        savedTiers: savedTiers,
        commissionTiers: _subscriptionCommissionTiers,
      ),
    );
    if (!mounted || result == null) return;
    setState(() {
      _subscriptionAccessEnabled = result.enabled;
      _subscriptionTiers = result.enabled ? result.tiers.take(3).toList() : [];
    });
  }

  Future<void> _showRequiredFieldDialog(String message) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
        backgroundColor: const Color(0xFF2B0710),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0xFF7F1D1D)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 26, 22, 26),
          child: Stack(
            children: [
              Positioned(
                top: -4,
                right: -4,
                child: GestureDetector(
                  onTap: () => Navigator.maybePop(context),
                  child: Container(
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.08),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Ionicons.close_outline,
                      size: 20,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: Color(0xFF6B1421),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Ionicons.alert_circle_outline,
                      size: 24,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 22),
                  const Text(
                    'REQUIRED FIELD',
                    style: TextStyle(
                      fontSize: 12,
                      letterSpacing: 4,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFFFFB4BE),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.45,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 24),
                  GestureDetector(
                    onTap: () => Navigator.maybePop(context),
                    child: Container(
                      height: 40,
                      padding: const EdgeInsets.symmetric(horizontal: 28),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: const Color(0xFFFF2D3D),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: const Text(
                        'OK',
                        style: TextStyle(
                          fontSize: 10,
                          letterSpacing: 1.1,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---- Publish ----

  String get _mediaType {
    if (useExistingUploadContentMedia(
      isEditing: _isEditing,
      removed: _removeExistingMedia,
      hasNewMedia: _media.isNotEmpty,
    )) {
      return _editingContent!.mediaType.isEmpty
          ? _linkMediaType
          : _editingContent!.mediaType;
    }
    if (_media.isEmpty && _activeLink.isNotEmpty) return _linkMediaType;
    if (_media.isEmpty) return _linkMediaType;
    return _hasVideo ? 'video' : 'image';
  }

  String get _linkMediaType {
    if (_activeLink.isEmpty) return 'image';
    if (_isVideoLikeUrl(_activeLink) || _isSocialEmbed(_activeLink)) {
      return 'video';
    }
    if (_isImageLikeUrl(_activeLink)) return 'image';
    return 'link';
  }

  String? _validate() {
    if (_media.isEmpty && _existingMedia.isEmpty && _activeLink.isEmpty) {
      return 'Please add a link or upload an image.';
    }
    if (_topic.trim().isEmpty) return 'Please select topics.';
    if (_isFlash) {
      final playableLink =
          _activeLink.isNotEmpty &&
          (_isVideoLikeUrl(_activeLink) || _isSocialEmbed(_activeLink));
      if (!_hasVideo && !playableLink) {
        return 'Flash Content accepts videos or playable video links only.';
      }
    }
    if (_isFlash && _settingsLoaded && _flashPrice <= 0) {
      return 'Flash Content price is not configured by admin yet.';
    }
    if (!_isFlash) {
      if (!_price.isFinite || _price <= 0) {
        return 'Please enter a content price.';
      }
      if (_price < _minUploadPrice || _price > _maxUploadPrice) {
        return 'Price must stay between R ${_minUploadPrice.toStringAsFixed(0)} and R ${_maxUploadPrice.toStringAsFixed(0)}.';
      }
      final hasImage = _hasImageLikeContent;
      if (hasImage &&
          _thumbnail == null &&
          _existingThumbnail.isEmpty &&
          _contentAccessMode != 'blurred') {
        return 'Please choose Thumbnail or Blurred for this vault image content.';
      }
      final commission = double.tryParse(_shareCommissionPct.text.trim()) ?? 0;
      if (!commission.isFinite || commission < 0 || commission > 100) {
        return 'Affiliate commission must be between 0 and 100.';
      }
      if (_subscriptionAccessEnabled &&
          _subscriptionCommissionTiers.isNotEmpty) {
        final unsupported = _subscriptionTiers.any(
          (package) => !_subscriptionCommissionTiers.any(
            (tier) => package.price >= tier.min && package.price <= tier.max,
          ),
        );
        if (unsupported) {
          final minimum = _subscriptionCommissionTiers
              .map((tier) => tier.min)
              .reduce((a, b) => a < b ? a : b);
          final maximum = _subscriptionCommissionTiers
              .map((tier) => tier.max)
              .reduce((a, b) => a > b ? a : b);
          return 'Please add a subscription package price within the available price range (R ${minimum.toStringAsFixed(0)} - R ${maximum.toStringAsFixed(0)}).';
        }
      }
    }
    if (!_acceptedTerms) return 'Please accept the terms and conditions.';
    return null;
  }

  Future<void> _publish() async {
    if (_tagDraft.text.trim().isNotEmpty) _commitTag();
    final problem = _validate();
    if (problem != null) {
      await _showRequiredFieldDialog(problem);
      return;
    }
    final usage = _isEditing ? null : await Api.mySubscriptionUsage();
    if (!mounted) return;
    if (_videoDurationAtLimit()) {
      _showVideoDurationUpgradePrompt(_selectedVideoDurationSeconds);
      return;
    }
    if (!_isEditing && _uploadContentAtLimit(usage)) {
      _showUploadContentUpgradePrompt(
        limitMessage: _uploadContentLimitMessage(usage),
      );
      return;
    }
    setState(() {
      _submitting = true;
      _uploadProgress = 0;
    });

    ApiUploadFile? publishPreview;
    final publishThumbnail = _thumbnail;
    if (_hasVideo &&
        _uploadPreviewMode == 'auto_preview' &&
        _media.isNotEmpty) {
      if (!canTrimVideo || _selectedVideoPreviewUrl.isEmpty) {
        setState(() => _submitting = false);
        AppNotifications.error(
          'Automatic preview is unavailable. Choose a thumbnail to continue.',
        );
        return;
      }
      try {
        final previewSeconds = _isFlash ? _flashPreviewSeconds : 3;
        final availableSeconds =
            _selectedVideoDurationSeconds ?? previewSeconds;
        final previewDuration = math.min(
          previewSeconds.toDouble(),
          availableSeconds.toDouble(),
        );
        final startSeconds = _selectedVideoTrimStartSeconds;
        final endSeconds = startSeconds + previewDuration;
        final bytes = await trimVideoClip(
          _selectedVideoPreviewUrl,
          startSeconds: startSeconds,
          endSeconds: endSeconds,
        );
        publishPreview = ApiUploadFile(
          field: 'preview',
          filename: '$previewSeconds-second-preview.webm',
          bytes: bytes,
          contentType: 'video/webm',
        );
      } catch (error) {
        if (!mounted) return;
        setState(() => _submitting = false);
        AppNotifications.error(
          'Unable to create the automatic preview',
          '$error',
        );
        return;
      }
    }

    final price = _isFlash ? _flashPrice : _price;
    final publishContentId = _isEditing
        ? _editingContent!.contentId
        : buildUploadContentId();
    final publishMediaPreview = uploadContentMediaPreviewForPublish(
      activeLink: _activeLink,
      linkPreviewImage: _linkPreviewImage,
      hasNewMedia: _media.isNotEmpty,
      existingMediaPreview: _existingMediaPreview,
    );
    final result = await Api.createUploadContentDetailed(
      {
        'contentId': publishContentId,
        'contentType': _isFlash ? 'flash' : 'vault',
        'description': _title.text.trim(),
        'topic': _topic,
        'price': price,
        'priceRangeMin': price,
        'priceRangeMax': price,
        'affiliateCommission': _isFlash
            ? 0
            : (double.tryParse(_shareCommissionPct.text.trim()) ?? 0),
        'subscriptionPackages': _isFlash ? const [] : _subscriptionPayload,
        'visibility': _visibility,
        // The web maps its 'blurred' preview mode onto 'thumbnail' before
        // sending; only 'none' | 'thumbnail' | 'auto_preview' reach the backend.
        'previewMode': uploadPreviewModeForPublish(
          isEditing: _isEditing,
          hasNewMedia: _media.isNotEmpty,
          hasVideo: _hasVideo,
          hasNewThumbnail: _thumbnail != null,
          selectedMode: _uploadPreviewMode,
        ),
        'hashtags': _tagsCsv,
        'allowComments': _allowComments,
        'showLinkedContentOnHome':
            uploadContentShowLinkedContentOnHomeForPublish(
              activeLink: _activeLink,
              selected: _showLinkedContentOnHome,
            ),
        'externalLink': _activeLink,
        'mediaType': _mediaType,
        if (publishMediaPreview.isNotEmpty) 'mediaPreview': publishMediaPreview,
        if (_media.isEmpty && _existingMedia.isNotEmpty)
          'mediaGallery': _existingMedia,
        if (preserveExistingUploadContentThumbnail(
          hasNewThumbnail: _thumbnail != null,
          removed: _removeExistingThumbnail,
          existingThumbnail: _existingThumbnail,
        ))
          'thumbnailPreview': _existingThumbnail,
        if (_media.isEmpty && _existingPreviewUrl.isNotEmpty)
          'previewUrl': _existingPreviewUrl,
        'contentAccessMode': _isFlash ? 'unblurred' : _contentAccessMode,
        'videoDurationSeconds': _hasVideo
            ? (_selectedVideoDurationSeconds?.ceil() ?? _videoLimitSeconds)
            : 0,
        'videoTrimStartSeconds': _hasVideo ? _selectedVideoTrimStartSeconds : 0,
        'videoTrimEndSeconds': _hasVideo ? _selectedVideoTrimEndSeconds : 0,
        'videoOriginalDurationSeconds': _hasVideo
            ? _selectedVideoOriginalDurationSeconds
            : 0,
      },
      media: _media,
      preview: publishPreview,
      thumbnail: publishThumbnail,
      onProgress: (progress) {
        if (!mounted || !_submitting) return;
        if (progress < 1 && progress - _uploadProgress < 0.01) return;
        setState(() => _uploadProgress = progress);
      },
    );

    if (!mounted) return;
    if (result.error == null) {
      var authoritativeId = uploadContentIdAfterPublish(
        isEditing: _isEditing,
        originalContentId: publishContentId,
        serverContentId: result.contentId,
      );
      final validId = _isEditing ? RegExp(r'^\d+$') : RegExp(r'^\d{10}$');
      if (!validId.hasMatch(authoritativeId)) {
        final uploads = await Api.myUploads();
        for (final upload in uploads) {
          if (upload.contentId == publishContentId &&
              validId.hasMatch(upload.contentId) &&
              upload.description.trim() == _title.text.trim() &&
              upload.topic.trim() == _topic.trim()) {
            authoritativeId = upload.contentId;
            break;
          }
        }
      }
      if (!mounted) return;
      if (!validId.hasMatch(authoritativeId)) {
        setState(() => _submitting = false);
        AppNotifications.error(
          'Publish failed',
          'The server did not return a valid Content ID.',
        );
        return;
      }
      await _clearDraft();
      HomeFeedRefreshBus.requestRefresh();
      if (!mounted) return;
      setState(() => _uploadProgress = 1);
      await Future<void>.delayed(const Duration(milliseconds: 240));
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _uploadProgress = 1;
        _publishedContentId = authoritativeId;
        _showPublishedPopup = true;
        _publishedPendingApproval = result.pendingApproval;
        _publishedMessage = result.message;
      });
    } else {
      setState(() => _submitting = false);
      if (_isSubscriptionLimitError(result.error!)) {
        _showUploadContentUpgradePrompt(limitMessage: result.error);
      }
      AppNotifications.error('Publish failed', result.error!);
    }
  }

  bool _uploadContentAtLimit(Map<String, dynamic>? usage) {
    if (usage == null) return false;
    if (usage['uploadContentAtLimit'] == true ||
        usage['uploadContentDailyAtLimit'] == true ||
        usage['uploadContentTotalAtLimit'] == true) {
      return true;
    }
    bool atLimit(String countKey, String limitKey) {
      final count = num.tryParse('${usage[countKey] ?? ''}');
      final limit = num.tryParse('${usage[limitKey] ?? ''}');
      return subscriptionLimitReached(count, limit);
    }

    return atLimit('uploadContentDailyCount', 'uploadContentDailyLimit') ||
        atLimit('uploadContentTotalCount', 'uploadContentTotalLimit');
  }

  bool _videoDurationAtLimit() {
    final duration = _selectedVideoDurationSeconds;
    return _media.isNotEmpty &&
        _hasVideo &&
        duration != null &&
        duration > _videoLimitSeconds;
  }

  String _uploadContentLimitMessage(Map<String, dynamic>? usage) {
    if (usage == null) {
      return 'If you have reached your upload content limit, please subscribe to a higher plan below.';
    }
    final dailyCount = num.tryParse(
      '${usage['uploadContentDailyCount'] ?? ''}',
    );
    final dailyLimit = num.tryParse(
      '${usage['uploadContentDailyLimit'] ?? ''}',
    );
    final dailyReached =
        usage['uploadContentDailyAtLimit'] == true ||
        subscriptionLimitReached(dailyCount, dailyLimit);
    if (dailyReached && dailyLimit != null && dailyLimit > 0) {
      final limit = dailyLimit == dailyLimit.roundToDouble()
          ? '${dailyLimit.toInt()}'
          : '$dailyLimit';
      return 'Daily upload limit reached. Your plan allows $limit uploads per day. Upgrade to the next plan for a higher limit.';
    }
    final totalCount = num.tryParse(
      '${usage['uploadContentTotalCount'] ?? ''}',
    );
    final totalLimit = num.tryParse(
      '${usage['uploadContentTotalLimit'] ?? ''}',
    );
    final totalReached =
        usage['uploadContentTotalAtLimit'] == true ||
        usage['uploadContentAtLimit'] == true ||
        subscriptionLimitReached(totalCount, totalLimit);
    if (totalReached && totalLimit != null && totalLimit > 0) {
      final limit = totalLimit == totalLimit.roundToDouble()
          ? '${totalLimit.toInt()}'
          : '$totalLimit';
      return 'Upload content limit reached. Your plan allows $limit uploads in total. Upgrade to the next plan for a higher limit.';
    }
    return 'If you have reached your upload content limit, please subscribe to a higher plan below.';
  }

  void _showUploadContentUpgradePrompt({String? limitMessage}) {
    UpgradePlanSheet.show(
      context,
      subtitle: 'Subscribe to upload more content',
      limitMessage:
          limitMessage ??
          'If you have reached your upload content limit, please subscribe to a higher plan below.',
    );
  }

  void _showVideoDurationUpgradePrompt([num? actualSeconds]) {
    final actual = actualSeconds == null
        ? ''
        : ' This video is ${_formatSeconds(actualSeconds)}.';
    UpgradePlanSheet.show(
      context,
      subtitle: 'Subscribe to upload longer videos',
      limitMessage:
          'Your plan allows videos up to $_videoLimitLabel.$actual Subscribe to a higher plan for longer uploads.',
    );
  }

  String _formatSeconds(num seconds) {
    final total = seconds.round();
    final minutes = total ~/ 60;
    final secs = total % 60;
    return '$minutes:${secs.toString().padLeft(2, '0')}';
  }

  bool _isSubscriptionLimitError(String error) {
    final text = error.toLowerCase();
    return text.contains('subscription') ||
        text.contains('plan') ||
        text.contains('limit') ||
        text.contains('daily upload') ||
        text.contains('upload content');
  }

  // ---- Shared widgets ----

  BoxDecoration _panelDecoration() => BoxDecoration(
    color: _panelSoft,
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: AppColors.borderWhite10),
  );

  BoxDecoration _fieldDecoration() => BoxDecoration(
    color: _panelBlack,
    borderRadius: BorderRadius.circular(12),
    border: Border.all(color: AppColors.borderWhite10),
  );

  Widget _headingBlock(String title, String subtitle, {double titleSize = 18}) {
    final effectiveTitleSize = titleSize == 18 ? 14.0 : titleSize;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: effectiveTitleSize,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
        if (subtitle.isNotEmpty) ...[
          const SizedBox(height: 5),
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 12,
              height: 1.45,
              color: AppColors.textGray500,
            ),
          ),
        ],
      ],
    );
  }

  Widget _microLabel(String text) => Text(
    text,
    maxLines: 2,
    style: const TextStyle(
      fontSize: 9,
      letterSpacing: 1.2,
      height: 1.4,
      fontWeight: FontWeight.w600,
      color: AppColors.textGray600,
    ),
  );

  Widget _placeholderPanel(String label, {double height = 140}) {
    return Container(
      height: height,
      width: double.infinity,
      alignment: Alignment.center,
      decoration: _panelDecoration(),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 10.5,
            letterSpacing: 3,
            fontWeight: FontWeight.w600,
            color: AppColors.textGray600,
          ),
        ),
      ),
    );
  }

  Widget _tileButton(String label, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: _uploadButtonBg,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: Colors.white),
            const SizedBox(width: 10),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _miniAction(String label, VoidCallback onTap, {bool danger = false}) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 34,
        padding: const EdgeInsets.symmetric(horizontal: 13),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: danger
              ? AppColors.likeRed.withOpacity(0.10)
              : Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: danger
                ? AppColors.likeRed.withOpacity(0.32)
                : AppColors.borderWhite10,
          ),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 9,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w700,
            color: danger ? const Color(0xFFFFA1AB) : AppColors.textGray300,
          ),
        ),
      ),
    );
  }

  Widget _toggleBox(String label, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? Colors.white : AppColors.borderWhite10,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.black : AppColors.textGray300,
          ),
        ),
      ),
    );
  }

  Widget _whitePill(String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        width: double.infinity,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            letterSpacing: 1.8,
            fontWeight: FontWeight.w600,
            color: Colors.black,
          ),
        ),
      ),
    );
  }

  Widget _input(
    TextEditingController controller,
    String hint, {
    bool numeric = false,
    int? maxLength,
    ValueChanged<String>? onChanged,
  }) {
    return TextField(
      controller: controller,
      keyboardType: numeric
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      inputFormatters: [
        if (numeric) FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
        if (maxLength != null) LengthLimitingTextInputFormatter(maxLength),
      ],
      onChanged: (value) {
        onChanged?.call(value);
        setState(() {});
      },
      style: const TextStyle(fontSize: 11, color: Colors.white),
      cursorColor: _accent,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(fontSize: 11, color: AppColors.textGray600),
        filled: true,
        fillColor: _panelBlack,
        constraints: const BoxConstraints(minHeight: 44, maxHeight: 44),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _accent),
        ),
      ),
    );
  }
}

class _SubscriptionTier {
  final String label;
  final double price;
  final int minutes;
  final double affiliateCommission;

  const _SubscriptionTier({
    required this.label,
    required this.price,
    required this.minutes,
    this.affiliateCommission = 0,
  });
}

class _CommissionTier {
  final double min;
  final double max;
  final double commission;

  const _CommissionTier({
    required this.min,
    required this.max,
    required this.commission,
  });
}

class _SubscriptionTierResult {
  final bool enabled;
  final List<_SubscriptionTier> tiers;
  const _SubscriptionTierResult({required this.enabled, required this.tiers});
}

class _SubscriptionTiersSheet extends StatefulWidget {
  final bool enabled;
  final List<_SubscriptionTier> tiers;
  final List<_SubscriptionTier> savedTiers;
  final List<_CommissionTier> commissionTiers;
  const _SubscriptionTiersSheet({
    required this.enabled,
    required this.tiers,
    required this.savedTiers,
    required this.commissionTiers,
  });

  @override
  State<_SubscriptionTiersSheet> createState() =>
      _SubscriptionTiersSheetState();
}

class _SubscriptionTiersSheetState extends State<_SubscriptionTiersSheet> {
  static const _presetKey = 'googer-upload-content-subscription-packages-v2';
  late bool _enabled = widget.enabled;
  late List<TextEditingController> _priceControllers = [
    for (final tier in widget.tiers.take(3))
      TextEditingController(
        text: tier.price <= 0 ? '' : tier.price.toStringAsFixed(0),
      ),
  ];
  late List<TextEditingController> _minuteControllers = [
    for (final tier in widget.tiers.take(3))
      TextEditingController(text: '${tier.minutes <= 0 ? 10 : tier.minutes}'),
  ];
  late List<_SubscriptionTier> _savedTiers = widget.savedTiers;
  String _validationError = '';
  bool _presetSaved = false;

  @override
  void dispose() {
    for (final controller in [..._priceControllers, ..._minuteControllers]) {
      controller.dispose();
    }
    super.dispose();
  }

  void _addPlan() {
    if (_priceControllers.length >= 3) return;
    setState(() {
      _priceControllers.add(TextEditingController());
      _minuteControllers.add(TextEditingController(text: '10'));
      _enabled = true;
    });
  }

  void _removePlan(int index) {
    setState(() {
      _priceControllers.removeAt(index).dispose();
      _minuteControllers.removeAt(index).dispose();
      _enabled = _priceControllers.isNotEmpty;
      _validationError = '';
      _presetSaved = false;
    });
  }

  double _commissionFor(double price) {
    for (final tier in widget.commissionTiers) {
      if (price >= tier.min && price <= tier.max) {
        return tier.commission.clamp(0, 100).toDouble();
      }
    }
    return 0;
  }

  List<_SubscriptionTier> _currentTiers() {
    final tiers = <_SubscriptionTier>[];
    for (var i = 0; i < _priceControllers.length; i++) {
      final price = double.tryParse(_priceControllers[i].text.trim()) ?? 0;
      final minutes = int.tryParse(_minuteControllers[i].text.trim()) ?? 0;
      if (price <= 0 || minutes <= 0) continue;
      tiers.add(
        _SubscriptionTier(
          label: 'Package ${i + 1}',
          price: price,
          minutes: minutes,
          affiliateCommission: _commissionFor(price),
        ),
      );
    }
    return tiers;
  }

  String _validateTiers(List<_SubscriptionTier> tiers) {
    if (!_enabled) return '';
    if (tiers.length != _priceControllers.length) {
      return 'Enter a valid price and access duration for every package.';
    }
    if (widget.commissionTiers.isNotEmpty) {
      final supported = tiers.every(
        (package) => widget.commissionTiers.any(
          (tier) => package.price >= tier.min && package.price <= tier.max,
        ),
      );
      if (!supported) {
        final minimum = widget.commissionTiers
            .map((tier) => tier.min)
            .reduce((a, b) => a < b ? a : b);
        final maximum = widget.commissionTiers
            .map((tier) => tier.max)
            .reduce((a, b) => a > b ? a : b);
        return 'Please add a subscription package price within the available price range (R ${minimum.toStringAsFixed(0)} - R ${maximum.toStringAsFixed(0)}).';
      }
    }
    return '';
  }

  String get _liveValidation {
    if (!_enabled) return '';
    final hasInput = _priceControllers.any(
      (controller) => controller.text.trim().isNotEmpty,
    );
    if (!hasInput) return '';
    return _validateTiers(_currentTiers());
  }

  Future<void> _savePreset() async {
    final tiers = _currentTiers();
    final validation = _validateTiers(tiers);
    if (validation.isNotEmpty) {
      setState(() => _validationError = validation);
      return;
    }
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _presetKey,
      jsonEncode([
        for (final tier in tiers)
          {
            'label': tier.label,
            'price': tier.price,
            'minutes': tier.minutes,
            'affiliateCommission': tier.affiliateCommission,
          },
      ]),
    );
    if (!mounted) return;
    setState(() {
      _savedTiers = tiers;
      _validationError = '';
      _presetSaved = true;
    });
  }

  void _useSavedPreset() {
    if (_savedTiers.isEmpty) return;
    for (final controller in [..._priceControllers, ..._minuteControllers]) {
      controller.dispose();
    }
    setState(() {
      _priceControllers = [
        for (final tier in _savedTiers.take(3))
          TextEditingController(text: tier.price.toStringAsFixed(0)),
      ];
      _minuteControllers = [
        for (final tier in _savedTiers.take(3))
          TextEditingController(text: '${tier.minutes}'),
      ];
      _enabled = true;
      _validationError = '';
      _presetSaved = false;
    });
  }

  void _apply() {
    final tiers = _currentTiers();
    final validation = _validateTiers(tiers);
    if (validation.isNotEmpty) {
      setState(() => _validationError = validation);
      return;
    }
    Navigator.pop(
      context,
      _SubscriptionTierResult(
        enabled: _enabled && tiers.isNotEmpty,
        tiers: tiers,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final packageValidationMessage = _validationError.isNotEmpty
        ? _validationError
        : _liveValidation;
    return DraggableScrollableSheet(
      initialChildSize: 0.98,
      maxChildSize: 1,
      minChildSize: 0.60,
      builder: (context, controller) => Container(
        decoration: BoxDecoration(
          color: const Color(0xFF101115),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 18, 14, 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Subscription Access Packages',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          'Add up to 3 custom packages with price and minutes. Subscription commission is applied automatically based on the selected price.',
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.45,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.maybePop(context),
                    child: Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withOpacity(0.06),
                      ),
                      child: const Icon(
                        Ionicons.close_outline,
                        color: Colors.white,
                        size: 21,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: AppColors.borderWhite10),
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
                children: [
                  GestureDetector(
                    onTap: () => setState(() => _enabled = !_enabled),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            key: const Key('subscription-access-checkbox'),
                            _enabled
                                ? Ionicons.checkbox
                                : Ionicons.square_outline,
                            color: Colors.white,
                            size: 22,
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Text(
                              'Enable Subscription Access',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Create Subscription Tiers',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      _sheetAction('+ Add Plan', _addPlan, danger: true),
                    ],
                  ),
                  if (_savedTiers.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: _sheetAction('USE SAVED', _useSavedPreset),
                    ),
                  ],
                  const SizedBox(height: 18),
                  Text(
                    'PLANS ${_priceControllers.length}/3',
                    style: const TextStyle(
                      fontSize: 10,
                      letterSpacing: 1.8,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textGray600,
                    ),
                  ),
                  const SizedBox(height: 12),
                  for (var i = 0; i < _priceControllers.length; i++)
                    _tierCard(i),
                  if (packageValidationMessage.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        packageValidationMessage,
                        style: const TextStyle(
                          fontSize: 10,
                          height: 1.35,
                          color: Color(0xFFFF7B86),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(22, 14, 22, 20),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.borderWhite10)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sheetAction(
                    _presetSaved ? 'SAVED' : 'SAVE FOR FUTURE',
                    _savePreset,
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _sheetAction('CANCEL', () => Navigator.maybePop(context)),
                      const SizedBox(width: 10),
                      Expanded(child: _applyButton()),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tierCard(int index) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'PACKAGE ${index + 1}',
                  style: const TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.6,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textGray500,
                  ),
                ),
              ),
              _sheetAction('REMOVE', () => _removePlan(index), danger: true),
            ],
          ),
          const SizedBox(height: 14),
          _sheetField('PRICE', _priceControllers[index], hint: '300'),
          const SizedBox(height: 12),
          _sheetField('MINUTES', _minuteControllers[index], hint: '10'),
        ],
      ),
    );
  }

  Widget _sheetField(
    String label,
    TextEditingController controller, {
    String? hint,
  }) {
    return TextField(
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
      onChanged: (_) => setState(() {
        _validationError = '';
        _presetSaved = false;
      }),
      style: const TextStyle(fontSize: 12, color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        hintStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppColors.textGray600,
        ),
        labelStyle: const TextStyle(
          fontSize: 9,
          letterSpacing: 1.4,
          fontWeight: FontWeight.w700,
          color: AppColors.textGray600,
        ),
        filled: true,
        fillColor: Colors.black,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 12,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
      ),
    );
  }

  Widget _sheetAction(String label, VoidCallback onTap, {bool danger = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: danger
              ? AppColors.likeRed.withOpacity(0.10)
              : Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: danger
                ? AppColors.likeRed.withOpacity(0.35)
                : AppColors.borderWhite10,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w700,
            color: danger ? const Color(0xFFFFA1AB) : AppColors.textGray300,
          ),
        ),
      ),
    );
  }

  Widget _applyButton() {
    final disabled = _liveValidation.isNotEmpty;
    return GestureDetector(
      key: const Key('subscription-packages-apply'),
      onTap: disabled ? null : _apply,
      child: Container(
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: disabled ? const Color(0xFF8A8A8D) : Colors.white,
          borderRadius: BorderRadius.circular(13),
        ),
        child: Text(
          'APPLY PACKAGES',
          style: TextStyle(
            fontSize: 10,
            letterSpacing: 1.6,
            fontWeight: FontWeight.w800,
            color: disabled ? const Color(0xFF25262A) : Colors.black,
          ),
        ),
      ),
    );
  }
}
