import 'package:flutter/material.dart';

/// Googer design tokens — from the "UI Design enhancement" handoff
/// (design_handoff_googer_app/lib/theme/app_colors.dart).
class GoogerColors {
  static const page = Color(0xFF000000);
  static const card = Color(0xFF0C0C0F); // handoff surface
  static const surface = Color(0xFF101012); // handoff surfaceAlt
  static const surfaceStrong = Color(0xFF0A0A0B);
  static const raised = Color(0xFF141416); // handoff surfaceRaised
  static const nav = Color(0xFF000000);
  static const input = Color(0xFF101012);

  static const soft = Color(0x0AFFFFFF); // white 4%
  static const soft6 = Color(0x0FFFFFFF); // white 6%
  static const soft10 = Color(0x1AFFFFFF); // white 10%

  static const line = Color(0x14FFFFFF); // white 8%
  static const border = Color(0x14FFFFFF);
  static const borderSoft = Color(0x0DFFFFFF); // white 5%

  static const text = Color(0xFFF9FAFB); // handoff textPrimary
  static const muted = Color(0xFF8A8A91); // handoff textSecondary
  static const dim = Color(0xFF71717A); // handoff textMuted
  static const faint = Color(0xFF52525B); // handoff textFaint

  static const red = Color(0xFFEF4444);
  static const redLight = Color(0xFFF87171);
  static const redDark = Color(0xFFDC2626);
  static const green = Color(0xFF3DDC84); // handoff accentGreen
  static const greenDeep = Color(0xFF22C55E);
  static const blue = Color(0xFF60A5FA);
  static const blueDeep = Color(0xFF3B82F6);
  static const sky = Color(0xFF38BDF8);
  static const amber = Color(0xFFFBBF24);
  static const gold = Color(0xFFD8AD4C); // handoff accentGold
  static const purple = Color(0xFF7C5CFF);
  static const pink = Color(0xFFEC4899);
  static const rose = Color(0xFFFB7185);
  static const emerald = Color(0xFF34D399);
  static const cyan = Color(0xFF22D3EE);

  static const goldGradient = LinearGradient(colors: [Color(0xFFE9C25F), Color(0xFFA6791F)]);

  static const walletCardGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF232327), Color(0xFF141416), Color(0xFF0A0A0B)],
  );

  static const addButtonGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF3A3A40), Color(0xFF1C1C1F)],
  );
}

ThemeData googerTheme() {
  const scheme = ColorScheme.dark(
    primary: GoogerColors.red,
    onPrimary: Colors.white,
    secondary: GoogerColors.sky,
    surface: GoogerColors.page,
    onSurface: GoogerColors.text,
    surfaceContainer: GoogerColors.card,
    outline: GoogerColors.border,
    error: GoogerColors.red,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: GoogerColors.page,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: const AppBarTheme(
      backgroundColor: GoogerColors.page,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: GoogerColors.text,
        fontSize: 16,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.1,
      ),
      iconTheme: IconThemeData(color: GoogerColors.text, size: 20),
    ),
    cardTheme: CardThemeData(
      color: GoogerColors.card,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: GoogerColors.border),
      ),
      margin: EdgeInsets.zero,
    ),
    dividerTheme: const DividerThemeData(color: GoogerColors.line, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: GoogerColors.input,
      hintStyle: const TextStyle(color: GoogerColors.dim, fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: GoogerColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: GoogerColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: GoogerColors.faint),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF111111),
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, letterSpacing: 0.2),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: GoogerColors.muted,
        minimumSize: const Size.fromHeight(48),
        side: const BorderSide(color: GoogerColors.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, letterSpacing: 0.2),
      ),
    ),
    textTheme: const TextTheme(
      titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w500, color: GoogerColors.text),
      titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: GoogerColors.text, letterSpacing: 0.1),
      titleSmall: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: GoogerColors.text, letterSpacing: 0.1),
      bodyLarge: TextStyle(fontSize: 15, color: GoogerColors.text, letterSpacing: 0.15),
      bodyMedium: TextStyle(fontSize: 13, color: GoogerColors.text, letterSpacing: 0.15),
      bodySmall: TextStyle(fontSize: 12, color: GoogerColors.muted, letterSpacing: 0.2),
      labelMedium: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: GoogerColors.muted, letterSpacing: 0.4),
      labelSmall: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: GoogerColors.dim, letterSpacing: 0.4),
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: GoogerColors.muted,
      textColor: GoogerColors.text,
      contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 2),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.all(Colors.white),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? GoogerColors.greenDeep : GoogerColors.soft10,
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: GoogerColors.surface,
      surfaceTintColor: Colors.transparent,
    ),
  );
}

/// tiny uppercase overline label
class Overline extends StatelessWidget {
  final String text;
  final Color? color;
  const Overline(this.text, {this.color});

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.8,
        color: color ?? GoogerColors.muted,
      ),
    );
  }
}
