import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../data/mock.dart' show GoogPost, HomeAd, UploadContent;
import '../services/app_notifications.dart';
import '../theme/app_theme.dart';
import '../theme/colors.dart';
import '../util/open_link.dart';
import '../util/profile_photo_picker.dart';
import '../util/storage.dart';
import '../widgets/googer_bottom_nav.dart';
import '../widgets/verified_badge.dart';
import 'ad_campaign_screen.dart';
import 'chat_dm_screen.dart';
import 'help_support_screen.dart';
import 'home_feed_screen.dart';
import 'product_promote_screen.dart';
import 'settings_screen.dart';
import 'shop_feed_screen.dart';
import 'terms_policies_screen.dart';

/// Profile — live port of the web `dashboard/profile`, for your own account
/// and for anybody else's. Pass [userId] to view another Googer; leave it off
/// for the signed-in user. Both render the same header, stats and columns; the
/// only differences are the ones the web draws too — no Googers list, no
/// account destinations, and a working Subscribe on somebody else's page.
class ProfileScreen extends StatefulWidget {
  /// Empty (the default) means the signed-in user's own profile.
  final String userId;

  /// Known up front from the row that opened this screen, so the header can
  /// paint before `/auth/user/{id}` comes back.
  final String username;
  final String displayName;
  final String avatar;

  const ProfileScreen({
    super.key,
    this.userId = '',
    this.username = '',
    this.displayName = '',
    this.avatar = '',
  });

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  /// The content columns. Order is the viewer's — long-press any tab and drag
  /// it along the strip — and is remembered per device.
  static const _defaultTabs = ['Googs', 'Products', 'Ads', 'Repost'];
  static const _tabOrderKey = 'googer_profile_tab_order';

  List<String> _tabs = List<String>.from(_defaultTabs);
  int _tab = 0;
  bool _loading = true;

  List<GoogPost> _googs = const [];

  /// Raw `/market` rows rather than the trimmed [Product] model, because the
  /// Products column renders with the shop's own card and that card reads the
  /// full row (stock, variants, seller, counts).
  List<Map<String, dynamic>> _products = const [];

  /// The upload endpoints return the user's own uploads *and* the rows they
  /// reposted (reposts carry `reposted_by_*`), so one call feeds both the
  /// uploads under Googs and the Repost column.
  List<UploadContent> _uploads = const [];
  List<UploadContent> _reposts = const [];

  /// Running ads only, so paused, completed and under-review campaigns stay in
  /// the Ad Center.
  List<HomeAd> _ads = const [];
  Set<String> _savedAdIds = const <String>{};
  bool _viewerHasPaidPlan = false;

  /// The viewed account, once `/auth/user/{id}` answers. Own profile reads the
  /// live `Api` session instead.
  Map<String, dynamic>? _other;

  int _followers = 0;
  int _following = 0;
  int _views = 0;
  int _profileViews = 0;

  /// Total likes across this profile's googs and uploads — the fourth stat.
  int _likes = 0;

  bool _blocked = false;
  bool _subscribed = false;
  bool _busySubscribe = false;
  bool _savingProfilePhoto = false;
  Uint8List? _localAvatarBytes;

  /// Drives the copy button's tick, which reverts after three seconds.
  bool _copied = false;
  Timer? _copyTimer;

  bool get _isSelf {
    final id = widget.userId.trim();
    return id.isEmpty || id == Api.currentUserId.trim();
  }

  String get _uid => _isSelf ? Api.currentUserId : widget.userId.trim();

  String get _displayName {
    if (_isSelf) return Api.displayName;
    final fromApi = '${_other?["full_name"] ?? ""}'.trim();
    if (fromApi.isNotEmpty) return fromApi;
    return widget.displayName.trim().isEmpty
        ? widget.username.trim()
        : widget.displayName.trim();
  }

  String get _handle {
    if (_isSelf) return Api.username;
    final fromApi = '${_other?["username"] ?? ""}'.trim();
    return fromApi.isNotEmpty ? fromApi : widget.username.trim();
  }

  String get _avatarUrl {
    if (_isSelf) return Api.avatar ?? '';
    final fromApi = Api.rawAvatar(_other) ?? '';
    return Api.resolveAvatar(fromApi.isEmpty ? widget.avatar : fromApi);
  }

  String get _googerId => _isSelf
      ? Api.googerId
      : '${_other?["user_id"] ?? _other?["googer_id"] ?? ""}'.trim();

  String get _bio => '${(_isSelf ? Api.user : _other)?["bio"] ?? ""}'.trim();

  @override
  void initState() {
    super.initState();
    _restoreTabOrder();
    _load();
    // The web counts a profile view whenever somebody else opens the page.
    if (!_isSelf) unawaited(Api.logProfileView(_uid));
  }

  @override
  void dispose() {
    _copyTimer?.cancel();
    super.dispose();
  }

  void _restoreTabOrder() {
    final saved = readStorage(_tabOrderKey);
    if (saved == null || saved.trim().isEmpty) return;
    final order = saved.split(',').map((t) => t.trim()).toList();
    // Only honour a saved order that still names exactly the current columns,
    // so adding or renaming a tab later cannot strand it off the strip.
    if (order.length != _defaultTabs.length) return;
    if (!_defaultTabs.every(order.contains)) return;
    _tabs = order;
  }

