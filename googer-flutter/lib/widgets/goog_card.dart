import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import 'goog_menu.dart';
import 'interaction_sheet.dart';
import 'kit.dart';
import 'share_sheet.dart';

/// Goog feed post — matches the live web app card:
/// avatar · bold username · badge · time · ⋮ menu, colored goog text,
/// heart / eye / comment / share icons with counts, all wired to the backend.
class GoogCard extends StatefulWidget {
  final GoogPost post;
  const GoogCard(this.post);

  @override
  State<GoogCard> createState() => _GoogCardState();
}

class _GoogCardState extends State<GoogCard> {
  late bool liked = widget.post.liked;
  late int likes = widget.post.likes;
  bool subscribed = false;
  bool _subscribing = false;
  bool hidden = false;
  bool viewSent = false;

  String get shareUrl => widget.post.shareCode.isEmpty
      ? "https://googer.site/home"
      : "https://googer.site/share/${widget.post.shareCode}";

  String _fmt(int n) => n > 999 ? "${(n / 1000).toStringAsFixed(1)}k" : "$n";

  @override
  void initState() {
    super.initState();
    // count a view once when the card is built (web uses IntersectionObserver)
    if (!viewSent) {
      viewSent = true;
      Api.markGoogView(widget.post.id);
    }
  }

  Future<void> _toggleLike() async {
    setState(() {
      liked = !liked;
      likes += liked ? 1 : -1;
    });
    final res = await Api.toggleGoogLike(widget.post.id);
    if (res == null && mounted) {
      // roll back the optimistic like and say why it failed
      setState(() {
        liked = !liked;
        likes += liked ? 1 : -1;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(Api.loggedIn
                ? "Could not update the like. Please try again."
                : "Log in to like Googs"),
            behavior: SnackBarBehavior.floating),
      );
    }
  }

  void _share() {
    Api.shareGoog(widget.post.id);
    showShareSheet(context, title: widget.post.text, url: shareUrl);
  }

  Future<void> _toggleSubscribe() async {
    if (_subscribing) return;
    _subscribing = true;
    setState(() => subscribed = !subscribed);
    final result = await Api.toggleGoogSubscribe(widget.post.id);
    _subscribing = false;
    if (!mounted) return;
    if (result == null) {
      setState(() => subscribed = !subscribed); // roll back
      if (!Api.loggedIn) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text("Log in to subscribe"),
            behavior: SnackBarBehavior.floating));
      }
    } else if (result != subscribed) {
      setState(() => subscribed = result);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (hidden) return const SizedBox.shrink();
    final post = widget.post;
    final isOwn = Api.loggedIn && post.username == Api.username;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: GoogerColors.borderSoft))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // header row — avatar · name · time · Subscribe · •••
        Row(children: [
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, "/profile/user", arguments: post.username),
            child: GoogerAvatar(url: post.img, name: post.name, size: 38),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: GestureDetector(
              onTap: () => Navigator.pushNamed(context, "/profile/user", arguments: post.username),
              child: Text(post.username,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: GoogerColors.text)),
            ),
          ),
          const SizedBox(width: 6),
          Text("· ${post.time}", style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.dim)),
          const Spacer(),
          if (!isOwn) ...[
            SubscribePill(subscribed: subscribed, onTap: _toggleSubscribe),
            const SizedBox(width: 4),
          ],
          GestureDetector(
            onTap: () => showGoogMenu(
              context,
              googId: post.id,
              shareUrl: shareUrl,
              title: post.text,
              isOwn: isOwn,
              googText: post.text,
              onHide: () => setState(() => hidden = true),
              onDeleted: () => setState(() => hidden = true),
            ),
            // opaque: make the whole padded area tappable, not just the dots
            behavior: HitTestBehavior.opaque,
            child: const Padding(
              padding: EdgeInsets.all(10),
              child: TwoDotsIcon(),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.only(left: 48),
          child: _RichGoogText(post.text, color: post.textColor != null ? Color(post.textColor!) : null),
        ),
        const SizedBox(height: 14),
        // action row — icons with counts beside them (no summary line)
        Padding(
          padding: const EdgeInsets.only(left: 48),
          child: Row(children: [
            _action(
              icon: liked ? Icons.favorite : Icons.favorite_border,
              count: likes,
              color: liked ? GoogerColors.red : GoogerColors.text,
              onTap: _toggleLike,
              onLongPress: () => showInteractionSheet(context, post.id, "likes"),
            ),
            _action(
              icon: Icons.chat_bubble_outline,
              count: post.comments,
              onTap: () => showInteractionSheet(context, post.id, "comments"),
            ),
            _action(
              icon: Icons.remove_red_eye_outlined,
              count: post.views,
              onTap: () => showInteractionSheet(context, post.id, "views"),
            ),
            _action(
              icon: Icons.share_outlined,
              count: post.shares,
              onTap: _share,
              onLongPress: () => showInteractionSheet(context, post.id, "shares"),
            ),
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
                    fontSize: 12, fontWeight: FontWeight.w700, color: GoogerColors.muted)),
          ],
        ]),
      ),
    );
  }
}

/// Red-tinted "Subscribe" pill matching the installed-app design.
class SubscribePill extends StatelessWidget {
  final bool subscribed;
  final VoidCallback onTap;
  const SubscribePill({super.key, required this.subscribed, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 7),
        decoration: BoxDecoration(
          color: subscribed
              ? GoogerColors.soft6
              : GoogerColors.red.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
              color: subscribed
                  ? GoogerColors.line
                  : GoogerColors.red.withValues(alpha: 0.45)),
        ),
        child: Text(
          subscribed ? "Subscribed" : "Subscribe",
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: subscribed ? GoogerColors.muted : const Color(0xFFF16A5F),
          ),
        ),
      ),
    );
  }
}

class _RichGoogText extends StatelessWidget {
  final String text;
  final Color? color;
  const _RichGoogText(this.text, {this.color});

  @override
  Widget build(BuildContext context) {
    final base = TextStyle(fontSize: 15, height: 1.45, color: color ?? GoogerColors.text, letterSpacing: 0.1);
    final spans = <TextSpan>[];
    final regex = RegExp(r"((?:https?://|www\.)\S+|@\w+|#\w+)");
    int last = 0;
    for (final m in regex.allMatches(text)) {
      if (m.start > last) spans.add(TextSpan(text: text.substring(last, m.start)));
      final token = m.group(0)!;
      final isLink = token.startsWith("http") || token.startsWith("www.");
      spans.add(TextSpan(
        text: token,
        style: TextStyle(
          color: isLink ? GoogerColors.blue : const Color(0xFFF87171),
          decoration: isLink ? TextDecoration.underline : null,
        ),
      ));
      last = m.end;
    }
    if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
    return Text.rich(TextSpan(style: base, children: spans));
  }
}
