import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/chat_dm_screen.dart';

void main() {
  test('chat ad thresholds match the web deterministic sequence', () {
    final first = chatAdThresholds('321495', 20);
    final second = chatAdThresholds('321495', 20);

    expect(second, first);
    expect(first, hasLength(20));
    expect(first.take(5), [9, 15, 23, 40, 50]);
    for (var i = 0; i < first.length; i++) {
      expect(first[i], inInclusiveRange((i * 10) + 1, (i * 10) + 10));
    }
  });
}
