import 'package:flutter/material.dart';

import '../util/storage.dart';

/// App-wide theme mode, driven by the profile menu's "Dark Mode" /
/// "Auto Device Theme" rows.
///
/// The choice is persisted and exposed as a [ValueListenable] so the root
/// `MaterialApp` rebuilds when it changes, without threading a provider
/// through every screen.
///
/// **Status:** the mode is real and persisted, but the palette is not yet
/// theme-aware — `AppColors` is still a fixed dark set, so selecting a light
/// mode currently changes Material's own surfaces only. Re-tokenising
/// `AppColors` into light/dark pairs is the remaining work.
class AppTheme {
  AppTheme._();

  static const _storageKey = 'googer_theme_mode';

  static final ValueNotifier<ThemeMode> notifier =
      ValueNotifier<ThemeMode>(ThemeMode.dark);

  static ThemeMode get mode => notifier.value;

  /// Restores the saved preference. Safe to call before `runApp`.
  static void load() {
    switch (readStorage(_storageKey)) {
      case 'system':
        notifier.value = ThemeMode.system;
      case 'light':
        notifier.value = ThemeMode.light;
      case 'dark':
        notifier.value = ThemeMode.dark;
      default:
        notifier.value = ThemeMode.dark;
    }
  }

  static void set(ThemeMode next) {
    if (notifier.value == next) return;
    notifier.value = next;
    writeStorage(_storageKey, switch (next) {
      ThemeMode.system => 'system',
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
    });
  }
}
