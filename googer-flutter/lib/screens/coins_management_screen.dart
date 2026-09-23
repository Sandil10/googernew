import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/storage.dart';
import '../widgets/app_back_button.dart';

/// Wallet · Request — port of the web `dashboard/wallet/request`.
///
/// Send a coin request to admin, then watch it move Pending → Verified /
/// Rejected. Once verified the row expands with the admin-configured top-up
/// methods so the user can pick how they will pay.
class CoinsManagementScreen extends StatefulWidget {
  const CoinsManagementScreen({super.key});

  @override
  State<CoinsManagementScreen> createState() => _CoinsManagementScreenState();
}

class _CoinsManagementScreenState extends State<CoinsManagementScreen> {
  static const _amber = Color(0xFFF59E0B);
  static const _assignmentsKey = 'googer_topup_assignments';

  /// Same palette the web hashes a method name into for its letter fallback.
  static const _letterColors = [
    Color(0xFFEF4444),
    Color(0xFFF97316),
    Color(0xFFEAB308),
    Color(0xFF22C55E),
    Color(0xFF3B82F6),
    Color(0xFF8B5CF6),
    Color(0xFFEC4899),
    Color(0xFF06B6D4),
  ];

  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  bool _loading = true;
  bool _sending = false;
  List<Map<String, dynamic>> _requests = const [];
  List<Map<String, dynamic>> _methods = const [];

  /// requestId → chosen method id. Local only: the backend has no endpoint for
  /// attaching a method to a request (the web keeps this in localStorage too).
  Map<String, dynamic> _assignments = {};

  bool get _hasPending =>
      _requests.any((request) => _status(request) == 'pending');

  @override
  void initState() {
    super.initState();
    _restoreAssignments();
    _load();
  }

  void _restoreAssignments() {
    try {
      final raw = readStorage(_assignmentsKey);
      final decoded = raw == null ? null : jsonDecode(raw);
      if (decoded is Map) {
        _assignments = Map<String, dynamic>.from(decoded);
      }
    } catch (_) {}
  }

  void _saveAssignments() =>
      writeStorage(_assignmentsKey, jsonEncode(_assignments));

  Future<void> _load() async {
    final results = await Future.wait([
      Api.myCoinRequests(),
      Api.activeTopupMethods(),
    ]);
    if (!mounted) return;
    setState(() {
      _requests = results[0];
      _methods = results[1];
      _loading = false;
    });
  }

  // ---- Row helpers ----

  String _id(Map<String, dynamic> request) => '${request['id'] ?? ''}';

  String _status(Map<String, dynamic> request) =>
      '${request['status'] ?? 'Pending'}'.trim().toLowerCase();

  /// "01 Aug 2026", matching the web's `toLocaleDateString` options.
  String _date(Map<String, dynamic> request) {
    final raw = '${request['created_at'] ?? request['createdAt'] ?? ''}';
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return '—';
    final local = parsed.toLocal();
    return '${local.day.toString().padLeft(2, '0')} '
        '${_months[local.month - 1]} ${local.year}';
  }

  String _methodName(Map<String, dynamic> method) {
    for (final key in const ['name', 'method_name', 'title']) {
      final value = '${method[key] ?? ''}'.trim();
      if (value.isNotEmpty) return value;
    }
    return 'Method';
  }

  String _methodId(Map<String, dynamic> method) =>
      '${method['id'] ?? _methodName(method)}';

  String _assignedMethodId(String requestId) {
    final assignment = _assignments[requestId];
    if (assignment is Map) return '${assignment['methodId'] ?? ''}';
    return '${assignment ?? ''}';
  }

  static Color _letterColor(String name) {
    var hash = 0;
    for (final unit in name.codeUnits) {
      hash = (hash * 31 + unit) & 0x7fffffff;
    }
    return _letterColors[hash % _letterColors.length];
  }

  // ---- Actions ----

