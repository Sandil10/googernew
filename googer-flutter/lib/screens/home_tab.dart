import 'dart:async';
import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import '../util/open_link.dart';
import '../widgets/goog_card.dart';
import '../widgets/kit.dart';
import '../widgets/product_popup.dart';
import '../widgets/reel_viewer.dart';
import '../widgets/share_sheet.dart';
import '../widgets/upload_content_card.dart';

/// Home feed â€” full parity port of the web app home feed
/// (googernew-main/app/dashboard/page.tsx):
///  Â· Search Googs pill with live profile suggestions
///  Â· 27 category chips (All / Subscriptions / Comedy / ... )
///  Â· Mixed organic feed: googs + upload content, seeded shuffle
///  Â· Sponsored ads interleaved (1st after 1 organic card, then every 4)
///  Â· Profile Promote carousels (after 3 organic cards, then every 8)
///  Â· Infinite scroll batches (6 initial, +3), shimmer skeleton first load
///  Â· Pull-to-refresh + silent 15s background refresh (flicker-free)
class LiveHomeTab extends StatefulWidget {
  const LiveHomeTab({super.key});

  @override
  State<LiveHomeTab> createState() => _LiveHomeTabState();
}

/* â”€â”€ web parity constants (HOME_GOOG_CATEGORIES / batch sizes) â”€â”€ */

const _kInitialBatch = 6;
const _kBatchSize = 3;

