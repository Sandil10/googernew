import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../services/app_notifications.dart';
import '../widgets/app_back_button.dart';
import '../theme/colors.dart';

/// Notification centre — the topbar bell opens this.
///
/// Shows both the real backend notifications (GET /notifications) and the
/// in-app action results that used to appear as bottom toasts
/// (web parity: `addTopbarNotification`).
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _server = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    // Opening the centre clears the unread badge.
    AppNotifications.markAllRead();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    final items = await Api.notifications();
    if (!mounted) return;
    setState(() {
      _server = items;
      _loading = false;
    });
    Api.markAllNotificationsRead();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        leading: const AppBackButton.appBar(),
        title: const Text('Notifications',
            style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w500,
                color: Colors.white)),
        actions: [
          TextButton(
            onPressed: () {
              AppNotifications.clear();
              setState(() {});
            },
            child: const Text('Clear',
                style: TextStyle(fontSize: 11.5, color: AppColors.textGray400)),
          ),
        ],
        bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1),
            child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ValueListenableBuilder<List<AppNotice>>(
        valueListenable: AppNotifications.notifier,
        builder: (context, local, __) {
          if (_loading && local.isEmpty) {
            return const Center(
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                    color: AppColors.textGray400, strokeWidth: 2),
              ),
            );
          }
          if (local.isEmpty && _server.isEmpty) {
            return const Center(
              child: Text('No notifications yet',
                  style:
                      TextStyle(fontSize: 12.5, color: AppColors.textGray500)),
            );
          }
          return RefreshIndicator(
            color: AppColors.textGray300,
            backgroundColor: AppColors.bg1,
            onRefresh: _load,
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [
                ...local.map(_localTile),
                ..._server.map(_serverTile),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _localTile(AppNotice notice) {
    final style = _styleFor(notice.type);
    return _tile(
      title: notice.title,
      subtitle: notice.message,
      icon: style.$1,
      color: style.$2,
      time: Api.relativeTime(notice.timestamp.toIso8601String()),
    );
  }

  Widget _serverTile(Map<String, dynamic> item) {
    String pick(List<String> keys) {
      for (final key in keys) {
        final value = item[key];
        if (value != null && '$value'.trim().isNotEmpty) return '$value';
      }
      return '';
    }

    final type = pick(['type', 'category', 'kind']).toLowerCase();
    final style = _styleFor(type);
    return _tile(
      title: pick(['title', 'heading', 'message', 'text']),
      subtitle: pick(['message', 'body', 'description', 'text']),
      icon: style.$1,
      color: style.$2,
      time: Api.relativeTime(pick(['created_at', 'createdAt', 'timestamp'])),
    );
  }

  /// (icon, colour) per notification type.
  (IconData, Color) _styleFor(String type) {
    switch (type) {
      case 'success':
        return (Ionicons.checkmark_circle, AppColors.successGreen);
      case 'error':
      case 'warning':
        return (Ionicons.alert_circle, AppColors.likeRed);
      case 'like':
        return (Ionicons.heart, AppColors.likeRed);
      case 'comment':
        return (Ionicons.chatbubble, AppColors.utilityBlue);
      case 'order':
        return (Ionicons.cube, AppColors.successGreen);
      case 'follow':
        return (Ionicons.person_add, AppColors.pink);
      case 'wallet':
      case 'payment':
        return (Ionicons.wallet, AppColors.accentPurple);
      default:
        return (Ionicons.notifications, AppColors.textGray400);
    }
  }

  Widget _tile({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required String time,
  }) {
    if (title.isEmpty && subtitle.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.bg2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withOpacity(0.16),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title.isEmpty ? subtitle : title,
                    style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: Colors.white)),
                if (subtitle.isNotEmpty && title.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(subtitle,
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.textGray500)),
                  ),
              ],
            ),
          ),
          if (time.isNotEmpty)
            Text(time,
                style: const TextStyle(
                    fontSize: 10, color: AppColors.textGray600)),
        ],
      ),
    );
  }
}
