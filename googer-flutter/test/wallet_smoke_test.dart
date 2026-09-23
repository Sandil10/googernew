import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ionicons/ionicons.dart';
import 'package:googer_app/models/wallet_dashboard.dart';
import 'package:googer_app/screens/wallet_screen.dart';
import 'package:googer_app/services/wallet_dashboard_service.dart';

class _FakeWalletRepository extends WalletDashboardRepository {
  const _FakeWalletRepository();

  @override
  Future<WalletDashboardSnapshot> load() async => const WalletDashboardSnapshot(
    googerId: '312495',
    balance: 99.20,
    transactionCount: 3,
    adCount: 2,
    isVerified: true,
    planName: 'Basic',
  );
}

/// Compact wallet home: ID strip, estimated-balance card whose small boxes run
/// four to a row, then every service repeated as a single-line detail row.
/// Both shapes overflow on narrow phones — the boxes because four cells share
/// the width, the rows because an icon, a title/subtitle column and a
/// right-aligned stat column sit on one line.
void main() {
  Future<void> open(WidgetTester tester, Size size) async {
    await tester.binding.setSurfaceSize(size);
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      const MaterialApp(
        home: WalletScreen(repository: _FakeWalletRepository()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));
  }

  for (final size in const [
    Size(430, 2400),
    Size(360, 2400),
    Size(320, 2400),
  ]) {
    testWidgets('wallet renders at ${size.width}px', (tester) async {
      await open(tester, size);

      expect(tester.takeException(), isNull);
      expect(find.text('Estimated Balance'), findsOneWidget);
      expect(find.text('Wallet Details'), findsOneWidget);
      expect(find.textContaining('My Googer ID'), findsOneWidget);
    });
  }

  testWidgets('the ID card carries the referral link and its actions', (
    tester,
  ) async {
    await open(tester, const Size(360, 2400));

    expect(
      find.textContaining('googer.site/register?ref='),
      findsOneWidget,
      reason: 'referral link missing from the ID card',
    );
    expect(find.byIcon(Ionicons.copy_outline), findsOneWidget);
    expect(find.byIcon(Ionicons.share_social_outline), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('share action opens the referral sheet', (tester) async {
    await open(tester, const Size(360, 900));

    await tester.tap(find.byIcon(Ionicons.share_social_outline));
    await tester.pumpAndSettle();

    expect(find.text('Share referral link'), findsOneWidget);
    expect(find.text('COPY LINK'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Request is gone from both the boxes and the rows', (
    tester,
  ) async {
    await open(tester, const Size(430, 2400));

    expect(find.text('Request'), findsNothing);
    expect(find.text('Send a coin request to admin'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a detail row keeps its label and value on one line', (
    tester,
  ) async {
    await open(tester, const Size(360, 2400));

    // "Total" and "N txns" belong to the Transactions row; sharing a line
    // means sharing a vertical centre.
    final label = tester.getRect(find.text('Total'));
    final value = tester.getRect(find.text('3 txns'));
    expect(
      label.center.dy,
      closeTo(value.center.dy, 1.0),
      reason: 'the stat label and value are still stacked',
    );
    expect(
      value.right,
      greaterThan(label.right),
      reason: 'the value should sit in the corner, after the label',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('every wallet service has a detail row', (tester) async {
    await open(tester, const Size(430, 2400));

    for (final title in const [
      'My Wallet',
      'Top Up',
      'Withdrawal',
      'Transactions',
      'Buy & Sell Coins',
      'Verified',
      'Subscription Plans',
      'Ad Center',
    ]) {
      expect(find.text(title), findsWidgets, reason: '$title row missing');
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('every wallet service also has a small box', (tester) async {
    await open(tester, const Size(430, 2400));

    // Short labels, because four boxes share the card width.
    for (final label in const [
      'Wallet',
      'Top Up',
      'Withdraw',
      'History',
      'Buy & Sell',
      'Verify',
      'Plans',
      'Ad Center',
    ]) {
      expect(find.text(label), findsWidgets, reason: '$label box missing');
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('History box opens transaction history', (tester) async {
    await open(tester, const Size(430, 900));

    await tester.tap(find.text('History'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Transaction History'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the boxes are laid out four to a row', (tester) async {
    await open(tester, const Size(430, 2400));

    // Eight services -> two rows of four. Boxes on a row share a top edge and
    // the columns line up between the rows.
    Rect boxOf(String label) => tester.getRect(
      find
          .ancestor(
            of: find.text(label),
            matching: find.byType(GestureDetector),
          )
          .first,
    );

    final first = boxOf('Wallet');
    final fourth = boxOf('History');
    final fifth = boxOf('Buy & Sell');
    final last = boxOf('Ad Center');

    expect(first.top, fourth.top, reason: 'boxes 1-4 are not on one row');
    expect(fifth.top, greaterThan(first.top), reason: 'box 5 did not wrap');
    expect(fifth.top, last.top, reason: 'boxes 5-8 are not on one row');
    expect(
      fifth.left,
      closeTo(first.left, 0.5),
      reason: 'column 1 is not aligned between the rows',
    );
    expect(
      last.left,
      closeTo(fourth.left, 0.5),
      reason: 'column 4 is not aligned between the rows',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('the balance can be hidden', (tester) async {
    await open(tester, const Size(430, 2400));

    expect(find.text('••••••'), findsNothing);

    await tester.tap(find.byIcon(Ionicons.eye_outline));
    await tester.pump(const Duration(milliseconds: 200));

    // Masked in both the balance card and the two coin-bearing detail rows.
    expect(find.text('••••••'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