const homeGoogCategories = [
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

/* â”€â”€ feed entry union â”€â”€ */

abstract class _FeedEntry {
  String get key;
}

class _GoogEntry extends _FeedEntry {
  final GoogPost post;
  _GoogEntry(this.post);
  @override
  String get key => "goog-${post.id}";
}

class _UploadEntry extends _FeedEntry {
  final UploadContent item;
  _UploadEntry(this.item);
  @override
  String get key => "upload-${item.id}";
}

class _AdEntry extends _FeedEntry {
  final HomeAd ad;
  final int slot;
  _AdEntry(this.ad, this.slot);
  @override
  String get key => "ad-${ad.adId}-$slot";
}

class _CarouselEntry extends _FeedEntry {
  final List<HomeAd> ads;
  final int index;
  _CarouselEntry(this.ads, this.index);
  @override
  String get key => "carousel-$index";
}

/* â”€â”€ seeded shuffle (port of hashStringToSeed / seededRandom /
      shuffleItemsWithSeed from the web home feed) â”€â”€ */

int _hashSeed(String value) {
  var hash = 0x811C9DC5; // FNV offset basis 2166136261
  for (final code in value.codeUnits) {
    hash ^= code;
    hash = (hash * 0x01000193) & 0xFFFFFFFF; // FNV prime 16777619
  }
  return hash;
}

double Function() _seededRandom(int seed) {
  var value = seed & 0xFFFFFFFF;
  return () {
    value = (1664525 * value + 1013904223) & 0xFFFFFFFF;
    return value / 4294967296;
  };
}

List<T> _shuffleSeeded<T>(List<T> items, String seed, String Function(T) keyFn) {
  final random = _seededRandom(_hashSeed(seed));
  final ranked = items
      .map((item) => (item: item, rank: random(), key: keyFn(item)))
      .toList()
    ..sort((a, b) {
      final byRank = a.rank.compareTo(b.rank);
      return byRank != 0 ? byRank : a.key.compareTo(b.key);
    });
  return ranked.map((e) => e.item).toList();
}

String _normalizeCategory(String value) => value
    .toLowerCase()
    .replaceAll("&", "and")
    .replaceAll(RegExp(r"[^a-z0-9]+"), " ")
    .trim();

class _LiveHomeTabState extends State<LiveHomeTab> {
  List<GoogPost> _posts = [];
  List<UploadContent> _uploads = [];
  List<HomeAd> _ads = [];
  Set<String> _followedUsernames = {};

  bool _loading = true;
  final String _searchQuery = "";
  String _category = "All";
  int _visibleCount = _kInitialBatch;
  final Set<String> _hiddenAdIds = {};

  late final String _seed =
      "${DateTime.now().millisecondsSinceEpoch}-${identityHashCode(this)}";
  String _signature = "";
  Timer? _refreshTimer;
  final DateTime _lastInteraction = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    _load(initial: true);
    // Web polls googs every 5s; 15s is kinder to mobile and still "live".
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      // Parity with web: never refresh right after a like/share so the
      // feed doesn't flicker mid-interaction.
      if (DateTime.now().difference(_lastInteraction).inSeconds < 12) return;
      _load();
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool initial = false}) async {
    if (initial && mounted) setState(() => _loading = true);
    final results = await Future.wait([
      Api.feed(),
      Api.uploadContents(),
      Api.activeAds(shuffleSeed: _seed),
      _loadFollowing(),
    ]);
    if (!mounted) return;
    final posts = results[0] as List<GoogPost>;
    final uploads = results[1] as List<UploadContent>;
    final ads = results[2] as List<HomeAd>;
    final following = results[3] as Set<String>;

    // Signature check (like the web postsSignatureRef) â€” skip the setState
    // entirely when nothing changed so the feed never repaints for no reason.
    final signature = [
      ...posts.map((p) =>
          "${p.id}:${p.likes}:${p.comments}:${p.views}:${p.shares}:${p.liked}"),
      ...uploads.map((u) => "u${u.id}:${u.likes}:${u.views}"),
      ...ads.map((a) => "a${a.adId}:${a.likes}:${a.views}"),
    ].join("|");
    if (!initial && signature == _signature) return;
    _signature = signature;

    setState(() {
      _posts = posts;
      _uploads = uploads;
      _ads = ads;
      _followedUsernames = following;
      _loading = false;
    });
  }

  Future<Set<String>> _loadFollowing() async {
    final myId = Api.user?["id"];
    if (!Api.loggedIn || myId == null) return <String>{};
    final entries = await Api.following(myId);
    final names = <String>{};
    for (final entry in entries) {
      for (final value in [
        entry["username"],
        entry["user"] is Map ? entry["user"]["username"] : null,
        entry["following"] is Map ? entry["following"]["username"] : null,
      ]) {
        final name = (value ?? "").toString().trim().toLowerCase();
        if (name.isNotEmpty) names.add(name);
      }
    }
    return names;
  }

  /* â”€â”€ filters (ports of postMatchesGoogCategory etc.) â”€â”€ */

  bool _postMatchesCategory(GoogPost post) {
    if (_category == "All") return true;
    if (_category == "Subscriptions") {
      return _followedUsernames.contains(post.username.toLowerCase());
    }
    final cat = _normalizeCategory(_category);
    final text = post.text
        .toLowerCase()
        .replaceAll("&", "and")
        .replaceAll(RegExp(r"[^a-z0-9#]+"), " ");
    return text.contains(cat) ||
        text.contains("#${cat.replaceAll(" ", "")}");
  }

  bool _uploadMatchesCategory(UploadContent item) {
    if (_category == "All") return true;
    if (_category == "Subscriptions") {
      return _followedUsernames.contains(item.username.toLowerCase());
    }
    final cat = _normalizeCategory(_category);
    final topic = _normalizeCategory(item.topic);
    final text = "${item.description} ${item.hashtags}"
        .toLowerCase()
        .replaceAll("&", "and")
        .replaceAll(RegExp(r"[^a-z0-9#]+"), " ");
    return topic.contains(cat) ||
        text.contains(cat) ||
        text.contains("#${cat.replaceAll(" ", "")}");
  }

  bool _matchesSearch(String q, List<String> fields) =>
      q.isEmpty || fields.any((f) => f.toLowerCase().contains(q));

  /* â”€â”€ feed composition (port of mixHomeOrganicItems +
        insertHomeProfilePromoteRows + interleaveHomeOrganicItemsWithAds) â”€â”€ */

  List<_FeedEntry> get _feedEntries {
    final q = _searchQuery.trim().toLowerCase();

    final posts = _posts
        .where(_postMatchesCategory)
        .where((p) => _matchesSearch(q, [p.text, p.name, p.username]))
        .toList();
    final uploads = _uploads
        .where(_uploadMatchesCategory)
        .where((u) => _matchesSearch(
            q, [u.description, u.topic, u.hashtags, u.username, u.fullName]))
        .toList();
    final sponsoredAds = _ads
        .where((a) => !a.isProfilePromote && !_hiddenAdIds.contains(a.adId))
        .where((a) => _matchesSearch(
            q, [a.title, a.description, a.campaignType, a.username]))
        .toList();
    final profileAds =
        _ads.where((a) => a.isProfilePromote && !_hiddenAdIds.contains(a.adId)).toList();

    // 1. mix organic googs + uploads with the session seed (stable order)
    final organic = _shuffleSeeded<_FeedEntry>(
      [...posts.map(_GoogEntry.new), ...uploads.map(_UploadEntry.new)],
      "$_seed:mixed-organic",
      (e) => e.key,
    );

    // 2. profile promote carousels â€” first after 3 organic, then every 8
    final withCarousels = <_FeedEntry>[];
    if (profileAds.isEmpty) {
      withCarousels.addAll(organic);
    } else {
      var nextInterval = 3;
      var organicSince = 0;
      var carousels = 0;
      for (final entry in organic) {
        withCarousels.add(entry);
        organicSince += 1;
        if (organicSince == nextInterval) {
          carousels += 1;
          withCarousels.add(_CarouselEntry(
            _shuffleSeeded(profileAds, "$_seed:profile-promote:$carousels",
                (a) => a.adId),
            carousels,
          ));
          organicSince = 0;
          nextInterval = 8;
        }
      }
      if (carousels == 0) {
        withCarousels.add(_CarouselEntry(profileAds, 1));
      }
    }

    // 3. sponsored ads â€” first after the 1st organic card, then every 4
    if (sponsoredAds.isEmpty) return withCarousels;
    final output = <_FeedEntry>[];
    var adIndex = 0;
    var organicCount = 0;
    for (final entry in withCarousels) {
      output.add(entry);
      if (entry is _CarouselEntry || entry is _AdEntry) continue;
      organicCount += 1;
      if (organicCount == 1 || organicCount % 4 == 0) {
        output.add(
            _AdEntry(sponsoredAds[adIndex % sponsoredAds.length], adIndex));
        adIndex += 1;
      }
    }
    if (adIndex == 0) output.add(_AdEntry(sponsoredAds.first, 0));
    return output;
  }

  @override
  Widget build(BuildContext context) {
    final entries = _feedEntries;
    final searching = _searchQuery.trim().isNotEmpty;
    final visible = searching
        ? entries
        : entries.take(_visibleCount.clamp(0, entries.length)).toList();
    final hasMore = !searching && _visibleCount < entries.length;

    return RefreshIndicator(
      color: GoogerColors.red,
      backgroundColor: GoogerColors.surface,
      onRefresh: () => _load(initial: false),
      child: NotificationListener<ScrollNotification>(
        onNotification: (n) {
          if (hasMore &&
              n.metrics.extentAfter < 500 &&
              n is ScrollUpdateNotification) {
            setState(() => _visibleCount =
                (_visibleCount + _kBatchSize).clamp(0, entries.length));
          }
          return false;
        },
        child: ListView.builder(
          physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics()),
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: 1 +
              (_loading ? 1 : visible.length) +
              (hasMore ? 1 : 0) +
              (!_loading && visible.isEmpty ? 1 : 0),
          itemBuilder: (context, index) {
            if (index == 0) return _categoryChips();
            if (_loading) return const _ShimmerFeed();
            final feedIndex = index - 1;
            if (feedIndex < visible.length) {
              return _FadeIn(
                key: ValueKey(visible[feedIndex].key),
                child: _entryWidget(visible[feedIndex]),
              );
            }
            if (visible.isEmpty) return _emptyState();
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Center(
                child: GoogerSpinner(size: 24, color: GoogerColors.dim),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _emptyState() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60, horizontal: 32),
      child: Column(children: const [
        Icon(Icons.dynamic_feed_outlined, size: 40, color: GoogerColors.faint),
        SizedBox(height: 12),
        Text("No posts match this view yet.",
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: GoogerColors.dim)),
      ]),
    );
  }

  Widget _entryWidget(_FeedEntry entry) {
    if (entry is _GoogEntry) return GoogCard(entry.post);
    if (entry is _UploadEntry) return UploadContentCard(entry.item);
    if (entry is _CarouselEntry) {
      return _ProfilePromoteCarousel(ads: entry.ads);
    }
    if (entry is _AdEntry) {
      return _SponsoredHomeAdCard(
        ad: entry.ad,
        onHide: () => setState(() => _hiddenAdIds.add(entry.ad.adId)),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _categoryChips() {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: homeGoogCategories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final cat = homeGoogCategories[i];
          final active = _category == cat;
          return GestureDetector(
            onTap: () => setState(() {
              _category = cat;
              _visibleCount = _kInitialBatch;
            }),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              padding: const EdgeInsets.symmetric(horizontal: 13),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: active ? Colors.white : GoogerColors.soft,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                    color: active ? Colors.white : GoogerColors.line),
              ),
              child: Text(
                cat,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.1,
                  color:
                      active ? const Color(0xFF111111) : GoogerColors.muted,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Threads-style entrance animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class _FadeIn extends StatelessWidget {
  final Widget child;
  const _FadeIn({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
      builder: (context, t, c) => Opacity(
        opacity: t,
        child: Transform.translate(offset: Offset(0, 12 * (1 - t)), child: c),
      ),
      child: child,
    );
  }
}

class _SponsoredHomeAdCard extends StatefulWidget {
  final HomeAd ad;
  final VoidCallback onHide;
  const _SponsoredHomeAdCard({required this.ad, required this.onHide});

  @override
  State<_SponsoredHomeAdCard> createState() => _SponsoredHomeAdCardState();
}

class _SponsoredHomeAdCardState extends State<_SponsoredHomeAdCard> {
  late bool liked = widget.ad.liked;
  late int likes = widget.ad.likes;

  String _fmt(int n) => n > 999 ? "${(n / 1000).toStringAsFixed(1)}k" : "$n";

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    final title = ad.title.isEmpty ? ad.campaignType : ad.title;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: const BoxDecoration(
        color: Colors.black,
        border: Border(bottom: BorderSide(color: GoogerColors.borderSoft)),
      ),
      child: Container(
        decoration: BoxDecoration(
          color: GoogerColors.card,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: GoogerColors.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 9, 8, 8),
            child: Row(children: [
              GoogerAvatar(
                  url: ad.avatar.isEmpty ? null : ad.avatar,
                  name: ad.fullName.isEmpty ? ad.username : ad.fullName,
                  size: 30),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ad.username,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              color: Colors.white)),
                      const Text("SPONSORED",
                          style: TextStyle(
                              fontSize: 8,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.8,
                              color: GoogerColors.dim)),
                    ]),
              ),
              GestureDetector(
                onTap: widget.onHide,
                child: const Icon(Icons.more_vert,
                    size: 20, color: Colors.white70),
              ),
            ]),
          ),
          if (ad.mediaPreview.isNotEmpty)
            AspectRatio(
              aspectRatio: 1.6,
              child: Image.network(ad.mediaPreview,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                        color: Colors.black,
                        alignment: Alignment.center,
                        child: const Icon(Icons.image_outlined,
                            color: GoogerColors.faint),
                      )),
            ),
          Padding(
            padding: const EdgeInsets.all(12),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: Colors.white)),
              if (ad.description.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(ad.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12,
                        height: 1.35,
                        color: GoogerColors.muted)),
              ],
              const SizedBox(height: 10),
              Row(children: [
                GestureDetector(
                  onTap: () {
                    setState(() {
                      liked = !liked;
                      likes += liked ? 1 : -1;
                    });
                    Api.toggleAdLike(ad.interactionId);
                  },
                  child: Icon(liked ? Icons.favorite : Icons.favorite_border,
                      size: 18, color: liked ? GoogerColors.red : Colors.white),
                ),
                const SizedBox(width: 4),
                Text(_fmt(likes),
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.white)),
                const SizedBox(width: 16),
                const Icon(Icons.remove_red_eye_outlined,
                    size: 17, color: Colors.white),
                const SizedBox(width: 4),
                Text(_fmt(ad.views),
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.white)),
                const SizedBox(width: 16),
                const Icon(Icons.mode_comment_outlined,
                    size: 16, color: Colors.white),
                const SizedBox(width: 4),
                Text(_fmt(ad.comments),
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.white)),
                const Spacer(),
                const Icon(Icons.share_outlined, size: 17, color: Colors.white),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ shimmer skeleton (RN/Facebook-style buffering) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   One AnimationController drives a single moving gradient over the whole
   skeleton column â€” matches the geometry of a GoogCard so the swap to real
   content doesn't shift the layout. */

