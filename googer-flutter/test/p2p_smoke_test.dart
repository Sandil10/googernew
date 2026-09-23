import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/sell_screen.dart';

/// P2P marketplace. Ad cards are dense rows — avatar, rate, limits, payment
/// method, country, timer and action buttons — which is exactly the shape that
/// has overflowed before in this codebase, so every width is checked and any
/// RenderFlex overflow fails the test.
void main() {
  Future<void> open(
    WidgetTester tester,
    Size size, {
    bool startOnBuy = false,
  }) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(home: SellScreen(startOnBuy: startOnBuy)),
    );
    await tester.pump(const Duration(milliseconds: 300));
  }

  for (final size in const [Size(430, 900), Size(360, 780), Size(320, 700)]) {
    testWidgets('renders at ${size.width}px', (tester) async {
      await open(tester, size);

      expect(tester.takeException(), isNull);
      expect(find.text('BUY COINS'), findsOneWidget);
      expect(find.text('SELL COINS'), findsOneWidget);
      expect(find.text('POST AD'), findsOneWidget);
    });
  }

  testWidgets('opens on the buy side when asked', (tester) async {
    await open(tester, const Size(430, 900), startOnBuy: true);

    expect(tester.takeException(), isNull);
    expect(find.text('BUY COINS'), findsOneWidget);
  });

  testWidgets('switching between buy and sell does not throw', (tester) async {
    await open(tester, const Size(360, 780));

    await tester.ensureVisible(find.text('BUY COINS'));
    await tester.tap(find.text('BUY COINS'));
    await tester.pump(const Duration(milliseconds: 250));
    expect(tester.takeException(), isNull);

    await tester.ensureVisible(find.text('SELL COINS'));
    await tester.tap(find.text('SELL COINS'));
    await tester.pump(const Duration(milliseconds: 250));
    expect(tester.takeException(), isNull);
  });

  testWidgets('status filters are present and selectable', (tester) async {
    await open(tester, const Size(430, 900));

    for (final chip in const ['ALL', 'PENDING', 'COMPLETE', 'CANCEL']) {
      expect(find.text(chip), findsWidgets, reason: '$chip chip missing');
    }

    await tester.ensureVisible(find.text('PENDING').first);
    await tester.tap(find.text('PENDING').first);
    await tester.pump(const Duration(milliseconds: 250));
    expect(tester.takeException(), isNull);
  });

  testWidgets('currency and country selectors render', (tester) async {
    await open(tester, const Size(360, 780));

    expect(find.text('All Currencies'), findsOneWidget);
    expect(find.textContaining('All Countries'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
