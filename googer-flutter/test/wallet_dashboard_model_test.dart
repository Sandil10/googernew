import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/models/wallet_dashboard.dart';

void main() {
  test('maps all wallet dashboard response envelopes', () {
    final snapshot = WalletDashboardSnapshot.fromApi({
      'profile': {'id': 7, 'user_id': '312495', 'wallet_balance': '99.20'},
      'history': {
        'success': true,
        'transactions': [
          {'id': 1},
          {'id': 2},
        ],
      },
      'ads': {
        'success': true,
        'ads': [
          {'id': 10},
        ],
      },
      'verification': {
        'success': true,
        'verification': {'status': 'Verified'},
      },
      'subscription': {
        'success': true,
        'subscription': {'plan_name': 'Creator'},
      },
    });

    expect(snapshot.googerId, '312495');
    expect(snapshot.balance, 99.20);
    expect(snapshot.transactionCount, 2);
    expect(snapshot.adCount, 1);
    expect(snapshot.isVerified, isTrue);
    expect(snapshot.planName, 'Creator');
  });

  test('falls back to profile id and accepts approved status', () {
    final snapshot = WalletDashboardSnapshot.fromApi({
      'profile': {'id': 44, 'wallet_balance': 8},
      'verification': {
        'data': {'status': 'approved'},
      },
    });

    expect(snapshot.googerId, '44');
    expect(snapshot.balance, 8);
    expect(snapshot.isVerified, isTrue);
    expect(snapshot.transactionCount, 0);
    expect(snapshot.adCount, 0);
  });
}
