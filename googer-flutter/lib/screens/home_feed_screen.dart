import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme/colors.dart';
import '../util/open_link.dart';
import '../util/web_video.dart';
import '../widgets/googer_topbar.dart';
import '../widgets/googer_bottom_nav.dart';
import '../widgets/verified_badge.dart';
import 'shop_feed_screen.dart';
import 'wallet_screen.dart';
import 'chats_screen.dart';
import 'ad_campaign_screen.dart';
import 'photo_video_ad_screen.dart';
import 'product_promote_screen.dart';
import 'user_profile_screen.dart';

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

class HomeFeedScreen extends StatefulWidget {
  const HomeFeedScreen({super.key});

  @override
  State<HomeFeedScreen> createState() => _HomeFeedScreenState();
}

class _HomeFeedScreenState extends State<HomeFeedScreen> {
  int _selectedTab = 0;
  final ScrollController _homeScrollController = ScrollController();
  List<GoogPost> _posts = const [];
  List<UploadContent> _uploads = const [];
  List<HomeAd> _ads = const [];
  List<String> _categories = _homeGoogCategories;
  String _selectedCategory = "All";
  String _searchQuery = "";
  late final String _feedSeed = DateTime.now().millisecondsSinceEpoch
      .toString();
  bool _loading = true;
  String? _error;
  Timer? _refreshTimer;
  final Set<String> _hiddenAds = {};
  bool _showCategories = true;

  @override
  void initState() {
    super.initState();
    _homeScrollController.addListener(_handleHomeScroll);
    _loadFeed();
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _selectedTab == 0 ? _loadFeed(silent: true) : null,
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _homeScrollController.removeListener(_handleHomeScroll);
    _homeScrollController.dispose();
    super.dispose();
  }

  void _handleHomeScroll() {
    final shouldShow = _homeScrollController.hasClients
        ? _homeScrollController.offset < 24
        : true;
    if (shouldShow != _showCategories && mounted) {
      setState(() => _showCategories = shouldShow);
    }
  }

