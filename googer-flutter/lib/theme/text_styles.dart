import 'package:flutter/material.dart';
import 'colors.dart';

/// Text styles with clean sans-serif typography.
/// Sizes are the same px values used in the design system (1px ~= 1 logical pixel).
class AppText {
  AppText._();

  static TextStyle _geist(double size, FontWeight weight, {Color color = AppColors.textWhite, double? letterSpacing, double? height}) {
    return TextStyle(
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
      fontFamily: 'Roboto',
    );
  }

  static TextStyle mono(double size, FontWeight weight, {Color color = AppColors.textWhite}) {
    return TextStyle(
      fontSize: size,
      fontWeight: weight,
      color: color,
      fontFamily: 'Roboto Mono',
    );
  }

  // Headers (tightened to the compact Binance-style reference scale)
  static TextStyle headerTitle = _geist(13.5, FontWeight.w700);
  static TextStyle screenTitle14 = _geist(12.5, FontWeight.w700);

  // Body / labels
  static TextStyle body12_5 = _geist(12, FontWeight.w400, color: AppColors.textGray200);
  static TextStyle name12 = _geist(12, FontWeight.w600);
  static TextStyle time11 = _geist(11, FontWeight.w400, color: Color(0x66FFFFFF));
  static TextStyle statLine11 = _geist(11, FontWeight.w400, color: Color(0x66FFFFFF));
  static TextStyle subscribePill = _geist(9.5, FontWeight.w600, color: AppColors.purpleText);
  static TextStyle navLabel = _geist(9.5, FontWeight.w500, color: AppColors.textGray600);
  static TextStyle navLabelActive = _geist(9.5, FontWeight.w500, color: AppColors.textWhite);

  static TextStyle inputText = _geist(12.5, FontWeight.w400);
  static TextStyle inputHint = _geist(12.5, FontWeight.w400, color: AppColors.textGray600);
  static TextStyle buttonLabel = _geist(12.5, FontWeight.w700, color: AppColors.bg0);
  static TextStyle linkSmall = _geist(11.5, FontWeight.w300, color: AppColors.purpleText);
  static TextStyle footNote = _geist(11.5, FontWeight.w400, color: AppColors.textGray600);
}
