import 'dart:convert';
import 'dart:math';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/subscription_limits.dart';
import '../widgets/wallet_bits.dart';
import 'my_wallet_screen.dart';

/// Wallet · Subscription — port of the web `dashboard/wallet/subscription`
/// page: the "Choose Your Plan" hero, one card per paid plan with its badge
/// colour as the accent, and the Cancel/Subscribe action card underneath.
///
/// Wired to:
///   GET   /admin/customization/subscription-plans/public
///   GET   /subscriptions/me
///   POST  /subscriptions/subscribe
///   PATCH /subscriptions/auto-renew
class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

const _cardBg = Color(0xFF09090B);
const _fieldFill = Color(0xFF030303);
const _webBorder = Color(0xB31F2937);

/// `BADGE_THEME` from the web page — the plan's badge colour drives the top
/// bar, the plan name, the tick colour and the selected border.
const _badgeThemes = <String, Color>{
  'silver': Color(0xFFD4D4D8),
  'blue': Color(0xFF60A5FA),
  'gold': Color(0xFFFBBF24),
  'green': Color(0xFF34D399),
  'cyan': Color(0xFF06B6D4),
  'amber': Color(0xFFF59E0B),
  'purple': Color(0xFFC084FC),
  'red': Color(0xFFF87171),
  'black': Color(0xFF3D3D3D),
};

class _FeatureGroups {
  final List<String> regular;
  final List<String> chat;
  final List<String> content;
  const _FeatureGroups(this.regular, this.chat, this.content);
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  bool _loading = true;
  bool _cancelling = false;
  int? _busyPlanId;
  bool _togglingRenew = false;

  List<Map<String, dynamic>> _plans = const [];
  Map<String, dynamic>? _sub;

