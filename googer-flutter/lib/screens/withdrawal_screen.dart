import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:ionicons/ionicons.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../widgets/app_back_button.dart';
import '../widgets/wallet_bits.dart';
import 'wallet_verification_screen.dart';

/// Wallet · Withdrawal — balance, verification gate, method picker, request
/// form and history. Mirrors the web `dashboard/wallet/withdrawal` page and is
/// wired to the same endpoints:
///   GET  /withdrawals/payment-methods
///   GET  /withdrawals/my-requests
///   GET  /withdrawal-admin/settings
///   GET  /verification/status
///   POST /withdrawals/request
///   DELETE /withdrawals/cancel/{id}
class WithdrawalScreen extends StatefulWidget {
  const WithdrawalScreen({super.key});

  @override
  State<WithdrawalScreen> createState() => _WithdrawalScreenState();
}

const _amber = Color(0xFFFBBF24);
const _amberBorder = Color(0x33FBBF24);
const _amberFill = Color(0x14FBBF24);
const _greenBorder = Color(0x4D22C55E);
const _greenFill = Color(0x1A22C55E);
const _redBorder = Color(0x4DEF4444);
const _redFill = Color(0x14EF4444);
const _fieldFill = Color(0xFF030303);
const _payrexxLogoBase =
    'https://raw.githubusercontent.com/payrexx/payment-logos/main/assets/card-icons';
const _prefsWithdrawalDetailsKey = 'googer_withdrawal_payment_details';

class _WithdrawalScreenState extends State<WithdrawalScreen> {
  static const _tabs = ['My Withdrawal', 'Recent Withdrawal', 'Payment Method'];

  int _tab = 0;
  bool _loading = true;
  bool _submitting = false;
  int? _cancellingId;

  double _balance = 0;
  bool _verifiedUserFlag = false;
  String _verificationStatus = 'None';
  Map<String, dynamic> _settings = const {};
  List<Map<String, dynamic>> _methods = const [];
  List<Map<String, dynamic>> _requests = const [];

  Map<String, dynamic>? _selectedMethod;
  final Map<String, TextEditingController> _fieldControllers = {};
  final Map<String, TextEditingController> _addDetailControllers = {};
  final TextEditingController _amount = TextEditingController();
  Map<String, Map<String, String>> _savedDetails = const {};
  String? _addDetailsMethodId;
  String? _formError;
  String? _formSuccess;

  bool get _isVerified =>
      _verifiedUserFlag || _verificationStatus.toLowerCase() == 'verified';

  double get _minAmount =>
      double.tryParse('${_settings['min_amount'] ?? ''}') ?? 0;
  double get _maxAmount =>
      double.tryParse('${_settings['max_amount'] ?? ''}') ?? 0;

  /// USD paid per coin. The web defaults to 0.0056 when the admin row is blank.
  double get _coinRate =>
      double.tryParse('${_settings['coin_rate'] ?? ''}') ?? 0;

  double get _withdrawUnlockLimit => _maxAmount > 0 ? _maxAmount : 10000;

  bool get _withdrawProgressComplete =>
      _withdrawUnlockLimit <= 0 || _balance >= _withdrawUnlockLimit;

  bool get _canWithdrawNow => _isVerified;

  @override
  void initState() {
    super.initState();
    _restoreSavedDetails();
    _load();
  }

  @override
  void dispose() {
    for (final c in _fieldControllers.values) {
      c.dispose();
    }
    for (final c in _addDetailControllers.values) {
      c.dispose();
    }
    _amount.dispose();
    super.dispose();
  }

