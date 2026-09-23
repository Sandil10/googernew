import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

import '../theme/colors.dart';

/// Action bar shown while chat messages are selected.
///
/// Laid out as a count line above a horizontally scrollable action row. A
/// single `Row` cannot hold the label plus four buttons on a narrow phone: the
/// label gets squeezed to zero width and wraps one character per line, while
/// the last button is clipped off-screen.
class ChatSelectionBar extends StatelessWidget {
  final int count;
  final VoidCallback onCopy;
  final VoidCallback onForward;
  final VoidCallback onDelete;
  final VoidCallback onCancel;

  const ChatSelectionBar({
    super.key,
    required this.count,
    required this.onCopy,
    required this.onForward,
    required this.onDelete,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.borderWhite10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$count SELECTED',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 10.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 10),
          // Scrolls rather than overflows, so the last action stays reachable
          // however narrow the screen is.
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _action(Ionicons.copy_outline, 'COPY', onCopy),
                const SizedBox(width: 8),
                _action(Ionicons.arrow_redo_outline, 'FORWARD', onForward),
                const SizedBox(width: 8),
                _action(
                  Ionicons.trash_outline,
                  'DELETE',
                  onDelete,
                  danger: true,
                ),
                const SizedBox(width: 8),
                _action(null, 'CANCEL', onCancel),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _action(
    IconData? icon,
    String label,
    VoidCallback onTap, {
    bool danger = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 34,
        padding: const EdgeInsets.symmetric(horizontal: 13),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: danger
              ? AppColors.likeRed.withOpacity(0.15)
              : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: danger
                ? AppColors.likeRed.withOpacity(0.5)
                : AppColors.borderWhite10,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 13,
                color: danger ? AppColors.likeRed : Colors.white,
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              maxLines: 1,
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w600,
                color: danger ? AppColors.likeRed : Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
