import 'dart:async';
import 'dart:math';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../screens/subscription_screen.dart';

const _warningLeadMs = 2 * 60 * 1000;
const _modalBg = Color(0xFF1A1614);
const _amber = Color(0xFFFBBF24);

class SubscriptionWarningOverlays extends StatefulWidget {
  final Widget child;
  final GlobalKey<NavigatorState> navigatorKey;

  const SubscriptionWarningOverlays({
    super.key,
    required this.child,
    required this.navigatorKey,
  });

  @override
  State<SubscriptionWarningOverlays> createState() =>
      _SubscriptionWarningOverlaysState();
}

class _SubscriptionWarningOverlaysState
    extends State<SubscriptionWarningOverlays> {
  final Set<String> _shownSubscriptionWarnings = <String>{};
  final Set<String> _shownAdWarnings = <String>{};
  Timer? _timer;
  bool _checking = false;
  bool _dialogOpen = false;

  @override
  void initState() {
    super.initState();
    unawaited(_check());
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _check());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _check() async {
    if (_checking || _dialogOpen || !Api.loggedIn) return;
    _checking = true;
    try {
      final shownSub = await _maybeShowSubscriptionGraceWarning();
      if (!shownSub) await _maybeShowAdExpiryWarning();
    } finally {
      _checking = false;
    }
  }

  Future<bool> _maybeShowSubscriptionGraceWarning() async {
    final sub = await Api.mySubscription();
    if (!mounted || sub == null) return false;

    final slug = '${sub['plan_slug'] ?? ''}'.toLowerCase();
    final price = _num(sub['price_paid']);
    final expiresAt = _dateMs(sub['expires_at']);
    final graceEndsAt = _dateMs(sub['grace_ends_at']);
    final inGrace =
        sub['in_grace_period'] == true &&
        graceEndsAt != null &&
        graceEndsAt > DateTime.now().millisecondsSinceEpoch;

    if (slug == 'basic' || price <= 0 || expiresAt == null || !inGrace) {
      return false;
    }

    final key = [
      'grace',
      sub['id'],
      sub['started_at'],
      sub['expires_at'],
      sub['grace_ends_at'],
    ].join('_');
    if (!_shownSubscriptionWarnings.add(key)) return false;

    final remaining = graceEndsAt - DateTime.now().millisecondsSinceEpoch;
    await _showWarningDialog(
      icon: Ionicons.card_outline,
      title:
          'Your ${sub['plan_name'] ?? 'subscription'} features will end in ${_formatRemainingDays(remaining)}',
      message:
          'Your subscription period has ended, but your features are still active during the grace period. Pay now to keep them active.',
      buttonLabel: 'Pay Subscription',
    );
    return true;
  }

  Future<void> _maybeShowAdExpiryWarning() async {
    final results = await Future.wait<dynamic>([Api.myPlan(), Api.myAds()]);
    if (!mounted) return;

    final plan = results[0] is Map
        ? Map<String, dynamic>.from(results[0] as Map)
        : <String, dynamic>{};
    final ads = results[1] is List
        ? (results[1] as List)
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList()
        : const <Map<String, dynamic>>[];

    for (final ad in ads) {
      if (!_isRawPhotoVideoAd(ad)) continue;
      final adId = _str(ad, const [
        'adId',
        'ad_id',
        'id',
      ]).replaceFirst(RegExp(r'^ad-'), '');
      if (adId.isEmpty || _shownAdWarnings.contains(adId)) continue;

      final refMs = _dateMs(
        _pick(ad, const [
          'activeStartTime',
          'active_start_time',
          'startedAt',
          'started_at',
        ]),
      );
      if (refMs == null) continue;

      final expiryMs = _finalRawAdExpiryMs(ad, plan);
      if (expiryMs <= 0) continue;

      final elapsed = DateTime.now().millisecondsSinceEpoch - refMs;
      final warningAt = max(0, expiryMs - _warningLeadMs);
      if (elapsed < warningAt || elapsed >= expiryMs) continue;

      _shownAdWarnings.add(adId);
      final remaining = max(0, expiryMs - elapsed);
      final mediaType = _str(ad, const [
        'mediaType',
        'media_type',
      ]).toLowerCase();
      final campaignType = _str(ad, const [
        'campaignType',
        'campaign_type',
      ]).toLowerCase();
      final label = mediaType.contains('video')
          ? 'video ad'
          : campaignType.contains('product')
          ? 'product ad'
          : 'ad';
      await _showWarningDialog(
        icon: Ionicons.images_outline,
        title: 'Your $label will be removed in ${_formatRemaining(remaining)}',
        message:
            'Your $label is still active. Subscribe to a plan to keep it running longer.',
        buttonLabel: 'Get Subscription',
      );
      return;
    }
  }

  Future<void> _showWarningDialog({
    required IconData icon,
    required String title,
    required String message,
    required String buttonLabel,
  }) async {
    if (!mounted) return;
    final navContext = widget.navigatorKey.currentContext;
    if (navContext == null) return;
    _dialogOpen = true;
    try {
      await showDialog<void>(
        context: navContext,
        barrierColor: Colors.black.withValues(alpha: 0.7),
        builder: (dialogContext) => BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
          child: Dialog(
            insetPadding: const EdgeInsets.symmetric(horizontal: 20),
            backgroundColor: _modalBg,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(28),
              side: BorderSide(color: Colors.white.withValues(alpha: 0.10)),
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 384),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: _amber.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: _amber.withValues(alpha: 0.20),
                        ),
                      ),
                      child: Icon(icon, color: Color(0xFFFCD34D), size: 22),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        height: 1.25,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      message,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.55),
                        fontSize: 12,
                        height: 1.45,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 20),
                    SizedBox(
                      width: double.infinity,
                      height: 40,
                      child: TextButton.icon(
                        onPressed: () {
                          Navigator.pop(dialogContext);
                          widget.navigatorKey.currentState?.push(
                            MaterialPageRoute(
                              builder: (_) => const SubscriptionScreen(),
                            ),
                          );
                        },
                        icon: const Icon(Ionicons.star_outline, size: 15),
                        label: Text(buttonLabel),
                        style: TextButton.styleFrom(
                          backgroundColor: _amber,
                          foregroundColor: Colors.black,
                          textStyle: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      height: 40,
                      child: TextButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.white.withValues(alpha: 0.45),
                          textStyle: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                        ),
                        child: const Text('Dismiss'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    } finally {
      _dialogOpen = false;
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

double _num(dynamic value) => double.tryParse('$value') ?? 0;

dynamic _pick(Map<String, dynamic> map, List<String> keys) {
  for (final key in keys) {
    final value = map[key];
    if (value != null && '$value'.trim().isNotEmpty && '$value' != 'null') {
      return value;
    }
  }
  return null;
}

String _str(Map<String, dynamic> map, List<String> keys) {
  final value = _pick(map, keys);
  return value == null ? '' : '$value'.trim();
}

int? _dateMs(dynamic value) {
  final text = '$value'.trim();
  if (text.isEmpty || text == 'null') return null;
  var normalized = text;
  if (!RegExp(r'(Z|[+-]\d\d:?\d\d)$').hasMatch(normalized)) {
    normalized = '${normalized.replaceFirst(' ', 'T')}Z';
  }
  return DateTime.tryParse(normalized)?.millisecondsSinceEpoch;
}

String _formatRemainingDays(int ms) {
  final days = max(0, (ms / 86400000).ceil());
  return '$days ${days == 1 ? 'day' : 'days'}';
}

String _formatRemaining(int ms) {
  if (ms >= 86400000) {
    final days = (ms / 86400000).ceil();
    return '$days ${days == 1 ? 'day' : 'days'}';
  }
  if (ms >= 3600000) {
    final hours = (ms / 3600000).ceil();
    return '$hours ${hours == 1 ? 'hour' : 'hours'}';
  }
  final minutes = max(1, (ms / 60000).ceil());
  return '$minutes ${minutes == 1 ? 'minute' : 'minutes'}';
}

int _planExpiryMs(Map<String, dynamic> plan) {
  final extraRaw = plan['extra'];
  final extra = extraRaw is Map ? Map<String, dynamic>.from(extraRaw) : plan;
  final value = _num(extra['ads_expiry_value'] ?? extra['ads_expiry_days']);
  if (value <= 0) return 0;
  final unit = '${extra['ads_expiry_unit'] ?? 'days'}'.toLowerCase();
  if (unit == 'minutes') return (value * 60000).round();
  if (unit == 'hours') return (value * 3600000).round();
  return (value * 86400000).round();
}

int _finalRawAdExpiryMs(Map<String, dynamic> ad, Map<String, dynamic> plan) {
  final durationDays = _num(ad['durationDays'] ?? ad['duration_days']);
  if (durationDays > 0) return (durationDays * 86400000).round();
  return _planExpiryMs(plan);
}

bool _isRawPhotoVideoAd(Map<String, dynamic> ad) {
  final campaignType = _str(ad, const [
    'campaignType',
    'campaign_type',
  ]).toLowerCase();
  final isPhotoVideo =
      campaignType == 'photo and video' || campaignType == 'photo & video';
  final status = _str(ad, const ['status']).toLowerCase();
  if (!isPhotoVideo || status != 'active') return false;

  final draftRaw = ad['editDraft'] ?? ad['edit_draft'];
  final draft = draftRaw is Map
      ? Map<String, dynamic>.from(draftRaw)
      : <String, dynamic>{};
  final activeLink = _str(ad, const ['active_link', 'activeLink']).isNotEmpty
      ? _str(ad, const ['active_link', 'activeLink'])
      : _str(draft, const ['activeLink', 'active_link']);
  if (activeLink.isNotEmpty) return false;

  final galleryRaw = ad['mediaGallery'] ?? ad['media_gallery'];
  final gallery = galleryRaw is List ? galleryRaw : const [];
  final media = _str(ad, const ['mediaPreview', 'media_preview']).isNotEmpty
      ? _str(ad, const ['mediaPreview', 'media_preview'])
      : (gallery.isEmpty ? '' : '${gallery.first}'.trim());
  if (media.isEmpty) return false;
  return !RegExp(r'^https?://', caseSensitive: false).hasMatch(media) ||
      RegExp(r'/uploads?/', caseSensitive: false).hasMatch(media);
}
