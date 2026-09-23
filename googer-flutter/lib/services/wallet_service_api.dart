import 'api_client.dart';

/// Wallet calls mirroring the web `services/walletService.ts`.
class WalletApi {
  WalletApi._();

  /// GET /wallet/history -> transaction history
  static Future<List<dynamic>> history() async {
    final data = await ApiClient.get('/wallet/history');
    return _asList(data);
  }

  /// GET /wallet/pending-requests
  static Future<List<dynamic>> pendingRequests() async {
    final data = await ApiClient.get('/wallet/pending-requests');
    return _asList(data);
  }

  /// POST /wallet/transfer  body: { toUserId, amount, note? }
  static Future<dynamic> transfer(Map<String, dynamic> body) => ApiClient.post('/wallet/transfer', body: body);

  /// POST /wallet/request  body: { fromUserId, amount, note? }
  static Future<dynamic> request(Map<String, dynamic> body) => ApiClient.post('/wallet/request', body: body);

  /// GET /wallet/search-users?query=...
  static Future<List<dynamic>> searchUsers(String query) async {
    final data = await ApiClient.get('/wallet/search-users', query: {'query': query});
    return _asList(data);
  }

  /// POST /wallet/pay-order
  static Future<dynamic> payOrder(Map<String, dynamic> body) => ApiClient.post('/wallet/pay-order', body: body);

  static List<dynamic> _asList(dynamic data) {
    if (data is List) return data;
    if (data is Map && data['transactions'] is List) return data['transactions'] as List;
    if (data is Map && data['requests'] is List) return data['requests'] as List;
    if (data is Map && data['users'] is List) return data['users'] as List;
    if (data is Map && data['data'] is List) return data['data'] as List;
    return const [];
  }
}
