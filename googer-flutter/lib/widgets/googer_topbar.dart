import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../api/api.dart';
import '../screens/cart_screen.dart';
import '../screens/notifications_screen.dart';
import '../services/app_notifications.dart';
import '../services/cart_store.dart';
import '../services/current_user.dart';
import 'verified_badge.dart';

/// Shared 64dp topbar used on Home/Shop/Profile/Chats/Wallet.
/// Matches the HTML header 1:1 (logo mark, title, cart badge, notif dot, avatar).
class GoogerTopbar extends StatelessWidget implements PreferredSizeWidget {
  final String title;

  /// Live draft text (web: `googSearchDraft`) — drives the suggestions dropdown.
  final ValueChanged<String>? onSearchChanged;

  /// Submitted query (web: `googSearchQuery`) — only this filters the feed.
  final ValueChanged<String>? onSearchSubmitted;
  final VoidCallback? onSearchClear;
  final VoidCallback? onSearchFocus;
  final TextEditingController? searchController;
  final bool showSearchClear;

  const GoogerTopbar({
    super.key,
    required this.title,
    this.onSearchChanged,
    this.onSearchSubmitted,
    this.onSearchClear,
    this.onSearchFocus,
    this.searchController,
    this.showSearchClear = false,
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
                controller: searchController,
                onChanged: onSearchChanged,
                onSubmitted: onSearchSubmitted,
                onTap: onSearchFocus,
                textInputAction: TextInputAction.search,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
                decoration: InputDecoration(
                  hintText: 'Search Googs',
                  hintStyle: const TextStyle(
                    color: AppColors.textGray500,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                  prefixIcon: IconButton(
                    padding: EdgeInsets.zero,
                    visualDensity: VisualDensity.compact,
                    onPressed: () => onSearchSubmitted?.call(
                      searchController?.text.trim() ?? '',
                    ),
                    icon: const Icon(
                      Ionicons.search_outline,
                      size: 16,
                      color: AppColors.textGray500,
                    ),
                  ),
                  prefixIconConstraints: const BoxConstraints(
                    minWidth: 34,
                    minHeight: 34,
                  ),
                  suffixIcon: showSearchClear
                      ? GestureDetector(
                          onTap: onSearchClear,
                          child: const Icon(
                            Ionicons.close_circle,
                            size: 15,
                            color: AppColors.likeRed,
                          ),
                        )
                      : null,
                  suffixIconConstraints: const BoxConstraints(
                    minWidth: 30,
                    minHeight: 30,
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
          // Badge tracks the shared bag, so adding from any feed bumps it live.
          ValueListenableBuilder<List<CartItem>>(
            valueListenable: CartStore.items,
            builder: (context, _, __) {
              final count = CartStore.count;
              return _IconButtonWithBadge(
                icon: Ionicons.cart_outline,
                showBadge: count > 0,
                badge: Text(
                  count > 99 ? '99+' : '$count',
                  style: const TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
                badgeColor: AppColors.utilityBlue,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CartScreen()),
                ),
              );
            },
          ),
          ValueListenableBuilder<List<AppNotice>>(
            valueListenable: AppNotifications.notifier,
            builder: (context, notices, __) {
              final unread = notices.where((n) => !n.read).length;
              return _IconButtonWithBadge(
                icon: Ionicons.notifications_outline,
                showBadge: unread > 0,
                badge: Text(
                  unread > 99 ? '99+' : '$unread',
                  style: const TextStyle(
                    fontSize: 8,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
                badgeColor: AppColors.pink,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const NotificationsScreen(),
                  ),
                ),
              );
            },
          ),
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, '/profile'),
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
                  child: ValueListenableBuilder<int>(
                    valueListenable: Api.profileRevision,
                    builder: (_, __, ___) {
                      final raw = Api.avatar ?? CurrentUser.imageUrl;
                      final img = raw == null ? null : Api.resolveAvatar(raw);
                      final bytes = img == null ? null : Api.decodeDataUri(img);
                      if (img == null || img.isEmpty) {
                        return const Icon(
                          Ionicons.person_outline,
                          size: 17,
                          color: AppColors.slateIcon,
                        );
                      }
                      if (bytes != null) {
                        return Image.memory(
                          bytes,
                          key: ValueKey(img),
                          width: 34,
                          height: 34,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Ionicons.person_outline,
                            size: 17,
                            color: AppColors.slateIcon,
                          ),
                        );
                      }
                      return Image.network(
                        img,
                        key: ValueKey(img),
                        width: 34,
                        height: 34,
                        fit: BoxFit.cover,
                        webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
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
                  child: UserVerifiedBadge(userId: Api.currentUserId, size: 12),
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
  final bool showBadge;
  final VoidCallback? onTap;

  const _IconButtonWithBadge({
    required this.icon,
    required this.badge,
    required this.badgeColor,
    this.showBadge = true,
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
            if (showBadge)
              Positioned(
                top: -3,
                right: -3,
                child: Container(
                  constraints: const BoxConstraints(
                    minWidth: 14,
                    minHeight: 14,
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    color: badgeColor,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.bg1, width: 2),
                  ),
                  alignment: Alignment.center,
                  child: badge,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
