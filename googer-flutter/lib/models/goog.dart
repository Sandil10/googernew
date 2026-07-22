import 'package:flutter/material.dart';
import '../theme/colors.dart';

class Goog {
  final String name;
  final String time;
  final String text;
  final int likes;
  final int comments;
  final String views;
  final int shares;
  final bool liked;
  final Color avatarBg;
  final String? imageUrl; // author profile picture URL (user.img)

  const Goog({
    required this.name,
    required this.time,
    required this.text,
    required this.likes,
    required this.comments,
    required this.views,
    required this.shares,
    required this.liked,
    required this.avatarBg,
    this.imageUrl,
  });

  String get initial => name.isNotEmpty ? name[0].toUpperCase() : '?';

  /// Builds a Goog from a backend `/googs` item.
  /// The real API nests author info under `user` ({ name, username, img }).
  factory Goog.fromJson(Map<String, dynamic> j, {Color? avatarBg}) {
    final user = (j['user'] is Map) ? (j['user'] as Map).cast<String, dynamic>() : const <String, dynamic>{};

    String pick(Map<String, dynamic> m, List<String> keys, [String fallback = '']) {
      for (final k in keys) {
        final v = m[k];
        if (v != null && '$v'.isNotEmpty) return '$v';
      }
      return fallback;
    }

    int i(List<String> keys) {
      for (final k in keys) {
        final v = j[k];
        if (v is num) return v.toInt();
        if (v is String && int.tryParse(v) != null) return int.parse(v);
      }
      return 0;
    }

    final img = pick(user, ['img', 'profile_picture', 'profilePicture', 'avatar']);

    return Goog(
      name: pick(user, ['name', 'username'], pick(j, ['name', 'username'], 'User')),
      time: _relativeTime(pick(j, ['createdAt', 'created_at'])),
      text: pick(j, ['text', 'content', 'body', 'caption']),
      likes: i(['likes', 'like_count', 'likesCount']),
      comments: i(['comments', 'comment_count', 'commentsCount']),
      views: i(['views', 'view_count', 'viewsCount']).toString(),
      shares: i(['shares', 'share_count', 'sharesCount']),
      liked: j['liked'] == true || j['is_liked'] == true,
      avatarBg: avatarBg ?? AppColors.avatarPalette[0],
      imageUrl: img.isEmpty ? null : img,
    );
  }

  /// Turns an ISO timestamp into a short relative label like "· 3h".
  static String _relativeTime(String iso) {
    if (iso.isEmpty) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return '· now';
    if (diff.inMinutes < 60) return '· ${diff.inMinutes}m';
    if (diff.inHours < 24) return '· ${diff.inHours}h';
    if (diff.inDays < 7) return '· ${diff.inDays}d';
    return '· ${(diff.inDays / 7).floor()}w';
  }
}

final List<Goog> demoGoogs = [
  Goog(name: 'Mira K.', time: '· 2h', text: 'first goog of the day. googer.app just hit different on a monday', likes: 42, comments: 8, views: '1.2k', shares: 3, liked: true, avatarBg: AppColors.avatarPalette[0]),
  Goog(name: 'Devan S.', time: '· 4h', text: 'hot take: notifications belong on the LEFT side of the topbar. fight me.', likes: 211, comments: 47, views: '9.4k', shares: 11, liked: false, avatarBg: AppColors.avatarPalette[1]),
  Goog(name: 'aurora.exe', time: '· 6h', text: 'just promoted my profile for 200 coins. feels expensive. feels worth it.', likes: 18, comments: 3, views: '612', shares: 1, liked: false, avatarBg: AppColors.avatarPalette[2]),
  Goog(name: 'rohit_p', time: '· 9h', text: 'sold three packs of ginger candy on Shop in one hour. unhinged behavior.', likes: 86, comments: 12, views: '2.1k', shares: 4, liked: true, avatarBg: AppColors.avatarPalette[3]),
];