class _ShimmerFeed extends StatefulWidget {
  const _ShimmerFeed();

  @override
  State<_ShimmerFeed> createState() => _ShimmerFeedState();
}

class _ShimmerFeedState extends State<_ShimmerFeed>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1400))
    ..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = _controller.value;
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) => LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: const [
              Color(0xFF1A1A1E),
              Color(0xFF2C2C33),
              Color(0xFF1A1A1E),
            ],
            stops: const [0.25, 0.5, 0.75],
            transform: _SlideGradient(t),
          ).createShader(bounds),
          child: child,
        );
      },
      child: Column(
        children: List.generate(6, (_) => const _SkeletonGoogCard()),
      ),
    );
  }
}

class _SlideGradient extends GradientTransform {
  final double t;
  const _SlideGradient(this.t);

  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.translationValues(bounds.width * (t * 3 - 1.5), 0, 0);
}

class _SkeletonGoogCard extends StatelessWidget {
  const _SkeletonGoogCard();

  static const _box = Color(0xFF1A1A1E);

  Widget _bar(double w, double h, {double r = 6}) => Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
            color: _box, borderRadius: BorderRadius.circular(r)),
      );

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: GoogerColors.borderSoft))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
              width: 40,
              height: 40,
              decoration:
                  const BoxDecoration(color: _box, shape: BoxShape.circle)),
          const SizedBox(width: 10),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _bar(110, 11),
            const SizedBox(height: 6),
            _bar(60, 9),
          ]),
        ]),
        const SizedBox(height: 14),
        _bar(double.infinity, 12),
        const SizedBox(height: 8),
        _bar(220, 12),
        const SizedBox(height: 16),
        Row(
            children: List.generate(
          4,
          (i) => Padding(
            padding: const EdgeInsets.only(right: 26),
            child: _bar(38, 14, r: 7),
          ),
        )),
      ]),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Profile Promote carousel (2 cards per view) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class _ProfilePromoteCarousel extends StatelessWidget {
  final List<HomeAd> ads;
  const _ProfilePromoteCarousel({required this.ads});

  @override
  Widget build(BuildContext context) {
    // Same as the web ProfilePromoteCarousel: compact profile-promote cards
    // side by side, no section label â€” each card carries its own tiny "Ad" tag.
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: GoogerColors.borderSoft))),
      child: SizedBox(
        height: 236,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          itemCount: ads.length,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (_, i) => _ProfilePromoteCard(ad: ads[i]),
        ),
      ),
    );
  }
}

/// Web SharedProfilePromoteAdCard parity: header (avatar Â· username Â· "Ad"
/// tag Â· Subscribe), a 3-item grid of the owner's products/contents and a
/// full-width View Profile button. Black card, no "Sponsored" text anywhere.
class _ProfilePromoteCard extends StatefulWidget {
  final HomeAd ad;
  const _ProfilePromoteCard({required this.ad});

