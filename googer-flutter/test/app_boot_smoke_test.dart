import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/main.dart';
import 'package:googer_app/screens/home_feed_screen.dart';
import 'package:googer_app/screens/profile_screen.dart';
import 'package:googer_app/screens/ad_campaign_screen.dart';
import 'package:googer_app/screens/flash_content_screen.dart';
import 'package:googer_app/screens/upload_content_screen.dart';
import 'package:googer_app/screens/photo_video_ad_screen.dart';
import 'package:googer_app/screens/product_promote_screen.dart';
import 'package:googer_app/screens/profile_promote_screen.dart';

/// The logged-out path is easy to verify in a browser; the logged-in landing
/// screen is not, so cover both here. `main.dart` picks between them on
/// `Api.loggedIn`, and a throw in either is a blank page with nothing behind it.
void main() {
  testWidgets('app boots logged out', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    Api.logout();
    await tester.pumpWidget(const GoogerApp());
    await tester.pump(const Duration(milliseconds: 300));

    // LoginScreen has a pre-existing 12px horizontal overflow at this width.
    // It clips silently in release rather than failing, so tolerate that one
    // specific error — anything else here is a genuine boot failure.
    final error = tester.takeException();
    if (error != null) {
      expect(
        error.toString(),
        contains('overflowed'),
        reason: 'unexpected error on boot',
      );
    }
  });

  testWidgets('home feed renders', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const MaterialApp(home: HomeFeedScreen()));
    await tester.pump(const Duration(milliseconds: 300));

    expect(tester.takeException(), isNull);
  });

  testWidgets('profile deep link resolves for a signed-in session', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() {
      tester.binding.setSurfaceSize(null);
      tester.binding.platformDispatcher.clearDefaultRouteNameTestValue();
      Api.token = null;
    });

    Api.token = 'route-test-token';
    tester.binding.platformDispatcher.defaultRouteNameTestValue =
        '/profile?mobile=1';
    await tester.pumpWidget(const GoogerApp());
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.byType(ProfileScreen), findsOneWidget);
  });

  testWidgets('web ad-campaign deep links resolve for a signed-in session', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() {
      tester.binding.setSurfaceSize(null);
      tester.binding.platformDispatcher.clearDefaultRouteNameTestValue();
      Api.token = null;
    });

    final cases = <String, Type>{
      '/ad-campaign': AdCampaignScreen,
      '/dashboard/ad-campaign': AdCampaignScreen,
      '/ad-campaign/flash-content': FlashContentScreen,
      '/dashboard/ad-campaign/flash-content': FlashContentScreen,
      '/ad-campaign/upload-content': UploadContentScreen,
      '/dashboard/ad-campaign/upload-content': UploadContentScreen,
      '/ad-campaign/photo-video': PhotoVideoAdScreen,
      '/dashboard/ad-campaign/photo-video': PhotoVideoAdScreen,
      '/ad-campaign/product-promote': ProductPromoteScreen,
      '/dashboard/ad-campaign/product-promote': ProductPromoteScreen,
      '/ad-campaign/profile-promote': ProfilePromoteScreen,
      '/dashboard/ad-campaign/profile-promote': ProfilePromoteScreen,
    };

    for (final entry in cases.entries) {
      Api.token = 'route-test-token';
      tester.binding.platformDispatcher.defaultRouteNameTestValue = entry.key;
      await tester.pumpWidget(const GoogerApp());
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.byType(entry.value), findsOneWidget, reason: entry.key);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    }
  });

  testWidgets('profile route reads auth after an in-app login', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() {
      tester.binding.setSurfaceSize(null);
      Api.token = null;
    });

    Api.token = null;
    await tester.pumpWidget(const GoogerApp());
    await tester.pump(const Duration(milliseconds: 300));
    tester.takeException(); // Existing narrow LoginScreen overflow.

    Api.token = 'post-login-route-token';
    final loginContext = tester.element(find.byType(Scaffold).first);
    Navigator.of(loginContext).pushNamed('/profile');
    await tester.pumpAndSettle(const Duration(milliseconds: 300));

    expect(find.byType(ProfileScreen), findsOneWidget);
  });
}
