import 'package:flutter/material.dart';
import '../theme.dart';
import '../util/web_video.dart';
import 'kit.dart';

bool _looksLikeImage(String url) =>
    RegExp(r"\.(png|jpe?g|gif|webp|bmp|avif|svg)(\?.*)?$", caseSensitive: false)
        .hasMatch(url);

bool _looksLikeVideo(String url) =>
    RegExp(r"\.(mp4|webm|mov|m4v|ogg)(\?.*)?$", caseSensitive: false)
        .hasMatch(url);

/// Convert YouTube / Instagram / TikTok links to their embed players
/// (port of getVideoEmbedUrl in the web UploadContentWatchModal).
String? toEmbedUrl(String value) {
  final uri = Uri.tryParse(
      value.startsWith("http") ? value : "https://$value");
  if (uri == null) return null;
  final host = uri.host.replaceFirst(RegExp(r"^www\."), "").toLowerCase();
  final parts = uri.pathSegments.where((p) => p.isNotEmpty).toList();

  if (host == "youtu.be" && parts.isNotEmpty) {
    return "https://www.youtube.com/embed/${parts.first}?autoplay=1&playsinline=1&rel=0";
  }
  if (host.endsWith("youtube.com")) {
    var id = uri.queryParameters["v"] ?? "";
    if (id.isEmpty &&
        parts.isNotEmpty &&
        ["embed", "shorts", "live"].contains(parts.first)) {
      id = parts.length > 1 ? parts[1] : "";
    }
    if (id.isNotEmpty) {
      return "https://www.youtube.com/embed/$id?autoplay=1&playsinline=1&rel=0";
    }
  }
  if (host.contains("instagram.com") && parts.length >= 2) {
    if (["p", "reel", "tv"].contains(parts.first)) {
      return "https://www.instagram.com/${parts[0]}/${parts[1]}/embed";
    }
  }
  if (host.contains("tiktok.com")) {
    final videoIndex = parts.indexOf("video");
    if (videoIndex >= 0 && parts.length > videoIndex + 1) {
      return "https://www.tiktok.com/embed/v2/${parts[videoIndex + 1]}";
    }
  }
  return null;
}

/// Full-screen TikTok/Reels-style viewer — covers the whole page, no close
/// icon: swipe down (or the system back) to dismiss. Plays uploaded videos
/// with a real player, external links via their embed player; images render
/// full-bleed.
void openReelViewer(
  BuildContext context, {
  required String mediaUrl,
  String externalLink = "",
  bool isVideo = false,
  String thumbnail = "",
  String username = "",
  String description = "",
  String hashtags = "",
  String avatar = "",
}) {
  Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
    opaque: true,
    fullscreenDialog: true,
    transitionDuration: const Duration(milliseconds: 220),
    reverseTransitionDuration: const Duration(milliseconds: 180),
    pageBuilder: (_, __, ___) => _ReelViewer(
      mediaUrl: mediaUrl,
      externalLink: externalLink,
      isVideo: isVideo,
      thumbnail: thumbnail,
      username: username,
      description: description,
      hashtags: hashtags,
      avatar: avatar,
    ),
    transitionsBuilder: (_, animation, __, child) => FadeTransition(
      opacity: animation,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.06), end: Offset.zero)
            .animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
        child: child,
      ),
    ),
  ));
}

class _ReelViewer extends StatelessWidget {
  final String mediaUrl, externalLink, thumbnail, username, description, hashtags, avatar;
  final bool isVideo;
  const _ReelViewer({
    required this.mediaUrl,
    required this.externalLink,
    required this.isVideo,
    required this.thumbnail,
    required this.username,
    required this.description,
    required this.hashtags,
    required this.avatar,
  });

  Widget _media() {
    // 1. external source (YouTube / Instagram / TikTok) → embed player
    if (externalLink.trim().isNotEmpty) {
      final embed = toEmbedUrl(externalLink.trim());
      return webEmbed(embed ?? externalLink.trim());
    }
    final url = mediaUrl.isNotEmpty ? mediaUrl : thumbnail;
    if (url.isEmpty) {
      return const Center(
          child: Icon(Icons.broken_image_outlined,
              size: 48, color: Colors.white24));
    }
    // 2. uploaded video file → real player
    if (_looksLikeVideo(url) || (isVideo && !_looksLikeImage(url))) {
      return webVideo(url, poster: thumbnail);
    }
    // 3. image → full-bleed with pinch zoom
    return InteractiveViewer(
      child: Image.network(url,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => const Center(
              child: Icon(Icons.broken_image_outlined,
                  size: 48, color: Colors.white24))),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        // swipe down anywhere to close (no cut icon)
        onVerticalDragEnd: (details) {
          if ((details.primaryVelocity ?? 0) > 250) Navigator.pop(context);
        },
        child: Stack(fit: StackFit.expand, children: [
          _media(),
          // invisible top strip — embeds/videos swallow pointer events, this
          // keeps swipe-down/tap dismiss working without any close icon
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 72,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => Navigator.pop(context),
              onVerticalDragEnd: (details) {
                if ((details.primaryVelocity ?? 0) > 150) {
                  Navigator.pop(context);
                }
              },
            ),
          ),
          // bottom-left creator overlay, reels style
          if (username.isNotEmpty || description.isNotEmpty)
            Positioned(
              left: 16,
              right: 16,
              bottom: 24,
              child: IgnorePointer(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (username.isNotEmpty)
                        Row(children: [
                          GoogerAvatar(
                              url: avatar.isEmpty ? null : avatar,
                              name: username,
                              size: 30),
                          const SizedBox(width: 8),
                          Text(username,
                              style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  shadows: [
                                    Shadow(blurRadius: 8, color: Colors.black)
                                  ])),
                        ]),
                      if (description.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(description,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 13,
                                height: 1.4,
                                color: Colors.white,
                                shadows: [
                                  Shadow(blurRadius: 8, color: Colors.black)
                                ])),
                      ],
                      if (hashtags.isNotEmpty) ...[
                        const SizedBox(height: 3),
                        Text(hashtags,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 12,
                                color: GoogerColors.redLight,
                                shadows: [
                                  Shadow(blurRadius: 8, color: Colors.black)
                                ])),
                      ],
                    ]),
              ),
            ),
        ]),
      ),
    );
  }
}
