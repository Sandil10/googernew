import 'dart:ui';

import 'package:flutter/material.dart';
import '../services/app_session.dart';
import '../services/googer_api.dart';
import '../theme/app_colors.dart';
import '../widgets/section_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _query = '';
  String _topic = 'ALL';
  late Future<_HomeData> _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future = _load();
  }

  Future<_HomeData> _load() async {
    final api = SessionScope.of(context).api;
    final results = await Future.wait([
      api.getHomeFeed(),
      api.getUploadContents(),
    ]);
    return _HomeData(
      posts: results[0] as List<FeedItem>,
      uploads: results[1] as List<UploadContent>,
    );
  }

  List<Widget> _mixedFeed(_HomeData data) {
    final query = _query.trim().toLowerCase();
    final posts = data.posts.where((p) {
      return query.isEmpty ||
          p.text.toLowerCase().contains(query) ||
          p.username.toLowerCase().contains(query) ||
          p.name.toLowerCase().contains(query);
    }).toList();
    final uploads = data.uploads.where((u) {
      final matchesTopic = _topic == 'ALL' || u.topic == _topic;
      final matchesQuery = query.isEmpty ||
          u.description.toLowerCase().contains(query) ||
          u.username.toLowerCase().contains(query);
      return matchesTopic && matchesQuery;
    }).toList();

    if (_topic != 'ALL') {
      return uploads.map((u) => _UploadCard(item: u)).toList();
    }

    final out = <Widget>[];
    var postIndex = 0;
    var uploadIndex = 0;
    while (postIndex < posts.length || uploadIndex < uploads.length) {
      for (var i = 0; i < 2 && postIndex < posts.length; i++) {
        out.add(_GoogCard(post: posts[postIndex++]));
      }
      if (uploadIndex < uploads.length) {
        out.add(_UploadCard(item: uploads[uploadIndex++]));
      }
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_HomeData>(
      future: _future,
      builder: (context, snapshot) {
        final data = snapshot.data ?? const _HomeData(posts: [], uploads: []);
        final topics = <String>{'ALL', ...data.uploads.map((u) => u.topic)}.toList();
        return RefreshIndicator(
          color: Colors.white,
          backgroundColor: AppColors.surface,
          onRefresh: () async => setState(() => _future = _load()),
          child: ListView(
            children: [
              Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
          child: TextField(
            onChanged: (value) => setState(() => _query = value),
            decoration: InputDecoration(
              hintText: 'Search Googs',
              hintStyle:
                  const TextStyle(color: AppColors.textMuted, fontSize: 13),
              prefixIcon: const Icon(Icons.search,
                  size: 18, color: AppColors.textMuted),
              filled: true,
              fillColor: Colors.white.withValues(alpha: 0.06),
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(999),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(999),
                borderSide: const BorderSide(color: AppColors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(999),
                borderSide: const BorderSide(color: AppColors.textFaint),
              ),
            ),
            style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
          ),
        ),
              SizedBox(
          height: 36,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            scrollDirection: Axis.horizontal,
            itemBuilder: (_, i) {
              final topic = topics[i];
              return PillChip(
                label: topic,
                selected: _topic == topic,
                onTap: () => setState(() => _topic = topic),
              );
            },
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemCount: topics.length,
          ),
        ),
              const SizedBox(height: 6),
              if (snapshot.connectionState == ConnectionState.waiting)
                const Padding(
                  padding: EdgeInsets.all(28),
                  child: Center(child: CircularProgressIndicator(color: Colors.white)),
                )
              else if (snapshot.hasError)
                _StateMessage(text: snapshot.error.toString().replaceFirst('Exception: ', ''))
              else if (_mixedFeed(data).isEmpty)
                const _StateMessage(text: 'No real Googs or upload content found yet.')
              else
                ..._mixedFeed(data),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }
}

class _HomeData {
  final List<FeedItem> posts;
  final List<UploadContent> uploads;

  const _HomeData({required this.posts, required this.uploads});
}

class _StateMessage extends StatelessWidget {
  const _StateMessage({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 28),
      child: SectionCard(
        color: AppColors.surface,
        child: Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
      ),
    );
  }
}

class _GoogCard extends StatefulWidget {
  final FeedItem post;

  const _GoogCard({required this.post});

  @override
  State<_GoogCard> createState() => _GoogCardState();
}

class _GoogCardState extends State<_GoogCard> {
  bool liked = false;
  late int likes = widget.post.likes;

  String _fmt(int value) =>
      value > 999 ? '${(value / 1000).toStringAsFixed(1)}k' : '$value';

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 13),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.border))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _Avatar(url: post.avatar, name: post.name, size: 40),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  post.username,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary),
                ),
              ),
              const SizedBox(width: 5),
              const _VerifiedBadge(color: AppColors.accentBlue),
              const SizedBox(width: 7),
              Text(post.time,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.textMuted)),
              const Spacer(),
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    shape: BoxShape.circle),
                child: const Icon(Icons.more_vert,
                    size: 18, color: AppColors.textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 10),
              _RichGoogText(post.text),
          const SizedBox(height: 14),
          Row(
            children: [
              _action(
                icon: liked ? Icons.favorite : Icons.favorite_border,
                count: likes,
                color: liked ? AppColors.accentRed : AppColors.textPrimary,
                onTap: () => setState(() {
                  liked = !liked;
                  likes += liked ? 1 : -1;
                }),
              ),
              _action(icon: Icons.remove_red_eye_outlined, count: post.views),
              _action(icon: Icons.mode_comment_outlined, count: post.comments),
              _action(icon: Icons.share_outlined, count: post.shares),
            ],
          ),
        ],
      ),
    );
  }

  Widget _action(
      {required IconData icon,
      required int count,
      Color color = AppColors.textPrimary,
      VoidCallback? onTap}) {
    return Padding(
      padding: const EdgeInsets.only(right: 24),
      child: GestureDetector(
        onTap: onTap,
        child: Row(
          children: [
            Icon(icon, size: 21, color: color),
            if (count > 0) ...[
              const SizedBox(width: 5),
              Text(_fmt(count),
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textSecondary)),
            ],
          ],
        ),
      ),
    );
  }
}

