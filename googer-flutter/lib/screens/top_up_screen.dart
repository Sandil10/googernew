import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../widgets/app_back_button.dart';
import '../widgets/wallet_bits.dart';
import 'bank_transfer_screen.dart';
import 'request_screen.dart';
import 'sell_screen.dart';

/// Wallet · Top Up — port of the web `dashboard/wallet/topup` with `step`
/// = `topup`: the Buy/Sell/Top Up pill row, the `Top Up` heading and the
/// Topup Coins / Pending / Complete tab card.
///
/// Pending and Complete are empty states on the web too — the backend has no
/// top-up transaction feed yet, so there is nothing to list.
class TopUpScreen extends StatefulWidget {
  /// The Buy and Sell marketplaces are siblings of this page on the wallet hub
  /// that pushed it, so by default the pills pop back there. A host that owns a
  /// different stack can hand in its own navigation instead.
  final VoidCallback? onBuyCoins;
  final VoidCallback? onSellCoins;

  const TopUpScreen({super.key, this.onBuyCoins, this.onSellCoins});

  @override
  State<TopUpScreen> createState() => _TopUpScreenState();
}

class _TopUpScreenState extends State<TopUpScreen> {
  static const _tabs = ['Topup Coins', 'Pending', 'Complete'];

  /// Mirrors the web's hardcoded radio list. Used until (and unless) the admin
  /// endpoint answers with its own configured methods.
  static const _fallbackMethods = [
    _PayMethod(id: 'bank', label: 'Direct Bank Transfer'),
    _PayMethod(id: 'payeer', label: 'Pay with Payeer'),
    _PayMethod(id: 'paypal', label: 'Pay with Paypal'),
  ];

  final _amount = TextEditingController(text: '0');

