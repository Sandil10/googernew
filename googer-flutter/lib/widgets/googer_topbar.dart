import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../api/api.dart';
import '../screens/cart_screen.dart';
import '../screens/notifications_screen.dart';
import '../screens/profile_screen.dart';
import '../services/current_user.dart';
import 'verified_badge.dart';

/// Shared 64dp topbar used on Home/Shop/Profile/Chats/Wallet.
/// Matches the HTML header 1:1 (logo mark, title, cart badge, notif dot, avatar).
class GoogerTopbar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final int cartCount;
  final ValueChanged<String>? onSearchChanged;

  const GoogerTopbar({
    super.key,
    required this.title,
    this.cartCount = 3,
    this.onSearchChanged,
  });

  @override
  Size get preferredSize {
    final view = WidgetsBinding.instance.platformDispatcher.views.first;
    final topInset = view.padding.top / view.devicePixelRatio;
    return Size.fromHeight(52 + topInset);
  }

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.of(context).padding.top;
    return Container(
      height: 52 + topInset,
      padding: EdgeInsets.fromLTRB(14, 8 + topInset, 12, 8),
      decoration: const BoxDecoration(
        color: AppColors.bg0,
        border: Border(bottom: BorderSide(color: AppColors.border1, width: 1)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.borderWhite10),
            ),
            clipBehavior: Clip.antiAlias,
            child: Image.asset(
              'assets/images/googer.png',
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => const Icon(
                Ionicons.planet_outline,
                size: 18,
                color: AppColors.textGray300,
              ),
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: SizedBox(
              height: 36,
              child: TextField(
                onChanged: onSearchChanged,
                textInputAction: TextInputAction.search,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
                decoration: InputDecoration(
                  hintText: 'Search Googs',
                  hintStyle: const TextStyle(
                    color: AppColors.textGray500,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                  prefixIcon: const Icon(
                    Ionicons.search_outline,
                    size: 16,
                    color: AppColors.textGray500,
                  ),
                  prefixIconConstraints: const BoxConstraints(
                    minWidth: 34,
                    minHeight: 34,
                  ),
                  contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  filled: true,
                  fillColor: AppColors.bg0,
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(999),
                    borderSide: const BorderSide(
                      color: AppColors.borderWhite10,
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(999),
                    borderSide: const BorderSide(
                      color: AppColors.borderWhite10,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _IconButtonWithBadge(
            icon: Ionicons.cart_outline,
            badge: Text(
              '$cartCount',
              style: const TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            badgeColor: AppColors.utilityBlue,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const CartScreen()),
            ),
          ),
          _IconButtonWithBadge(
            icon: Ionicons.notifications_outline,
            badge: const SizedBox(width: 8, height: 8),
            badgeColor: AppColors.pink,
            dotOnly: true,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
          ),
          GestureDetector(
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ProfileScreen()),
            ),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  margin: const EdgeInsets.only(left: 6),
                  width: 34,
                  height: 34,
                  clipBehavior: Clip.antiAlias,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.avatarSlate,
                    border: Border.all(
                      color: AppColors.borderWhite10,
                      width: 2,
                    ),
                  ),
                  child: ValueListenableBuilder<Map<String, dynamic>?>(
                    valueListenable: CurrentUser.notifier,
                    builder: (_, __, ___) {
                      final raw = CurrentUser.imageUrl ?? Api.avatar;
                      final img = raw == null ? null : Api.resolveMedia(raw);
                      if (img == null || img.isEmpty) {
                        return const Icon(
                          Ionicons.person_outline,
                          size: 17,
                          color: AppColors.slateIcon,
                        );
                      }
                      return Image.network(
                        img,
                        width: 34,
                        height: 34,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Icon(
                          Ionicons.person_outline,
                          size: 17,
                          color: AppColors.slateIcon,
                        ),
                      );
                    },
                  ),
                ),
                Positioned(
                  right: -1,
                  bottom: -1,
                  child: UserVerifiedBadge(
                    userId: Api.currentUserId,
                    size: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _IconButtonWithBadge extends StatelessWidget {
  final IconData icon;
  final Widget badge;
  final Color badgeColor;
  final bool dotOnly;
  final VoidCallback? onTap;

  const _IconButtonWithBadge({
    required this.icon,
    required this.badge,
    required this.badgeColor,
    this.dotOnly = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 30,
        height: 30,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Icon(icon, size: 17, color: AppColors.textGray400),
            Positioned(
              top: dotOnly ? 6 : -3,
              right: dotOnly ? 6 : -3,
              child: Container(
                constraints: const BoxConstraints(minWidth: 14, minHeight: 14),
                padding: dotOnly
                    ? EdgeInsets.zero
                    : const EdgeInsets.symmetric(horizontal: 2),
                decoration: BoxDecoration(
                  color: badgeColor,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.bg1, width: 2),
                ),
                alignment: Alignment.center,
                width: dotOnly ? 8 : null,
                height: dotOnly ? 8 : null,
                child: dotOnly ? null : badge,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
