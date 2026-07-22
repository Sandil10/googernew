import 'api_client.dart';
import 'token_store.dart';
import '../api/api.dart';

/// Auth calls mirroring the web `services/authService.ts`.
class AuthService {
  AuthService._();

  /// POST /auth/login  body: { email, password }  -> { token, user? }
  static Future<Map<String, dynamic>> login({required String email, required String password}) async {
    final result = await ApiClient.post('/auth/login', body: {'email': email, 'password': password});
    final map = (result as Map).cast<String, dynamic>();
    final token = map['token'];
    if (token is String && token.isNotEmpty) {
      await TokenStore.set(token);
      Api.token = token;
      await Api.refreshProfile();
    }
    return map;
  }

  /// POST /auth/register  body: { email, password, username, fullName }
  static Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    String? username,
    String? fullName,
  }) async {
    final result = await ApiClient.post('/auth/register', body: {
      'email': email,
      'password': password,
      'username': username ?? email.split('@').first,
      'fullName': fullName ?? email.split('@').first,
    });
    final map = (result as Map).cast<String, dynamic>();
    final token = map['token'];
    if (token is String && token.isNotEmpty) {
      await TokenStore.set(token);
      Api.token = token;
      await Api.refreshProfile();
    }
    return map;
  }

  /// GET /auth/profile -> current user
  static Future<Map<String, dynamic>> profile() async {
    final result = await ApiClient.get('/auth/profile');
    return (result as Map).cast<String, dynamic>();
  }

  // Forgot-password OTP flow
  static Future<dynamic> requestPasswordOtp(String email) =>
      ApiClient.post('/auth/forgot-password/request-otp', body: {'email': email});

  static Future<dynamic> verifyPasswordOtp({required String email, required String otp}) =>
      ApiClient.post('/auth/forgot-password/verify-otp', body: {'email': email, 'otp': otp});

  static Future<dynamic> resetPassword({required String email, required String otp, required String password}) =>
      ApiClient.post('/auth/forgot-password/reset', body: {'email': email, 'otp': otp, 'password': password});

  static Future<bool> isAuthenticated() async => (await TokenStore.get()) != null;

  static Future<void> logout() async {
    Api.token = null;
    Api.user = null;
    await TokenStore.clear();
  }
}