  Future<void> _sendRequest() async {
    if (_sending || _hasPending) return;
    setState(() => _sending = true);
    // `method_category` and `method_name` are mandatory — coinRequestService
    // throws 400 without them — and the notes column is `notes`, not `note`.
    // The web sends this exact shape for a plain coin request.
    final error = await Api.createCoinRequest({
      'method_category': 'Request',
      'method_name': 'Coin Request',
      'amount': 1,
    });
    if (!mounted) return;
    setState(() => _sending = false);
    if (error == null) {
      AppNotifications.success(
        'Request sent',
        'We will verify your request shortly.',
      );
      await _load();
    } else {
      AppNotifications.error('Could not send request', error);
    }
  }

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
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 34),
            children: [
              AppBackButton(),
              const SizedBox(height: 18),
              const Text(
                'Request',
                style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Send a coin request to admin for approval.',
                style: TextStyle(fontSize: 13.5, color: AppColors.textGray500),
              ),
              const SizedBox(height: 22),
              _sendButton(),
              if (_hasPending) ...[
                const SizedBox(height: 10),
                const Text(
                  'You already have a pending request. Please wait for admin approval.',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: _amber,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              _requestsCard(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sendButton() {
    final disabled = _sending || _hasPending;
    return GestureDetector(
      onTap: disabled ? null : _sendRequest,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 54,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: disabled ? Colors.white.withOpacity(0.5) : Colors.white,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Ionicons.paper_plane_outline,
              size: 17,
              color: Colors.black,
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Text(
                _sending ? 'SENDING…' : 'SEND REQUEST',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12.5,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: Colors.black,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _requestsCard() {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
            child: Row(
              children: [
                const Icon(
                  Ionicons.time_outline,
                  size: 16,
                  color: AppColors.textGray400,
                ),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'My Requests',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${_requests.length} TOTAL',
                  style: const TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray600,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.borderWhite10),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 56),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.textGray500,
                  ),
                ),
              ),
            )
          else if (_requests.isEmpty)
            _emptyState()
          else
            for (var i = 0; i < _requests.length; i++) ...[
              if (i > 0)
                const Divider(height: 1, color: AppColors.borderWhite10),
              _requestRow(_requests[i]),
            ],
        ],
      ),
    );
  }

  Widget _emptyState() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 54),
      child: Column(
        children: [
          Icon(
            Ionicons.document_outline,
            size: 30,
            color: AppColors.textGray600,
          ),
          SizedBox(height: 14),
          Text(
            'NO REQUESTS YET',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _requestRow(Map<String, dynamic> request) {
    final status = _status(request);
    final approved = status == 'verified' || status == 'approved';
    final rejected = status == 'rejected';
    final reason = '${request['rejection_reason'] ?? ''}'.trim();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: const Icon(
                      Ionicons.paper_plane_outline,
                      size: 15,
                      color: AppColors.textGray400,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Coin Request',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w500,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          _date(request),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 10.5,
                            color: AppColors.textGray600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _statusPill(approved, rejected),
                ],
              ),
              if (rejected && reason.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  reason,
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.likeRed,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (approved) _approvedBlock(request),
      ],
    );
  }

  Widget _statusPill(bool approved, bool rejected) {
    final color = approved
        ? AppColors.successGreen
        : rejected
        ? AppColors.likeRed
        : _amber;
    final label = approved
        ? 'VERIFIED'
        : rejected
        ? 'REJECTED'
        : 'PENDING';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _approvedBlock(Map<String, dynamic> request) {
    final requestId = _id(request);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
      decoration: BoxDecoration(
        color: AppColors.successGreen.withOpacity(0.04),
        border: Border(
          top: BorderSide(color: AppColors.successGreen.withOpacity(0.12)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Ionicons.checkmark_circle,
                size: 15,
                color: AppColors.successGreen,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Approved — select a payment method',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppColors.successGreen,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (_methods.isEmpty)
            const Text(
              'NO PAYMENT METHODS AVAILABLE',
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.3,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray600,
              ),
            )
          else
            // Wrapped so a long method list cannot overflow at 320px.
            Wrap(
              spacing: 10,
              runSpacing: 12,
              children: [
                for (final method in _methods) _methodTile(method, requestId),
              ],
            ),
        ],
      ),
    );
  }

  Widget _methodTile(Map<String, dynamic> method, String requestId) {
    final name = _methodName(method);
    final id = _methodId(method);
    final selected = _assignedMethodId(requestId) == id;
    return GestureDetector(
      onTap: () async {
        final result = await showModalBottomSheet<Map<String, dynamic>>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (_) => _TopupMethodSheet(
            method: method,
            existing: _assignments[requestId],
          ),
        );
        if (!mounted || result == null) return;
        setState(() {
          if (result['remove'] == true) {
            _assignments.remove(requestId);
          } else {
            _assignments[requestId] = result;
          }
        });
        _saveAssignments();
        AppNotifications.info(
          result['remove'] == true ? '$name removed' : '$name selected',
          result['remove'] == true ? '' : 'Pay using $name to top up.',
        );
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 74,
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected
                ? AppColors.successGreen.withOpacity(0.45)
                : AppColors.borderWhite10,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _paymentLogo(method, name),
            const SizedBox(height: 7),
            Text(
              name,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 9.5,
                height: 1.25,
                fontWeight: FontWeight.w500,
                color: selected
                    ? AppColors.successGreen
                    : AppColors.textGray400,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _paymentLogo(Map<String, dynamic> method, String name) {
    final icon = '${method['icon'] ?? ''}'.trim();
    return Container(
      width: 42,
      height: 42,
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(11),
      ),
      child: icon.isEmpty
          ? _letterLogo(name)
          : SvgPicture.network(
              'https://raw.githubusercontent.com/payrexx/payment-logos/main/assets/card-icons/card_$icon.svg',
              fit: BoxFit.contain,
              placeholderBuilder: (_) => _letterLogo(name),
              errorBuilder: (_, _, _) => _letterLogo(name),
            ),
    );
  }

  Widget _letterLogo(String name) => Container(
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: _letterColor(name),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      name.substring(0, 1).toUpperCase(),
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: Colors.white,
      ),
    ),
  );
}

