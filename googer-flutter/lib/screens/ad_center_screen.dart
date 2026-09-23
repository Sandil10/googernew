import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../widgets/app_back_button.dart';

/// Wallet · Ad Center — port of the web `dashboard/wallet/ad-center` page:
/// the status filter strip with live counts, then one card per ad carrying its
/// creative, order summary, performance and budget breakdowns.
///
/// Reads `GET /ads/my`; Pause / Resume / Cancel all go through
/// `PUT /ads/:adId {status}`, as they do on the web.
class AdCenterScreen extends StatefulWidget {
  const AdCenterScreen({super.key});

  @override
  State<AdCenterScreen> createState() => _AdCenterScreenState();
}

const _cardBg = Color(0xFF1A1614);
const _panelBg = Color(0xFF0B0B0B);
const _innerBg = Color(0xFF121212);
const _violet = Color(0xFFA78BFA);
const _amber = Color(0xFFFBBF24);
const _sky = Color(0xFF7DD3FC);
const _emerald = Color(0xFF6EE7B7);
const _rose = Color(0xFFFDA4AF);
const _adsPerPage = 5;

/// `STATUS_FILTERS` from the web, in the same order.
const _filters = <(String, IconData)>[
  ('All Ads', Ionicons.receipt_outline),
  ('Under Review', Ionicons.time_outline),
  ('Active', Ionicons.radio_button_on_outline),
  ('Paused', Ionicons.pause_circle_outline),
  ('Completed', Ionicons.checkmark_done_outline),
  ('Cancelled', Ionicons.close_circle_outline),
];

class _AdCenterScreenState extends State<AdCenterScreen> {
  final _tabScroll = ScrollController();