class _UploadCard extends StatefulWidget {
  final UploadContent item;

  const _UploadCard({required this.item});

  @override
  State<_UploadCard> createState() => _UploadCardState();
}

class _UploadCardState extends State<_UploadCard> {
  bool subscribed = false;
  bool liked = false;

  String _fmt(int value) =>
      value > 999 ? '${(value / 1000).toStringAsFixed(1)}k' : '$value';

  @override
  Widget build(BuildContext context) {
    final item = widget.item;

    return Container(
      margin: const EdgeInsets.fromLTRB(14, 6, 14, 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _Avatar(url: item.avatar, name: item.name, size: 38),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.username,
                      style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary)),
                  Text(item.time,
                      style: const TextStyle(
                          fontSize: 10.5, color: AppColors.textMuted)),
                ],
              ),
              const Spacer(),
              GestureDetector(
                onTap: () => setState(() => subscribed = !subscribed),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
                  decoration: BoxDecoration(
                    color: subscribed
                        ? Colors.white.withValues(alpha: 0.10)
                        : Colors.white,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    subscribed ? 'SUBSCRIBED' : 'SUBSCRIBE',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                      color: subscribed ? AppColors.textPrimary : Colors.black,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    shape: BoxShape.circle),
                child: const Icon(Icons.more_vert,
                    size: 17, color: AppColors.textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: 1,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (item.mediaUrl.isNotEmpty)
                    Image.network(
                      item.mediaUrl,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          Container(color: AppColors.surfaceRaised),
                    )
                  else
                    Container(
                      color: AppColors.surfaceRaised,
                      alignment: Alignment.center,
                      child: const Icon(Icons.image_not_supported_outlined, color: AppColors.textFaint),
                    ),
                  if (item.coins > 0)
                    BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                      child: Container(
                          color: Colors.black.withValues(alpha: 0.25)),
                    ),
                  Positioned(
                    top: 12,
                    left: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.55),
                          borderRadius: BorderRadius.circular(999)),
                      child: Text(
                        item.topic,
                        style: const TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                            color: Colors.white),
                      ),
                    ),
                  ),
                  Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                      decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.75),
                          borderRadius: BorderRadius.circular(999)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.play_arrow,
                              size: 15, color: Colors.white),
                          const SizedBox(width: 5),
                          const Text('WATCH NOW',
                              style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white)),
                          if (item.coins > 0) ...[
                            Container(
                                width: 1,
                                height: 12,
                                margin:
                                    const EdgeInsets.symmetric(horizontal: 9),
                                color: Colors.white30),
                            Text('${item.coins} Coins',
                                style: const TextStyle(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white)),
                          ],
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 14,
                    right: 14,
                    bottom: 12,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.description,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: Colors.white),
                        ),
                        Text(
                          item.topic,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11.5, color: AppColors.accentRedLight),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _uploadAction(
                liked ? Icons.favorite : Icons.favorite_border,
                liked ? item.likes + 1 : item.likes,
                color: liked ? AppColors.accentRed : AppColors.textPrimary,
                onTap: () => setState(() => liked = !liked),
              ),
              _uploadAction(Icons.repeat, 2),
              _uploadAction(Icons.remove_red_eye_outlined, item.views),
              _uploadAction(Icons.mode_comment_outlined, item.comments),
              _uploadAction(Icons.share_outlined, item.shares),
            ],
          ),
        ],
      ),
    );
  }

  Widget _uploadAction(IconData icon, int count,
      {Color color = AppColors.textPrimary, VoidCallback? onTap}) {
    return Padding(
      padding: const EdgeInsets.only(right: 21),
      child: GestureDetector(
        onTap: onTap,
        child: Row(
          children: [
            Icon(icon, size: 20, color: color),
            if (count > 0) ...[
              const SizedBox(width: 5),
              Text(_fmt(count),
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textSecondary)),
            ],
          ],
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String url;
  final String name;
  final double size;

  const _Avatar({required this.url, required this.name, required this.size});

  @override
  Widget build(BuildContext context) {
    final initials = name.trim().isEmpty
        ? 'G'
        : name
            .trim()
            .split(RegExp(r'\s+'))
            .take(2)
            .map((part) => part[0].toUpperCase())
            .join();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.border),
        image: DecorationImage(image: NetworkImage(url), fit: BoxFit.cover),
      ),
      alignment: Alignment.center,
      child: Text(initials,
          style: TextStyle(
              fontSize: size * 0.32,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary)),
    );
  }
}

class _VerifiedBadge extends StatelessWidget {
  final Color color;

  const _VerifiedBadge({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 14,
      height: 14,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: const Icon(Icons.check, size: 10, color: Colors.white),
    );
  }
}

class _RichGoogText extends StatelessWidget {
  final String text;

  const _RichGoogText(this.text);

  @override
  Widget build(BuildContext context) {
    const base = TextStyle(fontSize: 15, height: 1.45, color: AppColors.textPrimary);
    final spans = <TextSpan>[];
    final regex = RegExp(r'((?:https?://|www\.)\S+|@\w+|#\w+)');
    var last = 0;
    for (final match in regex.allMatches(text)) {
      if (match.start > last) {
        spans.add(TextSpan(text: text.substring(last, match.start)));
      }
      final token = match.group(0)!;
      final isLink = token.startsWith('http') || token.startsWith('www.');
      spans.add(
        TextSpan(
          text: token,
          style: TextStyle(
            color: isLink ? AppColors.accentBlue : AppColors.accentRedLight,
            decoration: isLink ? TextDecoration.underline : null,
          ),
        ),
      );
      last = match.end;
    }
    if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
    return Text.rich(TextSpan(style: base, children: spans));
  }
}
