import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/my_wallet_screen.dart';

/// Six tabs over one balance header. Each tab renders a different tree, and
/// several are dense two-column rows, so every one is checked at narrow width.
void main() {
  Future<void> open(WidgetTester tester, Size size) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(const MaterialApp(home: MyWalletScreen()));
    await tester.pump(const Duration(milliseconds: 300));
  }

  for (final size in const [Size(430, 1400), Size(360, 1400), Size(320, 1400)]) {
    testWidgets('renders at ${size.width}px', (tester) async {
      await open(tester, size);

      expect(tester.takeException(), isNull);
      expect(find.text('Total Wallet Balance'), findsOneWidget);
      expect(find.text('COINS MANAGEMENT'), findsOneWidget);
    });
  }

  testWidgets('every tab is present and switchable', (tester) async {
    await open(tester, const Size(430, 1600));

    for (final tab in const [
      'Manage',
      'History',
      'Requests',
      'Referrals',
      'Rewards',
      'Affiliate',
    ]) {
      expect(find.text(tab), findsOneWidget, reason: '$tab tab missing');
    }

    // The strip scrolls horizontally, so later tabs sit off-screen and must be
    // brought into view before they can be tapped.
    Future<void> openTab(String label) async {
      await tester.ensureVisible(find.text(label));
      await tester.pump();
      await tester.tap(find.text(label));
      await tester.pump(const Duration(milliseconds: 200));
    }

    // Requests is empty without a session, so it should show the web's
    // empty-state copy rather than throwing.
    await openTab('Requests');
    expect(find.text('NO PENDING REQUESTS FOUND'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await openTab('Referrals');
    expect(find.text('My Referral Network'), findsOneWidget);
    expect(find.text('No registered referrals yet'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await openTab('Rewards');
    expect(find.text('TOTAL REWARDS'), findsOneWidget);
    expect(find.text('AD COIN REWARDS'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await openTab('Affiliate');
    expect(find.text('TOTAL RESELL COMMISSION'), findsOneWidget);
    expect(find.text('RESELL COMMISSION EARNINGS'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('manage tab shows BUY and SELL', (tester) async {
    await open(tester, const Size(360, 1400));

    expect(find.text('BUY'), findsOneWidget);
    expect(find.text('SELL'), findsOneWidget);
    expect(find.text('ENTER AMOUNT'), findsOneWidget);
    expect(find.text('DISCOUNT %'), findsOneWidget);
    expect(find.text('TARGET USER (ID OR NAME)'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