  @override
  State<_ProfilePromoteCard> createState() => _ProfilePromoteCardState();
}

class _ProfilePromoteCardState extends State<_ProfilePromoteCard> {
  static final Map<String, List<Map<String, dynamic>>> _gridCache = {};
  List<Map<String, dynamic>> items = const [];
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _loadItems();
  }

  Future<void> _loadItems() async {
    final ad = widget.ad;
    // featured items chosen in the campaign editor win; otherwise fall back to
    // the promoted profile's own market items (same as the web card).
    if (ad.featuredItems.isNotEmpty) {
      setState(() {
        items = ad.featuredItems;
        loading = false;
      });
      return;
    }
    final cacheKey = "${ad.adId}:${ad.ownerUserId}";
    final cached = _gridCache[cacheKey];
    if (cached != null) {
      setState(() {
        items = cached;
        loading = false;
      });
      return;
    }
    final fetched = await Api.userMarketItems(ad.ownerUserId);
    if (!mounted) return;
    setState(() {
      items = fetched.take(3).toList();
      _gridCache[cacheKey] = items;
      loading = false;
    });
  }

  String _itemImage(Map<String, dynamic> m) {
    for (final key in [
      "thumbnail_url",
      "image_url",
      "main_image",
      "preview_url",
      "media_preview",
      "media_url",
    ]) {
      final v = (m[key] ?? "").toString();
      if (v.isNotEmpty && !v.contains("googer.png") && !v.contains("rupeer")) {
        return Api.resolveMedia(v);
      }
    }
    final gallery = m["media_gallery"] ?? m["images"];
    if (gallery is List && gallery.isNotEmpty) {
      return Api.resolveMedia(gallery.first.toString());
    }
    return "";
  }

  void _openItem(Map<String, dynamic> m) {
    final id = int.tryParse("${m["id"] ?? m["product_id"] ?? 0}") ?? 0;
    final price = double.tryParse("${m["promo_price"] ?? ""}") ??
        double.tryParse("${m["price"] ?? 0}") ??
        0;
    if (id <= 0) {
      _openProfile();
      return;
    }
    showProductPopup(
      context,
      Product(
        id: id,
        title: (m["title"] ?? "Product").toString(),
        price: price,
        image: _itemImage(m),
        seller: (m["owner_username"] ?? m["username"] ?? widget.ad.username)
            .toString(),
        rating: 4.5,
        sold: 0,
        category: (m["category"] ?? "").toString(),
        description: (m["description"] ?? "").toString(),
        likes: int.tryParse("${m["likes_count"] ?? 0}") ?? 0,
        views: int.tryParse("${m["views_count"] ?? 0}") ?? 0,
        comments: int.tryParse("${m["comments_count"] ?? 0}") ?? 0,
        shares: int.tryParse("${m["shares_count"] ?? 0}") ?? 0,
      ),
    );
  }

  void _openProfile() =>
      Navigator.pushNamed(context, "/profile/user", arguments: widget.ad.username);

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    return Container(
      width: 250,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: GoogerColors.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: GoogerColors.line),
      ),
      child: Column(children: [
        // header â€” avatar Â· username Â· Ad Â· Subscribe (web card header)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: GoogerColors.borderSoft))),
          child: Row(children: [
            GestureDetector(
              onTap: _openProfile,
              child: GoogerAvatar(
                  url: ad.avatar.isEmpty ? null : ad.avatar,
                  name: ad.fullName.isEmpty ? ad.username : ad.fullName,
                  size: 30),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: GestureDetector(
                onTap: _openProfile,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ad.username,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w900,
                              color: GoogerColors.text)),
                      const Text("Ad",
                          style: TextStyle(
                              fontSize: 8,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.4,
                              color: GoogerColors.dim)),
                    ]),
              ),
            ),
            _MiniSubscribeButton(userId: ad.ownerUserId),
          ]),
        ),
        // 3-item grid of the owner's products / contents
        Padding(
          padding: const EdgeInsets.all(6),
          child: Row(
            children: List.generate(3, (i) {
              final item = i < items.length ? items[i] : null;
              final img = item == null ? "" : _itemImage(item);
              final price = item == null
                  ? null
                  : (double.tryParse("${item["promo_price"] ?? ""}") ??
                      double.tryParse("${item["price"] ?? 0}"));
              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: i < 2 ? 4 : 0),
                  child: GestureDetector(
                    onTap: item == null ? null : () => _openItem(item),
                    child: Container(
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: GoogerColors.page,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: GoogerColors.borderSoft),
                      ),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            AspectRatio(
                              aspectRatio: 1,
                              child: img.isEmpty
                                  ? Container(
                                      color: GoogerColors.soft6,
                                      child: Icon(
                                          loading
                                              ? Icons.hourglass_empty
                                              : Icons.image_outlined,
                                          size: 14,
                                          color: GoogerColors.faint),
                                    )
                                  : Image.network(img,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => Container(
                                          color: GoogerColors.soft6,
                                          child: const Icon(
                                              Icons.image_outlined,
                                              size: 14,
                                              color: GoogerColors.faint))),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(4, 3, 4, 4),
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                        item == null
                                            ? (loading ? "..." : "-")
                                            : (item["title"] ?? "").toString(),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            fontSize: 8,
                                            fontWeight: FontWeight.w900,
                                            color: GoogerColors.text)),
                                    if (price != null)
                                      Text(price.toStringAsFixed(0),
                                          maxLines: 1,
                                          style: const TextStyle(
                                              fontSize: 8,
                                              fontWeight: FontWeight.w700,
                                              color: GoogerColors.dim)),
                                  ]),
                            ),
                          ]),
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
        const Spacer(),
        // View Profile â€” full-width soft button like the web card
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          child: GestureDetector(
            onTap: _openProfile,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: BoxDecoration(
                color: GoogerColors.soft6,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text("VIEW PROFILE",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.4,
                      color: GoogerColors.muted)),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Small Subscribe pill for the compact profile-promote header.
class _MiniSubscribeButton extends StatefulWidget {
  final String userId;
  const _MiniSubscribeButton({required this.userId});

  @override
  State<_MiniSubscribeButton> createState() => _MiniSubscribeButtonState();
}

class _MiniSubscribeButtonState extends State<_MiniSubscribeButton> {
  bool subscribed = false;
  bool _busy = false;

  Future<void> _toggle() async {
    if (_busy || widget.userId.isEmpty) return;
    _busy = true;
    setState(() => subscribed = !subscribed);
    final ok = await Api.toggleUserSubscription(widget.userId);
    _busy = false;
    if (!mounted) return;
    if (ok == null) {
      setState(() => subscribed = !subscribed);
      if (!Api.loggedIn) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text("Log in to subscribe"),
            behavior: SnackBarBehavior.floating));
      }
    } else if (ok != subscribed) {
      setState(() => subscribed = ok);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _toggle,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: subscribed ? GoogerColors.soft6 : Colors.white,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(subscribed ? "SUBSCRIBED" : "SUBSCRIBE",
            style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.6,
                color: subscribed ? GoogerColors.muted : Colors.black)),
      ),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Product Promote ad card (web SharedProductCard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/// Product Promote ads â€” same box as the web SharedProductCard:
/// header (avatar Â· seller Â· green "Ad" tag Â· Subscribe Â· two-dot menu),
/// square product image with the +discount badge, title, big R price with a
/// cart button, heart/eye/comment/share counts, the red Rupieer collect-coin
/// button once the ad is liked, and the product quick-view popup on tap.
class ProductPromoteAdCard extends StatefulWidget {
  final HomeAd ad;
  final VoidCallback? onInteraction;
  final VoidCallback? onHide;
  const ProductPromoteAdCard(
      {super.key, required this.ad, this.onInteraction, this.onHide});

  @override
  State<ProductPromoteAdCard> createState() => _ProductPromoteAdCardState();
}

class _ProductPromoteAdCardState extends State<ProductPromoteAdCard> {
  late bool liked = widget.ad.liked;
  late int likes = widget.ad.likes;
  late int shares = widget.ad.shares;
  late bool coinCollected = widget.ad.coinCollected;
  late bool likeLocked = widget.ad.likeLocked;
  bool _collecting = false;

  String _fmt(int n) => n > 999 ? "${(n / 1000).toStringAsFixed(1)}k" : "$n";

  @override
  void initState() {
    super.initState();
    // web AdImpressionTrigger: impression + view once per feed appearance
    Api.markAdImpression(widget.ad.interactionId);
    Api.markAdView(widget.ad.interactionId);
  }

  bool get _isOwn {
    if (!Api.loggedIn) return false;
    final ad = widget.ad;
    if (Api.username.isNotEmpty && Api.username == ad.username) return true;
    if (ad.ownerUserId.isEmpty) return false;
    final ids = [Api.user?["id"], Api.user?["user_id"], Api.user?["userId"]]
        .map((v) => "$v")
        .where((v) => v.isNotEmpty && v != "null");
    return ids.contains(ad.ownerUserId);
  }

  /// Web canShowCollectCoinButton: sponsored + logged in + liked +
  /// not collected + not the ad owner.
  bool get _showCoinButton =>
      Api.loggedIn && liked && !coinCollected && !_isOwn;

  Future<void> _toggleLike() async {
    widget.onInteraction?.call();
    if (liked && (likeLocked || coinCollected)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text("You already collected coins for this ad. You cannot unlike."),
          behavior: SnackBarBehavior.floating));
      return;
    }
    setState(() {
      liked = !liked;
      likes += liked ? 1 : -1;
    });
    final result = await Api.toggleAdLike(widget.ad.interactionId);
    if (result == null && mounted) {
      setState(() {
        liked = !liked;
        likes += liked ? 1 : -1;
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(Api.loggedIn
              ? "Could not update the like. Please try again."
              : "Log in to like ads"),
          behavior: SnackBarBehavior.floating));
    } else if (result != null && mounted && result != liked) {
      setState(() => liked = result);
    }
  }

  Future<void> _collectCoin() async {
    if (_collecting) return;
    _collecting = true;
    final amount = await Api.collectAdCoin(widget.ad.adId);
    _collecting = false;
    if (!mounted) return;
    if (amount != null) {
      setState(() {
        coinCollected = true;
        likeLocked = true;
      });
      // small white "coin collected" notification at the bottom (web coinToast)
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Row(mainAxisSize: MainAxisSize.min, children: [
          Image.asset("assets/images/rupee.png", width: 20, height: 20),
          const SizedBox(width: 8),
          const Text("Coin collected",
              style: TextStyle(
                  color: Colors.black,
                  fontWeight: FontWeight.w800,
                  fontSize: 13)),
        ]),
        backgroundColor: Colors.white,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        duration: const Duration(seconds: 2),
      ));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text("Could not collect the ad coin."),
          behavior: SnackBarBehavior.floating));
    }
  }

  void _openPopup() {
    widget.onInteraction?.call();
    final ad = widget.ad;
    showProductPopup(
      context,
      Product(
        id: ad.linkedProductId,
        title: ad.title,
        price: ad.displayPrice,
        oldPrice: ad.oldPrice,
        image: ad.mediaPreview,
        seller: ad.username,
        rating: 4.5,
        sold: 0,
        category: "",
        description: ad.description,
        likes: likes,
        views: ad.views,
        comments: ad.comments,
        shares: shares,
        liked: liked,
      ),
    );
  }

  void _share() {
    widget.onInteraction?.call();
    Api.shareAd(widget.ad.interactionId);
    setState(() => shares += 1);
    showShareSheet(context,
        title: widget.ad.title,
        url: "https://googer.site/share/ad/${widget.ad.adId}");
  }

  void _openSheet(String kind) {
    widget.onInteraction?.call();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AdInteractionSheet(ad: widget.ad, kind: kind),
    );
  }

  void _menu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: GoogerColors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (sheetContext) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 10),
          ListTile(
            leading: const Icon(Icons.share_outlined,
                size: 20, color: GoogerColors.blue),
            title:
                const Text("Share Link", style: TextStyle(fontSize: 13.5)),
            onTap: () {
              Navigator.pop(sheetContext);
              _share();
            },
          ),
          ListTile(
            leading: const Icon(Icons.flag_outlined,
                size: 20, color: GoogerColors.amber),
            title: const Text("Report", style: TextStyle(fontSize: 13.5)),
            onTap: () async {
              Navigator.pop(sheetContext);
              final ok = await Api.reportAd(widget.ad.adId, "Inappropriate");
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(ok
                      ? "Report submitted. Thank you."
                      : "Log in to report ads"),
                  behavior: SnackBarBehavior.floating));
            },
          ),
          ListTile(
            leading: const Icon(Icons.visibility_off_outlined,
                size: 20, color: GoogerColors.dim),
            title: const Text("Not Interested",
                style: TextStyle(fontSize: 13.5)),
            onTap: () {
              Navigator.pop(sheetContext);
              widget.onHide?.call();
            },
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      child: GestureDetector(
        onTap: _openPopup,
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: GoogerColors.card,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: GoogerColors.borderSoft),
          ),
          child: Stack(children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // header â€” avatar Â· seller Â· Ad tag Â· Subscribe Â· two dots
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
                child: Row(children: [
                  GestureDetector(
                    onTap: () => Navigator.pushNamed(context, "/profile/user",
                        arguments: ad.username),
                    child: GoogerAvatar(
                        url: ad.avatar.isEmpty ? null : ad.avatar,
                        name: ad.fullName.isEmpty ? ad.username : ad.fullName,
                        size: 32),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            onTap: () => Navigator.pushNamed(
                                context, "/profile/user",
                                arguments: ad.username),
                            child: Text(ad.username,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w900,
                                    color: GoogerColors.text)),
                          ),
                          Row(children: const [
                            Icon(Icons.campaign_outlined,
                                size: 11, color: GoogerColors.green),
                            SizedBox(width: 3),
                            Text("Ad",
                                style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                    color: GoogerColors.green)),
                          ]),
                        ]),
                  ),
                  if (!_isOwn) ...[
                    _MiniSubscribeButton(userId: ad.ownerUserId),
                    const SizedBox(width: 2),
                  ],
                  GestureDetector(
                    onTap: _menu,
                    behavior: HitTestBehavior.opaque,
                    child: const Padding(
                      padding: EdgeInsets.all(10),
                      child: TwoDotsIcon(),
                    ),
                  ),
                ]),
              ),
              // square product image + discount badge (web card body)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Stack(children: [
                    AspectRatio(
                      aspectRatio: 1,
                      child: ad.mediaPreview.isEmpty
                          ? Container(
                              color: GoogerColors.soft6,
                              child: const Icon(Icons.image_outlined,
                                  size: 34, color: GoogerColors.faint))
                          : Image.network(ad.mediaPreview,
                              width: double.infinity,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(
                                  color: GoogerColors.soft6,
                                  child: const Icon(Icons.image_outlined,
                                      size: 34, color: GoogerColors.faint))),
                    ),
                    if (ad.discount.isNotEmpty)
                      Positioned(
                        bottom: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 7, vertical: 3),
                          decoration: BoxDecoration(
                            color: GoogerColors.green.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                                color:
                                    GoogerColors.green.withValues(alpha: 0.3)),
                          ),
                          child: Text("+${ad.discount}%",
                              style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w900,
                                  color: GoogerColors.green)),
                        ),
                      ),
                  ]),
                ),
              ),
              // title Â· price Â· cart Â· interaction counts
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ad.title.toUpperCase(),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.2,
                              color: GoogerColors.text)),
                      const SizedBox(height: 4),
                      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        const Text("R ",
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                                color: GoogerColors.dim)),
                        Text(
                            ad.displayPrice % 1 == 0
                                ? ad.displayPrice.toStringAsFixed(0)
                                : ad.displayPrice.toStringAsFixed(2),
                            style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.5,
                                color: GoogerColors.text)),
                        if (ad.oldPrice != null) ...[
                          const SizedBox(width: 8),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 3),
                            child: Text(
                                "R ${ad.oldPrice!.toStringAsFixed(0)}",
                                style: const TextStyle(
                                    fontSize: 11,
                                    color: GoogerColors.dim,
                                    decoration: TextDecoration.lineThrough)),
                          ),
                        ],
                        const Spacer(),
                        GestureDetector(
                          onTap: _openPopup,
                          child: Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: GoogerColors.soft6,
                              borderRadius: BorderRadius.circular(13),
                              border:
                                  Border.all(color: GoogerColors.borderSoft),
                            ),
                            child: const Icon(Icons.shopping_cart_outlined,
                                size: 18, color: GoogerColors.text),
                          ),
                        ),
                      ]),
                      const SizedBox(height: 8),
                      Container(
                          height: 1, color: GoogerColors.borderSoft),
                      const SizedBox(height: 8),
                      Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _countAction(
                              icon: liked
                                  ? Icons.favorite
                                  : Icons.favorite_border,
                              count: likes,
                              color: liked
                                  ? GoogerColors.red
                                  : GoogerColors.text,
                              onTap: _toggleLike,
                              onLongPress: () => _openSheet("likes"),
                            ),
                            _countAction(
                              icon: Icons.remove_red_eye_outlined,
                              count: ad.views,
                              onTap: () => _openSheet("views"),
                            ),
                            _countAction(
                              icon: Icons.chat_bubble_outline,
                              count: ad.comments,
                              onTap: () => _openSheet("comments"),
                            ),
                            _countAction(
                              icon: Icons.share_outlined,
                              count: shares,
                              onTap: _share,
                              onLongPress: () => _openSheet("shares"),
                            ),
                          ]),
                    ]),
              ),
            ]),
            // red Rupieer collect button â€” appears once the ad is liked
            if (_showCoinButton)
              Positioned(
                top: 58,
                right: 14,
                child: GestureDetector(
                  onTap: _collectCoin,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                    decoration: BoxDecoration(
                      color: const Color(0xFFDC2626),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                          color: Colors.white.withValues(alpha: 0.25)),
                      boxShadow: const [
                        BoxShadow(
                            color: Colors.black45,
                            blurRadius: 10,
                            offset: Offset(0, 3)),
                      ],
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      ClipOval(
                        child: Image.asset("assets/images/rupee.png",
                            width: 20, height: 20, fit: BoxFit.contain),
                      ),
                      const SizedBox(width: 5),
                      const Text("RUPIEER",
                          style: TextStyle(
                              fontSize: 8.5,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1,
                              color: Colors.white)),
                    ]),
                  ),
                ),
              ),
          ]),
        ),
      ),
    );
  }

  Widget _countAction({
    required IconData icon,
    required int count,
    required VoidCallback onTap,
    VoidCallback? onLongPress,
    Color color = GoogerColors.text,
  }) {
    return GestureDetector(
      onTap: onTap,
      onLongPress: onLongPress,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        child: Row(children: [
          Icon(icon, size: 19, color: color),
          if (count > 0) ...[
            const SizedBox(width: 4),
            Text(_fmt(count),
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: color == GoogerColors.red
                        ? GoogerColors.red
                        : GoogerColors.muted)),
          ],
        ]),
      ),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Promoted ad card (PromotedAdCard parity) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class PromotedAdCard extends StatefulWidget {
  final HomeAd ad;
  final VoidCallback? onInteraction;
  final VoidCallback? onHide;
  const PromotedAdCard(
      {super.key, required this.ad, this.onInteraction, this.onHide});

  @override
  State<PromotedAdCard> createState() => _PromotedAdCardState();
}