class _TopupMethodSheet extends StatefulWidget {
  final Map<String, dynamic> method;
  final dynamic existing;

  const _TopupMethodSheet({required this.method, required this.existing});

  @override
  State<_TopupMethodSheet> createState() => _TopupMethodSheetState();
}

class _TopupMethodSheetState extends State<_TopupMethodSheet> {
  final Map<String, TextEditingController> _controllers = {};
  late final List<Map<String, dynamic>> _fields;
  String? _error;

  String get _methodId => '${widget.method['id'] ?? ''}';
  String get _methodName =>
      '${widget.method['name'] ?? widget.method['method_name'] ?? 'Method'}';

  bool get _isSelected {
    final existing = widget.existing;
    if (existing is Map) return '${existing['methodId'] ?? ''}' == _methodId;
    return '${existing ?? ''}' == _methodId;
  }

  @override
  void initState() {
    super.initState();
    _fields = _parseFields(widget.method['fields']);
    final saved = widget.existing is Map && _isSelected
        ? (widget.existing['fields'] is Map
              ? Map<String, dynamic>.from(widget.existing['fields'] as Map)
              : <String, dynamic>{})
        : <String, dynamic>{};
    for (final field in _fields) {
      final key = '${field['key'] ?? ''}';
      if (key.isEmpty) continue;
      _controllers[key] = TextEditingController(
        text:
            '${saved[key] ?? field['defaultValue'] ?? field['default_value'] ?? ''}',
      );
    }
  }