  Future<void> _restoreSavedDetails() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_prefsWithdrawalDetailsKey);
      if (raw == null || raw.trim().isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final parsed = <String, Map<String, String>>{};
      for (final entry in decoded.entries) {
        if (entry.value is Map) {
          parsed['${entry.key}'] = Map<String, String>.from(
            (entry.value as Map).map(
              (key, value) => MapEntry('$key', '${value ?? ''}'),
            ),
          );
        }
      }
      if (!mounted) return;
      setState(() => _savedDetails = parsed);
    } catch (_) {}
  }

  Future<void> _persistSavedDetails() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _prefsWithdrawalDetailsKey,
      jsonEncode(_savedDetails),
    );
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    if (!Api.loggedIn) {
      if (!mounted) return;
      setState(() {
        _methods = const [];
        _requests = const [];
        _settings = const {};
        _verificationStatus = 'None';
        _verifiedUserFlag = false;
        _balance = 0;
        _loading = false;
      });
      return;
    }
    await Api.refreshProfile();
    final results = await Future.wait([
      Api.withdrawalPaymentMethods(),
      Api.myWithdrawalRequests(),
      Api.withdrawalSettings(),
      Api.verificationStatus(),
    ]);
    if (!mounted) return;
    final verification = results[3] as Map<String, dynamic>;
    final nestedVerification = verification['verification'];
    final verificationRecord = nestedVerification is Map
        ? Map<String, dynamic>.from(nestedVerification)
        : verification;
    final profileVerificationStatus =
        '${Api.user?['verification_status'] ?? ''}'.trim();
    final profileVerifiedFlag =
        Api.user?['is_verified'] == true ||
        '${Api.user?['is_verified'] ?? ''}'.toLowerCase() == 'true';
    setState(() {
      _methods = results[0] as List<Map<String, dynamic>>;
      _requests = results[1] as List<Map<String, dynamic>>;
      _settings = results[2] as Map<String, dynamic>;
      _verificationStatus =
          '${verificationRecord['status'] ?? verificationRecord['verification_status'] ?? (profileVerificationStatus.isNotEmpty ? profileVerificationStatus : 'None')}';
      _verifiedUserFlag = profileVerifiedFlag;
      _balance = Api.balance;
      _loading = false;
    });
  }

  /// Field definitions come back as JSON on the payment method row.
  List<Map<String, dynamic>> _fieldsOf(Map<String, dynamic> method) {
    final raw = method['fields'];
    final parsed = raw is String ? _tryJson(raw) : raw;
    if (parsed is List) {
      return parsed
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    return const [];
  }

  dynamic _tryJson(String value) {
    try {
      return jsonDecode(value);
    } catch (_) {
      return null;
    }
  }

  String _fieldKey(Map<String, dynamic> field) =>
      '${field['name'] ?? field['key'] ?? field['label'] ?? ''}';

  void _selectMethod(Map<String, dynamic> method) {
    for (final c in _fieldControllers.values) {
      c.dispose();
    }
    _fieldControllers.clear();
    final saved = _savedDetails['${method['id'] ?? ''}'] ?? const {};
    for (final field in _fieldsOf(method)) {
      final key = _fieldKey(field);
      _fieldControllers[key] = TextEditingController(text: saved[key] ?? '');
    }
    setState(() => _selectedMethod = method);
  }

  void _toggleAddDetails(Map<String, dynamic> method) {
    final methodId = '${method['id'] ?? ''}';
    for (final c in _addDetailControllers.values) {
      c.dispose();
    }
    _addDetailControllers.clear();
    if (_addDetailsMethodId == methodId) {
      setState(() => _addDetailsMethodId = null);
      return;
    }
    final saved = _savedDetails[methodId] ?? const {};
    for (final field in _fieldsOf(method)) {
      final key = _fieldKey(field);
      _addDetailControllers[key] = TextEditingController(
        text: saved[key] ?? '',
      );
    }
    setState(() => _addDetailsMethodId = methodId);
  }

  Future<void> _saveMethodDetails(Map<String, dynamic> method) async {
    final methodId = '${method['id'] ?? ''}';
    final saved = <String, String>{};
    for (final field in _fieldsOf(method)) {
      final key = _fieldKey(field);
      if ((field['required'] == true) &&
          (_addDetailControllers[key]?.text.trim().isEmpty ?? true)) {
        AppNotifications.error('${field['label'] ?? key} is required');
        return;
      }
      saved[key] = _addDetailControllers[key]?.text.trim() ?? '';
    }
    setState(() {
      _savedDetails = {..._savedDetails, methodId: saved};
      _addDetailsMethodId = null;
    });
    await _persistSavedDetails();
    AppNotifications.success('Payment details saved');
  }

  Future<void> _submit() async {
    if (!_isVerified) {
      setState(
        () => _formError = 'Complete ID verification before withdrawing.',
      );
      return;
    }
    final method = _selectedMethod;
    if (method == null) {
      setState(() => _formError = 'Choose a payment method first.');
      return;
    }
    final details = <String, String>{};
    for (final field in _fieldsOf(method)) {
      final key = _fieldKey(field);
      final value = _fieldControllers[key]?.text.trim() ?? '';
      if (field['required'] == true && value.isEmpty) {
        setState(() => _formError = '"${field['label'] ?? key}" is required.');
        return;
      }
      details[key] = value;
    }
    final amount = double.tryParse(_amount.text.trim()) ?? 0;
    if (amount <= 0) {
      setState(() => _formError = 'Enter a valid withdrawal amount.');
      return;
    }
    if (_minAmount > 0 && amount < _minAmount) {
      setState(
        () => _formError =
            'Minimum withdrawal is ${formatMoney(_minAmount)} coins.',
      );
      return;
    }
    if (_maxAmount > 0 && amount > _maxAmount) {
      setState(
        () => _formError =
            'Maximum withdrawal is ${formatMoney(_maxAmount)} coins.',
      );
      return;
    }
    if (amount > _balance) {
      setState(() => _formError = 'Insufficient balance.');
      return;
    }

    setState(() {
      _submitting = true;
      _formError = null;
      _formSuccess = null;
    });
    final error = await Api.createWithdrawalRequest(
      paymentMethodId: method['id'],
      amount: amount,
      paymentDetails: details,
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (error != null) {
      setState(() => _formError = error);
      return;
    }
    setState(() => _formSuccess = 'Withdrawal request submitted successfully.');
    _amount.clear();
    for (final c in _fieldControllers.values) {
      c.clear();
    }
    setState(() => _selectedMethod = null);
    await _load();
  }

  Future<void> _cancel(Map<String, dynamic> request) async {
    final id = int.tryParse('${request['id'] ?? ''}');
    if (id == null) return;
    setState(() => _cancellingId = id);
    final error = await Api.cancelWithdrawalRequest(id);
    if (!mounted) return;
    setState(() => _cancellingId = null);
    if (error != null) {
      AppNotifications.error('Could not cancel', error);
      return;
    }
    AppNotifications.success(
      'Withdrawal cancelled',
      'The amount was returned to your wallet.',
    );
    await _load();
  }

  // ---- Build ----

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
          'Withdrawal',
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.border1),
        ),
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          color: AppColors.textGray300,
          backgroundColor: AppColors.bg1,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 30),
            children: [
              const Text(
                'Cash out your Rupieer coins to a payout method.',
                style: TextStyle(fontSize: 12, color: AppColors.textGray500),
              ),
              const SizedBox(height: 16),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 60),
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
              else ...[
                Container(
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: Column(
                    children: [
                      _tabStrip(),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
                        child: _tabBody(),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 15, color: Colors.white),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 12.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }

  Widget _tabStrip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.borderWhite10)),
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
                  padding: const EdgeInsets.fromLTRB(8, 13, 8, 0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _tabs[i],
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: _tab == i
                              ? Colors.white
                              : AppColors.textGray500,
                        ),
                      ),
                      const SizedBox(height: 9),
                      Container(
                        width: 18 + (_tabs[i].length * 5.6),
                        height: 2,
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
    return switch (_tab) {
      1 => _recentWithdrawalsTab(),
      2 => _paymentMethodsTab(),
      _ => _myWithdrawalTab(),
    };
  }

  Widget _myWithdrawalTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 4),
        const Center(
          child: Text(
            'Withdrawal Money',
            style: TextStyle(
              fontSize: 15.5,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 18),
        _withdrawalBalanceCard(),
        const SizedBox(height: 20),
        _withdrawalProgress(),
        const SizedBox(height: 20),
        _verificationGate(),
        const SizedBox(height: 18),
        _requestCard(),
      ],
    );
  }

  Widget _recentWithdrawalsTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel(Ionicons.time_outline, 'RECENT WITHDRAWALS'),
        const SizedBox(height: 12),
        if (_requests.isEmpty)
          _emptyState(icon: Ionicons.cash_outline, title: 'NO WITHDRAWALS YET')
        else
          for (final r in _requests) ...[
            _requestRowWeb(r),
            const SizedBox(height: 12),
          ],
      ],
    );
  }

  Widget _paymentMethodsTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel(Ionicons.card_outline, 'AVAILABLE PAYMENT METHODS'),
        const SizedBox(height: 12),
        if (_methods.isEmpty)
          _emptyState(
            icon: Ionicons.card_outline,
            title: 'NO PAYMENT METHODS AVAILABLE',
            subtitle: 'Admin has not added any payout methods yet.',
          )
        else
          for (final method in _methods) ...[
            _paymentMethodCard(method),
            const SizedBox(height: 12),
          ],
      ],
    );
  }

  Widget _verificationGate() {
    if (_isVerified) {
      return Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          decoration: BoxDecoration(
            color: _greenFill,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: _greenBorder),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Ionicons.checkmark_circle,
                size: 22,
                color: AppColors.successGreen,
              ),
              SizedBox(width: 10),
              Text(
                'Identity Verified',
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.successGreen,
                ),
              ),
            ],
          ),
        ),
      );
    }
    final pending =
        _verificationStatus.toLowerCase() == 'under review' ||
        _verificationStatus.toLowerCase() == 'pending';
    final canStartVerification = _withdrawProgressComplete;
    final enabled = pending || canStartVerification;
    return Center(
      child: SizedBox(
        width: 250,
        child: _pillButton(
          label: pending
              ? 'VIEW VERIFICATION'
              : enabled
              ? 'START ID VERIFICATION'
              : 'ID VERIFICATION',
          enabled: enabled,
          onTap: () async {
            await Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const WalletVerificationScreen(),
              ),
            );
            if (mounted) _load();
          },
        ),
      ),
    );
  }

  Widget _withdrawalBalanceCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      decoration: BoxDecoration(
        color: const Color(0xFF070707),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF263247)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'My Total Rupieer Coins',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray400,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  formatMoney(_balance),
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          const RupeeCoin(size: 34),
        ],
      ),
    );
  }

  Widget _withdrawalProgress() {
    final withdrawLimit = _withdrawUnlockLimit;
    final balancePct = withdrawLimit <= 0
        ? 0
        : ((_balance / withdrawLimit) * 100).clamp(0, 100).toDouble();
    final balancePctLabel = balancePct.floor().clamp(0, 100);
    final remaining = (withdrawLimit - _balance).clamp(0, withdrawLimit);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'WITHDRAWAL PROGRESS',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: AppColors.textGray400,
                ),
              ),
            ),
            Text(
              '${_balance.floor()} / ${_compactNumber(withdrawLimit)} coins',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: LinearProgressIndicator(
            value: balancePct / 100,
            minHeight: 13,
            backgroundColor: const Color(0xFF1C2940),
            valueColor: const AlwaysStoppedAnimation(Color(0xFF12D55E)),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Completed $balancePctLabel%',
          style: const TextStyle(fontSize: 11, color: AppColors.textGray500),
        ),
        if (balancePct < 100) ...[
          const SizedBox(height: 6),
          Center(
            child: Text(
              'Earn ${remaining.toStringAsFixed(0)} more coins to unlock ID Verification',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 10.5,
                color: AppColors.textGray600,
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _paymentMethodCard(Map<String, dynamic> method) {
    final methodId = '${method['id'] ?? ''}';
    final hasSaved = (_savedDetails[methodId] ?? const {}).isNotEmpty;
    final fields = _fieldsOf(method);
    final open = _addDetailsMethodId == methodId;
    return Container(
      decoration: BoxDecoration(
        color: _fieldFill,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              children: [
                _paymentLogo(method, size: 54, radius: 14),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${method['name'] ?? 'Method'}',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        fields.isEmpty
                            ? 'No fields configured'
                            : fields
                                  .map(
                                    (field) =>
                                        '${field['label'] ?? _fieldKey(field)}',
                                  )
                                  .join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 10.5,
                          color: hasSaved
                              ? AppColors.successGreen
                              : AppColors.textGray500,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                SizedBox(
                  width: 148,
                  child: Column(
                    children: [
                      _smallActionButton(
                        label: 'SELECT',
                        onTap: () {
                          _selectMethod(method);
                          setState(() => _tab = 0);
                        },
                        foreground: Colors.white,
                        background: Colors.white.withValues(alpha: 0.05),
                      ),
                      const SizedBox(height: 10),
                      _smallActionButton(
                        label: 'ADD DETAILS',
                        onTap: () => _toggleAddDetails(method),
                        foreground: AppColors.textGray300,
                        background: Colors.transparent,
                        borderColor: AppColors.borderWhite10,
                        icon: Ionicons.create_outline,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (open) ...[
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'SAVE PAYMENT DETAILS — ${method['name'] ?? 'METHOD'}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.0,
                    color: AppColors.textGray400,
                  ),
                ),
              ),
              for (final field in fields) ...[
                const SizedBox(height: 12),
                _input(
                  _addDetailControllers[_fieldKey(field)]!,
                  '${field['label'] ?? _fieldKey(field)}${field['required'] == true ? ' *' : ''}',
                ),
              ],
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: _roundedButton(
                      label: 'CANCEL',
                      onTap: () => _toggleAddDetails(method),
                      background: const Color(0xFF232327),
                      foreground: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _roundedButton(
                      label: 'SAVE DETAILS',
                      onTap: () => _saveMethodDetails(method),
                      background: const Color(0xFF16A34A),
                      foreground: Colors.white,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _requestCard() {
    final method = _selectedMethod;
    final fields = method == null
        ? const <Map<String, dynamic>>[]
        : _fieldsOf(method);
    final enteredAmount = double.tryParse(_amount.text.trim()) ?? 0;
    final overMax = _maxAmount > 0 && enteredAmount > _maxAmount;
    final canSubmitWithdrawal =
        !_submitting && _canWithdrawNow && method != null;
    const withdrawalRed = Color(0xFFFF0000);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (method == null) ...[
            if (_isVerified) ...[
              const Center(
                child: Text(
                  'SELECT PAYMENT METHOD',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    color: AppColors.textGray400,
                  ),
                ),
              ),
              const SizedBox(height: 14),
              if (_methods.isEmpty)
                _emptyState(
                  icon: Ionicons.card_outline,
                  title: 'NO PAYMENT METHODS AVAILABLE',
                  subtitle: 'Admin has not added any payout methods yet.',
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _methods.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.22,
                  ),
                  itemBuilder: (context, index) {
                    final m = _methods[index];
                    final methodId = '${m['id'] ?? ''}';
                    final hasSaved =
                        (_savedDetails[methodId] ?? const {}).isNotEmpty;
                    return _methodPickerTile(m, hasSaved: hasSaved);
                  },
                ),
            ] else ...[
              _banner(
                icon: Ionicons.lock_closed_outline,
                tint: _amber,
                fill: const Color(0x12000000),
                border: _amberBorder,
                title: 'Withdrawal locked',
                body: _withdrawProgressComplete
                    ? 'Complete ID Verification to access payment methods.'
                    : 'Accumulate enough coins and complete ID Verification to unlock withdrawals.',
              ),
            ],
          ] else ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: _fieldFill,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Row(
                children: [
                  _paymentLogo(method, size: 42, radius: 11),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${method['name'] ?? 'Method'}',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Fill in your payment details below',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => setState(() => _tab = 2),
                    child: const Text(
                      'CHANGE',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                        color: AppColors.textGray400,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            for (final field in fields) ...[
              const SizedBox(height: 14),
              _microLabel(
                '${field['label'] ?? _fieldKey(field)}${field['required'] == true ? ' *' : ''}',
              ),
              const SizedBox(height: 8),
              _input(
                _fieldControllers[_fieldKey(field)]!,
                '${field['label'] ?? _fieldKey(field)}',
                enabled: true,
                onChanged: (_) => setState(() => _formError = null),
              ),
            ],
            const SizedBox(height: 16),
            _microLabel('ENTER WITHDRAWAL AMOUNT *'),
            const SizedBox(height: 8),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
              onChanged: (_) => setState(() => _formError = null),
              decoration: InputDecoration(
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 24,
                ),
                filled: true,
                fillColor: _fieldFill,
                hintText: _minAmount > 0
                    ? 'Min ${_minAmount.toStringAsFixed(0)}'
                    : '0',
                hintStyle: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textGray600,
                ),
                border: _fieldBorder(AppColors.borderWhite10),
                enabledBorder: _fieldBorder(AppColors.borderWhite10),
                focusedBorder: _fieldBorder(const Color(0x4DFFFFFF)),
              ),
            ),
            if (overMax) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: _redFill,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: _redBorder),
                ),
                child: Text(
                  'Maximum withdrawal is ${_maxAmount.toStringAsFixed(0)} coins.',
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: Color(0xFFFFB4B4),
                  ),
                ),
              ),
            ],
            if (_formError != null) ...[
              const SizedBox(height: 14),
              _messageBox(
                icon: Ionicons.alert_circle_outline,
                text: _formError!,
                tint: const Color(0xFFFFB4B4),
                border: _redBorder,
                fill: const Color(0x08000000),
              ),
            ],
            if (_formSuccess != null) ...[
              const SizedBox(height: 14),
              _messageBox(
                icon: Ionicons.checkmark_circle_outline,
                text: _formSuccess!,
                tint: AppColors.successGreen,
                border: _greenBorder,
                fill: const Color(0x08000000),
              ),
            ],
            if (!_isVerified) ...[
              const SizedBox(height: 14),
              _banner(
                icon: Ionicons.lock_closed_outline,
                tint: _amber,
                fill: const Color(0x12000000),
                border: _amberBorder,
                title: 'Withdrawal locked',
                body: !_withdrawProgressComplete
                    ? 'Accumulate enough coins to reach the withdrawal unlock limit first.'
                    : 'Complete ID Verification to unlock withdrawals.',
              ),
            ],
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: _roundedButton(
                    label: 'CANCEL',
                    onTap: () {
                      _amount.clear();
                      for (final c in _fieldControllers.values) {
                        c.clear();
                      }
                      setState(() {
                        _selectedMethod = null;
                        _formError = null;
                        _formSuccess = null;
                      });
                    },
                    background: const Color(0xFF232327),
                    foreground: Colors.white,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: _roundedButton(
                    label: _submitting ? 'SUBMITTING…' : 'WITHDRAWAL',
                    onTap: canSubmitWithdrawal ? _submit : () {},
                    background: canSubmitWithdrawal
                        ? withdrawalRed
                        : const Color(0xFF5A1E1E),
                    foreground: Colors.white,
                    enabled: canSubmitWithdrawal,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// Min / max / rate live on the admin settings row. Wrapped so three stats
  /// still fit a 320px screen.
  // ignore: unused_element
  Widget _constraints() {
    return Row(
      children: [
        Expanded(
          child: _constraintItem(
            'MIN',
            '${_minAmount > 0 ? _minAmount.toStringAsFixed(2) : '0.00'} coins',
          ),
        ),
        Expanded(
          child: _constraintItem(
            'MAX',
            '${_maxAmount > 0 ? _maxAmount.toStringAsFixed(2) : formatMoney(_balance)} coins',
          ),
        ),
        Expanded(
          child: _constraintItem(
            'RATE',
            _coinRate > 0 ? '\$${_coinRate.toStringAsFixed(4)} / coin' : '—',
          ),
        ),
      ],
    );
  }

  Widget _constraintItem(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.1,
            color: AppColors.textGray500,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ],
    );
  }

  // ignore: unused_element
  Widget _methodRow(Map<String, dynamic> method) {
    final selected =
        _selectedMethod != null &&
        '${_selectedMethod!['id']}' == '${method['id']}';
    final fieldCount = _fieldsOf(method).length;
    return GestureDetector(
      onTap: () => _selectMethod(method),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: _fieldFill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? Colors.white : AppColors.borderWhite10,
          ),
        ),
        child: Row(
          children: [
            _paymentLogo(method, size: 34, radius: 10),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${method['name'] ?? 'Method'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    fieldCount == 0
                        ? 'No details required'
                        : '$fieldCount detail${fieldCount == 1 ? '' : 's'} required',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              selected ? Ionicons.checkmark_circle : Ionicons.ellipse_outline,
              size: 17,
              color: selected ? AppColors.successGreen : AppColors.textGray600,
            ),
          ],
        ),
      ),
    );
  }

  Widget _methodPickerTile(
    Map<String, dynamic> method, {
    required bool hasSaved,
  }) {
    return GestureDetector(
      onTap: () => _selectMethod(method),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
        decoration: BoxDecoration(
          color: _fieldFill,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _paymentLogo(method, size: 52, radius: 13),
            const SizedBox(height: 10),
            Text(
              '${method['name'] ?? 'Method'}',
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            if (hasSaved) ...[
              const SizedBox(height: 5),
              const Text(
                'DETAILS SAVED',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.7,
                  color: AppColors.successGreen,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _requestRowWeb(Map<String, dynamic> request) {
    final status = '${request['status'] ?? ''}';
    final amount = double.tryParse('${request['amount'] ?? 0}') ?? 0;
    final id = int.tryParse('${request['id'] ?? ''}');
    final reason = '${request['rejection_reason'] ?? ''}'.trim();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _fieldFill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 60,
                height: 60,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: _redFill,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Icon(
                  Ionicons.arrow_up_outline,
                  size: 28,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${request['payment_method_name'] ?? 'Withdrawal'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${Api.postedDate(request['created_at'])}'
                      '${id == null ? '' : ' #$id'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textGray500,
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
                    '- R ${amount.toStringAsFixed(2)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 6),
                  _statusPill(status),
                ],
              ),
            ],
          ),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 10),
            _messageBox(
              icon: Ionicons.alert_circle_outline,
              text: reason,
              tint: const Color(0xFFFFB4B4),
              border: _redBorder,
              fill: const Color(0x08000000),
            ),
          ],
          if (status.toLowerCase() == 'pending' && id != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _cancellingId == id ? null : () => _cancel(request),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: _redBorder),
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(9999),
                  ),
                ),
                child: Text(
                  _cancellingId == id ? 'CANCELLING...' : 'CANCEL REQUEST',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.1,
                    color: AppColors.likeRed,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ignore: unused_element
  Widget _requestRow(Map<String, dynamic> request) {
    final status = '${request['status'] ?? ''}';
    final amount = double.tryParse('${request['amount'] ?? 0}') ?? 0;
    final id = int.tryParse('${request['id'] ?? ''}');
    final reason = '${request['rejection_reason'] ?? ''}'.trim();
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${request['payment_method_name'] ?? 'Withdrawal'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _statusPill(status),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const RupeeCoin(size: 15),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  formatMoney(amount),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${Api.relativeTime(request['created_at'])}'
            '${id == null ? '' : ' · #$id'}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 10.5,
              color: AppColors.textGray500,
            ),
          ),
          if (reason.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: _redFill,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: _redBorder),
              ),
              child: Text(
                reason,
                style: const TextStyle(
                  fontSize: 10.5,
                  height: 1.4,
                  color: AppColors.purpleText,
                ),
              ),
            ),
          ],
          // Only pending requests can be pulled back — same rule as the backend.
          if (status.toLowerCase() == 'pending' && id != null) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _cancellingId == id ? null : () => _cancel(request),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: _redBorder),
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(9999),
                  ),
                ),
                child: Text(
                  _cancellingId == id ? 'CANCELLING…' : 'CANCEL REQUEST',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.1,
                    color: AppColors.likeRed,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _statusPill(String status) {
    final key = status.toLowerCase();
    final (Color tint, Color fill, Color border) = switch (key) {
      'approved' ||
      'completed' ||
      'paid' => (AppColors.successGreen, _greenFill, _greenBorder),
      'pending' || 'processing' => (_amber, _amberFill, _amberBorder),
      'rejected' || 'failed' => (AppColors.likeRed, _redFill, _redBorder),
      _ => (AppColors.textGray400, Color(0x0FFFFFFF), AppColors.borderWhite10),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(9999),
        border: Border.all(color: border),
      ),
      child: Text(
        (status.isEmpty ? 'UNKNOWN' : status).toUpperCase(),
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.9,
          color: tint,
        ),
      ),
    );
  }

  // ---- Small pieces ----

  Widget _microLabel(String text) => Text(
    text,
    style: const TextStyle(
      fontSize: 9.5,
      fontWeight: FontWeight.w600,
      letterSpacing: 1.3,
      color: AppColors.textGray500,
    ),
  );

  Widget _banner({
    required IconData icon,
    required Color tint,
    required Color fill,
    required Color border,
    required String title,
    required String body,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: tint),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: tint,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  body,
                  style: const TextStyle(
                    fontSize: 10.5,
                    height: 1.45,
                    color: AppColors.textGray500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _messageBox({
    required IconData icon,
    required String text,
    required Color tint,
    required Color fill,
    required Color border,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: tint),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: tint,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _pillButton({
    required String label,
    required VoidCallback onTap,
    bool enabled = true,
  }) {
    return ElevatedButton(
      onPressed: enabled ? onTap : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: enabled ? Colors.white : const Color(0xFF1D314D),
        foregroundColor: enabled ? Colors.black : AppColors.textGray500,
        disabledBackgroundColor: const Color(0xFF1D314D),
        disabledForegroundColor: AppColors.textGray500,
        padding: const EdgeInsets.symmetric(vertical: 13),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(9999),
        ),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  // ignore: unused_element
  Widget _emptyBox(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 14),
      decoration: BoxDecoration(
        color: _fieldFill,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 11.5, color: AppColors.textGray500),
      ),
    );
  }

  Widget _emptyState({
    required IconData icon,
    required String title,
    String? subtitle,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 18),
      decoration: BoxDecoration(
        color: _fieldFill,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        children: [
          Icon(icon, size: 42, color: AppColors.textGray600),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              color: AppColors.textGray500,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 6),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 10.5,
                color: AppColors.textGray600,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _smallActionButton({
    required String label,
    required VoidCallback onTap,
    required Color foreground,
    required Color background,
    Color borderColor = AppColors.borderWhite10,
    IconData? icon,
  }) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          backgroundColor: background,
          foregroundColor: foreground,
          side: BorderSide(color: borderColor),
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 14),
              const SizedBox(width: 6),
            ],
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                ),
              ),
            ),
            if (label == 'SELECT') ...[
              const SizedBox(width: 6),
              const Icon(Ionicons.chevron_forward_outline, size: 14),
            ],
          ],
        ),
      ),
    );
  }

  Widget _roundedButton({
    required String label,
    required VoidCallback onTap,
    required Color background,
    required Color foreground,
    bool enabled = true,
  }) {
    return ElevatedButton(
      onPressed: enabled ? onTap : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        disabledBackgroundColor: background,
        disabledForegroundColor: foreground.withValues(alpha: 0.65),
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.0,
        ),
      ),
    );
  }

  Widget _input(
    TextEditingController controller,
    String hint, {
    TextInputType? keyboard,
    bool enabled = true,
    ValueChanged<String>? onChanged,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboard,
      enabled: enabled,
      onChanged: onChanged,
      style: const TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w500,
        color: Colors.white,
      ),
      decoration: InputDecoration(
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 13,
        ),
        filled: true,
        fillColor: _fieldFill,
        hintText: hint,
        hintStyle: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: AppColors.textGray600,
        ),
        border: _fieldBorder(AppColors.borderWhite10),
        enabledBorder: _fieldBorder(AppColors.borderWhite10),
        disabledBorder: _fieldBorder(AppColors.borderWhite06),
        focusedBorder: _fieldBorder(const Color(0x4DFFFFFF)),
      ),
    );
  }

  OutlineInputBorder _fieldBorder(Color color) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(14),
    borderSide: BorderSide(color: color),
  );

  Widget _paymentLogo(
    Map<String, dynamic> method, {
    double size = 42,
    double radius = 11,
  }) {
    final name = '${method['name'] ?? 'Method'}'.trim();
    final icon = '${method['icon'] ?? ''}'.trim();
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size >= 50 ? 7 : 5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: icon.isEmpty
          ? _letterLogo(name)
          : SvgPicture.network(
              '$_payrexxLogoBase/card_$icon.svg',
              fit: BoxFit.contain,
              placeholderBuilder: (_) => _letterLogo(name),
            ),
    );
  }

  Widget _letterLogo(String name) {
    final label = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    return Center(
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          color: Color(0xFF111827),
        ),
      ),
    );
  }

  static String _compactNumber(double value) {
    final n = value.round();
    final text = '$n';
    final buffer = StringBuffer();
    for (var i = 0; i < text.length; i++) {
      final remaining = text.length - i;
      buffer.write(text[i]);
      if (remaining > 1 && remaining % 3 == 1) buffer.write(',');
    }
    return buffer.toString();
  }
}