  bool _loading = true;
  String _filter = 'All Ads';
  String? _busyAdId;
  int _currentPage = 1;
  List<Map<String, dynamic>> _ads = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabScroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    final ads = await Api.myAds();
    if (!mounted) return;
    setState(() {
      _ads = [...ads]
        ..sort((a, b) {
          final bDate = Api.parseServerTime(
            _str(b, ['createdAt', 'created_at']),
          );
          final aDate = Api.parseServerTime(
            _str(a, ['createdAt', 'created_at']),
          );
          return (bDate?.millisecondsSinceEpoch ?? 0).compareTo(
            aDate?.millisecondsSinceEpoch ?? 0,
          );
        });
      _currentPage = 1;
      _loading = false;
    });
  }

  /* ── row reading ── */

  static String _str(Map ad, List<String> keys, [String fallback = '']) {
    for (final key in keys) {
      final value = '${ad[key] ?? ''}'.trim();
      if (value.isNotEmpty && value != 'null') return value;
    }
    return fallback;
  }

  static double _num(Map ad, List<String> keys) {
    for (final key in keys) {
      final value = double.tryParse('${ad[key] ?? ''}');
      if (value != null) return value;
    }
    return 0;
  }

  static String _statusOf(Map ad) {
    final raw = _str(ad, ['status'], 'Under Review').toLowerCase();
    for (final (label, _) in _filters) {
      if (label.toLowerCase() == raw) return label;
    }
    if (raw == 'expired') return 'Expired';
    if (raw == 'removed') return 'Cancelled';
    return _str(ad, ['status'], 'Under Review');
  }

  /// The web shows the last ten characters of the ad id.
  static String _displayId(Map ad) {
    final id = _str(ad, ['adId', 'ad_id', 'id']);
    return id.length <= 10 ? id : id.substring(id.length - 10);
  }

  /// Thousands-separated, matching `formatReachCount`.
  static String _count(num value) {
    final digits = value.round().abs().toString();
    final buffer = StringBuffer(value < 0 ? '-' : '');
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
      buffer.write(digits[i]);
    }
    return buffer.toString();
  }

  /// Free ads print "Free" rather than `R 0` — `formatAdMoney`.
  static String _money(Map ad, double value) {
    final promoFree = _str(ad, ['promoCode', 'promo_code']).isNotEmpty;
    if (value <= 0 && promoFree) return 'Free';
    if (value <= 0 && _num(ad, ['budget']) <= 0) return 'Free';
    return 'R ${_count(value)}';
  }

  int _countFor(String filter) => filter == 'All Ads'
      ? _ads.length
      : _ads.where((ad) => _statusOf(ad) == filter).length;

  List<Map<String, dynamic>> get _visible => _filter == 'All Ads'
      ? _ads
      : _ads.where((ad) => _statusOf(ad) == _filter).toList();

  List<Map<String, dynamic>> get _pagedVisible {
    final visible = _visible;
    final start = ((_currentPage - 1) * _adsPerPage).clamp(0, visible.length);
    final end = (start + _adsPerPage).clamp(0, visible.length);
    return visible.sublist(start, end);
  }

  int get _totalPages {
    final total = (_visible.length / _adsPerPage).ceil();
    return total <= 0 ? 1 : total;
  }

  static Color _statusTint(String status) => switch (status) {
    'Active' => AppColors.successGreen,
    'Paused' => _sky,
    'Under Review' => _amber,
    'Completed' => _violet,
    'Expired' => _violet,
    'Cancelled' => _rose,
    _ => AppColors.textGray400,
  };

  /* ── actions ── */

  Future<void> _setStatus(Map<String, dynamic> ad, String status) async {
    final adId = _str(ad, ['adId', 'ad_id', 'id']);
    if (adId.isEmpty || _busyAdId != null) return;
    setState(() => _busyAdId = adId);
    final error = await Api.setAdStatus(adId, status);
    if (!mounted) return;
    setState(() => _busyAdId = null);
    if (error != null) {
      AppNotifications.error('Could not update ad', error);
      return;
    }
    AppNotifications.success('Ad ${status.toLowerCase()}');
    await _load();
  }

  Future<void> _confirmCancel(Map<String, dynamic> ad) async {
    final status = _statusOf(ad);
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.bg1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        title: const Text(
          'Cancel this ad?',
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        content: Text(
          _cancelMessage(ad, status),
          style: const TextStyle(
            fontSize: 12,
            height: 1.5,
            color: AppColors.textGray400,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text(
              'KEEP IT',
              style: TextStyle(fontSize: 11, color: AppColors.textGray400),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text(
              'CANCEL AD',
              style: TextStyle(fontSize: 11, color: AppColors.likeRed),
            ),
          ),
        ],
      ),
    );
    if (ok == true) {
      await _setStatus(
        ad,
        status == 'Active' || status == 'Paused' ? 'Removed' : 'Cancelled',
      );
    }
  }

  static bool _supportsRemainingBudgetRefund(String campaignType) {
    final normalized = campaignType.trim().toLowerCase();
    return normalized == 'product promote' ||
        normalized == 'photo promote' ||
        normalized == 'video promote' ||
        normalized == 'photo and video' ||
        normalized == 'photo & video';
  }

  static String _cancelMessage(Map ad, String status) {
    final campaignType = _str(ad, ['campaignType', 'campaign_type']);
    if (status == 'Active' || status == 'Paused') {
      return 'This will remove the ad from Home and Shop feeds only. It will stay visible in your Profile Googer section until its real expiry date.';
    }
    if (status == 'Under Review') {
      return 'This will cancel your ad while it is still under review. Your payment will be automatically refunded.';
    }
    if (_supportsRemainingBudgetRefund(campaignType)) {
      return 'This will cancel your active ad and refund only the current remaining budget amount.';
    }
    return 'This will cancel your ad immediately. Because this ad is no longer under review, no refund will be given.';
  }

  /* ── build ── */

  @override
  Widget build(BuildContext context) {
    final ads = _pagedVisible;
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
              const AppBackButton(),
              const SizedBox(height: 16),
              Text(
                'AD CENTER',
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 2.2,
                  fontWeight: FontWeight.w600,
                  color: Colors.white.withValues(alpha: 0.4),
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Published Ads',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 18),
              _filterStrip(),
              const SizedBox(height: 18),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 70),
                  child: Center(
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.textGray400,
                      ),
                    ),
                  ),
                )
              else if (ads.isEmpty)
                _emptyState()
              else
                for (final ad in ads) ...[
                  _adCard(ad),
                  const SizedBox(height: 16),
                ],
              if (!_loading && _visible.length > _adsPerPage) _pagination(),
            ],
          ),
        ),
      ),
    );
  }

  /// Arrow, scrolling pill row, arrow — the same control the web renders on
  /// narrow screens.
  Widget _filterStrip() {
    void nudge(double delta) => _tabScroll.animateTo(
      (_tabScroll.offset + delta).clamp(0, _tabScroll.position.maxScrollExtent),
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );

    return Row(
      children: [
        _arrow(Ionicons.chevron_back, () => nudge(-150)),
        const SizedBox(width: 8),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
            ),
            child: SingleChildScrollView(
              controller: _tabScroll,
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final (label, icon) in _filters) ...[
                    _filterPill(label, icon),
                    if (label != _filters.last.$1) const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        _arrow(Ionicons.chevron_forward, () => nudge(150)),
      ],
    );
  }

  Widget _arrow(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: const Color(0xFF1F2937).withValues(alpha: 0.4),
          shape: BoxShape.circle,
          border: Border.all(
            color: const Color(0xFF374151).withValues(alpha: 0.5),
          ),
        ),
        child: Icon(icon, size: 16, color: Colors.white),
      ),
    );
  }

  Widget _filterPill(String label, IconData icon) {
    final active = _filter == label;
    return GestureDetector(
      onTap: () => setState(() {
        _filter = label;
        _currentPage = 1;
      }),
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: active ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 13,
              color: active ? Colors.black : AppColors.linkBlue,
            ),
            const SizedBox(width: 7),
            Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.1,
                fontWeight: FontWeight.w600,
                color: active ? Colors.black : AppColors.linkBlue,
              ),
            ),
            const SizedBox(width: 7),
            Container(
              constraints: const BoxConstraints(minWidth: 20),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: active
                    ? Colors.black.withValues(alpha: 0.1)
                    : Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '${_countFor(label)}',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: active
                      ? Colors.black
                      : Colors.white.withValues(alpha: 0.7),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _pagination() {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _pageButton(
            'Previous',
            _currentPage > 1
                ? () => setState(() => _currentPage = _currentPage - 1)
                : null,
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'Page $_currentPage / $_totalPages',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 1,
                color: Colors.white.withValues(alpha: 0.45),
              ),
            ),
          ),
          _pageButton(
            'Next',
            _currentPage < _totalPages
                ? () => setState(() => _currentPage = _currentPage + 1)
                : null,
          ),
        ],
      ),
    );
  }

  Widget _pageButton(String label, VoidCallback? onTap) {
    return Opacity(
      opacity: onTap == null ? 0.35 : 1,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          height: 40,
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: Colors.white.withValues(alpha: 0.7),
            ),
          ),
        ),
      ),
    );
  }

  Widget _emptyState() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 70, horizontal: 24),
      decoration: BoxDecoration(
        color: const Color(0xFF070707),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.1),
          style: BorderStyle.solid,
        ),
      ),
      child: Column(
        children: [
          Icon(
            Ionicons.megaphone_outline,
            size: 46,
            color: Colors.white.withValues(alpha: 0.15),
          ),
          const SizedBox(height: 16),
          Text(
            'NO ADS IN THIS SECTION',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              letterSpacing: 1.8,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.34),
            ),
          ),
        ],
      ),
    );
  }

  /* ── one ad ── */

  Widget _adCard(Map<String, dynamic> ad) {
    final status = _statusOf(ad);
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: _cardBg,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _adHeader(ad),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 14, 12, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _creativePanel(ad, status),
                const SizedBox(height: 12),
                _panel('Order Summary', [
                  ('Total Budget', _money(ad, _num(ad, ['budget'])), null),
                  ('Duration', _durationLabel(ad, status), null),
                  ('Age', _ageLabel(ad), null),
                  (
                    'Gender',
                    _str(ad, ['genderTarget', 'gender_target'], 'All'),
                    null,
                  ),
                  ('Estimated Reach', _reachLabel(ad), null),
                ], dividerBeforeLast: true),
                const SizedBox(height: 8),
                _panel('Ad Performance', [
                  (
                    'Start',
                    _timeLabel(ad, [
                      'activeStartTime',
                      'startedAt',
                    ], 'Not started'),
                    null,
                  ),
                  ('End', _endLabel(ad), null),
                  ('Remaining', _remainingLabel(ad, status), null),
                  (
                    'Views',
                    _count(_num(ad, ['views_count', 'viewCount', 'reach'])),
                    null,
                  ),
                  (
                    'Impressions',
                    _count(_num(ad, ['impressions', 'impressions_count'])),
                    null,
                  ),
                  ('Reach', _count(_num(ad, ['reach', 'currentReach'])), null),
                  ('Clicks', _count(_num(ad, ['clicks'])), null),
                ]),
                const SizedBox(height: 8),
                _panel('Budget', [
                  ('Budget', _money(ad, _num(ad, ['budget'])), null),
                  ('Spend', _money(ad, _num(ad, ['spend'])), null),
                  (
                    'Remaining',
                    _money(
                      ad,
                      _num(ad, ['remainingBudget', 'remaining_budget']),
                    ),
                    null,
                  ),
                  ('Status', status.toUpperCase(), _statusTint(status)),
                ], dividerBeforeLast: true),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _adHeader(Map<String, dynamic> ad) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Icon(
                  Ionicons.megaphone_outline,
                  size: 18,
                  color: Colors.white.withValues(alpha: 0.5),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Ad ID: ${_displayId(ad)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        letterSpacing: 0.5,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_str(ad, ['campaignType', 'campaign_type'], 'Ad Campaign').toUpperCase()}'
                      ' - ${_publishedLabel(ad)}',
                      style: TextStyle(
                        fontSize: 9,
                        height: 1.5,
                        letterSpacing: 0.6,
                        fontWeight: FontWeight.w600,
                        color: Colors.white.withValues(alpha: 0.35),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'IMPRESSIONS',
                      style: TextStyle(
                        fontSize: 8,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                        color: Colors.white.withValues(alpha: 0.28),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Ionicons.eye_outline,
                          size: 13,
                          color: Colors.white.withValues(alpha: 0.65),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _count(
                            _num(ad, ['impressions', 'impressions_count']),
                          ),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'TOTAL BUDGET',
                      style: TextStyle(
                        fontSize: 8,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                        color: Colors.white.withValues(alpha: 0.28),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _money(ad, _num(ad, ['budget'])),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _iconButton(
                Ionicons.stats_chart,
                _violet,
                const Color(0x14A78BFA),
                const Color(0x33A78BFA),
                () => _showAnalytics(ad),
              ),
              const SizedBox(width: 6),
              _iconButton(
                Ionicons.eye_outline,
                Colors.white.withValues(alpha: 0.65),
                Colors.white.withValues(alpha: 0.04),
                AppColors.borderWhite10,
                () => _showAnalytics(ad),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _iconButton(
    IconData icon,
    Color tint,
    Color fill,
    Color border,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border),
        ),
        child: Icon(icon, size: 16, color: tint),
      ),
    );
  }

  /// The creative preview and the status actions beside it.
  Widget _creativePanel(Map<String, dynamic> ad, String status) {
    final thumb = _str(ad, ['mediaPreview', 'media_preview']);
    final title = _str(ad, ['title', 'topic'], 'Untitled');
    final description = _str(ad, ['description']);
    final actions = _actionsFor(ad, status);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _innerBg,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: SizedBox(
                  width: 56,
                  height: 56,
                  child: thumb.isEmpty
                      ? Container(
                          color: Colors.white.withValues(alpha: 0.04),
                          alignment: Alignment.center,
                          child: Icon(
                            Ionicons.image_outline,
                            size: 18,
                            color: Colors.white.withValues(alpha: 0.3),
                          ),
                        )
                      : Image.network(
                          thumb,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: Colors.white.withValues(alpha: 0.04),
                            alignment: Alignment.center,
                            child: Icon(
                              Ionicons.image_outline,
                              size: 18,
                              color: Colors.white.withValues(alpha: 0.3),
                            ),
                          ),
                        ),
                ),
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
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      description.isEmpty
                          ? 'No description added.'
                          : description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11.5,
                        height: 1.4,
                        color: Colors.white.withValues(alpha: 0.55),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(
                          Ionicons.location_outline,
                          size: 11,
                          color: Colors.white.withValues(alpha: 0.35),
                        ),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            _locationLabel(ad),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 10,
                              letterSpacing: 0.8,
                              fontWeight: FontWeight.w600,
                              color: Colors.white.withValues(alpha: 0.35),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                for (final action in actions) ...[
                  _actionButton(action.$1, action.$2, action.$3),
                  if (action != actions.last) const SizedBox(width: 8),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// Pause on a running ad, Resume on a paused one, Edit while under review,
  /// and Cancel on anything not already finished — the web's rules.
  List<(String, Color, VoidCallback)> _actionsFor(
    Map<String, dynamic> ad,
    String status,
  ) {
    final actions = <(String, Color, VoidCallback)>[];
    if (status == 'Active') {
      actions.add(('PAUSE', _sky, () => _setStatus(ad, 'Paused')));
    } else if (status == 'Paused') {
      actions.add(('RESUME', _emerald, () => _setStatus(ad, 'Active')));
    }
    if (status == 'Under Review') {
      actions.add((
        'EDIT',
        _amber,
        () => AppNotifications.info(
          'Edit from the campaign builder',
          'Open the + menu and pick this campaign type to change it.',
        ),
      ));
    }
    if (status == 'Under Review' || status == 'Active' || status == 'Paused') {
      actions.add((
        'CANCEL',
        Colors.white.withValues(alpha: 0.7),
        () => _confirmCancel(ad),
      ));
    }
    return actions;
  }

  Widget _actionButton(String label, Color tint, VoidCallback onTap) {
    final disabled = _busyAdId != null;
    return Opacity(
      opacity: disabled ? 0.5 : 1,
      child: GestureDetector(
        onTap: disabled ? null : onTap,
        child: Container(
          constraints: const BoxConstraints(minWidth: 76),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: tint.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: tint.withValues(alpha: 0.2)),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1,
              fontWeight: FontWeight.w600,
              color: tint,
            ),
          ),
        ),
      ),
    );
  }

  /// One of the three labelled breakdown blocks. A non-null tint renders the
  /// value as a status pill instead of plain text.
  Widget _panel(
    String title,
    List<(String, String, Color?)> rows, {
    bool dividerBeforeLast = false,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: _panelBg,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: TextStyle(
              fontSize: 8,
              letterSpacing: 1,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.38),
            ),
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < rows.length; i++) ...[
            if (dividerBeforeLast && i == rows.length - 1) ...[
              const SizedBox(height: 4),
              Divider(height: 1, color: Colors.white.withValues(alpha: 0.08)),
              const SizedBox(height: 6),
            ],
            _panelRow(rows[i].$1, rows[i].$2, rows[i].$3),
            if (i != rows.length - 1) const SizedBox(height: 5),
          ],
        ],
      ),
    );
  }

  Widget _panelRow(String label, String value, Color? tint) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            color: Colors.white.withValues(alpha: 0.55),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: tint == null
              ? Text(
                  value,
                  textAlign: TextAlign.right,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                )
              : Align(
                  alignment: Alignment.centerRight,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: tint.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: tint.withValues(alpha: 0.35)),
                    ),
                    child: Text(
                      value,
                      style: TextStyle(
                        fontSize: 8.5,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w600,
                        color: tint,
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }

  /* ── labels ── */

  static String _ageLabel(Map ad) {
    final min = _num(ad, ['ageMin', 'age_min']).round();
    final max = _num(ad, ['ageMax', 'age_max']).round();
    if (min <= 0 && max <= 0) return 'All';
    return '$min-$max';
  }

  static String _reachLabel(Map ad) {
    final min = _num(ad, ['estimatedReachMin', 'estimated_reach_min']);
    final max = _num(ad, ['estimatedReachMax', 'estimated_reach_max']);
    if (min <= 0 && max <= 0) return '—';
    if (max <= 0) return _count(min);
    return '${_count(min)} - ${_count(max)}';
  }

  static String _locationLabel(Map ad) {
    final value = _str(ad, [
      'countryLabel',
      'country_label',
      'locationLabel',
      'country',
      'selectedCountryCode',
    ]);
    return value.isEmpty ? 'Worldwide' : value.toUpperCase();
  }

  String _durationLabel(Map ad, String status) {
    final days = _num(ad, ['durationDays', 'duration_days']).round();
    if (days <= 0) return '0 days';
    final unit = days == 1 ? 'day' : 'days';
    if (status == 'Under Review') return '$days $unit';
    if (status == 'Completed' || status == 'Cancelled') {
      return '0 of $days $unit left';
    }
    final remainingMs = _num(ad, [
      'durationRemainingMs',
      'duration_remaining_ms',
    ]);
    return '${_relative(remainingMs)} left';
  }

  String _remainingLabel(Map ad, String status) {
    if (status == 'Under Review') return 'Under Review';
    if (status == 'Cancelled') return 'Cancelled';
    if (status == 'Completed') return 'Completed';
    final remainingMs = _num(ad, [
      'durationRemainingMs',
      'duration_remaining_ms',
    ]);
    return remainingMs <= 0 ? 'Completed' : _relative(remainingMs);
  }

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

  /// `05 Jul 2026, 13:01` — the shape the web's `formatDateTimeLabel` prints.
  static String _dateTime(String iso) {
    final at = Api.parseServerTime(iso);
    if (at == null) return iso.split('T').first;
    final day = at.day.toString().padLeft(2, '0');
    final hour = at.hour.toString().padLeft(2, '0');
    final minute = at.minute.toString().padLeft(2, '0');
    return '$day ${_months[at.month - 1]} ${at.year}, $hour:$minute';
  }

  static String _timeLabel(Map ad, List<String> keys, String fallback) {
    final raw = _str(ad, keys);
    return raw.isEmpty ? fallback : _dateTime(raw);
  }

  String _endLabel(Map ad) {
    final start = _str(ad, [
      'activeStartTime',
      'startedAt',
      'active_start_time',
    ]);
    final totalMs = _num(ad, ['durationTotalMs', 'duration_total_ms']);
    if (start.isEmpty || totalMs <= 0) return 'Not set';
    final startAt = DateTime.tryParse(start);
    if (startAt == null) return 'Not set';
    return _dateTime(
      startAt.add(Duration(milliseconds: totalMs.round())).toIso8601String(),
    );
  }

  String _publishedLabel(Map ad) {
    final started = _str(ad, ['activeStartTime', 'active_start_time']);
    final label = started.isEmpty ? 'CREATED' : 'PUBLISHED';
    final source = started.isNotEmpty
        ? started
        : _str(ad, ['publishedAt', 'published_at', 'createdAt', 'created_at']);
    if (source.isEmpty) return '$label: UNKNOWN TIME';
    final at = DateTime.tryParse(source);
    final elapsed = at == null
        ? ''
        : ' (${_relative(DateTime.now().difference(at).inMilliseconds.toDouble())} AGO)';
    return '$label: ${_dateTime(source).toUpperCase()}$elapsed';
  }

  /// `formatRelativeDuration` — the largest two units that fit.
  static String _relative(double ms) {
    final total = ms <= 0 ? 0 : ms.round();
    final seconds = total ~/ 1000;
    final days = seconds ~/ 86400;
    final hours = (seconds % 86400) ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    if (days > 0) return hours > 0 ? '${days}d ${hours}h' : '${days}d';
    if (hours > 0) return minutes > 0 ? '${hours}h ${minutes}m' : '${hours}h';
    if (minutes > 0) return '${minutes}m';
    return '${seconds}s';
  }

  /* ── analytics ── */

  void _showAnalytics(Map<String, dynamic> ad) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _AdAnalyticsSheet(
        adId: _str(ad, ['adId', 'ad_id', 'id']),
        adTitle: _str(ad, ['title', 'topic'], 'Untitled'),
        campaignType: _str(ad, ['campaignType', 'campaign_type'], 'Ad'),
      ),
    );
  }
}