  int? _selectedId;
  final Set<int> _openChat = {};
  final Set<int> _openContent = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    await Api.refreshProfile();
    final plans = await Api.publicPlans();
    final sub = await Api.mySubscription();
    if (!mounted) return;
    setState(() {
      // The web hides the free "basic" tier — every account already has it.
      final paid = plans.where((p) {
        final slug = '${p['slug'] ?? ''}'.toLowerCase();
        return slug != 'basic' && _priceOf(p) > 0;
      }).toList();
      _plans = paid;
      _sub = sub;
      final activeId = int.tryParse('${sub?['plan_id'] ?? ''}');
      final activeIsPaid = paid.any((p) => _idOf(p) == activeId);
      _selectedId = activeIsPaid
          ? activeId
          : (paid.isEmpty ? null : _idOf(paid.first));
      _loading = false;
    });
  }

  /* ── plan reading ── */

  static double _priceOf(Map<String, dynamic> plan) =>
      double.tryParse('${plan['price'] ?? 0}') ?? 0;

  static int? _idOf(Map<String, dynamic> plan) =>
      int.tryParse('${plan['id'] ?? ''}');

  /// `extra` arrives as a JSON string on some deployments and a real map on
  /// others.
  static Map<String, dynamic> _extraOf(Map<String, dynamic> plan) {
    final raw = plan['extra'];
    if (raw is Map) return Map<String, dynamic>.from(raw);
    if (raw is String && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {
        /* fall through to empty */
      }
    }
    return const {};
  }

  /// `features` arrives as a JSON array on some deployments and a real list on
  /// others.
  static List<String> _featuresOf(Map<String, dynamic> plan) {
    var raw = plan['features'];
    if (raw is String) {
      try {
        raw = jsonDecode(raw);
      } catch (_) {
        raw = raw.split(',');
      }
    }
    if (raw is! List) return const [];
    return raw
        .map((e) => '$e'.trim())
        .where((e) => e.isNotEmpty)
        .toSet()
        .toList();
  }

  static Color _themeOf(Map<String, dynamic> plan) {
    final extra = _extraOf(plan);
    final custom = '${extra['badge_custom_color'] ?? ''}'.trim();
    final named = '${plan['badge_color'] ?? 'silver'}'.trim().toLowerCase();
    return _colorFromAdminValue(
      custom.isNotEmpty ? custom : named,
      _badgeThemes[named] ?? _badgeThemes['silver']!,
    );
  }

  static Color _badgeTickColorOf(Map<String, dynamic> plan) {
    final extra = _extraOf(plan);
    return _colorFromAdminValue(
      '${extra['badge_tick_color'] ?? ''}',
      Colors.white,
    );
  }

  static Color _colorFromAdminValue(String value, Color fallback) {
    final raw = value.trim();
    if (raw.isEmpty) return fallback;
    final named = raw.toLowerCase();
    if (_badgeThemes.containsKey(named)) return _badgeThemes[named]!;
    final hex = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(raw);
    if (hex != null) {
      return Color(0xFF000000 | int.parse(hex.group(1)!, radix: 16));
    }
    return fallback;
  }

  /// `billing_interval_label || "${duration_days}d"` — the web prints "/ 30d".
  static String _intervalOf(Map<String, dynamic> plan) {
    final label = '${plan['billing_interval_label'] ?? ''}'.trim();
    if (label.isNotEmpty) return label;
    final days = int.tryParse('${plan['duration_days'] ?? ''}') ?? 0;
    return '${days}d';
  }

  /* ── feature grouping (port of `getPlanFeatureGroups`) ── */

  static bool _isChatLabel(String label) {
    final n = label.toLowerCase();
    return n.contains('chat') ||
        n.contains('message') ||
        n.contains('text messaging') ||
        n.contains('colored text') ||
        n.contains('text color') ||
        n.contains('voice note') ||
        n.contains('voice to text') ||
        n.contains('text to voice') ||
        n.contains('voice call') ||
        n.contains('video call') ||
        n.contains('sticker') ||
        n.contains('auto delete') ||
        n.contains('history kept') ||
        n.contains('lifetime history');
  }

  static String? _normalizeChatLabel(String label) {
    final cleaned = label
        .replaceAll(
          RegExp(r'^chat\s*features?\s*:?\s*', caseSensitive: false),
          '',
        )
        .replaceAll(RegExp(r'^chat\s*:?\s*', caseSensitive: false), '')
        .trim();
    final n = cleaned.toLowerCase();
    if (cleaned.isEmpty ||
        n == 'features' ||
        n.contains('auto delete') ||
        n.contains('history kept') ||
        n.contains('lifetime history')) {
      return null;
    }
    if (n.contains('voice note') && n.contains('text')) {
      return 'Voice notes to text';
    }
    if (n.contains('voice to text')) return 'Voice to text';
    if (n.contains('text to voice')) return 'Text to voice';
    if (n.contains('text messaging') && n.contains('color')) {
      return 'Text messaging colors';
    }
    if (n.contains('colored text') || n.contains('text color')) {
      return 'Colored text';
    }
    if (n.contains('text messaging') || n.contains('message')) {
      return 'Text messages';
    }
    if (n.contains('voice call')) return 'Voice calls';
    if (n.contains('sticker')) return 'Stickers';
    return cleaned;
  }

  static bool _isLegacyPostingLimitLabel(String label) {
    return RegExp(
      r'^goog(?:er)?\s+posting\s+limit\b',
      caseSensitive: false,
    ).hasMatch(label.trim());
  }

  static String _videoLimitLabel(double minutes) {
    // Plain literal, not `1 << N`: Dart ints are JS doubles on the web and
    // bitwise shifts are 32-bit, so a shifted bound can collapse and make
    // `clamp` throw.
    final totalSeconds = (minutes * 60).round().clamp(0, 1000000);
    final m = totalSeconds ~/ 60;
    final s = totalSeconds % 60;
    if (m > 0 && s > 0) return '$m min $s sec';
    if (m > 0) return '$m minute${m == 1 ? '' : 's'}';
    return '$s second${s == 1 ? '' : 's'}';
  }

  static String _contentExpiryLabel(Map<String, dynamic> extra) {
    final labels = extra['labels'] is Map
        ? Map<String, dynamic>.from(extra['labels'] as Map)
        : const <String, dynamic>{};
    final name = '${labels['content_expiry'] ?? 'Upload Content Expiry'}';
    final unit = '${extra['content_expiry_unit'] ?? 'unlimited'}';
    if (unit == 'unlimited') return '$name: Lifetime';
    final value =
        (double.tryParse('${extra['content_expiry_value'] ?? 1}') ?? 1)
            .round()
            .clamp(1, 1000000);
    return '$name: $value $unit';
  }

  static List<String> _postingLimitLabels(Map<String, dynamic> plan) {
    final extra = _extraOf(plan);
    final daily =
        int.tryParse(
          '${extra['goog_posting_daily_limit'] ?? extra['write_goog_daily_limit'] ?? 0}',
        ) ??
        0;
    final total =
        int.tryParse(
          '${extra['goog_posting_total_limit'] ?? plan['googs_limit'] ?? extra['goog_posting_limit'] ?? extra['write_goog_limit'] ?? 0}',
        ) ??
        0;
    return [
      daily > 0
          ? 'Googer Posting Daily: $daily/day'
          : 'Googer Posting Daily: Unlimited/day',
      total > 0
          ? 'Googer Posting Total: $total total'
          : 'Googer Posting Total: Unlimited total',
    ];
  }

  static bool _truthy(dynamic v) =>
      v != null && v != false && v != 0 && '$v'.trim().isNotEmpty && v != '0';

  static _FeatureGroups _groupsOf(Map<String, dynamic> plan) {
    final extra = _extraOf(plan);
    final all = _featuresOf(plan);
    final labels = extra['labels'] is Map
        ? Map<String, dynamic>.from(extra['labels'] as Map)
        : const <String, dynamic>{};

    final manualChat = all
        .where(_isChatLabel)
        .map(_normalizeChatLabel)
        .whereType<String>()
        .toList();
    final regular = all
        .where((l) => !_isChatLabel(l))
        .where((l) => !_isLegacyPostingLimitLabel(l))
        .where(
          (l) => !RegExp(
            r'verified\s*(tick|badge)',
            caseSensitive: false,
          ).hasMatch(l),
        )
        .toList();
    if (plan['verified_tick'] == true) {
      regular.insert(0, 'Verification tick');
    }
    regular.addAll(_postingLimitLabels(plan));

    final isBasic =
        '${plan['slug'] ?? ''}'.toLowerCase() == 'basic' || _priceOf(plan) == 0;
    final uploadLimit = subscriptionContentLimit(
      extra,
      'content_upload_limit',
      isBasic: isBasic,
    );
    final dailyLimit = subscriptionContentLimit(
      extra,
      'content_daily_upload_limit',
      isBasic: isBasic,
    );
    final videoLimit = subscriptionContentLimit(
      extra,
      'content_video_limit_minutes',
      isBasic: isBasic,
    );

    final textMessaging = extra['text_messaging'];
    final textMessagingText = '${textMessaging ?? ''}';
    final chat = <String>[];
    if (_truthy(textMessaging)) chat.add('Text messages');
    if (extra['chat_text_colors'] == true ||
        textMessagingText.contains('colors')) {
      chat.add('Text messaging colors');
    }
    if (extra['chat_stickers'] == true ||
        textMessagingText.contains('stickers')) {
      chat.add('Stickers');
    }
    if (extra['voice_calls'] == true ||
        (extra['voice_calls'] != false && extra['voice_calls'] != null)) {
      chat.add('Voice calls');
    }
    if (extra['video_calls'] == true) {
      final quality = '${extra['video_call_quality'] ?? ''}'.trim();
      chat.add(quality.isEmpty ? 'Video calls' : 'Video calls ($quality)');
    }
    if (_truthy(extra['voice_notes_to_text']) ||
        _truthy(extra['voice_to_text']) ||
        _truthy(extra['speech_to_text']) ||
        _truthy(extra['microphone'])) {
      chat.add('Voice to text');
    }
    if (_truthy(extra['text_to_voice_note']) ||
        _truthy(extra['text_to_voice']) ||
        _truthy(extra['tts']) ||
        _truthy(extra['speech'])) {
      chat.add('Text to voice');
    }

    final content = <String>[];
    if (uploadLimit > 0) {
      content.add(
        '${labels['content_upload_limit'] ?? 'Upload Content Limit'}: '
        '${uploadLimit.round()}',
      );
    }
    if (dailyLimit > 0) {
      content.add(
        '${labels['content_daily_upload_limit'] ?? 'Daily Uploads'}: '
        '${dailyLimit.round()}',
      );
    }
    if (videoLimit > 0) {
      content.add(
        '${labels['content_video_limit_minutes'] ?? 'Video Limit'}: '
        '${_videoLimitLabel(videoLimit)}',
      );
    }
    content.add(_contentExpiryLabel(extra));

    List<String> dedupe(List<String> list) => list.toSet().toList();
    return _FeatureGroups(
      dedupe(regular),
      dedupe([...manualChat, ...chat]),
      dedupe(content),
    );
  }

  /* ── subscription state ── */

  int? get _activePlanId {
    final sub = _sub;
    if (sub == null) return null;
    if ('${sub['status'] ?? 'active'}'.toLowerCase() != 'active') return null;
    return int.tryParse('${sub['plan_id'] ?? ''}');
  }

  bool get _inGrace => _sub?['in_grace_period'] == true;

  bool get _hasPaidPlan {
    final sub = _sub;
    if (sub == null || _activePlanId == null) return false;
    return '${sub['plan_slug'] ?? ''}'.toLowerCase() != 'basic';
  }

  bool get _autoRenew => _sub?['auto_renew'] == true;

  Map<String, dynamic>? get _selectedPlan {
    for (final plan in _plans) {
      if (_idOf(plan) == _selectedId) return plan;
    }
    return null;
  }

  /// True when the selected card is the plan currently running.
  bool get _selectedIsActive =>
      _selectedId != null && _selectedId == _activePlanId && !_inGrace;

  Color get _selectedTheme {
    final plan = _selectedPlan;
    return plan == null ? _badgeThemes['silver']! : _themeOf(plan);
  }

  /* ── actions ── */

  Future<void> _toggleAutoRenew(bool next) async {
    final sub = _sub;
    if (sub == null || _togglingRenew) return;
    setState(() {
      _togglingRenew = true;
      _sub = {...sub, 'auto_renew': next};
    });
    final ok = await Api.setAutoRenew(next);
    if (!mounted) return;
    setState(() {
      _togglingRenew = false;
      // Roll the optimistic flip back when the server refuses.
      if (!ok) _sub = {...sub, 'auto_renew': !next};
    });
    if (ok) {
      AppNotifications.success(
        next ? 'Auto-renew on' : 'Auto-renew off',
        next
            ? 'Your plan will renew automatically.'
            : 'Your plan stays active until it expires.',
      );
    } else {
      AppNotifications.error('Could not update auto-renew');
    }
  }

  /// Cancelling is turning auto-renew off — the plan runs to its expiry date,
  /// which is what the web's Cancel Subscription button does.
  Future<void> _cancel() async {
    if (_sub == null || _cancelling) return;
    setState(() => _cancelling = true);
    final ok = await Api.setAutoRenew(false);
    if (!mounted) return;
    setState(() {
      _cancelling = false;
      if (ok) _sub = {..._sub!, 'auto_renew': false};
    });
    if (ok) {
      AppNotifications.success(
        'Subscription cancelled',
        'Auto-renew is off. Your plan stays active until expiry.',
      );
    } else {
      AppNotifications.error('Failed to cancel subscription.');
    }
  }

  Future<void> _confirmSubscribe(Map<String, dynamic> plan) async {
    final id = _idOf(plan);
    if (id == null) return;
    await Api.refreshProfile();
    if (!mounted) return;
    final price = _priceOf(plan);
    if (price > Api.balance) {
      await _showInsufficientBalance(price - Api.balance);
      return;
    }
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _confirmSheetWeb(plan),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busyPlanId = id);
    final error = await Api.subscribePlan(id, switchPlan: _hasPaidPlan);
    if (!mounted) return;
    setState(() => _busyPlanId = null);
    if (error != null) {
      AppNotifications.error('Subscription failed', error);
      return;
    }
    await _load();
    if (!mounted) return;
    await _showPaymentSuccess(plan);
  }

  Future<void> _showPaymentSuccess(Map<String, dynamic> plan) async {
    final planName = '${plan['name'] ?? 'your plan'}'.trim();
    final message = "Payment successful! You're subscribed to $planName.";
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.72),
      builder: (dialogContext) => BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 7, sigmaY: 7),
        child: Dialog(
          insetPadding: const EdgeInsets.symmetric(horizontal: 50),
          backgroundColor: const Color(0xFF0A0A0A),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0x6600C853)),
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 350),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: const Color(0xFF00C853).withValues(alpha: 0.13),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: const Color(0xFF00C853).withValues(alpha: 0.48),
                      ),
                    ),
                    child: const Icon(
                      Ionicons.checkmark_circle,
                      color: Color(0xFFEFFFF5),
                      size: 22,
                    ),
                  ),
                  const SizedBox(height: 13),
                  const Text(
                    'Payment Successful',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Color(0xFF4ADE80),
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xCC4ADE80),
                      fontSize: 14,
                      height: 1.35,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 17),
                  SizedBox(
                    height: 36,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00C853),
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(horizontal: 26),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      child: const Text(
                        'OK',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showInsufficientBalance(double shortfall) async {
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.7),
      builder: (dialogContext) => Dialog(
        backgroundColor: const Color(0xFF0A0A0A),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: Color(0x66EF4444)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.likeRed.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppColors.likeRed.withValues(alpha: 0.4),
                  ),
                ),
                child: const Icon(
                  Ionicons.alert_circle,
                  size: 22,
                  color: AppColors.likeRed,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Insufficient Balance',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFFFCA5A5),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'You need R ${shortfall.toStringAsFixed(2)} more to subscribe.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11,
                  height: 1.4,
                  color: Color(0xCCFCA5A5),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.pop(dialogContext),
                      style: TextButton.styleFrom(
                        backgroundColor: Colors.white.withValues(alpha: 0.05),
                        foregroundColor: Colors.white.withValues(alpha: 0.8),
                        side: const BorderSide(color: _webBorder),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      child: const Text(
                        'Close',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextButton(
                      onPressed: () {
                        Navigator.pop(dialogContext);
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const MyWalletScreen(),
                          ),
                        );
                      },
                      style: TextButton.styleFrom(
                        backgroundColor: AppColors.likeRed,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      child: const Text(
                        'Top Up',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
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

  /* ── build ── */

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          color: AppColors.textGray300,
          backgroundColor: AppColors.bg1,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 34),
            children: [
              Align(alignment: Alignment.centerRight, child: _closeButton()),
              const SizedBox(height: 18),
              _hero(),
              const SizedBox(height: 26),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 60),
                  child: Center(
                    child: SizedBox(
                      width: 26,
                      height: 26,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.likeRed,
                      ),
                    ),
                  ),
                )
              else ...[
                if (_plans.isEmpty)
                  _emptyBox('No plans are on sale right now')
                else
                  for (final plan in _plans) ...[
                    _planCard(plan),
                    const SizedBox(height: 12),
                  ],
                const SizedBox(height: 4),
                _actionCard(),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _closeButton() {
    return GestureDetector(
      onTap: () => Navigator.maybePop(context),
      child: Container(
        width: 38,
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          shape: BoxShape.circle,
          border: Border.all(color: _webBorder),
        ),
        child: Icon(
          Ionicons.close_outline,
          size: 18,
          color: Colors.white.withValues(alpha: 0.8),
        ),
      ),
    );
  }

  Widget _hero() {
    return Column(
      children: [
        const Text(
          'Choose Your Plan',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 12),
        // The rule takes the selected plan's badge colour, as on the web.
        Container(
          width: 80,
          height: 4,
          decoration: BoxDecoration(
            color: _selectedTheme,
            borderRadius: BorderRadius.circular(999),
            boxShadow: [
              BoxShadow(
                color: _selectedTheme.withValues(alpha: 0.45),
                blurRadius: 18,
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Pick a subscription that fits you.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: Colors.white.withValues(alpha: 0.55),
          ),
        ),
      ],
    );
  }

  Widget _planCard(Map<String, dynamic> plan) {
    final id = _idOf(plan);
    final theme = _themeOf(plan);
    final groups = _groupsOf(plan);
    final isSelected = id != null && id == _selectedId;
    final isActiveHere = id != null && id == _activePlanId;
    final highlight = isSelected || isActiveHere;
    final chatOpen = id != null && _openChat.contains(id);
    final contentOpen = id != null && _openContent.contains(id);

    return GestureDetector(
      onTap: id == null ? null : () => setState(() => _selectedId = id),
      behavior: HitTestBehavior.opaque,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: _cardBg,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: highlight ? theme : theme.withValues(alpha: 0.28),
            width: highlight ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // The plan's colour as a bar across the top of the card.
            Container(height: 4, color: theme),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 14, 15),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _planHeading(plan, theme, isActiveHere),
                        if (groups.regular.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          _featureWrap(groups.regular, theme),
                        ],
                        if (groups.content.isNotEmpty ||
                            groups.chat.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              if (groups.content.isNotEmpty)
                                _expander(
                                  Ionicons.cloud_upload_outline,
                                  'Content Upload',
                                  theme,
                                  contentOpen,
                                  () => setState(() {
                                    if (id == null) return;
                                    contentOpen
                                        ? _openContent.remove(id)
                                        : _openContent.add(id);
                                  }),
                                ),
                              if (groups.chat.isNotEmpty)
                                _expander(
                                  Ionicons.chatbubbles_outline,
                                  'Chat features',
                                  theme,
                                  chatOpen,
                                  () => setState(() {
                                    if (id == null) return;
                                    chatOpen
                                        ? _openChat.remove(id)
                                        : _openChat.add(id);
                                  }),
                                ),
                            ],
                          ),
                          if (contentOpen) ...[
                            const SizedBox(height: 8),
                            _featureWrap(groups.content, theme),
                          ],
                          if (chatOpen) ...[
                            const SizedBox(height: 8),
                            _featureWrap(groups.chat, theme),
                          ],
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  _planSideColumn(theme, isSelected, isActiveHere),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _planHeading(Map<String, dynamic> plan, Color theme, bool active) {
    final badgeTickColor = _badgeTickColorOf(plan);
    return Wrap(
      spacing: 10,
      runSpacing: 5,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '${plan['name'] ?? 'Plan'}',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: theme,
              ),
            ),
            if (plan['verified_tick'] == true) ...[
              const SizedBox(width: 5),
              _verifiedPlanBadge(theme, badgeTickColor),
            ],
          ],
        ),
        RichText(
          text: TextSpan(
            children: [
              TextSpan(
                text: 'R ${_priceOf(plan).toStringAsFixed(0)}',
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              TextSpan(
                text: ' / ${_intervalOf(plan)}',
                style: TextStyle(
                  fontSize: 12.5,
                  color: Colors.white.withValues(alpha: 0.5),
                ),
              ),
            ],
          ),
        ),
        if (active)
          _pill(
            _inGrace ? 'Expired' : 'Active',
            _inGrace ? const Color(0xFFFCA5A5) : AppColors.successGreen,
          ),
      ],
    );
  }

  Widget _verifiedPlanBadge(Color color, Color tickColor) {
    return CustomPaint(
      size: const Size.square(14),
      painter: _VerifiedPlanBadgePainter(color: color, tickColor: tickColor),
    );
  }

  /// The tick/radio, plus the auto-renew switch and term dates on the plan the
  /// account is actually running.
  Widget _planSideColumn(Color theme, bool isSelected, bool isActiveHere) {
    final sub = _sub;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isSelected)
          Container(
            width: 20,
            height: 20,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: theme, shape: BoxShape.circle),
            child: const Icon(
              Ionicons.checkmark,
              size: 12,
              color: Colors.white,
            ),
          )
        else
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: theme.withValues(alpha: 0.55),
                width: 2,
              ),
            ),
          ),
        if (isActiveHere && sub != null) ...[
          const SizedBox(height: 8),
          _renewSwitch(),
          const SizedBox(height: 4),
          Text(
            'Auto-renew ${_autoRenew ? 'ON' : 'OFF'}',
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: _autoRenew
                  ? AppColors.successGreen
                  : AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            'Start: ${_date(sub['started_at'])}',
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: 9,
              height: 1.5,
              color: Colors.white.withValues(alpha: 0.4),
            ),
          ),
          Text(
            '${_inGrace ? 'Expired' : 'Ends'}: ${_date(sub['expires_at'])}',
            textAlign: TextAlign.right,
            style: TextStyle(
              fontSize: 9,
              height: 1.5,
              color: Colors.white.withValues(alpha: 0.4),
            ),
          ),
        ],
      ],
    );
  }

  /// Hand-drawn rather than a Material `Switch`: the web pill is 36x20 and a
  /// stock Switch brings ~20px of tap padding that pushes the dates off-card.
  Widget _renewSwitch() {
    return GestureDetector(
      onTap: _togglingRenew ? null : () => _toggleAutoRenew(!_autoRenew),
      child: Container(
        width: 36,
        height: 20,
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: _autoRenew ? const Color(0xFF22C55E) : const Color(0xFF374151),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Align(
          alignment: _autoRenew ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 16,
            height: 16,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }

  Widget _featureWrap(List<String> features, Color theme) {
    return Wrap(
      spacing: 12,
      runSpacing: 5,
      children: [
        for (final feature in features)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Ionicons.checkmark_outline, size: 12, color: theme),
              const SizedBox(width: 4),
              Text(
                feature,
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.white.withValues(alpha: 0.65),
                ),
              ),
            ],
          ),
      ],
    );
  }

  Widget _expander(
    IconData icon,
    String label,
    Color theme,
    bool open,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 28,
        padding: const EdgeInsets.symmetric(horizontal: 11),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: _webBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12, color: theme),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: Colors.white.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(width: 6),
            Icon(
              open
                  ? Ionicons.chevron_up_outline
                  : Ionicons.chevron_down_outline,
              size: 11,
              color: Colors.white.withValues(alpha: 0.45),
            ),
          ],
        ),
      ),
    );
  }

  /// Cancel on the running plan, otherwise the upgrade/downgrade/switch call
  /// to action — the same wording the web derives from the two prices.
  Widget _actionCard() {
    final plan = _selectedPlan;
    final label = _selectedIsActive
        ? (_cancelling ? 'Updating...' : 'Cancel Subscription')
        : _busyPlanId != null
        ? 'Processing...'
        : _switchLabel(plan);

    final busy =
        _cancelling ||
        _busyPlanId != null ||
        (!_selectedIsActive && plan == null);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _webBorder),
      ),
      child: Column(
        children: [
          Opacity(
            opacity: busy ? 0.5 : 1,
            child: GestureDetector(
              onTap: busy
                  ? null
                  : () => _selectedIsActive
                        ? _cancel()
                        : _confirmSubscribe(plan!),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 34,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: AppColors.likeRed,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.1,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
          if (_hasPaidPlan && !_selectedIsActive && plan != null) ...[
            const SizedBox(height: 10),
            Text(
              'This will switch from your current '
              '${_sub?['plan_name'] ?? 'plan'} plan to the selected plan now.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 10,
                height: 1.5,
                color: const Color(0xFFFCD34D).withValues(alpha: 0.8),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _switchLabel(Map<String, dynamic>? plan) {
    if (plan == null || !_hasPaidPlan) return 'Subscribe & Pay Now';
    if (_inGrace && _idOf(plan) == _activePlanId) {
      return 'Pay & Renew ${plan['name'] ?? ''}'.trim();
    }
    final activePrice = _plans
        .where((p) => _idOf(p) == _activePlanId)
        .map(_priceOf)
        .fold<double>(0, (a, b) => b);
    final next = _priceOf(plan);
    if (next > activePrice) return 'Upgrade to ${plan['name'] ?? ''}'.trim();
    if (next < activePrice) return 'Downgrade to ${plan['name'] ?? ''}'.trim();
    return 'Switch to ${plan['name'] ?? ''}'.trim();
  }

  Widget _confirmSheetWeb(Map<String, dynamic> plan) {
    final selectedPrice = _priceOf(plan);
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
        decoration: BoxDecoration(
          color: const Color(0xFF070707),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: _webBorder),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Confirm Payment',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.pop(context, false),
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: _webBorder),
                      color: Colors.white.withValues(alpha: 0.03),
                    ),
                    child: const Icon(
                      Ionicons.close_outline,
                      size: 18,
                      color: Color(0xCCFFFFFF),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _confirmBalanceCard(Api.balance),
            const SizedBox(height: 10),
            _confirmPlanCard(plan, selectedPrice),
            const SizedBox(height: 14),
            Center(
              child: SizedBox(
                width: 150,
                height: 40,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(context, true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.likeRed,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(9999),
                    ),
                  ),
                  child: const Text(
                    'Pay Now',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _confirmBalanceCard(double balance) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A0A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'WALLET BALANCE',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.2,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const RupeeCoin(size: 22),
              const SizedBox(width: 8),
              Text(
                balance.toStringAsFixed(2),
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w700,
                  height: 1,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _confirmPlanCard(Map<String, dynamic> plan, double price) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: const Color(0xFF0A0A0A),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'SELECTED PLAN',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${plan['name'] ?? 'Plan'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _intervalOf(plan),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.white.withValues(alpha: 0.55),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const Text(
                'TOTAL',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                  color: AppColors.textGray500,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'R ${price.toStringAsFixed(0)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 21,
                  height: 1,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ignore: unused_element
  Widget _confirmSheet(Map<String, dynamic> plan) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
        decoration: BoxDecoration(
          color: const Color(0xFF070707),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: _webBorder),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Confirm Payment',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.pop(context, false),
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    width: 34,
                    height: 34,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: _webBorder),
                      color: Colors.white.withValues(alpha: 0.03),
                    ),
                    child: const Icon(
                      Ionicons.close_outline,
                      size: 18,
                      color: Color(0xCCFFFFFF),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _kv('PLAN', '${plan['name'] ?? '—'}'),
            const SizedBox(height: 8),
            _kv('BILLING', _intervalOf(plan)),
            const SizedBox(height: 8),
            _kv('TOTAL', '${formatMoney(_priceOf(plan))} coins'),
            const SizedBox(height: 8),
            _kv('WALLET', '${formatMoney(Api.balance)} coins'),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(9999),
                  ),
                ),
                child: const Text(
                  'PAY NOW',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text(
                  'CANCEL',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                    color: AppColors.textGray500,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /* ── small pieces ── */

  Widget _kv(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 9.5,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.3,
            color: AppColors.textGray500,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value.trim().isEmpty ? '—' : value,
            textAlign: TextAlign.right,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray200,
            ),
          ),
        ),
      ],
    );
  }

  Widget _pill(String text, Color tint) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(9999),
        border: Border.all(color: tint.withValues(alpha: 0.25)),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: tint,
        ),
      ),
    );
  }

  Widget _emptyBox(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 14),
      decoration: BoxDecoration(
        color: _fieldFill,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _webBorder),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 11.5, color: AppColors.textGray500),
      ),
    );
  }

  static String _date(dynamic iso) {
    final raw = '${iso ?? ''}'.trim();
    return raw.isEmpty ? '—' : Api.postedDate(raw);
  }
}

class _VerifiedPlanBadgePainter extends CustomPainter {
  final Color color;
  final Color tickColor;

  const _VerifiedPlanBadgePainter({
    required this.color,
    required this.tickColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final outer = size.shortestSide / 2;
    final path = Path();
    const points = 24;
    for (var i = 0; i < points; i++) {
      final angle = -pi / 2 + (pi * 2 * i / points);
      final radius = outer * (i.isEven ? 0.98 : 0.83);
      final point = Offset(
        center.dx + cos(angle) * radius,
        center.dy + sin(angle) * radius,
      );
      if (i == 0) {
        path.moveTo(point.dx, point.dy);
      } else {
        path.lineTo(point.dx, point.dy);
      }
    }
    path.close();

    canvas.drawPath(path, Paint()..color = color);

    final tick = Path()
      ..moveTo(size.width * 0.34, size.height * 0.52)
      ..lineTo(size.width * 0.46, size.height * 0.64)
      ..lineTo(size.width * 0.68, size.height * 0.39);
    canvas.drawPath(
      tick,
      Paint()
        ..color = tickColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = size.shortestSide * 0.12
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(covariant _VerifiedPlanBadgePainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.tickColor != tickColor;
}
