import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter/gestures.dart';
import 'package:visibility_detector/visibility_detector.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../services/cart_store.dart';
import '../services/app_notifications.dart';
import '../services/home_feed_refresh_bus.dart';
import '../theme/colors.dart';
import '../util/open_link.dart';
import '../util/hidden_feed_items.dart';
import '../util/storage.dart';
import '../util/web_image.dart';
import '../util/web_video.dart';
import '../widgets/app_back_button.dart';
import '../widgets/googer_topbar.dart';
import '../widgets/googer_bottom_nav.dart';
import '../widgets/verified_badge.dart';
import '../widgets/subscribe_button.dart';
import '../widgets/upload_insights_sheet.dart';
import '../widgets/upgrade_plan_sheet.dart';
import 'shop_feed_screen.dart';
import 'wallet_screen.dart';
import 'chats_screen.dart';
import 'ad_campaign_screen.dart';
import 'photo_video_ad_screen.dart';
import 'product_promote_screen.dart';
import 'user_profile_screen.dart';
import 'upload_content_studio.dart';
import 'top_up_screen.dart';

const _homeGoogCategories = [
  "All",
  "Subscriptions",
  "Comedy",
  "Music",
  "Gaming",
  "Food & Cooking",
  "Technology",
  "News",
  "Travel",
  "Sports",
  "Entertainment",
  "Business",
  "Finance",
  "Health",
  "Science",
  "AI",
  "Programming",
  "Lifestyle",
  "Agriculture",
  "Education",
  "Real Estate",
  "Automotive",
  "Marketing",
  "Beauty & Fashion",
  "Pets & Animals",
  "Kids & Family",
  "Films & Animation",
];

@visibleForTesting
int homeFeedHashStringToSeedForWebParity(String value) {
  var hash = 2166136261;
  for (final unit in value.codeUnits) {
    hash ^= unit;
    hash = _homeFeedImul32(hash, 16777619);
  }
  return hash & 0xffffffff;
}

int _homeFeedImul32(int a, int b) {
  final al = a & 0xffff;
  final ah = (a >> 16) & 0xffff;
  final bl = b & 0xffff;
  final bh = (b >> 16) & 0xffff;
  return (al * bl + (((ah * bl + al * bh) & 0xffff) << 16)) & 0xffffffff;
}

@visibleForTesting
List<T> homeFeedShuffleItemsWithSeedForWebParity<T>(
  List<T> items,
  String seed,
  String Function(T item) keyFn,
) {
  double nextRank(String key) {
    var randomState = homeFeedHashStringToSeedForWebParity('$seed:$key');
    randomState =
        (_homeFeedImul32(1664525, randomState) + 1013904223) & 0xffffffff;
    return randomState / 4294967296;
  }

  final ranked = [for (final item in items) (item: item, key: keyFn(item))]
      .map(
        (entry) =>
            (item: entry.item, rank: nextRank(entry.key), key: entry.key),
      )
      .toList(growable: false);
  ranked.sort((a, b) {
    final byRank = a.rank.compareTo(b.rank);
    if (byRank != 0) return byRank;
    return a.key.compareTo(b.key);
  });
  return [for (final entry in ranked) entry.item];
}

@visibleForTesting
String homeFeedViewerSeedForWebParity({
  Object? id,
  Object? userId,
  Object? googerId,
  Object? googerIdCamel,
  Object? username,
  Object? fullName,
}) {
  final viewerId = [id, userId, googerId, googerIdCamel, username, fullName]
      .map((value) => '${value ?? ''}'.trim())
      .firstWhere((value) => value.isNotEmpty, orElse: () => 'guest');
  return 'googer-home-feed-v2:$viewerId';
}

class HomeFeedScreen extends StatefulWidget {
  const HomeFeedScreen({super.key});

  /// Screens pushed on top of the shell (the profile, for one) carry the same
  /// bottom nav. They cannot reach this state directly, so they raise the tab
  /// they want here and pop back to it rather than pushing a second shell.
  static final ValueNotifier<int> requestedTab = ValueNotifier<int>(0);

  /// Bottom-nav indices, matching `_buildScreen`.
  static const int homeTab = 0;
  static const int shopTab = 1;
  static const int walletTab = 3;
  static const int chatsTab = 4;

  @override
  State<HomeFeedScreen> createState() => _HomeFeedScreenState();
}

class _HomeFeedScreenState extends State<HomeFeedScreen> {
  int _selectedTab = 0;
  final ScrollController _homeScrollController = ScrollController();
  List<GoogPost> _posts = const [];
  List<UploadContent> _uploads = const [];
  List<HomeAd> _ads = const [];
  List<_FeedEntry>? _canonicalFeedEntries;
  List<String> _categories = _homeGoogCategories;
  String _selectedCategory = "All";

  // Web parity: the draft drives profile suggestions while typing. Mobile also
  // filters the feed live so the search icon is not required.
  final TextEditingController _searchCtrl = TextEditingController();
  String _searchDraft = "";
  String _searchQuery = "";
  bool _showSuggestions = false;
  // Directory matches for the search box, so people can be found by username or
  // Googer ID even when none of their content is in the current feed.
  Timer? _peopleSearchDebounce;
  String _lastPeopleSearch = "";
  List<_ProfileSuggestion> _directoryUsers = const [];
  String get _feedSeed => homeFeedViewerSeedForWebParity(
    id: Api.user?['id'],
    userId: Api.user?['user_id'],
    googerId: Api.user?['googer_id'],
    googerIdCamel: Api.user?['googerId'],
    username: Api.user?['username'],
    fullName: Api.user?['full_name'],
  );
  late final String _homeAdShuffleSeed = _getPersistentClientSeed(
    'googer-home-ad-pool-seed-v1',
  );
  late int _homeAdRotation = _readIntStorage('googer-home-ad-rotation-v1');
  bool _loading = true;
  String? _error;
  Timer? _refreshTimer;
  final Set<String> _hiddenAds = {};

  /// "Not interested" hides, web `hiddenHomeGoogIds` / `hiddenHomeUploadIds`.
  /// Client-side only — the web never tells the server either.
  final Set<String> _hiddenGoogIds = {};
  final Set<String> _hiddenUploadIds = {};

  /// Authors the viewer has blocked; their content is dropped from the feed.
  Set<String> _blockedUserIds = <String>{};

  /// Authors the viewer follows. Only used by the Subscriptions category, which
  /// narrows the feed to people you follow (web `isFollowedOwnerItem`).
  Set<String> _followingUserIds = <String>{};

  bool _isBlocked(String ownerId) =>
      _blockedUserIds.isNotEmpty && _blockedUserIds.contains(ownerId.trim());

  bool _isFollowed(String ownerId) =>
      _followingUserIds.contains(ownerId.trim());

  bool get _isSubscriptionsFilter =>
      _selectedCategory.toLowerCase() == "subscriptions";
  final ValueNotifier<bool> _showCategories = ValueNotifier<bool>(true);
  DateTime _lastHomeScrollAt = DateTime.fromMillisecondsSinceEpoch(0);

  String _normalizeFeedCategoryText(String value, {bool keepHash = false}) =>
      value
          .toLowerCase()
          .replaceAll('&', 'and')
          .replaceAll(RegExp(keepHash ? r'[^a-z0-9#]+' : r'[^a-z0-9]+'), ' ')
          .trim();

  bool _matchesGoogCategoryText(String value, String selected) {
    if (selected == 'all' || selected == 'subscriptions') return true;
    final normalizedCategory = _normalizeFeedCategoryText(selected);
    if (normalizedCategory.isEmpty) return true;
    final normalizedText = _normalizeFeedCategoryText(value, keepHash: true);
    return normalizedText.contains(normalizedCategory) ||
        normalizedText.contains('#${normalizedCategory.replaceAll(' ', '')}');
  }

  bool _postMatchesGoogCategory(GoogPost post, String selected) =>
      _matchesGoogCategoryText(post.text, selected);

  bool _isRepostedUploadContent(UploadContent item) =>
      item.repostedByName.trim().isNotEmpty ||
      item.repostedAt.trim().isNotEmpty;

  bool _uploadMatchesGoogCategory(UploadContent item, String selected) {
    if (selected == 'all' || selected == 'subscriptions') return true;
    if (_isRepostedUploadContent(item)) return false;
    return _matchesGoogCategoryText(
      '${item.topic} ${item.description} ${item.hashtags}',
      selected,
    );
  }

  @override
  void initState() {
    super.initState();
    _hiddenAds.addAll(readHiddenFeedItemIds(Api.currentUserId, 'ad'));
    _advanceHomeAdRotation();
    _homeScrollController.addListener(_handleHomeScroll);
    HomeFeedScreen.requestedTab.addListener(_handleTabRequest);
    HomeFeedRefreshBus.signal.addListener(_handleExternalFeedRefresh);
    _loadFeed();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _selectedTab == 0 ? _loadFeed(silent: true) : null,
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _peopleSearchDebounce?.cancel();
    HomeFeedScreen.requestedTab.removeListener(_handleTabRequest);
    HomeFeedRefreshBus.signal.removeListener(_handleExternalFeedRefresh);
    _homeScrollController.removeListener(_handleHomeScroll);
    _homeScrollController.dispose();
    _showCategories.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  /// A pushed screen asked for one of the bottom-nav tabs.
  void _handleTabRequest() {
    final next = HomeFeedScreen.requestedTab.value;
    if (!mounted || next == _selectedTab) return;
    setState(() => _selectedTab = next);
  }

  void _handleExternalFeedRefresh() {
    if (!mounted) return;
    unawaited(_loadFeed(silent: true, force: true));
  }

  static int _readIntStorage(String key) {
    final parsed = int.tryParse(readStorage(key) ?? '');
    return parsed == null || parsed < 0 ? 0 : parsed;
  }

  static String _getPersistentClientSeed(String storageKey) {
    final existing = readStorage(storageKey);
    if (existing != null && existing.trim().isNotEmpty) return existing;
    final next =
        '${DateTime.now().millisecondsSinceEpoch}-${math.Random().nextInt(0x7fffffff).toRadixString(36)}';
    writeStorage(storageKey, next);
    return next;
  }

  void _advanceHomeAdRotation() {
    final nextRotation = _homeAdRotation + 1;
    _homeAdRotation = nextRotation;
    writeStorage('googer-home-ad-rotation-v1', '$nextRotation');
  }

  /// Debounced people lookup while typing, so accounts that haven't posted into
  /// this feed are still findable by username or Googer ID.
  void _schedulePeopleSearch(String draft) {
    _peopleSearchDebounce?.cancel();
    if (draft.isEmpty) {
      if (_directoryUsers.isNotEmpty) {
        setState(() => _directoryUsers = const []);
      }
      return;
    }
    _peopleSearchDebounce = Timer(const Duration(milliseconds: 250), () async {
      _lastPeopleSearch = draft;
      final results = await Api.searchPeople(draft);
      if (!mounted || _lastPeopleSearch != draft) return;
      setState(() {
        _directoryUsers = results
            .map(
              (u) => _ProfileSuggestion(
                label: (u['full_name'] ?? u['username'] ?? '').toString(),
                username: (u['username'] ?? '').toString(),
                userId: (u['id'] ?? u['user_id'] ?? '').toString(),
                avatar: (Api.rawAvatar(u) ?? '').toString(),
              ),
            )
            .toList();
      });
    });
  }

  void _submitSearch(String value) {
    final query = value.trim();
    setState(() {
      _selectedTab = 0;
      _searchQuery = query;
      _searchDraft = query;
      _showSuggestions = false;
    });
    if (query.isNotEmpty) {
      unawaited(_loadFeed(silent: true));
    }
  }

  /// Category strip visibility follows the scroll *direction*: it hides while
  /// the user scrolls down and comes straight back the moment they scroll up
  /// (and is always shown when parked at the very top).
  void _handleHomeScroll() {
    if (!_homeScrollController.hasClients) return;
    _lastHomeScrollAt = DateTime.now();
    final position = _homeScrollController.position;
    var shouldShow = _showCategories.value;
    if (position.pixels <= 24) {
      shouldShow = true;
    } else if (position.userScrollDirection == ScrollDirection.reverse) {
      shouldShow = false; // dragging content up = scrolling down the feed
    } else if (position.userScrollDirection == ScrollDirection.forward) {
      shouldShow = true; // scrolling back up
    }
    if (shouldShow != _showCategories.value) _showCategories.value = shouldShow;
  }

  Future<void> _loadFeed({bool silent = false, bool force = false}) async {
    if (silent &&
        !force &&
        DateTime.now().difference(_lastHomeScrollAt) <
            const Duration(seconds: 2)) {
      return;
    }
    if (!silent && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    // Same public config the web dashboard fetches on mount (ad-coin reward
    // settings, flash upload-control, own ads). Fire-and-forget: it refines the
    // feed (coin button, flash preview) but never blocks or breaks it.
    unawaited(Api.loadFeedSettings());
    // Blocked authors must not appear anywhere in the feed — the web filters
    // on this list and mobile previously did not.
    unawaited(
      Api.blockedUserIds().then((ids) {
        if (mounted &&
            (ids.length != _blockedUserIds.length ||
                !ids.containsAll(_blockedUserIds))) {
          setState(() => _blockedUserIds = ids);
        }
      }),
    );
    // The Subscriptions category needs the follow graph. Fire-and-forget like
    // the block list: until it lands the category simply shows nothing, which
    // is preferable to blocking first paint on it.
    unawaited(_loadFollowing());
    try {
      List<_FeedEntry>? canonicalEntries;
      List<GoogPost> posts = const [];
      List<UploadContent> uploads = const [];
      List<HomeAd> ads = const [];
      try {
        final result = await Future.wait([
          Api.feed(),
          Api.uploadContents(),
          Api.activeAds(shuffleSeed: _homeAdShuffleSeed),
        ]);
        posts = result[0] as List<GoogPost>;
        uploads = result[1] as List<UploadContent>;
        ads = result[2] as List<HomeAd>;
      } catch (_) {
        final result = await Future.wait([
          Api.feed(),
          Api.uploadContents(),
          Api.activeAds(shuffleSeed: _homeAdShuffleSeed),
        ]);
        posts = result[0] as List<GoogPost>;
        uploads = result[1] as List<UploadContent>;
        ads = result[2] as List<HomeAd>;
      }
      if (!mounted) return;
      setState(() {
        _posts = posts;
        _uploads = uploads;
        _ads = ads;
        _canonicalFeedEntries = canonicalEntries;
        _categories = _homeGoogCategories;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted || silent) return;
      setState(() {
        _loading = false;
        _error = 'Could not load the live feed. Pull to retry.';
      });
    }
  }

  /// Who the viewer follows, keyed the same way feed rows carry their owner id.
  Future<void> _loadFollowing() async {
    if (!Api.loggedIn || Api.currentUserId.isEmpty) return;
    final rows = await Api.following(Api.currentUserId);
    if (!mounted) return;
    final ids = <String>{};
    for (final row in rows) {
      for (final key in const [
        'id',
        'user_id',
        'userId',
        'googer_id',
        'googerId',
        'following_id',
        'followingId',
        'subscribed_to_id',
        'subscribedToId',
      ]) {
        final id = "${row[key] ?? ""}".trim();
        if (id.isNotEmpty && id != 'null') ids.add(id);
      }
    }
    if (ids.length != _followingUserIds.length ||
        !ids.containsAll(_followingUserIds)) {
      setState(() => _followingUserIds = ids);
    }
  }

  List<_FeedEntry> get _entries {
    final canonical = _canonicalFeedEntries;
    if (canonical != null) return _filterCanonicalEntries(canonical);

    final selected = _selectedCategory.toLowerCase();
    final query = _searchQuery.trim().toLowerCase();
    bool matchesSearch(String value) =>
        query.isEmpty || value.toLowerCase().contains(query);
    final searchedPosts = _posts
        .where(
          (post) =>
              _postMatchesGoogCategory(post, selected) &&
              !_hiddenGoogIds.contains('${post.id}') &&
              !_isBlocked(post.userId) &&
              // Subscriptions narrows the feed to people you follow.
              (!_isSubscriptionsFilter || _isFollowed(post.userId)) &&
              matchesSearch('${post.name} ${post.username} ${post.text}'),
        )
        .toList();
    // web matchesHomeUploadSearch: topic/description/content_type/media_type/
    // visibility/username/full_name/reposted_by_*/hashtags
    final searchedUploads = _uploads
        .where(
          (item) =>
              _uploadMatchesGoogCategory(item, selected) &&
              // web: only Approved content reaches the home feed.
              item.status.trim().toLowerCase() == 'approved' &&
              !_hiddenUploadIds.contains('${item.id}') &&
              !_isBlocked(item.ownerUserId) &&
              // Subscriptions narrows to followed creators and, on top of that,
              // drops anything the creator marked private.
              (!_isSubscriptionsFilter ||
                  (_isFollowed(item.ownerUserId) &&
                      item.visibility.trim().toLowerCase() != 'private')) &&
              matchesSearch(
                '${item.fullName} ${item.username} ${item.topic} ${item.description} '
                '${item.hashtags} ${item.type} ${item.mediaType} ${item.repostedByName}',
              ),
        )
        .toList();
    final validPosts = homeFeedShuffleItemsWithSeedForWebParity(
      searchedPosts.where((post) => post.id != 0).toList(),
      _feedSeed,
      (post) => '${post.id}',
    );
    final organicItems = homeFeedShuffleItemsWithSeedForWebParity<_FeedEntry>(
      <_FeedEntry>[
        ...validPosts.map(_GoogEntry.new),
        for (var i = 0; i < searchedUploads.length; i++)
          _UploadEntry(searchedUploads[i], index: i),
      ],
      '$_feedSeed:mixed-organic',
      (entry) => entry.sortKey,
    );

    final ads = _ads.where((ad) {
      if (_hiddenAds.contains(ad.adId)) return false;
      if (_isBlocked(ad.ownerUserId)) return false;
      // Web does not filter ads by the selected category chip. Category chips
      // filter googs and upload-content; active ads are still interleaved.
      return matchesSearch(
        '${ad.fullName} ${ad.username} ${ad.title} ${ad.description} '
        '${ad.campaignType} ${ad.feedCategory} ${ad.ctaTopic} ${ad.activeLink}',
      );
    }).toList();
    // Profile Promote ads are NOT mixed in as normal feed cards on the web —
    // they are grouped into their own horizontal carousel row.
    final profileAds = ads.where((ad) => ad.isProfilePromote).toList();
    final nonProfilePromoteAds = ads
        .where((ad) => !ad.isProfilePromote)
        .toList();
    final feedAds = query.isEmpty
        ? _rotateHomeAds(nonProfilePromoteAds, _homeAdRotation)
        : nonProfilePromoteAds;

    final withProfileRows = _insertHomeProfilePromoteRows(
      organicItems,
      profileAds,
      _feedSeed,
    );
    final mixed = _interleaveHomeOrganicItemsWithAds(withProfileRows, feedAds);
    if (mixed.isEmpty && feedAds.isEmpty && profileAds.isNotEmpty) {
      return [
        _ProfileCarouselEntry(
          _shuffledProfilePromoteAds(profileAds, _feedSeed, 1),
          1,
        ),
      ];
    }
    if (mixed.isEmpty) {
      for (var i = 0; i < feedAds.length; i++) {
        mixed.add(_AdEntry(feedAds[i], i));
      }
    }
    return mixed;
  }

  List<HomeAd> _rotateHomeAds(List<HomeAd> sourceAds, int rotation) {
    if (sourceAds.length <= 1) return sourceAds;
    final index = rotation % sourceAds.length;
    return [...sourceAds.skip(index), ...sourceAds.take(index)];
  }

  List<_FeedEntry> _filterCanonicalEntries(List<_FeedEntry> entries) {
    final selected = _selectedCategory.toLowerCase();
    final query = _searchQuery.trim().toLowerCase();
    bool matchesSearch(String value) =>
        query.isEmpty || value.toLowerCase().contains(query);
    final output = <_FeedEntry>[];
    for (final entry in entries) {
      if (entry is _GoogEntry) {
        final post = entry.post;
        if (_postMatchesGoogCategory(post, selected) &&
            !_hiddenGoogIds.contains('${post.id}') &&
            !_isBlocked(post.userId) &&
            (!_isSubscriptionsFilter || _isFollowed(post.userId)) &&
            matchesSearch('${post.name} ${post.username} ${post.text}')) {
          output.add(entry);
        }
        continue;
      }
      if (entry is _UploadEntry) {
        final item = entry.item;
        if (_uploadMatchesGoogCategory(item, selected) &&
            item.status.trim().toLowerCase() == 'approved' &&
            !_hiddenUploadIds.contains('${item.id}') &&
            !_isBlocked(item.ownerUserId) &&
            (!_isSubscriptionsFilter ||
                (_isFollowed(item.ownerUserId) &&
                    item.visibility.trim().toLowerCase() != 'private')) &&
            matchesSearch(
              '${item.fullName} ${item.username} ${item.topic} ${item.description} '
              '${item.hashtags} ${item.type} ${item.mediaType} ${item.repostedByName}',
            )) {
          output.add(entry);
        }
        continue;
      }
      if (entry is _AdEntry) {
        final ad = entry.ad;
        if (!_hiddenAds.contains(ad.adId) &&
            !_isBlocked(ad.ownerUserId) &&
            matchesSearch(
              '${ad.fullName} ${ad.username} ${ad.title} ${ad.description} '
              '${ad.campaignType} ${ad.feedCategory} ${ad.ctaTopic} ${ad.activeLink}',
            )) {
          output.add(entry);
        }
        continue;
      }
      if (entry is _ProfileCarouselEntry) {
        final filteredAds = entry.ads
            .where((ad) {
              if (_hiddenAds.contains(ad.adId) || _isBlocked(ad.ownerUserId)) {
                return false;
              }
              return matchesSearch(
                '${ad.fullName} ${ad.username} ${ad.title} ${ad.description} '
                '${ad.campaignType} ${ad.feedCategory} ${ad.ctaTopic} ${ad.activeLink}',
              );
            })
            .toList(growable: false);
        if (filteredAds.isNotEmpty) {
          output.add(_ProfileCarouselEntry(filteredAds, entry.slot));
        }
      }
    }
    return output;
  }

  List<_FeedEntry> _insertHomeProfilePromoteRows(
    List<_FeedEntry> items,
    List<HomeAd> profileAds,
    String shuffleSeed,
  ) {
    if (profileAds.isEmpty) return items;
    if (items.isEmpty) {
      return [
        _ProfileCarouselEntry(
          _shuffledProfilePromoteAds(profileAds, shuffleSeed, 1),
          1,
        ),
      ];
    }

    var nextProfileInterval = 3;
    var organicItemsSinceProfileRow = 0;
    var carouselCount = 0;
    final output = <_FeedEntry>[];

    for (final item in items) {
      output.add(item);
      if (item is! _GoogEntry && item is! _UploadEntry) continue;

      organicItemsSinceProfileRow += 1;
      if (organicItemsSinceProfileRow == nextProfileInterval) {
        carouselCount += 1;
        output.add(
          _ProfileCarouselEntry(
            _shuffledProfilePromoteAds(profileAds, shuffleSeed, carouselCount),
            carouselCount,
          ),
        );
        organicItemsSinceProfileRow = 0;
        nextProfileInterval = 8;
      }
    }

    if (carouselCount == 0) {
      output.add(
        _ProfileCarouselEntry(
          _shuffledProfilePromoteAds(profileAds, shuffleSeed, 1),
          1,
        ),
      );
    }
    return output;
  }

  List<HomeAd> _shuffledProfilePromoteAds(
    List<HomeAd> ads,
    String seed,
    int carouselIndex,
  ) {
    return homeFeedShuffleItemsWithSeedForWebParity(
      ads,
      '$seed:profile-promote:$carouselIndex',
      (ad) => ad.adId,
    );
  }

  List<_FeedEntry> _interleaveHomeOrganicItemsWithAds(
    List<_FeedEntry> items,
    List<HomeAd> ads,
  ) {
    if (ads.isEmpty) return items;
    if (items.isEmpty) {
      return [for (var i = 0; i < ads.length; i++) _AdEntry(ads[i], i)];
    }

    final output = <_FeedEntry>[];
    var adIndex = 0;
    var organicCount = 0;
    for (final item in items) {
      output.add(item);
      if (item is! _GoogEntry && item is! _UploadEntry) continue;

      organicCount += 1;
      if (organicCount == 1 || organicCount % 4 == 0) {
        output.add(_AdEntry(ads[adIndex % ads.length], adIndex));
        adIndex += 1;
      }
    }
    if (adIndex == 0) {
      output.add(_AdEntry(ads.first, 0));
    }
    return output;
  }

  Widget _buildHomeFeed() {
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 26,
          height: 26,
          child: CircularProgressIndicator(
            color: AppColors.textGray300,
            strokeWidth: 2,
          ),
        ),
      );
    }

    final entries = _entries;
    return Column(
      children: [
        // Lives outside the list so hiding/showing it never shifts the feed's
        // scroll offset — it just collapses in place.
        ValueListenableBuilder<bool>(
          valueListenable: _showCategories,
          builder: (context, visible, _) => AnimatedSize(
            duration: const Duration(milliseconds: 140),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: visible
                ? _CategoryStrip(
                    categories: _categories,
                    selected: _selectedCategory,
                    onSelected: (value) =>
                        setState(() => _selectedCategory = value),
                  )
                : const SizedBox(width: double.infinity, height: 0),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            color: AppColors.textGray300,
            backgroundColor: AppColors.bg1,
            onRefresh: _loadFeed,
            child: ListView.builder(
              controller: _homeScrollController,
              padding: const EdgeInsets.fromLTRB(0, 4, 0, 8),
              itemCount:
                  entries.length + (_error != null || entries.isEmpty ? 1 : 0),
              itemBuilder: (context, i) {
                if (_error != null && i == 0) {
                  return _FeedNotice(text: _error!, onTap: _loadFeed);
                }
                if (entries.isEmpty) {
                  return const _EmptyFeed();
                }
                final entry = entries[i - (_error != null ? 1 : 0)];
                if (entry is _GoogEntry) {
                  return GoogFeedCard(
                    key: ValueKey(entry.sortKey),
                    post: entry.post,
                    onRefresh: _loadFeed,
                    onHide: () =>
                        setState(() => _hiddenGoogIds.add('${entry.post.id}')),
                  );
                }
                if (entry is _UploadEntry) {
                  return UploadFeedCard(
                    key: ValueKey(entry.sortKey),
                    item: entry.item,
                    onRefresh: _loadFeed,
                    onEditStart: () => setState(
                      () => _uploads = _uploads
                          .where((upload) => upload.id != entry.item.id)
                          .toList(growable: false),
                    ),
                    onHide: () => setState(
                      () => _hiddenUploadIds.add('${entry.item.id}'),
                    ),
                  );
                }
                if (entry is _AdEntry) {
                  return HomeAdFeedCard(
                    key: ValueKey(entry.sortKey),
                    ad: entry.ad,
                    onHide: () {
                      hideFeedItemFor24Hours(
                        Api.currentUserId,
                        'ad',
                        entry.ad.adId,
                      );
                      setState(() => _hiddenAds.add(entry.ad.adId));
                    },
                    onRefresh: _loadFeed,
                  );
                }
                if (entry is _ProfileCarouselEntry) {
                  return _ProfilePromoteCarousel(
                    key: ValueKey(entry.sortKey),
                    ads: entry.ads,
                    rotation: entry.slot,
                  );
                }
                return const SizedBox.shrink();
              },
            ),
          ),
        ),
      ],
    );
  }

