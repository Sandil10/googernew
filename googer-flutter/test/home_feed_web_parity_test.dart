import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/screens/home_feed_screen.dart';
import 'package:visibility_detector/visibility_detector.dart';

void main() {
  VisibilityDetectorController.instance.updateInterval = Duration.zero;

  test('home feed viewer seed follows the shared web contract', () {
    expect(
      homeFeedViewerSeedForWebParity(
        id: 102811,
        userId: '312495',
        username: 'googer',
      ),
      'googer-home-feed-v2:102811',
    );
    expect(
      homeFeedViewerSeedForWebParity(username: 'googer'),
      'googer-home-feed-v2:googer',
    );
    expect(homeFeedViewerSeedForWebParity(), 'googer-home-feed-v2:guest');
  });

  test('home feed seeded shuffle matches web app order', () {
    expect(homeFeedHashStringToSeedForWebParity('seed-123'), 3408388541);

    final ordered = homeFeedShuffleItemsWithSeedForWebParity(
      [
        {'id': '10'},
        {'id': '2'},
        {'id': '30'},
        {'id': '4'},
      ],
      'seed-123',
      (item) => item['id']!,
    );

    expect(ordered.map((item) => item['id']), ['2', '10', '4', '30']);
  });

  test('home feed mixed upload keys match web app order', () {
    final posts = [
      {'id': '55'},
      {'id': '7'},
      {'id': '123'},
    ];
    final validPosts = homeFeedShuffleItemsWithSeedForWebParity(
      posts,
      'home-seed',
      (post) => post['id']!,
    );
    final uploads = [
      {'key': 'home-upload-content-6313375783-von-2026-08-26T09:22:35Z'},
      {'key': 'home-upload-content-3808822261-original-'},
    ];
    final mixed = homeFeedShuffleItemsWithSeedForWebParity(
      [
        ...validPosts.map((post) => 'goog-${post['id']}'),
        ...uploads.map((upload) => upload['key']!),
      ],
      'home-seed:mixed-organic',
      (key) => key,
    );

    expect(mixed, [
      'goog-123',
      'home-upload-content-6313375783-von-2026-08-26T09:22:35Z',
      'goog-55',
      'goog-7',
      'home-upload-content-3808822261-original-',
    ]);
  });
}
