import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const String kDefaultApiBaseUrl = String.fromEnvironment(
  'GOOGER_API_BASE_URL',
  defaultValue: 'https://googer.site/api',
);

String _stringValue(dynamic value, [String fallback = '']) {
  if (value == null) return fallback;
  return value.toString();
}

num _numValue(dynamic value, [num fallback = 0]) {
  if (value is num) return value;
  return num.tryParse(_stringValue(value)) ?? fallback;
}

List<dynamic> _listValue(dynamic value) => value is List ? value : const [];

Map<String, dynamic> _mapValue(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return value.map((key, val) => MapEntry(key.toString(), val));
  return <String, dynamic>{};
}

String resolveMediaUrl(String? raw) {
  final value = (raw ?? '').trim();
  if (value.isEmpty) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  final root = Uri.parse(kDefaultApiBaseUrl).origin;
  if (value.startsWith('/')) return '$root$value';
  return '$root/$value';
}

class ApiException implements Exception {
  final String message;

  const ApiException(this.message);

  @override
  String toString() => message;
}

class SessionController {
  SessionController(this.api);

  final GoogerApi api;
  String? token;
  Map<String, dynamic>? user;

  bool get isAuthenticated => token != null && token!.isNotEmpty;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    token = prefs.getString('googer_token');
    final rawUser = prefs.getString('googer_user');
    if (rawUser != null) {
      user = _mapValue(jsonDecode(rawUser));
    }
    api.token = token;
    if (isAuthenticated) {
      try {
        user = await api.getProfile();
        await _persist();
      } catch (_) {
        await logout();
      }
    }
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final result = await api.login(email: email, password: password);
    if (result['otpRequired'] == true) return result;
    if (result['approvalRequired'] == true) return result;
    await _setSession(result);
    return result;
  }

  Future<Map<String, dynamic>> verifyLoginOtp({
    required String email,
    required String password,
    required String otp,
  }) async {
    final result = await api.verifyLoginOtp(email: email, password: password, otp: otp);
    if (result['approvalRequired'] == true) return result;
    await _setSession(result);
    return result;
  }

  Future<Map<String, dynamic>> pollDeviceApproval(String id, String approvalToken) async {
    final result = await api.getDeviceApprovalStatus(id: id, approvalToken: approvalToken);
    if (result['token'] != null) await _setSession(result);
    return result;
  }

  Future<void> _setSession(Map<String, dynamic> result) async {
    token = _stringValue(result['token']);
    user = _mapValue(result['user']);
    api.token = token;
    await _persist();
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    if (token == null || token!.isEmpty) {
      await prefs.remove('googer_token');
      await prefs.remove('googer_user');
      return;
    }
    await prefs.setString('googer_token', token!);
    await prefs.setString('googer_user', jsonEncode(user ?? {}));
  }

  Future<void> logout() async {
    token = null;
    user = null;
    api.token = null;
    await _persist();
  }
}

class GoogerApi {
  GoogerApi({this.baseUrl = kDefaultApiBaseUrl});

  final String baseUrl;
  String? token;

  Uri _uri(String path, [Map<String, String>? query]) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$baseUrl$normalized').replace(queryParameters: query);
  }

  Map<String, String> _headers({bool auth = false}) => {
        'Content-Type': 'application/json',
        if (auth && token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> _decode(http.Response response) async {
    final text = response.body.trim();
    final decoded = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
    final map = _mapValue(decoded);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(_stringValue(map['message'] ?? map['error'], 'Request failed'));
    }
    return map;
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query, bool auth = false}) async {
    final response = await http.get(_uri(path, query), headers: _headers(auth: auth));
    return _decode(response);
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body, {bool auth = false}) async {
    final response = await http.post(_uri(path), headers: _headers(auth: auth), body: jsonEncode(body));
    return _decode(response);
  }

  Future<Map<String, dynamic>> login({required String email, required String password}) async {
    return post('/auth/login', {
      'email': email.trim(),
      'password': password,
      'deviceId': 'flutter-${DateTime.now().millisecondsSinceEpoch}',
    });
  }

  Future<Map<String, dynamic>> verifyLoginOtp({
    required String email,
    required String password,
    required String otp,
  }) {
    return post('/auth/login/verify-otp', {
      'email': email.trim(),
      'password': password,
      'otp': otp.trim(),
      'deviceId': 'flutter-mobile',
    });
  }

  Future<Map<String, dynamic>> getDeviceApprovalStatus({
    required String id,
    required String approvalToken,
  }) {
    return post('/auth/login/device-approval/status', {
      'approvalId': id,
      'approvalToken': approvalToken,
    });
  }

  Future<Map<String, dynamic>> getProfile() async {
    final result = await get('/auth/profile', auth: true);
    return _mapValue(result['user'] ?? result['data'] ?? result);
  }

  Future<Map<String, dynamic>> getWallet() => get('/auth/wallet', auth: true);

  Future<List<FeedItem>> getHomeFeed() async {
    final result = await get('/feed/home', query: {'limit': '30'}, auth: token != null);
    final items = _listValue(result['items']);
    final posts = items.isNotEmpty ? items : _listValue(result['posts']);
    return posts.map((item) => FeedItem.fromJson(_mapValue(item))).toList();
  }

  Future<List<UploadContent>> getUploadContents() async {
    final result = await get('/upload-content', query: {'limit': '30'}, auth: token != null);
    return _listValue(result['contents']).map((item) => UploadContent.fromJson(_mapValue(item))).toList();
  }

  Future<List<ProductItem>> getProducts() async {
    final result = await get('/market/products', query: {'limit': '30'}, auth: token != null);
    final data = _listValue(result['data'].runtimeType == List ? result['data'] : result['products']);
    return data.map((item) => ProductItem.fromJson(_mapValue(item))).toList();
  }

  Future<List<WalletTransaction>> getWalletTransactions() async {
    final result = await get('/wallet/history', auth: true);
    return _listValue(result['transactions']).map((item) => WalletTransaction.fromJson(_mapValue(item))).toList();
  }

  Future<List<Map<String, dynamic>>> getConversations() async {
    final result = await get('/chat/conversations', auth: true);
    return _listValue(result['conversations']).map((item) => _mapValue(item)).toList();
  }
}

