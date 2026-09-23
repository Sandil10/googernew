import 'package:flutter/material.dart';

/// Design tokens lifted 1:1 from the Googer design system / HTML prototype.
class AppColors {
  AppColors._();

  // Single jet-black surface used across background, chrome, and feed boxes.
  static const bg0 = Color(0xFF080808);
  static const bg1 = Color(0xFF080808); // surface
  static const bg2 = Color(0xFF080808); // surfaceAlt
  static const bg3 = Color(0xFF080808); // surfaceRaised
  static const shopCard = Color(0xFF080808);

  static const border1 = Color(0x14FFFFFF); // rgba(255,255,255,0.08)
  static const inputBorder = Color(0x14FFFFFF);
  static const borderWhite10 = Color(0x14FFFFFF);
  static const borderWhite06 = Color(0x0FFFFFFF);

  // Accent repointed purple -> red (#EF4444) app-wide. Token names kept so the
  // ~80 existing references shift without touching every screen.
  static const accentPurple = Color(0xFFEF4444);
  static const purpleText = Color(0xFFF87171);
  static const purpleBorder = Color(0x66EF4444); // ~40% alpha
  static const purpleBg10 = Color(0x1AEF4444);
  static const purpleBg15 = Color(0x26EF4444);

  static const utilityBlue = Color(0xFF2563EB);
  static const likeRed = Color(0xFFEF4444);
  static const successGreen = Color(0xFF22C55E);
  static const pink = Color(0xFFEC4899);
  static const linkBlue = Color(0xFF38BDF8);
  static const chatBubble = Color(0xFFEF4444);
  static const chatIncoming = Color(0xFF1C1C1F);

  static const textWhite = Color(0xFFFFFFFF);
  static const textGray200 = Color(0xFFE4E4E7);
  static const textGray300 = Color(0xFFD4D4D8);
  static const textGray400 = Color(0xFF9CA3AF);
  static const textGray500 = Color(0xFF71717A);
  static const textGray600 = Color(0xFF6B7280);
  static const textGray700 = Color(0xFF52525B);
  static const avatarSlate = Color(0xFF1E293B);
  static const slateIcon = Color(0xFF94A3B8);

  static const avatarPalette = [
    Color(0xFF374151),
    Color(0xFF4C1D95),
    Color(0xFF164E63),
    Color(0xFF7C2D12),
  ];
}