enum _AudienceTab { gender, age, locations, interests }

class _AdAnalyticsSheet extends StatefulWidget {
  final String adId;
  final String adTitle;
  final String campaignType;

  const _AdAnalyticsSheet({
    required this.adId,
    required this.adTitle,
    required this.campaignType,
  });

  @override
  State<_AdAnalyticsSheet> createState() => _AdAnalyticsSheetState();
}

class _AdAnalyticsSheetState extends State<_AdAnalyticsSheet> {
  static const _benchView = 60.0;
  static const _benchClick = 1.2;
  static const _benchLike = 2.5;
  static const _cyan = Color(0xFF22D3EE);
  static const _ageCyan = Color(0xFF06B6D4);
  static const _locationBlue = Color(0xFF38BDF8);
  static const _interestPurple = Color(0xFFA78BFA);
  static const _femalePink = Color(0xFFF472B6);

  _AudienceTab _tab = _AudienceTab.gender;
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _analytics;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _analytics = null;
    });
    final data = await Api.adAnalytics(widget.adId);
    if (!mounted) return;
    setState(() {
      _analytics = data;
      _error = data == null ? 'Failed to load analytics' : null;
      _loading = false;
    });
  }

  static double _num(Map map, String key) =>
      double.tryParse('${map[key] ?? 0}') ?? 0;

  static String _count(num value) => _AdCenterScreenState._count(value);

  static double _percent(num part, num total) {
    if (total <= 0) return 0;
    return ((part / total) * 1000).round() / 10;
  }

  static List<({String label, int pct})> _normalize(dynamic raw, String key) {
    if (raw is! List) return const [];
    final rows = raw
        .whereType<Map>()
        .map(
          (row) => (
            label: '${row['label'] ?? ''}'.trim(),
            value: double.tryParse('${row[key] ?? 0}') ?? 0,
          ),
        )
        .where((row) => row.label.isNotEmpty)
        .toList();
    final total = rows.fold<double>(0, (sum, row) => sum + row.value);
    if (total <= 0) return const [];
    final normalized =
        rows
            .map(
              (row) =>
                  (label: row.label, pct: (row.value / total * 100).round()),
            )
            .where((row) => row.pct > 0)
            .toList()
          ..sort((a, b) => b.pct.compareTo(a.pct));
    return normalized;
  }

  Map<String, dynamic> get _totals {
    final value = _analytics?['totals'];
    return value is Map ? Map<String, dynamic>.from(value) : const {};
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.92,
      maxChildSize: 0.96,
      builder: (_, controller) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0A0A0A),
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
          border: Border(top: BorderSide(color: Color(0x14FFFFFF))),
          boxShadow: [
            BoxShadow(
              color: Color(0xCC000000),
              blurRadius: 80,
              offset: Offset(0, -24),
            ),
          ],
        ),
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            _header(),
            Expanded(child: _body(controller)),
            _footer(),
          ],
        ),
      ),
    );
  }

  Widget _header() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0x0FFFFFFF))),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            behavior: HitTestBehavior.opaque,
            child: const Icon(
              Ionicons.chevron_back,
              size: 22,
              color: Colors.white70,
            ),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'Order details',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
          IconButton(
            onPressed: _loading ? null : _load,
            icon: Icon(
              Ionicons.refresh_outline,
              size: 18,
              color: Colors.white.withValues(alpha: _loading ? 0.25 : 0.4),
            ),
          ),
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.05),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
            ),
            child: Icon(
              Ionicons.person_outline,
              size: 15,
              color: Colors.white.withValues(alpha: 0.4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body(ScrollController controller) {
    if (_loading && _analytics == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Ionicons.stats_chart_outline,
              size: 38,
              color: Colors.white.withValues(alpha: 0.25),
            ),
            const SizedBox(height: 12),
            Text(
              'Loading real-time analytics...',
              style: TextStyle(
                fontSize: 12,
                color: Colors.white.withValues(alpha: 0.25),
              ),
            ),
          ],
        ),
      );
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Ionicons.alert_circle_outline, size: 30, color: _rose),
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(fontSize: 12, color: _rose)),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    final totals = _totals;
    final impressions = _num(totals, 'impressions');
    final views = _num(totals, 'views');
    final reach = _num(totals, 'reach');
    final clicks = _num(totals, 'clicks');
    final likes = _num(totals, 'likes');
    final base = impressions <= 0 ? 1 : impressions;

    return ListView(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        _adPill(),
        const SizedBox(height: 20),
        _rateGrid(
          viewRate: _percent(views, base),
          reachRate: _percent(reach, base),
          clickRate: _percent(clicks, base),
          likeRate: _percent(likes, base),
          views: views,
          reach: reach,
          impressions: impressions,
          clicks: clicks,
          likes: likes,
        ),
        const SizedBox(height: 24),
        const Text(
          'Audience insights',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 16),
        _tabs(),
        const SizedBox(height: 42),
        _audienceBody(totals),
      ],
    );
  }

  Widget _adPill() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Row(
        children: [
          Icon(
            Ionicons.megaphone_outline,
            size: 16,
            color: _cyan.withValues(alpha: 0.7),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.adTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${widget.campaignType.toUpperCase()} · ${widget.adId}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withValues(alpha: 0.3),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _rateGrid({
    required double viewRate,
    required double reachRate,
    required double clickRate,
    required double likeRate,
    required double views,
    required double reach,
    required double impressions,
    required double clicks,
    required double likes,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.02),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(child: _metricTile('View rate', viewRate, _benchView)),
              _divider(vertical: true),
              Expanded(child: _metricTile('Reach rate', reachRate, _benchView)),
            ],
          ),
          _divider(),
          Row(
            children: [
              Expanded(
                child: _metricTile('Click rate', clickRate, _benchClick),
              ),
              _divider(vertical: true),
              Expanded(child: _metricTile('Like rate', likeRate, _benchLike)),
            ],
          ),
          _divider(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _rawCount('Views', views),
                _rawCount('Reach', reach),
                _rawCount('Views', impressions),
                _rawCount('Clicks', clicks),
                _rawCount('Likes', likes),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _metricTile(String label, double rate, double avg) {
    final above = rate >= avg;
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 15, 18, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Colors.white.withValues(alpha: 0.35),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${rate.toStringAsFixed(1)}%',
            style: const TextStyle(
              fontSize: 24,
              height: 1,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(
                above ? Ionicons.arrow_up_circle : Ionicons.arrow_down_circle,
                size: 10,
                color: above ? _cyan : Colors.white.withValues(alpha: 0.3),
              ),
              const SizedBox(width: 3),
              Text(
                above ? 'above average' : 'below average',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  color: above ? _cyan : Colors.white.withValues(alpha: 0.3),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _rawCount(String label, num value) {
    return Column(
      children: [
        Text(
          _count(value),
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label.toUpperCase(),
          style: TextStyle(
            fontSize: 7,
            letterSpacing: 0.8,
            fontWeight: FontWeight.w600,
            color: Colors.white.withValues(alpha: 0.28),
          ),
        ),
      ],
    );
  }

  Widget _divider({bool vertical = false}) {
    return Container(
      width: vertical ? 1 : double.infinity,
      height: vertical ? 100 : 1,
      color: Colors.white.withValues(alpha: 0.06),
    );
  }

  Widget _tabs() {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _tabButton(_AudienceTab.gender, 'Gender'),
          _tabButton(_AudienceTab.age, 'Age'),
          _tabButton(_AudienceTab.locations, 'Locations'),
          _tabButton(_AudienceTab.interests, 'Interests'),
        ],
      ),
    );
  }

  Widget _tabButton(_AudienceTab tab, String label) {
    final selected = _tab == tab;
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: GestureDetector(
        onTap: () => setState(() => _tab = tab),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
          decoration: BoxDecoration(
            color: selected
                ? Colors.transparent
                : Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(9),
            border: Border.all(
              color: selected
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.12),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: selected
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.5),
            ),
          ),
        ),
      ),
    );
  }

  Widget _audienceBody(Map<String, dynamic> totals) {
    switch (_tab) {
      case _AudienceTab.gender:
        return _genderChart(_num(totals, 'reach'));
      case _AudienceTab.age:
        return _barRows(_ageRows(), _ageCyan, 'age');
      case _AudienceTab.locations:
        return _barRows(
          _normalize(
            _analytics?['byCountry'],
            'reach',
          ).where((r) => r.label != 'Unknown').toList(),
          _locationBlue,
          'location',
        );
      case _AudienceTab.interests:
        return _barRows(_interestRows(), _interestPurple, 'interests');
    }
  }

  List<({String label, int pct})> _ageRows() {
    const order = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+'];
    final rows = _normalize(
      _analytics?['byAge'],
      'impressions',
    ).where((r) => r.label != 'Unknown').toList();
    rows.sort(
      (a, b) => order.indexOf(a.label).compareTo(order.indexOf(b.label)),
    );
    return rows;
  }

  List<({String label, int pct})> _interestRows() {
    final raw = _analytics?['byClickType'];
    if (raw is! List) return const [];
    final mapped = raw.whereType<Map>().map((row) {
      final label = '${row['label'] ?? ''}'.trim();
      final pretty = label == 'visit'
          ? 'Link Visit'
          : label == 'message'
          ? 'Message'
          : label == 'call'
          ? 'Call'
          : (label.isEmpty
                ? 'Unknown'
                : '${label[0].toUpperCase()}${label.substring(1)}');
      return {'label': pretty, 'clicks': row['clicks']};
    }).toList();
    return _normalize(mapped, 'clicks');
  }

  Widget _genderChart(double totalReach) {
    final raw = _normalize(_analytics?['byGender'], 'reach');
    final male = raw.where((r) => r.label == 'Male').toList();
    final female = raw.where((r) => r.label == 'Female').toList();
    final otherPct = raw
        .where((r) => r.label != 'Male' && r.label != 'Female')
        .fold<int>(0, (sum, row) => sum + row.pct);
    final segments = [
      if (male.isNotEmpty) (label: 'Male', pct: male.first.pct, color: _cyan),
      if (female.isNotEmpty)
        (label: 'Female', pct: female.first.pct, color: _femalePink),
      if (otherPct > 0) (label: 'Other', pct: otherPct, color: _interestPurple),
    ];
    if (segments.isEmpty) return _emptyTab('gender');
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 90,
              child: _genderLegend(
                '👨',
                'Male',
                male.isEmpty ? null : male.first.pct,
                _cyan,
              ),
            ),
            SizedBox(
              width: 190,
              height: 190,
              child: CustomPaint(
                painter: _DonutPainter(segments),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _count(totalReach),
                        style: const TextStyle(
                          fontSize: 21,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        'Total Reach',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.white.withValues(alpha: 0.35),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SizedBox(
              width: 90,
              child: _genderLegend(
                '👩',
                'Female',
                female.isEmpty ? null : female.first.pct,
                _femalePink,
              ),
            ),
          ],
        ),
        if (otherPct > 0) ...[
          const SizedBox(height: 18),
          _genderLegend('⚪', 'Other', otherPct, _interestPurple),
        ],
        const SizedBox(height: 26),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 16,
          runSpacing: 8,
          children: [
            for (final seg in segments)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: seg.color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    seg.label,
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.white.withValues(alpha: 0.4),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ],
    );
  }

  Widget _genderLegend(String icon, String label, int? pct, Color color) {
    if (pct == null) return const SizedBox.shrink();
    return Column(
      children: [
        Text(icon, style: const TextStyle(fontSize: 18)),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Colors.white.withValues(alpha: 0.8),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '$pct%',
          style: TextStyle(
            fontSize: 21,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _barRows(
    List<({String label, int pct})> rows,
    Color color,
    String empty,
  ) {
    if (rows.isEmpty) return _emptyTab(empty);
    return Column(
      children: [
        for (var i = 0; i < rows.length; i++) ...[
          Row(
            children: [
              SizedBox(
                width: 140,
                child: Text(
                  _displayAudienceLabel(rows[i].label),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.15,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.8),
                  ),
                ),
              ),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: rows[i].pct.clamp(0, 100) / 100,
                    minHeight: 3,
                    backgroundColor: Colors.white.withValues(alpha: 0.1),
                    valueColor: AlwaysStoppedAnimation<Color>(color),
                  ),
                ),
              ),
              const SizedBox(width: 18),
              SizedBox(
                width: 42,
                child: Text(
                  '${rows[i].pct}%',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.white.withValues(alpha: 0.7),
                  ),
                ),
              ),
            ],
          ),
          if (i < rows.length - 1) const SizedBox(height: 22),
        ],
      ],
    );
  }

  static String _displayAudienceLabel(String label) {
    return label
        .replaceAll('â€“', '-')
        .replaceAll('–', '-')
        .replaceAll('—', '-')
        .replaceAll(RegExp(r'\s*-\s*'), '-');
  }

  Widget _emptyTab(String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 42),
      child: Column(
        children: [
          Icon(
            Ionicons.analytics_outline,
            size: 34,
            color: Colors.white.withValues(alpha: 0.25),
          ),
          const SizedBox(height: 10),
          Text(
            'No $label data yet.\nData populates as users engage with this ad.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              height: 1.35,
              color: Colors.white.withValues(alpha: 0.25),
            ),
          ),
        ],
      ),
    );
  }

  Widget _footer() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: Color(0x0FFFFFFF))),
      ),
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          onPressed: () => Navigator.pop(context),
          style: OutlinedButton.styleFrom(
            backgroundColor: Colors.white.withValues(alpha: 0.06),
            side: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: Text(
            'CLOSE ANALYTICS',
            style: TextStyle(
              fontSize: 12,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w700,
              color: Colors.white.withValues(alpha: 0.5),
            ),
          ),
        ),
      ),
    );
  }
}

class _DonutPainter extends CustomPainter {
  final List<({String label, int pct, Color color})> segments;

  const _DonutPainter(this.segments);

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final center = rect.center;
    final radius = math.min(size.width, size.height) / 2 - 18;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 24
      ..strokeCap = StrokeCap.butt
      ..color = Colors.white.withValues(alpha: 0.06);
    canvas.drawCircle(center, radius, paint);
    var start = -math.pi / 2;
    for (final segment in segments) {
      final sweep = math.pi * 2 * (segment.pct / 100);
      paint.color = segment.color;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        start,
        sweep,
        false,
        paint,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter oldDelegate) =>
      oldDelegate.segments != segments;
}