  Future<void> _loadFeed({bool silent = false}) async {
    if (!silent && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final result = await Future.wait([
        Api.feed(),
        Api.uploadContents(),
        Api.activeAds(shuffleSeed: DateTime.now().toIso8601String()),
      ]);
      if (!mounted) return;
      setState(() {
        _posts = result[0] as List<GoogPost>;
        _uploads = result[1] as List<UploadContent>;
        _ads = result[2] as List<HomeAd>;
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

  List<_FeedEntry> get _entries {
    final selected = _selectedCategory.toLowerCase();
    final query = _searchQuery.trim().toLowerCase();
    bool matchesSearch(String value) =>
        query.isEmpty || value.toLowerCase().contains(query);
    final filteredPosts = selected == "all" || selected == "subscriptions"
        ? _posts
        : _posts
              .where((post) => post.text.toLowerCase().contains(selected))
              .toList();
    final searchedPosts = filteredPosts
        .where(
          (post) => matchesSearch('${post.name} ${post.username} ${post.text}'),
        )
        .toList();
    final filteredUploads = selected == "all" || selected == "subscriptions"
        ? _uploads
        : _uploads
              .where(
                (item) =>
                    item.topic.toLowerCase().contains(selected) ||
                    item.description.toLowerCase().contains(selected) ||
                    item.hashtags.toLowerCase().contains(selected),
              )
              .toList();
    final searchedUploads = filteredUploads
        .where(
          (item) => matchesSearch(
            '${item.fullName} ${item.username} ${item.topic} ${item.description} ${item.hashtags}',
          ),
        )
        .toList();
    final entries = _stableShuffle(<_FeedEntry>[
      ...searchedPosts.map(_GoogEntry.new),
      ...searchedUploads.map(_UploadEntry.new),
    ], _feedSeed);

    final ads = _ads.where((ad) {
      if (_hiddenAds.contains(ad.adId)) return false;
      final categoryOk = selected == "all" || selected == "subscriptions"
          ? true
          : ad.title.toLowerCase().contains(selected) ||
                ad.description.toLowerCase().contains(selected) ||
                ad.campaignType.toLowerCase().contains(selected);
      if (!categoryOk) return false;
      return matchesSearch(
        '${ad.fullName} ${ad.username} ${ad.title} ${ad.description} ${ad.campaignType}',
      );
    }).toList();
    final mixed = <_FeedEntry>[];
    var adIndex = 0;
    for (var i = 0; i < entries.length; i++) {
      mixed.add(entries[i]);
      if (ads.isNotEmpty && (i == 0 || (i + 1) % 4 == 0)) {
        mixed.add(_AdEntry(ads[adIndex % ads.length], adIndex));
        adIndex += 1;
      }
    }
    if (mixed.isEmpty && ads.isNotEmpty) {
      for (var i = 0; i < ads.length; i++) {
        mixed.add(_AdEntry(ads[i], i));
      }
    }
    return mixed;
  }

  List<T> _stableShuffle<T extends _FeedEntry>(List<T> items, String seed) {
    final copy = [...items];
    copy.sort((a, b) {
      final ah = _stableHash('$seed:${a.sortKey}');
      final bh = _stableHash('$seed:${b.sortKey}');
      return ah.compareTo(bh);
    });
    return copy;
  }

  int _stableHash(String value) {
    var hash = 2166136261;
    for (final unit in value.codeUnits) {
      hash ^= unit;
      hash = (hash * 16777619) & 0x7fffffff;
    }
    return hash;
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
    return RefreshIndicator(
      color: AppColors.textGray300,
      backgroundColor: AppColors.bg1,
      onRefresh: _loadFeed,
      child: ListView.builder(
        controller: _homeScrollController,
        padding: const EdgeInsets.fromLTRB(0, 4, 0, 8),
        itemCount:
            entries.length +
            (_showCategories ? 1 : 0) +
            (_error != null || entries.isEmpty ? 1 : 0),
        itemBuilder: (context, i) {
          if (_showCategories && i == 0) {
            return _CategoryStrip(
              categories: _categories,
              selected: _selectedCategory,
              onSelected: (value) => setState(() => _selectedCategory = value),
            );
          }
          final baseIndex = i - (_showCategories ? 1 : 0);
          if (_error != null && baseIndex == 0) {
            return _FeedNotice(text: _error!, onTap: _loadFeed);
          }
          if (entries.isEmpty) {
            return const _EmptyFeed();
          }
          final entry = entries[baseIndex - (_error != null ? 1 : 0)];
          if (entry is _GoogEntry) {
            return _GoogCard(post: entry.post, onRefresh: _loadFeed);
          }
          if (entry is _UploadEntry) {
            return _UploadContentFeedCard(
              item: entry.item,
              onRefresh: _loadFeed,
            );
          }
          if (entry is _AdEntry) {
            return _HomeAdFeedCard(
              ad: entry.ad,
              onHide: () => setState(() => _hiddenAds.add(entry.ad.adId)),
              onRefresh: _loadFeed,
            );
          }
          return const SizedBox.shrink();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: GoogerTopbar(
        title: 'Googer',
        onSearchChanged: (value) => setState(() => _searchQuery = value),
      ),
      body: _buildScreen(_selectedTab),
      bottomNavigationBar: GoogerBottomNav(
        active: _getTabFromIndex(_selectedTab),
        onTap: (tab) => setState(() => _selectedTab = _getIndexFromTab(tab)),
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
        return const ShopFeedScreen();
      case 3:
        return const WalletScreen();
      case 4:
        return const ChatsScreen();
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
                  fontWeight: FontWeight.w900,
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
  _UploadEntry(this.item);
  @override
  String get sortKey =>
      'upload-${item.contentId.isEmpty ? item.id : item.contentId}-${item.repostedAt}-${item.repostedByName}';
}

class _AdEntry extends _FeedEntry {
  final HomeAd ad;
  final int slot;
  _AdEntry(this.ad, this.slot);
  @override
  String get sortKey => 'a-$slot-${ad.adId}';
}

class _GoogCard extends StatefulWidget {
  final GoogPost post;
  final Future<void> Function({bool silent}) onRefresh;
  const _GoogCard({required this.post, required this.onRefresh});

  @override
  State<_GoogCard> createState() => _GoogCardState();
}

class _GoogCardState extends State<_GoogCard> {
  late bool _liked = widget.post.liked;
  late int _likes = widget.post.likes;

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: () => _openGoogPopup(context, post),
      child: _FeedShell(
        child: Padding(
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
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _FeedHeader(
                      name: post.name.isEmpty ? post.username : post.name,
                      time: post.time,
                      badge: UserVerifiedBadge(userId: post.userId, size: 11),
                      onMore: () => _openPostMenu(context, post),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      post.text,
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 18 / 12.5,
                        fontWeight: FontWeight.w400,
                        color: post.textColor == null
                            ? AppColors.textGray200
                            : Color(post.textColor!),
                      ),
                    ),
                    const SizedBox(height: 9),
                    _ActionRow(
                      liked: _liked,
                      likes: _likes,
                      comments: post.comments,
                      views: post.views,
                      shares: post.shares,
                      onLike: () async {
                        setState(() {
                          _liked = !_liked;
                          _likes += _liked ? 1 : -1;
                        });
                        await Api.toggleGoogLike(post.id);
                      },
                      onComment: () => _openInteractionsSheet(
                        context,
                        title: post.name.isEmpty ? post.username : post.name,
                        subtitle: 'GOOG',
                        initialKind: 'comments',
                        counts: {
                          'likes': _likes,
                          'comments': post.comments,
                          'views': post.views,
                          'shares': post.shares,
                        },
                        fetch: (kind) => Api.googInteractions(post.id, kind),
                        addComment: (text) =>
                            Api.postGoogComment(post.id, text),
                      ),
                      onView: () {
                        Api.markGoogView(post.id);
                        _openInteractionsSheet(
                          context,
                          title: post.name.isEmpty ? post.username : post.name,
                          subtitle: 'GOOG',
                          initialKind: 'views',
                          counts: {
                            'likes': _likes,
                            'comments': post.comments,
                            'views': post.views,
                            'shares': post.shares,
                          },
                          fetch: (kind) => Api.googInteractions(post.id, kind),
                          addComment: (text) =>
                              Api.postGoogComment(post.id, text),
                        );
                      },
                      onShare: () async {
                        await Api.shareGoog(post.id);
                        if (!context.mounted) return;
                        _copy(
                          context,
                          'https://googer.site/share/${post.shareCode}',
                        );
                        await widget.onRefresh(silent: true);
                      },
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

  void _openPostMenu(BuildContext context, GoogPost post) {
    final mine = post.username.toLowerCase() == Api.username.toLowerCase();
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
              _SheetAction('Share', Ionicons.share_social_outline, () async {
                _copy(context, 'https://googer.site/share/${post.shareCode}');
                await Api.shareGoog(post.id);
              }),
              if (!mine)
                _SheetAction('Not Interested', Ionicons.eye_off_outline, () {
                  Navigator.pop(context);
                  widget.onRefresh(silent: true);
                }),
              if (mine)
                _SheetAction('Delete', Ionicons.trash_outline, () async {
                  Navigator.pop(context);
                  final ok = await _confirmDelete(context);
                  if (ok != true) return;
                  await Api.deleteGoog(post.id);
                  await widget.onRefresh();
                }, danger: true),
              if (!mine)
                _SheetAction('Report', Ionicons.alert_circle_outline, () async {
                  Navigator.pop(context);
                  await Api.reportGoog(post.id, 'Inappropriate content', '');
                }, danger: true),
            ],
          ),
        ),
      ),
    );
  }

  void _openGoogPopup(BuildContext context, GoogPost post) {
    Api.markGoogView(post.id);
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: AppColors.bg1,
        insetPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 24),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _Avatar(
                    url: post.img,
                    name: post.name,
                    size: 34,
                    onTap: () => _openUserProfile(
                      context,
                      userId: post.userId,
                      username: post.username,
                      name: post.name,
                      avatar: post.img,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          post.name.isEmpty ? post.username : post.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          '@${post.username} · ${post.time}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(
                      Ionicons.close_outline,
                      size: 20,
                      color: AppColors.textGray400,
                    ),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                post.text,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.45,
                  color: post.textColor == null
                      ? AppColors.textGray200
                      : Color(post.textColor!),
                ),
              ),
              const SizedBox(height: 14),
              _ActionRow(
                liked: _liked,
                likes: _likes,
                comments: post.comments,
                views: post.views,
                shares: post.shares,
                onLike: () async {
                  setState(() {
                    _liked = !_liked;
                    _likes += _liked ? 1 : -1;
                  });
                  await Api.toggleGoogLike(post.id);
                },
                onComment: () {
                  Navigator.pop(context);
                  _openInteractionsSheet(
                    context,
                    title: post.name,
                    subtitle: post.username,
                    initialKind: 'comments',
                    counts: {
                      'likes': _likes,
                      'comments': post.comments,
                      'views': post.views,
                      'shares': post.shares,
                    },
                    fetch: (kind) => Api.googInteractions(post.id, kind),
                    addComment: (text) => Api.postGoogComment(post.id, text),
                  );
                },
                onView: () {
                  Navigator.pop(context);
                  _openInteractionsSheet(
                    context,
                    title: post.name,
                    subtitle: post.username,
                    initialKind: 'views',
                    counts: {
                      'likes': _likes,
                      'comments': post.comments,
                      'views': post.views,
                      'shares': post.shares,
                    },
                    fetch: (kind) => Api.googInteractions(post.id, kind),
                    addComment: (text) => Api.postGoogComment(post.id, text),
                  );
                },
                onShare: () async {
                  await Api.shareGoog(post.id);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UploadContentFeedCard extends StatefulWidget {
  final UploadContent item;
  final Future<void> Function({bool silent}) onRefresh;
  const _UploadContentFeedCard({required this.item, required this.onRefresh});

  @override
  State<_UploadContentFeedCard> createState() => _UploadContentFeedCardState();
}

class _UploadContentFeedCardState extends State<_UploadContentFeedCard> {
  late bool _liked = widget.item.liked;
  late int _likes = widget.item.likes;
  late bool _inlinePlaying = false;
  bool _unlockingInline = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final title = item.description.trim().isEmpty
        ? item.topic
        : item.description;
    final locked = !item.hasAccess && item.coins > 0;
    final showBlur =
        locked || item.contentAccessMode.toLowerCase() == 'blurred';
    final repostLine = item.repostedByName.isNotEmpty
        ? 'Reposted by ${item.repostedByName} - ${item.repostedAt.isEmpty ? item.time : Api.relativeTime(item.repostedAt)}'
        : item.time;
    final suggested = item.showSuggested
        ? 'Suggested · ${item.suggestedTopic.isEmpty ? item.topic : item.suggestedTopic}'
        : '';
    return Padding(
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
                              child: Text(
                                item.fullName.isEmpty
                                    ? item.username
                                    : item.fullName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
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
                                  fontWeight: FontWeight.w700,
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
                                    fontWeight: FontWeight.w900,
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
                  _SubscribePill(onTap: () {}),
                  const SizedBox(width: 8),
                  GestureDetector(
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
                showBlur: showBlur,
                inlinePlaying: _inlinePlaying,
                unlocking: _unlockingInline,
                liked: _liked,
                likes: _likes,
                onLike: () async {
                  setState(() {
                    _liked = !_liked;
                    _likes += _liked ? 1 : -1;
                  });
                  await Api.likeUploadContent(item.id);
                },
                onView: () {
                  Api.markUploadView(item.id);
                  _openInteractionsSheet(
                    context,
                    title: item.topic,
                    subtitle: item.type.toUpperCase(),
                    initialKind: 'views',
                    counts: {
                      'likes': _likes,
                      'comments': item.comments,
                      'views': item.views,
                      'shares': item.shares,
                    },
                    fetch: (kind) => Api.uploadInteractions(item.id, kind),
                    addComment: item.allowComments
                        ? (text) => Api.addUploadComment(item.id, text)
                        : null,
                  );
                },
                onComment: () => _openInteractionsSheet(
                  context,
                  title: item.topic,
                  subtitle: item.type.toUpperCase(),
                  initialKind: 'comments',
                  counts: {
                    'likes': _likes,
                    'comments': item.comments,
                    'views': item.views,
                    'shares': item.shares,
                  },
                  fetch: (kind) => Api.uploadInteractions(item.id, kind),
                  addComment: item.allowComments
                      ? (text) => Api.addUploadComment(item.id, text)
                      : null,
                ),
                onShare: () async {
                  _openUploadShareSheet(context, item);
                  await widget.onRefresh(silent: true);
                },
                onRepost: () async {
                  final result = item.userReposted
                      ? await Api.removeUploadRepost(item.id)
                      : (await Api.repostUploadContent(item.id)).reposts;
                  if (result == null) return;
                  await widget.onRefresh(silent: true);
                },
                onWatch: _watchInline,
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
                      onTap: () async {
                        setState(() {
                          _liked = !_liked;
                          _likes += _liked ? 1 : -1;
                        });
                        await Api.likeUploadContent(item.id);
                      },
                    ),
                    _UploadRailIcon(
                      icon: Ionicons.repeat_outline,
                      label: '${item.reposts}',
                      color: item.userReposted
                          ? AppColors.successGreen
                          : Colors.white,
                      onTap: () async {
                        final result = item.userReposted
                            ? await Api.removeUploadRepost(item.id)
                            : (await Api.repostUploadContent(item.id)).reposts;
                        if (result == null) return;
                        await widget.onRefresh(silent: true);
                      },
                    ),
                    _UploadRailIcon(
                      icon: Ionicons.eye_outline,
                      label: '${item.views}',
                      onTap: () {
                        Api.markUploadView(item.id);
                        _openInteractionsSheet(
                          context,
                          title: item.topic,
                          subtitle: item.type.toUpperCase(),
                          initialKind: 'views',
                          counts: {
                            'likes': _likes,
                            'comments': item.comments,
                            'views': item.views,
                            'shares': item.shares,
                          },
                          fetch: (kind) =>
                              Api.uploadInteractions(item.id, kind),
                          addComment: item.allowComments
                              ? (text) => Api.addUploadComment(item.id, text)
                              : null,
                        );
                      },
                    ),
                    _UploadRailIcon(
                      icon: Ionicons.chatbubble_outline,
                      label: '${item.comments}',
                      color: Colors.white,
                      onTap: () => _openInteractionsSheet(
                        context,
                        title: item.topic,
                        subtitle: item.type.toUpperCase(),
                        initialKind: 'comments',
                        counts: {
                          'likes': _likes,
                          'comments': item.comments,
                          'views': item.views,
                          'shares': item.shares,
                        },
                        fetch: (kind) => Api.uploadInteractions(item.id, kind),
                        addComment: item.allowComments
                            ? (text) => Api.addUploadComment(item.id, text)
                            : null,
                      ),
                    ),
                    _UploadRailIcon(
                      icon: Ionicons.share_social_outline,
                      label: item.type.toLowerCase() == 'flash' ? '' : '10%',
                      onTap: () async {
                        _openUploadShareSheet(context, item);
                        await widget.onRefresh(silent: true);
                      },
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _watchInline() async {
    if (_inlinePlaying || _unlockingInline) return;
    final item = widget.item;
    if (!item.hasAccess && item.coins > 0) {
      setState(() => _unlockingInline = true);
      final error = await Api.purchaseUploadContent(
        item.id,
        resellerRef: item.resellerRef,
      );
      if (!mounted) return;
      if (error != null) {
        setState(() => _unlockingInline = false);
        return;
      }
    }
    Api.markUploadView(item.id);
    if (mounted) {
      setState(() {
        _unlockingInline = false;
        _inlinePlaying = true;
      });
    }
  }

  void _openUploadMenu(BuildContext context, UploadContent item) {
    final mine = item.username.toLowerCase() == Api.username.toLowerCase();
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
                  _openInteractionsSheet(
                    context,
                    title: item.topic,
                    subtitle: item.type.toUpperCase(),
                    initialKind: 'views',
                    counts: {
                      'likes': _likes,
                      'comments': item.comments,
                      'views': item.views,
                      'shares': item.shares,
                    },
                    fetch: (kind) => Api.uploadInteractions(item.id, kind),
                    addComment: null,
                  );
                }),
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
                widget.onRefresh(silent: true);
              }),
              if (!mine)
                _SheetAction('Report', Ionicons.flag_outline, () async {
                  Navigator.pop(context);
                  await Api.reportUploadContent(
                    item.id,
                    'Inappropriate content',
                  );
                }, danger: true),
            ],
          ),
        ),
      ),
    );
  }
}

class _UploadMediaFrame extends StatelessWidget {
  final UploadContent item;
  final String title;
  final bool showBlur;
  final bool inlinePlaying;
  final bool unlocking;
  final bool liked;
  final int likes;
  final VoidCallback onLike;
  final VoidCallback onView;
  final VoidCallback? onComment;
  final VoidCallback onShare;
  final VoidCallback onRepost;
  final VoidCallback onWatch;
  const _UploadMediaFrame({
    required this.item,
    required this.title,
    required this.showBlur,
    required this.inlinePlaying,
    required this.unlocking,
    required this.liked,
    required this.likes,
    required this.onLike,
    required this.onView,
    required this.onComment,
    required this.onShare,
    required this.onRepost,
    required this.onWatch,
  });

  @override
  Widget build(BuildContext context) {
    final media = _uploadMedia(item);
    final image = media.isNotEmpty
        ? media.first
        : (item.thumbnail.isNotEmpty ? item.thumbnail : item.mediaUrl);
    final hashtags = item.hashtags.trim();
    return AspectRatio(
      aspectRatio: inlinePlaying ? 0.86 : 1.04,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Container(
          color: AppColors.bg0,
          child: Stack(
            children: [
              Positioned.fill(
                child: inlinePlaying
                    ? _InlineUploadPlayer(item: item, media: media)
                    : image.isNotEmpty
                    ? ImageFiltered(
                        imageFilter: showBlur
                            ? ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18)
                            : ui.ImageFilter.blur(sigmaX: 0, sigmaY: 0),
                        child: Image.network(
                          Api.resolveMedia(image),
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const ColoredBox(color: AppColors.bg0),
                        ),
                      )
                    : const ColoredBox(color: AppColors.bg0),
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
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.6,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              if (!inlinePlaying)
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
                                const Icon(
                                  Ionicons.play,
                                  size: 12,
                                  color: Colors.white,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  unlocking ? 'UNLOCKING' : 'WATCH NOW',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.8,
                                    color: Colors.white,
                                  ),
                                ),
                                if (!item.hasAccess && item.coins > 0) ...[
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
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.textGray300,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                        if (!item.hasAccess && item.coins > 0) ...[
                          const SizedBox(height: 12),
                          GestureDetector(
                            onTap: onWatch,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 17,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(
                                  0xFF0E3F35,
                                ).withOpacity(0.92),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: const Color(
                                    0xFF52D6B2,
                                  ).withOpacity(0.25),
                                ),
                              ),
                              child: const Text(
                                'WATCH ALL CONTENT',
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.8,
                                  color: Color(0xFFB5F6E6),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              if (inlinePlaying)
                Positioned(
                  right: 10,
                  bottom: 42,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _InlineRailIcon(
                        icon: Ionicons.share_social_outline,
                        label: item.type.toLowerCase() == 'flash' ? '' : '10%',
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
                        label: '${item.views}',
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
                            fontWeight: FontWeight.w900,
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
                            fontWeight: FontWeight.w900,
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
    final values = <String>[
      ...item.mediaGallery,
      item.mediaUrl,
      item.thumbnail,
    ];
    final out = <String>[];
    for (final value in values) {
      final trimmed = value.trim();
      if (trimmed.isNotEmpty && !out.contains(trimmed)) out.add(trimmed);
    }
    return out;
  }
}

class _InlineUploadPlayer extends StatelessWidget {
  final UploadContent item;
  final List<String> media;
  const _InlineUploadPlayer({required this.item, required this.media});

  @override
  Widget build(BuildContext context) {
    if (item.externalLink.isNotEmpty) {
      return webEmbed(item.externalLink);
    }
    final items = media.isEmpty
        ? <String>[item.mediaUrl, item.thumbnail]
        : media;
    final clean = items.where((e) => e.trim().isNotEmpty).toList();
    if (clean.isEmpty) return const ColoredBox(color: AppColors.bg0);
    return PageView.builder(
      itemCount: clean.length,
      itemBuilder: (_, index) {
        final url = Api.resolveMedia(clean[index]);
        final isVideo =
            item.mediaType.toLowerCase().contains('video') ||
            url.toLowerCase().contains('.mp4') ||
            url.toLowerCase().contains('.mov') ||
            url.toLowerCase().contains('.webm');
        return isVideo
            ? webVideo(url, poster: item.thumbnail)
            : Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) =>
                    const ColoredBox(color: AppColors.bg0),
              );
      },
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
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: filled
                  ? Colors.white.withOpacity(0.24)
                  : Colors.black.withOpacity(0.48),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withOpacity(0.18)),
            ),
            child: Icon(icon, size: 21, color: color),
          ),
          if (label.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w900,
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
                fontWeight: FontWeight.w900,
                color: color,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SubscribePill extends StatelessWidget {
  final VoidCallback onTap;
  const _SubscribePill({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.likeRed.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.likeRed.withValues(alpha: 0.45)),
        ),
        child: const Text(
          'Subscribe',
          style: TextStyle(
            fontSize: 8.5,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.8,
            color: AppColors.likeRed,
          ),
        ),
      ),
    );
  }
}

class _HomeAdFeedCard extends StatefulWidget {
  final HomeAd ad;
  final VoidCallback onHide;
  final Future<void> Function({bool silent}) onRefresh;
  const _HomeAdFeedCard({
    required this.ad,
    required this.onHide,
    required this.onRefresh,
  });

  @override
  State<_HomeAdFeedCard> createState() => _HomeAdFeedCardState();
}

class _HomeAdFeedCardState extends State<_HomeAdFeedCard> {
  late bool _liked = widget.ad.liked;
  late int _likes = widget.ad.likes;

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    if (ad.isProfilePromote) return _profilePromote(context, ad);
    if (ad.isProductPromote) return _productPromote(context, ad);
    return _mediaAd(context, ad);
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
          if (ad.title.isNotEmpty) ...[
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                ad.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.25,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                ),
              ),
            ),
          ],
          if (ad.description.isNotEmpty) ...[
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                ad.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11.5,
                  height: 1.35,
                  color: AppColors.textGray400,
                ),
              ),
            ),
          ],
          const SizedBox(height: 10),
          _adActions(ad),
        ],
      ),
    );
  }

  Widget _profilePromote(BuildContext context, HomeAd ad) {
    final items = ad.featuredItems.take(3).toList();
    return _AdFeedShell(
      ad: ad,
      onMore: () => _openAdMenu(context, ad),
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
              onTap: () => _snack(context, '@${ad.username}'),
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
                onTap: () => _openProductAdModal(context, ad),
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
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF22F06A),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              ad.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                height: 1.25,
                fontWeight: FontWeight.w900,
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
                    fontWeight: FontWeight.w900,
                    color: AppColors.textGray500,
                  ),
                ),
                Text(
                  _money(ad.displayPrice),
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
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
                  onTap: () => _snack(context, 'Added to cart'),
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 1, 12, 9),
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
            label: '${ad.views}',
            onTap: () {
              Api.markAdView(ad.interactionId);
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
            label: '',
            onTap: () async {
              _openAdShareSheet(context, ad);
              await widget.onRefresh(silent: true);
            },
          ),
        ],
      ),
    );
  }

  void _openAdMenu(BuildContext context, HomeAd ad) {
    final mine =
        ad.ownerUserId.isNotEmpty && ad.ownerUserId == Api.googerId ||
        ad.username.toLowerCase() == Api.username.toLowerCase();
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
              _SheetAction('Not Interested', Ionicons.eye_off_outline, () {
                Navigator.pop(context);
                widget.onHide();
              }),
              _SheetAction('Share Link', Ionicons.share_social_outline, () {
                Navigator.pop(context);
                _openAdShareSheet(context, ad);
              }),
              if (ad.isProductPromote ||
                  ad.campaignType.toLowerCase().contains('product'))
                _SheetAction('Promote', Ionicons.megaphone_outline, () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const ProductPromoteScreen(),
                    ),
                  );
                })
              else
                _SheetAction('Promote', Ionicons.megaphone_outline, () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const PhotoVideoAdScreen(),
                    ),
                  );
                }),
              if (!mine)
                _SheetAction('Report', Ionicons.alert_circle_outline, () async {
                  Navigator.pop(context);
                  await Api.reportAd(ad.adId, 'Inappropriate ad');
                }, danger: true),
              if (ad.activeLink.isNotEmpty)
                _SheetAction('Open link', Ionicons.open_outline, () {
                  Navigator.pop(context);
                  openExternalLink(ad.activeLink);
                }),
            ],
          ),
        ),
      ),
    );
  }

  void _openAdInteractions(BuildContext context, HomeAd ad, String kind) {
    _openInteractionsSheet(
      context,
      title: ad.title.isEmpty ? ad.username : ad.title,
      subtitle: ad.campaignType,
      initialKind: kind,
      counts: {
        'likes': _likes,
        'comments': ad.comments,
        'views': ad.views,
        'shares': ad.shares,
      },
      fetch: (value) => Api.adInteractions(ad.interactionId, value),
      addComment: (text) => Api.addAdComment(ad.interactionId, text),
    );
  }
}

