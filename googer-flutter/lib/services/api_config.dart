import 'package:flutter/foundation.dart' show kIsWeb;

/// Central API configuration.
///
/// Mirrors the web app's `services/apiConfig.ts`: production talks to the
/// backend through `https://expo.googer.site/api`. Override with
/// --dart-define=API_URL=...
class ApiConfig {
  ApiConfig._();

  /// Base URL for all API calls. Web uses same-origin /api so expo.googer.site
  /// can proxy without CORS; native points at the same expo.googer.site host.
  static const String _override = String.fromEnvironment(
    'API_URL',
    defaultValue: '',
  );

  static String get baseUrl {
    if (_override.isNotEmpty) return _override.replaceFirst(RegExp(r'/+$'), '');
    return kIsWeb ? '/api' : 'https://expo.googer.site/api';
  }
}
