import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../models/wallet_dashboard.dart';
import '../services/app_notifications.dart';
import '../services/wallet_dashboard_service.dart';
import '../theme/colors.dart';
import '../widgets/wallet_bits.dart';
import 'ad_center_screen.dart';
import 'my_wallet_screen.dart';
import 'sell_screen.dart';
import 'subscription_screen.dart';
import 'transactions_screen.dart';
import 'wallet_verification_screen.dart';
import 'withdrawal_screen.dart';

/// Wallet home — compact layout: an ID strip, an estimated-balance card whose
/// small boxes cover every service four to a row, then those same services
/// repeated as single-line detail rows carrying their stats.
///
/// Each service is one row rather than a full-height card so the whole set
/// (wallet, top up, withdrawal, transactions, requests, P2P, verification,
/// subscription, ad centre) fits without endless scrolling.
class WalletScreen extends StatefulWidget {
  final WalletDashboardRepository repository;

  const WalletScreen({
    super.key,
    this.repository = const ApiWalletDashboardRepository(),
  });

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  WalletDashboardSnapshot? _snapshot;
  bool _loading = true;
  String? _loadError;
  bool _hideBalance = false;
  bool _copied = false;

  double get _balance => _snapshot?.balance ?? 0;
  int get _txCount => _snapshot?.transactionCount ?? 0;
  int get _adCount => _snapshot?.adCount ?? 0;
  bool get _verified => _snapshot?.isVerified ?? false;
  String get _planName => _snapshot?.planName ?? '';
  String get _googerId => _snapshot?.googerId ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_snapshot == null && mounted) {
      setState(() {
        _loading = true;
        _loadError = null;
      });
    }
    try {
      final snapshot = await widget.repository.load();
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _loadError = null;
      });
    } on ApiError catch (error) {
      if (!mounted) return;
      setState(() => _loadError = error.message);
    } on FormatException {
      if (!mounted) return;
      setState(
        () => _loadError = 'The wallet service returned an invalid response.',
      );
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _loadError =
            'Could not load your wallet. Check your connection and retry.',
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String get _shownBalance => _hideBalance ? '••••••' : formatMoney(_balance);

  void _push(Widget screen) => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => screen),
  ).then((_) => _load());

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppColors.textGray300,
      backgroundColor: AppColors.bg1,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
        children: _loading && _snapshot == null
            ? [_loadingState()]
            : _snapshot == null
            ? [_errorState()]
            : [
                if (_loadError != null) _refreshError(),
                _idCard(),
                const SizedBox(height: 14),
                _balanceCard(),
                const SizedBox(height: 20),
                const Text(
                  'Wallet Details',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),
                _detailGroup(),
              ],
      ),
    );
  }

  Widget _loadingState() {
    return const SizedBox(
      height: 420,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(
            key: Key('wallet-loading'),
            color: Colors.white,
            strokeWidth: 2,
          ),
          SizedBox(height: 16),
          Text(
            'Loading wallet...',
            style: TextStyle(color: AppColors.textGray400),
          ),
        ],
      ),
    );
  }

  Widget _errorState() {
    return SizedBox(
      height: 420,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Ionicons.wallet_outline,
            size: 34,
            color: AppColors.textGray400,
          ),
          const SizedBox(height: 14),
          Text(
            _loadError ?? 'Could not load your wallet.',
            key: const Key('wallet-error'),
            textAlign: TextAlign.center,
            style: const TextStyle(height: 1.45, color: AppColors.textGray300),
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            key: const Key('wallet-retry'),
            onPressed: _load,
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: const BorderSide(color: AppColors.borderWhite10),
            ),
            child: const Text('RETRY'),
          ),
        ],
      ),
    );
  }

  Widget _refreshError() {
    return Container(
      key: const Key('wallet-refresh-error'),
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.purpleBg10,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.purpleBorder),
      ),
      child: Row(
        children: [
          const Icon(
            Ionicons.cloud_offline_outline,
            size: 17,
            color: AppColors.textGray300,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              _loadError!,
              style: const TextStyle(
                fontSize: 11.5,
                color: AppColors.textGray300,
              ),
            ),
          ),
          TextButton(onPressed: _load, child: const Text('RETRY')),
        ],
      ),
    );
  }

  String get _referralLink => 'https://googer.site/register?ref=$_googerId';

  /// `/wallet-pay?to=<id>` — the same link the web encodes into its wallet QR.
  String get _walletPayLink =>
      'https://googer.site/wallet-pay?to=${Uri.encodeComponent(_googerId)}';

  String get _qrImage =>
      'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=1'
      '&data=${Uri.encodeComponent(_walletPayLink)}';

  /// The white header card: the Googer ID, then the referral link with copy,
  /// share and wallet-QR actions — a port of `app/dashboard/wallet/page.tsx`.
  Widget _idCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 16, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          Text(
            '( My Googer ID - ${_googerId.isEmpty ? "-" : _googerId} )',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 16.5,
              letterSpacing: 0.4,
              fontWeight: FontWeight.w600,
              color: Colors.black,
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.fromLTRB(11, 7, 7, 7),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE5E7EB)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _referralLink,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: Color(0xFF6B7280),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                _lightAction(
                  child: Icon(
                    _copied ? Ionicons.checkmark : Ionicons.copy_outline,
                    size: 16,
                    color: _copied
                        ? const Color(0xFF16A34A)
                        : const Color(0xFF111827),
                  ),
                  onTap: _copyReferral,
                ),
                const SizedBox(width: 7),
                _lightAction(
                  child: const Icon(
                    Ionicons.share_social_outline,
                    size: 16,
                    color: Color(0xFF111827),
                  ),
                  onTap: _showReferralShare,
                ),
                if (_googerId.isNotEmpty) ...[
                  const SizedBox(width: 7),
                  _lightAction(
                    padding: 3,
                    child: Image.network(
                      _qrImage,
                      width: 24,
                      height: 24,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(
                        Ionicons.qr_code_outline,
                        size: 16,
                        color: Color(0xFF111827),
                      ),
                    ),
                    onTap: _showWalletQr,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _copyReferral() {
    Clipboard.setData(ClipboardData(text: _referralLink));
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  void _showReferralShare() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        side: BorderSide(color: AppColors.borderWhite10),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Share referral link',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: SelectableText(
                  _referralLink,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textGray300,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              FilledButton(
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: _referralLink));
                  Navigator.pop(sheetContext);
                  AppNotifications.success('Referral link copied');
                },
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: Colors.black,
                ),
                child: const Text('COPY LINK'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _lightAction({
    required Widget child,
    required VoidCallback onTap,
    double padding = 7,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.all(padding),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: child,
      ),
    );
  }

  void _showWalletQr() {
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: AppColors.bg1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Wallet QR',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Image.network(
                  _qrImage,
                  width: 180,
                  height: 180,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const SizedBox(
                    width: 180,
                    height: 180,
                    child: Center(
                      child: Text(
                        'QR unavailable',
                        style: TextStyle(fontSize: 12, color: Colors.black54),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Scan to open wallet transfer with this Googer ID filled.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11.5,
                  height: 1.5,
                  color: AppColors.textGray400,
                ),
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: _walletPayLink));
                        AppNotifications.success('Wallet link copied');
                      },
                      child: Container(
                        height: 38,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(11),
                          border: Border.all(color: AppColors.borderWhite10),
                        ),
                        child: const Text(
                          'COPY LINK',
                          style: TextStyle(
                            fontSize: 11,
                            letterSpacing: 1.2,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: GestureDetector(
                      onTap: () => Navigator.pop(context),
                      child: Container(
                        height: 38,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: const Text(
                          'CLOSE',
                          style: TextStyle(
                            fontSize: 11,
                            letterSpacing: 1.2,
                            fontWeight: FontWeight.w600,
                            color: Colors.black,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _balanceCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Estimated Balance',
                  style: TextStyle(
                    fontSize: 13.5,
                    color: AppColors.textGray400,
                  ),
                ),
              ),
              GestureDetector(
                onTap: () => setState(() => _hideBalance = !_hideBalance),
                child: Icon(
                  _hideBalance
                      ? Ionicons.eye_off_outline
                      : Ionicons.eye_outline,
                  size: 17,
                  color: AppColors.textGray400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const RupeeCoin(size: 24),
              const SizedBox(width: 9),
              Flexible(
                child: Text(
                  _shownBalance,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 22, color: Colors.white),
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'RPR',
                style: TextStyle(fontSize: 12.5, color: AppColors.textGray500),
              ),
            ],
          ),
          const SizedBox(height: 22),
          _serviceGrid(),
        ],
      ),
    );
  }

  /// Every wallet service as a small box, four to a row.
  ///
  /// The same services are repeated as detail rows below; this grid is the
  /// quick way in, the rows carry the stats.
  Widget _serviceGrid() {
    final items = <(IconData, String, VoidCallback)>[
      (Ionicons.wallet_outline, 'Wallet', () => _push(const MyWalletScreen())),
      (
        Ionicons.add_outline,
        'Top Up',
        () => _push(const SellScreen(startOnBuy: true)),
      ),
      (
        Ionicons.cash_outline,
        'Withdraw',
        () => _push(const WithdrawalScreen()),
      ),
      (
        Ionicons.receipt_outline,
        'History',
        () => _push(const TransactionsScreen()),
      ),
      (
        Ionicons.swap_horizontal_outline,
        'Buy & Sell',
        () => _push(const SellScreen(startOnBuy: true)),
      ),
      (
        Ionicons.shield_checkmark_outline,
        'Verify',
        () => _push(const WalletVerificationScreen()),
      ),
      (Ionicons.card_outline, 'Plans', () => _push(const SubscriptionScreen())),
      (
        Ionicons.megaphone_outline,
        'Ad Center',
        () => _push(const AdCenterScreen()),
      ),
    ];

    const perRow = 4;
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += perRow) {
      final end = i + perRow > items.length ? items.length : i + perRow;
      final slice = items.sublist(i, end);
      rows.add(
        Row(
          children: [
            for (final item in slice)
              Expanded(child: _serviceBox(item.$1, item.$2, item.$3)),
            // Pad a short last row so its boxes keep the width of a full row
            // instead of stretching across the card.
            for (var k = slice.length; k < perRow; k++)
              const Expanded(child: SizedBox()),
          ],
        ),
      );
      if (end < items.length) rows.add(const SizedBox(height: 14));
    }
    return Column(children: rows);
  }

  Widget _serviceBox(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Icon(icon, size: 16, color: Colors.white),
          ),
          const SizedBox(height: 7),
          // Fixed height keeps one- and two-line labels on a shared baseline,
          // so the boxes in a row line up.
          SizedBox(
            height: 26,
            child: Text(
              label,
              maxLines: 2,
              textAlign: TextAlign.center,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 10.5,
                height: 1.15,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// One bordered group with hairline dividers, as in the compact design.
  Widget _detailGroup() {
    final rows = <Widget>[
      _detailRow(
        Ionicons.wallet_outline,
        'My Wallet',
        'Manage your balance and earnings',
        'Balance',
        _shownBalance,
        coin: true,
        onTap: () => _push(const MyWalletScreen()),
      ),
      _detailRow(
        Ionicons.add_circle_outline,
        'Top Up',
        'Recharge your wallet with Rupieer coins',
        'Wallet',
        'Topup',
        onTap: () => _push(const SellScreen(startOnBuy: true)),
      ),
      _detailRow(
        Ionicons.cash_outline,
        'Withdrawal',
        'Cash out your earnings to your account',
        'Available',
        _shownBalance,
        coin: true,
        onTap: () => _push(const WithdrawalScreen()),
      ),
      _detailRow(
        Ionicons.receipt_outline,
        'Transactions',
        'View your transaction history',
        'Total',
        '$_txCount txns',
        onTap: () => _push(const TransactionsScreen()),
      ),
      _detailRow(
        Ionicons.swap_horizontal_outline,
        'Buy & Sell Coins',
        'Trade coins with other Googers',
        'P2P',
        'Market',
        onTap: () => _push(const SellScreen(startOnBuy: true)),
      ),
      _detailRow(
        Ionicons.shield_checkmark_outline,
        _verified ? 'Verified' : 'Get Verified',
        'Apply for a blue verification badge',
        'Identity',
        _verified ? 'Approved' : 'Verify',
        onTap: () => _push(const WalletVerificationScreen()),
      ),
      _detailRow(
        Ionicons.card_outline,
        'Subscription Plans',
        'Choose a package that suits you',
        'Plan',
        _planName.isEmpty ? 'Choose' : _planName,
        onTap: () => _push(const SubscriptionScreen()),
      ),
      _detailRow(
        Ionicons.megaphone_outline,
        'Ad Center',
        'Track your campaign spend',
        'Marketing',
        '$_adCount Ads',
        onTap: () => _push(const AdCenterScreen()),
      ),
    ];

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[
            rows[i],
            if (i != rows.length - 1)
              const Divider(height: 1, color: AppColors.borderWhite06),
          ],
        ],
      ),
    );
  }

  Widget _detailRow(
    IconData icon,
    String title,
    String subtitle,
    String label,
    String value, {
    bool coin = false,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Icon(icon, size: 18, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 14.5, color: Colors.white),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            // Label and value share one line in the right-hand corner, so the
            // stat reads across from the title rather than stacking below
            // itself. Flexible so a long value shrinks before the title does
            // and can never push the row into an overflow.
            Flexible(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11.5,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ),
                  const SizedBox(width: 7),
                  if (coin) ...[
                    const RupeeCoin(size: 15),
                    const SizedBox(width: 5),
                  ],
                  Flexible(
                    child: Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, color: Colors.white),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