  /// Web parity (`googSearchSuggestions`): up to 6 deduped **profile** matches
  /// drawn only from what is already in the feed — googs, upload contents and
  /// ads — matched on the live draft against username / display name.
  ///
  /// Deliberately *not* a user-directory lookup. The web derives suggestions
  /// from the loaded feed, so only people whose content you can actually see
  /// are offered; querying the users table instead surfaced every account that
  /// merely matched the text (including staff/support and people with no
  /// posts), which is both wrong and a disclosure the web never makes.
  List<_ProfileSuggestion> get _googSearchSuggestions {
    final draft = _searchDraft.trim().toLowerCase();
    if (draft.isEmpty) return const [];
    final seen = <String>{};
    final out = <_ProfileSuggestion>[];

    void push(String label, String username, String userId, String avatar) {
      if (out.length >= 6) return;
      final value = username.trim().isNotEmpty ? username.trim() : label.trim();
      if (value.isEmpty) return;
      final display = label.trim().isEmpty ? value : label.trim();
      if (!value.toLowerCase().contains(draft) &&
          !display.toLowerCase().contains(draft)) {
        return;
      }
      if (_isStaffAccount(username, display)) return;
      final key = value.toLowerCase();
      if (seen.contains(key)) return;
      seen.add(key);
      out.add(
        _ProfileSuggestion(
          label: display.length > 56
              ? '${display.substring(0, 53)}...'
              : display,
          username: username.trim(),
          userId: userId,
          avatar: avatar,
        ),
      );
    }

    for (final post in _posts) {
      if (out.length >= 6) break;
      push(post.name, post.username, post.userId, post.img);
    }
    for (final upload in _uploads) {
      if (out.length >= 6) break;
      push(upload.fullName, upload.username, upload.ownerUserId, upload.avatar);
    }
    for (final ad in _ads) {
      if (out.length >= 6) break;
      if (_hiddenAds.contains(ad.interactionId)) continue;
      push(ad.fullName, ad.username, ad.ownerUserId, ad.avatar);
    }
    // Then anyone else on Googer who matches. Feed authors rank first because
    // they are the most relevant; the directory fills the remaining slots.
    for (final u in _directoryUsers) {
      if (out.length >= 6) break;
      push(u.label, u.username, u.userId, u.avatar);
    }

    return out;
  }

  /// Platform/staff accounts (Googer Support and friends) are never offered as
  /// search suggestions to a normal user.
  static bool _isStaffAccount(String username, String displayName) {
    final handle = username.trim().toLowerCase();
    final name = displayName.trim().toLowerCase();
    const reserved = ['googer support', 'googer official', 'googer admin'];
    if (reserved.any((r) => name == r || handle == r.replaceAll(' ', ''))) {
      return true;
    }
    return handle == 'googersupport' ||
        handle == 'support' ||
        handle == 'admin' ||
        name.startsWith('googer support');
  }

  Widget _buildSuggestionsDropdown() {
    final items = _googSearchSuggestions;
    if (items.isEmpty) return const SizedBox.shrink();
    return Positioned(
      top: 6,
      left: 12,
      right: 12,
      child: Material(
        color: Colors.transparent,
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: const Color(0xFF121212),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.borderWhite10),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.45),
                blurRadius: 28,
                offset: const Offset(0, 14),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < items.length; i++)
                InkWell(
                  onTap: () {
                    FocusScope.of(context).unfocus();
                    setState(() => _showSuggestions = false);
                    _openUserProfile(
                      context,
                      userId: items[i].userId,
                      username: items[i].username.isEmpty
                          ? items[i].label
                          : items[i].username,
                      name: items[i].label,
                      avatar: items[i].avatar,
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 9,
                    ),
                    decoration: BoxDecoration(
                      border: Border(
                        top: BorderSide(
                          color: i == 0
                              ? Colors.transparent
                              : AppColors.borderWhite06,
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        _Avatar(
                          url: items[i].avatar,
                          name: items[i].label,
                          size: 32,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                items[i].label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white,
                                ),
                              ),
                              Text(
                                items[i].username.isEmpty
                                    ? 'PROFILE'
                                    : '@${items[i].username}'.toUpperCase(),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 9,
                                  letterSpacing: 1.1,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.textGray600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Ionicons.chevron_forward_outline,
                          size: 12,
                          color: AppColors.textGray700,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: GoogerTopbar(
        title: 'Googer',
        searchController: _searchCtrl,
        showSearchClear: _searchDraft.isNotEmpty || _searchQuery.isNotEmpty,
        onSearchChanged: (value) {
          setState(() {
            _searchDraft = value;
            _showSuggestions = value.trim().isNotEmpty;
          });
          _schedulePeopleSearch(value.trim());
        },
        onSearchSubmitted: (value) {
          _submitSearch(value);
        },
        onSearchFocus: () =>
            setState(() => _showSuggestions = _searchDraft.trim().isNotEmpty),
        onSearchClear: () {
          _searchCtrl.clear();
          _peopleSearchDebounce?.cancel();
          setState(() {
            _searchDraft = "";
            _searchQuery = "";
            _showSuggestions = false;
            _directoryUsers = const [];
          });
        },
      ),
      body: Stack(
        children: [
          _buildScreen(_selectedTab),
          if (_selectedTab == 0 &&
              _showSuggestions &&
              _searchDraft.trim().isNotEmpty)
            _buildSuggestionsDropdown(),
        ],
      ),
      bottomNavigationBar: GoogerBottomNav(
        active: _getTabFromIndex(_selectedTab),
        onTap: (tab) {
          final next = _getIndexFromTab(tab);
          // Keep the shared notifier in step, otherwise a later request for
          // this same tab from a pushed screen would not fire a change.
          HomeFeedScreen.requestedTab.value = next;
          setState(() => _selectedTab = next);
        },
        onAddTap: () => AdCampaignScreen.showCreateSheet(
          context,
          onGoogPosted: () => _loadFeed(silent: true),
        ),
      ),
    );
  }

  Widget _buildScreen(int index) {
    switch (index) {
      case 0:
        return _buildHomeFeed();
      case 1:
        // The shop has no search box of its own any more — the topbar's is the
        // only one — so hand it the committed query.
        return ShopFeedScreen(searchQuery: _searchQuery);
      case 3:
        return const WalletScreen();
      case 4:
        // Chats has no search box either — filter live off the topbar draft so
        // typing narrows the list and surfaces Googers to start new chats.
        return ChatsScreen(
          searchQuery: _searchDraft.trim().isEmpty
              ? _searchQuery
              : _searchDraft,
        );
      default:
        return _buildHomeFeed();
    }
  }

  GoogerTab _getTabFromIndex(int index) {
    switch (index) {
      case 1:
        return GoogerTab.shop;
      case 3:
        return GoogerTab.wallet;
      case 4:
        return GoogerTab.chats;
      default:
        return GoogerTab.home;
    }
  }

  int _getIndexFromTab(GoogerTab tab) {
    switch (tab) {
      case GoogerTab.home:
        return 0;
      case GoogerTab.shop:
        return 1;
      case GoogerTab.wallet:
        return 3;
      case GoogerTab.chats:
        return 4;
    }
  }
}

class _CategoryStrip extends StatelessWidget {
  final List<String> categories;
  final String selected;
  final ValueChanged<String> onSelected;
  const _CategoryStrip({
    required this.categories,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final items = categories.isEmpty ? const ["All"] : categories;
    return SizedBox(
      height: 32,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 5),
        itemBuilder: (_, index) {
          final item = items[index];
          final active = item == selected;
          return GestureDetector(
            onTap: () => onSelected(item),
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 9),
              decoration: BoxDecoration(
                color: active ? Colors.white : AppColors.bg0,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Text(
                item,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 8,
                  letterSpacing: 0.01,
                  fontWeight: FontWeight.w600,
                  color: active ? Colors.black : AppColors.textGray300,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

abstract class _FeedEntry {
  String get sortKey;
}

class _GoogEntry extends _FeedEntry {
  final GoogPost post;
  _GoogEntry(this.post);
  @override
  String get sortKey => 'goog-${post.id}';
}

class _UploadEntry extends _FeedEntry {
  final UploadContent item;
  final int index;
  _UploadEntry(this.item, {this.index = 0});
  @override
  String get sortKey {
    final contentKey = item.contentId.trim().isNotEmpty
        ? item.contentId.trim()
        : (item.id == 0 ? '$index' : '${item.id}');
    final repostOwner = item.repostedByName.trim().isNotEmpty
        ? item.repostedByName.trim()
        : 'original';
    return 'home-upload-content-$contentKey-$repostOwner-${item.repostedAt}';
  }
}

class _AdEntry extends _FeedEntry {
  final HomeAd ad;
  final int slot;
  _AdEntry(this.ad, this.slot);
  @override
  String get sortKey => 'a-$slot-${ad.adId}';
}

/// Web report modal reason lists.
const _googReportReasons = [
  "Spam or misleading",
  "Harassment or bullying",
  "Hate speech or graphic",
  "Inappropriate content",
  "Other",
];
const _uploadReportReasons = [
  "Copyright Violation",
  "Spam / Scam Content",
  "Inappropriate Content",
  "Fake or Fraud Content",
  "Misleading or Not as Described",
  "Other",
];

/// Shared report sheet — pick a reason (+ optional detail) then submit.
/// [submit] returns null on success or the server's message on failure, so
/// real backend responses ("Already reported") reach the user.
void _openReportSheet(
  BuildContext context, {
  required String title,
  required List<String> reasons,
  required Future<String?> Function(String reason, String detail) submit,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.bg1,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (sheetContext) =>
        _ReportSheet(title: title, reasons: reasons, submit: submit),
  );
}

class _ReportSheet extends StatefulWidget {
  final String title;
  final List<String> reasons;
  final Future<String?> Function(String reason, String detail) submit;
  const _ReportSheet({
    required this.title,
    required this.reasons,
    required this.submit,
  });

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  String _reason = "";
  final _detail = TextEditingController();
  bool _submitting = false;
  bool _done = false;
  String _error = "";

  @override
  void dispose() {
    _detail.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_reason.isEmpty || _submitting) return;
    setState(() {
      _submitting = true;
      _error = "";
    });
    final error = await widget.submit(_reason, _detail.text.trim());
    if (!mounted) return;
    setState(() {
      _submitting = false;
      _done = error == null;
      _error = error ?? "";
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: _done
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Ionicons.checkmark_circle,
                  size: 40,
                  color: AppColors.successGreen,
                ),
                const SizedBox(height: 10),
                const Text(
                  'Report submitted',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Thanks — our team will review it.',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: TextButton(
                    onPressed: () => Navigator.maybePop(context),
                    child: const Text(
                      'Close',
                      style: TextStyle(color: AppColors.textGray300),
                    ),
                  ),
                ),
              ],
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Ionicons.alert_circle_outline,
                      size: 18,
                      color: Color(0xFFFACC15),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      widget.title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Text(
                  'SELECT A REASON',
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 8),
                ...widget.reasons.map(
                  (reason) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: GestureDetector(
                      onTap: () => setState(() => _reason = reason),
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 11,
                        ),
                        decoration: BoxDecoration(
                          color: _reason == reason
                              ? const Color(0x1AFACC15)
                              : AppColors.bg2,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _reason == reason
                                ? const Color(0x66FACC15)
                                : AppColors.borderWhite10,
                          ),
                        ),
                        child: Text(
                          reason,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: _reason == reason
                                ? const Color(0xFFFACC15)
                                : AppColors.textGray200,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                TextField(
                  controller: _detail,
                  maxLines: 2,
                  style: const TextStyle(fontSize: 12.5, color: Colors.white),
                  cursorColor: AppColors.accentPurple,
                  decoration: InputDecoration(
                    hintText: 'Add details (optional)',
                    hintStyle: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textGray600,
                    ),
                    filled: true,
                    fillColor: AppColors.bg2,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                        color: AppColors.borderWhite10,
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                        color: AppColors.borderWhite10,
                      ),
                    ),
                  ),
                ),
                if (_error.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.likeRed.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: AppColors.likeRed.withOpacity(0.3),
                      ),
                    ),
                    child: Text(
                      _error,
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w500,
                        color: AppColors.likeRed,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _reason.isEmpty || _submitting ? null : _send,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.likeRed,
                      disabledBackgroundColor: AppColors.bg3,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text(
                            'Submit report',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                  ),
                ),
              ],
            ),
    );
  }
}

/// A Profile Promote carousel row (web ProfilePromoteCarousel).
class _ProfileCarouselEntry extends _FeedEntry {
  final List<HomeAd> ads;
  final int slot;
  _ProfileCarouselEntry(this.ads, this.slot);
  @override
  String get sortKey => 'pp-$slot';
}

/// One row of the Googs search suggestions dropdown (web: profile suggestions).
class _ProfileSuggestion {
  final String label;
  final String username;
  final String userId;
  final String avatar;
  const _ProfileSuggestion({
    required this.label,
    required this.username,
    required this.userId,
    required this.avatar,
  });
}

/// Link preview details derived from a goog's text — a direct port of the web
/// `getGoogLinkPreview`. Everything is computed client-side from the URL, so no
/// backend call or metadata fetch is involved.
class _GoogLinkPreviewData {
  final String href;
  final String host;
  final String pathLabel;
  final String favicon;
  final String? videoThumbnail;
  final String? videoLabel;

  const _GoogLinkPreviewData({
    required this.href,
    required this.host,
    required this.pathLabel,
    required this.favicon,
    this.videoThumbnail,
    this.videoLabel,
  });