class _AdFeedShell extends StatelessWidget {
  final HomeAd ad;
  final Widget child;
  final VoidCallback onMore;
  const _AdFeedShell({
    required this.ad,
    required this.child,
    required this.onMore,
  });

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
                              child: Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            UserVerifiedBadge(
                              userId: ad.ownerUserId,
                              size: 11,
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Ad',
                          style: TextStyle(
                            fontSize: 8.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.8,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  _SubscribePill(onTap: () {}),
                  const SizedBox(width: 7),
                  GestureDetector(
                    onTap: onMore,
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
    return AspectRatio(
      aspectRatio: 1.02,
      child: GestureDetector(
        onTap: onTap,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Container(
            color: AppColors.bg0,
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
                          fontWeight: FontWeight.w900,
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
  const _FeedHeader({
    required this.name,
    required this.time,
    required this.onMore,
    this.badge,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Row(
            children: [
              Flexible(
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
              const SizedBox(width: 6),
              if (badge != null) ...[
                badge!,
                const SizedBox(width: 6),
              ],
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
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(width: 8),
        ] else ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.purpleBg10,
              borderRadius: BorderRadius.circular(9999),
              border: Border.all(
                color: AppColors.accentPurple.withOpacity(0.3),
              ),
            ),
            child: const Text(
              'Subscribe',
              style: TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w600,
                color: AppColors.purpleText,
              ),
            ),
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
    final resolved = Api.resolveMedia(url);
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
        child: resolved.isNotEmpty
            ? Image.network(
                resolved,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _Initial(name: name),
              )
            : _Initial(name: name),
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
  late final TextEditingController _id = TextEditingController(
    text: Api.googerId.isNotEmpty
        ? Api.googerId
        : Api.currentUserId.isNotEmpty
        ? Api.currentUserId
        : Api.username,
  );

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
            maxHeight: MediaQuery.of(context).size.height * 0.88,
          ),
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
          decoration: BoxDecoration(
            color: const Color(0xFF0F0F0F),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: SingleChildScrollView(
            child: _earnView ? _earnBody(context) : _shareBody(context),
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
            if (_earnView)
              IconButton(
                onPressed: () => setState(() => _earnView = false),
                icon: const Icon(Ionicons.arrow_back, color: Colors.white),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textGray600,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: () => Navigator.pop(context),
              icon: const Icon(Ionicons.close, color: Colors.white, size: 24),
              style: IconButton.styleFrom(
                backgroundColor: Colors.white.withOpacity(0.07),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        const Divider(height: 1, color: AppColors.borderWhite10),
      ],
    );
  }

  Widget _shareBody(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(context, 'Share', widget.subtitle),
        const SizedBox(height: 22),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 18,
          crossAxisSpacing: 18,
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
              () => Clipboard.setData(ClipboardData(text: widget.url)),
            ),
            _ShareTarget(
              'X',
              Ionicons.logo_twitter,
              Colors.black,
              () => openExternalLink(
                'https://twitter.com/intent/tweet?url=${Uri.encodeComponent(widget.url)}&text=${Uri.encodeComponent(widget.title)}',
              ),
            ),
            _ShareTarget(
              'Telegram',
              Ionicons.send,
              const Color(0xFF27A7E5),
              () => openExternalLink(
                'https://t.me/share/url?url=${Uri.encodeComponent(widget.url)}&text=${Uri.encodeComponent(widget.title)}',
              ),
            ),
            _ShareTarget(
              'Copy Link',
              Ionicons.link,
              const Color(0xFF2A2A2A),
              () => Clipboard.setData(ClipboardData(text: widget.url)),
            ),
          ],
        ),
        const SizedBox(height: 24),
        _linkBox(widget.linkLabel, widget.url),
        if (widget.canEarn) ...[
          const SizedBox(height: 18),
          GestureDetector(
            onTap: () => setState(() => _earnView = true),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF21170A),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0x66F59E0B)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      color: const Color(0xFF5A3805),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Ionicons.layers_outline,
                      color: Color(0xFFFBBF24),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.earnTitle,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          widget.earnSubtitle,
                          style: const TextStyle(
                            color: Color(0xFFD69A00),
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Ionicons.chevron_forward, color: Colors.white),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _earnBody(BuildContext context) {
    final pct = widget.commission.isEmpty ? '10' : widget.commission;
    final isProduct = widget.linkLabel.toLowerCase().contains('product');
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
        const SizedBox(height: 22),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: const Color(0xFF201608),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0x66F59E0B)),
          ),
          child: Row(
            children: [
              Container(
                width: 66,
                height: 66,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFF5A3805),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Text(
                  '$pct%',
                  style: const TextStyle(
                    color: Color(0xFFFBBF24),
                    fontSize: 23,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  isProduct
                      ? '$pct% per sale\nCredited on order completion.'
                      : '$pct% per eligible watch\nCredited after eligible watch.',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    height: 1.45,
                  ),
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
            fontWeight: FontWeight.w900,
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
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w900,
          ),
          decoration: InputDecoration(
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
                fontWeight: FontWeight.w800,
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
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
            ),
            child: Text(
              widget.earnKind,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ),
        if (_generated.isNotEmpty) ...[
          const SizedBox(height: 18),
          _linkBox('YOUR SHARE LINK', _generated),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
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
                Ionicons.send,
                const Color(0xFF27A7E5),
                () => openExternalLink(
                  'https://t.me/share/url?url=${Uri.encodeComponent(_generated)}&text=${Uri.encodeComponent(widget.title)}',
                ),
              ),
              _ShareTarget(
                'Copy',
                Ionicons.link,
                const Color(0xFF2A2A2A),
                () => Clipboard.setData(ClipboardData(text: _generated)),
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
            fontWeight: FontWeight.w900,
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
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              _SmallButton(
                label: 'Copy',
                onTap: () => Clipboard.setData(ClipboardData(text: url)),
              ),
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
  const _ShareTarget(this.label, this.icon, this.color, this.onTap);

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
            child: Icon(icon, color: Colors.white, size: 28),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.textGray500,
              fontSize: 10,
              fontWeight: FontWeight.w800,
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
                fontWeight: FontWeight.w800,
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
                      fontWeight: FontWeight.w700,
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
            fontWeight: FontWeight.w700,
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
  final VoidCallback? onLike;
  final VoidCallback? onComment;
  final VoidCallback? onView;
  final VoidCallback? onShare;
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
    this.onLike,
    this.onComment,
    this.onView,
    this.onShare,
  });

  @override
  State<_MediaViewer> createState() => _MediaViewerState();
}

class _MediaViewerState extends State<_MediaViewer> {
  late bool _liked = false;
  late int _likes = widget.likes;

  @override
  Widget build(BuildContext context) {
    final isVideo =
        widget.mediaType.toLowerCase().contains('video') ||
        widget.mediaUrl.toLowerCase().contains('.mp4') ||
        widget.mediaUrl.toLowerCase().contains('.mov');
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: widget.externalLink.isNotEmpty
                ? webEmbed(widget.externalLink)
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
                      IconButton(
                        icon: const Icon(
                          Ionicons.arrow_back_outline,
                          size: 22,
                          color: Colors.white,
                        ),
                        onPressed: () => Navigator.maybePop(context),
                      ),
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
                                  fontWeight: FontWeight.w800,
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
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white.withOpacity(0.55),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  right: 10,
                  bottom: 92,
                  child: Column(
                    children: [
                      _ViewerRail(
                        icon: _liked ? Ionicons.heart : Ionicons.heart_outline,
                        label: '$_likes',
                        color: _liked ? AppColors.likeRed : Colors.white,
                        onTap: () {
                          setState(() {
                            _liked = !_liked;
                            _likes += _liked ? 1 : -1;
                          });
                          widget.onLike?.call();
                        },
                      ),
                      const SizedBox(height: 14),
                      _ViewerRail(
                        icon: Ionicons.chatbubble_outline,
                        label: '${widget.comments}',
                        onTap: widget.onComment,
                      ),
                      const SizedBox(height: 14),
                      _ViewerRail(
                        icon: Ionicons.eye_outline,
                        label: '${widget.views}',
                        onTap: widget.onView,
                      ),
                      const SizedBox(height: 14),
                      _ViewerRail(
                        icon: Ionicons.share_social_outline,
                        label: '${widget.shares}',
                        onTap: widget.onShare,
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
                      fontWeight: FontWeight.w700,
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
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}

void _openInteractionsSheet(
  BuildContext context, {
  required String title,
  required String subtitle,
  required String initialKind,
  required Map<String, int> counts,
  required Future<List<Map<String, dynamic>>> Function(String kind) fetch,
  Future<bool> Function(String text)? addComment,
}) {
  final controller = TextEditingController();
  var kind = initialKind;
  var commentFilter = 'all';
  var loadingPost = false;
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
          final ok = await addComment(text);
          if (!context.mounted) return;
          setState(() {
            loadingPost = false;
            if (ok) {
              controller.clear();
              future = fetch('comments');
            }
          });
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
                                        fontWeight: FontWeight.w900,
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
                                : 'WHO ${kind == 'views' ? 'VIEWED' : kind == 'likes' ? 'LIKED THIS' : 'SHARED'}',
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w900,
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
                              fontWeight: FontWeight.w900,
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
                        final rawRows = snap.data ?? const <Map<String, dynamic>>[];
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
                            rows.sort((a, b) => likesOf(b).compareTo(likesOf(a)));
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
                                padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
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
                                                color: commentFilter == filter.$1
                                                    ? Colors.white
                                                    : Colors.transparent,
                                                borderRadius:
                                                    BorderRadius.circular(11),
                                              ),
                                              child: Text(
                                                filter.$2,
                                                style: TextStyle(
                                                  fontSize: 9,
                                                  fontWeight: FontWeight.w900,
                                                  color:
                                                      commentFilter == filter.$1
                                                          ? Colors.black
                                                          : AppColors
                                                              .textGray500,
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
                              child: ListView.separated(
                                padding:
                                    const EdgeInsets.fromLTRB(14, 0, 14, 12),
                                itemCount: rows.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (_, i) =>
                                    _InteractionRow(row: rows[i], kind: kind),
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
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            )
                          else ...[
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
                                        borderRadius:
                                            BorderRadius.circular(999),
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

class _InteractionRow extends StatelessWidget {
  final Map<String, dynamic> row;
  final String kind;
  const _InteractionRow({required this.row, required this.kind});

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
    final likes =
        int.tryParse('${row['likes'] ?? row['likes_count'] ?? row['upvotes'] ?? 0}') ??
        0;
    final dislikes =
        int.tryParse(
          '${row['dislikes'] ?? row['dislikes_count'] ?? row['downvotes'] ?? 0}',
        ) ??
        0;
    if (kind == 'comments') {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Avatar(url: avatar, name: name, size: 34),
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
                            child: Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          if (time.isNotEmpty)
                            Text(
                              _shortTime(time),
                              style: const TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w900,
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
                    _CommentMiniAction(
                      icon: Ionicons.thumbs_up_outline,
                      label: likes > 0 ? '$likes' : '',
                    ),
                    const SizedBox(width: 8),
                    _CommentMiniAction(
                      icon: Ionicons.thumbs_down_outline,
                      label: dislikes > 0 ? '$dislikes' : '',
                    ),
                    const SizedBox(width: 8),
                    const _CommentMiniAction(
                      icon: Ionicons.flag_outline,
                      label: '',
                    ),
                    const SizedBox(width: 14),
                    const Text(
                      'REPLY',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.2,
                        color: Color(0xFF8C9AB6),
                      ),
                    ),
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
          _Avatar(url: avatar, name: name, size: 34),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
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
                fontWeight: FontWeight.w900,
                color: Color(0xFF72809B),
              ),
            ),
        ],
      ),
    );
  }

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
    final user = row['user'];
    if (user is Map) {
      return (user['avatar'] ??
              user['profile_picture'] ??
              user['profilePicture'] ??
              user['profile_image'] ??
              user['profileImage'] ??
              user['image'] ??
              '')
          .toString();
    }
    return (row['avatar'] ??
            row['profile_picture'] ??
            row['profilePicture'] ??
            row['profile_image'] ??
            row['profileImage'] ??
            row['owner_profile_picture'] ??
            row['ownerProfilePicture'] ??
            row['image'] ??
            '')
        .toString();
  }

  static String _shortTime(String value) {
    if (value.length >= 10 && value.contains('-'))
      return value.substring(5, 10);
    return value.replaceAll('T', ' ').split('.').first;
  }
}

class _CommentMiniAction extends StatelessWidget {
  final IconData icon;
  final String label;
  const _CommentMiniAction({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: AppColors.textGray400),
        if (label.isNotEmpty) ...[
          const SizedBox(width: 3),
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: AppColors.textGray400,
            ),
          ),
        ],
      ],
    );
  }
}

Future<void> _openViewer(BuildContext context, UploadContent item) async {
  if (!item.hasAccess && item.coins > 0) {
    final unlocked = await _confirmUnlock(context, item);
    if (unlocked != true || !context.mounted) return;
  }
  Api.markUploadView(item.id);
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => _MediaViewer(
        title: item.description.isEmpty ? item.topic : item.description,
        mediaUrl: Api.resolveMedia(item.mediaUrl),
        poster: Api.resolveMedia(item.thumbnail),
        mediaType: item.mediaType,
        externalLink: item.externalLink,
        owner: item.fullName.isEmpty ? '@${item.username}' : item.fullName,
        typeLabel: item.type.toUpperCase(),
        likes: item.likes,
        comments: item.comments,
        views: item.views,
        shares: item.shares,
        onLike: () async {
          await Api.likeUploadContent(item.id);
        },
        onComment: () => _openInteractionsSheet(
          context,
          title: item.topic,
          subtitle: item.type.toUpperCase(),
          initialKind: 'comments',
          counts: {
            'likes': item.likes,
            'comments': item.comments,
            'views': item.views,
            'shares': item.shares,
          },
          fetch: (kind) => Api.uploadInteractions(item.id, kind),
          addComment: item.allowComments
              ? (text) => Api.addUploadComment(item.id, text)
              : null,
        ),
        onView: () {
          Api.markUploadView(item.id);
          _openInteractionsSheet(
            context,
            title: item.topic,
            subtitle: item.type.toUpperCase(),
            initialKind: 'views',
            counts: {
              'likes': item.likes,
              'comments': item.comments,
              'views': item.views,
              'shares': item.shares,
            },
            fetch: (kind) => Api.uploadInteractions(item.id, kind),
            addComment: item.allowComments
                ? (text) => Api.addUploadComment(item.id, text)
                : null,
          );
        },
        onShare: () => _openUploadShareSheet(context, item),
      ),
    ),
  );
}

