import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/util/p2p_transaction_presentation.dart';

void main() {
  group('P2P trade start payload', () {
    test(
      'Buy Coins sends payment-currency amount and Rupieer receive amount',
      () {
        final payload = P2pTradeStartPayload.fromEntry(
          mode: P2pMarketMode.buyCoins,
          enteredAmount: 10,
          rate: 1,
          adCurrency: 'LKR',
        );

        expect(payload.amount, 10);
        expect(payload.receiveAmount, 10);
        expect(payload.receiveCurrency, isNull);
        expect(payload.reservedRupieer, 10);
        expect(payload.toJson(), {'amount': 10.0, 'receive_amount': 10.0});
      },
    );

    test(
      'Sell Coins sends Rupieer amount and payment-currency receive amount',
      () {
        final payload = P2pTradeStartPayload.fromEntry(
          mode: P2pMarketMode.sellCoins,
          enteredAmount: 100,
          rate: 2,
          adCurrency: 'USD',
        );

        expect(payload.amount, 100);
        expect(payload.receiveAmount, 50);
        expect(payload.receiveCurrency, 'USD');
        expect(payload.reservedRupieer, 100);
        expect(payload.toJson(), {
          'amount': 100.0,
          'receive_amount': 50.0,
          'receive_currency': 'USD',
        });
      },
    );
  });

  group('Buy Coins transaction summary', () {
    test('keeps Buy API values and lets role/status choose web formatting', () {
      final values = P2pTransactionDisplayValues.fromApi(
        mode: P2pMarketMode.buyCoins,
        apiAmount: 10,
        apiReceiveAmount: 10,
        adCurrency: 'LKR',
        apiReceiveCurrency: 'LKR',
      );

      expect(values.amount, 10);
      expect(values.amountCurrency, 'LKR');
      expect(values.receiveAmount, 10);
      expect(values.receiveCurrency, 'LKR');
    });

    for (final status in ['pending', 'completed', 'cancelled']) {
      for (final isBuyer in [true, false]) {
        test(
          '$status ${isBuyer ? 'buyer' : 'seller'} keeps API currencies',
          () {
            final summary = P2pTransactionSummary.forTransaction(
              mode: P2pMarketMode.buyCoins,
              isBuyer: isBuyer,
              status: status,
              amount: 10,
              receiveAmount: 10,
              adCurrency: 'USDT',
              receiveCurrency: '',
            );

            expect(summary.leftAmount, 10);
            expect(
              summary.leftCurrency,
              status == 'pending' && !isBuyer ? 'R' : 'USDT',
            );
            expect(summary.rightAmount, 10);
            expect(
              summary.rightCurrency,
              status == 'pending' && !isBuyer ? '' : 'R',
            );
            expect(
              summary.leftLabel,
              status == 'pending' && isBuyer ? 'Enter Amount' : 'Amount',
            );
            expect(
              summary.rightLabel,
              status == 'completed'
                  ? 'Received'
                  : status == 'pending' && isBuyer
                  ? 'You Receive'
                  : 'Receive',
            );
          },
        );
      }
    }
  });

  group('Sell Coins transaction summary', () {
    for (final status in ['pending', 'completed', 'cancelled']) {
      test('$status buyer pays Rupieer and receives payment currency', () {
        final summary = P2pTransactionSummary.forTransaction(
          mode: P2pMarketMode.sellCoins,
          isBuyer: true,
          status: status,
          amount: 100,
          receiveAmount: 100,
          adCurrency: 'LKR',
          receiveCurrency: 'LKR',
        );

        expect(summary.leftLabel, 'You Pay');
        expect(summary.leftAmount, 100);
        expect(summary.leftCurrency, 'Rupieer');
        expect(summary.rightLabel, 'You Receive');
        expect(summary.rightAmount, 100);
        expect(summary.rightCurrency, 'LKR');
      });

      test('$status seller pays payment currency and receives Rupieer', () {
        final summary = P2pTransactionSummary.forTransaction(
          mode: P2pMarketMode.sellCoins,
          isBuyer: false,
          status: status,
          amount: 100,
          receiveAmount: 100,
          adCurrency: 'LKR',
          receiveCurrency: 'LKR',
        );

        expect(summary.leftLabel, 'You Pay');
        expect(summary.leftAmount, 100);
        expect(summary.leftCurrency, 'LKR');
        expect(summary.rightLabel, 'You Receive');
        expect(summary.rightAmount, 100);
        expect(summary.rightCurrency, 'Rupieer');
      });
    }
  });
}
