import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

/// The one back control used everywhere in the app: a chevron and the word
/// BACK, as first drawn on the wallet pages.
///
/// Screens used to mix three shapes — a bare `IconButton` in an `AppBar`
/// leading slot, a hand-rolled icon inside a custom header, and this one — so
/// going back looked different depending on where you were. Every screen now
/// routes through this widget.
class AppBackButton extends StatelessWidget {
  /// Where an `AppBar` must size its leading slot to fit the label. The
  /// default 56 px slot clips "BACK".
  static const double appBarLeadingWidth = 104;

  /// Defaults to popping the current route.
  final VoidCallback? onTap;

  /// Vertical padding only by default, so the control lines up flush with the
  /// left edge of the content it sits above.
  final EdgeInsets padding;

  final Color color;

  const AppBackButton({
    super.key,
    this.onTap,
    this.padding = const EdgeInsets.symmetric(vertical: 8),
    this.color = Colors.white,
  });

  /// Positioned for an `AppBar.leading` slot. Pair with
  /// `leadingWidth: AppBackButton.appBarLeadingWidth`.
  const AppBackButton.appBar({super.key, this.onTap, this.color = Colors.white})
    : padding = const EdgeInsets.only(left: 14, top: 8, bottom: 8, right: 4);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap ?? () => Navigator.maybePop(context),
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: padding,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Ionicons.chevron_back, size: 19, color: color),
            const SizedBox(width: 6),
            // Never wraps: in a constrained slot the label ellipsises rather
            // than breaking the row onto two lines.
            Flexible(
              child: Text(
                'BACK',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.5,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