  /// [silent] keeps the columns on screen while refreshing, so a subscribe or
  /// a hide does not blank the page out to a spinner.
  Future<void> _load({bool silent = false}) async {
    if (mounted && !silent) setState(() => _loading = true);
    if (_isSelf) await Api.refreshProfile();
    final requestedId = _uid;
    final viewedUser = _isSelf ? null : await Api.userById(requestedId);
    final resolvedId = '${viewedUser?["id"] ?? ""}'.trim();
    // Web resolves a public Googer ID/username to users.id before loading all
    // profile collections. The ads endpoint only accepts that canonical ID.
    final id = _isSelf
        ? Api.currentUserId
        : (resolvedId.isEmpty ? requestedId : resolvedId);
    final profileSavedAdsFuture = _isSelf
        ? Api.savedAds()
        : Api.publicSavedAds(id);
    final viewerSavedAdIdsFuture = Api.loggedIn
        ? Api.savedAdIds()
        : Future.value(const <String>{});
    final results = await Future.wait([
      Api.userGoogs(id),
      Api.userMarketItems(id),
      Api.followers(id),
      Api.following(id),
      Api.profileViews(id),
      _isSelf ? Api.myUploads() : Api.userUploads(id),
      _isSelf ? Api.myAds() : Future.value(const <Map<String, dynamic>>[]),
      Future.value(viewedUser),
      _isSelf ? Future.value(const <String>{}) : Api.blockedUserIds(),
      _isSelf ? Future.value(const <HomeAd>[]) : Api.userAds(id),
      // The web reads `is_subscribed` for every profile it renders, own
      // included, so the button starts in the right state everywhere.
      Api.isSubscribedTo(id),
      // `/ads/saves` on your own page, `/ads/saved-public/{id}` on anybody
      // else's — the two sources the web's ad merge draws its finished
      // campaigns from.
      profileSavedAdsFuture,
      viewerSavedAdIdsFuture,
      Api.loggedIn ? Api.myPlan() : Future.value(null),
    ]);
    if (!mounted) return;
    final googs = results[0] as List<GoogPost>;
    final uploads = results[5] as List<UploadContent>;
    // Own ads come back as raw rows that still carry every status, so filter to
    // the running ones and reuse the typed feed shape. Another user's are
    // already the active-public set.
    final running = _isSelf
        ? Api.parseHomeAds(
            (results[6] as List<Map<String, dynamic>>).where(
              (ad) => '${ad["status"] ?? ""}'.trim().toLowerCase() == 'active',
            ),
          )
        : results[9] as List<HomeAd>;
    final ads = _mergeSavedAds(
      running,
      results[11] as List<Map<String, dynamic>>,
    );
    final savedAdIds = results[12] as Set<String>;
    final viewerPlan = results[13] as Map<String, dynamic>?;
    // Own uploads only — a repost carries the original author's like count, so
    // counting it here would credit this profile with somebody else's likes.
    final ownUploads = uploads
        .where((u) => u.repostedByName.trim().isEmpty)
        .toList(growable: false);
    int rawCount(Map<String, dynamic> row, List<String> keys) {
      for (final key in keys) {
        final parsed = int.tryParse('${row[key] ?? ''}');
        if (parsed != null) return parsed;
      }
      return 0;
    }

    final productViews = (results[1] as List<Map<String, dynamic>>).fold<int>(
      0,
      (sum, row) =>
          sum + rawCount(row, const ['views_count', 'views', 'view_count']),
    );
    final contentViews =
        googs.fold<int>(0, (sum, g) => sum + g.views) +
        productViews +
        ownUploads.fold<int>(0, (sum, u) => sum + u.views) +
        ads.fold<int>(0, (sum, ad) => sum + ad.views);
    setState(() {
      _googs = googs;
      _products = results[1] as List<Map<String, dynamic>>;
      // "Googers" is the web's name for followers; "Subscriptions" is
      // following. The header count and the sheet tabs both read from these.
      _followers = (results[2] as List).length;
      _following = (results[3] as List).length;
      _profileViews = (results[4] as List).length;
      _views = contentViews;
      _uploads = ownUploads;
      _reposts = uploads
          .where((u) => u.repostedByName.trim().isNotEmpty)
          .toList(growable: false);
      _ads = ads;
      _savedAdIds = savedAdIds;
      _viewerHasPaidPlan = _isPaidPlan(viewerPlan);
      _likes =
          googs.fold<int>(0, (sum, g) => sum + g.likes) +
          ownUploads.fold<int>(0, (sum, u) => sum + u.likes);
      // Never let a background refresh stomp the state a tap just set.
      if (!_busySubscribe) _subscribed = results[10] as bool;
      if (!_isSelf) {
        _other = results[7] as Map<String, dynamic>?;
        _blocked = (results[8] as Set).contains(_uid);
      }
      _loading = false;
    });
  }

  bool _isPaidPlan(Map<String, dynamic>? plan) {
    if (plan == null) return false;
    final rawBasic = plan['is_basic'];
    final isBasic =
        rawBasic == true ||
        rawBasic == 1 ||
        '$rawBasic'.trim().toLowerCase() == 'true' ||
        '${plan['slug'] ?? ''}'.trim().toLowerCase() == 'basic';
    return !isBasic;
  }

