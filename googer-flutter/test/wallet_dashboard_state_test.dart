import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/models/wallet_dashboard.dart';
import 'package:googer_app/screens/wallet_screen.dart';
import 'package:googer_app/services/wallet_dashboard_service.dart';

class _SequenceWalletRepository extends WalletDashboardRepository {
  final List<Future<WalletDashboardSnapshot> Function()> responses;
  int calls = 0;

  _SequenceWalletRepository(this.responses);

  @override
  Future<WalletDashboardSnapshot> load() {
    final index = calls < responses.length ? calls : responses.length - 1;
    calls++;
    return responses[index]();
  }
}

const _snapshot = WalletDashboardSnapshot(
  googerId: '312495',
  balance: 99.20,
  transactionCount: 3,
  adCount: 2,
  isVerified: true,
  planName: 'Basic',
);

void main() {
  testWidgets('shows initial loading then a retryable backend error', (
    tester,
  ) async {
    final pending = Completer<WalletDashboardSnapshot>();
    final repository = _SequenceWalletRepository([
      () => pending.future,
      () async => _snapshot,
    ]);

    await tester.pumpWidget(
      MaterialApp(home: WalletScreen(repository: repository)),
    );
    expect(find.byKey(const Key('wallet-loading')), findsOneWidget);

    pending.completeError(ApiError(500, 'Wallet service unavailable'));
    await tester.pump();
    expect(find.text('Wallet service unavailable'), findsOneWidget);
    expect(find.byKey(const Key('wallet-retry')), findsOneWidget);

    await tester.tap(find.byKey(const Key('wallet-retry')));
    await tester.pump();
    expect(find.text('99.20'), findsWidgets);
    expect(find.textContaining('312495'), findsWidgets);
  });

  testWidgets('failed refresh keeps the last successful wallet visible', (
    tester,
  ) async {
    final repository = _SequenceWalletRepository([
      () async => _snapshot,
      () => Future.error(Exception('offline')),
    ]);

    await tester.pumpWidget(
      MaterialApp(home: WalletScreen(repository: repository)),
    );
    await tester.pump();
    expect(find.text('99.20'), findsWidgets);

    await tester.drag(find.byType(ListView), const Offset(0, 300));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('99.20'), findsWidgets);
    expect(find.byKey(const Key('wallet-refresh-error')), findsOneWidget);
  });
}
