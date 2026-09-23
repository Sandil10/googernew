import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/screens/transactions_screen.dart';
import 'package:googer_app/util/wallet_receipt.dart';
import 'package:googer_app/widgets/wallet_receipt_dialog.dart';

const _transaction = <String, dynamic>{
  'id': 163,
  'transaction_id': 'G25GE5R163',
  'amount': '3.00',
  'sender_id': 1,
  'sender_readable_id': 350463,
  'sender_username': 'hee',
  'receiver_id': 2,
  'receiver_readable_id': 312495,
  'receiver_username': 'googer',
  'type': 'transfer',
  'status': 'accepted',
  'created_at': '2026-08-03T12:02:56.000Z',
};

const _googerCommissionTransaction = <String, dynamic>{
  'id': 989735,
  'transaction_id': 'GCOM989735',
  'amount': '0.60',
  'sender_id': 1,
  'sender_readable_id': 350463,
  'sender_username': 'hee',
  'receiver_id': 99,
  'receiver_readable_id': 989735,
  'receiver_username': 'admin',
  'type': 'comission_hold',
  'status': 'completed',
  'note': 'Googer commission',
  'created_at': '2026-08-26T05:59:08.000Z',
};

void main() {
  test('suppresses receipts for every web-classified ad transaction', () {
    for (final type in const ['promo_ad', 'ad_hold_summary']) {
      expect(
        isWalletReceiptEligible({'type': type}),
        isFalse,
        reason: '$type must not expose a receipt',
      );
    }
    for (final note in const [
      'Ad campaign budget',
      'Ad promote',
      'Profile promote',
      'Product promote',
      'Video promote',
      'Photo promote',
    ]) {
      expect(
        isWalletReceiptEligible({'type': 'transfer', 'note': note}),
        isFalse,
        reason: '$note must not expose a receipt',
      );
    }
    expect(
      isWalletReceiptEligible({'type': 'request', 'status': 'pending'}),
      isTrue,
    );
  });

  test(
    'allows auto-renew receipts and suppresses other system purchase rows',
    () {
      expect(
        isWalletReceiptEligible({
          'type': 'sub_auto_renew',
          'status': 'accepted',
        }),
        isTrue,
      );
      for (final type in const [
        'subscription_payment',
        'vault_purchase',
        'flash_purchase',
      ]) {
        expect(
          isWalletReceiptEligible({'type': type, 'status': 'accepted'}),
          isFalse,
          reason: '$type must not expose a receipt',
        );
      }
    },
  );

  test('uses backend receipt id and readable account ids', () {
    final receipt = buildWalletReceipt(_transaction);
    expect(receipt.transactionId, 'G25GE5R163');
    expect(
      receipt.details.any(
        (detail) =>
            detail.label == 'From Account' && detail.value == 'ID 350463 (hee)',
      ),
      isTrue,
    );
    expect(
      receipt.details.any(
        (detail) =>
            detail.label == 'Send To' && detail.value == 'ID 312495 (googer)',
      ),
      isTrue,
    );
    expect(
      receipt.details.any(
        (detail) => detail.label == 'Status' && detail.value == 'Accepted',
      ),
      isTrue,
    );
  });

  test('hides admin counterparty on Googer commission receipt rows', () {
    final receipt = buildWalletReceipt(_googerCommissionTransaction);
    final visibleDetails = receipt.details
        .map((detail) => '${detail.label}: ${detail.value}')
        .join('\n');

    expect(
      isGoogerCommissionWalletTransaction(_googerCommissionTransaction),
      isTrue,
    );
    expect(receipt.title, 'Googer Commission Fee');
    expect(visibleDetails, contains('Send To: Googer Commission'));
    expect(visibleDetails, isNot(contains('admin')));
    expect(visibleDetails, isNot(contains('ID 989735 (admin)')));
  });

  test(
    'generates the receipt PDF bytes without changing the backend row',
    () async {
      final receipt = buildWalletReceipt(_transaction);
      // The VM test target uses the no-op downloader, so false means the PDF was
      // generated successfully and only the platform save step was unavailable.
      expect(await downloadWalletReceiptPdf(receipt), isFalse);
      expect(_transaction['transaction_id'], 'G25GE5R163');
    },
  );

  testWidgets('receipt dialog renders at narrow mobile width', (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showWalletReceiptDialog(context, _transaction),
              child: const Text('OPEN'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('OPEN'));
    await tester.pumpAndSettle();

    expect(find.text('GOOGER WALLET Transaction Receipt'), findsOneWidget);
    expect(find.text('G25GE5R163'), findsOneWidget);
    expect(find.byKey(const Key('wallet-receipt-copy')), findsOneWidget);
    expect(find.byKey(const Key('wallet-receipt-download')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('transaction history receipt button opens the receipt popup', (
    tester,
  ) async {
    Api.user = const {'id': 1, 'user_id': 312495, 'username': 'googer'};
    addTearDown(() {
      Api.user = null;
    });

    final transactions = [
      {
        'id': 165,
        'transaction_id': 'G25GE4X165',
        'amount': '1.00',
        'sender_id': 1,
        'sender_readable_id': 312495,
        'sender_username': 'googer',
        'receiver_id': 1,
        'receiver_readable_id': 312495,
        'receiver_username': 'googer',
        'type': 'sub_auto_renew',
        'status': 'accepted',
        'note': 'Subscription Auto Renew - Basic Plan',
        'created_at': '2026-08-07T07:32:11.000Z',
      },
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: TransactionsScreen(historyLoader: () async => transactions),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Sent To: googer'), findsOneWidget);
    expect(find.text('SUB\nAUTO\nRENEW'), findsOneWidget);
    expect(find.text('COMPLETED'), findsOneWidget);
    expect(find.text('- R 1.00'), findsOneWidget);
    expect(find.byKey(const Key('transaction-receipt-165')), findsOneWidget);

    await tester.tap(find.byKey(const Key('transaction-receipt-165')));
    await tester.pumpAndSettle();

    expect(find.text('GOOGER WALLET Transaction Receipt'), findsOneWidget);
    expect(find.text('G25GE4X165'), findsOneWidget);
    expect(find.byKey(const Key('wallet-receipt-download')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('transaction history shows Googer Commission instead of admin', (
    tester,
  ) async {
    Api.user = const {'id': 1, 'user_id': 350463, 'username': 'hee'};
    addTearDown(() {
      Api.user = null;
    });

    await tester.pumpWidget(
      MaterialApp(
        home: TransactionsScreen(
          historyLoader: () async => [_googerCommissionTransaction],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Sent To: Googer Commission'), findsOneWidget);
    expect(find.textContaining('admin'), findsNothing);
    expect(find.textContaining('ID 989735'), findsNothing);
    expect(find.text('COMMISSION\nHOLD'), findsOneWidget);
    expect(find.byKey(const Key('transaction-receipt-989735')), findsOneWidget);

    await tester.tap(find.byKey(const Key('transaction-receipt-989735')));
    await tester.pumpAndSettle();

    expect(find.text('Googer Commission'), findsWidgets);
    expect(find.textContaining('admin'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
