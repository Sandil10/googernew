import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/coins_management_screen.dart';
import 'package:googer_app/screens/sell_screen.dart';
import 'package:googer_app/screens/top_up_screen.dart';

/// Both wallet pages carry dense rows (a three-pill header, a tab strip, a
/// request row with a status pill) that have overflowed before, so every width
/// down to 320px is checked. `takeException` catches RenderFlex overflow —
/// those are reported as exceptions in tests, so any overflow fails here.
void main() {
  Future<void> open(WidgetTester tester, Widget screen, Size size) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home: screen));
    await tester.pump(const Duration(milliseconds: 300));
  }

  const sizes = [Size(430, 900), Size(360, 780), Size(320, 700)];

  for (final size in sizes) {
    testWidgets('top up renders at ${size.width.toInt()}px', (tester) async {
      await open(tester, const TopUpScreen(), size);

      expect(tester.takeException(), isNull);
      expect(find.text('Top Up'), findsOneWidget);
      expect(find.text('BUY COINS'), findsOneWidget);
      expect(find.text('SELL COINS'), findsOneWidget);
      expect(find.text('TOP UP'), findsOneWidget);
      expect(find.text('TOTAL WALLET BALANCE'), findsOneWidget);
      expect(find.text('Enter Coin Amount'), findsOneWidget);
      expect(find.text('Select Payment Method'), findsOneWidget);
      expect(find.text('MAKE PAYMENT'), findsOneWidget);
      // Tab label + section heading both read "Topup Coins".
      expect(find.text('Topup Coins'), findsNWidgets(2));
    });

    testWidgets('request renders at ${size.width.toInt()}px', (tester) async {
      await open(tester, const CoinsManagementScreen(), size);

      expect(tester.takeException(), isNull);
      expect(find.text('Request'), findsOneWidget);
      expect(
        find.text('Send a coin request to admin for approval.'),
        findsOneWidget,
      );
      expect(find.text('SEND REQUEST'), findsOneWidget);
      expect(find.text('My Requests'), findsOneWidget);
      // Signed out, so the list is empty and must show the empty state.
      expect(find.text('0 TOTAL'), findsOneWidget);
      expect(find.text('NO REQUESTS YET'), findsOneWidget);
    });
  }

  testWidgets('top up defaults to the first payment method', (tester) async {
    await open(tester, const TopUpScreen(), const Size(360, 780));

    for (final method in const [
      'Direct Bank Transfer',
      'Pay with Payeer',
      'Pay with Paypal',
    ]) {
      expect(find.text(method), findsOneWidget, reason: '$method missing');
    }
    expect(find.text('CANCEL'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('every top up tab is switchable', (tester) async {
    await open(tester, const TopUpScreen(), const Size(360, 780));

    Future<void> openTab(String label) async {
      await tester.ensureVisible(find.text(label));
      await tester.pump();
      await tester.tap(find.text(label));
      await tester.pump(const Duration(milliseconds: 200));
    }

    await openTab('Pending');
    expect(find.text('No Pending Topups Found'), findsOneWidget);
    expect(find.text('Enter Coin Amount'), findsNothing);
    expect(tester.takeException(), isNull);

    await openTab('Complete');
    expect(find.text('No Completed Transactions'), findsOneWidget);
    expect(tester.takeException(), isNull);

    // Back to the first tab — now the only "Topup Coins" on screen is the tab.
    await openTab('Topup Coins');
    expect(find.text('Enter Coin Amount'), findsOneWidget);
    expect(find.text('MAKE PAYMENT'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the chip row carries all five marketplace entries', (
    tester,
  ) async {
    await open(tester, const TopUpScreen(), const Size(360, 780));

    for (final chip in const [
      'BUY COINS',
      'SELL COINS',
      'REQUEST',
      'TOP UP',
      'POST AD',
    ]) {
      expect(find.text(chip), findsOneWidget, reason: '$chip chip missing');
    }
    expect(tester.takeException(), isNull);
  });

  for (final (chip, buySide) in const [
    ('BUY COINS', true),
    ('SELL COINS', false),
  ]) {
    testWidgets('$chip opens the marketplace, not a pop', (tester) async {
      await open(tester, const TopUpScreen(), const Size(360, 780));

      await tester.tap(find.text(chip));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      // These chips used to fall back to `Navigator.maybePop`, so on a root
      // route they did nothing at all.
      final pushed = find.byType(SellScreen);
      expect(pushed, findsOneWidget, reason: '$chip did not open the market');
      expect(
        tester.widget<SellScreen>(pushed).startOnBuy,
        buySide,
        reason: '$chip landed on the wrong side',
      );
    });
  }

  testWidgets('the completed empty state is centred in the card', (
    tester,
  ) async {
    await open(tester, const TopUpScreen(), const Size(360, 780));

    await tester.ensureVisible(find.text('Complete'));
    await tester.pump();
    await tester.tap(find.text('Complete'));
    await tester.pump(const Duration(milliseconds: 200));

    // The card lays its children out `CrossAxisAlignment.start`, which used to
    // leave this shrink-wrapped against the left edge.
    final label = tester.getRect(find.text('No Completed Transactions'));
    expect(
      label.center.dx,
      closeTo(360 / 2, 1.0),
      reason: 'the empty state is not centred',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('admin request uses the fixed web request payload', (
    tester,
  ) async {
    await open(tester, const CoinsManagementScreen(), const Size(320, 700));

    await tester.tap(find.text('SEND REQUEST'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // Web parity: this is a fixed coin-request action, not an amount/note form.
    expect(find.text('Send Request'), findsNothing);
    expect(find.text('Amount'), findsNothing);
    expect(find.text('Note (optional)'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
