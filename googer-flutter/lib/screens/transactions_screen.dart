import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/wallet_receipt.dart';
import '../widgets/app_back_button.dart';
import '../widgets/wallet_receipt_dialog.dart';

/// Full transaction history backed by the same GET /wallet/history payload as
/// the web wallet. Every row opens the shared receipt presentation.
class TransactionsScreen extends StatefulWidget {
  final Future<List<Map<String, dynamic>>> Function()? historyLoader;

  const TransactionsScreen({super.key, this.historyLoader});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _transactions = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await (widget.historyLoader ?? Api.walletHistoryRaw)();
    if (!mounted) return;
    setState(() {
      _transactions = rows;
      _loading = false;
    });
  }

  bool _outgoing(Map<String, dynamic> tx) {
    final me = {
      ...Api.currentUserIds,
      Api.currentUserId,
    }.map((id) => id.trim()).where((id) => id.isNotEmpty).toSet();
    if (me.isEmpty) return true;
    return [
      tx['sender_id'],
      tx['sender_readable_id'],
      tx['sender_user_id'],
      tx['sender_googer_id'],
    ].any((id) => me.contains('$id'.trim()));
  }

  bool _canCancel(Map<String, dynamic> tx) {
    if (!_outgoing(tx) ||
        '${tx['status'] ?? ''}'.toLowerCase() != 'pending' ||
        !isWalletReceiptEligible(tx)) {
      return false;
    }
    if ('${tx['type'] ?? ''}'.toLowerCase() != 'order_hold') return true;
    final manual = RegExp(
      'manual payment',
      caseSensitive: false,
    ).hasMatch('${tx['note'] ?? ''}');
    return manual && tx['linked_order_can_cancel'] == true;
  }

  Future<void> _cancel(Map<String, dynamic> tx) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.bg1,
        title: const Text(
          'Cancel transaction?',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'Any held coins will be returned according to the wallet rules.',
          style: TextStyle(color: AppColors.textGray400),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('KEEP'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(
              'CANCEL TRANSACTION',
              style: TextStyle(color: AppColors.likeRed),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final id = int.tryParse('${tx['id'] ?? 0}') ?? 0;
    final error = id == 0
        ? 'Invalid transaction.'
        : await Api.cancelTransaction(id);
    if (!mounted) return;
    if (error == null) {
      AppNotifications.success('Transaction cancelled');
      await _load();
    } else {
      AppNotifications.error('Could not cancel transaction', error);
    }
  }

  String _counterparty(Map<String, dynamic> tx) {
    if (isGoogerCommissionWalletTransaction(tx)) {
      return 'Googer Commission';
    }
    final outgoing = _outgoing(tx);
    final username = outgoing ? tx['receiver_username'] : tx['sender_username'];
    final readableId = outgoing
        ? (tx['receiver_readable_id'] ?? tx['receiver_id'])
        : (tx['sender_readable_id'] ?? tx['sender_id']);
    return '${username ?? 'Googer'} (ID ${readableId ?? 'N/A'})';
  }

  String _actionLabel(Map<String, dynamic> tx) {
    final type = '${tx['type'] ?? ''}'.trim().toLowerCase().replaceAll(
      'comission',
      'commission',
    );
    if (type.isEmpty) return 'WALLET\nTXN';
    return type
        .replaceAll('_', ' ')
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(3)
        .join('\n')
        .toUpperCase();
  }

  String _rowStatus(Map<String, dynamic> tx) {
    final raw = '${tx['status'] ?? ''}'.trim().toLowerCase();
    return switch (raw) {
      'accepted' || 'completed' => 'COMPLETED',
      'cancelled' || 'canceled' => 'CANCELLED',
      'rejected' => 'REJECTED',
      '' => 'PENDING',
      _ => raw.toUpperCase(),
    };
  }

  Color _statusColor(String status) => switch (status) {
    'COMPLETED' => AppColors.successGreen,
    'CANCELLED' || 'REJECTED' => AppColors.likeRed,
    _ => const Color(0xFFFACC15),
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        leading: const AppBackButton.appBar(),
        title: const Text(
          'Transaction History',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.border1),
        ),
      ),
      body: RefreshIndicator(
        color: Colors.white,
        backgroundColor: AppColors.bg1,
        onRefresh: _load,
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.textGray400,
                ),
              )
            : _transactions.isEmpty
            ? ListView(
                children: const [
                  SizedBox(height: 160),
                  Icon(
                    Ionicons.receipt_outline,
                    size: 34,
                    color: AppColors.textGray600,
                  ),
                  SizedBox(height: 14),
                  Center(
                    child: Text(
                      'NO TRANSACTIONS FOUND',
                      style: TextStyle(
                        fontSize: 12,
                        letterSpacing: 1.4,
                        color: AppColors.textGray600,
                      ),
                    ),
                  ),
                ],
              )
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(5, 6, 5, 18),
                itemCount: _transactions.length,
                itemBuilder: (_, index) =>
                    _transactionRow(_transactions[index]),
              ),
      ),
    );
  }

  Widget _transactionRow(Map<String, dynamic> tx) {
    final outgoing = _outgoing(tx);
    final color = outgoing ? AppColors.likeRed : AppColors.successGreen;
    final amount = double.tryParse('${tx['amount'] ?? 0}') ?? 0;
    final note = '${tx['note'] ?? tx['type'] ?? 'Wallet transaction'}';
    final hasReceipt = isWalletReceiptEligible(tx);
    final canCancel = _canCancel(tx);
    final status = _rowStatus(tx);
    final width = MediaQuery.sizeOf(context).width;
    final compact = width < 370;
    final tiny = width < 335;
    return InkWell(
      onTap: hasReceipt ? () => showWalletReceiptDialog(context, tx) : null,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.only(bottom: 18),
        padding: EdgeInsets.fromLTRB(
          tiny
              ? 10
              : compact
              ? 12
              : 14,
          compact ? 16 : 18,
          tiny
              ? 10
              : compact
              ? 12
              : 14,
          compact ? 16 : 18,
        ),
        decoration: BoxDecoration(
          color: const Color(0xFF0B0F14),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF1E293B)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.only(top: compact ? 22 : 21),
              child: Container(
                width: compact ? 45 : 60,
                height: compact ? 45 : 60,
                decoration: BoxDecoration(
                  color:
                      (outgoing
                              ? const Color(0xFF7F1D1D)
                              : const Color(0xFF064E3B))
                          .withValues(alpha: 0.42),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  outgoing
                      ? Ionicons.arrow_up_outline
                      : Ionicons.arrow_down_outline,
                  size: compact ? 23 : 28,
                  color: Colors.white,
                ),
              ),
            ),
            SizedBox(width: compact ? 10 : 18),
            Expanded(
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 124),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            '${outgoing ? 'Sent To' : 'Received From'}: '
                            '${_counterparty(tx)}',
                            maxLines: 2,
                            overflow: TextOverflow.visible,
                            style: TextStyle(
                              fontSize: compact ? 12.5 : 14,
                              height: 1.18,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          '${outgoing ? '-' : '+'} R ${amount.abs().toStringAsFixed(2)}',
                          textAlign: TextAlign.right,
                          style: TextStyle(
                            fontSize: compact ? 13 : 15,
                            height: 1.35,
                            fontWeight: FontWeight.w900,
                            color: color,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      formatWalletHistoryDateTime(tx['created_at'] ?? ''),
                      style: TextStyle(
                        fontSize: compact ? 10.5 : 11.5,
                        height: 1.25,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFFBFDBFE),
                      ),
                    ),
                    SizedBox(height: compact ? 14 : 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Text(
                            note,
                            maxLines: 2,
                            overflow: TextOverflow.visible,
                            style: TextStyle(
                              fontSize: compact ? 10 : 11,
                              height: 1.2,
                              fontStyle: FontStyle.italic,
                              color: Color(0xFF94A3B8),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          status,
                          style: TextStyle(
                            fontSize: compact ? 10 : 10.5,
                            height: 1.2,
                            fontWeight: FontWeight.w900,
                            color: _statusColor(status),
                          ),
                        ),
                        SizedBox(width: compact ? 8 : 10),
                        if (hasReceipt)
                          Material(
                            key: Key(
                              'transaction-receipt-${tx['id'] ?? tx['transaction_id']}',
                            ),
                            color: const Color(0xFF161A20),
                            borderRadius: BorderRadius.circular(11),
                            child: InkWell(
                              onTap: () => showWalletReceiptDialog(context, tx),
                              borderRadius: BorderRadius.circular(11),
                              child: Container(
                                width: compact ? 32 : 34,
                                height: compact ? 40 : 42,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(11),
                                  border: Border.all(
                                    color: Colors.white.withValues(alpha: 0.16),
                                  ),
                                ),
                                child: const Icon(
                                  Ionicons.receipt_outline,
                                  size: 21,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (canCancel) ...[
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerRight,
                        child: GestureDetector(
                          onTap: () => _cancel(tx),
                          child: const Text(
                            'CANCEL',
                            style: TextStyle(
                              fontSize: 10.5,
                              letterSpacing: 1,
                              fontWeight: FontWeight.w900,
                              color: AppColors.likeRed,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            SizedBox(width: compact ? 6 : 8),
            Container(
              width: compact ? 78 : 96,
              margin: EdgeInsets.only(top: compact ? 51 : 55),
              padding: EdgeInsets.symmetric(
                horizontal: compact ? 7 : 9,
                vertical: compact ? 7 : 8,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFF101722),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                _actionLabel(tx),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: compact ? 10 : 10.5,
                  height: 1.2,
                  fontWeight: FontWeight.w900,
                  color: Color(0xFFFFD400),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