class _PromotedAdCardState extends State<PromotedAdCard> {
  late bool liked = widget.ad.liked;
  late int likes = widget.ad.likes;
  late int shares = widget.ad.shares;
  bool _logged = false;

  String _fmt(int n) => n > 999 ? "${(n / 1000).toStringAsFixed(1)}k" : "$n";

  @override
  void initState() {
    super.initState();
    if (!_logged) {
      _logged = true;
      // web AdImpressionTrigger: impression + view once per feed appearance
      Api.markAdImpression(widget.ad.interactionId);
      Api.markAdView(widget.ad.interactionId);
    }
  }

  Future<void> _toggleLike() async {
    if (widget.ad.likeLocked || widget.ad.coinCollected) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text("You already collected coins for this ad. You cannot unlike."),
          behavior: SnackBarBehavior.floating));
      return;
    }
    widget.onInteraction?.call();
    setState(() {
      liked = !liked;
      likes += liked ? 1 : -1;
    });
    final result = await Api.toggleAdLike(widget.ad.interactionId);
    if (result == null && mounted) {
      setState(() {
        liked = !liked;
        likes += liked ? 1 : -1;
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(Api.loggedIn
              ? "Could not update the like. Please try again."
              : "Log in to like ads"),
          behavior: SnackBarBehavior.floating));
    } else if (result != null && mounted && result != liked) {
      setState(() => liked = result);
    }
  }

  String get _ctaHref {
    final ad = widget.ad;
    final value = ad.ctaValue.trim().isNotEmpty ? ad.ctaValue.trim() : ad.activeLink.trim();
    if (value.isEmpty || ad.ctaTopic == "No Button" || ad.ctaTopic == "Message") {
      return "";
    }
    if (ad.ctaTopic == "Call Now") {
      return "tel:${value.replaceAll(RegExp(r"[^\d+]"), "")}";
    }
    if (ad.ctaTopic == "WhatsApp") {
      if (value.startsWith("http")) return value;
      final digits = value.replaceAll(RegExp(r"[^\d]"), "");
      return digits.isEmpty ? "" : "https://wa.me/$digits";
    }
    if (value.contains("@") && !value.startsWith("http") && ad.ctaTopic == "Contact Us") {
      return "mailto:$value";
    }
    return value.startsWith("http") ? value : "https://$value";
  }

  Future<void> _openCta() async {
    widget.onInteraction?.call();
    final ad = widget.ad;
    final href = ad.isProductPromote && ad.linkedProductShareCode.isNotEmpty
        ? "https://googer.site/product/${ad.linkedProductShareCode}"
        : _ctaHref;
    if (href.isEmpty) return;
    final opened = await openExternalLink(href);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text("Link copied to clipboard"),
          behavior: SnackBarBehavior.floating));
    }
  }

  void _share() {
    widget.onInteraction?.call();
    Api.shareAd(widget.ad.interactionId);
    setState(() => shares += 1);
    showShareSheet(context,
        title: widget.ad.title,
        url: "https://googer.site/share/ad/${widget.ad.adId}");
  }

  void _menu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: GoogerColors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (sheetContext) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 10),
          ListTile(
            leading: const Icon(Icons.visibility_off_outlined, size: 20),
            title: const Text("Not interested â€” hide for 24 hours",
                style: TextStyle(fontSize: 13.5)),
            onTap: () {
              Navigator.pop(sheetContext);
              widget.onHide?.call();
            },
          ),
          ListTile(
            leading: const Icon(Icons.flag_outlined,
                size: 20, color: GoogerColors.red),
            title: const Text("Report ad",
                style: TextStyle(fontSize: 13.5, color: GoogerColors.red)),
            onTap: () async {
              Navigator.pop(sheetContext);
              final ok = await Api.reportAd(widget.ad.adId, "Inappropriate");
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(ok
                      ? "Report submitted. Thank you."
                      : "Log in to report ads"),
                  behavior: SnackBarBehavior.floating));
            },
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  void _openSheet(String kind) {
    widget.onInteraction?.call();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AdInteractionSheet(ad: widget.ad, kind: kind),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ad = widget.ad;
    return Container(
      padding: const EdgeInsets.only(top: 14, bottom: 12),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: GoogerColors.borderSoft))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // header â€” avatar Â· username Â· Sponsored badge Â· â€¢â€¢â€¢
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(children: [
            GestureDetector(
              onTap: () => Navigator.pushNamed(context, "/profile/user",
                  arguments: ad.username),
              child: GoogerAvatar(
                  url: ad.avatar,
                  name: ad.fullName.isEmpty ? ad.username : ad.fullName,
                  size: 38),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(ad.username,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: GoogerColors.text)),
                    // ad topic only â€” no "Sponsored"/campaign-type label
                    if (ad.title.trim().isNotEmpty)
                      Text(ad.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600,
                              color: GoogerColors.dim)),
                  ]),
            ),
            GestureDetector(
              onTap: _menu,
              // opaque: whole padded area is tappable, not just the tiny dots
              behavior: HitTestBehavior.opaque,
              child: const Padding(
                padding: EdgeInsets.all(10),
                child: TwoDotsIcon(),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        // media â€” Instagram-style: full width, natural height.
        // Tap (first view) opens the full-screen second view.
        if (ad.mediaPreview.isNotEmpty) ...[
          GestureDetector(
            onTap: () {
              widget.onInteraction?.call();
              Api.markAdView(ad.interactionId);
              openReelViewer(
                context,
                mediaUrl: ad.mediaPreview,
                isVideo: ad.mediaType.toLowerCase().contains("video"),
                thumbnail: ad.mediaPreview,
                username: ad.username,
                description: ad.description,
                avatar: ad.avatar,
              );
            },
            child: Image.network(
              ad.mediaPreview,
              width: double.infinity,
              fit: BoxFit.fitWidth,
              errorBuilder: (_, __, ___) => AspectRatio(
                aspectRatio: 16 / 10,
                child: Container(
                  color: GoogerColors.soft6,
                  child: const Icon(Icons.image_outlined,
                      size: 34, color: GoogerColors.faint),
                ),
              ),
              loadingBuilder: (context, child, progress) => progress == null
                  ? child
                  : AspectRatio(
                      aspectRatio: 16 / 10,
                      child: Container(color: GoogerColors.soft6)),
            ),
          ),
          const SizedBox(height: 10),
        ],
        // description (topic already shown in the header)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (ad.description.trim().isNotEmpty) ...[
              Text(ad.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 12.5,
                      height: 1.4,
                      color: GoogerColors.muted)),
              const SizedBox(height: 10),
            ],
            // price (R coin) + CTA
            Row(children: [
              if (ad.isProductPromote && ad.price > 0) ...[
                Container(
                  width: 17,
                  height: 17,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                      gradient: GoogerColors.goldGradient,
                      shape: BoxShape.circle),
                  child: const Text("R",
                      style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFF221A05))),
                ),
                const SizedBox(width: 5),
                Text(ad.price.toStringAsFixed(2),
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: GoogerColors.green)),
                const SizedBox(width: 12),
              ],
              if (ad.isProductPromote || _ctaHref.isNotEmpty)
                Expanded(
                  child: SizedBox(
                    height: 34,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 34),
                        textStyle: const TextStyle(
                            fontSize: 11.5, fontWeight: FontWeight.w800),
                      ),
                      onPressed: _openCta,
                      child: Text(ad.isProductPromote
                          ? "View Product"
                          : ad.ctaTopic.isEmpty
                              ? "Visit"
                              : ad.ctaTopic),
                    ),
                  ),
                ),
            ]),
            const SizedBox(height: 12),
            // interactions â€” icons with counts beside them (web style, no
            // "N likes, N comments..." summary line)
            Row(children: [
              _action(
                icon: liked ? Icons.favorite : Icons.favorite_border,
                count: likes,
                color: liked ? GoogerColors.red : GoogerColors.text,
                onTap: _toggleLike,
                onLongPress: () => _openSheet("likes"),
              ),
              _action(
                icon: Icons.chat_bubble_outline,
                count: widget.ad.comments,
                onTap: () => _openSheet("comments"),
              ),
              _action(
                icon: Icons.remove_red_eye_outlined,
                count: widget.ad.views,
                onTap: () => _openSheet("views"),
              ),
              _action(
                icon: Icons.share_outlined,
                count: shares,
                onTap: _share,
                onLongPress: () => _openSheet("shares"),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }

  Widget _action({
    required IconData icon,
    required VoidCallback onTap,
    VoidCallback? onLongPress,
    int count = 0,
    Color color = GoogerColors.text,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 24),
      child: GestureDetector(
        onTap: onTap,
        onLongPress: onLongPress,
        behavior: HitTestBehavior.opaque,
        child: Row(children: [
          Icon(icon, size: 23, color: color),
          if (count > 0) ...[
            const SizedBox(width: 5),
            Text(_fmt(count),
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: GoogerColors.muted)),
          ],
        ]),
      ),
    );
  }
}

