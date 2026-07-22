import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class BottomNavItem {
  final IconData icon;
  final String label;
  BottomNavItem(this.icon, this.label);
}

/// Bottom navigation bar: Home / Shop / Add (center) / Wallet / Chats.
class GoogerBottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final VoidCallback onAddTap;

  const GoogerBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.onAddTap,
  });

  @override
  Widget build(BuildContext context) {
    Color colorFor(int i) => currentIndex == i ? AppColors.textPrimary : AppColors.textMuted;

    Widget navItem(IconData icon, String label, int index) {
      return GestureDetector(
        onTap: () => onTap(index),
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 20, color: colorFor(index)),
            const SizedBox(height: 3),
            Text(label, style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w600, color: colorFor(index))),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(6, 8, 6, 10),
      decoration: const BoxDecoration(
        color: Colors.black,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          navItem(Icons.home_rounded, 'Home', 0),
          navItem(Icons.storefront_outlined, 'Shop', 1),
          GestureDetector(
            onTap: onAddTap,
            child: Transform.translate(
              offset: const Offset(0, -8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF3A3A40), Color(0xFF1C1C1F)],
                      ),
                      border: Border.all(color: Colors.white24, width: 1.5),
                    ),
                    child: const Icon(Icons.add, color: AppColors.textPrimary, size: 20),
                  ),
                  const SizedBox(height: 3),
                  const Text('Add', style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w600, color: AppColors.textMuted)),
                ],
              ),
            ),
          ),
          navItem(Icons.account_balance_wallet_outlined, 'Wallet', 2),
          navItem(Icons.forum_outlined, 'Chats', 3),
        ],
      ),
    );
  }
}
