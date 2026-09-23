import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/util/goog_link_preview.dart';

void main() {
  test('new Goog preview matches web URL normalization', () {
    final preview = googLinkPreview('watch www.youtube.com/watch?v=abc123 now');

    expect(preview, isNotNull);
    expect(preview!.href, 'https://www.youtube.com/watch?v=abc123');
    expect(preview.host, 'youtube.com');
    expect(preview.videoLabel, 'YouTube');
    expect(
      preview.videoThumbnail,
      'https://img.youtube.com/vi/abc123/hqdefault.jpg',
    );
  });

  test('new Goog preview accepts direct video and ordinary links', () {
    expect(
      googLinkPreview('https://cdn.example.com/file.mp4')!.videoLabel,
      'Video',
    );
    expect(googLinkPreview('https://googer.site/profile')!.host, 'googer.site');
    expect(googLinkPreview('plain text only'), isNull);
  });
}
