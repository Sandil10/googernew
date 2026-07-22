import 'api_client.dart';

/// Chat calls mirroring the web `services/chatService.ts`.
class ChatService {
  ChatService._();

  /// GET /chat/conversations -> conversation list
  static Future<List<dynamic>> conversations() async {
    final data = await ApiClient.get('/chat/conversations');
    return _asList(data);
  }

  /// GET /chat/messages/:participantId?markSeen=1 -> messages in a thread
  static Future<List<dynamic>> messages(String participantId, {bool markSeen = true}) async {
    final data = await ApiClient.get('/chat/messages/$participantId', query: {'markSeen': markSeen ? '1' : '0'});
    return _asList(data);
  }

  /// POST /chat/messages  body: { toUserId, text }
  static Future<dynamic> send(Map<String, dynamic> body) => ApiClient.post('/chat/messages', body: body);

  static List<dynamic> _asList(dynamic data) {
    if (data is List) return data;
    if (data is Map && data['conversations'] is List) return data['conversations'] as List;
    if (data is Map && data['messages'] is List) return data['messages'] as List;
    if (data is Map && data['data'] is List) return data['data'] as List;
    return const [];
  }
}
