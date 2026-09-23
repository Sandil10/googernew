import 'package:flutter/material.dart';

import '../theme/colors.dart';

/// Message delivery indicator — a port of the web's `MessageStatusRing`
/// (`app/dashboard/chats/page.tsx:647`).
///
/// It is three concentric circles rather than ticks, and each state changes a
/// *different* layer, so the colour table has to be reproduced exactly or the
/// states become indistinguishable.
///
/// | status | outer | middle | inner |
/// | --- | --- | --- | --- |
/// | sending | white 20% | black | black 60% |
/// | sent | white 20% | white 30% | black 60% |
/// | delivered | white 20% | red | black 60% |
/// | read | red | black 60% | black 60% |
class MessageStatusRing extends StatelessWidget {
  final String status;

  /// The list uses a slightly larger ring than message bubbles do.
  final bool listSize;

  const MessageStatusRing({
    super.key,
    required this.status,
    this.listSize = false,
  });

  /// `read_at` wins over `delivered_at`, which wins over the stored status —
  /// the web resolves in that order (`resolveMessageStatus`).
  static String resolve(Map<String, dynamic> message) {
    final readAt = '${message["read_at"] ?? message["readAt"] ?? ""}'.trim();
    if (readAt.isNotEmpty) return 'read';
    final deliveredAt =
        '${message["delivered_at"] ?? message["deliveredAt"] ?? ""}'.trim();
    if (deliveredAt.isNotEmpty) return 'delivered';
    final stored = '${message["status"] ?? ""}'.trim();
    return stored.isEmpty ? 'sent' : stored;
  }

  static String labelFor(String status) => switch (status) {
    'sending' => 'Sending',
    'delivered' => 'Delivered',
    'read' => 'Read',
    _ => 'Sent',
  };

  (Color, Color, Color) get _layers {
    const black60 = Color(0x99000000);
    switch (status) {
      case 'sending':
        return (Colors.white24, Colors.black, black60);
      case 'delivered':
        return (Colors.white24, AppColors.likeRed, black60);
      case 'read':
        return (AppColors.likeRed, black60, black60);
      default:
        return (Colors.white24, Colors.white30, black60);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (outer, mid, inner) = _layers;
    final outerSize = listSize ? 12.0 : 10.0;
    final midSize = listSize ? 8.0 : 6.0;
    final innerSize = listSize ? 4.0 : 2.0;

    return Tooltip(
      message: labelFor(status),
      child: Container(
        width: outerSize,
        height: outerSize,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: outer, shape: BoxShape.circle),
        child: Container(
          width: midSize,
          height: midSize,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: mid, shape: BoxShape.circle),
          child: Container(
            width: innerSize,
            height: innerSize,
            decoration: BoxDecoration(color: inner, shape: BoxShape.circle),
          ),
        ),
      ),
    );
  }
}