  bool get isVideo => videoLabel != null;
}

final _googUrlPattern = RegExp(
  r'(https?://[^\s]+|www\.[^\s]+)',
  caseSensitive: false,
);

_GoogLinkPreviewData? _googLinkPreview(String text) {
  if (text.trim().isEmpty) return null;
  final raw = _googUrlPattern.firstMatch(text)?.group(0);
  if (raw == null || raw.isEmpty) return null;

  final normalized = RegExp(r'^https?://', caseSensitive: false).hasMatch(raw)
      ? raw
      : 'https://$raw';
  final uri = Uri.tryParse(normalized);
  if (uri == null || uri.host.isEmpty) return null;

  final host = uri.host.replaceFirst(
    RegExp(r'^www\.', caseSensitive: false),
    '',
  );
  final pathLabel = (uri.path.isEmpty || uri.path == '/') ? '' : uri.path;
  final segments = uri.pathSegments;

  String? videoThumbnail;
  String? videoLabel;

  if (host == 'youtu.be') {
    if (segments.isNotEmpty) {
      videoThumbnail =
          'https://img.youtube.com/vi/${segments.first}/hqdefault.jpg';
      videoLabel = 'YouTube';
    }
  } else if (host.endsWith('youtube.com')) {
    final id =
        uri.queryParameters['v'] ??
        ((segments.length > 1 &&
                (segments.first == 'embed' || segments.first == 'shorts'))
            ? segments[1]
            : null);
    if (id != null && id.isNotEmpty) {
      videoThumbnail = 'https://img.youtube.com/vi/$id/hqdefault.jpg';
      videoLabel = 'YouTube';
    }
  } else if (host.endsWith('vimeo.com')) {
    videoLabel = 'Vimeo';
  } else if (host.endsWith('tiktok.com')) {
    videoLabel = 'TikTok';
  } else if (RegExp(
    r'\.(mp4|webm|ogg|mov|m4v)($|\?|#)',
    caseSensitive: false,
  ).hasMatch(uri.path)) {
    videoLabel = 'Video';
  }

  return _GoogLinkPreviewData(
    href: normalized,
    host: host,
    pathLabel: pathLabel,
    favicon:
        'https://www.google.com/s2/favicons?domain=${Uri.encodeComponent(host)}&sz=64',
    videoThumbnail: videoThumbnail,
    videoLabel: videoLabel,
  );
}

/// Highlights links, @mentions and #hashtags inside a goog, matching the web
/// `renderGoogText`. Links are tappable and rendered in the app's link blue.
final _googRichTextPattern = RegExp(
  r'(https?://[^\s]+|www\.[^\s]+|@[A-Za-z0-9_]+|#[A-Za-z0-9_]+)',
  caseSensitive: false,
);

/// Links and @mentions use the same light blue as the verification tick.
const _googLinkBlue = Color(0xFF3897F0);

/// Hashtags are red.
const _googHashtagRed = Color(0xFFEF4444);

List<InlineSpan> _googTextSpans(String text, TextStyle base) {
  final spans = <InlineSpan>[];
  var cursor = 0;
  for (final match in _googRichTextPattern.allMatches(text)) {
    if (match.start > cursor) {
      spans.add(TextSpan(text: text.substring(cursor, match.start)));
    }
    final token = match.group(0)!;
    if (token.startsWith('@') || token.startsWith('#')) {
      spans.add(
        TextSpan(
          text: token,
          style: base.copyWith(
            color: token.startsWith('#') ? _googHashtagRed : _googLinkBlue,
            fontWeight: FontWeight.w500,
          ),
        ),
      );
    } else {
      final href = RegExp(r'^https?://', caseSensitive: false).hasMatch(token)
          ? token
          : 'https://$token';
      spans.add(
        TextSpan(
          text: token,
          style: base.copyWith(
            color: _googLinkBlue,
            fontWeight: FontWeight.w500,
          ),
          recognizer: TapGestureRecognizer()
            ..onTap = () => openExternalLink(href),
        ),
      );
    }
    cursor = match.end;
  }
  if (cursor < text.length) {
    spans.add(TextSpan(text: text.substring(cursor)));
  }
  return spans;
}

/// Player URL for a social/video link, ported from the web
/// `getSponsoredSocialEmbedUrl`. Returns null when the link isn't embeddable,
/// in which case the preview just opens externally.
String? _googEmbedUrl(String href) {
  final uri = Uri.tryParse(href);
  if (uri == null || uri.host.isEmpty) return null;
  final host = uri.host
      .replaceFirst(RegExp(r'^www\.', caseSensitive: false), '')
      .toLowerCase();
  final parts = uri.pathSegments.where((p) => p.isNotEmpty).toList();

  if (host == 'youtu.be' && parts.isNotEmpty) {
    return 'https://www.youtube.com/embed/${parts.first}?autoplay=1';
  }
  if (host.endsWith('youtube.com')) {
    final id =
        uri.queryParameters['v'] ??
        ((parts.length > 1 &&
                (parts.first == 'embed' || parts.first == 'shorts'))
            ? parts[1]
            : null);
    if (id != null && id.isNotEmpty) {
      return 'https://www.youtube.com/embed/$id?autoplay=1';
    }
  }
  if (host.contains('instagram.com') && parts.length > 1) {
    if (const ['p', 'reel', 'tv'].contains(parts[0])) {
      return 'https://www.instagram.com/${parts[0]}/${parts[1]}/embed';
    }
  }
  if (host.contains('tiktok.com')) {
    final i = parts.indexOf('video');
    if (i >= 0 && i + 1 < parts.length) {
      return 'https://www.tiktok.com/embed/v2/${parts[i + 1]}';
    }
    return null;
  }
  if (host.contains('facebook.com') || host.contains('fb.watch')) {
    final isVideo = RegExp(
      r'/videos/|/watch/|\?v=|fb\.watch',
      caseSensitive: false,
    ).hasMatch(href);
    final plugin = isVideo ? 'video.php' : 'post.php';
    return 'https://www.facebook.com/plugins/$plugin'
        '?href=${Uri.encodeComponent(href)}&show_text=false&width=560';
  }
  if (host.endsWith('vimeo.com') && parts.isNotEmpty) {
    final id = parts.last;
    if (RegExp(r'^\d+$').hasMatch(id)) {
      return 'https://player.vimeo.com/video/$id?autoplay=1';
    }
  }
  return null;
}

/// Plays a goog's link in-app instead of navigating away. Direct video files
/// use a real <video> element; social links use their embed player. An
/// "Open" action is always offered for watching on the source site.
void _openGoogLinkPlayer(BuildContext context, _GoogLinkPreviewData preview) {
  final embed = _googEmbedUrl(preview.href);
  final isFile = RegExp(
    r'\.(mp4|webm|ogg|mov|m4v)($|\?|#)',
    caseSensitive: false,
  ).hasMatch(preview.href);

  if (embed == null && !isFile) {
    openExternalLink(preview.href);
    return;
  }

  showDialog<void>(
    context: context,
    barrierColor: Colors.black.withOpacity(0.92),
    builder: (dialogContext) => Dialog(
      backgroundColor: const Color(0xFF0B0B0B),
      insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 24),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: AppColors.borderWhite10),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 8, 6),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    preview.host.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.2,
                      color: Colors.white,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () => openExternalLink(preview.href),
                  behavior: HitTestBehavior.opaque,
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Ionicons.open_outline,
                          size: 13,
                          color: AppColors.linkBlue,
                        ),
                        SizedBox(width: 5),
                        Text(
                          'OPEN',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.2,
                            color: AppColors.linkBlue,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                    Ionicons.close,
                    size: 18,
                    color: Colors.white,
                  ),
                  onPressed: () => Navigator.pop(dialogContext),
                ),
              ],
            ),
          ),
          ClipRRect(
            borderRadius: const BorderRadius.vertical(
              bottom: Radius.circular(16),
            ),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: ColoredBox(
                color: Colors.black,
                child: isFile ? webVideo(preview.href) : webEmbed(embed!),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Compact link card shown under a goog that contains a URL, matching the web
/// `GoogLinkPreviewCard`.
class _GoogLinkPreviewCard extends StatelessWidget {
  final _GoogLinkPreviewData preview;
  const _GoogLinkPreviewCard({required this.preview});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _openGoogLinkPlayer(context, preview),
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(top: 9),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Container(
                width: 34,
                height: 34,
                color: Colors.white.withOpacity(0.05),
                alignment: Alignment.center,
                child: preview.videoThumbnail != null
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.network(
                            preview.videoThumbnail!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(
                              Ionicons.videocam,
                              size: 15,
                              color: AppColors.textGray400,
                            ),
                          ),
                          Container(
                            color: Colors.black.withOpacity(0.35),
                            child: const Icon(
                              Ionicons.play,
                              size: 12,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      )
                    : preview.isVideo
                    ? const Icon(
                        Ionicons.videocam,
                        size: 15,
                        color: AppColors.textGray400,
                      )
                    : Image.network(
                        preview.favicon,
                        width: 22,
                        height: 22,
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const Icon(
                          Ionicons.link,
                          size: 15,
                          color: AppColors.textGray400,
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          preview.host.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.1,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      if (preview.videoLabel != null) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 5,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            preview.videoLabel!,
                            style: const TextStyle(
                              fontSize: 7.5,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.1,
                              color: AppColors.textGray300,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    preview.pathLabel.isEmpty
                        ? preview.href
                        : preview.pathLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(
              Ionicons.open_outline,
              size: 14,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }
}

class GoogFeedCard extends StatefulWidget {
  final GoogPost post;
  final Future<void> Function({bool silent}) onRefresh;

  /// "Not interested" — drops this goog from the feed for this session.
  final VoidCallback onHide;
  const GoogFeedCard({
    super.key,
    required this.post,
    required this.onRefresh,
    required this.onHide,
  });

  @override
  State<GoogFeedCard> createState() => GoogFeedCardState();
}

class GoogFeedCardState extends State<GoogFeedCard> {
  late bool _liked = widget.post.liked;
  late int _likes = widget.post.likes;
  late int _views = widget.post.views;
  late int _shares = widget.post.shares;

  /// Comment total shown on the card. Bumped straight away for feedback, then
  /// reconciled with the backend's `comments_count` by the feed refresh — the
  /// same number the web renders.
  late int _comments = widget.post.comments;

  /// Parsed once per goog rather than on every rebuild.
  late _GoogLinkPreviewData? _linkPreview = _googLinkPreview(widget.post.text);
  bool _loggedFeedExposure = false;

  @override
  void initState() {
    super.initState();
  }

  @override
  void didUpdateWidget(covariant GoogFeedCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.post.id != widget.post.id) {
      _loggedFeedExposure = false;
      _views = widget.post.views;
    }
    if (oldWidget.post.text != widget.post.text) {
      _linkPreview = _googLinkPreview(widget.post.text);
    }
    if (oldWidget.post.comments != widget.post.comments) {
      _comments = widget.post.comments;
    }
    if (oldWidget.post.likes != widget.post.likes) {
      _likes = widget.post.likes;
      _liked = widget.post.liked;
    }
    if (oldWidget.post.views != widget.post.views) {
      _views = widget.post.views;
    }
    if (oldWidget.post.shares != widget.post.shares) {
      _shares = widget.post.shares;
    }
  }

  void _logFeedExposureViewOnce() {
    if (_loggedFeedExposure) return;
    _loggedFeedExposure = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _logView();
    });
  }

  Future<void> _logView() async {
    final next = await Api.markGoogView(widget.post.id);
    if (!mounted || next == null) return;
    setState(() => _views = next);
  }

  /// Called when a comment is added or removed: reflect it immediately, then
  /// pull the authoritative counts back from the server.
  void _onCommentsChanged({VoidCallback? repaint}) {
    if (mounted) setState(() => _comments += 1);
    repaint?.call();
    widget.onRefresh(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    return VisibilityDetector(
      key: ValueKey('goog-view-${widget.post.id}'),
      onVisibilityChanged: (info) {
        if (info.visibleFraction >= 0.5) _logFeedExposureViewOnce();
      },
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => _openGoogPopup(context, widget.post),
        child: _FeedShell(child: _googBox(context)),
      ),
    );
  }

  /// The goog box itself. The feed card and the popup (second view) render this
  /// exact widget, so both views look identical.
  ///
  /// [refresh] lets the popup repaint too: the dialog lives in its own subtree,
  /// so the card's `setState` alone would leave the popup's like count stale.
  Widget _googBox(BuildContext context, {VoidCallback? refresh}) {
    final post = widget.post;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Avatar(
            url: post.img,
            name: post.name,
            onTap: () => _openUserProfile(
              context,
              userId: post.userId,
              username: post.username,
              name: post.name,
              avatar: post.img,
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              // Hug the content. Without this the column fills whatever
              // height it is offered, which the feed shell hid but made the
              // popup stretch down the screen.
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _FeedHeader(
                  name: post.name.isEmpty ? post.username : post.name,
                  time: post.time,
                  badge: UserVerifiedBadge(userId: post.userId, size: 11),
                  subscribeUserId: post.userId,
                  subscribeName: post.name.isEmpty ? post.username : post.name,
                  onNameTap: () => _openUserProfile(
                    context,
                    userId: post.userId,
                    username: post.username,
                    name: post.name,
                    avatar: post.img,
                  ),
                  onMore: () => _openPostMenu(context, post),
                ),
                const SizedBox(height: 2),
                Builder(
                  builder: (_) {
                    final base = TextStyle(
                      fontSize: 12.5,
                      height: 18 / 12.5,
                      fontWeight: FontWeight.w400,
                      color: post.textColor == null
                          ? AppColors.textGray200
                          : Color(post.textColor!),
                    );
                    return Text.rich(
                      TextSpan(children: _googTextSpans(post.text, base)),
                      style: base,
                    );
                  },
                ),
                // Small link card when the goog contains a URL, same as web.
                if (_linkPreview != null)
                  _GoogLinkPreviewCard(preview: _linkPreview!),
                const SizedBox(height: 9),
                _ActionRow(
                  liked: _liked,
                  likes: _likes,
                  comments: _comments,
                  views: _views,
                  shares: _shares,
                  onLike: () async {
                    setState(() {
                      _liked = !_liked;
                      _likes += _liked ? 1 : -1;
                    });
                    refresh?.call();
                    await Api.toggleGoogLike(post.id);
                  },
                  onComment: () => openInteractionsSheet(
                    context,
                    title: post.name.isEmpty ? post.username : post.name,
                    subtitle: 'GOOG',
                    initialKind: 'comments',
                    counts: {
                      'likes': _likes,
                      'comments': _comments,
                      'views': post.views,
                      'shares': _shares,
                    },
                    fetch: (kind) => Api.googInteractions(post.id, kind),
                    addComment: (text, {parentId}) =>
                        Api.postGoogComment(post.id, text, parentId: parentId),
                    reportComment: (id, reason) =>
                        Api.reportGoogComment(id, reason),
                    deleteComment: (id) => Api.deleteGoogComment(id),
                    likeComment: (id) => Api.likeGoogComment(id),
                    dislikeComment: (id) => Api.dislikeGoogComment(id),
                    onCommentsChanged: () =>
                        _onCommentsChanged(repaint: refresh),
                  ),
                  onView: () {
                    _logView();
                    openInteractionsSheet(
                      context,
                      title: post.name.isEmpty ? post.username : post.name,
                      subtitle: 'GOOG',
                      initialKind: 'views',
                      counts: {
                        'likes': _likes,
                        'comments': _comments,
                        'views': _views,
                        'shares': _shares,
                      },
                      fetch: (kind) => Api.googInteractions(post.id, kind),
                      addComment: (text, {parentId}) => Api.postGoogComment(
                        post.id,
                        text,
                        parentId: parentId,
                      ),
                      reportComment: (id, reason) =>
                          Api.reportGoogComment(id, reason),
                      deleteComment: (id) => Api.deleteGoogComment(id),
                      likeComment: (id) => Api.likeGoogComment(id),
                      dislikeComment: (id) => Api.dislikeGoogComment(id),
                      onCommentsChanged: () =>
                          _onCommentsChanged(repaint: refresh),
                    );
                  },
                  onShare: () async {
                    final next = await _openGoogShareSheet(
                      context,
                      post,
                      currentCount: _shares,
                    );
                    if (mounted && next != null) setState(() => _shares = next);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _openPostMenu(BuildContext context, GoogPost post) {
    final myId = Api.currentUserId.trim();
    final mine =
        (post.userId.trim().isNotEmpty && post.userId.trim() == myId) ||
        (Api.username.isNotEmpty &&
            post.username.toLowerCase() == Api.username.toLowerCase());
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Order mirrors the web goog menu (dashboard/page.tsx openPostMenu):
              // Not Interested · Share · Report · Edit · Delete
              if (!mine)
                _SheetAction('Not Interested', Ionicons.eye_off_outline, () {
                  Navigator.pop(context);
                  // Used to only refresh, which put the goog straight back on
                  // screen. Hide it instead, like the web does.
                  widget.onHide();
                }),
              _SheetAction('Share', Ionicons.share_social_outline, () {
                // Opens the same share sheet as the card's share icon. It used
                // to silently copy a link that was broken whenever the goog had
                // no share code (".../share/" with nothing after it).
                Navigator.pop(context);
                _openGoogShareSheet(context, post);
              }),
              if (!mine)
                _SheetAction('Report', Ionicons.alert_circle_outline, () {
                  Navigator.pop(context);
                  _openReportSheet(
                    context,
                    title: 'Report Post',
                    reasons: _googReportReasons,
                    submit: (reason, detail) =>
                        Api.reportGoog(post.id, reason, detail),
                  );
                }, danger: true),
              if (mine)
                _SheetAction('Edit', Ionicons.create_outline, () {
                  Navigator.pop(context);
                  _editGoog(context, post);
                }),
              if (mine)
                _SheetAction('Delete', Ionicons.trash_outline, () async {
                  Navigator.pop(context);
                  final ok = await _confirmDelete(context);
                  if (ok != true) return;
                  await Api.deleteGoog(post.id);
                  await widget.onRefresh();
                }, danger: true),
            ],
          ),
        ),
      ),
    );
  }

  /// Edit an own goog — web "Edit" menu item → PUT /googs/{id}.
  void _editGoog(BuildContext context, GoogPost post) {
    AdCampaignScreen.showWriteGoogDialog(
      context,
      initialText: post.text,
      initialColor: Color(post.textColor ?? 0xFFFFFFFF),
      submit: (text, colorHex) => Api.updateGoog(post.id, text, colorHex),
      onPosted: () {
        widget.onRefresh();
      },
    );
  }

  /// Goog second view: the same goog box the feed renders, in a compact popup.
  /// No close control — tapping outside dismisses it.
  void _openGoogPopup(BuildContext context, GoogPost post) {
    _logView();
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.9),
      builder: (dialogContext) => StatefulBuilder(
        builder: (_, setDialogState) => Dialog(
          backgroundColor: AppColors.bg1,
          insetPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 24,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: AppColors.borderWhite10),
          ),
          child: SingleChildScrollView(
            child: Padding(
              // `Column.min` keeps the dialog exactly as tall as the goog,
              // instead of stretching to the available height.
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _googBox(context, refresh: () => setDialogState(() {})),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

bool uploadContentAccessIsActive({
  required bool hasAccess,
  required bool isOwner,
  required String purchaseExpiresAt,
  DateTime? now,
}) {
  if (isOwner) return true;
  if (!hasAccess) return false;
  final rawExpiry = purchaseExpiresAt.trim();
  if (rawExpiry.isEmpty) return true;
  final expiry = DateTime.tryParse(rawExpiry);
  if (expiry == null) return true;
  return expiry.toUtc().isAfter((now ?? DateTime.now()).toUtc());
}

bool uploadContentShouldBlur(String contentAccessMode) {
  final normalized = contentAccessMode
      .trim()
      .toLowerCase()
      .replaceAll('-', '_')
      .replaceAll(' ', '_');
  return normalized == 'blurred';
}

class UploadFeedCard extends StatefulWidget {
  final UploadContent item;
  final Future<void> Function({bool silent}) onRefresh;

  /// "Not interested" — drops this upload from the feed for this session.
  final VoidCallback onHide;
  final VoidCallback? onEditStart;
  final bool profilePresentation;
  const UploadFeedCard({
    super.key,
    required this.item,
    required this.onRefresh,
    required this.onHide,
    this.onEditStart,
    this.profilePresentation = false,
  });

  @override
  State<UploadFeedCard> createState() => UploadFeedCardState();
}

class UploadFeedCardState extends State<UploadFeedCard>
    with AutomaticKeepAliveClientMixin<UploadFeedCard> {
  late bool _liked = widget.item.liked;
  late int _likes = widget.item.likes;
  late int _views = widget.item.views;
  late int _shares = widget.item.shares;
  late int _reposts = widget.item.reposts;
  late bool _userReposted = widget.item.userReposted;
  late bool _hasAccess = _resolvedAccess(widget.item);
  late bool _inlinePlaying = false;
  bool _previewComplete = false;
  bool _unlockingInline = false;
  bool _loggedFeedExposure = false;
  Timer? _previewFallbackTimer;
  Timer? _accessExpiryTimer;

  @override
  bool get wantKeepAlive => _inlinePlaying;

  @override
  void initState() {
    super.initState();
    _scheduleAccessExpiry();
  }

  @override
  void dispose() {
    _previewFallbackTimer?.cancel();
    _accessExpiryTimer?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant UploadFeedCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.id != widget.item.id || widget.item.hasAccess) {
      _hasAccess = _resolvedAccess(widget.item);
    }
    if (oldWidget.item.id != widget.item.id ||
        oldWidget.item.hasAccess != widget.item.hasAccess ||
        oldWidget.item.purchaseExpiresAt != widget.item.purchaseExpiresAt) {
      _scheduleAccessExpiry();
    }
    if (oldWidget.item.id != widget.item.id) {
      _loggedFeedExposure = false;
      _previewFallbackTimer?.cancel();
      _previewFallbackTimer = null;
      _inlinePlaying = false;
      _previewComplete = false;
      updateKeepAlive();
    }
    if (oldWidget.item.shares != widget.item.shares) {
      _shares = widget.item.shares;
    }
    if (oldWidget.item.views != widget.item.views) {
      _views = widget.item.views;
    }
    if (oldWidget.item.reposts != widget.item.reposts ||
        oldWidget.item.userReposted != widget.item.userReposted) {
      _reposts = widget.item.reposts;
      _userReposted = widget.item.userReposted;
    }
  }

  Future<void> _logView() async {
    final next = await Api.markUploadView(widget.item.id);
    if (!mounted || next == null) return;
    setState(() => _views = next);
  }

  bool _shouldLogFeedExposureView(UploadContent item) {
    final type = item.type.trim().toLowerCase();
    final isFlash = type == 'flash';
    final isPaidVault = type == 'vault' && item.coins > 0;
    return !isFlash && !isPaidVault;
  }

  void _logFeedExposureViewOnce() {
    if (_loggedFeedExposure) return;
    _loggedFeedExposure = true;
    _logView();
  }

  bool _resolvedAccess(UploadContent item) {
    final ownerId = item.ownerUserId.trim();
    return uploadContentAccessIsActive(
      hasAccess: item.hasAccess,
      isOwner: ownerId.isNotEmpty && Api.currentUserIds.contains(ownerId),
      purchaseExpiresAt: item.purchaseExpiresAt,
    );
  }

  void _scheduleAccessExpiry() {
    _accessExpiryTimer?.cancel();
    final item = widget.item;
    final ownerId = item.ownerUserId.trim();
    final isOwner = ownerId.isNotEmpty && Api.currentUserIds.contains(ownerId);
    if (isOwner || !item.hasAccess || item.purchaseExpiresAt.trim().isEmpty) {
      return;
    }
    final expiresAt = DateTime.tryParse(item.purchaseExpiresAt)?.toLocal();
    if (expiresAt == null) return;
    final remaining = expiresAt.difference(DateTime.now());
    if (remaining <= Duration.zero) {
      _hasAccess = false;
      return;
    }
    _accessExpiryTimer = Timer(remaining, () {
      if (!mounted) return;
      setState(() => _hasAccess = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final item = widget.item;
    final title = item.description.trim().isEmpty
        ? item.topic
        : item.description;
    final approved = item.status.trim().toLowerCase() == 'approved';
    final expiryUnit = item.approvalExpiryUnit.trim().toLowerCase().replaceAll(
      RegExp(r's$'),
      '',
    );
    final expiryLabel = item.approvalExpiryValue > 0 && expiryUnit.isNotEmpty
        ? '${item.approvalExpiryValue} $expiryUnit${item.approvalExpiryValue == 1 ? '' : 's'}'
        : '';
    final isBasicApprovalPlan =
        item.approvalPlanSlug.trim().toLowerCase() == 'basic';
    final showProfileExpiryNotice =
        widget.profilePresentation && approved && expiryLabel.isNotEmpty;
    final showBlur = uploadContentShouldBlur(item.contentAccessMode);
    final autoPreview =
        item.type.trim().toLowerCase() == 'flash' &&
        _UploadMediaFrame._isRawVideo(item) &&
        !showBlur &&
        item.thumbnail.trim().isEmpty;
    _syncPreviewFallback(autoPreview);
    final repostLine = item.repostedByName.isNotEmpty
        ? 'Reposted by ${item.repostedByName} - ${item.repostedAt.isEmpty ? item.time : Api.relativeTime(item.repostedAt)}'
        : item.time;
    final suggested = item.showSuggested
        ? 'Suggested · ${item.suggestedTopic.isEmpty ? item.topic : item.suggestedTopic}'
        : '';
    return VisibilityDetector(
      key: ValueKey('upload-view-${item.id}-${item.repostedAt}'),
      onVisibilityChanged: (info) {
        if (info.visibleFraction >= 0.35 && _shouldLogFeedExposureView(item)) {
          _logFeedExposureViewOnce();
        }
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
        child: Container(
          width: double.infinity,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: AppColors.bg2,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.borderWhite06),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 10, 10),
                child: Row(
                  children: [
                    _Avatar(
                      url: item.avatar,
                      name: item.fullName,
                      size: 38,
                      onTap: () => _openUserProfile(
                        context,
                        userId: item.ownerUserId,
                        username: item.username,
                        name: item.fullName,
                        avatar: item.avatar,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => _openUserProfile(
                                    context,
                                    userId: item.ownerUserId,
                                    username: item.username,
                                    name: item.fullName,
                                    avatar: item.avatar,
                                  ),
                                  child: Text(
                                    item.fullName.isEmpty
                                        ? item.username
                                        : item.fullName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 5),
                              UserVerifiedBadge(
                                userId: item.ownerUserId,
                                size: 11,
                              ),
                              const SizedBox(width: 5),
                              Flexible(
                                child: Text(
                                  item.repostedByName.isNotEmpty
                                      ? repostLine
                                      : item.time,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w500,
                                    color: item.repostedByName.isNotEmpty
                                        ? const Color(0xFF9DECFB)
                                        : AppColors.textGray500,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (suggested.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                const Icon(
                                  Ionicons.trending_up_outline,
                                  size: 9,
                                  color: Color(0xFFE9D64A),
                                ),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    suggested.toUpperCase(),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 8.5,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 1.0,
                                      color: Color(0xFFE9D64A),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    SubscribeButton(
                      userId: item.ownerUserId,
                      authorName: item.fullName.isEmpty
                          ? item.username
                          : item.fullName,
                      compact: true,
                    ),
                    const SizedBox(width: 8),
                    GestureDetector(
                      key: ValueKey('upload-content-menu-${item.id}'),
                      onTap: () => _openUploadMenu(context, item),
                      child: Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.06),
                          shape: BoxShape.circle,
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: const [
                            SizedBox(
                              width: 4,
                              height: 4,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: AppColors.textGray400,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                            SizedBox(height: 3),
                            SizedBox(
                              width: 4,
                              height: 4,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: AppColors.textGray400,
                                  shape: BoxShape.circle,
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
              Padding(
                padding: EdgeInsets.zero,
                child: _UploadMediaFrame(
                  item: item,
                  title: title,
                  hasAccess: _hasAccess,
                  showBlur: showBlur,
                  inlinePlaying: _inlinePlaying,
                  previewAutoPlay: autoPreview,
                  previewComplete: _previewComplete,
                  previewSeconds: Api.flashPreviewSeconds,
                  onPreviewComplete: () {
                    if (mounted && !_previewComplete) {
                      setState(() => _previewComplete = true);
                    }
                  },
                  watchLabel: autoPreview && _previewComplete
                      ? 'WATCH MORE'
                      : 'WATCH NOW',
                  unlocking: _unlockingInline,
                  liked: _liked,
                  likes: _likes,
                  views: _views,
                  onLike: _toggleLike,
                  onView: () {
                    _logView();
                    openInteractionsSheet(
                      context,
                      title: item.topic,
                      subtitle: item.type.toUpperCase(),
                      initialKind: 'views',
                      counts: {
                        'likes': _likes,
                        'comments': item.comments,
                        'views': _views,
                        'shares': _shares,
                      },
                      fetch: (kind) => Api.uploadInteractions(item.id, kind),
                      addComment: item.allowComments
                          ? (text, {parentId}) => Api.addUploadComment(
                              item.id,
                              text,
                              parentId: parentId,
                            )
                          : null,
                      reportComment: (id, reason) =>
                          Api.reportUploadComment(id, reason),
                      deleteComment: (id) => Api.deleteUploadComment(id),
                      likeComment: (id) => Api.likeUploadComment(id),
                      dislikeComment: (id) => Api.dislikeUploadComment(id),
                      onCommentsChanged: () => widget.onRefresh(silent: true),
                    );
                  },
                  onComment: () => openInteractionsSheet(
                    context,
                    title: item.topic,
                    subtitle: item.type.toUpperCase(),
                    initialKind: 'comments',
                    counts: {
                      'likes': _likes,
                      'comments': item.comments,
                      'views': _views,
                      'shares': _shares,
                    },
                    fetch: (kind) => Api.uploadInteractions(item.id, kind),
                    addComment: item.allowComments
                        ? (text, {parentId}) => Api.addUploadComment(
                            item.id,
                            text,
                            parentId: parentId,
                          )
                        : null,
                    reportComment: (id, reason) =>
                        Api.reportUploadComment(id, reason),
                    deleteComment: (id) => Api.deleteUploadComment(id),
                    likeComment: (id) => Api.likeUploadComment(id),
                    dislikeComment: (id) => Api.dislikeUploadComment(id),
                    onCommentsChanged: () => widget.onRefresh(silent: true),
                  ),
                  onShare: () async {
                    final next = await _openUploadShareSheet(context, item);
                    if (mounted && next != null) setState(() => _shares = next);
                  },
                  onRepost: () async {
                    await _handleRepost(item);
                  },
                  onWatch: _watchInline,
                  onSubscribe: item.subscriptionPackages.isEmpty
                      ? null
                      : _openSubscriptionPlans,
                ),
              ),
              if (!_inlinePlaying)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _UploadRailIcon(
                        icon: _liked ? Ionicons.heart : Ionicons.heart_outline,
                        label: '$_likes',
                        color: _liked ? AppColors.likeRed : Colors.white,
                        onTap: _toggleLike,
                      ),
                      _UploadRailIcon(
                        icon: Ionicons.repeat_outline,
                        label: '$_reposts',
                        color: _userReposted
                            ? AppColors.successGreen
                            : Colors.white,
                        onTap: () => _handleRepost(item),
                      ),
                      _UploadRailIcon(
                        icon: Ionicons.eye_outline,
                        label: '$_views',
                        onTap: () {
                          _logView();
                          openInteractionsSheet(
                            context,
                            title: item.topic,
                            subtitle: item.type.toUpperCase(),
                            initialKind: 'views',
                            counts: {
                              'likes': _likes,
                              'comments': item.comments,
                              'views': _views,
                              'shares': _shares,
                            },
                            fetch: (kind) =>
                                Api.uploadInteractions(item.id, kind),
                            addComment: item.allowComments
                                ? (text, {parentId}) => Api.addUploadComment(
                                    item.id,
                                    text,
                                    parentId: parentId,
                                  )
                                : null,
                            reportComment: (id, reason) =>
                                Api.reportUploadComment(id, reason),
                            deleteComment: (id) => Api.deleteUploadComment(id),
                            likeComment: (id) => Api.likeUploadComment(id),
                            dislikeComment: (id) =>
                                Api.dislikeUploadComment(id),
                            onCommentsChanged: () =>
                                widget.onRefresh(silent: true),
                          );
                        },
                      ),
                      _UploadRailIcon(
                        icon: Ionicons.chatbubble_outline,
                        label: '${item.comments}',
                        color: Colors.white,
                        onTap: () => openInteractionsSheet(
                          context,
                          title: item.topic,
                          subtitle: item.type.toUpperCase(),
                          initialKind: 'comments',
                          counts: {
                            'likes': _likes,
                            'comments': item.comments,
                            'views': _views,
                            'shares': _shares,
                          },
                          fetch: (kind) =>
                              Api.uploadInteractions(item.id, kind),
                          addComment: item.allowComments
                              ? (text, {parentId}) => Api.addUploadComment(
                                  item.id,
                                  text,
                                  parentId: parentId,
                                )
                              : null,
                          reportComment: (id, reason) =>
                              Api.reportUploadComment(id, reason),
                          deleteComment: (id) => Api.deleteUploadComment(id),
                          likeComment: (id) => Api.likeUploadComment(id),
                          dislikeComment: (id) => Api.dislikeUploadComment(id),
                          onCommentsChanged: () =>
                              widget.onRefresh(silent: true),
                        ),
                      ),
                      _UploadRailIcon(
                        icon: Ionicons.share_social_outline,
                        label: uploadShareCommissionLabel(item),
                        onTap: () async {
                          final next = await _openUploadShareSheet(
                            context,
                            item,
                          );
                          if (mounted && next != null) {
                            setState(() => _shares = next);
                          }
                        },
                      ),
                    ],
                  ),
                ),
              if (!approved)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: _UploadApprovalNotice(),
                ),
              if (showProfileExpiryNotice)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: _UploadExpiryNotice(
                    expiryLabel: expiryLabel,
                    isBasicPlan: isBasicApprovalPlan,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _syncPreviewFallback(bool autoPreview) {
    if (!autoPreview || _previewComplete) {
      _previewFallbackTimer?.cancel();
      _previewFallbackTimer = null;
      return;
    }
    if (_previewFallbackTimer != null) return;
    _previewFallbackTimer = Timer(
      Duration(milliseconds: (Api.flashPreviewSeconds * 1000) + 350),
      () {
        _previewFallbackTimer = null;
        if (mounted && !_previewComplete) {
          setState(() => _previewComplete = true);
        }
      },
    );
  }

  Future<void> _handleRepost(UploadContent item) async {
    final ownerId = item.ownerUserId.trim();
    final isOwn = ownerId.isNotEmpty && Api.currentUserIds.contains(ownerId);
    if (isOwn) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('You cannot repost your own content.'),
          behavior: SnackBarBehavior.floating,
          duration: Duration(milliseconds: 2200),
          backgroundColor: AppColors.bg2,
        ),
      );
      return;
    }

    final remove = _userReposted;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: AppColors.bg1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: Colors.white.withOpacity(0.10)),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 260),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  remove
                      ? 'You already reposted this content.'
                      : 'Repost this content?',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  remove
                      ? 'Remove it from your profile?'
                      : 'This will add it to your profile.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.textGray500,
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(dialogContext, false),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: remove
                              ? AppColors.likeRed
                              : Colors.white,
                          foregroundColor: remove ? Colors.white : Colors.black,
                        ),
                        onPressed: () => Navigator.pop(dialogContext, true),
                        child: Text(remove ? 'Remove' : 'Repost'),
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
    if (confirmed != true) return;

    final result = remove
        ? await Api.removeUploadRepost(item.id)
        : (await Api.repostUploadContent(item.id)).reposts;
    if (result == null || !mounted) return;
    setState(() {
      _reposts = result;
      _userReposted = !remove;
    });
    await widget.onRefresh(silent: true);
  }

  Future<void> _watchInline() async {
    if (_inlinePlaying || _unlockingInline) return;
    final item = widget.item;
    final approved = item.status.trim().toLowerCase() == 'approved';
    if (approved && !_hasAccess && item.coins > 0) {
      await Api.refreshProfile();
      if (!mounted) return;
      if (Api.balance + 0.0001 < item.coins) {
        await _showInsufficientBalance(item.coins);
        return;
      }
      final purchased = await _confirmUnlock(
        context,
        item,
        onInsufficientBalance: _showInsufficientBalance,
      );
      if (!mounted) return;
      if (purchased != true) return;
      unawaited(Api.refreshProfile());
    }
    unawaited(_logView());
    if (mounted) {
      setState(() {
        _unlockingInline = false;
        _hasAccess = true;
        _inlinePlaying = true;
      });
      updateKeepAlive();
    }
  }

  Future<void> _showInsufficientBalance(double requiredCoins) async {
    await _showUploadInsufficientBalanceDialog(context, requiredCoins);
  }

  Future<void> _toggleLike() async {
    final previousLiked = _liked;
    final previousLikes = _likes;
    setState(() {
      _liked = !_liked;
      _likes = math.max(0, _likes + (_liked ? 1 : -1));
    });
    final result = await Api.likeUploadContent(widget.item.id);
    if (!mounted) return;
    if (result == null) {
      setState(() {
        _liked = previousLiked;
        _likes = previousLikes;
      });
      AppNotifications.error('Unable to update like');
      return;
    }
    setState(() {
      _liked = result.liked;
      _likes = result.likes;
    });
  }

  Future<void> _openSubscriptionPlans() async {
    if (_isUploadOwnedByViewer(widget.item)) return;
    final purchased = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _UploadSubscriptionPurchaseSheet(
        item: widget.item,
        onInsufficientBalance: _showInsufficientBalance,
      ),
    );
    if (purchased != true || !mounted) return;
    setState(() {
      _hasAccess = true;
      _inlinePlaying = true;
    });
    updateKeepAlive();
    unawaited(_logView());
    await widget.onRefresh(silent: true);
  }

  void _openUploadMenu(BuildContext context, UploadContent item) {
    // Ownership by database id (web isUploadOwnedByViewer), with a username
    // fallback — this drives Insights/Pin/Delete visibility.
    final mine = _isUploadOwnedByViewer(item);
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (mine)
                _SheetAction('Insights', Ionicons.analytics_outline, () {
                  Navigator.pop(context);
                  showUploadInsights(context, item.id);
                }),
              // Web UploadContentFeedCard menu order:
              // Insights · Pin/Unpin · Edit · Delete · Share · Promote ·
              // Not Interested · Report. Existing content is updated by sending
              // its contentId through the same multipart create endpoint.
              if (mine)
                _SheetAction(
                  item.pinned ? 'Unpin' : 'Pin',
                  item.pinned
                      ? Ionicons.remove_circle_outline
                      : Ionicons.pin_outline,
                  () async {
                    Navigator.pop(context);
                    await Api.toggleUploadPin(item.id);
                    await widget.onRefresh(silent: true);
                  },
                ),
              if (mine)
                _SheetAction('Edit', Ionicons.create_outline, () async {
                  final navigator = Navigator.of(context);
                  final onEditStart = widget.onEditStart;
                  final onRefresh = widget.onRefresh;
                  navigator.pop();
                  onEditStart?.call();
                  try {
                    await navigator.push(
                      MaterialPageRoute(
                        builder: (_) => UploadContentStudio(
                          initialMode: item.type,
                          initialContent: item,
                        ),
                      ),
                    );
                  } finally {
                    await onRefresh(silent: true);
                  }
                }),
              if (mine)
                _SheetAction('Delete', Ionicons.trash_outline, () async {
                  Navigator.pop(context);
                  final ok = await _confirmDelete(context);
                  if (ok != true) return;
                  await Api.deleteUploadContent(item.id);
                  await widget.onRefresh();
                }, danger: true),
              _SheetAction('Share', Ionicons.share_social_outline, () async {
                Navigator.pop(context);
                _openUploadShareSheet(context, item);
              }),
              _SheetAction('Promote', Ionicons.megaphone_outline, () {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const PhotoVideoAdScreen()),
                );
              }),
              _SheetAction('Not Interested', Ionicons.eye_off_outline, () {
                Navigator.pop(context);
                // Used to only refresh, which put the upload straight back on
                // screen. Hide it instead, like the web does.
                widget.onHide();
              }),
              if (!mine)
                _SheetAction('Report', Ionicons.flag_outline, () {
                  Navigator.pop(context);
                  _openReportSheet(
                    context,
                    title: 'Report Content',
                    reasons: _uploadReportReasons,
                    submit: (reason, detail) =>
                        Api.reportUploadContent(item.id, reason, detail),
                  );
                }, danger: true),
            ],
          ),
        ),
      ),
    );
  }

  bool _isUploadOwnedByViewer(UploadContent item) {
    final viewerIds = <String>{
      '${Api.user?['id'] ?? ''}'.trim(),
      '${Api.user?['user_id'] ?? ''}'.trim(),
      '${Api.user?['userId'] ?? ''}'.trim(),
      '${Api.user?['owner_user_id'] ?? ''}'.trim(),
      Api.currentUserId.trim(),
    }..removeWhere((value) => value.isEmpty);
    if (viewerIds.isEmpty) return false;

    final contentIds = <String>{item.ownerUserId.trim(), item.contentId.trim()}
      ..removeWhere((value) => value.isEmpty);
    if (contentIds.any(viewerIds.contains)) return true;

    return Api.username.trim().isNotEmpty &&
        item.username.trim().toLowerCase() == Api.username.trim().toLowerCase();
  }
}

class _UploadSubscriptionPurchaseSheet extends StatefulWidget {
  final UploadContent item;
  final Future<void> Function(double requiredCoins) onInsufficientBalance;

  const _UploadSubscriptionPurchaseSheet({
    required this.item,
    required this.onInsufficientBalance,
  });

  @override
  State<_UploadSubscriptionPurchaseSheet> createState() =>
      _UploadSubscriptionPurchaseSheetState();
}

class _UploadSubscriptionPurchaseSheetState
    extends State<_UploadSubscriptionPurchaseSheet> {
  int _selectedIndex = 0;
  bool _busy = false;
  String _error = '';

  Future<void> _purchase() async {
    if (_busy || widget.item.subscriptionPackages.isEmpty) return;
    final package = widget.item.subscriptionPackages[_selectedIndex];
    setState(() {
      _busy = true;
      _error = '';
    });
    await Api.refreshProfile();
    if (!mounted) return;
    if (Api.balance + 0.0001 < package.price) {
      setState(() => _busy = false);
      Navigator.pop(context, false);
      unawaited(widget.onInsufficientBalance(package.price));
      return;
    }
    final result = await Api.purchaseUploadCreatorSubscription(
      widget.item.id,
      package.id,
      resellerRef: widget.item.resellerRef,
    );
    if (!mounted) return;
    if (result.error == null) {
      Navigator.pop(context, true);
      return;
    }
    if (_isInsufficientUploadPurchaseError(result.error)) {
      setState(() => _busy = false);
      Navigator.pop(context, false);
      unawaited(widget.onInsufficientBalance(package.price));
      return;
    }
    setState(() {
      _busy = false;
      _error = result.error!;
    });
  }

  @override
  Widget build(BuildContext context) {
    final packages = widget.item.subscriptionPackages;
    final selected = packages[_selectedIndex];
    return SafeArea(
      top: false,
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.78,
        ),
        decoration: const BoxDecoration(
          color: Color(0xFF0B0C0F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          border: Border(top: BorderSide(color: AppColors.borderWhite10)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 12, 13),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Subscribe for full access',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          "Watch all content from this creator",
                          style: TextStyle(
                            fontSize: 10,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    onPressed: _busy ? null : () => Navigator.pop(context),
                    icon: const Icon(Ionicons.close_outline, size: 20),
                    color: AppColors.textGray300,
                    visualDensity: VisualDensity.compact,
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: AppColors.borderWhite10),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.all(14),
                itemCount: packages.length,
                separatorBuilder: (_, __) => const SizedBox(height: 9),
                itemBuilder: (context, index) {
                  final package = packages[index];
                  final isSelected = index == _selectedIndex;
                  return InkWell(
                    onTap: _busy
                        ? null
                        : () => setState(() {
                            _selectedIndex = index;
                            _error = '';
                          }),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 13,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? const Color(0xFF12352E)
                            : const Color(0xFF121317),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isSelected
                              ? const Color(0xFF52D6B2)
                              : AppColors.borderWhite10,
                        ),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'PLAN ${index + 1}',
                                  style: const TextStyle(
                                    fontSize: 8,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 1,
                                    color: AppColors.textGray500,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Text(
                                  '${package.minutes} minute${package.minutes == 1 ? '' : 's'} full access',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              const Text(
                                'PRICE',
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textGray600,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${_money(package.price)} Coins',
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: Color(0xFF7DE7C8),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            Container(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 16),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.borderWhite10)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Balance: ${_money(Api.balance)} Coins  |  Cost: ${_money(selected.price)} Coins',
                    style: const TextStyle(
                      fontSize: 9.5,
                      color: AppColors.textGray500,
                    ),
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      _error,
                      style: const TextStyle(
                        fontSize: 10,
                        color: Color(0xFFFF7B86),
                      ),
                    ),
                  ],
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 42,
                    child: ElevatedButton.icon(
                      onPressed: _busy ? null : _purchase,
                      icon: _busy
                          ? const SizedBox(
                              width: 13,
                              height: 13,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.black,
                              ),
                            )
                          : const Icon(Ionicons.wallet_outline, size: 15),
                      label: Text(
                        _busy ? 'PROCESSING' : 'CONFIRM SUBSCRIBE',
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF7DE7C8),
                        foregroundColor: Colors.black,
                        disabledBackgroundColor: const Color(0xFF7DE7C8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
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
}

class _UploadMediaFrame extends StatelessWidget {
  final UploadContent item;
  final String title;
  final bool hasAccess;
  final bool showBlur;
  final bool inlinePlaying;
  final bool previewAutoPlay;
  final bool previewComplete;
  final int previewSeconds;
  final VoidCallback onPreviewComplete;
  final String watchLabel;
  final bool unlocking;
  final bool liked;
  final int likes;
  final int views;
  final VoidCallback onLike;
  final VoidCallback onView;
  final VoidCallback? onComment;
  final VoidCallback onShare;
  final VoidCallback onRepost;
  final VoidCallback onWatch;
  final VoidCallback? onSubscribe;
  const _UploadMediaFrame({
    required this.item,
    required this.title,
    required this.hasAccess,
    required this.showBlur,
    required this.inlinePlaying,
    required this.previewAutoPlay,
    required this.previewComplete,
    required this.previewSeconds,
    required this.onPreviewComplete,
    required this.watchLabel,
    required this.unlocking,
    required this.liked,
    required this.likes,
    required this.views,
    required this.onLike,
    required this.onView,
    required this.onComment,
    required this.onShare,
    required this.onRepost,
    required this.onWatch,
    this.onSubscribe,
  });

  @override
  Widget build(BuildContext context) {
    final media = _uploadMedia(item);
    final externalPreview = _externalPreviewImage(item.externalLink);
    final rawVideo = item.externalLink.trim().isEmpty
        ? media.firstWhere(_isVideoLike, orElse: () => '')
        : '';
    final localPreview = item.thumbnail.trim().isNotEmpty
        ? item.thumbnail.trim()
        : media.firstWhere((value) => !_isVideoLike(value), orElse: () => '');
    final image = localPreview.isNotEmpty
        ? localPreview
        : (item.externalLink.trim().isNotEmpty && externalPreview.isNotEmpty
              ? externalPreview
              : '');
    final hashtags = item.hashtags.trim();
    final approved = item.status.trim().toLowerCase() == 'approved';
    final showPurchase = approved && !hasAccess && item.coins > 0;
    final playerOwnsRail =
        inlinePlaying &&
        kIsWeb &&
        _InlineUploadPlayer.usesFeedControls(item, media);
    return AspectRatio(
      aspectRatio: inlinePlaying ? 0.86 : 1.04,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Container(
          color: AppColors.bg0,
          child: Stack(
            children: [
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                right: 0,
                child: inlinePlaying
                    ? _InlineUploadPlayer(
                        item: item,
                        media: media,
                        liked: liked,
                        likes: likes,
                        onLike: onLike,
                        onView: onView,
                        onComment: onComment,
                        onShare: onShare,
                        onRepost: onRepost,
                      )
                    : image.isNotEmpty
                    ? webImage(
                        Api.resolveMedia(image),
                        fit: BoxFit.cover,
                        blurSigma: showBlur ? 18 : 0,
                        errorFallback: _UploadPreviewFallback(
                          label: item.externalLink.trim().isNotEmpty
                              ? 'PREVIEW'
                              : 'CONTENT',
                        ),
                      )
                    : rawVideo.isNotEmpty
                    ? _MaybeBlurred(
                        blur: showBlur,
                        child: webVideo(
                          Api.resolveMedia(rawVideo),
                          poster: Api.resolveMedia(item.thumbnail),
                          interactive: false,
                          autoPlay: previewAutoPlay,
                          instanceKey: 'upload-preview-${item.id}',
                          trimStartSeconds: item.videoTrimStartSeconds,
                          previewDurationSeconds: previewAutoPlay
                              ? previewSeconds.toDouble()
                              : 0,
                          blurSigma: showBlur ? 18 : 0,
                          onPreviewComplete: onPreviewComplete,
                        ),
                      )
                    : const _UploadPreviewFallback(label: 'CONTENT'),
              ),
              if (showBlur && !inlinePlaying)
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withOpacity(0.12),
                          Colors.black.withOpacity(0.30),
                          Colors.black.withOpacity(0.60),
                        ],
                      ),
                    ),
                  ),
                ),
              Positioned(
                top: 12,
                left: 14,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.55),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: Text(
                    (item.topic.isEmpty ? 'Content' : item.topic).toUpperCase(),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.6,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              if (item.status.trim().isNotEmpty &&
                  item.status.trim().toLowerCase() != 'approved')
                Positioned(
                  top: 12,
                  right: 14,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.60),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: const Color(0xFFD9B524)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Ionicons.time_outline,
                          size: 12,
                          color: Color(0xFFFFE15A),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _statusLabel(item.status),
                          style: const TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.1,
                            color: Color(0xFFFFE15A),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              if (!inlinePlaying && (!previewAutoPlay || previewComplete))
                Positioned.fill(
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        GestureDetector(
                          onTap: onWatch,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 15,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.78),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: AppColors.borderWhite10,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text(
                                  '▶',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  watchLabel,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: 0.8,
                                    color: Colors.white,
                                  ),
                                ),
                                if (showPurchase) ...[
                                  Container(
                                    height: 16,
                                    margin: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                    ),
                                    width: 1,
                                    color: Colors.white.withOpacity(0.2),
                                  ),
                                  Text(
                                    '${_money(item.coins)} Coins',
                                    style: const TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w500,
                                      color: AppColors.textGray300,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                        if (!hasAccess && onSubscribe != null) ...[
                          const SizedBox(height: 12),
                          GestureDetector(
                            onTap: onSubscribe,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 15,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFF0E3F35),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: const Color(
                                    0xFF52D6B2,
                                  ).withOpacity(0.3),
                                ),
                              ),
                              child: const Text(
                                'WATCH ALL CONTENT',
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.8,
                                  color: Color(0xFFB7F7E3),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              if (inlinePlaying && !playerOwnsRail)
                Positioned(
                  right: 10,
                  bottom: 42,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _InlineRailIcon(
                        icon: Ionicons.share_social_outline,
                        label: uploadShareCommissionLabel(item),
                        onTap: onShare,
                      ),
                      const SizedBox(height: 7),
                      _InlineRailIcon(
                        icon: Ionicons.repeat_outline,
                        label: '${item.reposts}',
                        color: item.userReposted
                            ? AppColors.successGreen
                            : Colors.white,
                        onTap: onRepost,
                      ),
                      const SizedBox(height: 7),
                      _InlineRailIcon(
                        icon: Ionicons.eye_outline,
                        label: '$views',
                        filled: true,
                        onTap: onView,
                      ),
                      const SizedBox(height: 7),
                      _InlineRailIcon(
                        icon: Ionicons.chatbubble_outline,
                        label: '${item.comments}',
                        filled: true,
                        onTap: onComment,
                      ),
                      const SizedBox(height: 7),
                      _InlineRailIcon(
                        icon: liked ? Ionicons.heart : Ionicons.heart_outline,
                        label: '$likes',
                        color: liked ? AppColors.likeRed : Colors.white,
                        filled: true,
                        onTap: onLike,
                      ),
                    ],
                  ),
                ),
              if (title.isNotEmpty || hashtags.isNotEmpty)
                Positioned(
                  left: 18,
                  right: 18,
                  bottom: 18,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (title.isNotEmpty)
                        Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.35,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      if (hashtags.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          hashtags,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.likeRed,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  static List<String> _uploadMedia(UploadContent item) {
    final thumbnail = item.thumbnail.trim();
    final values = <String>[
      ...item.mediaGallery,
      item.mediaUrl,
      item.mediaPreviewSource,
      item.thumbnail,
    ];
    final out = <String>[];
    for (final value in values) {
      final trimmed = value.trim();
      if (trimmed.isEmpty || out.contains(trimmed)) {
        continue;
      }
      out.add(trimmed);
    }
    return out;
  }

  static String _statusLabel(String status) {
    final value = status.trim().toLowerCase();
    if (value.contains('pending') || value.contains('review')) {
      return 'REVIEWING';
    }
    return status.trim().toUpperCase();
  }

  static String _externalPreviewImage(String value) {
    final normalized = _normalizeUrl(value);
    if (normalized.isEmpty) return '';
    final youtubeId = _youTubeVideoId(normalized);
    if (youtubeId.isNotEmpty) {
      return 'https://img.youtube.com/vi/$youtubeId/hqdefault.jpg';
    }
    if (_isImageLikeUrl(normalized)) return normalized;
    return 'https://api.microlink.io?url=${Uri.encodeComponent(normalized)}&screenshot=true&meta=false&embed=screenshot.url';
  }

  static String _normalizeUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return '';
    return RegExp(r'^https?://', caseSensitive: false).hasMatch(trimmed)
        ? trimmed
        : 'https://$trimmed';
  }

  static Uri? _tryUri(String value) {
    try {
      return Uri.parse(_normalizeUrl(value));
    } catch (_) {
      return null;
    }
  }

  static String _youTubeVideoId(String value) {
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

  static bool _isImageLikeUrl(String value) {
    final normalized = _normalizeUrl(value);
    if (normalized.isEmpty) return false;
    return RegExp(
      r'\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$',
      caseSensitive: false,
    ).hasMatch(normalized);
  }

  static bool _isVideoLike(String value) => RegExp(
    r'\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$',
    caseSensitive: false,
  ).hasMatch(value.trim());

  static bool _isRawVideo(UploadContent item) {
    if (item.externalLink.trim().isNotEmpty) return false;
    if (item.mediaType.toLowerCase().contains('video')) return true;
    return <String>[item.mediaUrl, ...item.mediaGallery].any(_isVideoLike);
  }
}

class _UploadApprovalNotice extends StatelessWidget {
  const _UploadApprovalNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: const Text(
        'Waiting for admin approval. Other users cannot see it yet.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 11,
          height: 1.35,
          fontWeight: FontWeight.w600,
          color: AppColors.textGray400,
        ),
      ),
    );
  }
}

class _UploadExpiryNotice extends StatelessWidget {
  final String expiryLabel;
  final bool isBasicPlan;
  const _UploadExpiryNotice({
    required this.expiryLabel,
    required this.isBasicPlan,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Text(
        'This content will be deleted from your profile after $expiryLabel. '
        '${isBasicPlan ? 'Get a subscription package to keep it on your profile.' : 'This is based on your current subscription package.'}',
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 11,
          height: 1.35,
          fontWeight: FontWeight.w600,
          color: AppColors.textGray400,
        ),
      ),
    );
  }
}

class _MaybeBlurred extends StatelessWidget {
  final bool blur;
  final Widget child;
  const _MaybeBlurred({required this.blur, required this.child});

  @override
  Widget build(BuildContext context) {
    if (!blur) return child;
    return ImageFiltered(
      imageFilter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
      child: child,
    );
  }
}

class _UploadPreviewFallback extends StatelessWidget {
  final String label;
  const _UploadPreviewFallback({required this.label});

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.bg0,
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.72),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}

class _InlineUploadPlayer extends StatefulWidget {
  final UploadContent item;
  final List<String> media;
  final bool liked;
  final int likes;
  final VoidCallback onLike;
  final VoidCallback onView;
  final VoidCallback? onComment;
  final VoidCallback onShare;
  final VoidCallback onRepost;
  const _InlineUploadPlayer({
    required this.item,
    required this.media,
    required this.liked,
    required this.likes,
    required this.onLike,
    required this.onView,
    required this.onComment,
    required this.onShare,
    required this.onRepost,
  });

  static bool usesFeedControls(UploadContent item, List<String> media) {
    if (item.externalLink.isNotEmpty) {
      final normalized = _UploadMediaFrame._normalizeUrl(item.externalLink);
      return RegExp(
            r'\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$',
            caseSensitive: false,
          ).hasMatch(normalized) ||
          _googEmbedUrl(normalized) != null;
    }
    final values = media.isEmpty ? <String>[item.mediaUrl] : media;
    return values.any((value) {
      final lower = value.toLowerCase();
      return item.mediaType.toLowerCase().contains('video') ||
          lower.contains('.mp4') ||
          lower.contains('.mov') ||
          lower.contains('.webm');
    });
  }

  @override
  State<_InlineUploadPlayer> createState() => _InlineUploadPlayerState();
}

class _InlineUploadPlayerState extends State<_InlineUploadPlayer> {
  int _page = 0;

  UploadContent get item => widget.item;
  double get _playbackStartSeconds {
    final isFlash = item.type.trim().toLowerCase() == 'flash';
    if (!isFlash || item.thumbnail.trim().isNotEmpty) {
      return item.videoTrimStartSeconds;
    }
    return item.videoTrimStartSeconds + Api.flashPreviewSeconds;
  }

  Widget _feedVideo(String url) => webVideo(
    url,
    poster: item.thumbnail,
    feedControls: true,
    instanceKey: 'upload-${item.id}-${item.repostedAt}-${item.repostedByName}',
    trimStartSeconds: _playbackStartSeconds,
    trimEndSeconds: item.videoTrimEndSeconds,
    showSeekControls: false,
    onFeedShare: widget.onShare,
    onFeedRepost: widget.onRepost,
    onFeedView: widget.onView,
    onFeedComment: widget.onComment,
    onFeedLike: widget.onLike,
    feedReposts: '${item.reposts}',
    feedViews: '${item.views}',
    feedComments: '${item.comments}',
    feedLikes: '${widget.likes}',
    feedLiked: widget.liked,
  );

  Widget _feedEmbed(String url) => webEmbed(
    url,
    interactive: true,
    feedControls: true,
    instanceKey: 'upload-${item.id}-${item.repostedAt}-${item.repostedByName}',
    onFeedShare: widget.onShare,
    onFeedRepost: widget.onRepost,
    onFeedView: widget.onView,
    onFeedComment: widget.onComment,
    onFeedLike: widget.onLike,
    feedReposts: '${item.reposts}',
    feedViews: '${item.views}',
    feedComments: '${item.comments}',
    feedLikes: '${widget.likes}',
    feedLiked: widget.liked,
  );

  @override
  Widget build(BuildContext context) {
    if (item.externalLink.isNotEmpty) {
      final normalized = _UploadMediaFrame._normalizeUrl(item.externalLink);
      final embed = _googEmbedUrl(normalized);
      final isFile = RegExp(
        r'\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$',
        caseSensitive: false,
      ).hasMatch(normalized);
      if (isFile) {
        return _feedVideo(normalized);
      }
      if (embed != null) return _feedEmbed(embed);
      return const _UploadPreviewFallback(label: 'OPEN SOURCE');
    }
    final items = widget.media.isEmpty ? <String>[item.mediaUrl] : widget.media;
    final clean = items.where((e) => e.trim().isNotEmpty).toList();
    if (clean.isEmpty) return const ColoredBox(color: AppColors.bg0);
    return Stack(
      children: [
        PageView.builder(
          itemCount: clean.length,
          onPageChanged: (index) => setState(() => _page = index),
          itemBuilder: (_, index) {
            final url = Api.resolveMedia(clean[index]);
            final isVideo =
                item.mediaType.toLowerCase().contains('video') ||
                url.toLowerCase().contains('.mp4') ||
                url.toLowerCase().contains('.mov') ||
                url.toLowerCase().contains('.webm');
            return isVideo
                ? _feedVideo(url)
                : webImage(
                    url,
                    fit: BoxFit.contain,
                    errorFallback: const _ViewerFallback(),
                  );
          },
        ),
        if (clean.length > 1)
          Positioned(
            left: 0,
            right: 0,
            bottom: 18,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < clean.length; i++)
                  AnimatedContainer(
                    key: ValueKey('upload-inline-dot-$i'),
                    duration: const Duration(milliseconds: 160),
                    width: i == _page ? 18 : 7,
                    height: 7,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: i == _page
                          ? Colors.white
                          : Colors.white.withOpacity(0.45),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _InlineRailIcon extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final bool filled;
  final VoidCallback? onTap;
  const _InlineRailIcon({
    required this.icon,
    required this.label,
    this.color = Colors.white,
    this.filled = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: const Color(0x593F3F46),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withOpacity(0.25)),
            ),
            child: Center(child: Icon(icon, size: 17, color: color)),
          ),
          if (label.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _UploadRailIcon extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  const _UploadRailIcon({
    required this.icon,
    required this.label,
    this.color = Colors.white,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 22, color: color),
          if (label.isNotEmpty) ...[
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

bool canShowProductPromoteAction(HomeAd ad) => ad.linkedProductId > 0;

bool canShowPhotoVideoPromoteAgain({
  required HomeAd ad,
  required bool mine,
  required bool allowOnSurface,
  required bool saved,
}) {
  final status = ad.status.trim().toLowerCase();
  final active =
      status == 'active' || status == 'running' || status == 'approved';
  return mine && allowOnSurface && saved && !active;
}

class HomeAdFeedCard extends StatefulWidget {
  final HomeAd ad;
  final VoidCallback onHide;
  final Future<void> Function({bool silent}) onRefresh;
  final bool showSaveButton;
  final bool initialSaved;
  final bool savedStateKnown;
  final bool showExpiryWarning;
  final bool allowPhotoVideoPromoteAgain;
  final ValueChanged<bool>? onSaveChanged;
  final bool trackImpression;
  const HomeAdFeedCard({
    super.key,
    required this.ad,
    required this.onHide,
    required this.onRefresh,
    this.showSaveButton = false,
    this.initialSaved = false,
    this.savedStateKnown = false,
    this.showExpiryWarning = false,
    this.allowPhotoVideoPromoteAgain = false,
    this.onSaveChanged,
    this.trackImpression = true,
  });

  @override
  State<HomeAdFeedCard> createState() => HomeAdFeedCardState();
}

class HomeAdFeedCardState extends State<HomeAdFeedCard> {
  late bool _liked = widget.ad.liked;
  late int _likes = widget.ad.likes;
  late int _views = widget.ad.views;
  late int _shares = widget.ad.shares;
  bool _liveViewKnown = false;
  late bool _saved = widget.initialSaved;
  late bool _savedKnown = widget.savedStateKnown;
  bool _savingAd = false;
  bool _adVisible = false;
  int _lastImpressionAtMs = 0;

  Future<void> _logView(HomeAd ad) async {
    final next = await Api.markAdView(ad.interactionId);
    if (mounted && next != null) {
      _liveViewKnown = true;
      if (next != _views) {
        setState(() => _views = next);
      }
    }
  }

  @override
  void didUpdateWidget(covariant HomeAdFeedCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.ad.adId != widget.ad.adId) {
      _views = widget.ad.views;
      _shares = widget.ad.shares;
      _liveViewKnown = false;
      _adVisible = false;
      _lastImpressionAtMs = 0;
    } else if (!_liveViewKnown && oldWidget.ad.views != widget.ad.views) {
      _views = widget.ad.views;
    }
    if (oldWidget.ad.shares != widget.ad.shares) {
      _shares = widget.ad.shares;
    }
    if (widget.savedStateKnown &&
        (!oldWidget.savedStateKnown ||
            oldWidget.initialSaved != widget.initialSaved)) {
      _saved = widget.initialSaved;
      _savedKnown = true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    final card = ad.isProfilePromote
        ? _profilePromote(context, ad)
        : ad.isProductPromote
        ? _productPromote(context, ad)
        : _mediaAd(context, ad);
    if (!widget.trackImpression) return card;
    return VisibilityDetector(
      key: ValueKey('ad-impression-${ad.interactionId}'),
      onVisibilityChanged: (info) {
        final isVisible = info.visibleFraction >= 0.5;
        if (!isVisible) {
          _adVisible = false;
          return;
        }
        final now = DateTime.now().millisecondsSinceEpoch;
        if (!_adVisible && now - _lastImpressionAtMs >= 1500) {
          _adVisible = true;
          _lastImpressionAtMs = now;
          Api.markAdImpression(ad.interactionId);
          _logView(ad);
        }
      },
      child: card,
    );
  }

  Widget _mediaAd(BuildContext context, HomeAd ad) {
    return _AdFeedShell(
      ad: ad,
      onMore: () => _openAdMenu(context, ad),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _AdMediaFrame(
            image: ad.mediaPreview,
            gallery: ad.mediaGallery,
            onTap: () => _openAdViewer(context, ad),
            play: ad.mediaType.toLowerCase().contains('video'),
          ),
          // web SharedPhotoVideoAdCard: title (uppercase, 2 lines) sits in the
          // same row as the CTA button; the card shows no description.
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 4, 10, 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    (ad.title.isEmpty ? 'Sponsored' : ad.title).toUpperCase(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.2,
                      letterSpacing: -0.2,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
                _adCtaButton(context, ad),
              ],
            ),
          ),
          _adActions(ad),
        ],
      ),
    );
  }

  /// web SharedPhotoVideoAdCard CTA: "No Button" renders nothing, otherwise
  /// Call Now / Message / the secondary CTA label, inline beside the title.
  Widget _adCtaButton(BuildContext context, HomeAd ad) {
    final topic = ad.ctaTopic.trim();
    final lower = topic.toLowerCase();
    if (topic.isEmpty || lower == 'no button') return const SizedBox.shrink();

    VoidCallback? onTap;
    if (lower == 'call now') {
      final tel = ad.ctaValue.trim();
      if (tel.isNotEmpty) {
        onTap = () {
          Api.markAdClick(ad.interactionId, 'call');
          openExternalLink('tel:$tel');
        };
      }
    } else if (lower == 'message') {
      onTap = () {
        Api.markAdClick(ad.interactionId, 'message');
        _openUserProfile(
          context,
          userId: ad.ownerUserId,
          username: ad.username,
          name: ad.fullName.isEmpty ? ad.username : ad.fullName,
          avatar: ad.avatar,
        );
      };
    } else {
      final href = ad.activeLink.trim().isNotEmpty
          ? ad.activeLink.trim()
          : ad.ctaValue.trim();
      if (href.isNotEmpty) {
        onTap = () {
          Api.markAdClick(ad.interactionId, 'visit');
          openExternalLink(href);
        };
      }
    }

    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: onTap == null ? Colors.white24 : Colors.white,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            topic.toUpperCase(),
            style: const TextStyle(
              fontSize: 8,
              letterSpacing: 0.8,
              fontWeight: FontWeight.w600,
              color: Colors.black,
            ),
          ),
        ),
      ),
    );
  }

  Widget _profilePromote(BuildContext context, HomeAd ad) {
    final items = ad.featuredItems.take(3).toList();
    return _AdFeedShell(
      ad: ad,
      // No onMore: web Profile Promote cards expose no two-dot menu.
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (ad.description.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Text(
                ad.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12.5,
                  height: 18 / 12.5,
                  color: AppColors.textGray200,
                ),
              ),
            ),
          ],
          if (items.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: items.map((m) {
                  final image = Api.resolveMedia(
                    '${m["image_url"] ?? m["image"] ?? m["media_preview"] ?? ""}',
                  );
                  final name = '${m["title"] ?? m["name"] ?? ""}';
                  final price = '${m["price"] ?? ""}';
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _MiniProduct(
                        image: image,
                        name: name,
                        price: price,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Center(
            child: _SmallButton(
              label: 'View profile',
              // Was only flashing the username — now actually opens the profile.
              onTap: () => _openUserProfile(
                context,
                userId: ad.ownerUserId,
                username: ad.username,
                name: ad.fullName.isEmpty ? ad.username : ad.fullName,
                avatar: ad.avatar,
              ),
            ),
          ),
          const SizedBox(height: 11),
          _adActions(ad),
        ],
      ),
    );
  }

  Widget _productPromote(BuildContext context, HomeAd ad) {
    return _AdFeedShell(
      ad: ad,
      onMore: () => _openAdMenu(context, ad),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            children: [
              _AdMediaFrame(
                image: ad.mediaPreview,
                gallery: ad.mediaGallery,
                onTap: () => _openProductPromoteSecondView(context, ad),
              ),
              if (ad.discount.isNotEmpty)
                Positioned(
                  right: 12,
                  bottom: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 9,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF062F19),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF0B7A3B)),
                    ),
                    child: Text(
                      '+${ad.discount}%',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF22F06A),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(
              // web SharedProductCard title: uppercase, font-black, tight
              ad.title.toUpperCase(),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                height: 1.2,
                letterSpacing: -0.2,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                const Text(
                  'R ',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray500,
                  ),
                ),
                Text(
                  _money(ad.displayPrice),
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                if (ad.oldPrice != null) ...[
                  const SizedBox(width: 8),
                  Text(
                    'R ${_money(ad.oldPrice!)}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.likeRed,
                      decoration: TextDecoration.lineThrough,
                    ),
                  ),
                ],
                const Spacer(),
                GestureDetector(
                  // Opens the second view so size/colour/qty can be chosen,
                  // matching the shop card's cart icon.
                  onTap: () => _openProductPromoteSecondView(context, ad),
                  child: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.08),
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: const Icon(
                      Ionicons.cart_outline,
                      size: 21,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          _adActions(ad),
        ],
      ),
    );
  }

  Widget _adActions(HomeAd ad) {
    // web: interaction row sits under a `border-t border-white/5` divider
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 10),
      padding: const EdgeInsets.fromLTRB(2, 6, 2, 9),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.borderWhite06)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _UploadRailIcon(
            icon: _liked ? Ionicons.heart : Ionicons.heart_outline,
            label: '$_likes',
            color: _liked ? AppColors.likeRed : Colors.white,
            onTap: () async {
              setState(() {
                _liked = !_liked;
                _likes += _liked ? 1 : -1;
              });
              await Api.toggleAdLike(ad.interactionId);
            },
          ),
          _UploadRailIcon(
            icon: Ionicons.eye_outline,
            label: '$_views',
            onTap: () {
              _logView(ad);
              _openAdInteractions(context, ad, 'views');
            },
          ),
          _UploadRailIcon(
            icon: Ionicons.chatbubble_outline,
            label: ad.comments == 0 ? '' : '${ad.comments}',
            onTap: () => _openAdInteractions(context, ad, 'comments'),
          ),
          _UploadRailIcon(
            icon: Ionicons.share_social_outline,
            label: '$_shares',
            onTap: () async {
              final next = await _openAdShareSheet(
                context,
                ad,
                currentCount: _shares,
              );
              if (mounted && next != null) setState(() => _shares = next);
            },
          ),
          if (_canSaveAd(ad))
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                GestureDetector(
                  onTap: _savingAd ? null : () => _toggleAdSave(ad),
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _saved
                          ? const Color(0xFF4A171A)
                          : Colors.white.withValues(alpha: 0.04),
                      border: Border.all(
                        color: _saved
                            ? const Color(0xFF9E343A)
                            : AppColors.borderWhite10,
                      ),
                    ),
                    child: _savingAd
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 1.5,
                              color: Colors.white70,
                            ),
                          )
                        : Icon(
                            _saved
                                ? Ionicons.bookmark
                                : Ionicons.bookmark_outline,
                            size: 20,
                            color: _saved ? AppColors.likeRed : Colors.white,
                          ),
                  ),
                ),
                if (widget.showExpiryWarning)
                  SizedBox(
                    width: 64,
                    child: Text(
                      _isVideoSave(ad)
                          ? 'Your video will be removed soon'
                          : 'Your photos will expire soon and will be deleted',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xFFD6B400),
                        fontSize: 8,
                        height: 1.18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  bool _canSaveAd(HomeAd ad) {
    if (!widget.showSaveButton) return false;
    if (ad.isProfilePromote || ad.isProductPromote) return false;
    final campaign = ad.campaignType.trim().toLowerCase();
    return campaign == 'photo and video' || campaign == 'photo & video';
  }

  bool _isVideoSave(HomeAd ad) {
    final type = ad.mediaType.trim().toLowerCase();
    if (type.contains('video')) return true;
    return RegExp(
      r'\.(mp4|mov|webm|m4v|ogg)(\?.*)?$',
      caseSensitive: false,
    ).hasMatch(ad.mediaPreview);
  }

  int? _usageInt(Map<String, dynamic>? usage, String key) {
    if (usage == null || !usage.containsKey(key)) return null;
    final raw = usage[key];
    return raw is num ? raw.toInt() : int.tryParse('$raw');
  }

  String _savedAdId(Map<String, dynamic> row) {
    return '${row['adId'] ?? row['ad_id'] ?? row['id'] ?? ''}'
        .replaceFirst(RegExp(r'^ad-'), '')
        .trim();
  }

  Future<void> _ensureSavedState(HomeAd ad) async {
    if (_savedKnown || !Api.loggedIn) return;
    final rows = await Api.savedAds();
    if (!mounted) return;
    final ids = rows.map(_savedAdId).where((id) => id.isNotEmpty).toSet();
    setState(() {
      _saved = ids.contains(ad.adId);
      _savedKnown = true;
    });
  }

  Future<void> _toggleAdSave(HomeAd ad) async {
    if (!Api.loggedIn) {
      _showAdSaveSnack('Please log in to save ads.');
      return;
    }
    setState(() => _savingAd = true);
    await _ensureSavedState(ad);
    if (!mounted) return;

    if (!_saved) {
      final saveUsage = await Api.savedAdCounts();
      if (!mounted) return;
      final video = _isVideoSave(ad);
      final counts = saveUsage?['counts'] is Map
          ? Map<String, dynamic>.from(saveUsage!['counts'] as Map)
          : null;
      final limits = saveUsage?['limits'] is Map
          ? Map<String, dynamic>.from(saveUsage!['limits'] as Map)
          : null;
      final count = _usageInt(counts, video ? 'video' : 'photo');
      final limit = _usageInt(limits, video ? 'video' : 'photo');
      if (count != null && limit != null && limit >= 0 && count >= limit) {
        setState(() => _savingAd = false);
        _showAdSaveUpgradePrompt();
        return;
      }
    }

    final result = await Api.toggleAdSaveDetailed(ad.adId);
    if (!mounted) return;
    setState(() => _savingAd = false);
    if (!result.success) {
      final message =
          result.error ??
          'You have reached your ad save limit. Please upgrade to a higher plan.';
      if (_isAdSaveLimitError(message)) {
        _showAdSaveUpgradePrompt();
      } else {
        _showAdSaveSnack(message);
      }
      return;
    }
    setState(() {
      _saved = result.saved ?? !_saved;
      _savedKnown = true;
    });
    widget.onSaveChanged?.call(_saved);
  }

  bool _isAdSaveLimitError(String message) {
    final text = message.toLowerCase();
    return text.contains('ad save limit') ||
        text.contains('save limit') ||
        text.contains('higher plan') ||
        text.contains('upgrade');
  }

  void _showAdSaveUpgradePrompt() {
    UpgradePlanSheet.show(
      context,
      subtitle: 'Subscribe to save more ads',
      limitMessage:
          'If you have reached your ad save limit, please subscribe to a higher plan below.',
    );
  }

  void _showAdSaveSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.bg2,
      ),
    );
  }

  void _openAdMenu(BuildContext context, HomeAd ad) {
    final mine =
        Api.currentUserIds.contains(ad.ownerUserId.trim()) ||
        ad.username.trim().toLowerCase() == Api.username.trim().toLowerCase();
    final canPromotePhotoVideoAgain = canShowPhotoVideoPromoteAgain(
      ad: ad,
      mine: mine,
      allowOnSurface: widget.allowPhotoVideoPromoteAgain,
      saved: _saved,
    );
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            // Each ad type has its own menu on the web — Product Promote uses
            // SharedProductCard's menu, Photo & Video uses
            // SharedPhotoVideoAdCard's.
            children: ad.isProductPromote
                ? [
                    // web SharedProductCard (isAd) menu
                    _SheetAction(
                      'Share Link',
                      Ionicons.share_social_outline,
                      () {
                        Navigator.pop(context);
                        _openAdShareSheet(context, ad);
                      },
                    ),
                    if (canShowProductPromoteAction(ad))
                      _SheetAction(
                        mine ? 'Promote Again' : 'Promote',
                        Ionicons.megaphone_outline,
                        () {
                          Navigator.pop(context);
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const ProductPromoteScreen(),
                            ),
                          );
                        },
                      ),
                    if (mine)
                      _SheetAction('Delete Ad', Ionicons.trash_outline, () {
                        Navigator.pop(context);
                        _deleteAd(ad);
                      }, danger: true),
                    if (!mine)
                      _SheetAction('Report', Ionicons.alert_circle_outline, () {
                        Navigator.pop(context);
                        _openReportSheet(
                          context,
                          title: 'Report Ad',
                          reasons: _googReportReasons,
                          submit: (reason, detail) =>
                              Api.reportAd(ad.adId, reason, detail),
                        );
                      }, danger: true),
                    if (!mine)
                      _SheetAction(
                        'Not Interested',
                        Ionicons.eye_off_outline,
                        () {
                          Navigator.pop(context);
                          widget.onHide();
                        },
                      ),
                  ]
                : [
                    // web SharedPhotoVideoAdCard menu
                    _SheetAction(
                      'Not Interested',
                      Ionicons.eye_off_outline,
                      () {
                        Navigator.pop(context);
                        widget.onHide();
                      },
                    ),
                    _SheetAction(
                      'Share Link',
                      Ionicons.share_social_outline,
                      () {
                        Navigator.pop(context);
                        _openAdShareSheet(context, ad);
                      },
                    ),
                    if (canPromotePhotoVideoAgain)
                      _SheetAction(
                        'Promote Again',
                        Ionicons.megaphone_outline,
                        () {
                          Navigator.pop(context);
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const PhotoVideoAdScreen(),
                            ),
                          );
                        },
                      ),
                    if (mine)
                      _SheetAction('Delete Ad', Ionicons.trash_outline, () {
                        Navigator.pop(context);
                        _deleteAd(ad);
                      }, danger: true),
                    _SheetAction('Report', Ionicons.alert_circle_outline, () {
                      Navigator.pop(context);
                      _openReportSheet(
                        context,
                        title: 'Report Ad',
                        reasons: _googReportReasons,
                        submit: (reason, detail) =>
                            Api.reportAd(ad.adId, reason, detail),
                      );
                    }, danger: true),
                  ],
          ),
        ),
      ),
    );
  }

  Future<void> _deleteAd(HomeAd ad) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.bg1,
        title: const Text(
          'Delete Ad?',
          style: TextStyle(fontSize: 14, color: Colors.white),
        ),
        content: const Text(
          'This ad will be removed from active feeds.',
          style: TextStyle(fontSize: 11, color: AppColors.textGray400),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
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
    if (confirmed != true) return;
    final error = await Api.setAdStatus(ad.adId, 'Cancelled');
    if (!mounted) return;
    if (error != null) {
      _showAdSaveSnack(error);
      return;
    }
    widget.onHide();
    widget.onRefresh?.call(silent: true);
  }

  void _openAdInteractions(BuildContext context, HomeAd ad, String kind) {
    openInteractionsSheet(
      context,
      title: ad.title.isEmpty ? ad.username : ad.title,
      subtitle: ad.campaignType,
      initialKind: kind,
      counts: {
        'likes': _likes,
        'comments': ad.comments,
        'views': ad.views,
        'shares': _shares,
      },
      fetch: (value) => Api.adInteractions(ad.interactionId, value),
      addComment: (text, {parentId}) =>
          Api.addAdComment(ad.interactionId, text, parentId: parentId),
      reportComment: (id, reason) => Api.reportProductComment(id, reason),
      deleteComment: (id) => Api.deleteProductComment(id),
      likeComment: (id) => Api.likeProductComment(id),
      dislikeComment: (id) => Api.dislikeProductComment(id),
      onCommentsChanged: () => widget.onRefresh(silent: true),
    );
  }
}

