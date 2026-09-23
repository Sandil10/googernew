import 'dart:convert';
import 'dart:math';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../api/api.dart';
import '../../services/app_notifications.dart';
import '../../theme/colors.dart';
import '../../util/ad_countries.dart';
import '../../util/reach_calc.dart';
import '../../util/upload_picker.dart';
import '../../util/subscription_limits.dart';
import '../../util/video_trim.dart';
import '../../widgets/app_back_button.dart';
import '../../widgets/upgrade_plan_sheet.dart';
import '../top_up_screen.dart';

/// Shared campaign editor used by every ad-campaign sub-screen.
///
/// Rebuilt to match the web builder (`app/dashboard/ad-campaign/components/
/// CampaignEditor.tsx`) section for section: Apply Link → Select Ad Media →
/// Description → Call to Action → Budget → Duration → Location → Gender → Age →
/// Interest Topics → Placements → actions → Ad Preview → Order Summary.
///
/// Sections are gated per campaign type rather than per screen, because the web
/// renders one component for all of them too — see [_isProductPromote],
/// [_isProfilePromote] and [_isUploadContent].
class CampaignEditor extends StatefulWidget {
  final String campaignType;
  final String title;
  final String subtitle;
  final IconData accentIcon;
  final bool videoOnly;
  final bool showDescription;
  final bool showCta;
  final bool showLink;
  final String? linkLabel;
  final String? linkHint;
  final bool showContentAccess;
  final bool showSubscription;
  final bool alwaysFree;

  const CampaignEditor({
    super.key,
    required this.campaignType,
    required this.title,
    required this.subtitle,
    required this.accentIcon,
    this.videoOnly = false,
    this.showDescription = false,
    this.showCta = false,
    this.showLink = false,
    this.linkLabel,
    this.linkHint,
    this.showContentAccess = false,
    this.showSubscription = false,
    this.alwaysFree = false,
  });

  /// The five builder configurations, in one place so the type tabs and the
  /// thin entry screens cannot drift apart.
  static CampaignEditor forType(String key) {
    switch (key) {
      case CampaignTypeTab.productPromote:
        return const CampaignEditor(
          campaignType: 'Product Promote',
          title: 'Product Promote',
          subtitle: 'Boost a product listing to more buyers',
          accentIcon: Ionicons.pricetags_outline,
          showLink: true,
        );
      case CampaignTypeTab.profilePromote:
        return const CampaignEditor(
          campaignType: 'Profile Promote',
          title: 'Profile Promote',
          subtitle: 'Grow your reach and gain new followers',
          accentIcon: Ionicons.person_circle_outline,
          showLink: true,
          alwaysFree: true,
        );
      case 'flash-content':
        return const CampaignEditor(
          campaignType: 'Flash Content',
          title: 'Flash Content',
          subtitle: 'Publish a short flash video promo',
          accentIcon: Ionicons.flash_outline,
          videoOnly: true,
          showContentAccess: true,
        );
      case 'upload-content':
        return const CampaignEditor(
          campaignType: 'Vault Content',
          title: 'Upload Content',
          subtitle: 'Sell premium vault content with previews',
          accentIcon: Ionicons.lock_closed_outline,
          showDescription: true,
          showContentAccess: true,
          showSubscription: true,
        );
      case CampaignTypeTab.photoVideo:
      default:
        return const CampaignEditor(
          campaignType: 'Photo and Video',
          title: 'Photo and Video',
          subtitle: 'Promote a photo or video across the feed',
          accentIcon: Ionicons.images_outline,
          showDescription: true,
          showCta: true,
          showLink: true,
        );
    }
  }

  @override
  State<CampaignEditor> createState() => _CampaignEditorState();
}

/// The three types that appear in the topbar tab strip. Flash and Vault content
/// are separate flows on the web and get no tab here either.
class CampaignTypeTab {
  const CampaignTypeTab._();
  static const photoVideo = 'photo-video';
  static const productPromote = 'product-promote';
  static const profilePromote = 'profile-promote';

  static const labels = <String, String>{
    photoVideo: 'PHOTO & VIDEO',
    productPromote: 'PRODUCT PROMOTE',
    profilePromote: 'PROFILE PROMOTE',
  };

  static const icons = <String, IconData>{
    photoVideo: Ionicons.images_outline,
    productPromote: Ionicons.pricetags_outline,
    profilePromote: Ionicons.person_circle_outline,
  };
}

class _CampaignEditorState extends State<CampaignEditor> {
  // Web parity: rose-500 drives every selected control (gender, age, interests,
  // placements) and its glow. It sits a shade pink of the app's #EF4444, which
  // is what the screenshots show.
  static const _accent = Color(0xFFF43F5E);
  static const _publishRed = Color(0xFFF87171);
  final ScrollController _pageScrollController = ScrollController();

  // ---- Apply Link ----
  final _link = TextEditingController();
  String _activeLink = '';
  Map<String, dynamic>? _linkedProduct;

  // ---- Description / CTA ----
  final _description = TextEditingController();
  static const _descriptionLimit = 50;
  String _ctaTopic = 'Visit';
  final _ctaValue = TextEditingController();

  // ---- Media ----
  List<ApiUploadFile> _media = const [];
  ApiUploadFile? _preview;
  bool _trimming = false;

  // ---- Vault / Flash only ----
  final _price = TextEditingController(text: '500');
  final _previewSeconds = TextEditingController(text: '10');
  bool _allowComments = true;
  int _uploadVideoLimitSeconds = 60;
  double? _selectedUploadVideoDurationSeconds;

  // ---- Budget / duration ----
  List<ReachTier> _tiers = const [];
  bool _tiersLoaded = false;

  /// Null until a budget is chosen. Profile Promote deliberately starts null so
  /// the total reads "—" until a package chip is picked.
  int? _budget;
  bool _budgetEditing = false;
  final _budgetInput = TextEditingController();
  int _durationDays = 1;

  final _promoCode = TextEditingController();
  bool _promoAdded = false;
  bool _promoValidating = false;
  String _promoError = '';
  Map<String, dynamic>? _promoDiscount;

  double _walletBalance = 0;
  bool _walletLoaded = false;
  bool _insufficientDialogQueued = false;

  // ---- Targeting ----
  final Set<String> _countryCodes = <String>{};

  /// ISO-2 codes the admin allows for this ad type. Null means the setting is
  /// unavailable, which the web reads as unrestricted — distinct from an empty
  /// list, which means nothing is allowed.
  List<String>? _allowedCountryCodes;

  String _gender = 'All';
  int _ageMin = 18;
  int _ageMax = 65;

  final Set<String> _interests = <String>{};
  Set<String> _draftInterests = <String>{};
  bool _interestsOpen = false;

  // Web starts with every currently available placement selected. "All" is
  // persisted alongside the concrete values so the summary and edit draft use
  // the same contract as AdsCampaignEditor.
  final Set<String> _placements = {'All', 'Goog Msg'};
  bool _placementsOpen = false;

  // ---- Profile Promote ----
  bool _acceptedNonRefundable = false;
  bool _profileItemsLoading = false;
  String _profileItemSource = 'products';
  List<Map<String, dynamic>> _profileAvailableItems = const [];
  final List<Map<String, dynamic>> _profileFeaturedItems = [];

  // ---- Preview ----
  String _previewMode = 'mobile';

  bool _submitting = false;

  static const _genders = ['All', 'Male', 'Female'];
  static const _interestLimit = 10;
  static const _interestOptions = [
    'Fashion',
    'Electronics',
    'Beauty',
    'Fitness',
    'Food',
    'Travel',
    'Gaming',
    'Education',
    'Business',
    'Sports',
    'Home',
    'Music',
    'Movies',
    'Automotive',
    'Health',
    'Technology',
    'Finance',
    'Real Estate',
    'Events',
    'Shopping',
  ];

  /// Only "Goog Msg" is live; the rest are shown greyed so the surface list
  /// matches the web's roadmap.
  static const _placementOptions = <String, bool>{
    'All': true,
    'Goog Msg': true,
    'Feed': false,
    'Stories': false,
    'Reels': false,
    'Search': false,
    'Profile': false,
    'Marketplace': false,
  };
  static const _selectablePlacements = ['Goog Msg'];

  static const _ctaOptions = [
    'Visit',
    'Learn More',
    'Shop Now',
    'Buy Now',
    'Call Now',
    'WhatsApp',
    'Message',
    'Sign Up',
    'Contact Us',
    'Apply Now',
    'Book Now',
    'No Button',
  ];
  static const _ctaFieldLabels = <String, String>{
    'Visit': 'Website link',
    'Learn More': 'Website link',
    'Shop Now': 'Product or website link',
    'Buy Now': 'Purchase link',
    'Call Now': 'Phone number',
    'WhatsApp': 'WhatsApp number or link',
    'Message': '',
    'Sign Up': 'Registration link',
    'Contact Us': 'Contact link, email, or phone number',
    'Apply Now': 'Application link',
    'Book Now': 'Booking link',
    'No Button': '',
  };
  static const _ctaFieldPlaceholders = <String, String>{
    'Visit': 'https://example.com',
    'Learn More': 'https://example.com/learn-more',
    'Shop Now': 'Product or website URL',
    'Buy Now': 'Purchase URL',
    'Call Now': '+1 555 000 0000',
    'WhatsApp': 'WhatsApp number or https://wa.me/...',
    'Message': '',
    'Sign Up': 'Registration URL',
    'Contact Us': 'Contact page, email, or phone',
    'Apply Now': 'Application URL',
    'Book Now': 'Booking URL',
    'No Button': '',
  };

  // ---- Type predicates ----

  String get _type => widget.campaignType.toLowerCase();
  bool get _isProductPromote => _type.contains('product');
  bool get _isProfilePromote => _type.contains('profile');
  bool get _isUploadContent =>
      _type.contains('vault') || _type.contains('flash');
  bool get _isPhotoVideo =>
      !_isProductPromote && !_isProfilePromote && !_isUploadContent;

  /// Which tab is raised, or null for the flash/vault flows that have no tab.
  String? get _activeTab {
    if (_isProductPromote) return CampaignTypeTab.productPromote;
    if (_isProfilePromote) return CampaignTypeTab.profilePromote;
    if (_isPhotoVideo) return CampaignTypeTab.photoVideo;
    return null;
  }

  String get _reachAdType => _isProductPromote
      ? 'product_promote_ad'
      : _isProfilePromote
      ? 'profile_promote_ad'
      : 'photo_video_ad';

  String get _allowedCountriesKey => _isProductPromote
      ? 'product_promote'
      : _isProfilePromote
      ? 'profile_promote'
      : 'photo_video';

  String get _campaignPath => _isProductPromote
      ? '/ad-campaign/product-promote'
      : _isProfilePromote
      ? '/ad-campaign/profile-promote'
      : _isUploadContent
      ? (_type.contains('flash')
            ? '/ad-campaign/flash-content'
            : '/ad-campaign/upload-content')
      : '/ad-campaign/photo-video';

  String get _profileLink => 'https://googer.site/@${Api.username}';
  String get _draftKey => 'googer-ad-draft-${_type.replaceAll(' ', '-')}-v1';

  @override
  void initState() {
    super.initState();
    if (_isProfilePromote) {
      _link.text = _profileLink;
      _loadProfileFeaturedItems();
    }
    _loadTiers();
    _loadAllowedCountries();
    _loadWallet();
    _restoreDraft();
    if (_isUploadContent) _loadUploadPlanLimit();
  }

  @override
  void dispose() {
    _pageScrollController.dispose();
    _description.dispose();
    _link.dispose();
    _ctaValue.dispose();
    _price.dispose();
    _previewSeconds.dispose();
    _budgetInput.dispose();
    _promoCode.dispose();
    super.dispose();
  }

  // ---- Loaders ----

  Future<void> _loadTiers() async {
    final rows = await Api.reachTiers(_reachAdType);
    if (!mounted) return;
    final tiers = rows.map(ReachTier.fromJson).toList()
      ..sort((a, b) => a.budgetFrom.compareTo(b.budgetFrom));
    setState(() {
      _tiers = tiers;
      _tiersLoaded = true;
      if (tiers.isEmpty) {
        _budget = null;
        return;
      }
      if (_budget != null) {
        final restoredTier = findTier(tiers, _budget!.toDouble());
        if (restoredTier != null) return;
        _budget = null;
      }
      if (_isProfilePromote) {
        // Packages are an explicit choice — no auto-select, so the total shows
        // "—" until the user commits.
        _budget = null;
        return;
      }
      // Photo/Video and Product start at the global minimum so Order Summary
      // and the reach estimate are populated on first paint.
      final first = tiers.first;
      _budget = first.budgetFrom.round();
      _durationDays = first.minDays;
    });
  }

  Future<void> _loadAllowedCountries() async {
    final codes = await Api.adAllowedCountries(_allowedCountriesKey);
    if (!mounted) return;
    setState(() {
      _allowedCountryCodes = codes;
      // Drop anything already picked that the admin has since disabled.
      if (codes != null) {
        _countryCodes.removeWhere((code) => !codes.contains(code));
      }
    });
  }

  Future<void> _loadWallet() async {
    await Api.refreshProfile();
    if (!mounted) return;
    setState(() {
      _walletBalance = Api.balance;
      _walletLoaded = true;
    });
  }

