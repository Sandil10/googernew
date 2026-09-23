import 'package:flutter/material.dart';
import '../api/api.dart';

/// Shared Subscribe button — identical UI and behaviour everywhere it appears
/// (home feed, shop, profiles, chats…), mirroring the web `SubscribeButton`
/// component.
///
/// It only shows when the viewer is logged in, the author is not the viewer,
/// and the viewer is not already subscribed. Tapping subscribes to the author
/// (POST `/auth/user/{id}/subscribe`) and then hides the button, exactly like
/// the web version.
class SubscribeButton extends StatefulWidget {
  final String userId;
  final String authorName;
  final bool initialSubscribed;

  /// Slightly smaller padding for dense card headers.
  final bool compact;

  const SubscribeButton({
    super.key,
    required this.userId,
    this.authorName = '',
    this.initialSubscribed = false,
    this.compact = false,
  });

  @override
  State<SubscribeButton> createState() => _SubscribeButtonState();
}

class _SubscribeButtonState extends State<SubscribeButton> {
  static const _red = Color(0xFFE0303A);
  static const _pendingRed = Color(0x99E0303A);

  static final Set<String> _subscribedUsers = <String>{};
  static final ValueNotifier<int> _version = ValueNotifier<int>(0);
  bool _subscribed = false;
  bool _busy = false;

  String get _normalizedUserId => widget.userId.trim();

  bool get _isSelf {
    final me = Api.currentUserId.trim();
    return me.isNotEmpty && me == _normalizedUserId;
  }

  @override
  void initState() {
    super.initState();
    _subscribed =
        widget.initialSubscribed ||
        _subscribedUsers.contains(_normalizedUserId);
    if (!_subscribed && !_isSelf && _normalizedUserId.isNotEmpty) {
      _checkStatus();
    }
  }

  @override
  void didUpdateWidget(covariant SubscribeButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.userId != widget.userId ||
        oldWidget.initialSubscribed != widget.initialSubscribed) {
      _subscribed =
          widget.initialSubscribed ||
          _subscribedUsers.contains(_normalizedUserId);
      if (!_subscribed && !_isSelf && _normalizedUserId.isNotEmpty) {
        _checkStatus();
      }
    }
  }

  Future<void> _checkStatus() async {
    final sub = await Api.isSubscribedTo(widget.userId);
    if (!mounted || !sub) return;
    _subscribedUsers.add(_normalizedUserId);
    _version.value++;
    setState(() => _subscribed = true);
  }

  Future<void> _subscribe() async {
    if (_busy || _subscribed) return;
    setState(() {
      _busy = true;
      _subscribed = true; // optimistic — the button hides, like web
    });
    try {
      // Only toggle when not already subscribed, so a repeat tap never
      // accidentally unsubscribes (mirrors the web status check).
      final already = await Api.isSubscribedTo(widget.userId);
      if (!already) {
        final ok = await Api.toggleUserSubscription(widget.userId);
        if (ok == null) {
          if (mounted) setState(() => _subscribed = false);
          return;
        }
      }
      _subscribedUsers.add(_normalizedUserId);
      _version.value++;
    } catch (_) {
      if (mounted) setState(() => _subscribed = false);
      return;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (!mounted) return;
    final name = widget.authorName.trim();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(name.isEmpty ? 'Subscribed' : 'Subscribed to $name'),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: _version,
      builder: (context, _, __) {
        final globallySubscribed = _subscribedUsers.contains(_normalizedUserId);
        if (_normalizedUserId.isEmpty ||
            _isSelf ||
            _subscribed ||
            globallySubscribed) {
          return const SizedBox.shrink();
        }
        return GestureDetector(
          onTap: _subscribe,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: EdgeInsets.symmetric(
              horizontal: widget.compact ? 12 : 15,
              vertical: widget.compact ? 5 : 6,
            ),
            decoration: BoxDecoration(
              // Outlined crimson pill — transparent fill, red hairline border,
              // red label. Dims slightly while the subscribe call is in flight.
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: _busy ? _pendingRed : _red,
                width: 1.1,
              ),
            ),
            child: Text(
              'Subscribe',
              style: TextStyle(
                fontSize: widget.compact ? 10 : 11,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.1,
                height: 1.1,
                color: _busy ? _pendingRed : _red,
              ),
            ),
          ),
        );
      },
    );
  }
}
