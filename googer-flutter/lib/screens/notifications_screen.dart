import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// 1n · Notifications
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        title: const Text('Notifications', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _notificationTile('Mira K. liked your goog', 'Hey, that topbar bell fix is 🔥', Ionicons.heart, AppColors.likeRed, '2m'),
          _notificationTile('Devan S. commented', 'on your product listing', Ionicons.chatbubble, AppColors.utilityBlue, '15m'),
          _notificationTile('Order shipped!', 'Your ginger candy pack is on the way', Ionicons.cube, AppColors.successGreen, '1h'),
          _notificationTile('New follower', 'aurora.exe started following you', Ionicons.person_add, AppColors.pink, '3h'),
          _notificationTile('Payment received', '₹500 from your Shop sales', Ionicons.wallet, AppColors.accentPurple, '5h'),
        ],
      ),
    );
  }

  Widget _notificationTile(String title, String subtitle, IconData icon, Color color, String time) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.bg2,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 20, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
                Text(subtitle, style: const TextStyle(fontSize: 11, color: AppColors.textGray500)),
              ],
            ),
          ),
          Text(time, style: const TextStyle(fontSize: 10, color: AppColors.textGray600)),
        ],
      ),
    );
  }
}