  Future<void> _loadProfileFeaturedItems() async {
    setState(() => _profileItemsLoading = true);
    final productsFuture = Api.myProducts();
    final uploadsFuture = Api.myUploads();
    final productRows = await productsFuture;
    final uploadRows = await uploadsFuture;
    if (!mounted) return;
    final products = productRows
        .where((item) => item['is_sponsored'] != true)
        .map(
          (item) => <String, dynamic>{
            ...item,
            '__profilePromoteType': 'product',
          },
        );
    final uploads = uploadRows
        .where((item) => item.status.toLowerCase() == 'approved')
        .map(
          (item) => <String, dynamic>{
            'id': item.id,
            'content_id': item.contentId,
            'title': item.description.trim().isNotEmpty
                ? item.description
                : item.topic,
            'image_url': item.thumbnail,
            'thumbnail_url': item.thumbnail,
            'media_url': item.mediaUrl,
            'content_type': item.type,
            'media_type': item.mediaType,
            'content_access_mode': item.contentAccessMode,
            'preview_mode': item.previewMode,
            'price': item.coins,
            '__profilePromoteType': 'upload',
          },
        );
    setState(() {
      _profileAvailableItems = [...products, ...uploads];
      _profileItemsLoading = false;
    });
  }

  Future<void> _restoreDraft() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_draftKey);
    if (raw == null || raw.trim().isEmpty || !mounted) return;
    try {
      final draft = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      setState(() {
        _activeLink = '${draft['activeLink'] ?? _activeLink}';
        _link.text = '${draft['linkInput'] ?? _activeLink}';
        _description.text = '${draft['description'] ?? ''}'.characters
            .take(_descriptionLimit)
            .toString();
        final cta = '${draft['ctaTopic'] ?? ''}';
        if (_ctaOptions.contains(cta)) _ctaTopic = cta;
        _ctaValue.text = '${draft['ctaValue'] ?? ''}';
        final budget = int.tryParse('${draft['budget'] ?? ''}');
        if (budget != null) _budget = budget;
        _durationDays = int.tryParse('${draft['durationDays'] ?? ''}') ?? 1;
        final countryCodes = draft['selectedLocationCodes'];
        if (countryCodes is List) {
          _countryCodes
            ..clear()
            ..addAll(countryCodes.map((value) => '$value'));
        }
        final gender = '${draft['genderTarget'] ?? ''}';
        if (_genders.contains(gender)) _gender = gender;
        _ageMin = (int.tryParse('${draft['ageMin'] ?? ''}') ?? 18).clamp(
          18,
          65,
        );
        _ageMax = (int.tryParse('${draft['ageMax'] ?? ''}') ?? 65).clamp(
          18,
          65,
        );
        final interests = draft['selectedInterestTopics'];
        if (interests is List) {
          _interests
            ..clear()
            ..addAll(
              interests
                  .map((value) => '$value')
                  .where(_interestOptions.contains)
                  .take(_interestLimit),
            );
        }
        final placements = draft['selectedPlacements'];
        if (placements is List) {
          _placements
            ..clear()
            ..addAll(
              placements
                  .map((value) => '$value')
                  .where(_placementOptions.containsKey),
            );
        }
        _acceptedNonRefundable = draft['acceptedNonRefundable'] == true;
      });
    } catch (_) {
      // A malformed local draft must never block the campaign editor.
    }
  }

  Future<void> _saveDraftAndExit() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _draftKey,
      jsonEncode({
        'activeLink': _activeLink,
        'linkInput': _link.text.trim(),
        'description': _description.text.trim(),
        'ctaTopic': _ctaTopic,
        'ctaValue': _ctaValue.text.trim(),
        'budget': _budget,
        'durationDays': _durationDays,
        'selectedLocationCodes': _countryCodes.toList(),
        'genderTarget': _gender,
        'ageMin': _ageMin,
        'ageMax': _ageMax,
        'selectedInterestTopics': _interests.toList(),
        'selectedPlacements': _placements.toList(),
        'acceptedNonRefundable': _acceptedNonRefundable,
      }),
    );
    if (!mounted) return;
    Navigator.pop(context);
    Navigator.maybePop(context);
  }

  Future<void> _discardDraftAndExit() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_draftKey);
    if (!mounted) return;
    Navigator.pop(context);
    Navigator.maybePop(context);
  }

  void _showCancelConfirmation() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF050505),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Ionicons.document_text_outline,
                size: 25,
                color: _accent,
              ),
              const SizedBox(height: 9),
              const Text(
                'CANCEL AD',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 1.5,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Save this form as a draft or close it right away.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 10.5, color: AppColors.textGray500),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _cancelSheetButton(
                      'SAVE DRAFT',
                      false,
                      _saveDraftAndExit,
                    ),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: _cancelSheetButton(
                      'DISCARD',
                      true,
                      _discardDraftAndExit,
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

  Widget _cancelSheetButton(
    String label,
    bool destructive,
    Future<void> Function() onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: destructive ? _accent : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(11),
          border: destructive
              ? null
              : Border.all(color: AppColors.borderWhite10),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 9,
            letterSpacing: 1.2,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  Future<void> _loadUploadPlanLimit() async {
    final responses = await Future.wait([Api.myPlan(), Api.mySubscription()]);
    if (!mounted) return;
    final plan = responses[0];
    final subscription = responses[1];
    final extra = _extraOf(plan);
    final subscribed =
        subscription != null &&
        '${subscription['status'] ?? ''}'.toLowerCase() == 'active';
    final fallbackMinutes = subscribed ? 5 : 1;
    final minutes =
        double.tryParse('${extra['content_video_limit_minutes'] ?? ''}') ??
        fallbackMinutes.toDouble();
    setState(() {
      _uploadVideoLimitSeconds = max(1, (minutes * 60).round());
    });
  }

  Map<String, dynamic> _extraOf(Map<String, dynamic>? row) {
    final raw = row?['extra'];
    if (raw is Map) return Map<String, dynamic>.from(raw);
    if (raw is String && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }
    return const {};
  }

  // ---- Derived budget / duration / reach ----

  List<ReachTier> get _packageTiers => _tiers;

  int get _budgetMin =>
      _tiers.isEmpty ? 0 : _tiers.map((t) => t.budgetFrom).reduce(min).round();
  int get _budgetMax =>
      _tiers.isEmpty ? 0 : _tiers.map((t) => t.budgetTo).reduce(max).round();

  ReachTier? get _activeTier {
    final budget = _budget;
    if (budget == null || _tiers.isEmpty) return null;
    if (_isProfilePromote) {
      for (final tier in _tiers) {
        if (tier.budgetFrom.round() == budget) return tier;
      }
      return null;
    }
    return findTier(_tiers, budget.toDouble());
  }

  /// A tier whose min and max days are equal has nothing to slide, and any
  /// non-reach promo pins the duration too.
  bool get _durationLocked {
    final tier = _activeTier;
    if (tier != null && tier.minDays == tier.maxDays) return true;
    return _promoAdded && _promoDiscountType != 'reach';
  }

  int get _tierMinDays => _activeTier?.minDays ?? 1;
  int get _tierMaxDays {
    final promoMax = _promoMaxDays;
    if (promoMax != null) return promoMax;
    return _activeTier?.maxDays ?? 30;
  }

  String? get _promoDiscountType =>
      _promoDiscount?['discount_type']?.toString();

  double get _promoDiscountValue =>
      double.tryParse('${_promoDiscount?['discount_value'] ?? ''}') ?? 0;

  int? get _promoMaxDays {
    if (!_promoAdded || _promoDiscountType != 'reach') return null;
    final raw = _promoDiscount?['promo_max_days'];
    if (raw == null) return null;
    return int.tryParse('$raw');
  }

  int? get _promoReachCap {
    if (!_promoAdded || _promoDiscountType != 'reach') return null;
    final raw = _promoDiscount?['reach_cap'];
    if (raw == null) return null;
    return int.tryParse('$raw');
  }

  /// Profile Promote with any promo is free for a fixed number of days; a
  /// "days" promo adds bonus days on top of the chosen duration.
  int get _effectiveDurationDays {
    if (_isProfilePromote && _promoAdded) {
      final raw =
          _promoDiscount?['promo_max_days'] ??
          _promoDiscount?['discount_value'];
      final days = int.tryParse('${raw ?? ''}') ?? 0;
      return max(1, days);
    }
    if (_promoAdded && _promoDiscountType == 'days') {
      return _durationDays + _promoDiscountValue.round();
    }
    return _durationDays;
  }

  /// A "reach" promo replaces the budget outright for reach purposes.
  int? get _effectiveBudget {
    if (_promoAdded && _promoDiscountType == 'reach') {
      return _promoDiscountValue.round();
    }
    return _budget;
  }

  bool get _showReach {
    if (_isProfilePromote) return false;
    final tier = _activeTier;
    if (_promoAdded && _promoDiscountType == 'reach') return true;
    return tier != null && (tier.minMultiplier > 0 || tier.maxMultiplier > 0);
  }

  ReachEstimate? get _reachEstimate {
    // A reach promo carries backend-computed values; use them verbatim.
    if (_promoAdded && _promoDiscountType == 'reach') {
      final minBonus = _promoDiscount?['min_reach_bonus'];
      final maxBonus = _promoDiscount?['max_reach_bonus'];
      if (minBonus != null && maxBonus != null) {
        return ReachEstimate(
          int.tryParse('$minBonus') ?? 0,
          int.tryParse('$maxBonus') ?? 0,
          _promoReachCap,
        );
      }
    }
    final budget = _effectiveBudget;
    if (!_showReach || budget == null) return null;
    return calcReach(_tiers, budget.toDouble(), promoReachCap: _promoReachCap);
  }

  /// What actually leaves the wallet, after any promo.
  double get _payableAmount {
    final budget = _budget;
    if (budget == null) return 0;
    if (!_promoAdded || _promoDiscount == null) return budget.toDouble();
    if (_isProfilePromote) return 0; // any promo makes Profile Promote free
    switch (_promoDiscountType) {
      case 'rupee':
        return max(0, budget - _promoDiscountValue);
      case 'reach':
        return 0;
      default:
        return budget.toDouble(); // "days" promos still charge the full budget
    }
  }

  bool get _insufficientBalance =>
      !_isUploadContent &&
      _walletLoaded &&
      _budget != null &&
      _payableAmount > _walletBalance;

  // ---- Formatting ----

  static String _thousands(num value) {
    final digits = value.round().abs().toString();
    final buffer = StringBuffer(value < 0 ? '-' : '');
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
      buffer.write(digits[i]);
    }
    return buffer.toString();
  }

  /// Web `formatReachCount`: exact below 1,000, then one decimal of "K".
  static String _reachCount(int value) {
    if (value < 1000) return _thousands(value);
    final rounded = (value / 100).round() / 10;
    return rounded == rounded.roundToDouble()
        ? '${rounded.toStringAsFixed(0)}K'
        : '${rounded.toStringAsFixed(1)}K';
  }

  String get _ageSummary =>
      _ageMin == 18 && _ageMax == 65 ? 'All' : '$_ageMin-$_ageMax';

  String get _durationSummary {
    final days = _effectiveDurationDays;
    return '$days ${days == 1 ? 'day' : 'days'}';
  }

  // ---- Build ----

  @override
  Widget build(BuildContext context) {
    if (_insufficientBalance && !_insufficientDialogQueued) {
      _insufficientDialogQueued = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showInsufficientFundsDialog();
      });
    }
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        bottom: false,
        child: ListView(
          key: ValueKey('campaign-scroll-${widget.campaignType}'),
          controller: _pageScrollController,
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            if (_activeTab != null) _typeTabs(),
            _pageHeader(),
            const SizedBox(height: 6),
            ..._sections(),
          ],
        ),
      ),
    );
  }

  Future<void> _showInsufficientFundsDialog() async {
    final missing = max(0, _payableAmount - _walletBalance);
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.78),
      builder: (dialogContext) => Dialog(
        backgroundColor: const Color(0xFF25070B),
        insetPadding: const EdgeInsets.symmetric(horizontal: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xAA8E1D2A)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 15, 24, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Text(
                      'INSUFFICIENT FUNDS',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 5,
                        color: Color(0xFFFF7381),
                      ),
                    ),
                  ),
                  Transform.translate(
                    offset: const Offset(10, -3),
                    child: InkWell(
                      key: const Key('close-insufficient-funds'),
                      onTap: () => Navigator.pop(dialogContext),
                      borderRadius: BorderRadius.circular(18),
                      child: Container(
                        width: 35,
                        height: 35,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          color: Color(0xFF5A141C),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Ionicons.close,
                          size: 16,
                          color: Color(0xFFFFC1C7),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              Text(
                'MISSING: R ${_thousands(missing)}',
                style: const TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 2.6,
                  color: Color(0xFFFF8B96),
                ),
              ),
              const SizedBox(height: 22),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const TopUpScreen()),
                    );
                  },
                  style: OutlinedButton.styleFrom(
                    backgroundColor: const Color(0xFF5C1118),
                    foregroundColor: const Color(0xFFFFB5BD),
                    side: const BorderSide(color: Color(0xFFB52A38)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text(
                    'TOP UP WALLET',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 3,
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

  List<Widget> _sections() {
    final gap = const SizedBox(height: 10);
    return [
      if (widget.showLink || _isProductPromote) ...[
        _padded(_applyLinkSection()),
        gap,
      ],
      if (_isProfilePromote && _activeLink.isNotEmpty) ...[
        _padded(_profileFeaturedSection()),
        gap,
      ],
      if (_isPhotoVideo) ...[
        _padded(_selectAdMediaSection()),
        gap,
        _padded(_descriptionSection()),
        gap,
        _padded(_ctaSection()),
        gap,
      ],
      if (_isUploadContent) ...[
        _padded(_uploadMediaSection()),
        gap,
        if (widget.showDescription) ...[_padded(_descriptionSection()), gap],
        if (widget.showContentAccess) ...[_padded(_contentAccessCard()), gap],
        if (widget.showSubscription) ...[_padded(_subscriptionCard()), gap],
      ],
      if (!_isUploadContent) ...[_padded(_budgetDurationSection()), gap],
      _padded(_locationSection()),
      gap,
      _padded(_genderSection()),
      gap,
      _padded(_ageSection()),
      gap,
      _padded(_interestSection()),
      gap,
      _padded(_placementsSection()),
      gap,
      if (_isProfilePromote && !_promoAdded) ...[
        _padded(_nonRefundableNotice()),
        gap,
      ],
      _padded(_actionsRow()),
      const SizedBox(height: 18),
      if (!_isUploadContent) ...[
        _padded(_adPreviewSection()),
        gap,
        _padded(_orderSummarySection()),
      ],
    ];
  }

  Widget _padded(Widget child) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 12),
    child: child,
  );

  // ---- Chrome ----

  /// Horizontal tab strip. It scrolls and is deliberately allowed to run off
  /// the right edge on a phone, as the web does.
  Widget _typeTabs() {
    final active = _activeTab;
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 10),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: CampaignTypeTab.labels.entries.map((entry) {
            final selected = entry.key == active;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: selected ? null : () => _switchType(entry.key),
                behavior: HitTestBehavior.opaque,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  height: 36,
                  padding: const EdgeInsets.symmetric(horizontal: 13),
                  decoration: BoxDecoration(
                    color: selected
                        ? Colors.white.withOpacity(0.07)
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: selected
                          ? AppColors.borderWhite10
                          : Colors.transparent,
                    ),
                    boxShadow: selected
                        ? const [
                            BoxShadow(
                              color: Colors.black54,
                              blurRadius: 18,
                              offset: Offset(0, 8),
                            ),
                          ]
                        : null,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        CampaignTypeTab.icons[entry.key],
                        size: 15,
                        color: selected ? Colors.white : AppColors.textGray600,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        entry.value,
                        style: TextStyle(
                          fontSize: 9,
                          letterSpacing: 1.1,
                          fontWeight: FontWeight.w500,
                          color: selected
                              ? Colors.white
                              : AppColors.textGray600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  /// Swapping tabs replaces the route rather than stacking one builder on
  /// another, so Back still leaves the campaign flow in one step.
  void _switchType(String key) {
    Navigator.pushReplacement(
      context,
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => CampaignEditor.forType(key),
        transitionDuration: Duration.zero,
        reverseTransitionDuration: Duration.zero,
      ),
    );
  }

  Widget _pageHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppBackButton(),
          const SizedBox(height: 8),
          const Text(
            'AD BAR',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 2.4,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            widget.title,
            style: const TextStyle(
              fontSize: 21,
              height: 1.15,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 10),
        ],
      ),
    );
  }

  // ---- 4.1 Apply Link ----

  Widget _applyLinkSection() {
    final heading = _isProfilePromote ? 'Share Profile' : 'Apply Link';
    final sub = _isProfilePromote
        ? 'Add your public profile link'
        : _isProductPromote
        ? 'Link a product to promote'
        : 'Add landing destination';

    return _plainSection(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHead(
            heading,
            sub,
            trailing: Icon(
              _isProductPromote
                  ? Ionicons.cube_outline
                  : _isProfilePromote
                  ? Ionicons.person_outline
                  : Ionicons.link_outline,
              size: 17,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 12),
          if (_isProductPromote) _productSearchField() else _linkField(),
          const SizedBox(height: 12),
          _whitePillButton('APPLY', _applyLink),
          if (_isProfilePromote) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _outlineButton(
                    'COPY LINK',
                    Ionicons.copy_outline,
                    _copyProfileLink,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _outlineButton(
                    'USE MY PROFILE',
                    Ionicons.person_outline,
                    _useMyProfile,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _linkField() {
    return _textField(
      controller: _link,
      hint: widget.linkHint ?? 'https://your-landing-page.com',
      keyboard: TextInputType.url,
    );
  }

  /// Product Promote swaps the URL box for a product search that resolves
  /// against the seller's own listings.
  Widget _productSearchField() {
    final product = _linkedProduct;
    return GestureDetector(
      onTap: _openProductPicker,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.2),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          children: [
            const Icon(
              Ionicons.search_outline,
              size: 16,
              color: AppColors.textGray500,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                product == null
                    ? 'Search goog'
                    : '${product['title'] ?? product['name'] ?? 'Product'}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: product == null
                      ? FontWeight.w400
                      : FontWeight.w500,
                  color: product == null ? AppColors.textGray600 : Colors.white,
                ),
              ),
            ),
            const Icon(
              Ionicons.chevron_forward,
              size: 15,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }

  Widget _profileFeaturedSection() {
    final visible = _profileAvailableItems
        .where((item) {
          final type = '${item['__profilePromoteType'] ?? 'product'}';
          return _profileItemSource == 'contents'
              ? type == 'upload'
              : type == 'product';
        })
        .toList(growable: false);
    return _plainSection(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _profileSourceButton('products', 'Featured Products'),
              const SizedBox(width: 5),
              GestureDetector(
                onTap: () => setState(
                  () => _profileItemSource = _profileItemSource == 'products'
                      ? 'contents'
                      : 'products',
                ),
                child: Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.06),
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: const Icon(
                    Ionicons.swap_horizontal,
                    size: 15,
                    color: AppColors.textGray400,
                  ),
                ),
              ),
              const SizedBox(width: 5),
              _profileSourceButton('contents', 'Featured Contents'),
            ],
          ),
          const SizedBox(height: 7),
          Text(
            'Select any 3 items to feature in this ad. '
            '(${_profileFeaturedItems.length}/3)',
            style: const TextStyle(fontSize: 9.5, color: AppColors.textGray500),
          ),
          const SizedBox(height: 10),
          if (_profileItemsLoading)
            const SizedBox(
              height: 68,
              child: Center(
                child: SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            )
          else if (visible.isEmpty)
            const SizedBox(
              height: 68,
              child: Center(
                child: Text(
                  'NO ITEMS AVAILABLE',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.2,
                    color: AppColors.textGray600,
                  ),
                ),
              ),
            )
          else
            SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: visible.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, index) => _profileItemTile(visible[index]),
              ),
            ),
        ],
      ),
    );
  }

  Widget _profileSourceButton(String value, String label) {
    final selected = _profileItemSource == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _profileItemSource = value),
        child: Container(
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(selected ? 0.08 : 0.03),
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.white : AppColors.textGray500,
            ),
          ),
        ),
      ),
    );
  }

  Widget _profileItemTile(Map<String, dynamic> item) {
    final key = _profileItemKey(item);
    final selected = _profileFeaturedItems.any(
      (current) => _profileItemKey(current) == key,
    );
    final image = _profileItemImage(item);
    return GestureDetector(
      onTap: () {
        setState(() {
          final existingIndex = _profileFeaturedItems.indexWhere(
            (current) => _profileItemKey(current) == key,
          );
          if (existingIndex >= 0) {
            _profileFeaturedItems.removeAt(existingIndex);
          } else if (_profileFeaturedItems.length < 3) {
            _profileFeaturedItems.add(item);
          } else {
            AppNotifications.error('You can select up to 3 featured items.');
          }
        });
      },
      child: SizedBox(
        width: 78,
        child: Column(
          children: [
            Container(
              width: 68,
              height: 68,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.04),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: selected ? _accent : AppColors.borderWhite10,
                  width: selected ? 1.5 : 1,
                ),
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (image.isNotEmpty)
                    Image.network(
                      Api.resolveMedia(image),
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const Icon(
                        Ionicons.image_outline,
                        size: 20,
                        color: AppColors.textGray600,
                      ),
                    )
                  else
                    const Icon(
                      Ionicons.image_outline,
                      size: 20,
                      color: AppColors.textGray600,
                    ),
                  if (selected)
                    Positioned(
                      right: 4,
                      top: 4,
                      child: Container(
                        width: 18,
                        height: 18,
                        decoration: const BoxDecoration(
                          color: _accent,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Ionicons.checkmark,
                          size: 12,
                          color: Colors.white,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 5),
            Text(
              '${item['title'] ?? item['name'] ?? 'Item'}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 8.5,
                color: AppColors.textGray400,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _profileItemKey(Map<String, dynamic> item) =>
      '${item['__profilePromoteType'] ?? 'product'}:${item['id'] ?? item['content_id'] ?? ''}';

  String _profileItemImage(Map<String, dynamic> item) {
    for (final key in const [
      'image_url',
      'main_image',
      'thumbnail_url',
      'media_preview',
      'media_url',
    ]) {
      final value = '${item[key] ?? ''}'.trim();
      if (value.isNotEmpty) return value;
    }
    final images = item['images'];
    if (images is List && images.isNotEmpty) return '${images.first}';
    return '';
  }

  void _applyLink() {
    if (_isProductPromote) {
      if (_linkedProduct == null) {
        AppNotifications.error('Pick a product to promote first');
        return;
      }
      setState(() => _activeLink = '${_linkedProduct!['share_link'] ?? ''}');
      AppNotifications.success('Product linked');
      return;
    }
    final value = _link.text.trim();
    if (value.isEmpty) {
      AppNotifications.error('Enter a link before applying');
      return;
    }
    setState(() => _activeLink = _normalizeUrl(value));
    AppNotifications.success('Link applied');
  }

  static String _normalizeUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return 'https://$trimmed';
  }

  Future<void> _copyProfileLink() async {
    await Clipboard.setData(ClipboardData(text: _link.text.trim()));
    if (!mounted) return;
    AppNotifications.success('Copied', 'Profile link copied to clipboard.');
  }

  void _useMyProfile() {
    setState(() {
      _link.text = _profileLink;
      _activeLink = _profileLink;
    });
  }

  Future<void> _openProductPicker() async {
    final products = await Api.myProducts();
    if (!mounted) return;
    if (products.isEmpty) {
      AppNotifications.info('No products', 'List a product before promoting.');
      return;
    }
    final search = TextEditingController();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0E0E0E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) {
          final query = search.text.trim().toLowerCase();
          final rows = products.where((product) {
            if (query.isEmpty) return true;
            return '${product['title'] ?? product['name'] ?? ''}'
                .toLowerCase()
                .contains(query);
          }).toList();
          return SafeArea(
            child: Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _sheetTitle('SELECT PRODUCT'),
                  const Divider(height: 1, color: AppColors.borderWhite10),
                  _sheetSearchField(
                    search,
                    'Search goog',
                    () => setSheet(() {}),
                  ),
                  const Divider(height: 1, color: AppColors.borderWhite10),
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: rows.length,
                      itemBuilder: (_, i) {
                        final product = rows[i];
                        return ListTile(
                          onTap: () {
                            setState(() {
                              _linkedProduct = product;
                              _activeLink = '${product['share_link'] ?? ''}';
                            });
                            Navigator.maybePop(sheetContext);
                          },
                          title: Text(
                            '${product['title'] ?? product['name'] ?? 'Product'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w400,
                              color: Colors.white,
                            ),
                          ),
                          subtitle: Text(
                            'Rupieer ${product['price'] ?? '-'}',
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textGray500,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ---- 4.2 Select Ad Media ----

  Widget _selectAdMediaSection() {
    return _plainSection(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHead('Select Ad Media', 'Upload image or video'),
          const SizedBox(height: 8),
          _hint('Video: upload directly up to 1 min, crop longer videos'),
          const SizedBox(height: 12),
          _uploadTile('Upload Media', Ionicons.image_outline, _pickMedia),
          const SizedBox(height: 12),
          _mediaPreviewPanel(),
        ],
      ),
    );
  }

  /// Flash/Vault keep their own upload copy — those flows are not part of the
  /// three-tab ad builder.
  Widget _uploadMediaSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHead(
            widget.videoOnly ? 'Upload Video' : 'Upload Media',
            widget.videoOnly
                ? 'Flash Content supports video uploads only.'
                : 'Add a photo or video to promote.',
          ),
          const SizedBox(height: 12),
          _uploadTile(
            _media.isEmpty
                ? (widget.videoOnly ? 'Upload Video' : 'Upload Media')
                : '${_media.length} file${_media.length == 1 ? '' : 's'} selected',
            widget.videoOnly
                ? Ionicons.videocam_outline
                : Ionicons.cloud_upload_outline,
            _pickMedia,
          ),
          const SizedBox(height: 12),
          _mediaPreviewPanel(),
          if (widget.showContentAccess) ...[
            const SizedBox(height: 10),
            _outlineButton(
              _preview == null
                  ? 'ADD PREVIEW'
                  : 'PREVIEW: ${_preview!.filename}',
              Ionicons.eye_outline,
              _pickPreview,
            ),
          ],
        ],
      ),
    );
  }

  Widget _uploadTile(String label, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.textGray400),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
            const Icon(
              Ionicons.chevron_forward,
              size: 15,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }

  Widget _mediaPreviewPanel() {
    final file = _media.isEmpty ? null : _media.first;
    final isImage =
        file != null && !(file.contentType ?? '').startsWith('video/');
    return Container(
      height: 94,
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: file == null
          ? const Center(
              child: Text(
                'SELECT IMAGE OR VIDEO TO PREVIEW',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 9.5,
                  letterSpacing: 2.2,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textGray600,
                ),
              ),
            )
          : isImage
          ? Image.memory(file.bytes, fit: BoxFit.cover)
          : Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Ionicons.videocam_outline,
                  size: 30,
                  color: AppColors.textGray500,
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    file.filename,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textGray400,
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  // ---- 4.3 Description ----

  Widget _descriptionSection() {
    return _plainSection(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _sectionLabel('Description')),
              Text(
                '${_description.text.characters.length}/$_descriptionLimit',
                style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.6,
                  color: AppColors.textGray500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _textField(
            controller: _description,
            hint: 'Write a short ad description...',
            maxLines: 2,
            maxLength: _descriptionLimit,
            onChanged: (_) => setState(() {}),
          ),
          if (_isUploadContent) ...[
            const SizedBox(height: 10),
            _toggleRow(
              'Allow comments',
              _allowComments,
              (v) => setState(() => _allowComments = v),
            ),
          ],
        ],
      ),
    );
  }

  // ---- 4.4 Call to Action ----

  Widget _ctaSection() {
    final fieldLabel = _ctaFieldLabels[_ctaTopic] ?? '';
    return _plainSection(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Call to Action'),
          const SizedBox(height: 10),
          _selectRow(_ctaTopic, _openCtaPicker),
          if (fieldLabel.isNotEmpty) ...[
            const SizedBox(height: 12),
            _fieldLabel(fieldLabel),
            const SizedBox(height: 8),
            _textField(
              controller: _ctaValue,
              hint: _ctaFieldPlaceholders[_ctaTopic] ?? '',
              keyboard: _ctaTopic == 'Call Now'
                  ? TextInputType.phone
                  : TextInputType.url,
            ),
          ],
        ],
      ),
    );
  }

  void _openCtaPicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0E0E0E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _sheetTitle('CALL TO ACTION'),
            const Divider(height: 1, color: AppColors.borderWhite10),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: _ctaOptions.map((option) {
                  final selected = option == _ctaTopic;
                  return ListTile(
                    onTap: () {
                      setState(() {
                        _ctaTopic = option;
                        _ctaValue.clear();
                      });
                      Navigator.maybePop(sheetContext);
                    },
                    title: Text(
                      option,
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w500,
                        color: selected ? Colors.white : AppColors.textGray300,
                      ),
                    ),
                    trailing: selected
                        ? const Icon(
                            Ionicons.checkmark,
                            size: 16,
                            color: Colors.white,
                          )
                        : null,
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  // ---- 4.5 Budget ----

  Widget _budgetDurationSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _budgetSection(framed: false),
          const SizedBox(height: 18),
          _durationSection(framed: false),
        ],
      ),
    );
  }

  Widget _budgetSection({bool framed = true}) {
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel('Budget'),
        const SizedBox(height: 14),
        _budgetAmountRow(),
        if (_budgetEditing) ...[
          const SizedBox(height: 10),
          _budgetInlineEditor(),
        ],
        const SizedBox(height: 14),
        _promoCodeRow(),
        if (_promoError.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            _promoError,
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w500,
              color: AppColors.likeRed,
            ),
          ),
        ],
        if (_promoAdded && _promoError.isEmpty) ...[
          const SizedBox(height: 6),
          Text(
            _promoAppliedLabel,
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w500,
              color: AppColors.successGreen,
            ),
          ),
        ],
        const SizedBox(height: 16),
        if (_isProfilePromote) _packageChips() else _budgetSlider(),
        const SizedBox(height: 14),
        Center(child: _balanceChip()),
        if (_insufficientBalance) ...[
          const SizedBox(height: 8),
          const Center(
            child: Text(
              'Insufficient wallet balance. Please top up your wallet.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w500,
                color: AppColors.likeRed,
              ),
            ),
          ),
        ],
      ],
    );
    return framed ? _card(child: content) : content;
  }

  String get _promoAppliedLabel {
    switch (_promoDiscountType) {
      case 'rupee':
        return '−R${_thousands(_promoDiscountValue)} discount applied';
      case 'reach':
        return 'Promo code applied';
      default:
        final days = _promoDiscountValue.round();
        return '+$days free day${days == 1 ? '' : 's'} added';
    }
  }

  Widget _budgetAmountRow() {
    final budget = _budget;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.07),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text(
            'RUPIEER',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.6,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray400,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Text(
          budget == null ? '—' : _thousands(budget),
          style: const TextStyle(
            fontSize: 21,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        const SizedBox(width: 8),
        const Flexible(
          child: Text(
            'Total Budget',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
        ),
        if (!_isProfilePromote) ...[
          const SizedBox(width: 8),
          GestureDetector(
            onTap: _promoLocksBudget
                ? null
                : () {
                    setState(() {
                      if (_budgetEditing) {
                        _commitBudgetInput();
                        _budgetEditing = false;
                        return;
                      }
                      _budgetInput.text = budget?.toString() ?? '';
                      _budgetEditing = true;
                    });
                  },
            child: Opacity(
              opacity: _promoLocksBudget ? 0.4 : 1,
              child: Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(
                  _budgetEditing
                      ? Ionicons.checkmark_outline
                      : Ionicons.create_outline,
                  size: 15,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  /// A rupee or reach promo pins the amount it was issued against.
  bool get _promoLocksBudget {
    if (!_promoAdded) return false;
    if (_isProfilePromote) return true;
    return _promoDiscountType == 'rupee' || _promoDiscountType == 'reach';
  }

  Widget _budgetInlineEditor() {
    return SizedBox(
      width: 150,
      child: TextField(
        controller: _budgetInput,
        autofocus: true,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(6),
        ],
        onSubmitted: (_) => setState(() {
          _commitBudgetInput();
          _budgetEditing = false;
        }),
        onChanged: (_) => setState(_commitBudgetInput),
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
        cursorColor: _accent,
        decoration: InputDecoration(
          isDense: true,
          filled: true,
          fillColor: Colors.black.withOpacity(0.25),
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
            borderSide: const BorderSide(color: _accent),
          ),
        ),
      ),
    );
  }

  void _commitBudgetInput() {
    final parsed = int.tryParse(
      _budgetInput.text.replaceAll(RegExp(r'\D'), ''),
    );
    if (parsed == null || !_tiersLoaded || _tiers.isEmpty) return;
    _budget = parsed.clamp(_budgetMin, _budgetMax);
  }

  Widget _promoCodeRow() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _promoError.isEmpty
              ? AppColors.borderWhite10
              : AppColors.likeRed.withOpacity(0.6),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _promoCode,
              enabled: !_promoAdded,
              textCapitalization: TextCapitalization.characters,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
                LengthLimitingTextInputFormatter(15),
                _UpperCaseFormatter(),
              ],
              onChanged: (_) {
                if (_promoError.isNotEmpty) setState(() => _promoError = '');
              },
              style: const TextStyle(
                fontSize: 11,
                letterSpacing: 1.1,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
              cursorColor: _accent,
              decoration: const InputDecoration(
                isDense: true,
                border: InputBorder.none,
                contentPadding: EdgeInsets.symmetric(horizontal: 10),
                hintText: 'PROMO CODE',
                hintStyle: TextStyle(
                  fontSize: 11,
                  letterSpacing: 1.1,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textGray600,
                ),
              ),
            ),
          ),
          GestureDetector(
            onTap: _promoValidating
                ? null
                : (_promoAdded ? _clearPromo : _addPromo),
            child: Container(
              height: 32,
              constraints: const BoxConstraints(minWidth: 48),
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: _promoAdded
                    ? AppColors.likeRed.withOpacity(0.15)
                    : AppColors.likeRed,
                borderRadius: BorderRadius.circular(9),
              ),
              child: _promoValidating
                  ? const SizedBox(
                      width: 13,
                      height: 13,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : _promoAdded
                  ? const Icon(
                      Ionicons.close_outline,
                      size: 15,
                      color: AppColors.likeRed,
                    )
                  : const Text(
                      'ADD',
                      style: TextStyle(
                        fontSize: 9.5,
                        letterSpacing: 1.1,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _addPromo() async {
    final code = _promoCode.text.trim().toUpperCase();
    if (code.isEmpty) {
      setState(() => _promoError = 'Please enter a promo code.');
      return;
    }
    setState(() {
      _promoValidating = true;
      _promoError = '';
    });
    try {
      final result = await Api.validatePromoCode(code, _reachAdType);
      if (!mounted) return;
      if (result['valid'] == false) {
        setState(() {
          _promoValidating = false;
          _promoError = _webPromoError(
            '${result['message'] ?? 'This promo code is not valid.'}',
          );
        });
        return;
      }
      setState(() {
        _promoValidating = false;
        _promoAdded = true;
        _promoDiscount = result;
        _applyPromoToBudget();
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _promoValidating = false;
        _promoError = _webPromoError(e.message);
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _promoValidating = false;
        _promoError = 'Could not check this code right now.';
      });
    }
  }

  String _webPromoError(String message) {
    final msg = message.isEmpty ? 'Invalid promo code.' : message;
    final lower = msg.toLowerCase();
    if (lower.contains("doesn't exist") || lower.contains('inactive')) {
      return "This promo code doesn't exist or is inactive";
    }
    if (lower.contains('not valid for this ad type')) {
      return 'This code is not valid for this ad type';
    }
    if (lower.contains('expired')) return 'This promo code has expired';
    if (lower.contains('usage limit')) {
      return 'This promo code has reached its usage limit';
    }
    return msg;
  }

  /// A reach promo carries its own budget and day cap; adopt both so the
  /// summary and the payment agree with what the backend will charge.
  void _applyPromoToBudget() {
    if (_promoDiscountType != 'reach') return;
    final value = _promoDiscountValue.round();
    if (value > 0) _budget = value;
    final maxDays = _promoMaxDays;
    if (maxDays != null) {
      _durationDays = min(maxDays, max(1, _durationDays));
      return;
    }
    final tier = findTier(_tiers, value.toDouble());
    if (tier != null) _durationDays = min(tier.maxDays, max(1, _durationDays));
  }

  void _clearPromo() {
    setState(() {
      _promoAdded = false;
      _promoDiscount = null;
      _promoError = '';
      _promoCode.clear();
      _acceptedNonRefundable = false;
    });
  }

  Widget _budgetSlider() {
    if (!_tiersLoaded) {
      return const _SectionPlaceholder(label: 'Loading budget range...');
    }
    if (_tiers.isEmpty) {
      return const _SectionPlaceholder(
        label: 'No budget packages available right now.',
      );
    }
    final value = (_budget ?? _budgetMin).clamp(_budgetMin, _budgetMax);
    return Opacity(
      opacity: _promoLocksBudget ? 0.45 : 1,
      child: IgnorePointer(
        ignoring: _promoLocksBudget,
        child: Column(
          children: [
            _sliderTheme(
              child: Slider(
                value: value.toDouble(),
                min: _budgetMin.toDouble(),
                max: _budgetMax.toDouble(),
                onChanged: (v) => setState(() {
                  _budget = v.round();
                  if (_budgetEditing) _budgetInput.text = '${v.round()}';
                }),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _sliderEdgeLabel('R${_thousands(_budgetMin)}'),
                  _sliderEdgeLabel('R${_thousands(_budgetMax)}'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Profile Promote buys a fixed package, so the tier list becomes chips and
  /// the duration is whatever that tier dictates.
  Widget _packageChips() {
    if (!_tiersLoaded) {
      return const _SectionPlaceholder(label: 'Loading packages...');
    }
    if (_packageTiers.isEmpty) {
      return const _SectionPlaceholder(
        label: 'No budget packages available right now.',
      );
    }
    return Opacity(
      opacity: _promoLocksBudget ? 0.45 : 1,
      child: IgnorePointer(
        ignoring: _promoLocksBudget,
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _packageTiers.map((tier) {
            final value = tier.budgetFrom.round();
            final selected = _budget == value;
            return GestureDetector(
              onTap: () => setState(() {
                _budget = value;
                _durationDays = tier.minDays;
              }),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 9,
                ),
                decoration: BoxDecoration(
                  color: selected ? _accent : Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: selected ? _accent : AppColors.borderWhite10,
                  ),
                  boxShadow: selected
                      ? [
                          BoxShadow(
                            color: _accent.withOpacity(0.35),
                            blurRadius: 18,
                            offset: const Offset(0, 6),
                          ),
                        ]
                      : null,
                ),
                child: Text(
                  'R${_thousands(value)}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : AppColors.textGray300,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _balanceChip() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.25),
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Text(
            _walletLoaded
                ? 'Rupieer Balance: ${_thousands(_walletBalance)}'
                : 'Rupieer Balance: Loading...',
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray400,
            ),
          ),
        ),
      ],
    );
  }

  // ---- 4.6 Duration ----

  Widget _durationSection({bool framed = true}) {
    final locked = _durationLocked;
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel('Duration'),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              _durationSummary,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            if (locked) ...[
              const SizedBox(width: 10),
              const Text(
                'FIXED',
                style: TextStyle(
                  fontSize: 9,
                  letterSpacing: 1.8,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textGray500,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Opacity(
          opacity: locked ? 0.45 : 1,
          child: IgnorePointer(
            ignoring: locked,
            child: _sliderTheme(
              child: Slider(
                value: _durationDays
                    .clamp(_tierMinDays, max(_tierMinDays, _tierMaxDays))
                    .toDouble(),
                min: _tierMinDays.toDouble(),
                max: max(_tierMinDays + 1, _tierMaxDays).toDouble(),
                onChanged: (v) => setState(
                  () => _durationDays = v.round().clamp(
                    _tierMinDays,
                    _tierMaxDays,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        _hint(
          'Ads usually complete within your selected time, but may finish '
          'sooner or take longer depending on audience reach.',
        ),
      ],
    );
    return framed ? _card(child: content) : content;
  }

  // ---- 4.7 Location ----

  Widget _locationSection() {
    final label = _countryCodes.isEmpty
        ? 'Select Countries'
        : _countryCodes.length == _selectableCountries.length
        ? 'All Countries'
        : _countryCodes.map(adCountryName).join(', ');

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Location'),
          const SizedBox(height: 10),
          GestureDetector(
            onTap: _openCountryPicker,
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.03),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Row(
                children: [
                  const Icon(
                    Ionicons.globe_outline,
                    size: 17,
                    color: AppColors.textGray400,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const Icon(
                    Ionicons.chevron_forward,
                    size: 15,
                    color: AppColors.textGray500,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Countries the admin has enabled for this ad type. A null allow-list means
  /// the setting never loaded, which is treated as unrestricted.
  List<AdCountry> get _selectableCountries {
    final allowed = _allowedCountryCodes;
    if (allowed == null) return adCountries;
    return adCountries.where((c) => allowed.contains(c.code)).toList();
  }

  bool _isCountryAvailable(String code) {
    final allowed = _allowedCountryCodes;
    return allowed == null || allowed.contains(code);
  }

  /// SELECT LOCATIONS sheet: searchable list, "All Countries" pinned first and
  /// mutually exclusive with individual picks, and a NOT AVAILABLE pill on any
  /// country the admin has not enabled for ads.
  void _openCountryPicker() {
    final search = TextEditingController();
    // Edited against a copy so CANCEL genuinely discards.
    final draft = Set<String>.from(_countryCodes);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0E0E0E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) {
          final query = search.text.trim().toLowerCase();
          final rows = adCountries
              .where(
                (c) =>
                    query.isEmpty ||
                    c.name.toLowerCase().contains(query) ||
                    c.code.toLowerCase().contains(query),
              )
              .toList();
          final selectable = _selectableCountries;
          final allSelected =
              selectable.isNotEmpty &&
              selectable.every((c) => draft.contains(c.code));

          return SafeArea(
            child: Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _sheetTitle('SELECT LOCATIONS'),
                  const Divider(height: 1, color: AppColors.borderWhite10),
                  _sheetSearchField(
                    search,
                    'Search country',
                    () => setSheet(() {}),
                  ),
                  const Divider(height: 1, color: AppColors.borderWhite10),
                  Flexible(
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: rows.length + 1,
                      itemBuilder: (_, i) {
                        if (i == 0) {
                          return _countryRow(
                            name: 'All Countries',
                            selected: allSelected,
                            available: selectable.isNotEmpty,
                            onTap: () => setSheet(() {
                              draft.clear();
                              if (!allSelected) {
                                draft.addAll(selectable.map((c) => c.code));
                              }
                            }),
                          );
                        }
                        final country = rows[i - 1];
                        final available = _isCountryAvailable(country.code);
                        return _countryRow(
                          name: '${country.flag}  ${country.name}',
                          selected: draft.contains(country.code),
                          available: available,
                          onTap: () => setSheet(() {
                            if (!draft.remove(country.code)) {
                              draft.add(country.code);
                            }
                          }),
                        );
                      },
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.borderWhite10),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: _darkPillButton(
                            'CANCEL',
                            () => Navigator.maybePop(sheetContext),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _whitePillButton('DONE', () {
                            Navigator.maybePop(sheetContext);
                            setState(() {
                              _countryCodes
                                ..clear()
                                ..addAll(draft);
                            });
                          }),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _countryRow({
    required String name,
    required bool selected,
    required bool available,
    required VoidCallback onTap,
  }) {
    return ListTile(
      enabled: available,
      onTap: available ? onTap : null,
      leading: Container(
        width: 22,
        height: 22,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Icon(
          Ionicons.checkmark,
          size: 13,
          color: selected ? Colors.black : AppColors.textGray600,
        ),
      ),
      title: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: available ? Colors.white : AppColors.textGray600,
        ),
      ),
      trailing: available
          ? null
          : Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.likeRed.withOpacity(0.10),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.likeRed.withOpacity(0.35)),
              ),
              child: Text(
                'NOT AVAILABLE',
                style: TextStyle(
                  fontSize: 8.5,
                  letterSpacing: 1.1,
                  fontWeight: FontWeight.w600,
                  color: AppColors.likeRed.withOpacity(0.85),
                ),
              ),
            ),
    );
  }

  // ---- 4.8 Gender ----

  Widget _genderSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Gender'),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.25),
              borderRadius: BorderRadius.circular(13),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Row(
              children: _genders.map((option) {
                final selected = _gender == option;
                return Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _gender = option),
                    behavior: HitTestBehavior.opaque,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 140),
                      height: 34,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: selected ? _accent : Colors.transparent,
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: selected
                            ? [
                                BoxShadow(
                                  color: _accent.withOpacity(0.35),
                                  blurRadius: 20,
                                  offset: const Offset(0, 8),
                                ),
                              ]
                            : null,
                      ),
                      child: Text(
                        option.toUpperCase(),
                        style: TextStyle(
                          fontSize: 9.5,
                          letterSpacing: 1.2,
                          fontWeight: FontWeight.w600,
                          color: selected
                              ? Colors.white
                              : AppColors.textGray500,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }

  // ---- 4.9 Age ----

  Widget _ageSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _sectionLabel('Age')),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.07),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '$_ageMin - $_ageMax',
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray300,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 8,
              activeTrackColor: _accent,
              inactiveTrackColor: Colors.white.withOpacity(0.15),
              rangeThumbShape: const _GlowRangeThumbShape(),
              overlayShape: const RoundSliderOverlayShape(overlayRadius: 18),
              overlayColor: _accent.withOpacity(0.16),
              rangeTrackShape: const RoundedRectRangeSliderTrackShape(),
              showValueIndicator: ShowValueIndicator.never,
            ),
            child: RangeSlider(
              min: 18,
              max: 65,
              values: RangeValues(_ageMin.toDouble(), _ageMax.toDouble()),
              onChanged: (values) => setState(() {
                _ageMin = values.start.round();
                _ageMax = values.end.round();
              }),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [_sliderEdgeLabel('18'), _sliderEdgeLabel('65')],
            ),
          ),
        ],
      ),
    );
  }

  // ---- 4.10 Interest Topics ----

  Widget _interestSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() {
              _interestsOpen = !_interestsOpen;
              if (_interestsOpen) _draftInterests = Set.from(_interests);
            }),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _sectionLabel('Interest Topics'),
                      const SizedBox(height: 4),
                      Text(
                        '${(_interestsOpen ? _draftInterests : _interests).length}/$_interestLimit selected',
                        style: const TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w500,
                          color: AppColors.textGray600,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.06),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    _interestsOpen
                        ? Ionicons.chevron_up_outline
                        : Ionicons.chevron_down_outline,
                    size: 15,
                    color: AppColors.textGray400,
                  ),
                ),
              ],
            ),
          ),
          if (_interestsOpen) ...[
            const SizedBox(height: 14),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 230),
              child: SingleChildScrollView(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _interestOptions.map((topic) {
                    final selected = _draftInterests.contains(topic);
                    final locked =
                        !selected && _draftInterests.length >= _interestLimit;
                    return GestureDetector(
                      onTap: locked
                          ? null
                          : () => setState(() {
                              if (!_draftInterests.remove(topic)) {
                                _draftInterests.add(topic);
                              }
                            }),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 13,
                          vertical: 9,
                        ),
                        decoration: BoxDecoration(
                          color: selected
                              ? _accent
                              : Colors.white.withOpacity(locked ? 0.02 : 0.045),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: selected ? _accent : AppColors.borderWhite10,
                          ),
                          boxShadow: selected
                              ? [
                                  BoxShadow(
                                    color: _accent.withOpacity(0.22),
                                    blurRadius: 20,
                                    offset: const Offset(0, 8),
                                  ),
                                ]
                              : null,
                        ),
                        child: Text(
                          topic,
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                            color: selected
                                ? Colors.white
                                : locked
                                ? AppColors.textGray700
                                : AppColors.textGray400,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerRight,
              child: GestureDetector(
                onTap: () => setState(() {
                  _interests
                    ..clear()
                    ..addAll(_draftInterests);
                  _interestsOpen = false;
                }),
                child: Container(
                  height: 36,
                  padding: const EdgeInsets.symmetric(horizontal: 22),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _accent,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: _accent.withOpacity(0.25),
                        blurRadius: 24,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: const Text(
                    'SAVE',
                    style: TextStyle(
                      fontSize: 10,
                      letterSpacing: 1.6,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ---- 4.11 Placements ----

  bool get _allPlacementsSelected =>
      _selectablePlacements.every(_placements.contains);

  String get _placementLabel {
    if (_allPlacementsSelected) return 'All';
    final chosen = _placements.where((p) => p != 'All').toList();
    return chosen.isEmpty ? 'Select placements' : chosen.join(', ');
  }

  Widget _placementsSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Placements'),
          const SizedBox(height: 10),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() => _placementsOpen = !_placementsOpen),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.03),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Row(
                children: [
                  const Icon(
                    Ionicons.grid_outline,
                    size: 16,
                    color: AppColors.textGray400,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _placementLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  Icon(
                    _placementsOpen
                        ? Ionicons.chevron_up_outline
                        : Ionicons.chevron_down_outline,
                    size: 14,
                    color: AppColors.textGray500,
                  ),
                ],
              ),
            ),
          ),
          if (_placementsOpen) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                color: const Color(0xFF111114),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Column(
                children: _placementOptions.entries.map((entry) {
                  final label = entry.key;
                  final selectable = entry.value;
                  final selected = label == 'All'
                      ? _allPlacementsSelected
                      : _placements.contains(label);
                  return GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: selectable ? () => _togglePlacement(label) : null,
                    child: Container(
                      height: 34,
                      margin: const EdgeInsets.symmetric(vertical: 1),
                      padding: const EdgeInsets.symmetric(horizontal: 11),
                      decoration: BoxDecoration(
                        color: selected ? _accent : Colors.transparent,
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              label,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                                color: selected
                                    ? Colors.white
                                    : selectable
                                    ? AppColors.textGray400
                                    : AppColors.textGray700,
                              ),
                            ),
                          ),
                          if (selected)
                            const Icon(
                              Ionicons.checkmark_outline,
                              size: 15,
                              color: Colors.white,
                            ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _togglePlacement(String label) {
    setState(() {
      if (label == 'All') {
        if (_allPlacementsSelected) {
          _placements.clear();
        } else {
          _placements
            ..clear()
            ..addAll(_selectablePlacements);
        }
        return;
      }
      if (!_placements.remove(label)) _placements.add(label);
    });
  }

  // ---- 4.12 Actions ----

  Widget _nonRefundableNotice() {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () =>
          setState(() => _acceptedNonRefundable = !_acceptedNonRefundable),
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: const Color(0xFFFBBF24).withOpacity(0.10),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFFBBF24).withOpacity(0.30)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 18,
              height: 18,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: _acceptedNonRefundable
                    ? const Color(0xFFFBBF24)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(5),
                border: Border.all(
                  color: const Color(0xFFFBBF24).withOpacity(0.6),
                ),
              ),
              child: Icon(
                Ionicons.checkmark,
                size: 12,
                color: _acceptedNonRefundable
                    ? Colors.black
                    : Colors.transparent,
              ),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Profile promotion packages are non-refundable once activated.',
                style: TextStyle(
                  fontSize: 11,
                  height: 1.45,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFFFDE68A),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _actionsRow() {
    return Row(
      children: [
        Expanded(
          child: GestureDetector(
            key: const Key('campaign-cancel'),
            onTap: _submitting ? null : _showCancelConfirmation,
            child: Container(
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Ionicons.close_outline, size: 15, color: Colors.white),
                  SizedBox(width: 8),
                  Text(
                    'CANCEL',
                    style: TextStyle(
                      fontSize: 9,
                      letterSpacing: 1.6,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: GestureDetector(
            onTap: _submitting ? null : _publish,
            child: Container(
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: _submitting ? _publishRed.withOpacity(0.6) : _publishRed,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: _publishRed.withOpacity(0.26),
                    blurRadius: 26,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
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
                    _submitting ? 'PUBLISHING...' : 'PUBLISH',
                    style: const TextStyle(
                      fontSize: 9,
                      letterSpacing: 1.6,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ---- 4.13 Ad Preview ----

  Widget _adPreviewSection() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _sectionHead(
                  'Ad Preview',
                  _isProfilePromote
                      ? 'Profile promotion card'
                      : 'Live device preview',
                ),
              ),
              if (!_isProfilePromote && !_isProductPromote) _previewToggle(),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.025),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      _isProfilePromote
                          ? Ionicons.person_outline
                          : _isProductPromote
                          ? Ionicons.cube_outline
                          : _previewMode == 'mobile'
                          ? Ionicons.phone_portrait_outline
                          : Ionicons.desktop_outline,
                      size: 13,
                      color: AppColors.textGray500,
                    ),
                    const SizedBox(width: 7),
                    Text(
                      _isProfilePromote
                          ? 'PROFILE PREVIEW'
                          : _isProductPromote
                          ? 'MARKETPLACE PREVIEW'
                          : '${_previewMode.toUpperCase()} PREVIEW',
                      style: const TextStyle(
                        fontSize: 8.5,
                        letterSpacing: 2,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (_isProfilePromote)
                  _profilePreviewCard()
                else
                  _deviceMockCard(),
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
          height: 32,
          padding: const EdgeInsets.symmetric(horizontal: 11),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Row(
            children: [
              Icon(
                icon,
                size: 13,
                color: selected ? Colors.black : AppColors.textGray500,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontSize: 8.5,
                  letterSpacing: 1.3,
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

  Widget _deviceMockCard() {
    return _previewMode == 'desktop'
        ? _desktopAdPreviewCard()
        : _mobileAdPreviewCard();
  }

  Widget _mobileAdPreviewCard() {
    final file = _media.isEmpty ? null : _media.first;
    final description = _description.text.trim();

    return Center(
      child: Container(
        width: 136,
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: const Color(0xFF050507),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withOpacity(0.15)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x66000000),
              blurRadius: 32,
              offset: Offset(0, 16),
            ),
          ],
        ),
        child: Container(
          height: 274,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: const Color(0xFF0B0C10),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Stack(
            children: [
              const Positioned(
                left: 42,
                top: 0,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Color(0xFF050507),
                    borderRadius: BorderRadius.vertical(
                      bottom: Radius.circular(12),
                    ),
                  ),
                  child: SizedBox(width: 44, height: 13),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(7, 20, 7, 7),
                child: Column(
                  children: [
                    const Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'AD',
                          style: TextStyle(
                            fontSize: 6.5,
                            letterSpacing: 1.2,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textGray600,
                          ),
                        ),
                        Text(
                          'SPONSORED',
                          style: TextStyle(
                            fontSize: 6.5,
                            letterSpacing: 1.2,
                            fontWeight: FontWeight.w800,
                            color: AppColors.textGray600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 7),
                    Expanded(
                      child: Container(
                        clipBehavior: Clip.antiAlias,
                        decoration: BoxDecoration(
                          color: const Color(0xFF121318),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.borderWhite10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsets.fromLTRB(8, 8, 8, 7),
                              child: Row(
                                children: [
                                  _previewAvatar(24, 8),
                                  const SizedBox(width: 7),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          Api.displayName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 8.5,
                                            fontWeight: FontWeight.w800,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const Text(
                                          'Promoted',
                                          style: TextStyle(
                                            fontSize: 6.5,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.textGray600,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            AspectRatio(
                              aspectRatio: 1,
                              child: Container(
                                margin: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                ),
                                clipBehavior: Clip.antiAlias,
                                decoration: BoxDecoration(
                                  color: Colors.black,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: AppColors.borderWhite10,
                                  ),
                                ),
                                child: _previewCreative(file, compact: true),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(8, 7, 8, 0),
                              child: Text(
                                description.isEmpty
                                    ? 'Write a short ad description...'
                                    : description,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 6.8,
                                  height: 1.35,
                                  fontWeight: FontWeight.w600,
                                  color: description.isEmpty
                                      ? AppColors.textGray600
                                      : AppColors.textGray300,
                                ),
                              ),
                            ),
                            const Spacer(),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(8, 5, 8, 7),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: _previewMetaBlock(compact: true),
                                  ),
                                  if (_ctaTopic != 'No Button') ...[
                                    const SizedBox(width: 5),
                                    _previewCtaButton(compact: true),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 7),
                    Container(
                      width: 48,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.18),
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _desktopAdPreviewCard() {
    final file = _media.isEmpty ? null : _media.first;

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 430),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFF050507),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
                border: Border.all(color: Colors.white.withOpacity(0.12)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x55000000),
                    blurRadius: 28,
                    offset: Offset(0, 16),
                  ),
                ],
              ),
              child: Container(
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: const Color(0xFF0B0C10),
                  borderRadius: BorderRadius.circular(13),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Column(
                  children: [
                    Container(
                      height: 24,
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.03),
                        border: const Border(
                          bottom: BorderSide(color: AppColors.borderWhite10),
                        ),
                      ),
                      child: Row(
                        children: [
                          _windowDot(const Color(0xFFFF6B6B)),
                          const SizedBox(width: 6),
                          _windowDot(const Color(0xFFFACC15)),
                          const SizedBox(width: 6),
                          _windowDot(const Color(0xFF10B981)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Container(
                              height: 8,
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.06),
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(7),
                      child: SizedBox(
                        height: 128,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF121318),
                                  borderRadius: BorderRadius.circular(13),
                                  border: Border.all(
                                    color: AppColors.borderWhite10,
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        _previewAvatar(28, 9),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                Api.displayName,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                  fontSize: 10,
                                                  fontWeight: FontWeight.w800,
                                                  color: Colors.white,
                                                ),
                                              ),
                                              const Text(
                                                'Sponsored Ad',
                                                style: TextStyle(
                                                  fontSize: 8,
                                                  fontWeight: FontWeight.w700,
                                                  color: AppColors.textGray600,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 11),
                                    Text(
                                      _previewTitle,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        height: 1.2,
                                        fontWeight: FontWeight.w800,
                                        color: Colors.white,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      _activeLink.isEmpty
                                          ? 'Apply a link to show the landing page destination.'
                                          : _activeLink,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 9,
                                        height: 1.35,
                                        color: AppColors.textGray500,
                                      ),
                                    ),
                                    const Spacer(),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              _skeletonLine(widthFactor: 0.7),
                                              const SizedBox(height: 5),
                                              _skeletonLine(widthFactor: 0.45),
                                            ],
                                          ),
                                        ),
                                        if (_ctaTopic != 'No Button') ...[
                                          const SizedBox(width: 8),
                                          _previewCtaButton(compact: true),
                                        ],
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            SizedBox(
                              width: 118,
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(13),
                                child: Container(
                                  color: const Color(0xFF121318),
                                  child: _previewCreative(file, compact: false),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Container(
              width: 360,
              height: 10,
              decoration: const BoxDecoration(
                color: Color(0xFF24272D),
                borderRadius: BorderRadius.vertical(
                  bottom: Radius.circular(18),
                ),
              ),
            ),
            Container(
              width: 94,
              height: 5,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.12),
                borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(999),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _previewCreative(ApiUploadFile? file, {required bool compact}) {
    final isImage =
        file != null && !(file.contentType ?? '').startsWith('video/');
    if (file == null && _activeLink.isEmpty) {
      return Container(
        width: double.infinity,
        height: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF17191F), Color(0xFF08090B)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _microPill('LIVE AD'),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _previewTitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: compact ? 9 : 12,
                    height: 1.2,
                    fontWeight: FontWeight.w800,
                    color: Colors.white.withOpacity(0.85),
                  ),
                ),
                const SizedBox(height: 8),
                _skeletonLine(widthFactor: 0.8),
                const SizedBox(height: 6),
                _skeletonLine(widthFactor: 0.55),
              ],
            ),
          ],
        ),
      );
    }

    if (isImage) {
      return Stack(
        fit: StackFit.expand,
        children: [
          Image.memory(file.bytes, fit: BoxFit.cover),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Colors.black.withOpacity(0.38),
                  Colors.transparent,
                  Colors.black.withOpacity(0.1),
                ],
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
              ),
            ),
          ),
        ],
      );
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        Container(
          color: Colors.black,
          child: Center(
            child: Container(
              width: compact ? 38 : 46,
              height: compact ? 38 : 46,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Ionicons.play,
                size: compact ? 17 : 20,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _previewAvatar(double size, double fontSize) {
    final initial = Api.displayName.trim().isEmpty
        ? 'G'
        : Api.displayName.trim()[0].toUpperCase();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.07),
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Text(
        initial,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w800,
          color: Colors.white.withOpacity(0.75),
        ),
      ),
    );
  }

  Widget _previewMetaBlock({required bool compact}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _previewTitle,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: compact ? 7.5 : 10,
            fontWeight: FontWeight.w800,
            color: Colors.white.withOpacity(0.82),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          _activeLink.isEmpty
              ? 'Add link to activate landing page'
              : _activeLink,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: compact ? 6.5 : 8,
            color: AppColors.textGray600,
          ),
        ),
      ],
    );
  }

  Widget _previewCtaButton({required bool compact}) {
    final label = (_ctaTopic == 'No Button' ? 'VISIT' : _ctaTopic)
        .toUpperCase();
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 7 : 12,
        vertical: compact ? 4 : 7,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: compact ? 6.5 : 8.5,
          letterSpacing: compact ? 0.9 : 1.2,
          fontWeight: FontWeight.w800,
          color: Colors.black,
        ),
      ),
    );
  }

  Widget _windowDot(Color color) {
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }

  String get _previewTitle {
    final description = _description.text.trim();
    if (description.isNotEmpty) return description;
    if (_linkedProduct != null) {
      final title =
          _linkedProduct!['title'] ?? _linkedProduct!['name'] ?? 'Media Ad';
      return '$title';
    }
    return _activeLink.isNotEmpty ? 'Media Ad' : 'Live Ad';
  }

  /// Profile Promote renders as a carousel card rather than an in-feed ad, so
  /// its preview is the profile row plus the featured tile grid.
  Widget _profilePreviewCard() {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFF121318),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: AppColors.borderWhite10),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.06),
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: Text(
                    Api.displayName.trim().isEmpty
                        ? 'G'
                        : Api.displayName.trim()[0].toUpperCase(),
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        Api.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '@${Api.username}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w500,
                          color: AppColors.textGray600,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'SUBSCRIBE',
                    style: TextStyle(
                      fontSize: 8,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w600,
                      color: Colors.black,
                    ),
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(
                  Ionicons.ellipsis_vertical,
                  size: 15,
                  color: AppColors.textGray500,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(6),
            child: Row(
              children: List.generate(3, (i) {
                return Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: i == 2 ? 0 : 4),
                    child: AspectRatio(
                      aspectRatio: 4 / 5,
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.025),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppColors.borderWhite10),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(11, 2, 11, 12),
            child: Text(
              'Add products, flash contents, vault contents, or Googs to '
              'feature them here.',
              style: TextStyle(
                fontSize: 9.5,
                height: 1.5,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _skeletonLine({required double widthFactor}) {
    return FractionallySizedBox(
      widthFactor: widthFactor,
      child: Container(
        height: 7,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );
  }

  Widget _microPill(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.06),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 7,
          letterSpacing: 1.3,
          fontWeight: FontWeight.w600,
          color: AppColors.textGray400,
        ),
      ),
    );
  }

  // ---- 4.14 Order Summary ----

  Widget _orderSummarySection() {
    final estimate = _reachEstimate;
    final budget = _effectiveBudget;
    final budgetLabel = _isProfilePromote && _promoAdded
        ? 'Rupieer 0'
        : budget == null
        ? '—'
        : 'Rupieer ${_thousands(budget)}';

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'ORDER SUMMARY',
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 2.2,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray500,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: const Text(
                  'LIVE',
                  style: TextStyle(
                    fontSize: 7.5,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray400,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _summaryTile('TOTAL BUDGET', budgetLabel)),
              const SizedBox(width: 8),
              Expanded(child: _summaryTile('DURATION', _durationSummary)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _summaryTile('AGE', _ageSummary)),
              const SizedBox(width: 8),
              Expanded(child: _summaryTile('GENDER', _gender)),
            ],
          ),
          if (estimate != null) ...[
            const SizedBox(height: 8),
            _summaryTile(
              'ESTIMATED REACH',
              '${_reachCount(estimate.minReach)} – '
                  '${_reachCount(estimate.maxReach)} people',
              emphasised: true,
            ),
          ],
        ],
      ),
    );
  }

  Widget _summaryTile(String label, String value, {bool emphasised = false}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 8,
              letterSpacing: 1.6,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray600,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: emphasised ? 11.5 : 10.5,
              fontWeight: FontWeight.w600,
              color: emphasised ? Colors.white : AppColors.textGray200,
            ),
          ),
        ],
      ),
    );
  }

  // ---- Vault / Flash extras (unchanged flows) ----

  Widget _contentAccessCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionHead(
            'Content Access',
            'Set a fixed price and preview time for locked content.',
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _numberField('FIXED PRICE', 'R', _price)),
              const SizedBox(width: 10),
              Expanded(
                child: _numberField('PREVIEW TIME', 's', _previewSeconds),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _subscriptionCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Subscription Access'),
          const SizedBox(height: 10),
          _appliedPackageRow('Package 1', 'R300 / 30 Days / 15%'),
          const SizedBox(height: 8),
          _appliedPackageRow('Package 2', 'R500 / Month / 20%'),
        ],
      ),
    );
  }

  Widget _appliedPackageRow(String left, String right) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        children: [
          Text(
            left,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
          const Spacer(),
          Flexible(
            child: Text(
              right,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textGray300,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _numberField(
    String label,
    String prefix,
    TextEditingController controller,
  ) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 8,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray600,
            ),
          ),
          Row(
            children: [
              Text(
                prefix,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: TextField(
                  controller: controller,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                  cursorColor: _accent,
                  decoration: const InputDecoration(
                    isDense: true,
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.symmetric(vertical: 6),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ---- Shared building blocks ----

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.bg3,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: child,
    );
  }

  Widget _plainSection({required Widget child}) {
    return Container(
      padding: const EdgeInsets.only(bottom: 14),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.borderWhite10)),
      ),
      child: child,
    );
  }

  Widget _sectionLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: Colors.white,
      ),
    );
  }

  Widget _sectionHead(String title, String subtitle, {Widget? trailing}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _sectionLabel(title),
              if (subtitle.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.textGray500,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 10), trailing],
      ],
    );
  }

  Widget _fieldLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 10.5,
        fontWeight: FontWeight.w400,
        color: AppColors.textGray400,
      ),
    );
  }

  Widget _hint(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 10,
        height: 1.5,
        color: AppColors.textGray600,
      ),
    );
  }

  Widget _sliderEdgeLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 9.5,
        fontWeight: FontWeight.w600,
        color: AppColors.textGray600,
      ),
    );
  }

  Widget _sliderTheme({required Widget child}) {
    return SliderTheme(
      data: SliderTheme.of(context).copyWith(
        trackHeight: 8,
        activeTrackColor: _accent,
        inactiveTrackColor: Colors.white.withOpacity(0.15),
        thumbColor: _accent,
        thumbShape: const _GlowThumbShape(),
        overlayShape: const RoundSliderOverlayShape(overlayRadius: 18),
        overlayColor: _accent.withOpacity(0.16),
        showValueIndicator: ShowValueIndicator.never,
      ),
      child: child,
    );
  }

  Widget _selectRow(String value, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.2),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                value,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w400,
                  color: Colors.white,
                ),
              ),
            ),
            const Icon(
              Ionicons.chevron_down_outline,
              size: 14,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }

  Widget _textField({
    required TextEditingController controller,
    required String hint,
    int maxLines = 1,
    int? maxLength,
    TextInputType keyboard = TextInputType.text,
    ValueChanged<String>? onChanged,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboard,
      maxLines: maxLines,
      maxLength: maxLength,
      onChanged: onChanged,
      style: const TextStyle(fontSize: 11, color: Colors.white),
      cursorColor: _accent,
      decoration: InputDecoration(
        counterText: '',
        hintText: hint,
        hintStyle: const TextStyle(fontSize: 11, color: AppColors.textGray600),
        filled: true,
        fillColor: Colors.black.withOpacity(0.2),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
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

  Widget _whitePillButton(String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 40,
        width: double.infinity,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 9,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w500,
            color: Colors.black,
          ),
        ),
      ),
    );
  }

  Widget _darkPillButton(String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 9,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  Widget _outlineButton(String label, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: Colors.white),
            const SizedBox(width: 7),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 9,
                  letterSpacing: 1,
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

  Widget _toggleRow(String label, bool value, ValueChanged<bool> onChanged) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(fontSize: 11.5, color: Colors.white),
          ),
        ),
        Switch(
          value: value,
          activeColor: Colors.white,
          activeTrackColor: AppColors.successGreen,
          inactiveTrackColor: AppColors.border1,
          onChanged: onChanged,
        ),
      ],
    );
  }

  Widget _sheetTitle(String label) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 12),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          letterSpacing: 2.2,
          fontWeight: FontWeight.w500,
          color: Colors.white,
        ),
      ),
    );
  }

  Widget _sheetSearchField(
    TextEditingController controller,
    String hint,
    VoidCallback onChanged,
  ) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          children: [
            const Icon(
              Ionicons.search_outline,
              size: 15,
              color: AppColors.textGray500,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: controller,
                onChanged: (_) => onChanged(),
                style: const TextStyle(fontSize: 11.5, color: Colors.white),
                cursorColor: _accent,
                decoration: InputDecoration(
                  isDense: true,
                  border: InputBorder.none,
                  hintText: hint,
                  hintStyle: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textGray600,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---- Media pickers ----

  Future<void> _pickMedia() async {
    final files = await pickUploadFiles(
      field: 'images',
      allowMultiple: !widget.videoOnly,
      type: widget.videoOnly ? FileType.custom : FileType.media,
      allowedExtensions: widget.videoOnly ? const ['mp4', 'webm', 'mov'] : null,
    );
    if (!mounted || files.isEmpty) return;
    final selected = files.take(5).toList();
    if (_isUploadContent) {
      ApiUploadFile? video;
      for (final file in selected) {
        if ((file.contentType ?? '').startsWith('video/')) {
          video = file;
          break;
        }
      }
      if (video != null) {
        final accepted = await _acceptUploadContentVideo(video);
        if (!mounted) return;
        if (accepted == null) {
          setState(() {
            _selectedUploadVideoDurationSeconds = null;
            _media = const [];
          });
          return;
        }
        setState(() => _media = [accepted]);
        return;
      }
    }
    final videos = selected.where(_isVideoFile).toList(growable: false);
    final nonImages = selected
        .where((file) => !_isVideoFile(file) && !_isImageFile(file))
        .toList(growable: false);
    if (videos.isNotEmpty && selected.length > 1) {
      AppNotifications.error(
        selected.any(_isImageFile)
            ? 'Upload either one video or one or more images.'
            : 'Please upload a single video, or switch to multiple images.',
      );
      return;
    }
    if (nonImages.isNotEmpty) {
      AppNotifications.error(
        'Only images can be uploaded together in a gallery.',
      );
      return;
    }
    if (videos.isNotEmpty && _isPhotoVideo) {
      final accepted = await _acceptCampaignVideo(videos.first);
      if (!mounted || accepted == null) return;
      setState(() {
        _selectedUploadVideoDurationSeconds = null;
        _media = [accepted];
      });
      return;
    }
    setState(() {
      _selectedUploadVideoDurationSeconds = null;
      _media = selected;
    });
  }

  bool _isVideoFile(ApiUploadFile file) {
    final mime = (file.contentType ?? '').toLowerCase();
    return mime.startsWith('video/') ||
        RegExp(
          r'\.(mp4|mov|avi|mkv|webm|ogg|ogv|m4v|wmv|flv|3gp)$',
          caseSensitive: false,
        ).hasMatch(file.filename);
  }

  bool _isImageFile(ApiUploadFile file) {
    final mime = (file.contentType ?? '').toLowerCase();
    return mime.startsWith('image/') ||
        RegExp(
          r'\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$',
          caseSensitive: false,
        ).hasMatch(file.filename);
  }

  Future<ApiUploadFile?> _acceptCampaignVideo(ApiUploadFile file) async {
    final info = await inspectVideo(file.bytes, file.filename);
    if (info == null || info.duration <= 0) return file;
    if (info.duration <= videoMaxDurationSeconds) {
      releaseVideoUrl(info.sourceUrl);
      return file;
    }
    if (!canTrimVideo) {
      releaseVideoUrl(info.sourceUrl);
      if (mounted) {
        AppNotifications.error(
          'Video too long',
          'Videos must be under ${videoMaxDurationSeconds}s. Trimming needs a browser.',
        );
      }
      return null;
    }
    if (!mounted) {
      releaseVideoUrl(info.sourceUrl);
      return null;
    }
    return _openCampaignTrimSheet(file, info);
  }

  Future<ApiUploadFile?> _openCampaignTrimSheet(
    ApiUploadFile file,
    PendingVideoTrim info,
  ) async {
    var start = 0.0;
    var end = videoMaxDurationSeconds
        .toDouble()
        .clamp(0.0, info.duration)
        .toDouble();
    final result = await showModalBottomSheet<ApiUploadFile?>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      backgroundColor: const Color(0xFF050505),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'VIDEO LIMIT',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.5,
                    fontWeight: FontWeight.w600,
                    color: _accent,
                  ),
                ),
                const SizedBox(height: 5),
                const Text(
                  'Trim video',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'This clip is ${_formatVideoSeconds(info.duration)}. '
                  'Select up to 1:00 to publish.',
                  style: const TextStyle(
                    fontSize: 10.5,
                    height: 1.45,
                    color: AppColors.textGray400,
                  ),
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.fromLTRB(10, 10, 10, 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF111114),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            _formatVideoSeconds(start),
                            style: const TextStyle(
                              fontSize: 10,
                              color: AppColors.textGray400,
                            ),
                          ),
                          Text(
                            _formatVideoSeconds(end),
                            style: const TextStyle(
                              fontSize: 10,
                              color: AppColors.textGray400,
                            ),
                          ),
                        ],
                      ),
                      RangeSlider(
                        min: 0,
                        max: info.duration,
                        values: RangeValues(start, end),
                        activeColor: _accent,
                        inactiveColor: Colors.white12,
                        onChanged: _trimming
                            ? null
                            : (values) => setSheet(() {
                                start = values.start;
                                end = values.end;
                                if (end - start > videoMaxDurationSeconds) {
                                  end = start + videoMaxDurationSeconds;
                                }
                              }),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _trimAction(
                        'CANCEL',
                        false,
                        _trimming
                            ? null
                            : () => Navigator.pop(sheetContext, null),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _trimAction(
                        'SAVE CLIP',
                        true,
                        _trimming
                            ? null
                            : () async {
                                setSheet(() => _trimming = true);
                                try {
                                  final bytes = await trimVideoClip(
                                    info.sourceUrl,
                                    startSeconds: start,
                                    endSeconds: end,
                                  );
                                  if (!sheetContext.mounted) return;
                                  Navigator.pop(
                                    sheetContext,
                                    ApiUploadFile(
                                      field: 'images',
                                      filename: _trimmedVideoName(
                                        file.filename,
                                      ),
                                      bytes: bytes,
                                      contentType: 'video/webm',
                                    ),
                                  );
                                } catch (error) {
                                  setSheet(() => _trimming = false);
                                  AppNotifications.error(
                                    'Trim failed',
                                    '$error',
                                  );
                                }
                              },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
    releaseVideoUrl(info.sourceUrl);
    if (mounted) setState(() => _trimming = false);
    return result;
  }

  Widget _trimAction(String label, bool primary, VoidCallback? onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: primary
              ? _accent.withOpacity(onTap == null ? 0.5 : 1)
              : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(11),
          border: primary ? null : Border.all(color: AppColors.borderWhite10),
        ),
        child: _trimming && primary
            ? const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                label,
                style: const TextStyle(
                  fontSize: 9,
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
      ),
    );
  }

  String _trimmedVideoName(String original) {
    final base = original.contains('.')
        ? original.substring(0, original.lastIndexOf('.'))
        : original;
    return '$base-trimmed.webm';
  }

  Future<ApiUploadFile?> _acceptUploadContentVideo(ApiUploadFile file) async {
    final info = await inspectVideo(file.bytes, file.filename);
    if (info == null || info.duration <= 0) {
      _selectedUploadVideoDurationSeconds = null;
      return file;
    }
    final duration = info.duration;
    releaseVideoUrl(info.sourceUrl);
    if (duration > _uploadVideoLimitSeconds) {
      _selectedUploadVideoDurationSeconds = duration;
      if (mounted) _showUploadVideoDurationPrompt(duration);
      return null;
    }
    _selectedUploadVideoDurationSeconds = duration;
    return file;
  }

  Future<void> _pickPreview() async {
    final files = await pickUploadFiles(field: 'preview', type: FileType.media);
    if (!mounted || files.isEmpty) return;
    setState(() => _preview = files.first);
  }

  // ---- Publish ----

  String get _mediaType {
    if (_isProductPromote) return 'link';
    if (_isProfilePromote) return 'profile';
    if (_media.isEmpty) return _activeLink.isEmpty ? '' : 'link';
    final mime = _media.first.contentType ?? '';
    return mime.startsWith('video/') ? 'video' : 'image';
  }

  /// Everything that must be true before any money moves. Returns the message
  /// to show, or null when the campaign is publishable.
  String? _validate() {
    if (_isUploadContent) {
      return _media.isEmpty && _activeLink.isEmpty
          ? 'Add media or a link before publishing'
          : null;
    }
    if (_isProductPromote && _linkedProduct == null) {
      return 'Please apply a product share link first.';
    }
    if (_isProfilePromote && _activeLink.trim().isEmpty) {
      return 'Please apply your profile link first.';
    }
    if (_isPhotoVideo && _media.isEmpty && _activeLink.trim().isEmpty) {
      return 'Please add a link or upload an image.';
    }
    if (_isPhotoVideo) {
      final ctaDetail = _ctaFieldLabels[_ctaTopic] ?? '';
      if (_ctaTopic.trim().isEmpty) {
        return 'Please select a call to action.';
      }
      if (ctaDetail.isNotEmpty && _ctaValue.text.trim().isEmpty) {
        return 'Please enter ${ctaDetail.toLowerCase()}.';
      }
      if (_ctaTopic == 'Call Now') {
        final digits = _ctaValue.text.replaceAll(RegExp(r'\D'), '');
        if (digits.isEmpty || _ctaValue.text.trim().startsWith('0')) {
          return 'Please enter the full phone number without the starting 0.';
        }
        if (digits.length < 10) {
          return 'Please enter the full phone number with country code. Half numbers cannot be published.';
        }
      }
    }
    if (!_tiersLoaded) {
      return 'No ad packages are currently available. Please try again later.';
    }
    if (_budget == null) {
      return _isProfilePromote
          ? 'Please select a budget package.'
          : 'Please set a budget.';
    }
    if (_activeTier == null) {
      return 'Please select a valid budget.';
    }
    if (_durationDays < 1) {
      return 'Please select a duration.';
    }
    if (_allowedCountryCodes != null && _allowedCountryCodes!.isEmpty) {
      return 'No countries are available for this ad type right now.';
    }
    if (_countryCodes.isEmpty) {
      return 'Please select at least one location.';
    }
    if (_ageMin < 18 || _ageMax > 65 || _ageMin > _ageMax) {
      return 'Please select a valid age range.';
    }
    if (_isProfilePromote && !_promoAdded && !_acceptedNonRefundable) {
      return 'Please accept the non-refundable profile promotion package condition.';
    }
    if (_insufficientBalance) {
      return 'Insufficient wallet balance. Please top up your wallet.';
    }
    return null;
  }

  Future<void> _publish() async {
    final problem = _validate();
    if (problem != null) {
      AppNotifications.error(problem);
      return;
    }
    setState(() => _submitting = true);

    if (_isUploadContent) {
      final usage = await Api.mySubscriptionUsage();
      if (!mounted) return;
      if (_uploadVideoDurationAtLimit()) {
        setState(() => _submitting = false);
        _showUploadVideoDurationPrompt(_selectedUploadVideoDurationSeconds);
        return;
      }
      if (_uploadContentAtLimit(usage)) {
        setState(() => _submitting = false);
        _showUploadContentUpgradePrompt();
        return;
      }
      final error = await Api.createUploadContent(
        _uploadContentPayload(),
        media: _media,
        preview: _preview,
      );
      if (!mounted) return;
      setState(() => _submitting = false);
      if (error == null) {
        AppNotifications.success('Published', '${widget.title} was submitted.');
        Navigator.maybePop(context);
      } else {
        if (_isSubscriptionLimitError(error)) {
          _showUploadContentUpgradePrompt();
        }
        AppNotifications.error('Publish failed', error);
      }
      return;
    }

    final adId = _newAdId();
    final payable = _payableAmount;

    // Pay first: the web charges the wallet before creating the ad, so a
    // failed payment must not leave an unpaid campaign behind.
    if (payable > 0) {
      try {
        if (_isProfilePromote) {
          await Api.walletPayProfilePromote(
            payable,
            orderId: adId,
            note:
                'Ad Hold Summary - Profile Promotion - Ad ID: $adId - '
                'Hold Amount: R ${payable.toStringAsFixed(2)}',
          );
        } else {
          await Api.walletPayOrder(
            payable,
            note: 'Ad Promote - $adId - ${_promotionLabel()}',
          );
        }
      } on ApiError catch (e) {
        if (!mounted) return;
        setState(() => _submitting = false);
        if (_isInsufficientPaymentError(e.message)) {
          _showInsufficientFundsDialog();
          return;
        }
        AppNotifications.error('Payment failed', e.message);
        return;
      } catch (_) {
        if (!mounted) return;
        setState(() => _submitting = false);
        AppNotifications.error('Payment failed', 'Could not reach the server.');
        return;
      }
    } else if (_promoAdded) {
      // A fully discounted campaign still needs a zero-value ledger entry so it
      // appears in transaction history. Never block publish on this.
      try {
        await Api.walletRecordPromoAd(adId, campaignType: _promotionLabel());
      } catch (_) {}
    }

    final error = await Api.createAd(_adPayload(adId), media: _media);
    if (!mounted) return;

    if (error != null) {
      setState(() => _submitting = false);
      if (_isSubscriptionLimitError(error)) {
        UpgradePlanSheet.show(
          context,
          subtitle: 'Subscribe to promote more ads',
          limitMessage:
              'If your ad limit or promo allowance has been reached, please subscribe to a higher plan below.',
        );
      }
      AppNotifications.error('Publish failed', error);
      return;
    }

    // Redeem only after the ad exists, so a failed create never burns the code.
    if (_promoAdded && _promoCode.text.trim().isNotEmpty) {
      try {
        await Api.redeemPromoCode(
          _promoCode.text.trim().toUpperCase(),
          _reachAdType,
          adId,
        );
      } catch (_) {}
    }

    if (!mounted) return;
    setState(() => _submitting = false);
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_draftKey);
    if (!mounted) return;
    AppNotifications.success('Published', '${widget.title} was submitted.');
    Navigator.maybePop(context);
  }

  bool _isSubscriptionLimitError(String error) {
    final text = error.toLowerCase();
    return text.contains('subscription') ||
        text.contains('higher plan') ||
        text.contains('upgrade to') ||
        text.contains('ad save limit') ||
        text.contains('ad limit') ||
        text.contains('upload content limit') ||
        text.contains('daily upload limit');
  }

  bool _isInsufficientPaymentError(String error) {
    final text = error.toLowerCase();
    return text.contains('insufficient') ||
        text.contains('not have enough') ||
        text.contains('not enough') ||
        text.contains('balance');
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

  bool _uploadVideoDurationAtLimit() {
    final duration = _selectedUploadVideoDurationSeconds;
    return _isUploadContent &&
        _mediaType == 'video' &&
        duration != null &&
        duration > _uploadVideoLimitSeconds;
  }

  String _formatVideoSeconds(num seconds) {
    final total = seconds.round();
    final minutes = total ~/ 60;
    final secs = total % 60;
    return '$minutes:${secs.toString().padLeft(2, '0')}';
  }

  void _showUploadContentUpgradePrompt() {
    UpgradePlanSheet.show(
      context,
      subtitle: 'Subscribe to upload more content',
      limitMessage:
          'If you have reached your upload content limit, please subscribe to a higher plan below.',
    );
  }

  void _showUploadVideoDurationPrompt([num? actualSeconds]) {
    final actual = actualSeconds == null
        ? ''
        : ' This video is ${_formatVideoSeconds(actualSeconds)}.';
    UpgradePlanSheet.show(
      context,
      subtitle: 'Subscribe to upload longer videos',
      limitMessage:
          'Your plan allows videos up to ${_formatVideoSeconds(_uploadVideoLimitSeconds)}.$actual Subscribe to a higher plan for longer uploads.',
    );
  }

  String _promotionLabel() {
    if (_isProfilePromote) return 'Profile Promote';
    if (_isProductPromote) return 'Product Promote';
    return _mediaType == 'video' ? 'Video Promote' : 'Photo Promote';
  }

  String _newAdId() {
    final now = DateTime.now().millisecondsSinceEpoch;
    return '${1000000000 + Random().nextInt(899999999)}${now % 10}';
  }

  Map<String, dynamic> _uploadContentPayload() {
    final isFlash = _type.contains('flash');
    return {
      'description': _description.text.trim(),
      'topic': widget.campaignType,
      'price': double.tryParse(_price.text.trim()) ?? 500,
      'contentType': isFlash ? 'flash' : 'vault',
      'mediaType': _media.isEmpty
          ? (_activeLink.isEmpty ? 'image' : 'link')
          : ((_media.first.contentType ?? '').startsWith('video/')
                ? 'video'
                : 'image'),
      'allowComments': _allowComments,
      'visibility': 'public',
      'previewMode': _preview == null ? 'thumbnail' : 'auto_preview',
      'externalLink': _activeLink,
      'contentAccessMode': isFlash ? 'unblurred' : 'blurred',
      'videoPreviewSeconds': int.tryParse(_previewSeconds.text.trim()) ?? 10,
      'videoDurationSeconds': _mediaType == 'video'
          ? (_selectedUploadVideoDurationSeconds?.ceil() ??
                _uploadVideoLimitSeconds)
          : 0,
      'subscriptionPackages': const [],
    };
  }

  /// Mirrors the web's `reviewRecord`: targeting that the delivery gate reads
  /// (gender, age) sits at the top level, and the rest of the builder state
  /// goes in `editDraft` so re-opening the campaign restores it.
  Map<String, dynamic> _adPayload(String adId) {
    final estimate = _reachEstimate;
    final tier = _activeTier;
    final budget = _budget ?? 0;

    return {
      'adId': adId,
      'campaignType': widget.campaignType,
      'title': _isProductPromote && _linkedProduct != null
          ? '${_linkedProduct!['title'] ?? widget.title}'
          : _isProfilePromote
          ? Api.displayName
          : widget.title,
      'description': _description.text.trim(),
      'mediaType': _mediaType,
      'genderTarget': _gender,
      'ageMin': _ageMin,
      'ageMax': _ageMax,
      'budget': budget,
      'remainingBudget': budget,
      'durationDays': _effectiveDurationDays,
      'reach': 0,
      'impressions': 0,
      'clicks': 0,
      'spend': 0,
      if (tier != null) 'tierId': tier.id,
      if (estimate != null) 'estimatedReachMin': estimate.minReach,
      if (estimate != null) 'estimatedReachMax': estimate.maxReach,
      if (estimate?.reachCap != null) 'maxReachCap': estimate!.reachCap,
      'promoCode': _promoAdded ? _promoCode.text.trim().toUpperCase() : null,
      'promoDiscount': _promoAdded && _promoDiscountType == 'reach'
          ? _promoDiscountValue
          : null,
      'status': 'Under Review',
      'campaignPath': _campaignPath,
      'ctaText': _ctaTopic,
      'ctaValue': _ctaValue.text.trim(),
      'activeLink': _activeLink,
      'editDraft': {
        'activeLink': _activeLink,
        'description': _description.text.trim(),
        'ctaTopic': _ctaTopic,
        'ctaValue': _ctaValue.text.trim(),
        'selectedLocationCodes': _countryCodes.toList(),
        'genderTarget': _gender,
        'ageMin': _ageMin,
        'ageMax': _ageMax,
        'selectedInterestTopics': _interests.toList(),
        'selectedPlacements': _placements.toList(),
        'budget': budget,
        'durationDays': _durationDays,
        'promoCode': _promoAdded ? _promoCode.text.trim().toUpperCase() : '',
        'hasPromoCodeAdded': _promoAdded,
        'effectivePaymentAmount': _payableAmount,
        'isFreePromoAd': _promoAdded && _payableAmount == 0,
        'mediaType': _mediaType,
        if (_isProfilePromote) ...{
          'profileUsername': Api.username,
          'profileLink': _activeLink,
          'featuredProductIds': _profileFeaturedItems
              .where((item) => item['__profilePromoteType'] == 'product')
              .map((item) => item['id'])
              .toList(),
          'featuredItems': _profileFeaturedItems
              .map(
                (item) => {
                  ...item,
                  'type': item['__profilePromoteType'],
                  'contentId': item['content_id'],
                  'mediaType': item['media_type'],
                  'contentAccessMode': item['content_access_mode'],
                  'previewMode': item['preview_mode'],
                  'blurred': item['content_access_mode'] == 'blurred',
                  'is_blurred': item['content_access_mode'] == 'blurred',
                },
              )
              .toList(),
          'promotedProfileUserId': Api.currentUserId,
        },
        if (_isProductPromote && _linkedProduct != null)
          'linkedProductId': _linkedProduct!['id'],
      },
    };
  }
}