/// Opens the same ad presentation used by the Flutter home/profile feeds.
/// Chat calls this instead of maintaining a second, incomplete ad workflow.
void openSponsoredAdDetail(BuildContext context, HomeAd ad) {
  if (ad.isProductPromote) {
    _openProductPromoteSecondView(context, ad);
    return;
  }

  Api.markAdView(ad.interactionId);
  showDialog<void>(
    context: context,
    barrierColor: Colors.black.withOpacity(0.88),
    builder: (dialogContext) => Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 20),
      backgroundColor: Colors.transparent,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: Stack(
          children: [
            SingleChildScrollView(
              child: HomeAdFeedCard(
                ad: ad,
                trackImpression: false,
                onHide: () => Navigator.maybePop(dialogContext),
                onRefresh: ({bool silent = false}) async {},
              ),
            ),
            Positioned(
              right: 8,
              top: 8,
              child: IconButton(
                tooltip: 'Close',
                onPressed: () => Navigator.maybePop(dialogContext),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.black.withOpacity(0.7),
                ),
                icon: const Icon(
                  Ionicons.close_outline,
                  size: 21,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _AdFeedShell extends StatelessWidget {
  final HomeAd ad;
  final Widget child;

  /// Null hides the two-dot button entirely — Profile Promote cards have no
  /// options menu on the web (SharedProfilePromoteAdCard renders no dots).
  final VoidCallback? onMore;
  const _AdFeedShell({required this.ad, required this.child, this.onMore});

  @override
  Widget build(BuildContext context) {
    final name = ad.fullName.isEmpty ? ad.username : ad.fullName;
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 10, 0, 10),
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: AppColors.bg2,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.borderWhite06),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 7),
              child: Row(
                children: [
                  _Avatar(
                    url: ad.avatar,
                    name: name,
                    size: 24,
                    onTap: () => _openUserProfile(
                      context,
                      username: ad.username,
                      userId: ad.ownerUserId,
                      name: name,
                      avatar: ad.avatar,
                    ),
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () => _openUserProfile(
                                  context,
                                  username: ad.username,
                                  userId: ad.ownerUserId,
                                  name: name,
                                  avatar: ad.avatar,
                                ),
                                child: Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            UserVerifiedBadge(userId: ad.ownerUserId, size: 11),
                          ],
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Ad',
                          style: TextStyle(
                            fontSize: 8.5,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 0.8,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  SubscribeButton(
                    userId: ad.ownerUserId,
                    authorName: ad.fullName.isEmpty ? ad.username : ad.fullName,
                    compact: true,
                  ),
                  if (onMore != null) ...[
                    const SizedBox(width: 7),
                    GestureDetector(
                      key: ValueKey('ad-menu-${ad.adId}'),
                      onTap: onMore,
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.06),
                          shape: BoxShape.circle,
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: const [
                            SizedBox(
                              width: 4,
                              height: 4,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: AppColors.textGray400,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                            SizedBox(height: 3),
                            SizedBox(
                              width: 4,
                              height: 4,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: AppColors.textGray400,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            child,
          ],
        ),
      ),
    );
  }
}

class _AdMediaFrame extends StatelessWidget {
  final String image;
  final List<String> gallery;
  final VoidCallback onTap;
  final bool play;
  const _AdMediaFrame({
    required this.image,
    this.gallery = const [],
    required this.onTap,
    this.play = false,
  });

  @override
  Widget build(BuildContext context) {
    final media = <String>[image, ...gallery]
        .where((value) => value.trim().isNotEmpty)
        .fold<List<String>>(
          <String>[],
          (out, value) => out.contains(value) ? out : (out..add(value)),
        );
    // web: `mx-2 mb-1.5 rounded-[1.2rem] border border-white/5 bg-black aspect-square`
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 6),
      child: AspectRatio(
        aspectRatio: 1,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(19),
              border: Border.all(color: AppColors.borderWhite06),
            ),
            child: Stack(
              children: [
                Positioned.fill(
                  child: media.isEmpty
                      ? const ColoredBox(color: AppColors.bg0)
                      : PageView.builder(
                          itemCount: media.length,
                          itemBuilder: (_, index) {
                            final url = Api.resolveMedia(media[index]);
                            final isVideo =
                                url.toLowerCase().contains('.mp4') ||
                                url.toLowerCase().contains('.mov') ||
                                url.toLowerCase().contains('.webm');
                            return isVideo
                                ? webVideo(url, poster: image)
                                : Image.network(
                                    url,
                                    fit: BoxFit.cover,
                                    webHtmlElementStrategy:
                                        WebHtmlElementStrategy.prefer,
                                    errorBuilder: (_, __, ___) =>
                                        const ColoredBox(color: AppColors.bg0),
                                  );
                          },
                        ),
                ),
                if (media.length > 1)
                  Positioned(
                    right: 12,
                    top: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.62),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '1/${media.length}',
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                if (play)
                  const Positioned.fill(
                    child: Center(
                      child: CircleAvatar(
                        radius: 28,
                        backgroundColor: Colors.white,
                        child: Icon(
                          Ionicons.play,
                          size: 28,
                          color: Colors.black,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Profile Promote row — web mobile shows a snap-scrolling strip of compact
/// cards at two-per-view (`min-w-[calc((100%-0.5rem)/2)] snap-start gap-2`).
class _ProfilePromoteCarousel extends StatelessWidget {
  final List<HomeAd> ads;
  final int rotation;
  const _ProfilePromoteCarousel({
    super.key,
    required this.ads,
    required this.rotation,
  });

  @override
  Widget build(BuildContext context) {
    if (ads.isEmpty) return const SizedBox.shrink();
    final offset = rotation % ads.length;
    final rotated = <HomeAd>[...ads.skip(offset), ...ads.take(offset)];
    final screen = MediaQuery.of(context).size.width;
    const pagePad = 12.0;
    const gap = 8.0;
    final cardWidth = (screen - (pagePad * 2) - gap) / 2;
    // header + 3-up square grid + View Profile button, with slack.
    final height = 120 + ((cardWidth - 20) / 3);

    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
      child: SizedBox(
        height: height,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: pagePad),
          physics: const PageScrollPhysics(),
          itemCount: rotated.length,
          separatorBuilder: (_, __) => const SizedBox(width: gap),
          itemBuilder: (_, i) => SizedBox(
            width: cardWidth,
            child: _ProfileCompactCard(ad: rotated[i]),
          ),
        ),
      ),
    );
  }
}

/// web SharedProfilePromoteAdCard — header, 3-item square grid, View Profile.
/// Deliberately has no interaction row and no two-dot menu.
class _ProfileCompactCard extends StatelessWidget {
  final HomeAd ad;
  const _ProfileCompactCard({required this.ad});

  @override
  Widget build(BuildContext context) {
    final name = ad.username.isEmpty ? ad.fullName : ad.username;
    final items = ad.featuredItems.take(3).toList();
    void openProfile() => _openUserProfile(
      context,
      userId: ad.ownerUserId,
      username: ad.username,
      name: ad.fullName.isEmpty ? ad.username : ad.fullName,
      avatar: ad.avatar,
    );

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(8, 7, 8, 7),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: AppColors.borderWhite10),
              ),
            ),
            child: Row(
              children: [
                _Avatar(
                  url: ad.avatar,
                  name: name,
                  size: 26,
                  onTap: openProfile,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: GestureDetector(
                              onTap: openProfile,
                              child: Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 3),
                          UserVerifiedBadge(userId: ad.ownerUserId, size: 10),
                        ],
                      ),
                      const Text(
                        'Ad',
                        style: TextStyle(
                          fontSize: 8,
                          letterSpacing: 1.1,
                          fontWeight: FontWeight.w500,
                          color: AppColors.textGray500,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                SubscribeButton(
                  userId: ad.ownerUserId,
                  authorName: ad.fullName.isEmpty ? ad.username : ad.fullName,
                  compact: true,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < 3; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(
                    child: _ProfileGridCell(
                      item: i < items.length ? items[i] : null,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
            child: GestureDetector(
              onTap: openProfile,
              behavior: HitTestBehavior.opaque,
              child: Container(
                width: double.infinity,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  'VIEW PROFILE',
                  style: TextStyle(
                    fontSize: 8,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray400,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProfileGridCell extends StatelessWidget {
  final Map<String, dynamic>? item;
  const _ProfileGridCell({required this.item});

  @override
  Widget build(BuildContext context) {
    final m = item;
    final rawImage = m == null
        ? ''
        : '${m["image_url"] ?? m["image"] ?? m["media_preview"] ?? m["thumbnail_url"] ?? ""}';
    final image = rawImage.trim().isEmpty ? '' : Api.resolveMedia(rawImage);
    final title = m == null ? '-' : '${m["title"] ?? m["name"] ?? ""}';
    final price = m == null ? '' : '${m["promo_price"] ?? m["price"] ?? ""}';

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFF0E1014),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.borderWhite06),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: image.isEmpty
                ? ColoredBox(
                    color: Colors.white.withOpacity(0.04),
                    child: const Icon(
                      Ionicons.image_outline,
                      size: 11,
                      color: AppColors.textGray700,
                    ),
                  )
                : Image.network(
                    image,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        ColoredBox(color: Colors.white.withOpacity(0.04)),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(3, 3, 3, 4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 7,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                if (price.trim().isNotEmpty)
                  Text(
                    _money(double.tryParse(price) ?? 0),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 7,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textGray500,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FeedShell extends StatelessWidget {
  final Widget child;
  const _FeedShell({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppColors.borderWhite06, width: 1),
        ),
      ),
      child: child,
    );
  }
}

class _FeedHeader extends StatelessWidget {
  final String name;
  final String time;
  final Widget? badge;
  final String? label;
  final VoidCallback onMore;

  /// Author of the post — drives the (shared) Subscribe button when no [label].
  final String subscribeUserId;
  final String subscribeName;

  /// Tapping the author name opens their profile.
  final VoidCallback? onNameTap;
  const _FeedHeader({
    required this.name,
    required this.time,
    required this.onMore,
    this.badge,
    this.label,
    this.subscribeUserId = '',
    this.subscribeName = '',
    this.onNameTap,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              Flexible(
                child: GestureDetector(
                  onTap: onNameTap,
                  behavior: HitTestBehavior.opaque,
                  child: Text(
                    name,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              if (badge != null) ...[badge!, const SizedBox(width: 6)],
              if (time.isNotEmpty)
                Text(
                  time,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.white.withOpacity(0.4),
                  ),
                ),
            ],
          ),
        ),
        if (label != null && label!.isNotEmpty) ...[
          Text(
            label!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 8.5,
              fontWeight: FontWeight.w500,
              letterSpacing: 0.5,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(width: 8),
        ] else if (subscribeUserId.isNotEmpty) ...[
          SubscribeButton(
            userId: subscribeUserId,
            authorName: subscribeName,
            compact: true,
          ),
          const SizedBox(width: 6),
        ],
        GestureDetector(
          onTap: onMore,
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
            child: Text(
              '••',
              style: TextStyle(
                fontSize: 16,
                color: Colors.white.withOpacity(0.45),
                letterSpacing: 1,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Avatar extends StatelessWidget {
  final String url;
  final String name;
  final double size;
  final VoidCallback? onTap;
  const _Avatar({
    required this.url,
    required this.name,
    this.size = 30,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final resolved = Api.resolveAvatar(url);
    final bytes = Api.decodeDataUri(resolved);
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: size,
        height: size,
        margin: const EdgeInsets.only(top: 1),
        clipBehavior: Clip.antiAlias,
        decoration: const BoxDecoration(
          color: AppColors.avatarSlate,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: resolved.isEmpty
            ? _Initial(name: name)
            : bytes != null
            ? Image.memory(
                bytes,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _Initial(name: name),
              )
            : Image.network(
                resolved,
                width: size,
                height: size,
                fit: BoxFit.cover,
                webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                errorBuilder: (_, __, ___) => _Initial(name: name),
              ),
      ),
    );
  }
}

class _Initial extends StatelessWidget {
  final String name;
  const _Initial({required this.name});

  @override
  Widget build(BuildContext context) {
    return Text(
      name.isNotEmpty ? name[0].toUpperCase() : '?',
      style: const TextStyle(
        fontWeight: FontWeight.w600,
        color: Colors.white,
        fontSize: 10.5,
      ),
    );
  }
}

class _ShareEarnSheet extends StatefulWidget {
  final String title;
  final String subtitle;
  final String url;
  final String linkLabel;
  final bool canEarn;
  final String earnTitle;
  final String earnSubtitle;
  final String commission;
  final String Function(String id) earnUrlBuilder;
  final String earnKind;

  const _ShareEarnSheet({
    required this.title,
    required this.subtitle,
    required this.url,
    required this.linkLabel,
    required this.canEarn,
    required this.earnTitle,
    required this.earnSubtitle,
    required this.commission,
    required this.earnUrlBuilder,
    required this.earnKind,
  });

  @override
  State<_ShareEarnSheet> createState() => _ShareEarnSheetState();
}

class _ShareEarnSheetState extends State<_ShareEarnSheet> {
  bool _earnView = false;
  String _generated = "";
  String _error = "";

  // Confirmation is rendered inside the sheet rather than as a SnackBar: a
  // snack shown while a modal bottom sheet is open sits behind it, so the
  // "Copied" message was effectively invisible.
  bool _copied = false;
  Timer? _copiedTimer;

  @override
  void initState() {
    super.initState();
    final ownIdentifier = Api.googerId.isNotEmpty
        ? Api.googerId
        : (Api.username.isNotEmpty ? Api.username : Api.currentUserId);
    _id.text = ownIdentifier;
  }

  void _copyLink(String value) {
    Clipboard.setData(ClipboardData(text: value));
    _copiedTimer?.cancel();
    setState(() => _copied = true);
    _copiedTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  Widget _copiedPill() => AnimatedOpacity(
    opacity: _copied ? 1 : 0,
    duration: const Duration(milliseconds: 180),
    child: Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.successGreen.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.successGreen.withOpacity(0.35)),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Ionicons.checkmark_circle,
            size: 13,
            color: AppColors.successGreen,
          ),
          SizedBox(width: 6),
          Text(
            'Copied',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: AppColors.successGreen,
            ),
          ),
        ],
      ),
    ),
  );
  // Starts empty on purpose — the user must type their own Googer ID/username
  // by hand; pre-filling it defeats the confirmation step.
  final TextEditingController _id = TextEditingController();

  String _normalizeId(String value) =>
      value.trim().replaceFirst(RegExp(r'^@+'), '').toLowerCase();

  bool _isOwnId(String value) {
    final n = _normalizeId(value);
    if (n.isEmpty) return false;
    return n == _normalizeId(Api.googerId) ||
        n == _normalizeId(Api.currentUserId) ||
        n == _normalizeId(Api.username);
  }

  String get _ownIdLabel {
    final id = Api.googerId.isNotEmpty ? Api.googerId : Api.currentUserId;
    return id.isEmpty ? '-' : id;
  }

  @override
  void dispose() {
    _copiedTimer?.cancel();
    _id.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: 10,
          right: 10,
          bottom: 10 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Container(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.94,
          ),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
          decoration: BoxDecoration(
            color: const Color(0xFF0F0F0F),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(height: 7),
              Flexible(
                fit: FlexFit.loose,
                child: SingleChildScrollView(
                  child: _earnView
                      ? _earnBody(context)
                      : Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _shareBody(context),
                            if (widget.canEarn) ...[
                              const SizedBox(height: 22),
                              _shareEarnAction(),
                            ],
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context, String title, String subtitle) {
    return Column(
      children: [
        Row(
          children: [
            if (_earnView) ...[
              GestureDetector(
                key: const Key('share-link-back'),
                onTap: () => setState(() => _earnView = false),
                behavior: HitTestBehavior.opaque,
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Ionicons.chevron_back,
                        size: 19,
                        color: Colors.white,
                      ),
                      SizedBox(width: 6),
                      Text(
                        'BACK',
                        maxLines: 1,
                        style: TextStyle(
                          fontSize: 12.5,
                          letterSpacing: 1.6,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textGray600,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Ionicons.close, color: Colors.white, size: 20),
              visualDensity: VisualDensity.compact,
              style: IconButton.styleFrom(
                backgroundColor: Colors.white.withOpacity(0.07),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        const Divider(height: 1, color: AppColors.borderWhite10),
      ],
    );
  }

  Widget _shareBody(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(context, 'Share', widget.subtitle),
        if (_copied) Center(child: _copiedPill()),
        const SizedBox(height: 14),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.35,
          children: [
            _ShareTarget(
              'WhatsApp',
              Ionicons.logo_whatsapp,
              const Color(0xFF25D366),
              () => openExternalLink(
                'https://api.whatsapp.com/send?text=${Uri.encodeComponent('${widget.title}\n\n${widget.url}')}',
              ),
            ),
            _ShareTarget(
              'Facebook',
              Ionicons.logo_facebook,
              const Color(0xFF1877F2),
              () => openExternalLink(
                'https://www.facebook.com/sharer/sharer.php?u=${Uri.encodeComponent(widget.url)}',
              ),
            ),
            _ShareTarget(
              'Instagram',
              Ionicons.logo_instagram,
              const Color(0xFFDD2A7B),
              () => _copyLink(widget.url),
            ),
            _ShareTarget(
              'X (Twitter)',
              Ionicons.logo_twitter,
              Colors.black,
              () => openExternalLink(
                'https://twitter.com/intent/tweet?url=${Uri.encodeComponent(widget.url)}&text=${Uri.encodeComponent(widget.title)}',
              ),
              glyph: 'X',
            ),
            _ShareTarget(
              'Telegram',
              Ionicons.paper_plane,
              const Color(0xFF27A7E5),
              () => openExternalLink(
                'https://t.me/share/url?url=${Uri.encodeComponent(widget.url)}&text=${Uri.encodeComponent(widget.title)}',
              ),
            ),
            _ShareTarget(
              'Copy Link',
              Ionicons.link,
              const Color(0xFF2A2A2A),
              () => _copyLink(widget.url),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _linkBox(widget.linkLabel, widget.url),
      ],
    );
  }

  Widget _shareEarnAction() {
    return GestureDetector(
      key: const Key('upload-share-earn'),
      onTap: () => setState(() => _earnView = true),
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: const Color(0xFF21170A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0x66F59E0B)),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFF5A3805),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Ionicons.layers_outline,
                size: 20,
                color: Color(0xFFFBBF24),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.earnTitle,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    widget.earnSubtitle,
                    style: const TextStyle(
                      color: Color(0xFFD69A00),
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Ionicons.chevron_forward, size: 18, color: Colors.white),
          ],
        ),
      ),
    );
  }

  Widget _earnBody(BuildContext context) {
    final pct = widget.commission.trim();
    final hasCommission = pct.isNotEmpty;
    final isProduct = widget.linkLabel.toLowerCase().contains('product');
    final actionLabel = isProduct ? 'Resell' : 'Share';
    final sourceUri = Uri.tryParse(widget.url);
    final sourceCode = sourceUri == null || sourceUri.pathSegments.isEmpty
        ? ''
        : sourceUri.pathSegments.last;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(
          context,
          'Share Link',
          isProduct
              ? 'Earn commission on every sale'
              : 'Share this content and earn when eligible viewers watch through your link',
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: hasCommission
                ? const Color(0xFF201608)
                : Colors.white.withOpacity(0.03),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: hasCommission
                  ? const Color(0x33F59E0B)
                  : Colors.white.withOpacity(0.06),
            ),
          ),
          child: Row(
            children: [
              Container(
                constraints: const BoxConstraints(minWidth: 64),
                height: 64,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: hasCommission
                      ? const Color(0xFF5A3805)
                      : Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  hasCommission ? '$pct%' : '\u2014',
                  style: TextStyle(
                    color: hasCommission
                        ? const Color(0xFFFBBF24)
                        : Colors.white.withOpacity(0.20),
                    fontSize:
                        hasCommission && (double.tryParse(pct) ?? 0) >= 100
                        ? 16
                        : 20,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isProduct ? 'RESELL COMMISSION' : 'SHARE COMMISSION',
                      style: const TextStyle(
                        color: AppColors.textGray600,
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      isProduct
                          ? (hasCommission
                                ? '$pct% per sale'
                                : 'Not set for this product')
                          : (hasCommission
                                ? '$pct% per eligible watch'
                                : 'Not set for this content'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: hasCommission
                            ? Colors.white
                            : Colors.white.withOpacity(0.40),
                        fontSize: hasCommission ? 14 : 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (hasCommission) ...[
                      const SizedBox(height: 3),
                      Text(
                        isProduct
                            ? 'Credited on order completion.'
                            : 'Credited after eligible watch.',
                        style: const TextStyle(
                          color: Color(0x99FBBF24),
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'ENTER YOUR GOOGER ID OR USERNAME',
          style: TextStyle(
            color: AppColors.textGray500,
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _id,
          onChanged: (value) {
            setState(() {
              _generated = "";
              _error = value.trim().isEmpty || _isOwnId(value)
                  ? ""
                  : 'Use your own Username (${Api.username}) or Googer ID ($_ownIdLabel).';
            });
          },
          // No platform autofill/suggestions — entry must be manual.
          autofillHints: const <String>[],
          autocorrect: false,
          enableSuggestions: false,
          textCapitalization: TextCapitalization.none,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
          decoration: InputDecoration(
            hintText: 'Type your Googer ID or username',
            hintStyle: const TextStyle(
              color: AppColors.textGray600,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
            prefixIcon: const Icon(
              Ionicons.person_outline,
              color: AppColors.textGray600,
            ),
            filled: true,
            fillColor: Colors.black,
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: AppColors.borderWhite10),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(color: Color(0x66F59E0B)),
            ),
          ),
        ),
        const SizedBox(height: 14),
        if (_error.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.likeRed.withOpacity(0.1),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.likeRed.withOpacity(0.25)),
            ),
            child: Text(
              _error,
              style: const TextStyle(
                color: AppColors.likeRed,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () {
              final id = _id.text.trim();
              if (id.isEmpty) return;
              if (!_isOwnId(id)) {
                setState(() {
                  _error =
                      'Use your own Username (${Api.username}) or Googer ID ($_ownIdLabel).';
                });
                return;
              }
              setState(() => _generated = widget.earnUrlBuilder(id));
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF9D00),
              foregroundColor: Colors.black,
              minimumSize: const Size.fromHeight(58),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
            ),
            child: Text(
              widget.earnKind,
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ),
        if (_error.isEmpty) ...[
          const SizedBox(height: 10),
          Text.rich(
            TextSpan(
              text:
                  'Only your own account identifier is allowed. Final link will combine code ',
              children: [
                TextSpan(
                  text: sourceCode,
                  style: const TextStyle(
                    color: Color(0xFFFBBF24),
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const TextSpan(text: ' with your ID.'),
              ],
            ),
            style: TextStyle(
              color: Colors.white.withOpacity(0.20),
              fontSize: 10,
              fontWeight: FontWeight.w500,
              fontStyle: FontStyle.italic,
              height: 1.45,
            ),
          ),
        ],
        if (_generated.isNotEmpty) ...[
          const SizedBox(height: 20),
          Row(
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: Color(0xFF34D399),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 9),
              Text(
                '${actionLabel.toUpperCase()} LINK READY',
                style: const TextStyle(
                  color: Color(0xFF34D399),
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.04),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'YOUR ${actionLabel.toUpperCase()} LINK',
                  style: const TextStyle(
                    color: AppColors.textGray600,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: () => openExternalLink(_generated),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(13),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.30),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withOpacity(0.05)),
                    ),
                    child: Text(
                      _generated,
                      style: const TextStyle(
                        color: Color(0xFF34D399),
                        fontSize: 12,
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w500,
                        height: 1.4,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => _copyLink(_generated),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _copied
                          ? const Color(0xFF10B981)
                          : const Color(0xFFFF9D00),
                      foregroundColor: _copied ? Colors.white : Colors.black,
                      minimumSize: const Size.fromHeight(52),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Text(
                      _copied
                          ? 'Copied to clipboard!'
                          : 'Copy $actionLabel Link',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'SHARE YOUR ${actionLabel.toUpperCase()} LINK',
            style: TextStyle(
              color: Colors.white.withOpacity(0.20),
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisExtent: 82,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            children: [
              _ShareTarget(
                'WhatsApp',
                Ionicons.logo_whatsapp,
                const Color(0xFF25D366),
                () => openExternalLink(
                  'https://api.whatsapp.com/send?text=${Uri.encodeComponent('${widget.title}\n\n$_generated')}',
                ),
              ),
              _ShareTarget(
                'Facebook',
                Ionicons.logo_facebook,
                const Color(0xFF1877F2),
                () => openExternalLink(
                  'https://www.facebook.com/sharer/sharer.php?u=${Uri.encodeComponent(_generated)}',
                ),
              ),
              _ShareTarget(
                'Telegram',
                Ionicons.paper_plane,
                const Color(0xFF27A7E5),
                () => openExternalLink(
                  'https://t.me/share/url?url=${Uri.encodeComponent(_generated)}&text=${Uri.encodeComponent(widget.title)}',
                ),
              ),
              _ShareTarget(
                'X',
                Ionicons.logo_twitter,
                Colors.black,
                () => openExternalLink(
                  'https://twitter.com/intent/tweet?url=${Uri.encodeComponent(_generated)}&text=${Uri.encodeComponent(widget.title)}',
                ),
                glyph: 'X',
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _linkBox(String label, String url) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            color: AppColors.textGray600,
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.8,
          ),
        ),
        const SizedBox(height: 9),
        Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.04),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  url,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFF60A5FA),
                    fontSize: 12,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              _SmallButton(label: 'Copy', onTap: () => _copyLink(url)),
            ],
          ),
        ),
      ],
    );
  }
}

class _ShareTarget extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final String? glyph;
  const _ShareTarget(
    this.label,
    this.icon,
    this.color,
    this.onTap, {
    this.glyph,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(18),
            ),
            child: glyph == null
                ? Icon(icon, color: Colors.white, size: 28)
                : Center(
                    child: Text(
                      glyph!,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.fade,
            softWrap: false,
            style: const TextStyle(
              color: AppColors.textGray500,
              fontSize: 10,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionRow extends StatelessWidget {
  final bool liked;
  final int likes;
  final int comments;
  final int views;
  final int shares;
  final VoidCallback onLike;
  final VoidCallback onComment;
  final VoidCallback onView;
  final VoidCallback onShare;
  const _ActionRow({
    required this.liked,
    required this.likes,
    required this.comments,
    required this.views,
    required this.shares,
    required this.onLike,
    required this.onComment,
    required this.onView,
    required this.onShare,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _ActionIcon(
          icon: liked ? Ionicons.heart : Ionicons.heart_outline,
          label: '$likes',
          color: liked ? AppColors.likeRed : Colors.white,
          onTap: onLike,
        ),
        _ActionIcon(
          icon: Ionicons.chatbubble_outline,
          label: '$comments',
          onTap: onComment,
        ),
        _ActionIcon(icon: Ionicons.eye_outline, label: '$views', onTap: onView),
        _ActionIcon(
          icon: Ionicons.share_social_outline,
          label: '$shares',
          onTap: onShare,
        ),
      ],
    );
  }
}

class _ActionIcon extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _ActionIcon({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color = Colors.white,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.only(right: 16),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: color == AppColors.likeRed
                    ? AppColors.likeRed
                    : AppColors.textGray300,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CountsLine extends StatelessWidget {
  final int likes;
  final int comments;
  final int views;
  final int shares;
  const _CountsLine({
    required this.likes,
    required this.comments,
    required this.views,
    required this.shares,
  });

  @override
  Widget build(BuildContext context) {
    return Text(
      '$likes likes, $comments comments, $views views, $shares shares',
      style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.4)),
    );
  }
}

class _MediaThumb extends StatelessWidget {
  final String url;
  final double height;
  final VoidCallback onTap;
  const _MediaThumb({
    required this.url,
    required this.height,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          height: height,
          color: AppColors.bg1,
          child: Image.network(
            Api.resolveMedia(url),
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => const Center(
              child: Icon(
                Ionicons.image_outline,
                size: 30,
                color: AppColors.textGray600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MiniProduct extends StatelessWidget {
  final String image;
  final String name;
  final String price;
  const _MiniProduct({
    required this.image,
    required this.name,
    required this.price,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Container(
        height: 112,
        color: AppColors.bg1,
        child: Stack(
          children: [
            Positioned.fill(
              child: image.isNotEmpty
                  ? Image.network(
                      image,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          const ColoredBox(color: AppColors.bg1),
                    )
                  : const ColoredBox(color: AppColors.bg1),
            ),
            Positioned(
              left: 7,
              right: 7,
              bottom: 7,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                  if (price.isNotEmpty)
                    Text(
                      'R $price',
                      style: const TextStyle(
                        fontSize: 10,
                        color: AppColors.textGray300,
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
}

class _SmallButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _SmallButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: Colors.black,
          ),
        ),
      ),
    );
  }
}

class _SheetAction extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool danger;
  const _SheetAction(this.label, this.icon, this.onTap, {this.danger = false});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      dense: true,
      leading: Icon(
        icon,
        size: 18,
        color: danger ? AppColors.likeRed : Colors.white,
      ),
      title: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: danger ? AppColors.likeRed : Colors.white,
        ),
      ),
      onTap: onTap,
    );
  }
}

class _FeedNotice extends StatelessWidget {
  final String text;
  final Future<void> Function({bool silent}) onTap;
  const _FeedNotice({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onTap(),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8, top: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.bg2,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.inputBorder),
        ),
        child: Row(
          children: [
            const Icon(
              Ionicons.cloud_offline_outline,
              size: 15,
              color: AppColors.textGray400,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textGray400,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(top: 80),
      child: Center(
        child: Text(
          'No live feed content yet.',
          style: TextStyle(fontSize: 12, color: AppColors.textGray500),
        ),
      ),
    );
  }
}

class _MediaViewer extends StatefulWidget {
  final String title;
  final String mediaUrl;
  final String poster;
  final String mediaType;
  final String externalLink;
  final String owner;
  final String typeLabel;
  final int likes;
  final int comments;
  final int views;
  final int shares;
  final int reposts;
  final bool liked;
  final bool reposted;
  final VoidCallback? onLike;
  final VoidCallback? onComment;
  final VoidCallback? onView;
  final VoidCallback? onShare;
  final ValueChanged<bool>? onRepostChanged;
  const _MediaViewer({
    required this.title,
    required this.mediaUrl,
    required this.poster,
    required this.mediaType,
    this.externalLink = '',
    this.owner = '',
    this.typeLabel = '',
    this.likes = 0,
    this.comments = 0,
    this.views = 0,
    this.shares = 0,
    this.reposts = 0,
    this.liked = false,
    this.reposted = false,
    this.onLike,
    this.onComment,
    this.onView,
    this.onShare,
    this.onRepostChanged,
  });

  @override
  State<_MediaViewer> createState() => _MediaViewerState();
}

class _MediaViewerState extends State<_MediaViewer> {
  late bool _liked = widget.liked;
  late int _likes = widget.likes;
  late bool _reposted = widget.reposted;
  late int _reposts = widget.reposts;

  @override
  Widget build(BuildContext context) {
    final isVideo =
        widget.mediaType.toLowerCase().contains('video') ||
        widget.mediaUrl.toLowerCase().contains('.mp4') ||
        widget.mediaUrl.toLowerCase().contains('.mov');
    final normalizedExternal = _UploadMediaFrame._normalizeUrl(
      widget.externalLink,
    );
    final externalIsFile = RegExp(
      r'\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$',
      caseSensitive: false,
    ).hasMatch(normalizedExternal);
    final externalEmbed = normalizedExternal.isEmpty
        ? null
        : _googEmbedUrl(normalizedExternal);
    final directVideoUrl = externalIsFile
        ? normalizedExternal
        : widget.mediaUrl;
    final playerOwnsRail =
        widget.onRepostChanged != null &&
        (externalEmbed != null ||
            externalIsFile ||
            (normalizedExternal.isEmpty && isVideo));
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: externalEmbed != null
                ? webEmbed(
                    externalEmbed,
                    feedControls: playerOwnsRail,
                    instanceKey: 'full-upload-${externalEmbed.hashCode}',
                    onFeedShare: widget.onShare,
                    onFeedRepost: _toggleRepost,
                    onFeedView: widget.onView,
                    onFeedComment: widget.onComment,
                    onFeedLike: _toggleLike,
                    feedReposts: '$_reposts',
                    feedViews: '${widget.views}',
                    feedComments: '${widget.comments}',
                    feedLikes: '$_likes',
                    feedLiked: _liked,
                  )
                : playerOwnsRail
                ? webVideo(
                    directVideoUrl,
                    poster: widget.poster,
                    feedControls: true,
                    instanceKey: 'full-upload-${directVideoUrl.hashCode}',
                    onFeedShare: widget.onShare,
                    onFeedRepost: _toggleRepost,
                    onFeedView: widget.onView,
                    onFeedComment: widget.onComment,
                    onFeedLike: _toggleLike,
                    feedReposts: '$_reposts',
                    feedViews: '${widget.views}',
                    feedComments: '${widget.comments}',
                    feedLikes: '$_likes',
                    feedLiked: _liked,
                  )
                : isVideo
                ? webVideo(widget.mediaUrl, poster: widget.poster)
                : (widget.mediaUrl.isEmpty && widget.poster.isEmpty)
                ? const _ViewerFallback()
                : Image.network(
                    widget.mediaUrl.isEmpty ? widget.poster : widget.mediaUrl,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const _ViewerFallback(),
                  ),
          ),
          Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withOpacity(0.45),
                      Colors.transparent,
                      Colors.black.withOpacity(0.75),
                    ],
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Stack(
              children: [
                Positioned(
                  top: 6,
                  left: 8,
                  right: 12,
                  child: Row(
                    children: [
                      const AppBackButton(
                        padding: EdgeInsets.symmetric(
                          vertical: 8,
                          horizontal: 4,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (widget.owner.isNotEmpty)
                              Text(
                                widget.owner,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white,
                                ),
                              ),
                            if (widget.typeLabel.isNotEmpty)
                              Text(
                                widget.typeLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white.withOpacity(0.55),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                if (!playerOwnsRail)
                  Positioned(
                    right: 10,
                    bottom: 92,
                    child: Column(
                      children: [
                        _ViewerRail(
                          icon: Ionicons.share_social_outline,
                          label: '${widget.shares}',
                          onTap: widget.onShare,
                        ),
                        if (widget.onRepostChanged != null) ...[
                          const SizedBox(height: 14),
                          _ViewerRail(
                            icon: _reposted
                                ? Ionicons.repeat
                                : Ionicons.repeat_outline,
                            label: '$_reposts',
                            color: _reposted
                                ? AppColors.successGreen
                                : Colors.white,
                            onTap: _toggleRepost,
                          ),
                        ],
                        const SizedBox(height: 14),
                        _ViewerRail(
                          icon: Ionicons.eye_outline,
                          label: '${widget.views}',
                          onTap: widget.onView,
                        ),
                        const SizedBox(height: 14),
                        _ViewerRail(
                          icon: Ionicons.chatbubble_outline,
                          label: '${widget.comments}',
                          onTap: widget.onComment,
                        ),
                        const SizedBox(height: 14),
                        _ViewerRail(
                          icon: _liked
                              ? Ionicons.heart
                              : Ionicons.heart_outline,
                          label: '$_likes',
                          color: _liked ? AppColors.likeRed : Colors.white,
                          onTap: _toggleLike,
                        ),
                      ],
                    ),
                  ),
                Positioned(
                  left: 16,
                  right: 72,
                  bottom: 24,
                  child: Text(
                    widget.title,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _toggleLike() {
    setState(() {
      _liked = !_liked;
      _likes = math.max(0, _likes + (_liked ? 1 : -1));
    });
    widget.onLike?.call();
  }

  void _toggleRepost() {
    final next = !_reposted;
    setState(() {
      _reposted = next;
      _reposts = math.max(0, _reposts + (next ? 1 : -1));
    });
    widget.onRepostChanged?.call(next);
  }
}

class _ViewerFallback extends StatelessWidget {
  const _ViewerFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      alignment: Alignment.center,
      child: Container(
        width: 86,
        height: 86,
        decoration: BoxDecoration(
          color: AppColors.likeRed.withOpacity(0.16),
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.likeRed.withOpacity(0.55)),
        ),
        child: const Icon(
          Ionicons.image_outline,
          size: 34,
          color: AppColors.likeRed,
        ),
      ),
    );
  }
}

class _ViewerRail extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  const _ViewerRail({
    required this.icon,
    required this.label,
    this.color = Colors.white,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.35),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withOpacity(0.22)),
            ),
            child: Icon(icon, size: 19, color: color),
          ),
          const SizedBox(height: 3),
          Text(
            label,
            style: const TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

void openInteractionsSheet(
  BuildContext context, {
  required String title,
  required String subtitle,
  required String initialKind,
  required Map<String, int> counts,
  required Future<List<Map<String, dynamic>>> Function(String kind) fetch,
  Future<bool> Function(String text, {dynamic parentId})? addComment,
  Future<bool> Function(int commentId, String reason)? reportComment,
  Future<bool> Function(int commentId)? deleteComment,
  Future<Map<String, dynamic>?> Function(int commentId)? likeComment,
  Future<Map<String, dynamic>?> Function(int commentId)? dislikeComment,

  /// Fired after a comment is added or deleted so the owning card can re-read
  /// its counts from the backend (the same `comments_count` the web reads).
  VoidCallback? onCommentsChanged,
}) {
  final controller = TextEditingController();
  var kind = initialKind;
  var commentFilter = 'all';
  var loadingPost = false;
  Map<String, dynamic>? replyingTo;
  // Resolved when Reply is tapped — kept as `dynamic` because sponsored-ad
  // comment ids are strings (`ad-comment-12`), not integers.
  dynamic replyParentId;
  late Future<List<Map<String, dynamic>>> future = fetch(kind);
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.bg0,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (sheetCtx) => StatefulBuilder(
      builder: (context, setState) {
        void select(String next) {
          setState(() {
            kind = next;
            if (next != 'comments') commentFilter = 'all';
            future = fetch(kind);
          });
        }

        Future<void> submit() async {
          final text = controller.text.trim();
          if (text.isEmpty || addComment == null || loadingPost) return;
          setState(() => loadingPost = true);
          final parentId = replyingTo == null ? null : replyParentId;
          final ok = await addComment(text, parentId: parentId);
          if (!context.mounted) return;
          setState(() {
            loadingPost = false;
            if (ok) {
              controller.clear();
              replyingTo = null;
              replyParentId = null;
              future = fetch('comments');
            }
          });
          // Let the feed card pick the new total up from the backend, so the
          // comment count matches what the web shows.
          if (ok) onCommentsChanged?.call();
        }

        return SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom,
            ),
            child: SizedBox(
              height: MediaQuery.of(context).size.height * 0.74,
              child: Column(
                children: [
                  const SizedBox(height: 8),
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 16, 10, 8),
                    child: Row(
                      children: [
                        for (final item in const [
                          ('likes', Ionicons.heart_outline, 'LIKES'),
                          ('comments', Ionicons.chatbubble_outline, 'COMMENTS'),
                          ('shares', Ionicons.share_social_outline, 'SHARES'),
                          ('views', Ionicons.eye_outline, 'VIEWS'),
                        ])
                          Expanded(
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => select(item.$1),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 140),
                                height: 58,
                                margin: const EdgeInsets.symmetric(
                                  horizontal: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: kind == item.$1
                                      ? const Color(0xFF252525)
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      item.$2,
                                      size: 19,
                                      color: Colors.white,
                                    ),
                                    const SizedBox(height: 7),
                                    Text(
                                      item.$3,
                                      style: const TextStyle(
                                        fontSize: 8,
                                        fontWeight: FontWeight.w600,
                                        letterSpacing: 0.8,
                                        color: AppColors.textGray500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        IconButton(
                          icon: const Icon(
                            Ionicons.close,
                            size: 18,
                            color: Colors.white,
                          ),
                          onPressed: () => Navigator.pop(sheetCtx),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            kind == 'comments'
                                ? 'COMMENTS'
                                : 'WHO ${kind == 'views'
                                      ? 'VIEWED'
                                      : kind == 'likes'
                                      ? 'LIKED THIS'
                                      : 'SHARED'}',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            subtitle.toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.8,
                              color: Color(0xFF72809B),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Expanded(
                    child: FutureBuilder<List<Map<String, dynamic>>>(
                      future: future,
                      builder: (context, snap) {
                        if (snap.connectionState != ConnectionState.done) {
                          return const Center(
                            child: SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.textGray400,
                              ),
                            ),
                          );
                        }
                        final rawRows =
                            snap.data ?? const <Map<String, dynamic>>[];
                        final rows = [...rawRows];
                        if (kind == 'comments') {
                          int timeOf(Map<String, dynamic> row) =>
                              DateTime.tryParse(
                                '${row['created_at'] ?? row['createdAt'] ?? row['timestamp'] ?? ''}',
                              )?.millisecondsSinceEpoch ??
                              0;
                          int likesOf(Map<String, dynamic> row) =>
                              int.tryParse(
                                '${row['likes'] ?? row['likes_count'] ?? row['upvotes'] ?? 0}',
                              ) ??
                              0;
                          if (commentFilter == 'recent') {
                            rows.sort((a, b) => timeOf(b).compareTo(timeOf(a)));
                          } else if (commentFilter == 'top') {
                            rows.sort(
                              (a, b) => likesOf(b).compareTo(likesOf(a)),
                            );
                          } else {
                            rows.sort((a, b) => timeOf(a).compareTo(timeOf(b)));
                          }
                        }
                        if (rows.isEmpty) {
                          return Center(
                            child: Text(
                              kind == 'comments'
                                  ? (addComment == null
                                        ? 'Comments are turned off'
                                        : 'No comments yet')
                                  : counts[kind] == 0
                                  ? 'No $kind yet'
                                  : '$title has ${counts[kind]} $kind',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.textGray500,
                              ),
                            ),
                          );
                        }
                        return Column(
                          children: [
                            if (kind == 'comments')
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  14,
                                  0,
                                  14,
                                  12,
                                ),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: Container(
                                    padding: const EdgeInsets.all(4),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withOpacity(0.05),
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        for (final filter in const [
                                          ('all', 'ALL'),
                                          ('recent', 'RECENT'),
                                          ('top', 'TOP RATED'),
                                        ])
                                          GestureDetector(
                                            onTap: () => setState(
                                              () => commentFilter = filter.$1,
                                            ),
                                            child: Container(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal: 13,
                                                    vertical: 8,
                                                  ),
                                              decoration: BoxDecoration(
                                                color:
                                                    commentFilter == filter.$1
                                                    ? Colors.white
                                                    : Colors.transparent,
                                                borderRadius:
                                                    BorderRadius.circular(11),
                                              ),
                                              child: Text(
                                                filter.$2,
                                                style: TextStyle(
                                                  fontSize: 9,
                                                  fontWeight: FontWeight.w600,
                                                  color:
                                                      commentFilter == filter.$1
                                                      ? Colors.black
                                                      : AppColors.textGray500,
                                                ),
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            Expanded(
                              child: kind == 'comments'
                                  ? Builder(
                                      builder: (_) {
                                        // Replies (rows carrying a parent_id)
                                        // hang off their parent instead of
                                        // sitting in the flat list.
                                        final threads = _threadComments(rows);
                                        return ListView.separated(
                                          padding: const EdgeInsets.fromLTRB(
                                            14,
                                            0,
                                            14,
                                            12,
                                          ),
                                          itemCount: threads.length,
                                          separatorBuilder: (_, __) =>
                                              const SizedBox(height: 14),
                                          itemBuilder: (_, i) => _CommentThread(
                                            node: threads[i],
                                            reportComment: reportComment,
                                            deleteComment: deleteComment,
                                            likeComment: likeComment,
                                            dislikeComment: dislikeComment,
                                            onReply: addComment == null
                                                ? null
                                                : (row, depth) => setState(() {
                                                    replyingTo = row;
                                                    replyParentId =
                                                        _replyParentId(
                                                          row,
                                                          depth,
                                                        );
                                                    controller.text = '';
                                                  }),
                                            onChanged: () {
                                              setState(
                                                () =>
                                                    future = fetch('comments'),
                                              );
                                              onCommentsChanged?.call();
                                            },
                                          ),
                                        );
                                      },
                                    )
                                  : ListView.separated(
                                      padding: const EdgeInsets.fromLTRB(
                                        14,
                                        0,
                                        14,
                                        12,
                                      ),
                                      itemCount: rows.length,
                                      separatorBuilder: (_, __) =>
                                          const SizedBox(height: 8),
                                      itemBuilder: (_, i) => _InteractionRow(
                                        row: rows[i],
                                        kind: kind,
                                      ),
                                    ),
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                  if (kind == 'comments')
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                      child: Column(
                        children: [
                          if (addComment == null)
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.03),
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(
                                  color: AppColors.borderWhite06,
                                ),
                              ),
                              child: const Text(
                                'COMMENTS ARE TURNED OFF',
                                style: TextStyle(
                                  color: AppColors.textGray500,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            )
                          else ...[
                            if (replyingTo != null) ...[
                              Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.04),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: AppColors.borderWhite06,
                                  ),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        'Replying to ${_InteractionRowState.entryName(replyingTo!)}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: AppColors.textGray400,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                    GestureDetector(
                                      onTap: () => setState(() {
                                        replyingTo = null;
                                        replyParentId = null;
                                      }),
                                      child: const Icon(
                                        Ionicons.close_outline,
                                        size: 16,
                                        color: AppColors.textGray500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            SizedBox(
                              height: 38,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemBuilder: (_, i) {
                                  const emojis = [
                                    '❤️',
                                    '😂',
                                    '😍',
                                    '🔥',
                                    '🙌',
                                    '👏',
                                    '💯',
                                    '✨',
                                    '😢',
                                    '😮',
                                  ];
                                  final emoji = emojis[i];
                                  return GestureDetector(
                                    onTap: () => controller.text =
                                        '${controller.text}$emoji',
                                    child: Container(
                                      width: 34,
                                      height: 34,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: Colors.white.withOpacity(0.04),
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                          color: AppColors.borderWhite06,
                                        ),
                                      ),
                                      child: Text(
                                        emoji,
                                        style: const TextStyle(fontSize: 15),
                                      ),
                                    ),
                                  );
                                },
                                separatorBuilder: (_, __) =>
                                    const SizedBox(width: 6),
                                itemCount: 10,
                              ),
                            ),
                            const SizedBox(height: 9),
                            Row(
                              children: [
                                _Avatar(
                                  url: Api.avatar ?? '',
                                  name: Api.displayName,
                                  size: 36,
                                ),
                                const SizedBox(width: 9),
                                Expanded(
                                  child: TextField(
                                    controller: controller,
                                    minLines: 1,
                                    maxLines: 3,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      color: Colors.white,
                                    ),
                                    decoration: InputDecoration(
                                      hintText: 'Write a comment...',
                                      hintStyle: const TextStyle(
                                        color: AppColors.textGray500,
                                      ),
                                      filled: true,
                                      fillColor: AppColors.bg0,
                                      contentPadding:
                                          const EdgeInsets.symmetric(
                                            horizontal: 14,
                                            vertical: 12,
                                          ),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(
                                          999,
                                        ),
                                        borderSide: const BorderSide(
                                          color: AppColors.borderWhite10,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 9),
                                IconButton.filled(
                                  onPressed: loadingPost ? null : submit,
                                  style: IconButton.styleFrom(
                                    backgroundColor: const Color(0xFF1D4ED8),
                                    foregroundColor: Colors.white,
                                  ),
                                  icon: Icon(
                                    loadingPost
                                        ? Ionicons.hourglass_outline
                                        : Ionicons.send,
                                    size: 18,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      },
    ),
  ).whenComplete(controller.dispose);
}

/// Deepest thread level rendered. Facebook/TikTok style: a comment, a reply to
/// it, and a reply to that reply. Anything further is kept as a sibling at
/// level 3 instead of indenting forever.
const int _maxCommentDepth = 3;

/// One comment plus its nested replies. [depth] starts at 1 for a top-level
/// comment.
class _CommentNode {
  final Map<String, dynamic> comment;
  final List<_CommentNode> replies;
  final int depth;
  const _CommentNode(this.comment, this.replies, this.depth);
}

/// Raw comment id — kept as-is rather than parsed, because sponsored-ad
/// comments are identified by strings like `ad-comment-12`.
dynamic _rawCommentId(Map<String, dynamic> row) =>
    row['id'] ?? row['comment_id'] ?? row['commentId'];

dynamic _rawParentId(Map<String, dynamic> row) =>
    row['parent_id'] ?? row['parentId'] ?? row['reply_to'];

String _commentIdOf(Map<String, dynamic> row) =>
    '${_rawCommentId(row) ?? ''}'.trim();

String _parentIdOf(Map<String, dynamic> row) {
  final value = '${_rawParentId(row) ?? ''}'.trim();
  return (value.isEmpty || value == 'null' || value == '0') ? '' : value;
}

/// Builds the reply tree from the flat list the API returns. Replies whose
/// parent is missing (deleted, or not in this page) are promoted to top level
/// so they can never silently disappear.
List<_CommentNode> _threadComments(List<Map<String, dynamic>> rows) {
  final ids = <String>{for (final row in rows) _commentIdOf(row)};
  final childrenOf = <String, List<Map<String, dynamic>>>{};
  final roots = <Map<String, dynamic>>[];

  for (final row in rows) {
    final parent = _parentIdOf(row);
    if (parent.isEmpty || !ids.contains(parent)) {
      roots.add(row);
    } else {
      childrenOf.putIfAbsent(parent, () => []).add(row);
    }
  }

  _CommentNode build(Map<String, dynamic> row, int depth) {
    final children = childrenOf[_commentIdOf(row)] ?? const [];
    // Past the cap, deeper replies keep rendering but stop indenting.
    final childDepth = depth >= _maxCommentDepth ? _maxCommentDepth : depth + 1;
    return _CommentNode(
      row,
      children.map((child) => build(child, childDepth)).toList(),
      depth,
    );
  }

  return roots.map((row) => build(row, 1)).toList();
}

/// Which comment a new reply attaches to. Replying inside levels 1–2 nests one
/// level deeper; replying at the deepest level threads alongside it instead, so
/// the tree never grows past [_maxCommentDepth].
dynamic _replyParentId(Map<String, dynamic> row, int depth) {
  if (depth < _maxCommentDepth) return _rawCommentId(row);
  final parent = _rawParentId(row);
  return parent ?? _rawCommentId(row);
}

/// Report-comment dialog — same four reasons and the same radio/Submit layout
/// as the web `InteractionBottomSheet` report modal. Returns the chosen reason,
/// or null when cancelled.
Future<String?> _pickCommentReportReason(BuildContext context) {
  const reasons = [
    'Spam or misleading',
    'Harassment or bullying',
    'Hate speech or graphic',
    'Inappropriate content',
  ];
  const amber = Color(0xFFB45309);
  String? selected;

  return showDialog<String>(
    context: context,
    barrierColor: Colors.black.withOpacity(0.6),
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => Dialog(
        backgroundColor: const Color(0xFF141414),
        insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 24, 22, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'REPORT COMMENT',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.6,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'SELECT A REASON TO SECURELY REPORT THIS CONTENT',
                style: TextStyle(
                  fontSize: 9,
                  height: 1.6,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: Colors.white.withOpacity(0.4),
                ),
              ),
              const SizedBox(height: 18),
              for (final reason in reasons)
                GestureDetector(
                  onTap: () => setState(() => selected = reason),
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 15,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.02),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: selected == reason
                            ? amber.withOpacity(0.6)
                            : AppColors.borderWhite06,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 17,
                          height: 17,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: selected == reason
                                  ? const Color(0xFFF59E0B)
                                  : Colors.white.withOpacity(0.2),
                            ),
                          ),
                          child: selected == reason
                              ? Container(
                                  width: 8,
                                  height: 8,
                                  decoration: const BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Color(0xFFF59E0B),
                                  ),
                                )
                              : null,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            reason,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: selected == reason
                                  ? Colors.white
                                  : Colors.white.withOpacity(0.6),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => Navigator.pop(dialogContext),
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.03),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.borderWhite06),
                        ),
                        child: const Text(
                          'CANCEL',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.6,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Opacity(
                      opacity: selected == null ? 0.45 : 1,
                      child: GestureDetector(
                        onTap: selected == null
                            ? null
                            : () => Navigator.pop(dialogContext, selected),
                        behavior: HitTestBehavior.opaque,
                        child: Container(
                          height: 48,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: amber,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: const Text(
                            'SUBMIT',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.6,
                              color: Colors.white,
                            ),
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
    ),
  );
}

/// One comment and its nested replies, rendered recursively down to
/// [_maxCommentDepth]. Replies stay collapsed behind a "View N replies" toggle
/// (the Facebook/TikTok pattern) rather than the web's hold-to-reveal gesture,
/// which is undiscoverable on a phone.
class _CommentThread extends StatefulWidget {
  final _CommentNode node;
  final Future<bool> Function(int commentId, String reason)? reportComment;
  final Future<bool> Function(int commentId)? deleteComment;
  final Future<Map<String, dynamic>?> Function(int commentId)? likeComment;
  final Future<Map<String, dynamic>?> Function(int commentId)? dislikeComment;

  /// Receives the comment being replied to and its depth, so the caller can
  /// pick the right parent id.
  final void Function(Map<String, dynamic> row, int depth)? onReply;
  final VoidCallback? onChanged;

  const _CommentThread({
    required this.node,
    this.reportComment,
    this.deleteComment,
    this.likeComment,
    this.dislikeComment,
    this.onReply,
    this.onChanged,
  });

  @override
  State<_CommentThread> createState() => _CommentThreadState();
}

class _CommentThreadState extends State<_CommentThread> {
  bool _expanded = false;

  /// Total replies underneath this comment, so the toggle reads "View 5
  /// replies" rather than only counting direct children.
  int _countAll(List<_CommentNode> nodes) =>
      nodes.fold(0, (sum, node) => sum + 1 + _countAll(node.replies));

  @override
  Widget build(BuildContext context) {
    final node = widget.node;
    final count = _countAll(node.replies);
    final isReply = node.depth > 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InteractionRow(
          row: node.comment,
          kind: 'comments',
          isReply: isReply,
          reportComment: widget.reportComment,
          deleteComment: widget.deleteComment,
          likeComment: widget.likeComment,
          dislikeComment: widget.dislikeComment,
          onReply: widget.onReply == null
              ? null
              : (row) => widget.onReply!(row, node.depth),
          onChanged: widget.onChanged,
        ),
        if (count > 0) ...[
          const SizedBox(height: 6),
          Padding(
            padding: EdgeInsets.only(left: isReply ? 38 : 44),
            child: GestureDetector(
              onTap: () => setState(() => _expanded = !_expanded),
              behavior: HitTestBehavior.opaque,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 18,
                    height: 1,
                    color: AppColors.linkBlue.withOpacity(0.35),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _expanded
                        ? 'Hide ${count == 1 ? 'reply' : 'replies'}'
                        : 'View $count ${count == 1 ? 'reply' : 'replies'}',
                    style: const TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w500,
                      color: AppColors.linkBlue,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(
                    _expanded
                        ? Ionicons.chevron_up_outline
                        : Ionicons.chevron_down_outline,
                    size: 11,
                    color: AppColors.linkBlue,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded)
            Padding(
              // Indent one step per level, stopping once the cap is reached.
              padding: EdgeInsets.only(
                left: node.depth >= _maxCommentDepth ? 14 : 26,
                top: 10,
              ),
              child: Column(
                children: [
                  for (final reply in node.replies)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _CommentThread(
                        node: reply,
                        reportComment: widget.reportComment,
                        deleteComment: widget.deleteComment,
                        likeComment: widget.likeComment,
                        dislikeComment: widget.dislikeComment,
                        onReply: widget.onReply,
                        onChanged: widget.onChanged,
                      ),
                    ),
                ],
              ),
            ),
        ],
      ],
    );
  }
}

class _InteractionRow extends StatefulWidget {
  final Map<String, dynamic> row;
  final String kind;

  /// Replies render slightly smaller and never show their own reply toggle.
  final bool isReply;
  final Future<bool> Function(int commentId, String reason)? reportComment;
  final Future<bool> Function(int commentId)? deleteComment;
  final Future<Map<String, dynamic>?> Function(int commentId)? likeComment;
  final Future<Map<String, dynamic>?> Function(int commentId)? dislikeComment;
  final ValueChanged<Map<String, dynamic>>? onReply;
  final VoidCallback? onChanged;
  const _InteractionRow({
    required this.row,
    required this.kind,
    this.isReply = false,
    this.reportComment,
    this.deleteComment,
    this.likeComment,
    this.dislikeComment,
    this.onReply,
    this.onChanged,
  });

  @override
  State<_InteractionRow> createState() => _InteractionRowState();
}

class _InteractionRowState extends State<_InteractionRow> {
  // The vote is a toggle: the tap is applied optimistically, then reconciled
  // with the totals the backend returns so the count can never drift.
  int? _likesOverride;
  int? _dislikesOverride;
  late bool _liked = widget.row['user_liked'] == true;
  late bool _disliked = widget.row['user_disliked'] == true;
  bool _busy = false;

  Map<String, dynamic> get row => widget.row;
  String get kind => widget.kind;
  Future<bool> Function(int, String)? get reportComment => widget.reportComment;
  Future<bool> Function(int)? get deleteComment => widget.deleteComment;
  Future<Map<String, dynamic>?> Function(int)? get likeComment =>
      widget.likeComment;
  Future<Map<String, dynamic>?> Function(int)? get dislikeComment =>
      widget.dislikeComment;
  ValueChanged<Map<String, dynamic>>? get onReply => widget.onReply;
  VoidCallback? get onChanged => widget.onChanged;

  /// Adopts the authoritative counts/vote the backend replies with. Servers
  /// that don't report a vote (upload + market comments) keep the optimistic
  /// state, so the button still toggles there.
  void _applyServerState(Map<String, dynamic>? result) {
    if (!mounted) return;
    if (result == null) return;
    setState(() {
      final likes = int.tryParse('${result['likes'] ?? ''}');
      final dislikes = int.tryParse('${result['dislikes'] ?? ''}');
      if (likes != null) _likesOverride = likes;
      if (dislikes != null) _dislikesOverride = dislikes;
      if (result.containsKey('user_liked')) {
        _liked = result['user_liked'] == true;
      }
      if (result.containsKey('user_disliked')) {
        _disliked = result['user_disliked'] == true;
      }
    });
  }

  Future<void> _like(BuildContext context) async {
    final like = likeComment;
    if (like == null || _commentId == 0 || _busy) return;
    final wasLiked = _liked;
    final wasDisliked = _disliked;
    setState(() {
      _busy = true;
      _liked = !wasLiked;
      _disliked = false;
      _likesOverride = (_currentLikes + (wasLiked ? -1 : 1)).clamp(0, 1 << 30);
      if (wasDisliked) {
        _dislikesOverride = (_currentDislikes - 1).clamp(0, 1 << 30);
      }
    });
    final result = await like(_commentId);
    _applyServerState(result);
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _dislike(BuildContext context) async {
    final dislike = dislikeComment;
    if (dislike == null || _commentId == 0 || _busy) return;
    final wasDisliked = _disliked;
    final wasLiked = _liked;
    setState(() {
      _busy = true;
      _disliked = !wasDisliked;
      _liked = false;
      _dislikesOverride = (_currentDislikes + (wasDisliked ? -1 : 1)).clamp(
        0,
        1 << 30,
      );
      if (wasLiked) {
        _likesOverride = (_currentLikes - 1).clamp(0, 1 << 30);
      }
    });
    final result = await dislike(_commentId);
    _applyServerState(result);
    if (mounted) setState(() => _busy = false);
  }

  int get _currentLikes => _likesOverride ?? _baseLikes;
  int get _currentDislikes => _dislikesOverride ?? _baseDislikes;

  int get _baseLikes =>
      int.tryParse(
        '${row['likes'] ?? row['likes_count'] ?? row['upvotes'] ?? 0}',
      ) ??
      0;

  int get _baseDislikes =>
      int.tryParse(
        '${row['dislikes'] ?? row['dislikes_count'] ?? row['downvotes'] ?? 0}',
      ) ??
      0;

  int get _commentId =>
      int.tryParse(
        '${row['id'] ?? row['comment_id'] ?? row['commentId'] ?? 0}',
      ) ??
      0;

  bool get _isOwnComment {
    final me = Api.currentUserId.trim();
    if (me.isEmpty) return false;
    final user = row['user'];
    final owner =
        (user is Map
            ? (user['id'] ?? user['user_id'] ?? user['userId'])
            : null) ??
        row['user_id'] ??
        row['userId'] ??
        row['owner_id'];
    return owner != null && '$owner'.trim() == me;
  }

  String get _entryUserId {
    final user = row['user'];
    final id =
        (user is Map
            ? (user['id'] ?? user['user_id'] ?? user['userId'])
            : null) ??
        row['user_id'] ??
        row['userId'] ??
        row['sender_id'] ??
        row['owner_id'] ??
        '';
    return '$id';
  }

  String get _entryUsername {
    final user = row['user'];
    if (user is Map) return (user['username'] ?? '').toString();
    return (row['username'] ??
            row['user_name'] ??
            row['sender_username'] ??
            row['owner_username'] ??
            '')
        .toString();
  }

  void _openEntryProfile(BuildContext context) {
    if (_entryUserId.isEmpty && _entryUsername.isEmpty) return;
    _openUserProfile(
      context,
      userId: _entryUserId,
      username: _entryUsername,
      name: _entryName(row),
      avatar: _entryAvatar(row),
    );
  }

  Future<void> _report(BuildContext context) async {
    final report = reportComment;
    if (report == null || _commentId == 0) return;
    final reason = await _pickCommentReportReason(context);
    if (reason == null || !context.mounted) return;
    final ok = await report(_commentId, reason);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? 'Comment reported' : 'Could not report comment'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  Future<void> _delete(BuildContext context) async {
    final del = deleteComment;
    if (del == null || _commentId == 0) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bg1,
        title: const Text(
          'Delete comment?',
          style: TextStyle(color: Colors.white, fontSize: 15),
        ),
        content: const Text(
          'This comment will be permanently removed.',
          style: TextStyle(color: AppColors.textGray400, fontSize: 12),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Delete',
              style: TextStyle(color: AppColors.likeRed),
            ),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    final ok = await del(_commentId);
    if (!context.mounted) return;
    if (ok) onChanged?.call();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok ? 'Comment deleted' : 'Could not delete comment'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final name = _entryName(row);
    final avatar = _entryAvatar(row);
    final text =
        (row['text'] ??
                row['comment'] ??
                row['content'] ??
                row['message'] ??
                '')
            .toString();
    final time =
        (row['created_at'] ??
                row['createdAt'] ??
                row['timestamp'] ??
                row['time'] ??
                '')
            .toString();
    final likes = _likesOverride ?? _baseLikes;
    final dislikes = _dislikesOverride ?? _baseDislikes;
    if (kind == 'comments') {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Avatar(
            url: avatar,
            name: name,
            size: 34,
            onTap: () => _openEntryProfile(context),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(12, 9, 12, 10),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.045),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.borderWhite06),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => _openEntryProfile(context),
                              child: Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          if (time.isNotEmpty)
                            Text(
                              _shortTime(time),
                              style: const TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF72809B),
                              ),
                            ),
                        ],
                      ),
                      if (text.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          text,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.32,
                            color: AppColors.textGray300,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 5),
                Row(
                  children: [
                    if (likeComment != null) ...[
                      _CommentMiniAction(
                        icon: _liked
                            ? Ionicons.thumbs_up
                            : Ionicons.thumbs_up_outline,
                        label: likes > 0 ? '$likes' : '',
                        color: _liked ? AppColors.linkBlue : null,
                        onTap: () => _like(context),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (dislikeComment != null) ...[
                      _CommentMiniAction(
                        icon: _disliked
                            ? Ionicons.thumbs_down
                            : Ionicons.thumbs_down_outline,
                        label: dislikes > 0 ? '$dislikes' : '',
                        color: _disliked ? AppColors.likeRed : null,
                        onTap: () => _dislike(context),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (onReply != null) ...[
                      _CommentMiniAction(
                        icon: Ionicons.chatbubble_ellipses_outline,
                        label: 'Reply',
                        onTap: () => onReply?.call(row),
                      ),
                      const SizedBox(width: 8),
                    ],
                    _CommentMiniAction(
                      icon: Ionicons.flag_outline,
                      label: '',
                      onTap: reportComment != null
                          ? () => _report(context)
                          : null,
                    ),
                    if (_isOwnComment && deleteComment != null) ...[
                      const SizedBox(width: 8),
                      _CommentMiniAction(
                        icon: Ionicons.trash_outline,
                        label: '',
                        color: AppColors.likeRed,
                        onTap: () => _delete(context),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      decoration: BoxDecoration(
        color: AppColors.bg0,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: AppColors.borderWhite06),
      ),
      child: Row(
        children: [
          _Avatar(
            url: avatar,
            name: name,
            size: 34,
            onTap: () => _openEntryProfile(context),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _openEntryProfile(context),
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
                if (kind == 'comments' && text.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    text,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.25,
                      color: AppColors.textGray300,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (time.isNotEmpty)
            Text(
              _shortTime(time),
              style: const TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w600,
                color: Color(0xFF72809B),
              ),
            ),
        ],
      ),
    );
  }

  static String entryName(Map<String, dynamic> row) => _entryName(row);

  static String _entryName(Map<String, dynamic> row) {
    final user = row['user'];
    if (user is Map) {
      return (user['full_name'] ??
              user['fullName'] ??
              user['name'] ??
              user['username'] ??
              'User')
          .toString();
    }
    return (row['full_name'] ??
            row['fullName'] ??
            row['name'] ??
            row['username'] ??
            row['user_name'] ??
            row['sender_username'] ??
            row['owner_username'] ??
            'User')
        .toString();
  }

  static String _entryAvatar(Map<String, dynamic> row) {
    return (Api.rawAvatar(row) ?? '').toString();
  }

  /// Relative age ("now", "5m", "2h", "3d") like the rest of the feed, instead
  /// of the raw `MM-DD` slice this used to print. Once an entry is a week old
  /// the relative label stops carrying information, so [Api.commentTime] swaps
  /// it for the date it was posted ("12 Mar").
  static String _shortTime(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return '';
    if (DateTime.tryParse(trimmed) != null) return Api.commentTime(trimmed);
    return trimmed.replaceAll('T', ' ').split('.').first;
  }
}

class _CommentMiniAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final Color? color;
  const _CommentMiniAction({
    required this.icon,
    required this.label,
    this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final tint = color ?? AppColors.textGray400;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: tint),
          if (label.isNotEmpty) ...[
            const SizedBox(width: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: tint,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

void _openAdViewer(BuildContext context, HomeAd ad) {
  Api.markAdView(ad.interactionId);
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (viewerContext) => _MediaViewer(
        title: ad.title,
        mediaUrl: Api.resolveMedia(ad.mediaPreview),
        poster: Api.resolveMedia(ad.mediaPreview),
        mediaType: ad.mediaType,
        owner: ad.fullName.isEmpty ? ad.username : ad.fullName,
        typeLabel: ad.campaignType,
        likes: ad.likes,
        comments: ad.comments,
        views: ad.views,
        shares: ad.shares,
        onLike: () async {
          await Api.toggleAdLike(ad.interactionId);
        },
        onComment: () => openInteractionsSheet(
          viewerContext,
          title: ad.title.isEmpty ? ad.username : ad.title,
          subtitle: ad.campaignType,
          initialKind: 'comments',
          counts: {
            'likes': ad.likes,
            'comments': ad.comments,
            'views': ad.views,
            'shares': ad.shares,
          },
          fetch: (kind) => Api.adInteractions(ad.interactionId, kind),
          addComment: (text, {parentId}) =>
              Api.addAdComment(ad.interactionId, text, parentId: parentId),
          reportComment: (id, reason) => Api.reportProductComment(id, reason),
          deleteComment: (id) => Api.deleteProductComment(id),
          likeComment: (id) => Api.likeProductComment(id),
          dislikeComment: (id) => Api.dislikeProductComment(id),
        ),
        onView: () {
          Api.markAdView(ad.interactionId);
          openInteractionsSheet(
            viewerContext,
            title: ad.title.isEmpty ? ad.username : ad.title,
            subtitle: ad.campaignType,
            initialKind: 'views',
            counts: {
              'likes': ad.likes,
              'comments': ad.comments,
              'views': ad.views,
              'shares': ad.shares,
            },
            fetch: (kind) => Api.adInteractions(ad.interactionId, kind),
            addComment: (text, {parentId}) =>
                Api.addAdComment(ad.interactionId, text, parentId: parentId),
            reportComment: (id, reason) => Api.reportProductComment(id, reason),
            deleteComment: (id) => Api.deleteProductComment(id),
            likeComment: (id) => Api.likeProductComment(id),
            dislikeComment: (id) => Api.dislikeProductComment(id),
          );
        },
        onShare: () => _openAdShareSheet(viewerContext, ad),
      ),
    ),
  );
}

bool _isInsufficientUploadPurchaseError(String? message) {
  final text = '${message ?? ''}'.toLowerCase();
  return text.contains('insufficient') ||
      text.contains('not enough') ||
      text.contains('balance');
}

Future<void> _showUploadInsufficientBalanceDialog(
  BuildContext context,
  double requiredCoins,
) async {
  await showDialog<void>(
    context: context,
    barrierColor: Colors.black.withOpacity(0.76),
    builder: (dialogContext) => Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 28),
      backgroundColor: const Color(0xFF15161A),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: Color(0x667A3942)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: Color(0xFF33272B),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Ionicons.wallet_outline,
                size: 21,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Insufficient Balance',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'You need ${_money(requiredCoins)} Coins to continue.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 10,
                height: 1.4,
                color: AppColors.textGray400,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.pop(dialogContext),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(94, 34),
                    foregroundColor: AppColors.textGray300,
                    side: const BorderSide(color: AppColors.borderWhite10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: const Text(
                    'CANCEL',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                ElevatedButton(
                  onPressed: () {
                    Navigator.pop(dialogContext);
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const TopUpScreen()),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size(94, 34),
                    elevation: 0,
                    backgroundColor: const Color(0xFF63E6BE),
                    foregroundColor: Colors.black,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: const Text(
                    'TOP UP',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
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

Future<bool?> _confirmUnlock(
  BuildContext context,
  UploadContent item, {
  Future<void> Function(double requiredCoins)? onInsufficientBalance,
}) {
  bool unlocking = false;
  String? error;
  return showDialog<bool>(
    context: context,
    barrierColor: Colors.black.withOpacity(0.8),
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => Dialog(
        backgroundColor: AppColors.bg1,
        insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(
                    Ionicons.lock_closed_outline,
                    size: 20,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 9),
                  const Expanded(
                    child: Text(
                      'Watch Content',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(
                      Ionicons.close_outline,
                      size: 20,
                      color: AppColors.textGray400,
                    ),
                    onPressed: unlocking
                        ? null
                        : () => Navigator.pop(dialogContext, false),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'Unlock this ${item.type.toLowerCase()} item before watching.',
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textGray500,
                ),
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Cost: ${_money(item.coins)} Coins',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Your Balance: ${_money(Api.balance)} Coins',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: 10),
                Text(
                  error!,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: AppColors.likeRed,
                  ),
                ),
              ],
              const SizedBox(height: 14),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: unlocking
                        ? null
                        : () => Navigator.pop(dialogContext, false),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(color: AppColors.textGray300),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: unlocking
                        ? null
                        : () async {
                            setState(() {
                              unlocking = true;
                              error = null;
                            });
                            final purchaseError =
                                await Api.purchaseUploadContent(
                                  item.id,
                                  resellerRef: item.resellerRef,
                                );
                            if (!dialogContext.mounted) return;
                            if (purchaseError == null) {
                              Navigator.pop(dialogContext, true);
                              return;
                            }
                            if (_isInsufficientUploadPurchaseError(
                              purchaseError,
                            )) {
                              Navigator.pop(dialogContext, false);
                              unawaited(
                                onInsufficientBalance?.call(item.coins) ??
                                    Future<void>.value(),
                              );
                              return;
                            }
                            setState(() {
                              unlocking = false;
                              error = purchaseError;
                            });
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    child: const Text('Confirm & Watch'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

/// Options menu for the ad-only second view (Share / Report).
void _openAdModalMenu(BuildContext context, HomeAd ad) {
  final mine =
      ad.ownerUserId.trim().isNotEmpty &&
      ad.ownerUserId.trim() == Api.currentUserId.trim();
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.bg1,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (menuContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          _SheetAction('Share Link', Ionicons.share_social_outline, () {
            Navigator.pop(menuContext);
            _openAdShareSheet(context, ad);
          }),
          if (!mine)
            _SheetAction('Report', Ionicons.alert_circle_outline, () {
              Navigator.pop(menuContext);
              _openReportSheet(
                context,
                title: 'Report Ad',
                reasons: _googReportReasons,
                submit: (reason, detail) =>
                    Api.reportAd(ad.adId, reason, detail),
              );
            }, danger: true),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

/// Adds a Product Promote ad to the bag. Prefers the real product record so
/// price, seller, shipping and discount are right; falls back to the ad's own
/// fields when the ad has no linked product.
Future<void> _addAdToBag(BuildContext context, HomeAd ad) async {
  Map<String, dynamic>? product;
  if (ad.linkedProductId > 0) {
    product = await Api.productById(ad.linkedProductId);
  }
  product ??= <String, dynamic>{
    'id': ad.linkedProductId > 0 ? ad.linkedProductId : ad.adId,
    'title': ad.title,
    'price': ad.price,
    'promo_price': ad.promoPrice,
    'image_url': ad.mediaPreview,
    'images': ad.mediaGallery,
    'user_id': ad.ownerUserId,
    if (ad.discount.isNotEmpty) 'commission_info': {'discount': ad.discount},
  };
  final result = await CartStore.addProduct(product);
  if (!context.mounted) return;
  _snack(
    context,
    result.ok
        ? 'Added to bag'
        : result.stockBlocked
        ? result.message
        : 'Could not add to bag',
  );
}

/// Product Promote second view. The web opens the *same*
/// ShopProductSecondViewModal it uses in the shop, so we reuse the shop's
/// quick-view here rather than a look-alike sheet — that's what makes the two
/// surfaces identical (media rail, colours, sizes, qty, delivery, warranty,
/// ships-to, add-to-bag, comments).
void _openProductPromoteSecondView(BuildContext context, HomeAd ad) {
  Api.markAdView(ad.interactionId);
  Api.markAdClick(ad.interactionId, 'visit');
  if (ad.linkedProductId > 0) {
    showShopProductQuickView(
      context,
      ad.linkedProductId,
      // Promote ads route into the bag — the footer is one ADD TO BAG button.
      promoteMode: true,
      // enables the Rupieer collect-coin button in the second view
      adId: ad.adId,
      adOwnerUserId: ad.ownerUserId,
      adCoinCollected: ad.coinCollected,
      // Shown if the product record can't be fetched, so the sheet still opens.
      fallback: <String, dynamic>{
        'id': ad.linkedProductId,
        'title': ad.title,
        'description': ad.description,
        'price': ad.price,
        'promo_price': ad.promoPrice,
        'image_url': ad.mediaPreview,
        'images': ad.mediaGallery,
        'username': ad.username,
        'profile_picture': ad.avatar,
        'user_id': ad.ownerUserId,
        'product_code': ad.linkedProductShareCode,
        'likes_count': ad.likes,
        'views_count': ad.views,
        'comments_count': ad.comments,
        'shares_count': ad.shares,
        'user_liked': ad.liked,
        if (ad.discount.isNotEmpty)
          'commission_info': {'discount': ad.discount},
      },
    );
    return;
  }
  // Ad has no linked product — fall back to the ad-only sheet.
  _openProductAdModal(context, ad);
}

void _openProductAdModal(BuildContext context, HomeAd ad) {
  Api.markAdView(ad.interactionId);
  var liked = ad.liked;
  var likes = ad.likes;
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (sheetContext) => StatefulBuilder(
      builder: (context, setState) => DraggableScrollableSheet(
        initialChildSize: 0.92,
        minChildSize: 0.55,
        maxChildSize: 0.96,
        builder: (_, controller) => Container(
          clipBehavior: Clip.antiAlias,
          decoration: const BoxDecoration(
            color: AppColors.bg0,
            borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
            border: Border(
              top: BorderSide(color: AppColors.borderWhite10),
              left: BorderSide(color: AppColors.borderWhite10),
              right: BorderSide(color: AppColors.borderWhite10),
            ),
          ),
          child: ListView(
            controller: controller,
            padding: EdgeInsets.zero,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(16, 14, 12, 12),
                decoration: const BoxDecoration(
                  color: Colors.black,
                  border: Border(
                    bottom: BorderSide(color: AppColors.borderWhite06),
                  ),
                ),
                child: Row(
                  children: [
                    _Avatar(
                      url: ad.avatar,
                      name: ad.fullName,
                      size: 38,
                      onTap: () => _openUserProfile(
                        context,
                        userId: ad.ownerUserId,
                        username: ad.username,
                        name: ad.fullName.isEmpty ? ad.username : ad.fullName,
                        avatar: ad.avatar,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () => _openUserProfile(
                              context,
                              userId: ad.ownerUserId,
                              username: ad.username,
                              name: ad.fullName.isEmpty
                                  ? ad.username
                                  : ad.fullName,
                              avatar: ad.avatar,
                            ),
                            child: Text(
                              ad.fullName.isEmpty ? ad.username : ad.fullName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'Ad',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: AppColors.textGray500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    SubscribeButton(
                      userId: ad.ownerUserId,
                      authorName: ad.fullName.isEmpty
                          ? ad.username
                          : ad.fullName,
                      compact: true,
                    ),
                    IconButton(
                      icon: const Icon(
                        Ionicons.close_outline,
                        size: 25,
                        color: Colors.white,
                      ),
                      onPressed: () => Navigator.pop(sheetContext),
                    ),
                    IconButton(
                      icon: const Icon(
                        Ionicons.ellipsis_vertical,
                        size: 21,
                        color: Colors.white,
                      ),
                      // Previously did nothing at all.
                      onPressed: () => _openAdModalMenu(sheetContext, ad),
                    ),
                  ],
                ),
              ),
              Stack(
                children: [
                  AspectRatio(
                    aspectRatio: 1.55,
                    child: Container(
                      color: Colors.black,
                      child: Image.network(
                        Api.resolveMedia(ad.mediaPreview),
                        fit: BoxFit.contain,
                        webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                        errorBuilder: (_, __, ___) => const _ViewerFallback(),
                      ),
                    ),
                  ),
                  if (ad.discount.isNotEmpty)
                    Positioned(
                      right: 78,
                      bottom: 18,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 17,
                          vertical: 16,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFF062F19),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF0B7A3B)),
                        ),
                        child: Text(
                          '+${ad.discount}%',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF22F06A),
                          ),
                        ),
                      ),
                    ),
                  Positioned(
                    right: 12,
                    top: 22,
                    bottom: 22,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        _ViewerRail(
                          icon: liked ? Ionicons.heart : Ionicons.heart_outline,
                          label: '$likes',
                          color: liked ? AppColors.likeRed : Colors.white,
                          onTap: () async {
                            setState(() {
                              liked = !liked;
                              likes += liked ? 1 : -1;
                            });
                            await Api.toggleAdLike(ad.interactionId);
                          },
                        ),
                        _ViewerRail(
                          icon: Ionicons.eye_outline,
                          label: '${ad.views}',
                          onTap: () {
                            Api.markAdView(ad.interactionId);
                            openInteractionsSheet(
                              context,
                              title: ad.title.isEmpty ? ad.username : ad.title,
                              subtitle: ad.campaignType,
                              initialKind: 'views',
                              counts: {
                                'likes': likes,
                                'comments': ad.comments,
                                'views': ad.views,
                                'shares': ad.shares,
                              },
                              fetch: (kind) =>
                                  Api.adInteractions(ad.interactionId, kind),
                              addComment: (text, {parentId}) =>
                                  Api.addAdComment(
                                    ad.interactionId,
                                    text,
                                    parentId: parentId,
                                  ),
                              reportComment: (id, reason) =>
                                  Api.reportProductComment(id, reason),
                              deleteComment: (id) =>
                                  Api.deleteProductComment(id),
                              likeComment: (id) => Api.likeProductComment(id),
                              dislikeComment: (id) =>
                                  Api.dislikeProductComment(id),
                            );
                          },
                        ),
                        _ViewerRail(
                          icon: Ionicons.chatbubble,
                          label: '${ad.comments}',
                          onTap: () => openInteractionsSheet(
                            context,
                            title: ad.title.isEmpty ? ad.username : ad.title,
                            subtitle: ad.campaignType,
                            initialKind: 'comments',
                            counts: {
                              'likes': likes,
                              'comments': ad.comments,
                              'views': ad.views,
                              'shares': ad.shares,
                            },
                            fetch: (kind) =>
                                Api.adInteractions(ad.interactionId, kind),
                            addComment: (text, {parentId}) => Api.addAdComment(
                              ad.interactionId,
                              text,
                              parentId: parentId,
                            ),
                            reportComment: (id, reason) =>
                                Api.reportProductComment(id, reason),
                            deleteComment: (id) => Api.deleteProductComment(id),
                            likeComment: (id) => Api.likeProductComment(id),
                            dislikeComment: (id) =>
                                Api.dislikeProductComment(id),
                          ),
                        ),
                        _ViewerRail(
                          icon: Ionicons.share_social_outline,
                          label: '',
                          onTap: () => _openAdShareSheet(context, ad),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 22, 16, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      ad.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      ad.description.isEmpty
                          ? 'GENERAL'
                          : ad.description.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 3,
                        color: Color(0xFF72809B),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Rupieer',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 2,
                        color: AppColors.textGray500,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 18,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.bg2,
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Text(
                            _money(ad.displayPrice),
                            style: const TextStyle(
                              fontSize: 30,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                          const Spacer(),
                          Container(
                            height: 44,
                            width: 124,
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.22),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: AppColors.borderWhite10,
                              ),
                            ),
                            child: const Row(
                              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                              children: [
                                Icon(
                                  Ionicons.remove,
                                  size: 16,
                                  color: Colors.white,
                                ),
                                Text(
                                  '1',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                                Icon(
                                  Ionicons.add,
                                  size: 16,
                                  color: AppColors.textGray500,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 22),
                    const Text(
                      'AVAILABLE COLORS',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 3,
                        color: Color(0xFF72809B),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: List.generate(
                        3,
                        (_) => Padding(
                          padding: const EdgeInsets.only(right: 18),
                          child: Column(
                            children: [
                              Container(
                                width: 48,
                                height: 48,
                                clipBehavior: Clip.antiAlias,
                                decoration: BoxDecoration(
                                  color: Colors.black,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(
                                    color: AppColors.borderWhite10,
                                  ),
                                ),
                                child: Image.network(
                                  Api.resolveMedia(ad.mediaPreview),
                                  fit: BoxFit.cover,
                                  webHtmlElementStrategy:
                                      WebHtmlElementStrategy.prefer,
                                  errorBuilder: (_, __, ___) =>
                                      const SizedBox.shrink(),
                                ),
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'NONE',
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF72809B),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 26),
                    Center(
                      child: TextButton(
                        onPressed: () => _addAdToBag(context, ad),
                        child: const Text(
                          'A D D   T O   B A G',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 5,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

void _openUserProfile(
  BuildContext context, {
  String userId = "",
  required String username,
  required String name,
  required String avatar,
}) {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => UserProfileScreen(
        userId: userId,
        username: username,
        displayName: name,
        avatar: avatar,
      ),
    ),
  );
}

Future<int?> _openUploadShareSheet(
  BuildContext context,
  UploadContent item,
) async {
  final code = _uploadShareCode(item);
  final url = 'https://googer.site/reel/$code';
  final isVault = uploadShareAndEarnAllowed(item);
  final commission = !isVault
      ? ''
      : _formatShareCommission(item.affiliateCommission);
  openShareSheet(
    context,
    title: item.topic.isEmpty ? 'Upload content' : item.topic,
    subtitle: item.topic,
    url: url,
    linkLabel: 'Reel Link',
    canEarn: isVault,
    earnTitle: 'Share & Earn',
    earnSubtitle: 'Create your personalized share link',
    commission: commission,
    earnUrlBuilder: (id) => '$url/${Uri.encodeComponent(id)}',
    earnKind: 'Generate Share',
  );
  final nextShares = await Api.shareUploadContent(item.id);
  return nextShares;
}

bool uploadShareAndEarnAllowed(UploadContent item) =>
    item.type.trim().toLowerCase() == 'vault';

String _formatShareCommission(double value) {
  if (!value.isFinite || value <= 0) return '';
  return value == value.roundToDouble()
      ? value.toInt().toString()
      : value
            .toStringAsFixed(2)
            .replaceFirst(RegExp(r'0+$'), '')
            .replaceFirst(RegExp(r'\.$'), '');
}

String uploadShareCommissionLabel(UploadContent item) {
  if (item.type.trim().toLowerCase() == 'flash') return '';
  final value = _formatShareCommission(item.affiliateCommission);
  return '${value.isEmpty ? '0' : value}%';
}

/// Goog share — registers the share on the backend (`POST /googs/{id}/share`,
/// same call the web makes) and opens the share sheet with the goog's link.
/// Previously the icon only fired the API call with no UI, so it looked dead.
Future<int?> _openGoogShareSheet(
  BuildContext context,
  GoogPost post, {
  int? currentCount,
}) async {
  final nextShares = await Api.shareGoog(
    post.id,
    currentCount: currentCount ?? post.shares,
  );
  if (!context.mounted) return nextShares;
  final stored = post.shareCode.trim();
  final code = Api.isCanonicalShareCode(stored)
      ? stored
      : Api.buildShareCode('g', post.id);
  openShareSheet(
    context,
    title: post.name.isEmpty ? post.username : post.name,
    subtitle: 'GOOG',
    url: 'https://googer.site/share/$code',
    linkLabel: 'Goog Link',
    canEarn: false,
    earnTitle: 'Share & Earn',
    earnSubtitle: 'Create your personalized share link',
    commission: '',
    earnUrlBuilder: (id) =>
        'https://googer.site/share/$code/${Uri.encodeComponent(id)}',
    earnKind: 'Generate Share',
  );
  return nextShares;
}

Future<int?> _openAdShareSheet(
  BuildContext context,
  HomeAd ad, {
  int? currentCount,
}) async {
  final nextShares = await Api.shareAd(
    ad.interactionId,
    currentCount: currentCount ?? ad.shares,
  );
  if (!context.mounted) return nextShares;
  final product = ad.isProductPromote;
  final code = product && ad.linkedProductShareCode.isNotEmpty
      ? ad.linkedProductShareCode
      : _adShareCode(ad);
  final url = product
      ? 'https://googer.site/product/$code'
      : 'https://googer.site/share/$code';
  final commission = product && ad.resellCommission.isNotEmpty
      ? '${ad.resellCommission}%'
      : '';
  openShareSheet(
    context,
    title: ad.title.isEmpty ? 'Sponsored post' : ad.title,
    subtitle: ad.campaignType,
    url: url,
    linkLabel: product ? 'Product Link' : 'Ad Link',
    canEarn: product,
    earnTitle: 'Share & Earn',
    earnSubtitle: 'Create your personalized resell link',
    commission: commission,
    earnUrlBuilder: (id) => '$url/${Uri.encodeComponent(id)}',
    earnKind: 'Generate Share',
  );
  return nextShares;
}

void openShareSheet(
  BuildContext context, {
  required String title,
  required String subtitle,
  required String url,
  required String linkLabel,
  required bool canEarn,
  required String earnTitle,
  required String earnSubtitle,
  required String commission,
  required String Function(String id) earnUrlBuilder,
  required String earnKind,
}) {
  final normalizedCommission = commission.trim().replaceFirst(
    RegExp(r'%$'),
    '',
  );
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ShareEarnSheet(
      title: title,
      subtitle: subtitle,
      url: url,
      linkLabel: linkLabel,
      canEarn: canEarn,
      earnTitle: earnTitle,
      earnSubtitle: earnSubtitle,
      commission: normalizedCommission,
      earnUrlBuilder: earnUrlBuilder,
      earnKind: earnKind,
    ),
  );
}

String _uploadShareCode(UploadContent item) {
  final stored = item.shareCode.trim();
  if (Api.isCanonicalShareCode(stored)) return stored;
  final contentId = item.contentId.trim();
  return Api.buildShareCode('u', contentId.isNotEmpty ? contentId : item.id);
}

String _adShareCode(HomeAd ad) {
  final stored = ad.shareCode.trim();
  if (Api.isCanonicalShareCode(stored)) return stored;
  return Api.buildShareCode('a', ad.adId);
}

void _snack(BuildContext context, String text) {
  // Feed actions intentionally stay silent to match the mobile web behavior.
}

Future<bool?> _confirmDelete(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      backgroundColor: AppColors.bg1,
      title: const Text(
        'Delete Goog',
        style: TextStyle(fontSize: 15, color: Colors.white),
      ),
      content: const Text(
        'This Goog will be removed permanently.',
        style: TextStyle(fontSize: 12.5, color: AppColors.textGray300),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text(
            'Delete',
            style: TextStyle(color: AppColors.likeRed),
          ),
        ),
      ],
    ),
  );
}

String _money(double value) {
  if (value == value.roundToDouble()) return value.toStringAsFixed(0);
  return value.toStringAsFixed(2);
}
