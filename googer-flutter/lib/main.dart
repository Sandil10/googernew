import 'dart:async';

import 'package:flutter/material.dart';
import 'theme/app_theme.dart';
import 'theme/colors.dart';
import 'api/api.dart';
import 'services/cart_store.dart';
import 'util/web_url_strategy.dart';
import 'screens/login_screen.dart';
import 'screens/home_feed_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/ad_campaign_screen.dart';
import 'screens/flash_content_screen.dart';
import 'screens/upload_content_screen.dart';
import 'screens/photo_video_ad_screen.dart';
import 'screens/product_promote_screen.dart';
import 'screens/profile_promote_screen.dart';
import 'screens/wallet_screen.dart';
import 'screens/subscription_screen.dart';
import 'screens/ad_center_screen.dart';
import 'screens/my_wallet_screen.dart';
import 'screens/top_up_screen.dart';
import 'screens/transactions_screen.dart';
import 'screens/reel_screen.dart';
import 'screens/product_detail_screen.dart';
import 'widgets/subscription_warning_overlays.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  configureWebUrlStrategy();
  // Restore the saved session from either store so a page refresh keeps the
  // user signed in; only an explicit logout ends it.
  AppTheme.load();
  await Api.init();
  // Restore the bag before the first frame so the topbar badge is correct
  // immediately; the server sync continues in the background.
  unawaited(CartStore.load());
  runApp(const GoogerApp());
}

/// Material 3 tints an `AppBar` with the seed colour once content scrolls under
/// it, which turned every top bar red-brown against the flat black chrome.
/// Killing the tint and the scrolled elevation keeps app bars the same colour
/// scrolled or not.
const _flatAppBar = AppBarTheme(
  elevation: 0,
  scrolledUnderElevation: 0,
  surfaceTintColor: Colors.transparent,
  shadowColor: Colors.transparent,
);

final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

class GoogerApp extends StatelessWidget {
  const GoogerApp({super.key});

  @override
  Widget build(BuildContext context) {
    final loggedIn = Api.loggedIn;
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: AppTheme.notifier,
      builder: (context, themeMode, _) => _app(loggedIn, themeMode),
    );
  }

  Widget _app(bool loggedIn, ThemeMode themeMode) {
    return MaterialApp(
      title: 'Googer',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
      themeMode: themeMode,
      // Light is declared so "Auto Device Theme" has something to switch to.
      // The screens themselves still use the fixed dark AppColors tokens, so
      // light currently only affects Material's own surfaces.
      theme: ThemeData(
        brightness: Brightness.light,
        fontFamily: 'Geist',
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.accentPurple,
          brightness: Brightness.light,
        ),
        appBarTheme: _flatAppBar,
      ),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.bg0,
        // Same family the web app uses (`next/font/google` Geist in
        // app/layout.tsx), so type — including figures — matches across web
        // and mobile instead of falling back to Roboto.
        fontFamily: 'Geist',
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.accentPurple,
          brightness: Brightness.dark,
        ),
        appBarTheme: _flatAppBar,
      ),
      // Clamp text scaling so tight fixed-size layouts stay healthy across all
      // iPhone sizes and large accessibility font settings.
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        return MediaQuery(
          data: mq.copyWith(
            textScaler: mq.textScaler.clamp(
              minScaleFactor: 0.9,
              maxScaleFactor: 1.15,
            ),
          ),
          child: loggedIn
              ? SubscriptionWarningOverlays(
                  navigatorKey: _navigatorKey,
                  child: child ?? const SizedBox.shrink(),
                )
              : child ?? const SizedBox.shrink(),
        );
      },
      onGenerateRoute: (settings) {
        final routeUri = Uri.tryParse(settings.name ?? '');
        final path = routeUri?.path;
        final segments = routeUri?.pathSegments ?? const <String>[];
        if (segments.length >= 2 && segments.first == 'reel') {
          final shareCode = segments[1].trim();
          final resellerRef = segments.length >= 3 ? segments[2].trim() : '';
          if (shareCode.isNotEmpty) {
            return MaterialPageRoute<void>(
              settings: settings,
              builder: (_) =>
                  ReelScreen(shareCode: shareCode, resellerRef: resellerRef),
            );
          }
        }
        if (segments.length >= 2 && segments.first == 'product') {
          final shareCode = segments[1].trim();
          final resellerRef = segments.length >= 3 ? segments[2].trim() : '';
          if (shareCode.isNotEmpty) {
            return MaterialPageRoute<void>(
              settings: settings,
              builder: (_) => ProductDetailScreen(
                shareCode: shareCode,
                resellerRef: resellerRef,
              ),
            );
          }
        }
        Widget? loggedInScreen;
        switch (path) {
          case '/':
          case '/dashboard':
            loggedInScreen = const HomeFeedScreen();
            break;
          case '/profile':
          case '/dashboard/profile':
            loggedInScreen = const ProfileScreen();
            break;
          case '/ad-campaign':
          case '/dashboard/ad-campaign':
            loggedInScreen = const AdCampaignScreen();
            break;
          case '/ad-campaign/flash-content':
          case '/dashboard/ad-campaign/flash-content':
            loggedInScreen = const FlashContentScreen();
            break;
          case '/ad-campaign/upload-content':
          case '/dashboard/ad-campaign/upload-content':
            loggedInScreen = const UploadContentScreen();
            break;
          case '/ad-campaign/photo-video':
          case '/dashboard/ad-campaign/photo-video':
            loggedInScreen = const PhotoVideoAdScreen();
            break;
          case '/ad-campaign/product-promote':
          case '/dashboard/ad-campaign/product-promote':
            loggedInScreen = const ProductPromoteScreen();
            break;
          case '/ad-campaign/profile-promote':
          case '/dashboard/ad-campaign/profile-promote':
            loggedInScreen = const ProfilePromoteScreen();
            break;
          case '/wallet':
          case '/dashboard/wallet':
            loggedInScreen = const WalletScreen();
            break;
          case '/wallet/subscription':
          case '/dashboard/wallet/subscription':
            loggedInScreen = const SubscriptionScreen();
            break;
          case '/wallet/ad-center':
          case '/dashboard/wallet/ad-center':
            loggedInScreen = const AdCenterScreen();
            break;
          case '/wallet/topup':
          case '/dashboard/wallet/topup':
            loggedInScreen = const TopUpScreen();
            break;
          case '/wallet/my-wallet':
          case '/dashboard/wallet/my-wallet':
            loggedInScreen = const MyWalletScreen();
            break;
          case '/wallet/transactions':
          case '/dashboard/wallet/transactions':
            loggedInScreen = const TransactionsScreen();
            break;
        }
        if (loggedInScreen != null) {
          return MaterialPageRoute<void>(
            settings: settings,
            builder: (_) =>
                Api.loggedIn ? loggedInScreen! : const LoginScreen(),
          );
        }
        if (path == '/profile') {
          return MaterialPageRoute<void>(
            settings: settings,
            // The app can start logged out and complete OTP without rebuilding
            // MaterialApp. Read the live auth state when the route opens so a
            // post-login avatar tap cannot reuse the startup `false` value.
            builder: (_) =>
                Api.loggedIn ? const ProfileScreen() : const LoginScreen(),
          );
        }
        return null;
      },
      onUnknownRoute: (_) => MaterialPageRoute<void>(
        settings: const RouteSettings(name: '/'),
        builder: (_) =>
            Api.loggedIn ? const HomeFeedScreen() : const LoginScreen(),
      ),
      home: loggedIn ? const HomeFeedScreen() : const LoginScreen(),
    );
  }
}