class FeedItem {
  final String id;
  final String username;
  final String name;
  final String avatar;
  final String text;
  final String time;
  final int likes;
  final int views;
  final int comments;
  final int shares;

  FeedItem({
    required this.id,
    required this.username,
    required this.name,
    required this.avatar,
    required this.text,
    required this.time,
    required this.likes,
    required this.views,
    required this.comments,
    required this.shares,
  });

  factory FeedItem.fromJson(Map<String, dynamic> json) {
    final user = _mapValue(json['user']);
    return FeedItem(
      id: _stringValue(json['id'] ?? json['post_id']),
      username: _stringValue(json['username'] ?? user['username'], 'googer'),
      name: _stringValue(json['full_name'] ?? json['fullName'] ?? user['full_name'] ?? user['username'], 'Googer'),
      avatar: resolveMediaUrl(_stringValue(json['profile_picture'] ?? user['profile_picture'])),
      text: _stringValue(json['text'] ?? json['content'] ?? json['message']),
      time: _stringValue(json['timeAgo'] ?? json['time_ago'] ?? json['created_at'], ''),
      likes: _numValue(json['likes_count'] ?? json['likes']).toInt(),
      views: _numValue(json['views_count'] ?? json['views']).toInt(),
      comments: _numValue(json['comments_count'] ?? json['comments']).toInt(),
      shares: _numValue(json['shares_count'] ?? json['shares']).toInt(),
    );
  }
}

class UploadContent {
  final String id;
  final String username;
  final String name;
  final String avatar;
  final String topic;
  final String description;
  final String mediaUrl;
  final String time;
  final int coins;
  final int likes;
  final int views;
  final int comments;
  final int shares;

  UploadContent({
    required this.id,
    required this.username,
    required this.name,
    required this.avatar,
    required this.topic,
    required this.description,
    required this.mediaUrl,
    required this.time,
    required this.coins,
    required this.likes,
    required this.views,
    required this.comments,
    required this.shares,
  });

  factory UploadContent.fromJson(Map<String, dynamic> json) {
    return UploadContent(
      id: _stringValue(json['id'] ?? json['content_id']),
      username: _stringValue(json['username'], 'googer'),
      name: _stringValue(json['full_name'] ?? json['username'], 'Googer'),
      avatar: resolveMediaUrl(_stringValue(json['profile_picture'])),
      topic: _stringValue(json['topic'] ?? json['category'], 'ALL').toUpperCase(),
      description: _stringValue(json['description'] ?? json['title'] ?? json['caption']),
      mediaUrl: resolveMediaUrl(_stringValue(json['thumbnail_url'] ?? json['thumbnail'] ?? json['image_url'] ?? json['media_url'] ?? json['file_url'])),
      time: _stringValue(json['timeAgo'] ?? json['time_ago'] ?? json['approved_at'] ?? json['created_at']),
      coins: _numValue(json['coin_price'] ?? json['coins'] ?? json['price']).toInt(),
      likes: _numValue(json['likes_count'] ?? json['likes']).toInt(),
      views: _numValue(json['views_count'] ?? json['views']).toInt(),
      comments: _numValue(json['comments_count'] ?? json['comments']).toInt(),
      shares: _numValue(json['shares_count'] ?? json['shares']).toInt(),
    );
  }
}

class ProductItem {
  final String id;
  final String seller;
  final String title;
  final String price;
  final String imageUrl;
  final String category;
  final int likes;
  final int views;

  ProductItem({
    required this.id,
    required this.seller,
    required this.title,
    required this.price,
    required this.imageUrl,
    required this.category,
    required this.likes,
    required this.views,
  });

  factory ProductItem.fromJson(Map<String, dynamic> json) {
    return ProductItem(
      id: _stringValue(json['id']),
      seller: _stringValue(json['owner_username'] ?? json['username'], 'googer'),
      title: _stringValue(json['title'] ?? json['name'], 'Product'),
      price: 'R ${_numValue(json['promo_price'] ?? json['price']).toStringAsFixed(2)}',
      imageUrl: resolveMediaUrl(_stringValue(json['image_url'] ?? json['image'])),
      category: _stringValue(json['category'] ?? json['manual_category'], 'All'),
      likes: _numValue(json['likes_count'] ?? json['likes']).toInt(),
      views: _numValue(json['views_count'] ?? json['views']).toInt(),
    );
  }
}

class WalletTransaction {
  final String id;
  final String type;
  final String counterparty;
  final double amount;
  final String date;
  final String status;

  WalletTransaction({
    required this.id,
    required this.type,
    required this.counterparty,
    required this.amount,
    required this.date,
    required this.status,
  });

  factory WalletTransaction.fromJson(Map<String, dynamic> json) {
    return WalletTransaction(
      id: _stringValue(json['id']),
      type: _stringValue(json['type'], 'transaction'),
      counterparty: _stringValue(json['receiver_username'] ?? json['sender_username'] ?? json['counterparty'] ?? json['note'], 'Wallet'),
      amount: _numValue(json['amount']).toDouble(),
      date: _stringValue(json['created_at'] ?? json['date']),
      status: _stringValue(json['status'], 'completed'),
    );
  }
}
