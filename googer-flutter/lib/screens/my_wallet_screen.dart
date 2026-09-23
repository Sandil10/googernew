import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/wallet_receipt.dart';
import '../widgets/app_back_button.dart';
import '../widgets/wallet_bits.dart';
import '../widgets/wallet_receipt_dialog.dart';
import 'transactions_screen.dart';

/// Wallet · My Wallet — port of the web `wallet/my-wallet` page.
///
/// Six tabs over one balance header: Manage (coins management), History,
/// Requests, Referrals, Rewards and Affiliate. Rewards and Affiliate are
/// derived from the statement rather than dedicated endpoints — see
/// [_isAdCoinReward] and [_isResellCommission].
class MyWalletScreen extends StatefulWidget {
  final String? lockedSellerId;
  final double? lockedAmount;

  const MyWalletScreen({super.key, this.lockedSellerId, this.lockedAmount});

  @override
  State<MyWalletScreen> createState() => _MyWalletScreenState();
}

class _MyWalletScreenState extends State<MyWalletScreen> {
  static const _tabs = [
    'Manage',
    'History',
    'Requests',
    'Referrals',
    'Rewards',
    'Affiliate',
  ];
  int _tab = 0;
  bool _loading = true;

  List<Map<String, dynamic>> _history = const [];
  List<Map<String, dynamic>> _requests = const [];
  Map<String, dynamic> _referralData = const {};

  final _amount = TextEditingController();
  final _discount = TextEditingController();
  final _target = TextEditingController();
  bool _submitting = false;
  bool _searchingUsers = false;
  Timer? _userSearchDebounce;
  List<Map<String, dynamic>> _userSuggestions = const [];
  Map<String, dynamic>? _selectedUser;

  double get _balance => Api.balance;

