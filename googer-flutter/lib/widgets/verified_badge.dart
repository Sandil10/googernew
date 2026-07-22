import 'package:flutter/material.dart';
import '../api/api.dart';

class UserVerifiedBadge extends StatefulWidget {
  final dynamic userId;
  final double size;

  const UserVerifiedBadge({super.key, required this.userId, this.size = 14});

  @override
  State<UserVerifiedBadge> createState() => _UserVerifiedBadgeState();
}

class _UserVerifiedBadgeState extends State<UserVerifiedBadge> {
  static final Map<String, Map<String, dynamic>?> _cache = {};
  Map<String, dynamic>? _badge;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant UserVerifiedBadge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ("${oldWidget.userId}" != "${widget.userId}") _load();
  }

  Future<void> _load() async {
    final id = "${widget.userId}".trim();
    if (id.isEmpty) {
      if (mounted) setState(() => _badge = null);
      return;
    }
    if (_cache.containsKey(id)) {
      if (mounted) setState(() => _badge = _cache[id]);
      return;
    }
    final badge = await Api.badgeForUser(id);
    _cache[id] = badge;
    if (mounted) setState(() => _badge = badge);
  }

  @override
  Widget build(BuildContext context) {
    final badge = _badge;
    if (badge == null) return const SizedBox.shrink();
    final color = _badgeColor((badge['color'] ?? 'blue').toString());
    final tick = _badgeColor(
      (badge['tickColor'] ?? badge['tick_color'] ?? '').toString(),
      fallback: color == const Color(0xFF3D3D3D)
          ? const Color(0xFFEF4444)
          : Colors.white,
    );
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(Icons.verified, size: widget.size, color: color),
          Icon(Icons.check, size: widget.size * 0.56, color: tick),
        ],
      ),
    );
  }

  static Color _badgeColor(String raw, {Color fallback = const Color(0xFF3897F0)}) {
    final value = raw.trim().toLowerCase();
    const named = {
      'blue': Color(0xFF3897F0),
      'gold': Color(0xFFFACC15),
      'green': Color(0xFF22C55E),
      'purple': Color(0xFFA855F7),
      'red': Color(0xFFEF4444),
      'orange': Color(0xFFF97316),
      'cyan': Color(0xFF06B6D4),
      'silver': Color(0xFF94A3B8),
      'bronze': Color(0xFFCD7F32),
      'black': Color(0xFF3D3D3D),
    };
    if (named.containsKey(value)) return named[value]!;
    if (value.startsWith('#') && (value.length == 7 || value.length == 9)) {
      final hex = int.tryParse(value.substring(1), radix: 16);
      if (hex != null) return Color(value.length == 7 ? 0xFF000000 | hex : hex);
    }
    return fallback;
  }
}
