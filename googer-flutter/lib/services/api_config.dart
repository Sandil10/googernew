import 'package:flutter/foundation.dart' show kIsWeb;

/// Central API configuration.
///
/// Mirrors the web app's `services/apiConfig.ts`: production talks to the
/// backend through `https://googer.site/api`. Override with --dart-define=API_URL=...
class ApiConfig {
  ApiConfig._();

  /// Base URL for all API calls. Web uses same-origin /api so expo.googer.site
  /// can proxy without CORS; native uses the public backend URL.
  static const String _override = String.fromEnvironment(
    'API_URL',
    defaultValue: '',
  );

  static String get baseUrl {
    if (_override.isNotEmpty) return _override.replaceFirst(RegExp(r'/+$'), '');
    return kIsWeb ? '/api' : 'https://googer.site/api';
  }
}
