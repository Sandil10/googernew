import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'api_config.dart';
import 'token_store.dart';

/// Thrown for non-2xx responses so screens can show the server message.
class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';

  bool get isAuthFailure =>
      statusCode == 401 ||
      statusCode == 403 ||
      RegExp(r'invalid authentication token|session expired|authentication required|no token provided',
              caseSensitive: false)
          .hasMatch(message);
}

/// Thrown when the device can't reach the server at all — no internet,
/// DNS failure, or the request timed out. Screens show a "connect to the
/// internet" message for this.
class NoInternetException implements Exception {
  final String message;
  NoInternetException([this.message = 'No internet connection']);
  @override
  String toString() => 'NoInternetException: $message';
}

/// Thin HTTP client mirroring the web `services/*` fetch pattern:
/// JSON in/out, `Authorization: Bearer <token>` when a token is stored.
class ApiClient {
  ApiClient._();

  static Future<Map<String, String>> _headers({bool json = true}) async {
    final token = await TokenStore.get();
    return {
      if (json) 'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Uri _uri(String path, [Map<String, dynamic>? query]) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('${ApiConfig.baseUrl}$normalized').replace(
      queryParameters: query?.map((k, v) => MapEntry(k, '$v')),
    );
  }

  static dynamic _decode(http.Response res) {
    final body = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 200 && res.statusCode < 300) return body;
    final msg = (body is Map && body['message'] != null)
        ? body['message'].toString()
        : (body is Map && body['error'] != null)
            ? body['error'].toString()
            : 'Request failed (${res.statusCode})';
    throw ApiException(res.statusCode, msg);
  }

  static const Duration _timeout = Duration(seconds: 20);

  /// Runs an HTTP call, converting any connectivity failure (no internet, DNS
  /// failure, connection refused, or timeout) into a [NoInternetException].
  static Future<dynamic> _send(Future<http.Response> Function() call) async {
    try {
      final res = await call().timeout(_timeout);
      return _decode(res);
    } on ApiException {
      rethrow;
    } on SocketException {
      throw NoInternetException();
    } on TimeoutException {
      throw NoInternetException('The connection timed out');
    } on http.ClientException {
      throw NoInternetException();
    } on HttpException {
      throw NoInternetException();
    }
  }

  static Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    final headers = await _headers();
    return _send(() => http.get(_uri(path, query), headers: headers));
  }

  static Future<dynamic> post(String path, {Object? body, Map<String, dynamic>? query}) async {
    final headers = await _headers();
    return _send(() => http.post(_uri(path, query), headers: headers, body: body == null ? null : jsonEncode(body)));
  }

  static Future<dynamic> put(String path, {Object? body}) async {
    final headers = await _headers();
    return _send(() => http.put(_uri(path), headers: headers, body: body == null ? null : jsonEncode(body)));
  }

  static Future<dynamic> delete(String path) async {
    final headers = await _headers();
    return _send(() => http.delete(_uri(path), headers: headers));
  }
}
