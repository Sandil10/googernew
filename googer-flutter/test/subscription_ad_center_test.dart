import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ionicons/ionicons.dart';
import 'package:googer_app/screens/ad_center_screen.dart';
import 'package:googer_app/screens/subscription_screen.dart';
import 'package:googer_app/widgets/app_back_button.dart';

/// Both pages are dense: the plan card puts a heading, a feature wrap and a
/// dates column on one row, and every ad card row is a label/value pair that
/// has to survive a long value. `takeException` fails on RenderFlex overflow.
void main() {
  Future<void> open(WidgetTester tester, Widget screen, Size size) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home: screen));
    await tester.pump(const Duration(milliseconds: 300));
  }

  const sizes = [Size(430, 900), Size(360, 780), Size(320, 700)];

  for (final size in sizes) {
    testWidgets('subscription renders at ${size.width.toInt()}px', (
      tester,
    ) async {
      await open(tester, const SubscriptionScreen(), size);

      expect(tester.takeException(), isNull);
      expect(find.text('Choose Your Plan'), findsOneWidget);
      expect(find.text('Pick a subscription that fits you.'), findsOneWidget);
    });

    testWidgets('ad center renders at ${size.width.toInt()}px', (tester) async {
      await open(tester, const AdCenterScreen(), size);

      expect(tester.takeException(), isNull);
      expect(find.text('AD CENTER'), findsOneWidget);
      expect(find.text('Published Ads'), findsOneWidget);
      // Signed out, so every filter is empty and the empty state shows.
      expect(find.text('NO ADS IN THIS SECTION'), findsOneWidget);
    });
  }

  testWidgets('the ad centre carries every status filter with a count', (
    tester,
  ) async {
    await open(tester, const AdCenterScreen(), const Size(430, 900));

    for (final label in const [
      'ALL ADS',
      'UNDER REVIEW',
      'ACTIVE',
      'PAUSED',
      'COMPLETED',
      'CANCELLED',
    ]) {
      expect(find.text(label), findsOneWidget, reason: '$label filter missing');
    }
    // One count chip per filter, all zero while signed out.
    expect(find.text('0'), findsNWidgets(6));
    expect(tester.takeException(), isNull);
  });

  testWidgets('a filter further along the strip can be selected', (
    tester,
  ) async {
    await open(tester, const AdCenterScreen(), const Size(430, 900));

    // The active pill is the one drawn on white, so its label is black.
    Color labelColour(String label) =>
        tester.widget<Text>(find.text(label)).style!.color!;

    expect(labelColour('ALL ADS'), Colors.black, reason: 'wrong default tab');

    // COMPLETED sits off-screen: the strip scrolls, so it has to be brought
    // into view before it can be tapped at all.
    await tester.dragUntilVisible(
      find.text('COMPLETED'),
      find.byType(SingleChildScrollView).first,
      const Offset(-120, 0),
    );
    await tester.tap(find.text('COMPLETED'));
    await tester.pump(const Duration(milliseconds: 200));

    expect(
      labelColour('COMPLETED'),
      Colors.black,
      reason: 'tab did not switch',
    );
    expect(labelColour('ALL ADS'), isNot(Colors.black));
    expect(find.text('NO ADS IN THIS SECTION'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('subscription closes with an X, not a back button', (
    tester,
  ) async {
    // The web page is a modal-style route: it has a close control top-right
    // rather than the standard BACK control.
    await open(tester, const SubscriptionScreen(), const Size(360, 780));

    expect(find.byType(AppBackButton), findsNothing);
    expect(find.byIcon(Ionicons.close_outline), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the ad centre still uses the shared back control', (
    tester,
  ) async {
    await open(tester, const AdCenterScreen(), const Size(360, 780));

    expect(find.byType(AppBackButton), findsOneWidget);
    expect(find.text('BACK'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
