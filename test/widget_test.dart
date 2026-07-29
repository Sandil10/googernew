import 'package:flutter_test/flutter_test.dart';
import 'package:googer_webview/main.dart';

void main() {
  test('internal hosts cover the production domains', () {
    // Navigation to these stays inside the shell; anything else is handed to
    // the OS so the user is never stranded off-site with no way back.
    expect(kInternalHosts, contains('googer.site'));
    expect(kInternalHosts, contains('www.googer.site'));
    expect(Uri.parse(kStartUrl).host, 'googer.site');
  });
}
