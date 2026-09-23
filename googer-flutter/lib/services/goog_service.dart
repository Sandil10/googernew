import 'api_client.dart';

/// Goog (feed post) calls mirroring the web `services/googService.ts`.
class GoogService {
  GoogService._();

  /// GET /googs -> list of feed posts
  static Future<List<dynamic>> feed() async {
    final data = await ApiClient.get('/googs');
    return _asList(data);
  }

  /// POST /googs -> create a goog
  static Future<dynamic> create(Map<String, dynamic> body) => ApiClient.post('/googs', body: body);

  /// GET /googs/:id
  static Future<dynamic> byId(String id) => ApiClient.get('/googs/$id');

  /// DELETE /googs/:id
  static Future<void> delete(String id) async => ApiClient.delete('/googs/$id');

  /// POST /googs/:id/like
  static Future<dynamic> like(String id) => ApiClient.post('/googs/$id/like');

  /// POST /googs/:id/share
  static Future<dynamic> share(String id) => ApiClient.post('/googs/$id/share');

  /// GET /googs/:id/comments
  static Future<List<dynamic>> comments(String id) async => _asList(await ApiClient.get('/googs/$id/comments'));

  static List<dynamic> _asList(dynamic data) {
    if (data is List) return data;
    if (data is Map && data['data'] is List) return data['data'] as List;
    if (data is Map && data['googs'] is List) return data['googs'] as List;
    return const [];
  }
}
