import 'api_client.dart';

/// Shop / marketplace calls mirroring the web `services/marketService.ts`.
class MarketService {
  MarketService._();

  /// GET /market/products?<filters> -> product list
  static Future<List<dynamic>> products({Map<String, dynamic>? filters}) async {
    final data = await ApiClient.get('/market/products', query: filters);
    return _asList(data);
  }

  /// GET /market/public/:id -> single public product
  static Future<dynamic> publicProduct(String id) => ApiClient.get('/market/public/$id');

  /// POST /market/create -> create a product
  static Future<dynamic> create(Map<String, dynamic> body) => ApiClient.post('/market/create', body: body);

  static List<dynamic> _asList(dynamic data) {
    if (data is List) return data;
    if (data is Map && data['products'] is List) return data['products'] as List;
    if (data is Map && data['data'] is List) return data['data'] as List;
    return const [];
  }
}
