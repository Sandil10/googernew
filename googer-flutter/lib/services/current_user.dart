import 'package:flutter/foundation.dart';
import 'auth_service.dart';

/// Holds the logged-in user's profile, fetched once from `GET /auth/profile`
/// and shared across screens (topbar avatar, profile screen, etc.).
class CurrentUser {
  CurrentUser._();

  static final ValueNotifier<Map<String, dynamic>?> notifier = ValueNotifier(null);

  static Map<String, dynamic>? get value => notifier.value;

  static String get name {
    final u = notifier.value;
    if (u == null) return '';
    for (final k in ['name', 'username', 'fullName', 'full_name']) {
      final v = u[k];
      if (v != null && '$v'.isNotEmpty) return '$v';
    }
    return '';
  }

  static String? get imageUrl {
    final u = notifier.value;
    if (u == null) return null;
    for (final k in ['img', 'profile_picture', 'profilePicture', 'avatar']) {
      final v = u[k];
      if (v != null && '$v'.isNotEmpty) return '$v';
    }
    return null;
  }

  /// Fetches the profile if we don't have it yet (or force-refreshes).
  static Future<void> load({bool force = false}) async {
    if (notifier.value != null && !force) return;
    try {
      final profile = await AuthService.profile();
      // Some backends wrap the user under `user` or `data`.
      final user = (profile['user'] is Map)
          ? (profile['user'] as Map).cast<String, dynamic>()
          : (profile['data'] is Map)
              ? (profile['data'] as Map).cast<String, dynamic>()
              : profile;
      notifier.value = user;
    } catch (_) {
      // Leave as null; UI falls back to a generic avatar.
    }
  }

  static void clear() => notifier.value = null;
}