  /// Web `mergeActiveAdsWithSavedCompletedAds`: a campaign that has finished
  /// still belongs on the profile as long as it was saved, so the Ads column
  /// keeps the running ones and appends the completed saved ones behind them.
  /// The running row wins a clash because it carries the live media.
  List<HomeAd> _mergeSavedAds(
    List<HomeAd> running,
    List<Map<String, dynamic>> saved,
  ) {
    final completed = saved.where((ad) {
      final status = '${ad["status"] ?? ""}'.trim().toLowerCase().replaceAll(
        RegExp(r'[_-]+'),
        ' ',
      );
      if (status != 'completed') return false;
      // Somebody else's page shows only the rows the endpoint stamped with a
      // save time, the way `getPublicCompletedSavedAds` filters them.
      if (_isSelf) return true;
      return '${ad["saved_at"] ?? ad["savedAt"] ?? ""}'.trim().isNotEmpty;
    });
    final seen = running.map((ad) => ad.adId).toSet();
    return [
      ...running,
      ...Api.parseHomeAds(completed).where((ad) => seen.add(ad.adId)),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.textGray300,
          backgroundColor: AppColors.bg1,
          onRefresh: _load,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _profileCard()),
              SliverToBoxAdapter(child: _tabStrip()),
              if (_loading)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(
                      child: SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                          color: AppColors.textGray400,
                          strokeWidth: 2,
                        ),
                      ),
                    ),
                  ),
                )
              else
                _tabSliver(),
            ],
          ),
        ),
      ),
      // The profile is pushed over the home shell, so the nav lives here too.
      // Picking a destination raises it on the shell and pops back to it
      // rather than stacking a second copy of the whole app.
      bottomNavigationBar: GoogerBottomNav(
        active: GoogerTab.home,
        onTap: _goToShellTab,
        onAddTap: () => AdCampaignScreen.showCreateSheet(
          context,
          onGoogPosted: () => _load(),
        ),
      ),
    );
  }

  void _goToShellTab(GoogerTab tab) {
    HomeFeedScreen.requestedTab.value = switch (tab) {
      GoogerTab.shop => HomeFeedScreen.shopTab,
      GoogerTab.wallet => HomeFeedScreen.walletTab,
      GoogerTab.chats => HomeFeedScreen.chatsTab,
      GoogerTab.home => HomeFeedScreen.homeTab,
    };
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  /// The header, flush with the page — no card border or tinted fill, so the
  /// avatar sits in the top-left corner and the views count and menu sit in the
  /// top-right, level with the name.
  Widget _profileCard() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _identityBlock(),
          const SizedBox(height: 16),
          _bioBlock(),
          const SizedBox(height: 18),
          _statsRow(),
          const SizedBox(height: 20),
          _actionRow(),
        ],
      ),
    );
  }

  int get _googsContentCount => _googs.length + _uploads.length + _ads.length;

  /// Googs, Googers, Views and Likes side by side, every count in the same
  /// type so no one stat reads as more important than the others. The web only
  /// opens the Googers list on your own profile, so on anybody else's the
  /// count is text rather than a tap target.
  Widget _statsRow() {
    return Row(
      children: [
        Expanded(child: _stat('$_googsContentCount', 'Googs')),
        Expanded(
          child: _stat(
            '$_followers',
            'Googers',
            onTap: _isSelf ? _openGoogersSheet : null,
          ),
        ),
        Expanded(child: _stat('$_views', 'Views')),
        Expanded(child: _stat('$_likes', 'Likes')),
      ],
    );
  }

  Widget _stat(String value, String label, {VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        children: [
          Text(
            value,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _viewsPill() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Ionicons.eye_outline,
            size: 11,
            color: AppColors.textGray300,
          ),
          const SizedBox(width: 4),
          Text(
            '$_profileViews',
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  /// Two stacked dots rather than three, matching the shop's overflow glyph.
  Widget _menuButton() {
    return GestureDetector(
      onTap: _openProfileMenu,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 30,
        height: 30,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [_menuDot(), const SizedBox(height: 3), _menuDot()],
          ),
        ),
      ),
    );
  }

  Widget _menuDot() => Container(
    width: 4,
    height: 4,
    decoration: const BoxDecoration(
      color: AppColors.textGray300,
      shape: BoxShape.circle,
    ),
  );

  /// Subscribe / Subscribed, the same two-way toggle the web profile draws —
  /// `handleToggleSubscription` there has no own-profile check either, so this
  /// behaves identically on every profile: white while unsubscribed, grey once
  /// subscribed, and keeps its visible label stable while the call is in flight.
  Widget _subscribeButton() {
    return GestureDetector(
      onTap: _busySubscribe ? null : _toggleSubscribe,
      child: Opacity(
        opacity: _busySubscribe ? 0.7 : 1,
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _subscribed ? _subscribedGrey : Colors.white,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            _subscribed ? 'Subscribed' : 'Subscribe',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: _subscribed ? Colors.white : Colors.black,
            ),
          ),
        ),
      ),
    );
  }

  /// The web's `bg-zinc-700` for the subscribed state.
  static const _subscribedGrey = Color(0xFF3F3F46);

  Widget _identityBlock() {
    final avatar = _avatarUrl;
    final name = _displayName;
    final googerId = _googerId;
    final controls = Row(
      mainAxisSize: MainAxisSize.min,
      children: [_viewsPill(), const SizedBox(width: 4), _menuButton()],
    );
    final longName = name.trim().runes.length > 15;
    if (longName) {
      return _identityMain(
        avatar,
        name,
        googerId,
        controlsBelowHandle: Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Align(alignment: Alignment.centerRight, child: controls),
        ),
      );
    }
    return Stack(
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 62),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [_identityMain(avatar, name, googerId)],
          ),
        ),
        Positioned(top: 0, right: 0, child: controls),
      ],
    );
  }

  Widget _identityMain(
    String avatar,
    String name,
    String googerId, {
    Widget? controlsBelowHandle,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _isSelf && !_savingProfilePhoto
              ? _changeProfilePhotoSheet
              : null,
          behavior: HitTestBehavior.opaque,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 78,
                height: 78,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.bg2,
                  border: Border.all(color: AppColors.borderWhite10, width: 2),
                ),
                child: _localAvatarBytes != null
                    ? Image.memory(_localAvatarBytes!, fit: BoxFit.cover)
                    : avatar.isEmpty
                    ? Center(
                        child: Text(
                          name.isEmpty
                              ? '?'
                              : name.substring(0, 1).toUpperCase(),
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      )
                    : (() {
                        final bytes = Api.decodeDataUri(avatar);
                        if (bytes != null) {
                          return Image.memory(
                            bytes,
                            key: ValueKey(avatar),
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(
                              Ionicons.person_outline,
                              color: AppColors.slateIcon,
                            ),
                          );
                        }
                        return Image.network(
                          avatar,
                          key: ValueKey(avatar),
                          fit: BoxFit.cover,
                          webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                          errorBuilder: (_, __, ___) => const Icon(
                            Ionicons.person_outline,
                            color: AppColors.slateIcon,
                          ),
                        );
                      })(),
              ),
              if (_isSelf)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: 24,
                    height: 24,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.bg0, width: 2),
                    ),
                    child: _savingProfilePhoto
                        ? const SizedBox(
                            width: 11,
                            height: 11,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.7,
                              color: Colors.black,
                            ),
                          )
                        : const Icon(
                            Ionicons.camera_outline,
                            size: 13,
                            color: Colors.black,
                          ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 22,
                        height: 1.15,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  UserVerifiedBadge(userId: _uid, size: 16),
                ],
              ),
              const SizedBox(height: 5),
              Text(
                '@$_handle',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textGray400,
                ),
              ),
              if (controlsBelowHandle != null) controlsBelowHandle,
              if (googerId.isNotEmpty) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        'Googer ID: $googerId',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textGray500,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _copyButton(googerId),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  /// Turns into a green tick the moment the ID is on the clipboard, then goes
  /// back to the copy glyph after three seconds — the confirmation the web
  /// gives, without a toast.
  Widget _copyButton(String googerId) {
    return GestureDetector(
      onTap: () {
        Clipboard.setData(ClipboardData(text: googerId));
        _copyTimer?.cancel();
        setState(() => _copied = true);
        _copyTimer = Timer(const Duration(seconds: 3), () {
          if (mounted) setState(() => _copied = false);
        });
      },
      child: Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Icon(
          _copied ? Ionicons.checkmark_outline : Ionicons.copy_outline,
          size: 13,
          color: _copied ? AppColors.successGreen : AppColors.textGray300,
        ),
      ),
    );
  }

  /// Bio, rendered the way the web does: plain lines as text, `@mentions` and
  /// `#hashtags` in link blue, and any URL pulled out onto its own row with a
  /// link icon.
  Widget _bioBlock() {
    final bio = _bio;
    if (bio.isEmpty) return const SizedBox.shrink();

    final urlPattern = RegExp(r'(https?://\S+|www\.\S+)', caseSensitive: false);
    final textLines = <String>[];
    final links = <String>[];

    for (final rawLine in bio.split('\n')) {
      final line = rawLine.trim();
      if (line.isEmpty) continue;
      if (urlPattern.hasMatch(line) && urlPattern.stringMatch(line) == line) {
        links.add(line);
      } else {
        textLines.add(line);
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final line in textLines)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _bioLine(line),
          ),
        for (final link in links)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                const Icon(
                  Ionicons.link_outline,
                  size: 15,
                  color: AppColors.textGray400,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    link.replaceFirst(RegExp(r'^https?://'), ''),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.linkBlue,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  /// Splits a bio line so `@handles` and `#tags` render in link blue while the
  /// surrounding words stay neutral.
  Widget _bioLine(String line) {
    final spans = <TextSpan>[];
    final token = RegExp(r'([@#][\w.]+)');
    var index = 0;
    for (final match in token.allMatches(line)) {
      if (match.start > index) {
        spans.add(TextSpan(text: line.substring(index, match.start)));
      }
      spans.add(
        TextSpan(
          text: match.group(0),
          style: const TextStyle(color: AppColors.linkBlue),
        ),
      );
      index = match.end;
    }
    if (index < line.length) spans.add(TextSpan(text: line.substring(index)));

    return Text.rich(
      TextSpan(children: spans),
      style: const TextStyle(
        fontSize: 14,
        height: 1.45,
        color: AppColors.textGray200,
      ),
    );
  }

  /// One line of actions: a mail icon, a labelled Contact button, the red send
  /// button that opens the chat, and the Subscribe pill. Mail and Contact only
  /// appear when the profile actually carries those details — the web hides
  /// them rather than showing dead buttons.
  Widget _actionRow() {
    final source = _isSelf ? Api.user : _other;
    final email = _isSelf
        ? '${source?["contact_email"] ?? Api.email}'.trim()
        : '${source?["contact_email"] ?? ""}'.trim();
    final phone = '${source?["contact_phone"] ?? source?["phone"] ?? ""}'
        .trim();

    return Row(
      children: [
        if (email.isNotEmpty) ...[
          _iconButton(
            Ionicons.mail_outline,
            () => _openContactModal(
              title: 'Mail',
              caption: 'Email details',
              fieldLabel: 'Email',
              value: email,
              actionLabel: 'Send Email',
              scheme: 'mailto:',
            ),
          ),
          const SizedBox(width: 8),
        ],
        if (phone.isNotEmpty) ...[
          // A call glyph rather than a "Contact" word button, so it sits beside
          // the mail and message icons as one row of round actions.
          _iconButton(
            Ionicons.call_outline,
            () => _openContactModal(
              title: 'Contact',
              caption: 'Direct call action',
              fieldLabel: 'Phone',
              value: phone,
              actionLabel: 'Call Now',
              scheme: 'tel:',
            ),
          ),
          const SizedBox(width: 8),
        ],
        _iconButton(Ionicons.paper_plane, _openChat, accent: true),
        const SizedBox(width: 10),
        Expanded(child: _subscribeButton()),
      ],
    );
  }

  /// The web's Mail / Contact modals, field for field: title, one-line caption,
  /// a boxed LABEL + value, then Close beside the action that hands the value
  /// to the device — `mailto:` for Mail, `tel:` for Contact.
  void _openContactModal({
    required String title,
    required String caption,
    required String fieldLabel,
    required String value,
    required String actionLabel,
    required String scheme,
  }) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.8),
      builder: (dialogContext) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 20),
        backgroundColor: const Color(0xFF151515),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 13,
                            letterSpacing: 2,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          caption,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.maybePop(dialogContext),
                    child: Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.06),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Ionicons.close_outline,
                        size: 18,
                        color: AppColors.textGray300,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.03),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      fieldLabel.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 11,
                        letterSpacing: 1.6,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray600,
                      ),
                    ),
                    const SizedBox(height: 5),
                    SelectableText(
                      value,
                      style: const TextStyle(fontSize: 14, color: Colors.white),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => Navigator.maybePop(dialogContext),
                      child: Container(
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.04),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.borderWhite10),
                        ),
                        child: const Text(
                          'CLOSE',
                          style: TextStyle(
                            fontSize: 11,
                            letterSpacing: 1.8,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GestureDetector(
                      onTap: () async {
                        Navigator.maybePop(dialogContext);
                        // On web this hands the URI to the browser, which
                        // raises the mail or dialler chooser; native builds
                        // fall back to copying it.
                        final opened = await openExternalLink('$scheme$value');
                        if (!opened && mounted) {
                          AppNotifications.info('$fieldLabel copied');
                        }
                      },
                      child: Container(
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          actionLabel.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            letterSpacing: 1.8,
                            fontWeight: FontWeight.w700,
                            color: Colors.black,
                          ),
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

  /// [accent] paints the crimson send button — filled glyph on a red-tinted
  /// disc, the same red the Subscribe pill uses elsewhere in the app.
  Widget _iconButton(IconData icon, VoidCallback onTap, {bool accent = false}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: accent
              ? _actionRed.withOpacity(0.16)
              : Colors.white.withOpacity(0.06),
          shape: BoxShape.circle,
          border: Border.all(
            color: accent
                ? _actionRed.withOpacity(0.5)
                : AppColors.borderWhite10,
          ),
        ),
        child: Icon(icon, size: 17, color: accent ? _actionRed : Colors.white),
      ),
    );
  }

  static const _actionRed = Color(0xFFE0303A);

  /// Opens the thread with this profile's owner. On your own profile there is
  /// nobody to message, so it raises the Chats tab on the home shell instead —
  /// pushing the bare list here rendered a blank screen, because that widget
  /// expects to live inside the shell.
  void _openChat() {
    if (_isSelf) {
      _goToShellTab(GoogerTab.chats);
      return;
    }
    final peerId = int.tryParse(_uid);
    if (peerId == null) {
      AppNotifications.error('Cannot open this chat');
      return;
    }
    _push(
      ChatDmScreen(
        name: _displayName,
        username: _handle,
        avatar: _avatarUrl,
        peerId: peerId,
      ),
    );
  }

  // ---- Overflow menu ----

  /// The web's ⋯ menu, in the same order: theme controls, then the legal and
  /// account destinations, then Log out.
  void _openProfileMenu() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            // The theme controls are your own settings, so they belong on your
            // own profile only — somebody else's page gets Share / Block /
            // Report and nothing more.
            if (_isSelf) ...[
              _menuRow(
                sheetContext,
                Ionicons.moon_outline,
                'Dark Mode',
                trailing: _radioDot(AppTheme.mode == ThemeMode.dark),
                onTap: () => AppTheme.set(ThemeMode.dark),
                keepOpen: true,
              ),
              _menuRow(
                sheetContext,
                Ionicons.phone_portrait_outline,
                'Auto Device Theme',
                trailing: _checkDot(AppTheme.mode == ThemeMode.system),
                onTap: () => AppTheme.set(ThemeMode.system),
                keepOpen: true,
              ),
            ],
            if (_isSelf) ...[
              _menuRow(
                sheetContext,
                Ionicons.help_circle_outline,
                'Help & Support',
                onTap: () => _push(const HelpSupportScreen()),
              ),
              _menuRow(
                sheetContext,
                Ionicons.document_text_outline,
                'Terms & Conditions',
                onTap: () =>
                    _push(const TermsPoliciesScreen(initialTab: 'terms')),
              ),
              _menuRow(
                sheetContext,
                Ionicons.lock_closed_outline,
                'Privacy Policy',
                onTap: () =>
                    _push(const TermsPoliciesScreen(initialTab: 'privacy')),
              ),
              _menuRow(
                sheetContext,
                Ionicons.share_social_outline,
                'Share profile',
                onTap: _openShareProfile,
              ),
              _menuRow(
                sheetContext,
                Ionicons.settings_outline,
                'Settings',
                onTap: _openSettings,
              ),
              _menuRow(
                sheetContext,
                Ionicons.ban_outline,
                'Blocked Accounts',
                onTap: _openBlockedAccounts,
              ),
              _menuRow(
                sheetContext,
                Ionicons.log_out_outline,
                'Log out',
                danger: true,
                onTap: _confirmLogout,
              ),
            ] else ...[
              _menuRow(
                sheetContext,
                Ionicons.share_social_outline,
                'Share profile',
                onTap: _openShareProfile,
              ),
              _menuRow(
                sheetContext,
                _blocked ? Ionicons.ban : Ionicons.ban_outline,
                _blocked ? 'Unblock Account' : 'Block Account',
                onTap: _toggleBlock,
              ),
              _menuRow(
                sheetContext,
                Ionicons.alert_circle_outline,
                'Report',
                danger: true,
                onTap: _reportProfile,
              ),
            ],
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  Widget _menuRow(
    BuildContext sheetContext,
    IconData icon,
    String label, {
    required VoidCallback onTap,
    Widget? trailing,
    bool danger = false,
    bool keepOpen = false,
  }) {
    return ListTile(
      dense: true,
      onTap: () {
        if (!keepOpen) Navigator.maybePop(sheetContext);
        onTap();
        if (keepOpen && mounted) setState(() {});
      },
      leading: Icon(
        icon,
        size: 18,
        color: danger ? AppColors.likeRed : AppColors.textGray300,
      ),
      title: Text(
        label,
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: danger ? AppColors.likeRed : Colors.white,
        ),
      ),
      trailing: trailing,
    );
  }

  Widget _radioDot(bool on) => Container(
    width: 13,
    height: 13,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: on ? Colors.white : Colors.transparent,
      border: Border.all(color: on ? Colors.white : AppColors.textGray600),
    ),
  );

  Widget _checkDot(bool on) => Icon(
    on ? Ionicons.checkmark_circle : Ionicons.ellipse_outline,
    size: 16,
    color: on ? Colors.white : AppColors.textGray600,
  );

  void _push(Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  /// Settings is where the avatar, name, username and bio links are edited, so
  /// re-read the profile on the way back instead of leaving the header showing
  /// what it was before the save.
  Future<void> _openSettings() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const SettingsScreen()),
    );
    if (mounted) await _load(silent: true);
  }

  Future<void> _pickAndSaveProfilePhoto() async {
    setState(() => _savingProfilePhoto = true);
    try {
      final file = await showProfilePhotoPickerSheet(context);
      if (!mounted) return;
      if (file == null) {
        AppNotifications.info('No photo selected');
        return;
      }
      if (file.bytes.length > 5 * 1024 * 1024) {
        AppNotifications.error('Please choose an image under 5 MB.');
        return;
      }
      setState(() => _localAvatarBytes = file.bytes);
      final error = await Api.updateProfile(const {}, profilePhoto: file);
      if (!mounted) return;
      if (error != null) {
        setState(() => _localAvatarBytes = null);
        AppNotifications.error('Could not update profile picture', error);
        return;
      }
      AppNotifications.success('Profile picture updated');
    } catch (e) {
      if (mounted) AppNotifications.error('Could not open the gallery', '$e');
    } finally {
      if (mounted) setState(() => _savingProfilePhoto = false);
    }
  }

  void _changeProfilePhotoSheet() => _pickAndSaveProfilePhoto();

  Future<void> _toggleBlock() async {
    final ok = await Api.toggleBlockUser(_uid);
    if (!mounted) return;
    if (!ok) {
      AppNotifications.error('Could not update block');
      return;
    }
    setState(() => _blocked = !_blocked);
    AppNotifications.success(
      _blocked ? 'Account blocked' : 'Account unblocked',
    );
  }

  void _reportProfile() {
    final reasons = [
      'Spam',
      'Harassment or bullying',
      'Impersonation',
      'Inappropriate content',
      'Something else',
    ];
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(18, 18, 18, 8),
              child: Text(
                'Report account',
                style: TextStyle(
                  fontSize: 13,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
            for (final reason in reasons)
              ListTile(
                dense: true,
                title: Text(
                  reason,
                  style: const TextStyle(fontSize: 14, color: Colors.white),
                ),
                onTap: () async {
                  Navigator.maybePop(sheetContext);
                  final ok = await Api.reportUser(_uid, reason);
                  if (!mounted) return;
                  ok
                      ? AppNotifications.success('Report submitted')
                      : AppNotifications.error('Could not submit report');
                },
              ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  // ---- Sheets ----

  /// Googers (followers) and Subscriptions (following) — the same two-tab
  /// modal the web opens from the Googers count.
  void _openGoogersSheet() {
    var view = 'googers';
    // Both lists up front, exactly as the web's `handleOpenConnections` does:
    // a Googer's row only knows whether its Subscribe pill starts on by being
    // matched against the subscriptions list.
    final connections = Future.wait([Api.followers(_uid), Api.following(_uid)]);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) {
          final isGoogers = view == 'googers';
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(sheetContext).size.height * 0.78,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 18, 12, 14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                isGoogers ? 'GOOGERS' : 'SUBSCRIPTIONS',
                                style: const TextStyle(
                                  fontSize: 13,
                                  letterSpacing: 2,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 5),
                              Text(
                                isGoogers
                                    ? '$_followers Googers'
                                    : '$_following subscriptions',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textGray500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: () => Navigator.maybePop(sheetContext),
                          child: Container(
                            width: 36,
                            height: 36,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.06),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Ionicons.close_outline,
                              size: 18,
                              color: AppColors.textGray300,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.borderWhite10),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.03),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _connTab('GOOGERS', isGoogers, () {
                            setSheet(() => view = 'googers');
                          }),
                          _connTab('SUBSCRIPTIONS', !isGoogers, () {
                            setSheet(() => view = 'following');
                          }),
                        ],
                      ),
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.borderWhite10),
                  Flexible(
                    child: FutureBuilder<List<List<Map<String, dynamic>>>>(
                      future: connections,
                      builder: (_, snapshot) {
                        if (snapshot.connectionState != ConnectionState.done) {
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 40),
                            child: Center(
                              child: Text(
                                isGoogers
                                    ? 'Loading Googers...'
                                    : 'Loading subscriptions...',
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: AppColors.textGray500,
                                ),
                              ),
                            ),
                          );
                        }
                        final lists =
                            snapshot.data ??
                            const <List<Map<String, dynamic>>>[];
                        final followers = lists.isEmpty
                            ? const <Map<String, dynamic>>[]
                            : lists[0];
                        final subscriptions = lists.length < 2
                            ? const <Map<String, dynamic>>[]
                            : lists[1];
                        final subscribedIds = subscriptions
                            .map(_connectionId)
                            .where((id) => id.isNotEmpty)
                            .toSet();
                        final rows = isGoogers ? followers : subscriptions;
                        if (rows.isEmpty) {
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 44),
                            child: Center(
                              child: Text(
                                isGoogers
                                    ? 'No Googers to show yet.'
                                    : 'No subscriptions to show yet.',
                                style: const TextStyle(
                                  fontSize: 13.5,
                                  color: AppColors.textGray400,
                                ),
                              ),
                            ),
                          );
                        }
                        return ListView.builder(
                          shrinkWrap: true,
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          itemCount: rows.length,
                          itemBuilder: (_, i) {
                            final row = rows[i];
                            final rowId = _connectionId(row);
                            return _connectionRow(
                              row,
                              onTap: () {
                                Navigator.maybePop(sheetContext);
                                _openConnectionProfile(row);
                              },
                              // The web hides the pill on your own row —
                              // there is nothing to subscribe to there.
                              trailing:
                                  rowId.isEmpty ||
                                      rowId == Api.currentUserId.trim()
                                  ? null
                                  : _SubscribeChip(
                                      key: ValueKey('subscribe-$rowId'),
                                      userId: rowId,
                                      // `is_subscribed` when the row carries
                                      // it, otherwise membership of the
                                      // subscriptions list, like
                                      // `isConnectionSubscribed`.
                                      subscribed: row['is_subscribed'] is bool
                                          ? row['is_subscribed'] as bool
                                          : subscribedIds.contains(rowId),
                                      onChanged: () => _load(silent: true),
                                    ),
                            );
                          },
                        );
                      },
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

  Widget _connTab(String label, bool selected, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
        decoration: BoxDecoration(
          color: selected ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(13),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            letterSpacing: 1.4,
            fontWeight: FontWeight.w600,
            color: selected ? Colors.black : AppColors.textGray400,
          ),
        ),
      ),
    );
  }

  /// Web `getConnectionUserId` — connection and blocked rows key off `id`,
  /// falling back to `user_id` for the endpoints that only send that.
  String _connectionId(Map<String, dynamic> user) {
    final id = '${user["id"] ?? ""}'.trim();
    return id.isEmpty ? '${user["user_id"] ?? ""}'.trim() : id;
  }

  /// Both connection sheets push the tapped account's profile, the way the web
  /// routes to `getPublicProfileHref`.
  void _openConnectionProfile(Map<String, dynamic> user) {
    final id = _connectionId(user);
    if (id.isEmpty) return;
    final picture = (Api.rawAvatar(user) ?? '').trim();
    _push(
      ProfileScreen(
        userId: id,
        username: '${user["username"] ?? ""}'.trim(),
        displayName: '${user["full_name"] ?? ""}'.trim(),
        avatar: picture.isEmpty ? '' : Api.resolveAvatar(picture),
      ),
    );
  }

  Widget _connectionRow(
    Map<String, dynamic> user, {
    Widget? trailing,
    VoidCallback? onTap,
  }) {
    final name = '${user["full_name"] ?? user["username"] ?? "Googer"}';
    final handle = '${user["username"] ?? ""}';
    final picture = Api.rawAvatar(user) ?? '';
    final avatar = picture.isEmpty ? '' : Api.resolveAvatar(picture);

    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 46,
        height: 46,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: avatar.isEmpty
            ? Center(
                child: Text(
                  name.isEmpty ? '?' : name.substring(0, 1).toUpperCase(),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              )
            : Image.network(
                avatar,
                fit: BoxFit.cover,
                webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                errorBuilder: (_, __, ___) => const Icon(
                  Ionicons.person_outline,
                  size: 18,
                  color: AppColors.slateIcon,
                ),
              ),
      ),
      title: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: Colors.white,
        ),
      ),
      subtitle: Text(
        '@$handle',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 12, color: AppColors.textGray500),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (trailing != null) ...[trailing, const SizedBox(width: 6)],
          const Icon(
            Ionicons.chevron_forward,
            size: 15,
            color: AppColors.textGray600,
          ),
        ],
      ),
    );
  }

  void _openBlockedAccounts() {
    // Requested once and unblocked rows dropped locally, because re-reading
    // `/chat/blocked-users` on every rebuild would put a just-unblocked
    // account straight back on the list.
    final loaded = Api.blockedChatUsers();
    final unblocked = <String>{};
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) => SafeArea(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: loaded,
            builder: (_, snapshot) {
              final rows = (snapshot.data ?? const <Map<String, dynamic>>[])
                  .where((user) => !unblocked.contains(_connectionId(user)))
                  .toList(growable: false);
              final loading = snapshot.connectionState != ConnectionState.done;
              return ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(sheetContext).size.height * 0.7,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 18, 12, 14),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'BLOCKED ACCOUNTS',
                                  style: TextStyle(
                                    fontSize: 13,
                                    letterSpacing: 2,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Text(
                                  '${rows.length} blocked profiles',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textGray500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: () => Navigator.maybePop(sheetContext),
                            child: Container(
                              width: 36,
                              height: 36,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.06),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Ionicons.close_outline,
                                size: 18,
                                color: AppColors.textGray300,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1, color: AppColors.borderWhite10),
                    if (loading)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 44),
                        child: Center(
                          child: SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.textGray400,
                            ),
                          ),
                        ),
                      )
                    else if (rows.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 44),
                        child: Center(
                          child: Text(
                            'No blocked accounts to show.',
                            style: TextStyle(
                              fontSize: 13.5,
                              color: AppColors.textGray400,
                            ),
                          ),
                        ),
                      )
                    else
                      Flexible(
                        child: ListView.builder(
                          shrinkWrap: true,
                          itemCount: rows.length,
                          itemBuilder: (_, i) {
                            final row = rows[i];
                            return _connectionRow(
                              row,
                              onTap: () {
                                Navigator.maybePop(sheetContext);
                                _openConnectionProfile(row);
                              },
                              trailing: _UnblockChip(
                                key: ValueKey('unblock-${_connectionId(row)}'),
                                onUnblock: () => _unblockConnection(
                                  row,
                                  setSheet,
                                  unblocked,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  /// POST /chat/unblock — the same call the web's blocked modal makes — after
  /// which the row leaves the list without the sheet re-reading it.
  Future<bool> _unblockConnection(
    Map<String, dynamic> user,
    StateSetter setSheet,
    Set<String> unblocked,
  ) async {
    final id = _connectionId(user);
    final numericId = int.tryParse(id);
    if (numericId == null) return false;
    final ok = await Api.unblockChatUser(numericId);
    if (!ok) {
      AppNotifications.error('Could not unblock user');
      return false;
    }
    setSheet(() => unblocked.add(id));
    AppNotifications.success('Account unblocked');
    return true;
  }

  void _openShareProfile() {
    // The link is for the profile being viewed, not whoever is signed in —
    // sharing somebody else's page used to hand out your own.
    final link = 'https://googer.site/@$_handle';
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.7),
      builder: (dialogContext) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 20),
        backgroundColor: const Color(0xFF121216),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'SHARE PROFILE',
                          style: TextStyle(
                            fontSize: 13,
                            letterSpacing: 2,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          _isSelf
                              ? 'Copy your public share profile link.'
                              : "Copy @$_handle's public share profile link.",
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.maybePop(dialogContext),
                    child: Container(
                      width: 34,
                      height: 34,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.06),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Ionicons.close_outline,
                        size: 17,
                        color: AppColors.textGray300,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.03),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'SHARE LINK',
                      style: TextStyle(
                        fontSize: 9,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      link,
                      style: const TextStyle(
                        fontSize: 13.5,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => Navigator.maybePop(dialogContext),
                      child: Container(
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.05),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.borderWhite10),
                        ),
                        child: const Text(
                          'CLOSE',
                          style: TextStyle(
                            fontSize: 11.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: GestureDetector(
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: link));
                        Navigator.maybePop(dialogContext);
                        AppNotifications.success('Profile link copied');
                      },
                      child: Container(
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Text(
                          'COPY LINK',
                          style: TextStyle(
                            fontSize: 11.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w600,
                            color: Colors.black,
                          ),
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

  Future<void> _toggleSubscribe() async {
    if (_busySubscribe) return;
    final wasSubscribed = _subscribed;
    setState(() {
      _busySubscribe = true;
      _subscribed = !wasSubscribed; // optimistic, like the web button
    });
    final ok = await Api.toggleUserSubscription(_uid);
    if (!mounted) return;
    if (ok == null) {
      setState(() {
        _subscribed = wasSubscribed;
        _busySubscribe = false;
      });
      AppNotifications.error('Could not update subscription');
      return;
    }
    setState(() {
      _subscribed = ok;
      _busySubscribe = false;
    });
    AppNotifications.success(ok ? 'Subscribed' : 'Unsubscribed');
    // Refresh the Googers count without blanking the columns out.
    _load(silent: true);
  }

  void _confirmLogout() {
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF121216),
        title: const Text(
          'Log out',
          style: TextStyle(fontSize: 16, color: Colors.white),
        ),
        content: const Text(
          'You will need to sign in again to use your account.',
          style: TextStyle(fontSize: 13, color: AppColors.textGray400),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.maybePop(dialogContext),
            child: const Text(
              'Cancel',
              style: TextStyle(color: AppColors.textGray300),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.maybePop(dialogContext);
              Api.logout();
              Navigator.of(context).popUntil((route) => route.isFirst);
            },
            child: const Text(
              'Log out',
              style: TextStyle(color: AppColors.likeRed),
            ),
          ),
        ],
      ),
    );
  }

  /// The column strip. Long-press a tab and drag it along the row to reorder
  /// the columns; the order is kept per device.
  Widget _tabStrip() {
    return Container(
      height: 48,
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.borderWhite10)),
      ),
      child: ReorderableListView.builder(
        scrollDirection: Axis.horizontal,
        buildDefaultDragHandles: false,
        physics: const NeverScrollableScrollPhysics(),
        proxyDecorator: (child, _, __) =>
            Material(color: Colors.transparent, child: child),
        itemCount: _tabs.length,
        onReorder: _reorderTabs,
        itemBuilder: (context, i) {
          // Each tab claims an equal slice, so the strip still fills the width.
          final width = MediaQuery.of(context).size.width / _tabs.length;
          final selected = _tab == i;
          // Only the owner rearranges their columns. The order they settle on
          // is this device's, so it still applies while browsing anybody
          // else's profile — it just cannot be changed from there.
          return ReorderableDelayedDragStartListener(
            key: ValueKey(_tabs[i]),
            index: i,
            enabled: _isSelf,
            child: GestureDetector(
              onTap: () => setState(() => _tab = i),
              behavior: HitTestBehavior.opaque,
              child: SizedBox(
                width: width,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      _tabs[i],
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: selected ? Colors.white : AppColors.textGray600,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Container(
                      height: 2,
                      color: selected ? Colors.white : Colors.transparent,
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

  void _reorderTabs(int oldIndex, int newIndex) {
    if (!_isSelf) return;
    setState(() {
      if (newIndex > oldIndex) newIndex -= 1;
      final selected = _tabs[_tab];
      final next = List<String>.from(_tabs);
      next.insert(newIndex, next.removeAt(oldIndex));
      _tabs = next;
      // Follow the column the viewer was on rather than the slot number.
      _tab = next.indexOf(selected);
    });
    writeStorage(_tabOrderKey, _tabs.join(','));
  }

  Widget _tabSliver() {
    switch (_tabs[_tab]) {
      case 'Products':
        return SliverToBoxAdapter(child: _productGrid());
      case 'Ads':
        if (_ads.isEmpty) {
          return SliverToBoxAdapter(child: _empty('No ads yet'));
        }
        return SliverList.builder(
          itemCount: _ads.length,
          itemBuilder: (_, index) => _profileAdCard(_ads[index]),
        );
      case 'Repost':
        return _uploadSliver(_reposts, 'No reposts yet');
      default:
        return _googsSliver();
    }
  }

  /// The Googs column: the text googs first, then this user's upload content
  /// underneath — both drawn with the very cards the home feed uses, so a goog
  /// looks and behaves the same here as it does in the feed.
  Widget _googsSliver() {
    final feed =
        <_ProfileFeedItem>[
          for (final goog in _googs)
            _ProfileFeedItem(goog: goog, sortAt: _feedTime(goog.createdAt)),
          for (final upload in _uploads)
            _ProfileFeedItem(
              upload: upload,
              sortAt: _feedTime(
                upload.repostedAt,
                upload.approvedAt,
                upload.createdAt,
              ),
              pinnedAt: _feedTime(upload.pinnedAt),
            ),
          for (final ad in _ads)
            _ProfileFeedItem(ad: ad, sortAt: _feedTime(ad.feedSortAt)),
        ]..sort((a, b) {
          final pinned = (b.pinnedAt?.millisecondsSinceEpoch ?? 0).compareTo(
            a.pinnedAt?.millisecondsSinceEpoch ?? 0,
          );
          if (pinned != 0) return pinned;
          return (b.sortAt?.millisecondsSinceEpoch ?? 0).compareTo(
            a.sortAt?.millisecondsSinceEpoch ?? 0,
          );
        });

    if (feed.isEmpty) {
      return SliverToBoxAdapter(child: _empty('No googs yet'));
    }
    return SliverList.builder(
      itemCount: feed.length,
      itemBuilder: (_, index) => _profileFeedCard(feed[index]),
    );
  }

  Widget _profileFeedCard(_ProfileFeedItem item) {
    if (item.goog case final goog?) {
      return GoogFeedCard(
        key: ValueKey('profile-goog-${goog.id}'),
        post: goog,
        onRefresh: ({bool silent = false}) => _load(silent: silent),
        onHide: () => setState(
          () => _googs = _googs
              .where((g) => g.id != goog.id)
              .toList(growable: false),
        ),
      );
    }
    if (item.upload case final upload?) {
      return UploadFeedCard(
        key: ValueKey('profile-upload-${upload.id}-${upload.repostedAt}'),
        item: upload,
        profilePresentation: _isSelf,
        onRefresh: ({bool silent = false}) => _load(silent: silent),
        onEditStart: () => setState(
          () => _uploads = _uploads
              .where((u) => u.id != upload.id)
              .toList(growable: false),
        ),
        onHide: () => setState(
          () => _uploads = _uploads
              .where((u) => u.id != upload.id)
              .toList(growable: false),
        ),
      );
    }
    return _profileAdCard(item.ad!);
  }

  DateTime? _feedTime(String first, [String second = '', String third = '']) {
    for (final raw in [first, second, third]) {
      final value = raw.trim();
      if (value.isEmpty) continue;
      final parsed = DateTime.tryParse(value.replaceFirst(' ', 'T'));
      if (parsed != null) return parsed;
    }
    return null;
  }

  Widget _profileAdCard(HomeAd ad) => HomeAdFeedCard(
    key: ValueKey('profile-ad-${ad.adId}'),
    ad: ad,
    onRefresh: ({bool silent = false}) => _load(silent: silent),
    showSaveButton: _viewerHasPaidPlan,
    initialSaved: _savedAdIds.contains(ad.adId),
    savedStateKnown: true,
    showExpiryWarning: _viewerHasPaidPlan,
    allowPhotoVideoPromoteAgain: true,
    onSaveChanged: (saved) => _setSavedAd(ad.adId, saved),
    onHide: () => setState(
      () => _ads = _ads
          .where((candidate) => candidate.adId != ad.adId)
          .toList(growable: false),
    ),
  );

  void _setSavedAd(String adId, bool saved) {
    setState(() {
      final next = Set<String>.from(_savedAdIds);
      if (saved) {
        next.add(adId);
      } else {
        next.remove(adId);
      }
      _savedAdIds = next;
    });
  }

  /// The shop's own two-up grid and card, so a listing looks the same on a
  /// profile as it does on the Shop page — same geometry, same interactions,
  /// same quick view.
  Widget _productGrid() {
    if (_products.isEmpty) return _empty('No products listed');
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 20),
      itemCount: _products.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.56,
      ),
      itemBuilder: (context, i) {
        final product = _products[i];
        void openQuickView() =>
            showShopProductQuickView(context, product['id'], fallback: product);
        return ProductGridCard(
          key: ValueKey('product-${product["id"]}'),
          product: product,
          onOpen: openQuickView,
          onAddToBag: openQuickView,
          onMenu: (mine) => _openProductMenu(product, mine: mine),
          onLike: () async {
            await Api.toggleProductLike(int.tryParse('${product["id"]}') ?? 0);
          },
          onShare: (currentCount) =>
              _shareProduct(product, currentCount: currentCount),
          onComment: () =>
              showShopProductInteractions(context, product, 'comments'),
          onTrackedView: () =>
              Api.markProductView(int.tryParse('${product["id"]}') ?? 0),
          onView: () => showShopProductInteractions(context, product, 'views'),
        );
      },
    );
  }

  /// The card's ⋮ menu. The web hands the profile grid the very same
  /// `SharedProductCard` menu the Shop page uses — Share Link · Promote ·
  /// Delete (yours) · Report · Not Interested — rather than the quick view.
  void _openProductMenu(Map<String, dynamic> product, {required bool mine}) {
    final reviewing =
        '${product["status"] ?? ""}'.trim().toLowerCase() == 'reviewing';
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            _menuRow(
              sheetContext,
              Ionicons.share_social_outline,
              'Share Link',
              onTap: () => _shareProduct(product),
            ),
            // A listing still under review cannot be promoted yet.
            if (!reviewing)
              _menuRow(
                sheetContext,
                Ionicons.megaphone_outline,
                'Promote',
                onTap: () => _push(const ProductPromoteScreen()),
              ),
            if (mine)
              _menuRow(
                sheetContext,
                Ionicons.create_outline,
                'Edit Post',
                onTap: () async {
                  final saved = await showEditProductSheet(context, product);
                  if (saved) await _load(silent: true);
                },
              ),
            if (mine)
              _menuRow(
                sheetContext,
                Ionicons.trash_outline,
                'Delete Post',
                danger: true,
                onTap: () => _confirmDeleteProduct(product),
              ),
            if (!mine) ...[
              _menuRow(
                sheetContext,
                Ionicons.alert_circle_outline,
                'Report',
                onTap: () => _reportProduct(product),
              ),
              _menuRow(
                sheetContext,
                Ionicons.eye_off_outline,
                'Not Interested',
                onTap: () => setState(
                  () => _products = _products
                      .where((row) => '${row["id"]}' != '${product["id"]}')
                      .toList(growable: false),
                ),
              ),
            ],
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  /// Web `handleShareClick` on a profile listing: the share is counted against
  /// `POST /market/{id}/share` before the sheet opens, and Share & Earn is
  /// offered only when the listing actually pays a resell commission.
  Future<int?> _shareProduct(
    Map<String, dynamic> product, {
    int? currentCount,
  }) async {
    final code = ['product_code', 'share_code', 'code']
        .map((key) => '${product[key] ?? ""}'.trim())
        .firstWhere(
          Api.isCanonicalShareCode,
          orElse: () {
            final id =
                '${product["linked_product_id"] ?? product["product_id"] ?? product["id"] ?? ""}'
                    .trim();
            return id.isEmpty ? '' : Api.buildShareCode('p', id);
          },
        );
    final url = code.isEmpty
        ? 'https://googer.site/shop'
        : 'https://googer.site/product/$code';
    final nextShares = await Api.shareProduct(
      int.tryParse('${product["id"]}') ?? 0,
      currentCount:
          currentCount ??
          int.tryParse(
            '${product["shares_count"] ?? product["shareCount"] ?? 0}',
          ),
    );
    if (!mounted) return nextShares;
    final commission = _resellCommission(product);
    openShareSheet(
      context,
      title: '${product["title"] ?? product["name"] ?? ""}',
      subtitle: 'PRODUCT',
      url: url,
      linkLabel: 'Product Link',
      canEarn: commission.isNotEmpty,
      earnTitle: 'Share & Earn',
      earnSubtitle: 'Create your personalized resell link',
      commission: commission,
      earnUrlBuilder: (id) => '$url/${Uri.encodeComponent(id)}',
      earnKind: 'Generate Share',
    );
    return nextShares;
  }

  /// `commission_info` arrives either decoded or still as the JSON string the
  /// market row stores it in; empty means the listing has no resell cut.
  String _resellCommission(Map<String, dynamic> product) {
    var info = product['commission_info'];
    if (info is String) {
      try {
        info = jsonDecode(info);
      } catch (_) {
        return '';
      }
    }
    if (info is! Map) return '';
    final value =
        info['resell_percentage'] ??
        info['resell_amount'] ??
        info['resell_commission'] ??
        info['reseller_commission'] ??
        info['googer_commission'];
    if (value == null) return '';
    final text = '$value'.trim();
    return text.isEmpty ? '' : '$text%';
  }

  Future<void> _confirmDeleteProduct(Map<String, dynamic> product) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF121216),
        title: const Text(
          'Delete listing',
          style: TextStyle(fontSize: 16, color: Colors.white),
        ),
        content: const Text(
          'This listing will be removed from the shop.',
          style: TextStyle(fontSize: 13, color: AppColors.textGray400),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(
              'Cancel',
              style: TextStyle(color: AppColors.textGray300),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(
              'Delete',
              style: TextStyle(color: AppColors.likeRed),
            ),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final deleted = await Api.deleteProduct(product['id']);
    if (!mounted) return;
    if (!deleted) {
      AppNotifications.error('Could not delete listing');
      return;
    }
    AppNotifications.success('Listing deleted');
    await _load(silent: true);
  }

  /// The shop's report reasons, so a listing reported from a profile lands on
  /// `POST /market/{id}/report` with the same vocabulary as one reported from
  /// the Shop page.
  void _reportProduct(Map<String, dynamic> product) {
    const reasons = [
      'Inappropriate content',
      'Counterfeit / fake',
      'Prohibited item',
      'Scam or fraud',
      'Other',
    ];
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(18, 18, 18, 8),
              child: Text(
                'Report listing',
                style: TextStyle(
                  fontSize: 13,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
            for (final reason in reasons)
              ListTile(
                dense: true,
                title: Text(
                  reason,
                  style: const TextStyle(fontSize: 14, color: Colors.white),
                ),
                onTap: () async {
                  Navigator.maybePop(sheetContext);
                  final ok = await Api.reportProduct(
                    int.tryParse('${product["id"]}') ?? 0,
                    reason,
                    '',
                  );
                  if (!mounted) return;
                  ok
                      ? AppNotifications.success('Report submitted')
                      : AppNotifications.error('Could not submit report');
                },
              ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  Widget _uploadSliver(List<UploadContent> rows, String emptyLabel) {
    if (rows.isEmpty) {
      return SliverToBoxAdapter(child: _empty(emptyLabel));
    }
    return SliverList.builder(
      itemCount: rows.length,
      itemBuilder: (_, index) {
        final row = rows[index];
        return UploadFeedCard(
          key: ValueKey('upload-${row.id}-${row.repostedAt}'),
          item: row,
          profilePresentation: _isSelf,
          onRefresh: ({bool silent = false}) => _load(silent: silent),
          onEditStart: () => setState(() {
            _uploads = _uploads
                .where((u) => u.id != row.id)
                .toList(growable: false);
            _reposts = _reposts
                .where((u) => u.id != row.id)
                .toList(growable: false);
          }),
          onHide: () => setState(() {
            _uploads = _uploads
                .where((u) => u.id != row.id)
                .toList(growable: false);
            _reposts = _reposts
                .where((u) => u.id != row.id)
                .toList(growable: false);
          }),
        );
      },
    );
  }

  Widget _empty(String label) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 50),
    child: Center(
      child: Text(
        label,
        style: const TextStyle(fontSize: 12, color: AppColors.textGray500),
      ),
    ),
  );
}

class _ProfileFeedItem {
  final GoogPost? goog;
  final UploadContent? upload;
  final HomeAd? ad;
  final DateTime? sortAt;
  final DateTime? pinnedAt;

  const _ProfileFeedItem({
    this.goog,
    this.upload,
    this.ad,
    this.sortAt,
    this.pinnedAt,
  });
}

/// The per-row Subscribe on the Googers / Subscriptions sheet, the same pill
/// the web draws there: white while unsubscribed, outlined once subscribed,
/// "UPDATING" while `POST /auth/user/{id}/subscribe` is in flight. It keeps
/// its own state so a toggle does not rebuild — and refetch — the whole list.
class _SubscribeChip extends StatefulWidget {
  final String userId;
  final bool subscribed;

  /// Lets the profile re-read its Googers and Subscriptions counts once the
  /// backend has answered.
  final VoidCallback onChanged;

  const _SubscribeChip({
    super.key,
    required this.userId,
    required this.subscribed,
    required this.onChanged,
  });

  @override
  State<_SubscribeChip> createState() => _SubscribeChipState();
}

class _SubscribeChipState extends State<_SubscribeChip> {
  late bool _subscribed = widget.subscribed;
  bool _busy = false;

  Future<void> _toggle() async {
    if (_busy) return;
    final was = _subscribed;
    setState(() {
      _busy = true;
      _subscribed = !was; // optimistic, like the web row
    });
    final result = await Api.toggleUserSubscription(widget.userId);
    if (!mounted) return;
    setState(() {
      _subscribed = result ?? was;
      _busy = false;
    });
    if (result == null) {
      AppNotifications.error('Could not update subscription');
      return;
    }
    widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _busy ? null : _toggle,
      child: Opacity(
        opacity: _busy ? 0.6 : 1,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: _subscribed ? Colors.white.withOpacity(0.06) : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: _subscribed ? AppColors.borderWhite10 : Colors.transparent,
            ),
          ),
          child: Text(
            _busy
                ? 'UPDATING'
                : _subscribed
                ? 'SUBSCRIBED'
                : 'SUBSCRIBE',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w600,
              color: _subscribed ? AppColors.textGray300 : Colors.black,
            ),
          ),
        ),
      ),
    );
  }
}

/// The Unblock on a Blocked Accounts row. Stays greyed while `/chat/unblock`
/// is in flight so a double tap cannot fire the call twice.
class _UnblockChip extends StatefulWidget {
  /// Answers false when the call failed, so the chip becomes tappable again.
  final Future<bool> Function() onUnblock;

  const _UnblockChip({super.key, required this.onUnblock});

  @override
  State<_UnblockChip> createState() => _UnblockChipState();
}

class _UnblockChipState extends State<_UnblockChip> {
  bool _busy = false;

  Future<void> _unblock() async {
    if (_busy) return;
    setState(() => _busy = true);
    final ok = await widget.onUnblock();
    if (!mounted || ok) return;
    setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _busy ? null : _unblock,
      child: Opacity(
        opacity: _busy ? 0.6 : 1,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.04),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: const Text(
            'UNBLOCK',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}