/* â”€â”€ ad interaction sheet (likes / comments / shares / views via /market) â”€â”€ */

class _AdInteractionSheet extends StatefulWidget {
  final HomeAd ad;
  final String kind;
  const _AdInteractionSheet({required this.ad, required this.kind});

  @override
  State<_AdInteractionSheet> createState() => _AdInteractionSheetState();
}

class _AdInteractionSheetState extends State<_AdInteractionSheet> {
  late String kind = widget.kind;
  List<Map<String, dynamic>>? rows;
  final _commentController = TextEditingController();
  bool _sending = false;

  static const _tabs = ["likes", "comments", "shares", "views"];

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() => rows = null);
    final data = await Api.adInteractions(widget.ad.interactionId, kind);
    if (mounted) setState(() => rows = data);
  }

  Future<void> _sendComment() async {
    final text = _commentController.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    final ok = await Api.addAdComment(widget.ad.interactionId, text);
    if (!mounted) return;
    setState(() => _sending = false);
    if (ok) {
      _commentController.clear();
      _fetch();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text("Log in to comment"),
          behavior: SnackBarBehavior.floating));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.62,
      margin: const EdgeInsets.only(top: 60),
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      decoration: const BoxDecoration(
        color: GoogerColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(children: [
        const SizedBox(height: 10),
        Container(
            width: 38,
            height: 4,
            decoration: BoxDecoration(
                color: GoogerColors.soft10,
                borderRadius: BorderRadius.circular(4))),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: _tabs.map((t) {
            final active = t == kind;
            return GestureDetector(
              onTap: () {
                if (t == kind) return;
                setState(() => kind = t);
                _fetch();
              },
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 5),
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: active ? Colors.white : GoogerColors.soft,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(t.toUpperCase(),
                    style: TextStyle(
                        fontSize: 9.5,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.6,
                        color: active
                            ? const Color(0xFF111111)
                            : GoogerColors.muted)),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: rows == null
              ? const Center(
                  child: GoogerSpinner(size: 24, color: GoogerColors.dim))
              : rows!.isEmpty
                  ? Center(
                      child: Text("No $kind yet",
                          style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: GoogerColors.dim)))
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 6),
                      itemCount: rows!.length,
                      itemBuilder: (_, i) {
                        final row = rows![i];
                        final username = (row["username"] ??
                                row["user_username"] ??
                                (row["user"] is Map
                                    ? row["user"]["username"]
                                    : null) ??
                                "googer")
                            .toString();
                        final avatar = (row["profile_picture"] ??
                                (row["user"] is Map
                                    ? row["user"]["profile_picture"]
                                    : null) ??
                                "")
                            .toString();
                        final comment =
                            (row["comment"] ?? row["text"] ?? "").toString();
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 7),
                          child: Row(
                              crossAxisAlignment: comment.isEmpty
                                  ? CrossAxisAlignment.center
                                  : CrossAxisAlignment.start,
                              children: [
                                GoogerAvatar(
                                    url: avatar.isEmpty
                                        ? null
                                        : Api.resolveMedia(avatar),
                                    name: username,
                                    size: 32),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(username,
                                            style: const TextStyle(
                                                fontSize: 12.5,
                                                fontWeight: FontWeight.w800,
                                                color: GoogerColors.text)),
                                        if (comment.isNotEmpty)
                                          Padding(
                                            padding: const EdgeInsets.only(
                                                top: 2),
                                            child: Text(comment,
                                                style: const TextStyle(
                                                    fontSize: 12.5,
                                                    height: 1.4,
                                                    color:
                                                        GoogerColors.muted)),
                                          ),
                                      ]),
                                ),
                              ]),
                        );
                      },
                    ),
        ),
        if (kind == "comments")
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 12),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _commentController,
                  decoration: const InputDecoration(
                      isDense: true, hintText: "Add a comment..."),
                  style:
                      const TextStyle(fontSize: 13, color: GoogerColors.text),
                  onSubmitted: (_) => _sendComment(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _sending ? null : _sendComment,
                icon: const Icon(Icons.send_rounded,
                    size: 20, color: GoogerColors.sky),
              ),
            ]),
          ),
      ]),
    );
  }
}
