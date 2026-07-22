import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';

enum GoogerTab { home, shop, wallet, chats }

/// Shared 58dp bottom nav (Home / Shop / Add / Wallet / Chats) matching the HTML 1:1.
class GoogerBottomNav extends StatelessWidget {
  final GoogerTab active;
  final ValueChanged<GoogerTab>? onTap;
  final VoidCallback? onAddTap;

  const GoogerBottomNav({super.key, required this.active, this.onTap, this.onAddTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bg1,
        border: Border(top: BorderSide(color: AppColors.border1, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: Container(
      height: 58,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _NavItem(
            label: 'Home',
            iconOutline: Ionicons.home_outline,
            iconFilled: Ionicons.home,
            active: active == GoogerTab.home,
            onTap: () => onTap?.call(GoogerTab.home),
          ),
          _NavItem(
            label: 'Shop',
            iconOutline: Ionicons.bag_outline,
            iconFilled: Ionicons.bag,
            active: active == GoogerTab.shop,
            onTap: () => onTap?.call(GoogerTab.shop),
          ),
          GestureDetector(
            onTap: onAddTap,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: const Icon(Ionicons.add_circle, size: 20, color: AppColors.textGray400),
                ),
                const SizedBox(height: 4),
                Text('Add', style: AppText.navLabel),
              ],
            ),
          ),
          _NavItem(
            label: 'Wallet',
            iconOutline: Ionicons.wallet_outline,
            iconFilled: Ionicons.wallet,
            active: active == GoogerTab.wallet,
            onTap: () => onTap?.call(GoogerTab.wallet),
          ),
          _NavItem(
            label: 'Chats',
            iconOutline: Ionicons.chatbubbles_outline,
            iconFilled: Ionicons.chatbubbles,
            active: active == GoogerTab.chats,
            onTap: () => onTap?.call(GoogerTab.chats),
          ),
        ],
      ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final String label;
  final IconData iconOutline;
  final IconData iconFilled;
  final bool active;
  final VoidCallback onTap;

  const _NavItem({
    required this.label,
    required this.iconOutline,
    required this.iconFilled,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(active ? iconFilled : iconOutline, size: 20, color: active ? Colors.white : AppColors.textGray600),
            const SizedBox(height: 3),
            Text(label, style: active ? AppText.navLabelActive : AppText.navLabel),
          ],
        ),
      ),
    );
  }
}
