import 'package:flutter/material.dart';

import 'profile_screen.dart';

/// Another Googer's profile. It is the same screen as your own — same header,
/// same stats, same columns — so this is a thin alias kept for the call sites
/// that already push it (chats, feed cards, search results).
class UserProfileScreen extends StatelessWidget {
  final String userId;
  final String username;
  final String displayName;
  final String avatar;

  const UserProfileScreen({
    super.key,
    this.userId = "",
    required this.username,
    required this.displayName,
    this.avatar = "",
  });

  @override
  Widget build(BuildContext context) {
    return ProfileScreen(
      userId: userId,
      username: username,
      displayName: displayName,
      avatar: avatar,
    );
  }
}