  @override
  void initState() {
    super.initState();
    _load();
    if (widget.lockedSellerId != null && widget.lockedAmount != null) {
      _amount.text = widget.lockedAmount!.toStringAsFixed(2);
      _target.text = widget.lockedSellerId!;
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadLockedSeller());
    }
  }

  bool get _lockedCheckout =>
      widget.lockedSellerId != null && widget.lockedAmount != null;

  Future<void> _loadLockedSeller() async {
    final sellerId = widget.lockedSellerId?.trim() ?? '';
    if (sellerId.isEmpty) return;
    final users = await Api.searchWalletUsers(sellerId);
    if (!mounted) return;
    final match = users.cast<Map<String, dynamic>?>().firstWhere(
      (user) =>
          '${user?['user_id'] ?? user?['googer_id'] ?? ''}'.trim() == sellerId,
      orElse: () => users.isEmpty ? null : users.first,
    );
    setState(() {
      _selectedUser = match;
      _userSuggestions = const [];
      _searchingUsers = false;
    });
  }

  @override
  void dispose() {
    _userSearchDebounce?.cancel();
    _amount.dispose();
    _discount.dispose();
    _target.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    await Api.refreshProfile();
    final results = await Future.wait([
      Api.walletHistoryRaw(),
      Api.pendingRequests(),
      Api.walletReferralData(),
    ]);
    if (!mounted) return;
    setState(() {
      _history = results[0] as List<Map<String, dynamic>>;
      _requests = results[1] as List<Map<String, dynamic>>;
      _referralData = results[2] as Map<String, dynamic>;
      _loading = false;
    });
  }

  // ---- Row helpers ----

  String _note(Map<String, dynamic> m) =>
      '${m["note"] ?? m["description"] ?? m["reason"] ?? ""}';

  double _amountOf(Map<String, dynamic> m) {
    final amount = double.tryParse('${m["amount"] ?? 0}') ?? 0;
    final discount = double.tryParse('${m["commission_percentage"] ?? 0}') ?? 0;
    final type = '${m["type"] ?? ''}'.toLowerCase();
    final status = '${m["status"] ?? ''}'.toLowerCase();
    if (type == 'seller_discount' && discount > 0) {
      return amount * discount / 100;
    }
    if (discount <= 0 ||
        !const {'accepted', 'completed'}.contains(status) ||
        !const {'sell', 'request'}.contains(type)) {
      return amount;
    }
    final net = (amount - (amount * discount / 100)).clamp(0, amount);
    if ((type == 'sell' && !_isOutgoing(m)) ||
        (type == 'request' && _isOutgoing(m))) {
      return net.toDouble();
    }
    return amount;
  }

  bool _isOutgoing(Map<String, dynamic> m) =>
      '${m["sender_id"] ?? ""}' == Api.currentUserId;

  String _cleanName(dynamic primary, [dynamic fallback]) {
    final first = '${primary ?? ''}'.trim();
    final backup = '${fallback ?? ''}'.trim();
    final blocked = RegExp(r'super\s*admin', caseSensitive: false);
    if (first.isNotEmpty && !blocked.hasMatch(first)) return first;
    if (backup.isNotEmpty && !blocked.hasMatch(backup)) return backup;
    return 'Googer';
  }

  String _counterparty(Map<String, dynamic> m) {
    if (isGoogerCommissionWalletTransaction(m)) {
      return 'Googer Commission';
    }
    final out = _isOutgoing(m);
    final name = out
        ? _cleanName(m["receiver_name"], m["receiver_username"])
        : _cleanName(m["sender_name"], m["sender_username"]);
    final id = out
        ? (m["receiver_readable_id"] ??
              m["receiver_user_id"] ??
              m["receiver_id"])
        : (m["sender_readable_id"] ?? m["sender_user_id"] ?? m["sender_id"]);
    final label = name;
    return id == null ? label : '$label (ID $id)';
  }

  String _when(Map<String, dynamic> m) =>
      formatWalletReceiptDateTime(m["created_at"] ?? m["createdAt"] ?? "");

  String _amountLabel(double value) => value == value.roundToDouble()
      ? value.toStringAsFixed(0)
      : value.toStringAsFixed(2);

  bool _isSellerBuyDiscountRequest(Map<String, dynamic> tx) =>
      '${tx["type"] ?? ''}'.toLowerCase() == 'request' &&
      (double.tryParse('${tx["commission_percentage"] ?? 0}') ?? 0) > 0 &&
      '${tx["sender_user_type"] ?? ''}'.toLowerCase() == 'seller';

  bool _isSellDiscountRequest(Map<String, dynamic> tx) =>
      '${tx["type"] ?? ''}'.toLowerCase() == 'sell' &&
      (double.tryParse('${tx["commission_percentage"] ?? 0}') ?? 0) > 0;

  bool _isNormalDiscountRequest(Map<String, dynamic> tx) =>
      '${tx["type"] ?? ''}'.toLowerCase() == 'request' &&
      (double.tryParse('${tx["commission_percentage"] ?? 0}') ?? 0) > 0 &&
      !_isSellerBuyDiscountRequest(tx);

  bool _isNoDiscountBuyRequest(Map<String, dynamic> tx) =>
      '${tx["type"] ?? ''}'.toLowerCase() == 'request' &&
      (double.tryParse('${tx["commission_percentage"] ?? 0}') ?? 0) <= 0;

  bool _isNoDiscountSellTransfer(Map<String, dynamic> tx) =>
      '${tx["type"] ?? ''}'.toLowerCase() == 'sell' &&
      (double.tryParse('${tx["commission_percentage"] ?? 0}') ?? 0) <= 0;

  List<String> _walletDetailLines(Map<String, dynamic> row) {
    final amount = double.tryParse('${row["amount"] ?? 0}') ?? 0;
    final discount =
        double.tryParse('${row["commission_percentage"] ?? 0}') ?? 0;
    if (_isSellerBuyDiscountRequest(row)) {
      return [
        'Coin Request ${_amountLabel(amount)}',
        'Send Discount ${_amountLabel(discount)}%',
      ];
    }
    if (_isSellDiscountRequest(row)) {
      return [
        'Send Coin ${_amountLabel(amount)}',
        'Discount Request ${_amountLabel(discount)}%',
      ];
    }
    if (_isNormalDiscountRequest(row)) {
      return ['Discount Request ${_amountLabel(discount)}%'];
    }
    if (_isNoDiscountBuyRequest(row)) {
      return ['Coin Request'];
    }
    if (_isNoDiscountSellTransfer(row)) {
      return ['Direct Coin Transfer'];
    }
    final note = _note(row).trim();
    if (note.isEmpty) return const [];
    return note
        .split(RegExp(r'[\r\n]+'))
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList(growable: false);
  }

  /// The web tags rows by the note text rather than a column, so the same
  /// heuristic is used here.
  static bool _isAdCoinRewardRow(Map<String, dynamic> row) {
    final type = '${row['type'] ?? ''}'.toLowerCase();
    if (const {
      'ad_coin',
      'ad_coin_ad_credit',
      'ad_coin_commission',
    }.contains(type)) {
      return true;
    }
    final hasNote = RegExp(
      r'ad\s*coin\s*reward',
      caseSensitive: false,
    ).hasMatch('${row['note'] ?? ''}');
    return hasNote &&
        (type == 'referral_commission' || type == 'discount_refund');
  }

  static bool _isResellRow(Map<String, dynamic> row) =>
      '${row['type'] ?? ''}'.toLowerCase() == 'resell_commission';

  static bool _isRewardRow(Map<String, dynamic> row) =>
      _isAdCoinRewardRow(row) || _isResellRow(row);

  String _badgeFor(Map<String, dynamic> m) {
    final note = _note(m).toLowerCase();
    if (RegExp(r'googer\s+comm?ission').hasMatch(note)) {
      return 'GOOGER COMMISSION';
    }
    if (note.contains('vault')) return 'VAULT PURCHASE';
    if (_isAdCoinRewardRow(m)) return 'AD COIN REWARD';
    if (_isResellRow(m)) return 'RESELL COMMISSION';
    if (note.contains('ad promote')) return 'AD PROMOTE';
    return '${m["type"] ?? "TRANSFER"}'
        .toUpperCase()
        .replaceAll('COMISSION', 'COMMISSION')
        .replaceAll('_', ' ');
  }

  List<Map<String, dynamic>> get _rewards =>
      _history.where(_isAdCoinRewardRow).toList();

  List<Map<String, dynamic>> get _affiliate =>
      _history.where(_isResellRow).toList();

  List<Map<String, dynamic>> get _statementHistory =>
      _history.where((row) => !_isRewardRow(row)).toList();

  double _sum(List<Map<String, dynamic>> rows) =>
      rows.fold<double>(0, (total, m) => total + _amountOf(m).abs());

  // ---- Build ----

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.textGray300,
          backgroundColor: AppColors.bg1,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 30),
            children: [
              AppBackButton(),
              const SizedBox(height: 12),
              GoogerIdCard(googerId: Api.googerId),
              const SizedBox(height: 14),
              WalletBalanceCard(amount: _balance),
              const SizedBox(height: 18),
              _tabStrip(),
              const SizedBox(height: 16),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 50),
                  child: Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.textGray400,
                      ),
                    ),
                  ),
                )
              else
                _tabBody(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tabStrip() {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var i = 0; i < _tabs.length; i++)
              GestureDetector(
                onTap: () => setState(() => _tab = i),
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _tabs[i],
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: _tab == i
                              ? FontWeight.w600
                              : FontWeight.w600,
                          color: _tab == i
                              ? Colors.white
                              : AppColors.textGray500,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Container(
                        height: 2,
                        width: 46,
                        color: _tab == i ? Colors.white : Colors.transparent,
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tabBody() {
    final body = switch (_tab) {
      1 => _historyTab(),
      2 => _requestsTab(),
      3 => _referralsTab(),
      4 => _rewardsTab(),
      5 => _affiliateTab(),
      _ => _manageTab(),
    };
    if (_tab == 0 || _tab == 1) return body;
    return Column(
      children: [
        body,
        const SizedBox(height: 24),
        _recentTransactionsSection(),
      ],
    );
  }

  Widget _recentTransactionsSection() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Divider(height: 1, color: AppColors.borderWhite10),
      const SizedBox(height: 18),
      const Row(
        children: [
          Icon(Ionicons.time_outline, size: 15, color: Colors.white),
          SizedBox(width: 8),
          Text(
            'RECENT TRANSACTIONS',
            style: TextStyle(
              fontSize: 12.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ],
      ),
      const SizedBox(height: 14),
      if (_statementHistory.isEmpty)
        _empty(Ionicons.receipt_outline, 'No transactions yet')
      else
        for (final row in _statementHistory.take(3)) ...[
          _compactRow(row),
          const SizedBox(height: 10),
        ],
    ],
  );

  // ---- Manage ----

  Widget _manageTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Center(
          child: Text(
            'COINS MANAGEMENT',
            style: TextStyle(
              fontSize: 15,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 20),
        if (_lockedCheckout) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF17120A),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFF7A5A13)),
            ),
            child: Text(
              'CHECKOUT LOCKED TO SELLER ${widget.lockedSellerId} FOR R ${widget.lockedAmount!.toStringAsFixed(2)}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 9,
                height: 1.5,
                letterSpacing: 1,
                color: Color(0xFFFACC15),
              ),
            ),
          ),
          const SizedBox(height: 14),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _labelledField(
                'ENTER AMOUNT',
                _amount,
                hint: '0.00',
                numeric: true,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _labelledField(
                'DISCOUNT %',
                _discount,
                hint: '0',
                numeric: true,
                suffix: '%',
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        _recipientPicker(),
        const SizedBox(height: 22),
        if (_lockedCheckout)
          _pill(
            'PAY SELLER',
            const Color(0xFFEF1B1B),
            () => _submitCoins('sell'),
          )
        else
          Row(
            children: [
              Expanded(
                child: _pill(
                  'BUY',
                  const Color(0xFF16A34A),
                  () => _submitCoins('buy'),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: _pill(
                  'SELL',
                  const Color(0xFFEF1B1B),
                  () => _submitCoins('sell'),
                ),
              ),
            ],
          ),
        const SizedBox(height: 26),
        const Divider(height: 1, color: AppColors.borderWhite10),
        const SizedBox(height: 18),
        Row(
          children: [
            const Icon(Ionicons.time_outline, size: 15, color: Colors.white),
            const SizedBox(width: 8),
            const Expanded(
              child: Text(
                'RECENT TRANSACTIONS',
                style: TextStyle(
                  fontSize: 12.5,
                  letterSpacing: 1.4,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
            GestureDetector(
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const TransactionsScreen()),
              ),
              child: const Text(
                'VIEW ALL HISTORY',
                style: TextStyle(
                  fontSize: 10.5,
                  letterSpacing: 1.1,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textGray400,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (_statementHistory.isEmpty)
          _empty(Ionicons.receipt_outline, 'No transactions yet')
        else
          for (final row in _statementHistory.take(3)) ...[
            _compactRow(row),
            const SizedBox(height: 10),
          ],
      ],
    );
  }

  Future<void> _submitCoins(String action) async {
    final previousIds = _history.map((row) => '${row['id'] ?? ''}').toSet();
    final amount = double.tryParse(_amount.text.trim()) ?? 0;
    final discount = double.tryParse(_discount.text.trim()) ?? 0;
    final target = _target.text.trim();
    if (_lockedCheckout) {
      final expectedAmount = widget.lockedAmount!;
      if (action != 'sell') {
        AppNotifications.error('Only the locked seller payment is available');
        return;
      }
      if ((amount - expectedAmount).abs() > 0.001) {
        AppNotifications.error(
          'Incorrect amount',
          'This checkout requires ${expectedAmount.toStringAsFixed(2)}.',
        );
        return;
      }
      if (target != widget.lockedSellerId) {
        AppNotifications.error('This payment is locked to the selected seller');
        return;
      }
    }
    if (amount <= 0) {
      AppNotifications.error('Enter an amount');
      return;
    }
    if (target.isEmpty) {
      AppNotifications.error('Enter a target user ID or name');
      return;
    }
    if (discount < 0 || discount > 100) {
      AppNotifications.error('Discount must be between 0% and 100%');
      return;
    }
    if (_selectedUser == null) {
      AppNotifications.error('Select a target user from the suggestion list');
      return;
    }
    setState(() => _submitting = true);

    final match = _selectedUser;
    if (!mounted) return;
    final receiverId = int.tryParse('${match?["id"] ?? ""}') ?? 0;
    if (receiverId == 0) {
      setState(() => _submitting = false);
      AppNotifications.error('Select a valid user from the suggestion list');
      return;
    }

    setState(() => _submitting = false);
    final password = await _requestTransactionPassword(
      action: action,
      amount: amount,
      discount: discount,
      user: match!,
    );
    if (!mounted || password == null) return;

    setState(() => _submitting = true);
    final discountLabel = discount == discount.roundToDouble()
        ? discount.toStringAsFixed(0)
        : discount.toStringAsFixed(2);
    final note =
        'Coins management — ${action.toUpperCase()}'
        '${discount > 0 ? " ($discountLabel% discount)" : ""}';
    if (_lockedCheckout) {
      try {
        final transaction = await Api.createManualOrderHold(
          receiverId: receiverId,
          amount: amount,
        );
        if (!mounted) return;
        setState(() => _submitting = false);
        final transactionId =
            '${transaction['transaction_id'] ?? transaction['id'] ?? ''}'
                .trim();
        if (transactionId.isEmpty) {
          AppNotifications.error('Payment created without a transaction ID');
          return;
        }
        AppNotifications.success('Payment placed on hold');
        Navigator.pop(context, transactionId);
      } on ApiError catch (e) {
        if (!mounted) return;
        setState(() => _submitting = false);
        AppNotifications.error('Payment failed', e.message);
      }
      return;
    }

    final error = action == 'sell'
        ? await Api.requestMoney(
            receiverId,
            amount,
            note,
            commissionPercentage: discount,
            type: 'sell',
          )
        : await Api.walletTransfer(
            receiverId,
            amount,
            note,
            commissionPercentage: discount,
          );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (error == null) {
      _amount.clear();
      _discount.clear();
      _target.clear();
      setState(() {
        _selectedUser = null;
        _userSuggestions = const [];
      });
      AppNotifications.success(
        action == 'sell' ? 'Money request sent' : 'Transfer successful',
      );
      await _load();
      if (!mounted) return;
      final created = _history.cast<Map<String, dynamic>?>().firstWhere(
        (row) =>
            row != null &&
            !previousIds.contains('${row['id'] ?? ''}') &&
            isWalletReceiptEligible(row),
        orElse: () => null,
      );
      if (created != null && mounted) {
        await showWalletReceiptDialog(context, created);
      }
    } else {
      AppNotifications.error('Transfer failed', error);
    }
  }

  void _onTargetChanged(String value) {
    _userSearchDebounce?.cancel();
    final query = value.trim();
    setState(() {
      _selectedUser = null;
      _userSuggestions = const [];
      _searchingUsers = query.isNotEmpty;
    });
    if (query.isEmpty) return;
    _userSearchDebounce = Timer(const Duration(milliseconds: 300), () async {
      final users = await Api.searchWalletUsers(query);
      if (!mounted || _target.text.trim() != query) return;
      setState(() {
        _userSuggestions = users.take(6).toList(growable: false);
        _searchingUsers = false;
      });
    });
  }

  String _userLabel(Map<String, dynamic> user) {
    final name = _cleanName(
      user['full_name'] ?? user['name'],
      user['username'],
    ).trim();
    final username = '${user['username'] ?? ''}'.trim();
    if (username.isEmpty) return name;
    final normalizedUsername = username.startsWith('@')
        ? username
        : '@$username';
    return normalizedUsername.toLowerCase() == name.toLowerCase()
        ? name
        : '$name ($normalizedUsername)';
  }

  Widget _recipientPicker() {
    return Column(
      children: [
        _labelledField(
          'TARGET USER (ID OR NAME)',
          _target,
          hint: 'Type User ID, username or name',
          center: true,
          onChanged: _onTargetChanged,
        ),
        if (_searchingUsers)
          const Padding(
            padding: EdgeInsets.only(top: 10),
            child: SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.textGray500,
              ),
            ),
          ),
        if (_selectedUser != null)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.successGreen.withOpacity(0.08),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.successGreen.withOpacity(0.35),
              ),
            ),
            child: Text(
              'Selected: ${_userLabel(_selectedUser!)}',
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.successGreen,
              ),
            ),
          ),
        if (_selectedUser == null && _userSuggestions.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 8),
            decoration: BoxDecoration(
              color: AppColors.bg1,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              children: [
                for (var i = 0; i < _userSuggestions.length; i++) ...[
                  if (i > 0)
                    const Divider(height: 1, color: AppColors.borderWhite10),
                  ListTile(
                    dense: true,
                    leading: const CircleAvatar(
                      radius: 17,
                      backgroundColor: AppColors.borderWhite10,
                      child: Icon(
                        Ionicons.person_outline,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                    title: Text(
                      _userLabel(_userSuggestions[i]),
                      style: const TextStyle(fontSize: 13, color: Colors.white),
                    ),
                    subtitle: Text(
                      'Googer ID ${_userSuggestions[i]['user_id'] ?? _userSuggestions[i]['googer_id'] ?? '—'}',
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.textGray500,
                      ),
                    ),
                    onTap: () {
                      final user = _userSuggestions[i];
                      setState(() {
                        _selectedUser = user;
                        _userSuggestions = const [];
                        _searchingUsers = false;
                        _target.text =
                            '${user['user_id'] ?? user['googer_id'] ?? user['username'] ?? ''}';
                      });
                    },
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Future<String?> _requestTransactionPassword({
    required String action,
    required double amount,
    required double discount,
    required Map<String, dynamic> user,
  }) async {
    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withOpacity(0.86),
      builder: (_) => _WalletSecurityDialog(
        action: action,
        amount: amount,
        discount: discount,
        username: '${user['username'] ?? 'user'}',
        googerId: '${user['user_id'] ?? user['googer_id'] ?? ''}',
      ),
    );
  }

  // ---- History ----

  Widget _historyTab() {
    if (_statementHistory.isEmpty) {
      return _empty(Ionicons.time_outline, 'No activity yet');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: const [
            Icon(Ionicons.time_outline, size: 15, color: Colors.white),
            SizedBox(width: 8),
            Text(
              'RECENT ACTIVITY',
              style: TextStyle(
                fontSize: 12.5,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        for (final row in _statementHistory) ...[
          _activityCard(row),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  Widget _activityCard(Map<String, dynamic> m) {
    final outgoing = _isOutgoing(m);
    final accent = outgoing ? AppColors.likeRed : AppColors.successGreen;
    final status = '${m["status"] ?? "accepted"}'.toUpperCase();
    final detailLines = _walletDetailLines(m);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: accent.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              outgoing
                  ? Ionicons.arrow_up_outline
                  : Ionicons.arrow_down_outline,
              size: 18,
              color: accent,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        '${outgoing ? "Sent To" : "Received From"}: '
                        '${_counterparty(m)}',
                        style: const TextStyle(
                          fontSize: 14,
                          height: 1.35,
                          fontWeight: FontWeight.w500,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${outgoing ? "-" : "+"} R '
                      '${_amountOf(m).abs().toStringAsFixed(2)}',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: accent,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  _when(m),
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _badge(_badgeFor(m)),
                    Text(
                      status,
                      style: const TextStyle(
                        fontSize: 10,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFFF59E0B),
                      ),
                    ),
                  ],
                ),
                if (detailLines.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  for (final line in detailLines) ...[
                    Text(
                      line,
                      style: const TextStyle(
                        fontSize: 11.5,
                        height: 1.45,
                        color: AppColors.textGray500,
                      ),
                    ),
                    if (line != detailLines.last) const SizedBox(height: 2),
                  ],
                ],
              ],
            ),
          ),
          if (isWalletReceiptEligible(m) || _canCancel(m)) ...[
            const SizedBox(width: 10),
            Column(
              children: [
                if (isWalletReceiptEligible(m)) _receiptButton(m),
                if (_canCancel(m)) ...[
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () => _cancelTransaction(m),
                    child: const Text(
                      'CANCEL',
                      style: TextStyle(
                        fontSize: 8.5,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w800,
                        color: AppColors.likeRed,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _receiptButton(Map<String, dynamic> transaction) => Material(
    color: Colors.transparent,
    child: InkWell(
      key: ValueKey(
        'wallet-receipt-${transaction['id'] ?? transaction['transaction_id']}',
      ),
      onTap: () => showWalletReceiptDialog(context, transaction),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: const Icon(
          Ionicons.receipt_outline,
          size: 20,
          color: AppColors.textGray400,
        ),
      ),
    ),
  );

  bool _canCancel(Map<String, dynamic> transaction) {
    if (!_isOutgoing(transaction) ||
        '${transaction['status'] ?? ''}'.toLowerCase() != 'pending' ||
        !isWalletReceiptEligible(transaction)) {
      return false;
    }
    if ('${transaction['type'] ?? ''}'.toLowerCase() != 'order_hold') {
      return true;
    }
    final manual = RegExp(
      'manual payment',
      caseSensitive: false,
    ).hasMatch('${transaction['note'] ?? ''}');
    return manual && transaction['linked_order_can_cancel'] == true;
  }

  Future<void> _cancelTransaction(Map<String, dynamic> transaction) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.bg1,
        title: const Text(
          'Cancel transaction?',
          style: TextStyle(color: Colors.white),
        ),
        content: const Text(
          'Any held coins will be returned according to the current wallet rules.',
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
    final id = int.tryParse('${transaction['id'] ?? 0}') ?? 0;
    if (id == 0) return;
    final error = await Api.cancelTransaction(id);
    if (!mounted) return;
    if (error == null) {
      AppNotifications.success('Transaction cancelled');
      await _load();
    } else {
      AppNotifications.error('Could not cancel transaction', error);
    }
  }

  Widget _badge(String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: const Color(0xFFF59E0B).withOpacity(0.12),
      borderRadius: BorderRadius.circular(6),
    ),
    child: Text(
      label,
      style: const TextStyle(
        fontSize: 9,
        letterSpacing: 1,
        fontWeight: FontWeight.w600,
        color: Color(0xFFF59E0B),
      ),
    ),
  );

  Widget _compactRow(Map<String, dynamic> m) {
    final outgoing = _isOutgoing(m);
    final accent = outgoing ? AppColors.likeRed : AppColors.successGreen;
    final detailLines = _walletDetailLines(m);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: accent.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              outgoing
                  ? Ionicons.arrow_up_outline
                  : Ionicons.arrow_down_outline,
              size: 16,
              color: accent,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${outgoing ? "Sent To" : "Received From"} - '
                  '${_counterparty(m)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  _when(m),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textGray600,
                  ),
                ),
                if (detailLines.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  for (final line in detailLines.take(2)) ...[
                    Text(
                      line,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textGray500,
                      ),
                    ),
                    if (line != detailLines.take(2).last)
                      const SizedBox(height: 2),
                  ],
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (isWalletReceiptEligible(m))
            GestureDetector(
              onTap: () => showWalletReceiptDialog(context, m),
              child: const Padding(
                padding: EdgeInsets.all(8),
                child: Icon(
                  Ionicons.receipt_outline,
                  size: 19,
                  color: AppColors.textGray500,
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ---- Requests ----

  Widget _requestsTab() {
    if (_requests.isEmpty) {
      return _empty(
        Ionicons.alert_circle_outline,
        'NO PENDING REQUESTS FOUND',
        caps: true,
      );
    }
    return Column(
      children: [
        for (final request in _requests) ...[
          _requestCard(request),
          const SizedBox(height: 12),
        ],
      ],
    );
  }

  Widget _requestCard(Map<String, dynamic> request) {
    final id = int.tryParse('${request["id"] ?? 0}') ?? 0;
    final senderName = _cleanName(
      request["sender_name"] ?? request["sender_full_name"],
      request["sender_username"],
    );
    final rawSenderUsername = '${request["sender_username"] ?? ''}'.trim();
    final senderUsername = rawSenderUsername.isEmpty
        ? senderName
        : rawSenderUsername.replaceFirst(RegExp(r'^@'), '');
    final discount =
        double.tryParse('${request["commission_percentage"] ?? 0}') ?? 0;
    final senderInitialSource = senderUsername.isEmpty
        ? senderName
        : senderUsername;
    final senderInitial = senderInitialSource.isEmpty
        ? 'R'
        : senderInitialSource.characters.first.toUpperCase();
    final detailLines = _walletDetailLines(request);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 58,
                height: 58,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Text(
                  senderInitial,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: AppColors.textGray300,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      rawSenderUsername.isEmpty
                          ? 'Request from $senderName'
                          : 'Request from @$senderUsername',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _when(request),
                      style: const TextStyle(
                        fontSize: 11,
                        letterSpacing: 0.4,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textGray500,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'PENDING PAYMENT',
                      style: TextStyle(
                        fontSize: 10,
                        letterSpacing: 1.0,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textGray400,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    'R ${(double.tryParse('${request["amount"] ?? 0}') ?? 0).toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                  ),
                  if (discount > 0) ...[
                    const SizedBox(height: 4),
                    Text(
                      'INCL. ${_amountLabel(discount)}% DISCOUNT',
                      style: const TextStyle(
                        fontSize: 9.5,
                        letterSpacing: 1.0,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
          if (detailLines.isNotEmpty) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final line in detailLines.take(2)) ...[
                    Text(
                      line,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textGray400,
                      ),
                    ),
                    if (line != detailLines.take(2).last)
                      const SizedBox(height: 6),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _pill(
                  'ACCEPT',
                  const Color(0xFF16A34A),
                  () => _respond(id, 'accept'),
                  height: 44,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _pill(
                  'REJECT',
                  const Color(0xFFEF1B1B),
                  () => _respond(id, 'reject'),
                  height: 44,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _respond(int id, String action) async {
    if (action == 'accept') {
      final request = _requests.cast<Map<String, dynamic>?>().firstWhere(
        (row) => int.tryParse('${row?["id"] ?? 0}') == id,
        orElse: () => null,
      );
      if (request == null) return;
      final password = await _requestTransactionPassword(
        action: 'accept',
        amount: _amountOf(request),
        discount:
            double.tryParse('${request['commission_percentage'] ?? 0}') ?? 0,
        user: {
          'username': request['sender_username'] ?? 'user',
          'user_id':
              request['sender_readable_id'] ?? request['sender_id'] ?? '',
        },
      );
      if (!mounted || password == null) return;
    }
    setState(() => _submitting = true);
    final error = await Api.respondToRequest(id, action);
    if (!mounted) return;
    setState(() => _submitting = false);
    if (error == null) {
      AppNotifications.success('Request ${action}ed');
      _load();
    } else {
      AppNotifications.error('Could not respond', error);
    }
  }

  // ---- Referrals ----

  Widget _referralsTab() {
    final referrals = (_referralData['referrals'] is List)
        ? (_referralData['referrals'] as List)
              .whereType<Map>()
              .map((row) => Map<String, dynamic>.from(row))
              .toList()
        : <Map<String, dynamic>>[];
    final total = int.tryParse('${_referralData['totalReferrals'] ?? 0}') ?? 0;
    final earned = double.tryParse('${_referralData['totalEarned'] ?? 0}') ?? 0;
    final byLevel = <int, List<Map<String, dynamic>>>{};
    for (final referral in referrals) {
      final level =
          int.tryParse(
            '${referral['level'] ?? referral['stored_level'] ?? 1}',
          ) ??
          1;
      byLevel.putIfAbsent(level, () => []).add(referral);
    }
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'My Referral Network',
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    text: 'Total Earnings: ',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                    children: [
                      TextSpan(
                        text: 'R ${earned.toStringAsFixed(2)}',
                        style: const TextStyle(
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Total Referrals: $total',
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.textGray300,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (referrals.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 34),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: const Column(
                children: [
                  Icon(
                    Ionicons.people_outline,
                    size: 26,
                    color: AppColors.textGray500,
                  ),
                  SizedBox(height: 12),
                  Text(
                    'No registered referrals yet',
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ),
            )
          else
            for (final level in byLevel.keys.toList()..sort())
              Container(
                margin: const EdgeInsets.only(bottom: 9),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.35),
                  borderRadius: BorderRadius.circular(13),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: ExpansionTile(
                  initiallyExpanded: level == 1,
                  iconColor: Colors.white,
                  collapsedIconColor: AppColors.textGray500,
                  title: Text(
                    'Level $level - (${byLevel[level]!.length} referrals)',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  children: [
                    for (final referral in byLevel[level]!)
                      ListTile(
                        dense: true,
                        leading: CircleAvatar(
                          radius: 7,
                          backgroundColor: const [
                            Color(0xFF3B82F6),
                            Color(0xFF22C55E),
                            Color(0xFFF59E0B),
                            Color(0xFFEC4899),
                          ][(level - 1) % 4],
                        ),
                        title: Text(
                          '${referral['referred_full_name'] ?? referral['referred_username'] ?? 'User'}',
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        subtitle: Text(
                          _when(referral),
                          style: const TextStyle(
                            fontSize: 9.5,
                            color: AppColors.textGray500,
                          ),
                        ),
                        trailing:
                            (double.tryParse('${referral['amount'] ?? 0}') ??
                                    0) >
                                0
                            ? Text(
                                '+ R ${(double.tryParse('${referral['amount']}') ?? 0).toStringAsFixed(2)}',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.successGreen,
                                ),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
        ],
      ),
    );
  }

  // ---- Rewards / Affiliate ----

  Widget _rewardsTab() => _earningsTab(
    total: _sum(_rewards),
    totalLabel: 'TOTAL REWARDS',
    sectionLabel: 'AD COIN REWARDS',
    sectionIcon: Ionicons.ribbon_outline,
    accent: const Color(0xFFF59E0B),
    rows: _rewards,
    rowTitle: 'Ad Coin Reward',
    statusLabel: 'COLLECTED',
    emptyLabel: 'No rewards yet',
  );

  Widget _affiliateTab() => _earningsTab(
    total: _sum(_affiliate),
    totalLabel: 'TOTAL RESELL COMMISSION',
    sectionLabel: 'RESELL COMMISSION EARNINGS',
    sectionIcon: Ionicons.cash_outline,
    accent: const Color(0xFF22C55E),
    rows: _affiliate,
    rowTitle: 'Resell Commission',
    statusLabel: 'RECEIVED',
    emptyLabel: 'No resell commission yet',
  );

  Widget _earningsTab({
    required double total,
    required String totalLabel,
    required String sectionLabel,
    required IconData sectionIcon,
    required Color accent,
    required List<Map<String, dynamic>> rows,
    required String rowTitle,
    required String statusLabel,
    required String emptyLabel,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: accent.withOpacity(0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: accent.withOpacity(0.35)),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      totalLabel,
                      style: const TextStyle(
                        fontSize: 10.5,
                        letterSpacing: 1.3,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray400,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      'R ${total.toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                        color: accent,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(sectionIcon, size: 24, color: accent),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Icon(sectionIcon, size: 15, color: accent),
            const SizedBox(width: 8),
            Text(
              sectionLabel,
              style: const TextStyle(
                fontSize: 12.5,
                letterSpacing: 1.3,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (rows.isEmpty)
          _empty(sectionIcon, emptyLabel)
        else
          for (final row in rows) ...[
            _earningCard(row, accent, rowTitle, statusLabel),
            const SizedBox(height: 12),
          ],
      ],
    );
  }

  Widget _earningCard(
    Map<String, dynamic> m,
    Color accent,
    String title,
    String statusLabel,
  ) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: accent.withOpacity(0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: accent.withOpacity(0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              'R',
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w600,
                color: accent,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    Text(
                      '+ R ${_amountOf(m).abs().toStringAsFixed(2)}',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: accent,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _when(m),
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: AppColors.textGray500,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: accent.withOpacity(0.14),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        statusLabel,
                        style: TextStyle(
                          fontSize: 9,
                          letterSpacing: 1,
                          fontWeight: FontWeight.w600,
                          color: accent,
                        ),
                      ),
                    ),
                  ],
                ),
                if (_note(m).isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    _note(m),
                    style: const TextStyle(
                      fontSize: 11.5,
                      height: 1.45,
                      fontStyle: FontStyle.italic,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ---- Shared ----

  Widget _empty(IconData icon, String label, {bool caps = false}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 60),
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
            child: Icon(icon, size: 24, color: AppColors.textGray500),
          ),
          const SizedBox(height: 18),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: caps ? 12.5 : 13.5,
              letterSpacing: caps ? 1.4 : 0,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _labelledField(
    String label,
    TextEditingController controller, {
    String hint = '',
    bool numeric = false,
    bool center = false,
    String? suffix,
    ValueChanged<String>? onChanged,
  }) {
    return Column(
      crossAxisAlignment: center
          ? CrossAxisAlignment.center
          : CrossAxisAlignment.start,
      children: [
        Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 10.5,
            letterSpacing: 1.2,
            fontWeight: FontWeight.w600,
            color: AppColors.textGray400,
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: controller,
          textAlign: TextAlign.center,
          keyboardType: numeric
              ? const TextInputType.numberWithOptions(decimal: true)
              : TextInputType.text,
          inputFormatters: numeric
              ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))]
              : null,
          style: const TextStyle(fontSize: 15, color: Colors.white),
          cursorColor: AppColors.accentPurple,
          onChanged: onChanged,
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: const TextStyle(
              fontSize: 15,
              color: AppColors.textGray600,
            ),
            suffixText: suffix,
            suffixStyle: const TextStyle(
              fontSize: 14,
              color: AppColors.textGray500,
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 16,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.borderWhite10),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.accentPurple),
            ),
          ),
        ),
      ],
    );
  }

  Widget _pill(
    String label,
    Color color,
    VoidCallback onTap, {
    double height = 54,
  }) {
    return GestureDetector(
      onTap: _submitting ? null : onTap,
      child: Container(
        height: height,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: _submitting ? color.withOpacity(0.6) : color,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            letterSpacing: 1.2,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

class _WalletSecurityDialog extends StatefulWidget {
  final String action;
  final double amount;
  final double discount;
  final String username;
  final String googerId;

  const _WalletSecurityDialog({
    required this.action,
    required this.amount,
    required this.discount,
    required this.username,
    required this.googerId,
  });

  @override
  State<_WalletSecurityDialog> createState() => _WalletSecurityDialogState();
}

class _WalletSecurityDialogState extends State<_WalletSecurityDialog> {
  static const _panel = Color(0xFF080808);
  static const _summary = Color(0xFF0D0D0D);
  static const _field = Color(0xFF050505);
  static const _border = Color(0xFF232323);
  static const _white = Colors.white;

  final _password = TextEditingController();
  bool _processing = false;
  String? _error;

  bool get _isRequest => widget.action == 'sell';
  bool get _isAccept => widget.action == 'accept';
  bool get _hasDiscount => widget.discount > 0;

  String get _title {
    if (_isAccept) return 'PAY REQUEST';
    if (_isRequest) return _hasDiscount ? 'DISCOUNT REQUEST' : 'REQUEST COINS';
    return _hasDiscount ? 'SEND COINS & DISCOUNT REQUEST' : 'SEND COINS';
  }

  String get _amountLabel {
    if (_isAccept) return 'PAY COINS';
    if (_isRequest && _hasDiscount) return 'COINS';
    return _isRequest ? 'REQUEST COINS' : 'SEND COINS';
  }

  String get _counterpartyLabel => _isAccept
      ? 'PAY TO'
      : _isRequest
      ? 'REQUEST FROM'
      : 'SEND TO';

  String _number(double value) => value == value.roundToDouble()
      ? value.toStringAsFixed(0)
      : value.toStringAsFixed(2);

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final credential = _password.text.trim();
    if (credential.isEmpty) {
      setState(() => _error = 'Password or 6-digit passkey is required.');
      return;
    }
    setState(() {
      _processing = true;
      _error = null;
    });
    final error = await Api.verifyPassword(credential);
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _processing = false;
        _error = error;
      });
      return;
    }
    Navigator.pop(context, credential);
  }

  void _biometricMessage() {
    setState(() {
      _error =
          'Face ID or fingerprint is unavailable here. Enter your password or 6-digit passkey.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.sizeOf(context).height;
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
      backgroundColor: Colors.transparent,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 390, maxHeight: height * 0.90),
        child: Container(
          decoration: BoxDecoration(
            color: _panel,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: _border),
            boxShadow: const [
              BoxShadow(
                color: Colors.black54,
                blurRadius: 36,
                offset: Offset(0, 18),
              ),
            ],
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 26, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _header(),
                const SizedBox(height: 28),
                _transactionSummary(),
                const SizedBox(height: 28),
                const Padding(
                  padding: EdgeInsets.only(left: 6, bottom: 10),
                  child: Text(
                    'ENTER PASSWORD OR 6-DIGIT PASSKEY',
                    style: TextStyle(
                      fontSize: 10.5,
                      letterSpacing: 1.7,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF7C8495),
                    ),
                  ),
                ),
                TextField(
                  key: const Key('wallet-security-password'),
                  controller: _password,
                  enabled: !_processing,
                  autofocus: true,
                  obscureText: true,
                  style: const TextStyle(
                    fontSize: 18,
                    letterSpacing: 3,
                    color: Colors.white,
                  ),
                  decoration: InputDecoration(
                    hintText: '••••••••',
                    hintStyle: const TextStyle(
                      color: Color(0xFF555B68),
                      letterSpacing: 4,
                    ),
                    filled: true,
                    fillColor: _field,
                    contentPadding: const EdgeInsets.fromLTRB(20, 20, 12, 20),
                    suffixIcon: const Icon(
                      Ionicons.lock_closed_outline,
                      size: 20,
                      color: Color(0xFFD4D8E0),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: _border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: Colors.white),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 9),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 5),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.likeRed,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  key: const Key('wallet-security-biometric'),
                  onPressed: _processing ? null : _biometricMessage,
                  icon: const Icon(Ionicons.finger_print_outline, size: 25),
                  label: const Text('USE FACE ID / FINGERPRINT'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(58),
                    foregroundColor: const Color(0xFFD8FFFA),
                    backgroundColor: const Color(0xFF0B3B3F),
                    side: const BorderSide(color: Color(0xFF08776F)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 12.5,
                      letterSpacing: 1.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    Expanded(
                      flex: 9,
                      child: OutlinedButton(
                        onPressed: _processing
                            ? null
                            : () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(58),
                          foregroundColor: Colors.white,
                          backgroundColor: const Color(0xFF181818),
                          side: const BorderSide(color: _border),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          textStyle: const TextStyle(
                            fontSize: 12.5,
                            letterSpacing: 1.6,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        child: const Text('CANCEL'),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      flex: 11,
                      child: FilledButton(
                        key: const Key('wallet-security-confirm'),
                        onPressed: _processing ? null : _verify,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(58),
                          backgroundColor: _white,
                          foregroundColor: Colors.black,
                          disabledBackgroundColor: Colors.white70,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          textStyle: const TextStyle(
                            fontSize: 9.5,
                            letterSpacing: 0.2,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        child: Center(
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              _processing ? 'VERIFYING…' : 'VERIFY & CONFIRM',
                              maxLines: 1,
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
      ),
    );
  }

  Widget _header() {
    return Row(
      children: [
        Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: const Color(0xFF17315B),
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Icon(
            Ionicons.shield_checkmark_outline,
            size: 25,
            color: Color(0xFFDCEBFF),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Text(
            _title,
            maxLines: 2,
            style: const TextStyle(
              fontSize: 15.5,
              height: 1.2,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ),
        IconButton(
          onPressed: _processing ? null : () => Navigator.pop(context),
          icon: const Icon(Ionicons.close_outline, size: 27),
          color: Colors.white,
          visualDensity: VisualDensity.compact,
        ),
      ],
    );
  }

  Widget _transactionSummary() {
    final idSuffix = widget.googerId.trim().isEmpty
        ? ''
        : ' (${widget.googerId.trim()})';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
      decoration: BoxDecoration(
        color: _summary,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _border),
      ),
      child: Column(
        children: [
          _summaryRow(_amountLabel, '${_number(widget.amount)} Coins'),
          if (_hasDiscount) ...[
            const Divider(height: 34, color: _border),
            _summaryRow(
              _isRequest ? 'DISCOUNT REQUEST' : 'DISCOUNT',
              '${_number(widget.discount)}%',
              valueColor: Colors.white,
            ),
          ],
          const Divider(height: 34, color: _border),
          _summaryRow(
            _counterpartyLabel,
            '@${widget.username}$idSuffix',
            person: true,
          ),
        ],
      ),
    );
  }

  Widget _summaryRow(
    String label,
    String value, {
    Color valueColor = Colors.white,
    bool person = false,
  }) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              letterSpacing: 1.7,
              fontWeight: FontWeight.w800,
              color: Color(0xFF747D90),
            ),
          ),
        ),
        const Text(
          '–',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: Color(0xFF9098A7),
          ),
        ),
        const SizedBox(width: 9),
        Flexible(
          child: Container(
            padding: person
                ? const EdgeInsets.symmetric(horizontal: 12, vertical: 10)
                : EdgeInsets.zero,
            decoration: person
                ? BoxDecoration(
                    color: _panel,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFF24334A)),
                  )
                : null,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (person) ...[
                  const Icon(Ionicons.person, size: 14, color: Colors.white),
                  const SizedBox(width: 8),
                ],
                Flexible(
                  child: Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: person ? 13.5 : 20,
                      fontWeight: FontWeight.w900,
                      color: valueColor,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
