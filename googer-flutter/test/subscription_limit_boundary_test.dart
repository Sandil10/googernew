import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/util/subscription_limits.dart';

void main() {
  group('subscription usage boundaries', () {
    for (final limit in const [1, 2, 3]) {
      test(
        'limit $limit allows counts below it and blocks the next create',
        () {
          expect(subscriptionLimitReached(limit - 1, limit), isFalse);
          expect(subscriptionLimitReached(limit, limit), isTrue);
          expect(subscriptionLimitReached(limit + 1, limit), isTrue);
        },
      );
    }

    test('zero limit means unlimited', () {
      expect(subscriptionLimitReached(0, 0), isFalse);
      expect(subscriptionLimitReached(1000000, 0), isFalse);
    });
  });

  group('Goog character boundary', () {
    test('exact limit is valid and only the next character exceeds it', () {
      expect(subscriptionTextLimitExceeded(2, 3), isFalse);
      expect(subscriptionTextLimitExceeded(3, 3), isFalse);
      expect(subscriptionTextLimitExceeded(4, 3), isTrue);
    });
  });

  group('upload-content plan defaults', () {
    test('matches the web defaults when admin fields are absent', () {
      expect(
        subscriptionContentLimit(
          const {},
          'content_upload_limit',
          isBasic: true,
        ),
        5,
      );
      expect(
        subscriptionContentLimit(
          const {},
          'content_daily_upload_limit',
          isBasic: false,
        ),
        3,
      );
      expect(
        subscriptionContentLimit(
          const {},
          'content_video_limit_minutes',
          isBasic: false,
        ),
        5,
      );
    });

    test(
      'keeps explicit admin values including fractional minutes and zero',
      () {
        const extra = <String, dynamic>{
          'content_upload_limit': 30,
          'content_daily_upload_limit': 5,
          'content_video_limit_minutes': 0.5,
        };
        expect(
          subscriptionContentLimit(
            extra,
            'content_upload_limit',
            isBasic: false,
          ),
          30,
        );
        expect(
          subscriptionContentLimit(
            extra,
            'content_daily_upload_limit',
            isBasic: false,
          ),
          5,
        );
        expect(
          subscriptionContentLimit(
            extra,
            'content_video_limit_minutes',
            isBasic: false,
          ),
          0.5,
        );
        expect(
          subscriptionContentLimit(
            const {'content_upload_limit': 0},
            'content_upload_limit',
            isBasic: false,
          ),
          0,
        );
      },
    );
  });
}
