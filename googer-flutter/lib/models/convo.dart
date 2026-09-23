class Convo {
  final String name;
  final String last;
  final int unread;
  final String? participantId;
  const Convo({required this.name, required this.last, required this.unread, this.participantId});
  String get initial => name.isNotEmpty ? name[0].toUpperCase() : '?';
  bool get hasUnread => unread > 0;

  /// Builds a Convo from a backend `/chat/conversations` item, tolerant of field naming.
  factory Convo.fromJson(Map<String, dynamic> j) {
    String s(List<String> keys, [String fallback = '']) {
      for (final k in keys) {
        final v = j[k];
        if (v != null && '$v'.isNotEmpty) return '$v';
      }
      return fallback;
    }

    int unread = 0;
    for (final k in ['unread', 'unread_count', 'unreadCount']) {
      final v = j[k];
      if (v is num) {
        unread = v.toInt();
        break;
      }
    }

    return Convo(
      name: s(['name', 'participant_name', 'username', 'display_name'], 'User'),
      last: s(['last', 'last_message', 'lastMessage', 'preview'], ''),
      unread: unread,
      participantId: s(['participant_id', 'participantId', 'user_id', 'id']).isEmpty
          ? null
          : s(['participant_id', 'participantId', 'user_id', 'id']),
    );
  }
}

final List<Convo> demoConvos = [
  Convo(name: 'Mira K.', last: 'sent you a goog · 2m', unread: 2),
  Convo(name: 'Devan S.', last: 'okay but the bell on the right tho', unread: 0),
  Convo(name: 'rohit_p', last: 'shipped! tracking in 10 min', unread: 1),
  Convo(name: 'aurora.exe', last: 'thanks for the boost', unread: 0),
  Convo(name: 'support', last: 'your withdrawal is processing', unread: 0),
];
