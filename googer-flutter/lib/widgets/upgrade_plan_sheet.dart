import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../screens/subscription_screen.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/subscription_limits.dart';

class UpgradePlanSheet {
  static Future<void> show(
    BuildContext context, {
    required String subtitle,
    required String limitMessage,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.72),
      builder: (ctx) =>
          _UpgradePlanSheetBody(subtitle: subtitle, limitMessage: limitMessage),
    );
  }
}

class _UpgradePlanSheetBody extends StatefulWidget {
  final String subtitle;
  final String limitMessage;

  const _UpgradePlanSheetBody({
    required this.subtitle,
    required this.limitMessage,
  });

  @override
  State<_UpgradePlanSheetBody> createState() => _UpgradePlanSheetBodyState();
}

class _UpgradePlanSheetBodyState extends State<_UpgradePlanSheetBody> {
  late final Future<_UpgradePlanData> _data = _loadData();
  int? _selectedId;
  int? _subscribingId;
  var _cancelling = false;

  Future<_UpgradePlanData> _loadData() async {
    final results = await Future.wait([
      Api.publicPlans(),
      Api.mySubscription(),
    ]);
    final plans = (results[0] as List<Map<String, dynamic>>)
        .where(_isPaidPlan)
        .toList();
    final activeSub = results[1] as Map<String, dynamic>?;
    return _UpgradePlanData(plans: plans, activeSub: activeSub);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: DraggableScrollableSheet(
        initialChildSize: 0.86,
        minChildSize: 0.52,
        maxChildSize: 0.94,
        expand: false,
        builder: (context, scrollController) {
          return Container(
            padding: const EdgeInsets.fromLTRB(0, 0, 0, 0),
            decoration: BoxDecoration(
              color: const Color(0xFF0E0E0E),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(28),
              ),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: FutureBuilder<_UpgradePlanData>(
              future: _data,
              builder: (context, snapshot) {
                final data =
                    snapshot.data ??
                    const _UpgradePlanData(
                      plans: <Map<String, dynamic>>[],
                      activeSub: null,
                    );
                final plans = data.plans;
                final activeSub = data.activeSub;
                final activePlanId = _activePlanId(activeSub);
                // ProductPlansModal always starts on the first paid plan. The
                // active plan is still highlighted independently in green.
                _selectedId ??= _firstPlanId(plans);
                final selectedPlan = _selectedPlan(plans);
                final selectedIsActive =
                    selectedPlan != null &&
                    activeSub != null &&
                    activePlanId == _selectedId &&
                    '${activeSub['status'] ?? ''}'.toLowerCase() == 'active';
                return ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Upgrade Your Plan',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        GestureDetector(
                          onTap: () => Navigator.pop(context),
                          child: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.05),
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.15),
                              ),
                            ),
                            child: const Icon(
                              Ionicons.close,
                              size: 16,
                              color: Colors.white70,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.subtitle,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray500,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF261B05),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF8A5A10)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(
                            Ionicons.alert_circle_outline,
                            size: 18,
                            color: Color(0xFFFFD400),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              widget.limitMessage,
                              style: const TextStyle(
                                fontSize: 12,
                                height: 1.4,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFFFFD400),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (snapshot.connectionState == ConnectionState.waiting)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Center(
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        ),
                      )
                    else if (plans.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 34),
                        child: Center(
                          child: Text(
                            'No plans available right now.',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.textGray500,
                            ),
                          ),
                        ),
                      )
                    else
                      for (final plan in plans)
                        _planCard(context, plan, activeSub: activeSub),
                    const SizedBox(height: 12),
                    if (!snapshot.hasData || plans.isEmpty)
                      const SizedBox.shrink()
                    else
                      _actionPanel(
                        context,
                        selectedPlan: selectedPlan,
                        selectedIsActive: selectedIsActive,
                        hasActivePaidPlan: activeSub != null,
                      ),
                  ],
                );
              },
            ),
          );
        },
      ),
    );
  }

  Widget _planCard(
    BuildContext context,
    Map<String, dynamic> plan, {
    required Map<String, dynamic>? activeSub,
  }) {
    final id = int.tryParse('${plan['id'] ?? ''}');
    final name = '${plan['name'] ?? plan['title'] ?? 'Plan'}';
    final price = double.tryParse('${plan['price'] ?? 0}') ?? 0;
    final duration = int.tryParse('${plan['duration_days'] ?? 30}') ?? 30;
    final featureGroups = _featureGroups(plan);
    final accent = _planColor(plan['badge_color'] ?? plan['accent_color']);
    final activePlanId = _activePlanId(activeSub);
    final isActive =
        id != null &&
        activeSub != null &&
        activePlanId == id &&
        '${activeSub['status'] ?? ''}'.toLowerCase() == 'active';
    final isSelected = id != null && _selectedId == id;
    final borderColor = isActive
        ? const Color(0xFF22C55E)
        : isSelected
        ? AppColors.likeRed
        : const Color(0xFF1F2937);
    final busy = id != null && _subscribingId == id;
    return GestureDetector(
      onTap: id == null || isActive
          ? null
          : () => setState(() => _selectedId = id),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: const Color(0xFF070707),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: borderColor,
            width: isActive || isSelected ? 2 : 1,
          ),
          boxShadow: isActive
              ? [
                  BoxShadow(
                    color: const Color(0xFF22C55E).withValues(alpha: 0.18),
                    blurRadius: 18,
                    offset: const Offset(0, 6),
                  ),
                ]
              : null,
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: accent,
                                ),
                              ),
                            ),
                            if (plan['verified_tick'] == true) ...[
                              const SizedBox(width: 4),
                              Icon(Icons.verified, size: 12, color: accent),
                            ],
                            const SizedBox(width: 8),
                            Text(
                              'R ${price.toStringAsFixed(0)}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                              ),
                            ),
                            Text(
                              ' / ${duration}d',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                                color: AppColors.textGray500,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 7),
                        _featureWrap(featureGroups.regular, accent),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      GestureDetector(
                        onTap: id == null || isActive || busy
                            ? null
                            : () => setState(() => _selectedId = id),
                        child: Container(
                          width: 28,
                          height: 28,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: busy
                                ? Colors.white24
                                : isActive
                                ? const Color(0xFF22C55E)
                                : isSelected
                                ? AppColors.likeRed
                                : Colors.transparent,
                            shape: BoxShape.circle,
                            border: isActive || isSelected || busy
                                ? null
                                : Border.all(color: Colors.white30, width: 2),
                          ),
                          child: busy
                              ? const SizedBox(
                                  width: 13,
                                  height: 13,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : isActive || isSelected
                              ? const Icon(
                                  Ionicons.checkmark,
                                  size: 16,
                                  color: Colors.white,
                                )
                              : null,
                        ),
                      ),
                      if (isActive) ...[
                        const SizedBox(height: 14),
                        Text(
                          'Start: ${_formatDate(activeSub['started_at'])}',
                          style: const TextStyle(
                            fontSize: 9,
                            height: 1.15,
                            color: Colors.white38,
                          ),
                        ),
                        Text(
                          'Ends: ${_formatDate(activeSub['expires_at'])}',
                          style: const TextStyle(
                            fontSize: 9,
                            height: 1.15,
                            color: Colors.white38,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _featureWrap(List<String> features, Color accent) {
    return Wrap(
      spacing: 12,
      runSpacing: 5,
      children: [
        for (final feature in features)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Ionicons.checkmark, size: 11, color: accent),
              const SizedBox(width: 4),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 180),
                child: Text(
                  feature,
                  style: const TextStyle(
                    fontSize: 10,
                    height: 1.1,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textGray300,
                  ),
                ),
              ),
            ],
          ),
      ],
    );
  }

  Widget _actionPanel(
    BuildContext context, {
    required Map<String, dynamic>? selectedPlan,
    required bool selectedIsActive,
    required bool hasActivePaidPlan,
  }) {
    final selectedId = int.tryParse('${selectedPlan?['id'] ?? ''}');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF070707),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF1F2937)),
      ),
      child: Column(
        children: [
          SizedBox(
            width: 250,
            child: ElevatedButton(
              onPressed: selectedIsActive
                  ? (_cancelling ? null : _cancelAutoRenew)
                  : selectedId == null || _subscribingId != null
                  ? null
                  : () => _confirmSubscribe(
                      selectedPlan!,
                      switchPlan: hasActivePaidPlan,
                    ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.likeRed,
                foregroundColor: Colors.white,
                disabledBackgroundColor: AppColors.likeRed.withValues(
                  alpha: 0.5,
                ),
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: Text(
                selectedIsActive
                    ? (_cancelling ? 'Updating...' : 'Cancel Subscription')
                    : _subscribingId != null
                    ? 'Processing...'
                    : hasActivePaidPlan
                    ? 'Switch Plan & Pay Now'
                    : 'Subscribe & Pay Now',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
              );
            },
            child: const Text(
              'View all plans',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.textGray500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmSubscribe(
    Map<String, dynamic> plan, {
    required bool switchPlan,
  }) async {
    final id = int.tryParse('${plan['id'] ?? ''}');
    if (id == null) return;
    await Api.refreshProfile();
    if (!mounted) return;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.45),
      builder: (_) => _confirmPaymentSheet(plan),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _subscribingId = id);
    final error = await Api.subscribePlan(id, switchPlan: switchPlan);
    if (!mounted) return;
    setState(() => _subscribingId = null);
    if (error == null) {
      Navigator.pop(context);
      AppNotifications.success('Subscription updated');
    } else {
      AppNotifications.error('Subscription failed', error);
    }
  }

  Widget _confirmPaymentSheet(Map<String, dynamic> plan) {
    final name = '${plan['name'] ?? plan['title'] ?? 'Plan'}'.trim();
    final price = double.tryParse('${plan['price'] ?? 0}') ?? 0;
    var insufficient = false;
    return StatefulBuilder(
      builder: (sheetContext, setSheetState) {
        final shortfall = (price - Api.balance).clamp(0, double.infinity);
        return SafeArea(
          top: false,
          child: Container(
            width: double.infinity,
            margin: const EdgeInsets.all(12),
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            decoration: BoxDecoration(
              color: const Color(0xFF0E0E0E),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: AppColors.borderWhite10),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.55),
                  blurRadius: 28,
                  offset: const Offset(0, -10),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Confirm Payment',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                RichText(
                  text: TextSpan(
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.25,
                      color: AppColors.textGray500,
                      fontWeight: FontWeight.w600,
                    ),
                    children: [
                      const TextSpan(text: 'Subscribing to '),
                      TextSpan(
                        text: name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const TextSpan(text: ' for '),
                      TextSpan(
                        text: 'R ${_formatPriceShort(price)}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                _paymentRow(
                  'Your balance',
                  'R ${Api.balance.toStringAsFixed(2)}',
                ),
                const SizedBox(height: 8),
                _paymentRow('Plan cost', 'R ${price.toStringAsFixed(2)}'),
                if (insufficient) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.likeRed.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.likeRed.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Text(
                      'Insufficient balance. You need R ${shortfall.toStringAsFixed(2)} more.',
                      style: const TextStyle(
                        fontSize: 11,
                        height: 1.3,
                        fontWeight: FontWeight.w700,
                        color: AppColors.likeRed,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: SizedBox(
                        height: 52,
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(sheetContext, false),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.textGray300,
                            side: BorderSide(
                              color: Colors.white.withValues(alpha: 0.12),
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                          child: const Text(
                            'Close',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: SizedBox(
                        height: 52,
                        child: ElevatedButton(
                          onPressed: () {
                            if (Api.balance < price) {
                              setSheetState(() => insufficient = true);
                              return;
                            }
                            Navigator.pop(sheetContext, true);
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.likeRed,
                            foregroundColor: Colors.white,
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                          child: const Text(
                            'Confirm Pay',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
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
        );
      },
    );
  }

  Widget _paymentRow(String label, String value) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray400,
            ),
          ),
        ),
        Text(
          value,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: Colors.white,
          ),
        ),
      ],
    );
  }

  Future<void> _cancelAutoRenew() async {
    setState(() => _cancelling = true);
    final ok = await Api.setAutoRenew(false);
    if (!mounted) return;
    setState(() => _cancelling = false);
    if (ok) {
      Navigator.pop(context);
      AppNotifications.success('Auto-renew turned off');
    } else {
      AppNotifications.error(
        'Subscription failed',
        'Failed to cancel subscription.',
      );
    }
  }

  int? _activePlanId(Map<String, dynamic>? sub) {
    if (sub == null) return null;
    return int.tryParse('${sub['plan_id'] ?? sub['plan']?['id'] ?? ''}');
  }

  int? _firstPlanId(List<Map<String, dynamic>> plans) {
    if (plans.isEmpty) return null;
    return int.tryParse('${plans.first['id'] ?? ''}');
  }

  Map<String, dynamic>? _selectedPlan(List<Map<String, dynamic>> plans) {
    final selectedId = _selectedId;
    if (selectedId == null) return plans.isEmpty ? null : plans.first;
    for (final plan in plans) {
      if (int.tryParse('${plan['id'] ?? ''}') == selectedId) return plan;
    }
    return plans.isEmpty ? null : plans.first;
  }

  String _formatDate(dynamic raw) {
    final value = '$raw'.trim();
    if (value.isEmpty || value == 'null') return '-';
    final parsed = DateTime.tryParse(value);
    if (parsed == null) return value;
    const months = [
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
    return '${months[parsed.month - 1]} ${parsed.day}, ${parsed.year}';
  }

  _PlanFeatureGroups _featureGroups(Map<String, dynamic> plan) {
    final all = _features(plan);
    final extra = _extra(plan);
    final labels = extra['labels'] is Map
        ? Map<String, dynamic>.from(extra['labels'] as Map)
        : const <String, dynamic>{};
    final contentPrefixes = <String>{
      '${labels['content_upload_limit'] ?? 'Upload Content Limit'}:',
      '${labels['content_daily_upload_limit'] ?? 'Daily Uploads'}:',
      '${labels['content_video_limit_minutes'] ?? 'Video Limit'}:',
      '${labels['content_expiry'] ?? 'Upload Content Expiry'}:',
    };
    final regular = <String>[];
    for (final feature in all) {
      if (_isChatFeatureLabel(feature) ||
          contentPrefixes.any(feature.startsWith) ||
          feature.startsWith('Googer Posting Daily:') ||
          feature.startsWith('Googer Posting Total:') ||
          feature.endsWith(' characters per Goog') ||
          feature.startsWith('Upload up to ') ||
          RegExp(r'^\d+(?:\.\d+)? (?:video|photo) ads$').hasMatch(feature) ||
          feature.startsWith('Ads live for ') ||
          feature == 'Free profile ad promotion') {
        continue;
      }
      regular.add(feature);
    }
    return _PlanFeatureGroups(
      regular: regular.take(6).toList(),
      chat: const [],
      content: const [],
    );
  }

  List<String> _features(Map<String, dynamic> plan) {
    final extra = _extra(plan);
    final labels = extra['labels'] is Map
        ? Map<String, dynamic>.from(extra['labels'] as Map)
        : const <String, dynamic>{};
    final raw = plan['features'];
    final rows = raw is List
        ? raw.map((e) => '$e').where(_notBlank).toList()
        : <String>[];
    rows.removeWhere(_isChatFeatureLabel);
    rows.removeWhere(
      (row) => RegExp(
        r'verified\s*(tick|badge)',
        caseSensitive: false,
      ).hasMatch(row),
    );
    rows.removeWhere(_isLegacyPostingLimitLabel);
    if (plan['verified_tick'] == true) {
      rows.insert(0, 'Verification tick');
    }

    final postingDailyLimit =
        num.tryParse(
          '${extra['goog_posting_daily_limit'] ?? extra['write_goog_daily_limit'] ?? 0}',
        ) ??
        0;
    final postingTotalLimit =
        num.tryParse(
          '${extra['goog_posting_total_limit'] ?? plan['googs_limit'] ?? extra['goog_posting_limit'] ?? extra['write_goog_limit'] ?? 0}',
        ) ??
        0;
    final postingRows = [
      postingDailyLimit > 0
          ? 'Googer Posting Daily: ${_formatNumber(postingDailyLimit)}/day'
          : 'Googer Posting Daily: Unlimited/day',
      postingTotalLimit > 0
          ? 'Googer Posting Total: ${_formatNumber(postingTotalLimit)} total'
          : 'Googer Posting Total: Unlimited total',
    ];
    rows.insertAll(plan['verified_tick'] == true ? 1 : 0, postingRows);
    final letterLimit = num.tryParse('${extra['goog_letter_limit'] ?? ''}');
    if (letterLimit != null && letterLimit > 0) {
      rows.add('${_formatNumber(letterLimit)} characters per Goog');
    }
    final productLimit = num.tryParse('${extra['product_upload_limit'] ?? ''}');
    if (productLimit != null && productLimit > 0) {
      rows.add('Upload up to ${_formatNumber(productLimit)} products');
    }
    final videoAds = num.tryParse('${extra['ad_videos'] ?? ''}');
    if (videoAds != null && videoAds > 0) {
      rows.add('${_formatNumber(videoAds)} video ads');
    }
    final photoAds = num.tryParse('${extra['ad_photos'] ?? ''}');
    if (photoAds != null && photoAds > 0) {
      rows.add('${_formatNumber(photoAds)} photo ads');
    }
    if (num.tryParse('${extra['ads_expiry_value'] ?? ''}') != null &&
        (num.tryParse('${extra['ads_expiry_value'] ?? ''}') ?? 0) > 0) {
      rows.add(
        'Ads live for ${extra['ads_expiry_value']} ${extra['ads_expiry_unit'] ?? 'days'}',
      );
    } else if (num.tryParse('${extra['ads_expiry_days'] ?? ''}') != null &&
        (num.tryParse('${extra['ads_expiry_days'] ?? ''}') ?? 0) > 0) {
      rows.add('Ads live for ${extra['ads_expiry_days']} days');
    }
    final isBasic =
        '${plan['slug'] ?? ''}'.toLowerCase() == 'basic' ||
        (num.tryParse('${plan['price'] ?? 0}') ?? 0) == 0;
    final contentUploadLimit = subscriptionContentLimit(
      extra,
      'content_upload_limit',
      isBasic: isBasic,
    );
    if (contentUploadLimit > 0) {
      rows.add(
        '${labels['content_upload_limit'] ?? 'Upload Content Limit'}: '
        '${_formatNumber(contentUploadLimit)}',
      );
    }
    final dailyUploadLimit = subscriptionContentLimit(
      extra,
      'content_daily_upload_limit',
      isBasic: isBasic,
    );
    if (dailyUploadLimit > 0) {
      rows.add(
        '${labels['content_daily_upload_limit'] ?? 'Daily Uploads'}: '
        '${_formatNumber(dailyUploadLimit)}',
      );
    }
    final videoLimit = subscriptionContentLimit(
      extra,
      'content_video_limit_minutes',
      isBasic: isBasic,
    );
    if (videoLimit > 0) {
      rows.add(
        '${labels['content_video_limit_minutes'] ?? 'Video Limit'}: '
        '${_formatVideoLimit(videoLimit)}',
      );
    }
    rows.add(_contentExpiryLabel(extra));

    final manualChat = raw is List
        ? raw
              .map((e) => '$e')
              .where(_isChatFeatureLabel)
              .map(_normalizeChatFeatureLabel)
              .whereType<String>()
              .toList()
        : <String>[];
    rows.addAll(manualChat);

    final textMessaging = extra['text_messaging'];
    final textMessagingText = '${textMessaging ?? ''}';
    if (textMessaging != null && textMessaging != false && textMessaging != 0) {
      rows.add('Text messages');
    }
    if (extra['chat_text_colors'] == true ||
        textMessagingText.contains('colors')) {
      rows.add('Text messaging colors');
    }
    if (extra['chat_stickers'] == true ||
        textMessagingText.contains('stickers')) {
      rows.add('Stickers');
    }
    if (extra['voice_calls'] == true ||
        (extra['voice_calls'] != false && extra['voice_calls'] != null)) {
      rows.add('Voice calls');
    }
    if (extra['video_calls'] == true) {
      final quality = '${extra['video_call_quality'] ?? ''}'.trim();
      final qualityLabel = quality
          .split(',')
          .map((part) => part.trim())
          .where((part) => part.isNotEmpty)
          .join(' & ');
      rows.add(
        qualityLabel.isEmpty ? 'Video calls' : 'Video calls ($qualityLabel)',
      );
    }
    if (_truthy(extra['voice_notes_to_text']) ||
        _truthy(extra['voice_to_text']) ||
        _truthy(extra['speech_to_text']) ||
        _truthy(extra['microphone'])) {
      rows.add('Voice to text');
    }
    if (_truthy(extra['text_to_voice_note']) ||
        _truthy(extra['text_to_voice']) ||
        _truthy(extra['tts']) ||
        _truthy(extra['speech'])) {
      rows.add('Text to voice');
    }
    if (_truthy(extra['free_profile_ad_promo']) ||
        _truthy(extra['free_promo'])) {
      rows.add('Free profile ad promotion');
    }
    return rows.toSet().toList();
  }

  bool _notBlank(String value) => value.trim().isNotEmpty;

  bool _isChatFeatureLabel(String label) {
    final normalized = label.toLowerCase();
    return normalized.contains('chat') ||
        normalized.contains('message') ||
        normalized.contains('text messaging') ||
        normalized.contains('colored text') ||
        normalized.contains('text color') ||
        normalized.contains('voice note') ||
        normalized.contains('voice to text') ||
        normalized.contains('text to voice') ||
        normalized.contains('voice call') ||
        normalized.contains('video call') ||
        normalized.contains('sticker') ||
        normalized.contains('auto delete') ||
        normalized.contains('history kept') ||
        normalized.contains('lifetime history');
  }

  String? _normalizeChatFeatureLabel(String label) {
    final cleaned = label
        .replaceFirst(
          RegExp(r'^chat\s*features?\s*:?\s*', caseSensitive: false),
          '',
        )
        .replaceFirst(RegExp(r'^chat\s*:?\s*', caseSensitive: false), '')
        .trim();
    final normalized = cleaned.toLowerCase();
    if (cleaned.isEmpty ||
        normalized == 'features' ||
        normalized.contains('auto delete') ||
        normalized.contains('history kept') ||
        normalized.contains('lifetime history')) {
      return null;
    }
    if (normalized.contains('voice note') && normalized.contains('text')) {
      return 'Voice notes to text';
    }
    if (normalized.contains('voice to text')) return 'Voice to text';
    if (normalized.contains('text to voice')) return 'Text to voice';
    if (normalized.contains('text messaging') && normalized.contains('color')) {
      return 'Text messaging colors';
    }
    if (normalized.contains('colored text') ||
        normalized.contains('text color')) {
      return 'Colored text';
    }
    if (normalized.contains('text messaging') ||
        normalized.contains('message')) {
      return 'Text messages';
    }
    if (normalized.contains('voice call')) return 'Voice calls';
    if (normalized.contains('video call')) return cleaned;
    if (normalized.contains('sticker')) return 'Stickers';
    return cleaned;
  }

  bool _isLegacyPostingLimitLabel(String label) {
    return RegExp(
      r'^goog(?:er)?\s+posting\s+limit\b',
      caseSensitive: false,
    ).hasMatch(label.trim());
  }

  String _contentExpiryLabel(Map<String, dynamic> extra) {
    final labels = extra['labels'] is Map
        ? Map<String, dynamic>.from(extra['labels'] as Map)
        : const <String, dynamic>{};
    final unit = '${extra['content_expiry_unit'] ?? 'unlimited'}';
    final name = '${labels['content_expiry'] ?? 'Upload Content Expiry'}';
    if (unit == 'unlimited') return '$name: Lifetime';
    final value = (num.tryParse('${extra['content_expiry_value'] ?? 1}') ?? 1)
        .round()
        .clamp(1, 1000000);
    return '$name: $value $unit';
  }

  bool _truthy(dynamic v) =>
      v != null && v != false && v != 0 && '$v'.trim().isNotEmpty && v != '0';

  bool _isPaidPlan(Map<String, dynamic> plan) {
    final slug = '${plan['slug'] ?? ''}'.toLowerCase();
    final price = num.tryParse('${plan['price'] ?? 0}') ?? 0;
    return slug != 'basic' && price > 0;
  }

  Map<String, dynamic> _extra(Map<String, dynamic> plan) {
    final extra = plan['extra'];
    if (extra is Map) return Map<String, dynamic>.from(extra);
    if (extra is String && extra.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(extra);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {
        return const {};
      }
    }
    return const {};
  }

  String _formatNumber(num value) =>
      value % 1 == 0 ? value.toInt().toString() : value.toStringAsFixed(2);

  String _formatPriceShort(num value) =>
      value % 1 == 0 ? value.toInt().toString() : value.toStringAsFixed(2);

  String _formatVideoLimit(num minutes) {
    if (minutes < 1) {
      return '${(minutes * 60).round()} sec';
    }
    if (minutes % 1 == 0) return '${minutes.toInt()} min';
    return '${(minutes * 60).round()} sec';
  }

  Color _planColor(dynamic raw) {
    final value = '$raw'.trim().toLowerCase();
    const named = {
      'red': Color(0xFFEF4444),
      'cyan': Color(0xFF06B6D4),
      'blue': Color(0xFF3B82F6),
      'purple': Color(0xFF7E22CE),
      'amber': Color(0xFFF59E0B),
      'silver': Color(0xFFE5E7EB),
    };
    if (named[value] != null) return named[value]!;
    if (value.startsWith('#') && value.length == 7) {
      final hex = int.tryParse(value.substring(1), radix: 16);
      if (hex != null) return Color(0xFF000000 | hex);
    }
    return AppColors.likeRed;
  }
}

class _UpgradePlanData {
  const _UpgradePlanData({required this.plans, required this.activeSub});

  final List<Map<String, dynamic>> plans;
  final Map<String, dynamic>? activeSub;
}

class _PlanFeatureGroups {
  const _PlanFeatureGroups({
    required this.regular,
    required this.chat,
    required this.content,
  });

  final List<String> regular;
  final List<String> chat;
  final List<String> content;
}
