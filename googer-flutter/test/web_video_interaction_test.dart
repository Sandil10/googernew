import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/util/web_video.dart';

void main() {
  test('inline video passes pointer input through to feed actions', () {
    final player = webVideo(
      'https://example.com/video.mp4',
      interactive: false,
    );

    expect(player, isA<IgnorePointer>());
    expect((player as IgnorePointer).ignoring, isTrue);
  });

  test('full viewer video remains interactive', () {
    final player = webVideo('https://example.com/video.mp4');

    expect(player, isA<IgnorePointer>());
    expect((player as IgnorePointer).ignoring, isFalse);
  });
}
