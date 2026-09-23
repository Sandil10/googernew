import 'package:shared_preferences/shared_preferences.dart';

/// Persists the auth token (matches the web app storing `token` in localStorage).
class TokenStore {
  TokenStore._();

  static const _key = 'token';
  static String? _cached;

  static Future<String?> get() async {
    if (_cached != null) return _cached;
    final prefs = await SharedPreferences.getInstance();
    _cached = prefs.getString(_key);
    return _cached;
  }

  /// Synchronous access to the last-loaded token (null until [get]/[set] runs).
  static String? get cached => _cached;

  static Future<void> set(String token) async {
    _cached = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, token);
  }

  static Future<void> clear() async {
    _cached = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
