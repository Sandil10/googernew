import 'dart:convert';

import 'storage.dart';

String _key(String userId, String kind) =>
    'googer-hidden-feed-${userId.trim().isEmpty ? 'guest' : userId.trim()}-$kind';

Set<String> readHiddenFeedItemIds(String userId, String kind) {
  final raw = readStorage(_key(userId, kind));
  if (raw == null || raw.trim().isEmpty) return <String>{};
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return <String>{};
    final cutoff = DateTime.now().subtract(const Duration(hours: 24));
    final active = <String, String>{};
    decoded.forEach((id, value) {
      final hiddenAt = DateTime.tryParse('$value');
      if (hiddenAt != null && hiddenAt.isAfter(cutoff)) {
        active['$id'] = hiddenAt.toUtc().toIso8601String();
      }
    });
    writeStorage(_key(userId, kind), jsonEncode(active));
    return active.keys.toSet();
  } catch (_) {
    writeStorage(_key(userId, kind), null);
    return <String>{};
  }
}

void hideFeedItemFor24Hours(String userId, String kind, String id) {
  final key = _key(userId, kind);
  final active = <String, dynamic>{};
  final raw = readStorage(key);
  if (raw != null && raw.trim().isNotEmpty) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) active.addAll(Map<String, dynamic>.from(decoded));
    } catch (_) {}
  }
  active[id] = DateTime.now().toUtc().toIso8601String();
  writeStorage(key, jsonEncode(active));
}