  int _tab = 0;
  List<_PayMethod> _methods = _fallbackMethods;
  String _selectedId = _fallbackMethods.first.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    // No loading gate: the fallback methods and the cached balance are already
    // on screen, so the page never flashes a spinner before it can be used.
    await Api.refreshProfile();
    final rows = await Api.activeTopupMethods();
    if (!mounted) return;
    final live = rows
        .map(_toMethod)
        .whereType<_PayMethod>()
        .toList(growable: false);
    setState(() {
      _methods = live.isEmpty ? _fallbackMethods : live;
      // The previously selected id may not exist in the live list.
      if (!_methods.any((m) => m.id == _selectedId)) {
        _selectedId = _methods.first.id;
      }
    });
  }

  /// Admin methods come back under whichever of these keys the backend used.
  static _PayMethod? _toMethod(Map<String, dynamic> row) {
    for (final key in const ['name', 'method_name', 'title']) {
      final value = '${row[key] ?? ''}'.trim();
      if (value.isNotEmpty) {
        final rawFields = row['fields'];
        final fields = <Map<String, String>>[];
        if (rawFields is List) {
          for (final field in rawFields) {
            if (field is! Map) continue;
            final map = Map<String, dynamic>.from(field);
            final label =
                '${map['label'] ?? map['key'] ?? map['name'] ?? ''}'.trim();
            final fieldValue =
                '${map['value'] ?? map['defaultValue'] ?? map['default_value'] ?? ''}'
                    .trim();
            if (label.isEmpty || fieldValue.isEmpty) continue;
            fields.add({'label': label, 'value': fieldValue});
          }
        }
        return _PayMethod(
          id: '${row['id'] ?? value}',
          label: value,
          fields: fields,
        );
      }
    }
    return null;
  }

  _PayMethod? get _selected {
    for (final method in _methods) {
      if (method.id == _selectedId) return method;
    }
    return null;
  }

  void _makePayment() {
    final amount = double.tryParse(_amount.text.trim()) ?? 0;
    if (amount <= 0) {
      AppNotifications.error(
        'Enter a coin amount',
        'The amount must be greater than zero.',
      );
      return;
    }
    final method = _selected;
    if (method == null) {
      AppNotifications.error('Select a payment method');
      return;
    }
    final isBank =
        method.id == 'bank' ||
        method.id == 'bank_transfer' ||
        method.label.toLowerCase().contains('bank');
    if (isBank) {
      _open(
        BankTransferScreen(
          amount: formatMoney(amount),
          methodName: method.label,
          methodFields: method.fields,
        ),
      );
      return;
    }
    AppNotifications.info(
      'Opening payment gateway',
      '${formatMoney(amount)} via ${method.label}.',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 34),
          children: [
            AppBackButton(),
            const SizedBox(height: 16),
            _pillRow(),
            const SizedBox(height: 18),
            const Text(
              'Top Up',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 18),
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _tabStrip(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
                    child: _tabBody(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---- Header ----

  void _open(Widget screen) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => screen));

  /// The same five chips the marketplace carries, so the row is identical
  /// wherever it appears. Wrapped rather than a Row: they do not fit on one
  /// line at 320px.
  Widget _pillRow() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _pill(
          'BUY COINS',
          Ionicons.cash_outline,
          active: false,
          // Opens the marketplace on the buy side. This used to pop back to
          // the wallet, which looked like the chip did nothing.
          onTap:
              widget.onBuyCoins ??
              () => _open(const SellScreen(startOnBuy: true)),
        ),
        _pill(
          'SELL COINS',
          Ionicons.cash_outline,
          active: false,
          onTap:
              widget.onSellCoins ??
              () => _open(const SellScreen(startOnBuy: false)),
        ),
        _pill(
          'REQUEST',
          Ionicons.paper_plane_outline,
          active: false,
          onTap: () => _open(const RequestScreen()),
        ),
        _pill(
          'TOP UP',
          Ionicons.add_circle_outline,
          active: true,
          onTap: () {}, // already here
        ),
        _pill(
          'POST AD',
          Ionicons.add_outline,
          active: false,
          light: true,
          onTap: () => _open(const SellScreen(openPostAd: true)),
        ),
      ],
    );
  }

  Widget _pill(
    String label,
    IconData icon, {
    required bool active,
    required VoidCallback onTap,
    bool light = false,
  }) {
    final filled = active || light;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: filled ? Colors.white : Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: filled ? Colors.white : AppColors.borderWhite10,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 13,
              color: filled ? Colors.black : AppColors.textGray400,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 9.5,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w600,
                color: filled ? Colors.black : AppColors.textGray400,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---- Tabs ----

  Widget _tabStrip() {
    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.borderWhite10)),
      ),
      // The three labels only just fit at 320px, so let them scroll instead of
      // overflowing.
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [for (var i = 0; i < _tabs.length; i++) _tabItem(i)],
        ),
      ),
    );
  }

  Widget _tabItem(int index) {
    final active = _tab == index;
    return GestureDetector(
      onTap: () => setState(() => _tab = index),
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: EdgeInsets.fromLTRB(index == 0 ? 16 : 12, 16, 12, 0),
        // IntrinsicWidth so the underline matches the label width even though
        // the strip itself is horizontally unbounded.
        child: IntrinsicWidth(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _tabs[index],
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: active ? FontWeight.w600 : FontWeight.w600,
                  color: active ? Colors.white : AppColors.textGray500,
                ),
              ),
              const SizedBox(height: 10),
              Container(
                height: 2,
                color: active ? Colors.white : Colors.transparent,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tabBody() => switch (_tab) {
    1 => _empty(Ionicons.time_outline, 'No Pending Topups Found'),
    2 => _empty(Ionicons.checkmark_circle_outline, 'No Completed Transactions'),
    _ => _topupTab(),
  };

  // ---- Topup Coins ----

  Widget _topupTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Center(
          child: Text(
            'Topup Coins',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 20),
        _balanceBox(),
        const SizedBox(height: 24),
        const Center(
          child: Text(
            'Enter Coin Amount',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray400,
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _amount,
          textAlign: TextAlign.center,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
          ],
          cursorColor: AppColors.accentPurple,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
          decoration: InputDecoration(
            hintText: '1000',
            hintStyle: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray600,
            ),
            contentPadding: const EdgeInsets.symmetric(vertical: 14),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.borderWhite10),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.accentPurple),
            ),
          ),
        ),
        const SizedBox(height: 24),
        const Center(
          child: Text(
            'Select Payment Method',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray400,
            ),
          ),
        ),
        const SizedBox(height: 14),
        for (final method in _methods) ...[
          _methodRow(method),
          const SizedBox(height: 10),
        ],
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _actionButton(
                'CANCEL',
                background: Colors.white.withOpacity(0.06),
                border: AppColors.borderWhite10,
                onTap: () => Navigator.maybePop(context),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _actionButton(
                'MAKE PAYMENT',
                background: AppColors.likeRed,
                border: AppColors.likeRed,
                onTap: _makePayment,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _balanceBox() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        children: [
          const Text(
            'TOTAL WALLET BALANCE',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 1.6,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray400,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const RupeeCoin(size: 20),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  formatMoney(Api.balance),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _methodRow(_PayMethod method) {
    final active = method.id == _selectedId;
    return GestureDetector(
      onTap: () => setState(() => _selectedId = method.id),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: active ? AppColors.borderWhite10 : Colors.transparent,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 18,
              height: 18,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  width: 2,
                  color: active ? Colors.white : AppColors.textGray600,
                ),
              ),
              child: active
                  ? Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                method.label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w500,
                  color: active ? Colors.white : AppColors.textGray400,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _actionButton(
    String label, {
    required Color background,
    required Color border,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 48,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 11.5,
            letterSpacing: 1.1,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  Widget _empty(IconData icon, String label) {
    return Container(
      // Full width on purpose: the card's column is laid out
      // `CrossAxisAlignment.start`, so without this the empty state
      // shrink-wraps its text and hugs the left edge instead of centring.
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 56),
      child: Column(
        children: [
          Container(
            width: 62,
            height: 62,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Icon(icon, size: 24, color: AppColors.textGray600),
          ),
          const SizedBox(height: 18),
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray500,
            ),
          ),
        ],
      ),
    );
  }
}

class _PayMethod {
  final String id;
  final String label;
  final List<Map<String, String>> fields;

  const _PayMethod({
    required this.id,
    required this.label,
    this.fields = const [],
  });
}
