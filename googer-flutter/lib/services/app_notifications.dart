import 'package:flutter/foundation.dart';

/// One entry in the in-app notification centre.
class AppNotice {
  final String id;
  final String type; // success | error | info | warning
  final String title;
  final String message;
  final DateTime timestamp;
  bool read;

  AppNotice({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.timestamp,
    this.read = false,
  });
}

/// In-app notification centre — the Flutter equivalent of the web's
/// `addTopbarNotification()`.
///
/// Action results (added to bag, order placed, coin collected, errors…) are
/// pushed here and surface under the topbar bell instead of as bottom toasts.
class AppNotifications {
  AppNotifications._();

  static const _maxEntries = 50;

  static final ValueNotifier<List<AppNotice>> notifier =
      ValueNotifier<List<AppNotice>>(<AppNotice>[]);

  static void add({
    required String title,
    String message = '',
    String type = 'info',
  }) {
    if (title.trim().isEmpty) return;
    final notice = AppNotice(
      id: 'notice-${DateTime.now().microsecondsSinceEpoch}',
      type: type,
      title: title.trim(),
      message: message.trim(),
      timestamp: DateTime.now(),
    );
    notifier.value = <AppNotice>[
      notice,
      ...notifier.value,
    ].take(_maxEntries).toList();
  }

  static void success(String title, [String message = '']) =>
      add(title: title, message: message, type: 'success');

  static void error(String title, [String message = '']) =>
      add(title: title, message: message, type: 'error');

  static void info(String title, [String message = '']) =>
      add(title: title, message: message, type: 'info');

  static int get unread => notifier.value.where((n) => !n.read).length;

  static void markAllRead() {
    if (notifier.value.isEmpty) return;
    for (final notice in notifier.value) {
      notice.read = true;
    }
    notifier.value = List<AppNotice>.from(notifier.value);
  }

  static void clear() => notifier.value = <AppNotice>[];
}
