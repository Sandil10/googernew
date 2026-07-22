import 'package:flutter/material.dart';

/// Shared color tokens for the Googer app (matches the HTML prototype).
class AppColors {
  AppColors._();

  static const background = Color(0xFF000000);
  static const surface = Color(0xFF0C0C0F);
  static const surfaceAlt = Color(0xFF101012);
  static const surfaceRaised = Color(0xFF141416);
  static const border = Color(0x14FFFFFF); // rgba(255,255,255,0.08)

  static const textPrimary = Color(0xFFF9FAFB);
  static const textSecondary = Color(0xFF8A8A91);
  static const textMuted = Color(0xFF71717A);
  static const textFaint = Color(0xFF52525B);

  static const accentRed = Color(0xFFEF4444);
  static const accentRedLight = Color(0xFFF87171);
  static const accentGreen = Color(0xFF3DDC84);
  static const accentBlue = Color(0xFF60A5FA);
  static const accentGold = Color(0xFFD8AD4C);
  static const accentPurple = Color(0xFF7C5CFF);
  static const accentPink = Color(0xFFEC4899);

  static const goldGradient = LinearGradient(
    colors: [Color(0xFFE9C25F), Color(0xFFA6791F)],
  );

  static const walletCardGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF232327), Color(0xFF141416), Color(0xFF0A0A0B)],
  );
}