  static List<Map<String, dynamic>> _parseFields(dynamic raw) {
    dynamic decoded = raw;
    if (raw is String && raw.trim().isNotEmpty) {
      try {
        decoded = jsonDecode(raw);
      } catch (_) {
        decoded = const [];
      }
    }
    if (decoded is! List) return const [];
    return decoded
        .whereType<Map>()
        .map((entry) => Map<String, dynamic>.from(entry))
        .toList();
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _save() {
    for (final field in _fields) {
      final key = '${field['key'] ?? ''}';
      final required = field['required'] == true;
      if (required && (_controllers[key]?.text.trim().isEmpty ?? true)) {
        setState(() => _error = '${field['label'] ?? key} is required.');
        return;
      }
    }
    Navigator.pop(context, <String, dynamic>{
      'methodId': widget.method['id'] ?? _methodId,
      'fields': {
        for (final entry in _controllers.entries) entry.key: entry.value.text,
      },
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        decoration: const BoxDecoration(
          color: Color(0xFF0C0C0F),
          borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
          border: Border(top: BorderSide(color: AppColors.borderWhite10)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 20, 14, 16),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(11),
                    ),
                    child: Text(
                      _methodName.substring(0, 1).toUpperCase(),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: Colors.black,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _methodName,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 3),
                        const Text(
                          'Fill in your details',
                          style: TextStyle(
                            fontSize: 10.5,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Ionicons.close_outline),
                    color: AppColors.textGray400,
                  ),
                ],
              ),
            ),
            const Divider(height: 1, color: AppColors.borderWhite10),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(22),
                child: Column(
                  children: [
                    if (_fields.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 24),
                        child: Text(
                          'NO FIELDS CONFIGURED',
                          style: TextStyle(
                            fontSize: 10,
                            letterSpacing: 1.3,
                            color: AppColors.textGray600,
                          ),
                        ),
                      )
                    else
                      for (final field in _fields) ...[
                        _field(field),
                        const SizedBox(height: 15),
                      ],
                    if (_error != null)
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          _error!,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.likeRed,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const Divider(height: 1, color: AppColors.borderWhite10),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 14, 22, 22),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        foregroundColor: Colors.white,
                        backgroundColor: AppColors.bg3,
                        shape: const StadiumBorder(),
                      ),
                      child: const Text('CANCEL'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _isSelected
                          ? () => Navigator.pop(context, <String, dynamic>{
                              'remove': true,
                            })
                          : _save,
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        foregroundColor: _isSelected
                            ? AppColors.likeRed
                            : Colors.black,
                        backgroundColor: _isSelected
                            ? AppColors.likeRed.withOpacity(0.14)
                            : Colors.white,
                        shape: const StadiumBorder(),
                      ),
                      icon: Icon(
                        _isSelected
                            ? Ionicons.trash_outline
                            : Ionicons.checkmark_outline,
                        size: 16,
                      ),
                      label: Text(_isSelected ? 'REMOVE' : 'SAVE'),
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

  Widget _field(Map<String, dynamic> field) {
    final key = '${field['key'] ?? ''}';
    final locked = field['locked'] == true;
    final type = '${field['type'] ?? 'text'}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: '${field['label'] ?? key}'.toUpperCase(),
            children: [
              if (field['required'] == true)
                const TextSpan(
                  text: ' *',
                  style: TextStyle(color: AppColors.likeRed),
                ),
              if (locked)
                const TextSpan(
                  text: '  🔒 LOCKED',
                  style: TextStyle(color: AppColors.textGray600),
                ),
            ],
          ),
          style: const TextStyle(
            fontSize: 10,
            letterSpacing: 1.1,
            fontWeight: FontWeight.w700,
            color: AppColors.textGray500,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _controllers[key],
          readOnly: locked,
          keyboardType: type == 'number'
              ? TextInputType.number
              : type == 'email'
              ? TextInputType.emailAddress
              : TextInputType.text,
          style: TextStyle(
            fontSize: 13,
            color: locked ? AppColors.textGray500 : Colors.white,
          ),
          decoration: InputDecoration(
            hintText: '${field['placeholder'] ?? field['label'] ?? ''}',
            hintStyle: const TextStyle(color: AppColors.textGray600),
            filled: true,
            fillColor: AppColors.bg0,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 14,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: AppColors.borderWhite10),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: Colors.white30),
            ),
          ),
        ),
      ],
    );
  }
}
