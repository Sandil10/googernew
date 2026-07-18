import 'dart:ui';
import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import 'goog_card.dart' show SubscribePill;
import 'interaction_sheet.dart';
import 'kit.dart';
import 'reel_viewer.dart';
import 'share_sheet.dart';

/// Vault / Flash upload-content feed card — matches the web UploadContentFeedCard:
/// header (avatar · username · time · SUBSCRIBE · ⋮), blurred locked media with
/// topic badge and "▶ WATCH NOW | X Coins", description + red hashtags,
/// heart / repost / eye / comment / share row.
class UploadContentCard extends StatefulWidget {
  final UploadContent content;
  const UploadContentCard(this.content);

  @override
  State<UploadContentCard> createState() => _UploadContentCardState();
}

class _UploadContentCardState extends State<UploadContentCard> {
  late bool liked = widget.content.liked;
  late int likes = widget.content.likes;
  late bool hasAccess = widget.content.hasAccess || widget.content.coins <= 0;
  late bool reposted = widget.content.userReposted;
  late int reposts = widget.content.reposts;
  late int shares = widget.content.shares;
  bool subscribed = false;

  String _fmt(int n) => n > 999 ? "${(n / 1000).toStringAsFixed(1)}k" : "$n";

  Future<void> _watch() async {
    final c = widget.content;
    if (hasAccess) {
      _play();
      return;
    }
    // Unlock dialog — mirrors the web watch modal (coins deducted from wallet)
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: GoogerColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text("Unlock content", style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: GoogerColors.text)),
        content: Text(
          "Watch this ${c.type} content for ${c.coins.toStringAsFixed(0)} Rupier coins?\nCoins are paid from your wallet to @${c.username}.",
          style: const TextStyle(fontSize: 13, height: 1.5, color: GoogerColors.muted),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("Cancel", style: TextStyle(color: GoogerColors.dim))),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(120, 40)),
            onPressed: () => Navigator.pop(context, true),
            child: Text("Pay ${c.coins.toStringAsFixed(0)} coins"),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final resellerRef = c.type.toLowerCase() == "vault" ? c.resellerRef : null;
    final err = await Api.purchaseUploadContent(c.id, resellerRef: resellerRef);
    if (!mounted) return;
    if (err == null) {
      setState(() => hasAccess = true);
      _play();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err), behavior: SnackBarBehavior.floating));
    }
  }

  void _play() {
    final c = widget.content;
    Api.markUploadView(c.id);
    // full-screen reels-style viewer — whole page covered, swipe down to close
    openReelViewer(
      context,
      mediaUrl: c.mediaUrl,
      externalLink: c.externalLink,
      isVideo: c.mediaType.toLowerCase().contains("video"),
      thumbnail: c.thumbnail,
      username: c.username,
      description: c.description,
      hashtags: c.hashtags,
      avatar: c.avatar,
    );
  }

  Future<void> _repost() async {
    final c = widget.content;
    if (reposted) {
      final nextCount = await Api.removeUploadRepost(c.id);
      if (!mounted) return;
      setState(() {
        reposted = false;
        reposts = nextCount ?? (reposts > 0 ? reposts - 1 : 0);
      });
      return;
    }

    final result = await Api.repostUploadContent(c.id);
    if (!mounted) return;
    final error = result.error;
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error), behavior: SnackBarBehavior.floating));
      return;
    }
    setState(() {
      reposted = true;
      reposts = result.reposts ?? (result.alreadyReposted ? reposts : reposts + 1);
    });
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Reposted to your profile"), behavior: SnackBarBehavior.floating));
  }

  void _share() {
    final c = widget.content;
    setState(() => shares += 1);
    Api.shareUploadContent(c.id).then((nextCount) {
      if (mounted && nextCount != null) setState(() => shares = nextCount);
    });
    final shareCode = c.contentId.isNotEmpty ? c.contentId : c.id.toString();
    showShareSheet(context, title: c.description, url: "${Api.base}/reel/$shareCode");
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
            leading: const Icon(Icons.share_outlined, size: 20, color: GoogerColors.blue),
            title: const Text("Share Link", style: TextStyle(fontSize: 13.5)),
            onTap: () {
              Navigator.pop(sheetContext);
              _share();
            },
          ),
          ListTile(
            leading: const Icon(Icons.repeat, size: 20, color: GoogerColors.green),
            title: Text(reposted ? "Remove Repost" : "Repost",
                style: const TextStyle(fontSize: 13.5)),
            onTap: () {
              Navigator.pop(sheetContext);
              _repost();
            },
          ),
          ListTile(
            leading: const Icon(Icons.flag_outlined, size: 20, color: GoogerColors.red),
            title: const Text("Report",
                style: TextStyle(fontSize: 13.5, color: GoogerColors.red)),
            onTap: () {
              Navigator.pop(sheetContext);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                  content: Text("Report submitted. Thank you."),
                  behavior: SnackBarBehavior.floating));
            },
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.content;
    return Container(
      padding: const EdgeInsets.only(top: 14, bottom: 12),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: GoogerColors.borderSoft))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(children: [
            GoogerAvatar(url: c.avatar, name: c.fullName, size: 38),
            const SizedBox(width: 10),
            Flexible(
              child: Text(c.username,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: GoogerColors.text)),
            ),
            const SizedBox(width: 6),
            Text("· ${c.time}", style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.dim)),
            const Spacer(),
            SubscribePill(
              subscribed: subscribed,
              onTap: () => setState(() => subscribed = !subscribed),
            ),
            const SizedBox(width: 4),
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
        const SizedBox(height: 10),
        // media — Instagram-style: full width, natural height,
        // blurred when locked, topic badge + WATCH NOW pill on top.
        // Tapping the media (first view) opens the full-screen second view.
        GestureDetector(
          onTap: _watch,
          child: Stack(children: [
          // base child sizes the stack to the media's natural aspect
          if (c.thumbnail.isNotEmpty)
            Image.network(
              c.thumbnail,
              width: double.infinity,
              fit: BoxFit.fitWidth,
              errorBuilder: (_, __, ___) => AspectRatio(
                  aspectRatio: 4 / 3,
                  child: Container(color: const Color(0xFF3A2A20))),
              loadingBuilder: (context, child, progress) => progress == null
                  ? child
                  : AspectRatio(
                      aspectRatio: 4 / 3,
                      child: Container(color: GoogerColors.soft6)),
            )
          else
            const AspectRatio(
              aspectRatio: 4 / 3,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF4A3020), Color(0xFF1A1512)],
                  ),
                ),
              ),
            ),
          Positioned.fill(
            child: Stack(fit: StackFit.expand, children: [
              if (!hasAccess)
                ClipRect(
                  child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                      child: Container(color: Colors.black26)),
                ),
              // topic badge
              Positioned(
                top: 12,
                left: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(999)),
                  child: Text(c.topic.toUpperCase(),
                      style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: Colors.white)),
                ),
              ),
              // WATCH NOW pill
              Center(
                child: GestureDetector(
                  onTap: _watch,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.75), borderRadius: BorderRadius.circular(999)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.play_arrow, size: 15, color: Colors.white),
                      const SizedBox(width: 5),
                      const Text("WATCH NOW",
                          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1, color: Colors.white)),
                      if (!hasAccess && c.coins > 0) ...[
                        Container(width: 1, height: 12, margin: const EdgeInsets.symmetric(horizontal: 9), color: Colors.white30),
                        Text("${c.coins.toStringAsFixed(0)} Coins",
                            style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, color: Colors.white)),
                      ],
                    ]),
                  ),
                ),
              ),
              // description + hashtags on media (like web)
              Positioned(
                left: 14,
                right: 14,
                bottom: 12,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (c.description.isNotEmpty)
                    Text(c.description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                  if (c.hashtags.isNotEmpty)
                    Text(c.hashtags,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11.5, color: Color(0xFFF87171))),
                ]),
              ),
            ]),
          ),
          ]),
        ),
        const SizedBox(height: 12),
        // action row: icons with counts beside them (no summary line)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(children: [
            _action(
              icon: liked ? Icons.favorite : Icons.favorite_border,
              count: likes,
              color: liked ? GoogerColors.red : GoogerColors.text,
              onTap: () {
                setState(() {
                  liked = !liked;
                  likes += liked ? 1 : -1;
                });
                Api.likeUploadContent(c.id);
              },
            ),
            _action(
                icon: Icons.chat_bubble_outline,
                count: c.comments,
                onTap: () => showInteractionSheet(context, c.id, "comments")),
            _action(
                icon: Icons.remove_red_eye_outlined,
                count: c.views,
                onTap: () => showInteractionSheet(context, c.id, "views")),
            _action(icon: Icons.repeat, onTap: _repost, color: reposted ? GoogerColors.green : GoogerColors.text),
            _action(
              icon: Icons.share_outlined,
              count: shares,
              onTap: _share,
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _action({required IconData icon, required VoidCallback onTap, int count = 0, Color color = GoogerColors.text}) {
    return Padding(
      padding: const EdgeInsets.only(right: 22),
      child: GestureDetector(
        onTap: onTap,
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
