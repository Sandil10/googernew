import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// A generic rounded, bordered surface card used across screens.
class SectionCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final Color color;
  final VoidCallback? onTap;

  const SectionCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(13),
    this.color = AppColors.surface,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return GestureDetector(onTap: onTap, child: card);
  }
}

/// Small rounded pill chip (category filters, tags).
class PillChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;

  const PillChip({super.key, required this.label, this.selected = false, this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? AppColors.accentRed : AppColors.surface,
          border: selected ? null : Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 9.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.4,
            color: selected ? Colors.white : AppColors.textMuted,
          ),
        ),
      ),
    );
  }
}