void _openAdViewer(BuildContext context, HomeAd ad) {
  Api.markAdView(ad.interactionId);
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => _MediaViewer(
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
        onComment: () => _openInteractionsSheet(
          context,
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
          addComment: (text) => Api.addAdComment(ad.interactionId, text),
        ),
        onView: () {
          Api.markAdView(ad.interactionId);
          _openInteractionsSheet(
            context,
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
            addComment: (text) => Api.addAdComment(ad.interactionId, text),
          );
        },
        onShare: () => _openAdShareSheet(context, ad),
      ),
    ),
  );
}

Future<bool?> _confirmUnlock(BuildContext context, UploadContent item) {
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
                        fontWeight: FontWeight.w800,
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
                        fontWeight: FontWeight.w800,
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
                    fontWeight: FontWeight.w700,
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
                    child: Text(unlocking ? 'Unlocking...' : 'Confirm & Watch'),
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
                    _Avatar(url: ad.avatar, name: ad.fullName, size: 38),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ad.fullName.isEmpty ? ad.username : ad.fullName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'Ad',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textGray500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _SubscribePill(onTap: () {}),
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
                      onPressed: () {},
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
                            fontWeight: FontWeight.w900,
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
                            _openInteractionsSheet(
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
                              addComment: (text) =>
                                  Api.addAdComment(ad.interactionId, text),
                            );
                          },
                        ),
                        _ViewerRail(
                          icon: Ionicons.chatbubble,
                          label: '${ad.comments}',
                          onTap: () => _openInteractionsSheet(
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
                            addComment: (text) =>
                                Api.addAdComment(ad.interactionId, text),
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
                        fontWeight: FontWeight.w900,
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
                        fontWeight: FontWeight.w900,
                        letterSpacing: 3,
                        color: Color(0xFF72809B),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Rupieer',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
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
                              fontWeight: FontWeight.w900,
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
                                    fontWeight: FontWeight.w900,
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
                        fontWeight: FontWeight.w900,
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
                                  errorBuilder: (_, __, ___) =>
                                      const SizedBox.shrink(),
                                ),
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'NONE',
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w900,
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
                        onPressed: () => _snack(context, 'Added to bag'),
                        child: const Text(
                          'A D D   T O   B A G',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w900,
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

void _copy(BuildContext context, String value) {
  Clipboard.setData(ClipboardData(text: value));
  Navigator.maybePop(context);
  _snack(context, 'Copied');
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

void _openUploadShareSheet(BuildContext context, UploadContent item) {
  Api.shareUploadContent(item.id);
  final code = _uploadShareCode(item);
  final url = 'https://googer.site/reel/$code';
  final commission = item.type.toLowerCase() == 'flash' ? '' : '10';
  _openShareSheet(
    context,
    title: item.topic.isEmpty ? 'Upload content' : item.topic,
    subtitle: item.topic,
    url: url,
    linkLabel: 'Reel Link',
    canEarn: commission.isNotEmpty,
    earnTitle: 'Share & Earn',
    earnSubtitle: 'Create your personalized share link',
    commission: commission,
    earnUrlBuilder: (id) => '$url/${Uri.encodeComponent(id)}',
    earnKind: 'Generate Share',
  );
}

void _openAdShareSheet(BuildContext context, HomeAd ad) {
  Api.shareAd(ad.interactionId);
  final product = ad.isProductPromote;
  final code = product && ad.linkedProductShareCode.isNotEmpty
      ? ad.linkedProductShareCode
      : _adShareCode(ad);
  final url = product
      ? 'https://googer.site/product/$code'
      : 'https://googer.site/share/$code';
  final commission = product && ad.discount.isNotEmpty ? ad.discount : '';
  _openShareSheet(
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
}

void _openShareSheet(
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
      commission: commission,
      earnUrlBuilder: earnUrlBuilder,
      earnKind: earnKind,
    ),
  );
}

String _uploadShareCode(UploadContent item) {
  final stored = item.contentId.trim();
  if (RegExp(r'^[0-9A-Za-z]{8}$').hasMatch(stored)) return stored;
  return _toShareCode('u', stored.isNotEmpty ? stored : '${item.id}');
}

String _adShareCode(HomeAd ad) => _toShareCode('a', ad.adId);

String _toShareCode(String type, String target, [int length = 8]) {
  const alphabet =
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  final normalized = target.trim();
  if (normalized.isEmpty) return '';
  final payload = '$type:$normalized';
  var stateA = _hash32(payload, 0x9e3779b9);
  var stateB = _hash32(payload, 0x85ebca6b);
  final chars = <String>[];
  for (var i = 0; i < length; i++) {
    stateA =
        ((_imul(stateA ^ (stateA >> 15), 2246822519) + stateB + i) &
        0xffffffff);
    stateB =
        ((_imul(stateB ^ (stateB >> 13), 3266489917) + stateA + i * 17) &
        0xffffffff);
    chars.add(alphabet[(stateA ^ stateB) % alphabet.length]);
  }
  if (!chars.any(digits.contains)) {
    chars[(stateA + 1) % length] = digits[stateB % digits.length];
  }
  if (!chars.any(uppers.contains)) {
    chars[(stateB + 3) % length] = uppers[stateA % uppers.length];
  }
  if (!chars.any(lowers.contains)) {
    chars[(stateA + stateB + 5) % length] =
        lowers[(stateA ^ stateB) % lowers.length];
  }
  return chars.join();
}

int _hash32(String input, int seed) {
  var hash = seed & 0xffffffff;
  for (final unit in input.codeUnits) {
    hash ^= unit;
    hash = _imul(hash, 16777619);
  }
  return hash & 0xffffffff;
}

int _imul(int a, int b) => (a * b) & 0xffffffff;

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