/// Uppercases promo codes as they are typed, matching the web's
/// `sanitizePromoCode`.
class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    return newValue.copyWith(text: newValue.text.toUpperCase());
  }
}

class _SectionPlaceholder extends StatelessWidget {
  final String label;
  const _SectionPlaceholder({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Center(
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w500,
            color: AppColors.textGray600,
          ),
        ),
      ),
    );
  }
}

/// White-ringed accent thumb with a soft glow — the screenshots show this on
/// every slider, and neither of Flutter's stock thumb shapes draws a ring.
class _GlowThumbShape extends SliderComponentShape {
  static const radius = 10.0;
  const _GlowThumbShape();

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) =>
      Size.fromRadius(radius);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    required bool isDiscrete,
    required TextPainter labelPainter,
    required RenderBox parentBox,
    required SliderThemeData sliderTheme,
    required TextDirection textDirection,
    required double value,
    required double textScaleFactor,
    required Size sizeWithOverflow,
  }) {
    _paintGlowThumb(
      context.canvas,
      center,
      radius,
      sliderTheme.thumbColor ?? Colors.white,
    );
  }
}

class _GlowRangeThumbShape extends RangeSliderThumbShape {
  static const radius = 10.0;
  const _GlowRangeThumbShape();

  @override
  Size getPreferredSize(bool isEnabled, bool isDiscrete) =>
      Size.fromRadius(radius);

  @override
  void paint(
    PaintingContext context,
    Offset center, {
    required Animation<double> activationAnimation,
    required Animation<double> enableAnimation,
    bool? isDiscrete,
    bool? isEnabled,
    bool? isOnTop,
    SliderThemeData? sliderTheme,
    TextDirection? textDirection,
    Thumb? thumb,
    bool? isPressed,
  }) {
    _paintGlowThumb(
      context.canvas,
      center,
      radius,
      sliderTheme?.activeTrackColor ?? Colors.white,
    );
  }
}

void _paintGlowThumb(Canvas canvas, Offset center, double radius, Color color) {
  canvas.drawCircle(
    center,
    radius + 4,
    Paint()
      ..color = color.withOpacity(0.32)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
  );
  canvas.drawCircle(center, radius, Paint()..color = color);
  canvas.drawCircle(
    center,
    radius - 1,
    Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2,
  );
}
