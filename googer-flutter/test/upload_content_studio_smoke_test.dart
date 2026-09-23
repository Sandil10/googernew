import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/data/mock.dart';
import 'package:googer_app/screens/upload_content_studio.dart';
import 'package:ionicons/ionicons.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Flash and Vault render different trees, so both need covering, at real
/// phone widths where two-column rows actually get tight.
void main() {
  const onePixelPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  test('editing preserves the original content id exactly', () {
    expect(
      uploadContentIdAfterPublish(
        isEditing: true,
        originalContentId: '12345678',
        serverContentId: '178739899568740',
      ),
      '12345678',
    );
    expect(
      uploadContentIdAfterPublish(
        isEditing: false,
        originalContentId: '',
        serverContentId: '8813463417',
      ),
      '8813463417',
    );
  });

  test('new upload content IDs match the web ten-digit format', () {
    final id = buildUploadContentId(
      now: DateTime.fromMillisecondsSinceEpoch(1787396931000),
      random: math.Random(7),
    );

    expect(id, matches(RegExp(r'^\d{10}$')));
    expect(id, startsWith('6931000'));
  });

  test('media selection rules match Flash and Vault contracts', () {
    expect(
      uploadContentMediaSelectionProblem(['video/mp4'], isFlash: true),
      isNull,
    );
    expect(
      uploadContentMediaSelectionProblem(['image/jpeg'], isFlash: true),
      contains('one video'),
    );
    expect(
      uploadContentMediaSelectionProblem([
        'video/mp4',
        'image/jpeg',
      ], isFlash: false),
      contains('not both'),
    );
    expect(
      uploadContentMediaSelectionProblem(
        List.filled(6, 'image/jpeg'),
        isFlash: false,
      ),
      contains('up to 5 images'),
    );
  });

  test('raw video preview defaults match the web editor', () {
    expect(
      uploadPreviewModeAfterMediaSelection(isFlash: false, hasVideo: true),
      'thumbnail',
    );
    expect(
      uploadPreviewModeAfterMediaSelection(isFlash: true, hasVideo: true),
      'auto_preview',
    );
    expect(
      uploadPreviewModeAfterMediaSelection(isFlash: false, hasVideo: false),
      'none',
    );
  });

  test('existing upload preview mode is preserved for metadata-only edits', () {
    expect(
      uploadPreviewModeForPublish(
        isEditing: true,
        hasNewMedia: false,
        hasVideo: true,
        hasNewThumbnail: false,
        selectedMode: 'thumbnail',
      ),
      'thumbnail',
    );
    expect(
      uploadPreviewModeForPublish(
        isEditing: true,
        hasNewMedia: false,
        hasVideo: true,
        hasNewThumbnail: false,
        selectedMode: 'auto_preview',
      ),
      'auto_preview',
    );
    expect(
      uploadPreviewModeForPublish(
        isEditing: false,
        hasNewMedia: true,
        hasVideo: true,
        hasNewThumbnail: false,
        selectedMode: 'none',
      ),
      'none',
    );
  });

  test(
    'vault preview and access choices follow the Web exclusivity matrix',
    () {
      bool disabled(String choice, String mode, {bool rawVideo = true}) =>
          vaultPreviewChoiceDisabled(
            choice: choice,
            selectedMode: mode,
            hasVideoLikeContent: true,
            hasRawVideo: rawVideo,
            canBlur: true,
            hasImageLikeContent: false,
          );

      expect(disabled('blurred', 'thumbnail'), isTrue);
      expect(disabled('unblurred', 'thumbnail'), isTrue);
      expect(disabled('auto_preview', 'thumbnail'), isTrue);
      expect(disabled('thumbnail', 'thumbnail'), isFalse);

      expect(disabled('thumbnail', 'none'), isFalse);
      expect(disabled('blurred', 'none'), isFalse);
      expect(disabled('unblurred', 'none'), isFalse);
      expect(disabled('auto_preview', 'none', rawVideo: false), isTrue);

      expect(disabled('thumbnail', 'blurred'), isTrue);
      expect(disabled('auto_preview', 'blurred'), isTrue);
      expect(disabled('unblurred', 'blurred'), isTrue);
      expect(disabled('blurred', 'blurred'), isFalse);
    },
  );

  test(
    'removed edit media never leaks its old type into a replacement link',
    () {
      expect(
        useExistingUploadContentMedia(
          isEditing: true,
          removed: true,
          hasNewMedia: false,
        ),
        isFalse,
      );
      expect(
        useExistingUploadContentMedia(
          isEditing: true,
          removed: false,
          hasNewMedia: false,
        ),
        isTrue,
      );
    },
  );

  test('linked thumbnails are persisted as the Web media preview', () {
    expect(
      uploadContentMediaPreviewForPublish(
        activeLink: 'https://youtu.be/jpo6VL9kIdQ',
        linkPreviewImage:
            'https://img.youtube.com/vi/jpo6VL9kIdQ/hqdefault.jpg',
        hasNewMedia: false,
        existingMediaPreview: '',
      ),
      'https://img.youtube.com/vi/jpo6VL9kIdQ/hqdefault.jpg',
    );
    expect(
      uploadContentMediaPreviewForPublish(
        activeLink: '',
        linkPreviewImage: '',
        hasNewMedia: false,
        existingMediaPreview: '/uploads/existing-preview.jpg',
      ),
      '/uploads/existing-preview.jpg',
    );
  });

  test(
    'existing thumbnail survives media replacement until explicitly removed',
    () {
      expect(
        preserveExistingUploadContentThumbnail(
          hasNewThumbnail: false,
          removed: false,
          existingThumbnail: '/uploads/current-thumbnail.jpg',
        ),
        isTrue,
      );
      expect(
        preserveExistingUploadContentThumbnail(
          hasNewThumbnail: false,
          removed: true,
          existingThumbnail: '/uploads/current-thumbnail.jpg',
        ),
        isFalse,
      );
    },
  );

  test('linked-content home flag is false for raw uploads', () {
    expect(
      uploadContentShowLinkedContentOnHomeForPublish(
        activeLink: '',
        selected: true,
      ),
      isFalse,
    );
    expect(
      uploadContentShowLinkedContentOnHomeForPublish(
        activeLink: 'https://example.com/video.mp4',
        selected: true,
      ),
      isTrue,
    );
  });

  test('tags split delimiters, deduplicate, and stop at twenty', () {
    final initial = List.generate(19, (index) => 'tag$index');
    final result = mergeUploadContentTags(initial, '#tag1, final ignored');

    expect(result, hasLength(20));
    expect(result.where((tag) => tag == 'tag1'), hasLength(1));
    expect(result.last, 'final');
    expect(result, isNot(contains('ignored')));
  });

  test('active subscription resolves its public upload video limit', () {
    final plan = resolveUploadContentPlan(
      null,
      {'status': 'active', 'plan_id': 3, 'plan_slug': 'package-3'},
      [
        {
          'id': 3,
          'slug': 'package-3',
          'name': 'Package 3',
          'price': 3,
          'extra': '{"content_video_limit_minutes":20}',
        },
      ],
    );

    expect(plan?['name'], 'Package 3');
    expect(uploadContentVideoLimitMinutes(plan), 20);
  });

  test('direct plan keeps authority and fills missing public extra', () {
    final plan = resolveUploadContentPlan(
      {'id': 2, 'slug': 'package-2', 'price': 2},
      {'status': 'active', 'plan_id': 2},
      [
        {
          'id': 2,
          'slug': 'package-2',
          'price': 2,
          'extra': {'content_video_limit_minutes': 1},
        },
      ],
    );

    expect(uploadContentVideoLimitMinutes(plan), 1);
  });

  test('video limit fallbacks match web basic and paid rules', () {
    expect(uploadContentVideoLimitMinutes({'slug': 'basic', 'price': 0}), 1);
    expect(
      uploadContentVideoLimitMinutes({'slug': 'package-1', 'price': 1}),
      5,
    );
  });

  test('video recommendation matches the web plan ordering', () {
    final plans = <Map<String, dynamic>>[
      {
        'name': 'Package 3',
        'price': 3,
        'extra': {'content_video_limit_minutes': 20},
      },
      {
        'name': 'Package 2',
        'price': 2,
        'extra': '{"content_video_limit_minutes":1}',
      },
      {
        'name': 'Plan 1',
        'price': 1,
        'extra': {'content_video_limit_minutes': 0.5},
      },
    ];

    final recommended = recommendedVideoPlanForDuration(
      plans,
      currentLimitMinutes: 0.5,
      videoDurationSeconds: 52,
    );

    expect(recommended?['name'], 'Package 2');
    expect(recommended?['_video_limit_minutes'], 1);
  });

  test('video recommendation falls back to the next higher plan', () {
    final recommended = recommendedVideoPlanForDuration(
      [
        {
          'name': 'Package 2',
          'price': 2,
          'extra': {'content_video_limit_minutes': 1},
        },
      ],
      currentLimitMinutes: 0.5,
      videoDurationSeconds: 180,
    );

    expect(recommended?['name'], 'Package 2');
  });

  for (final mode in const ['flash', 'vault']) {
    for (final size in const [Size(430, 900), Size(360, 780)]) {
      testWidgets('$mode renders at ${size.width}x${size.height}', (
        tester,
      ) async {
        await tester.binding.setSurfaceSize(size);
        addTearDown(() => tester.binding.setSurfaceSize(null));

        await tester.pumpWidget(
          MaterialApp(home: UploadContentStudio(initialMode: mode)),
        );
        await tester.pump(const Duration(milliseconds: 300));

        expect(tester.takeException(), isNull);
        expect(
          find.text(
            mode == 'flash' ? 'FLASH CONTENT STUDIO' : 'VAULT CONTENT STUDIO',
          ),
          findsOneWidget,
        );
        expect(find.text('Apply Link'), findsOneWidget);
      });
    }
  }

  testWidgets('vault price stays empty while showing the admin range', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    final price = tester.widget<TextField>(
      find.byKey(const Key('upload-content-price')),
    );
    expect(price.controller?.text, isEmpty);
    expect(find.textContaining('Min Rupieer'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('five Vault images use the selectable Web gallery layout', (
    tester,
  ) async {
    final files = List.generate(
      5,
      (index) => {
        'filename': 'image-${index + 1}.png',
        'contentType': 'image/png',
        'bytes': onePixelPng,
      },
    );
    SharedPreferences.setMockInitialValues({
      'googer-upload-content-draft-vault-v1': jsonEncode({'media': files}),
    });
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('5 images selected'), findsOneWidget);
    expect(find.text('1 x 1'), findsOneWidget);
    expect(find.text('MAIN'), findsOneWidget);
    expect(
      find.byKey(const Key('upload-selected-image-preview')),
      findsOneWidget,
    );
    for (var index = 0; index < 5; index++) {
      expect(
        find.byKey(ValueKey('upload-gallery-image-$index')),
        findsOneWidget,
      );
    }
    await tester.tap(find.byKey(const ValueKey('upload-gallery-image-3')));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('flash hides vault-only sections', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'flash')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Flash Content Media'), findsOneWidget);
    expect(find.text('SELECT VIDEO ONLY'), findsOneWidget);
    expect(find.text('Thumbnail'), findsOneWidget);
    expect(find.text('THUMBNAIL'), findsOneWidget);
    expect(find.text('UPLOAD THUMBNAIL'), findsOneWidget);
    expect(
      find.text('Thumbnail box always stays available here.'),
      findsOneWidget,
    );
    // Content Access and Share Commission are Vault-only.
    expect(find.text('Content Access'), findsNothing);
    expect(find.text('SHARE COMMISSION'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('vault shows its own sections', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Vault Content Media'), findsOneWidget);
    expect(find.text('SELECT VIDEO OR UP TO 5 IMAGES'), findsOneWidget);
    expect(find.text('Thumbnail'), findsOneWidget);
    expect(find.text('THUMBNAIL'), findsOneWidget);
    expect(find.text('UPLOAD THUMBNAIL'), findsOneWidget);
    expect(
      find.text('Thumbnail box always stays available here.'),
      findsOneWidget,
    );
    expect(find.text('Content Access'), findsNothing);
    expect(find.text('NON BLURRED'), findsNothing);
    expect(find.text('SHARE COMMISSION'), findsOneWidget);
    expect(find.text('Choose topics'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('upload-content-details-panel')),
        matching: find.text('Tags'),
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('topic picker opens as an anchored overlay', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.byKey(const Key('upload-content-topic-field')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('upload-content-topic-menu')), findsOneWidget);
    await tester.tap(find.text('Comedy').last);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('upload-content-topic-menu')), findsNothing);
    expect(find.text('Comedy'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('title is limited to fifty characters', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    final titleField = find.byWidgetPredicate(
      (widget) =>
          widget is TextField &&
          widget.decoration?.hintText == 'Write short description...',
    );
    await tester.enterText(titleField, 'x' * 60);

    final field = tester.widget<TextField>(titleField);
    expect(field.controller?.text, hasLength(50));
  });

  testWidgets('cancel opens the web-parity draft choice', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('CANCEL').first);
    await tester.pumpAndSettle();

    expect(find.text('CANCEL VAULT CONTENT'), findsOneWidget);
    expect(find.text('SAVE DRAFT'), findsOneWidget);
    expect(find.text('DISCARD'), findsOneWidget);
  });

  testWidgets('saved Vault draft restores editable values', (tester) async {
    SharedPreferences.setMockInitialValues({
      'googer-upload-content-draft-vault-v1':
          '{"title":"Saved title","topic":"Science","tags":["qa","video"],"visibility":"private","allowComments":false,"price":10}',
    });
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Saved title'), findsWidgets);
    expect(find.text('Science'), findsWidgets);
    expect(find.text('#qa'), findsOneWidget);
    expect(find.text('#video'), findsOneWidget);
    expect(find.textContaining('Visibility: Private'), findsOneWidget);
    final price = tester.widget<TextField>(
      find.byKey(const Key('upload-content-price')),
    );
    expect(price.controller?.text, isEmpty);
  });

  testWidgets('new content changes auto-save like the web editor', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(430, 1800));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));
    final titleField = find.byWidgetPredicate(
      (widget) =>
          widget is TextField &&
          widget.decoration?.hintText == 'Write short description...',
    );
    await tester.enterText(titleField, 'Auto saved content title');
    await tester.pump(const Duration(milliseconds: 400));

    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString('googer-upload-content-draft-vault-v1');
    expect(raw, isNotNull);
    expect(raw, contains('Auto saved content title'));
  });

  testWidgets('the swap control moves between modes', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Vault Content Media'), findsOneWidget);

    const linkedVideo = 'https://youtu.be/kuDQclcmJNg';
    await tester.enterText(find.byType(TextField).first, linkedVideo);
    await tester.tap(find.text('APPLY'));
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('Flash Content'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Flash Content Media'), findsOneWidget);
    expect(find.text('Content Access'), findsNothing);
    expect(find.text(linkedVideo), findsWidgets);
    expect(find.text('REMOVE'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('applied YouTube link shows its metadata title', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'flash')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await tester.enterText(
      find.byType(TextField).first,
      'https://youtu.be/kuDQclcmJNg',
    );
    await tester.tap(find.text('APPLY'));
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('YouTube preview'), findsWidgets);
    expect(find.text('REMOVE'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('vault preview modes lock the competing Web controls', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await tester.enterText(
      find.byType(TextField).first,
      'https://youtu.be/kuDQclcmJNg',
    );
    await tester.tap(find.text('APPLY'));
    await tester.pump(const Duration(milliseconds: 50));
    final thumbnailMode = find.byKey(
      const Key('upload-preview-mode-thumbnail'),
    );
    final thumbnailSelected = tester.widget<GestureDetector>(thumbnailMode);
    expect(thumbnailSelected.onTap, isNotNull);
    await tester.tap(thumbnailMode);
    await tester.pump();

    final blurredWhileThumbnailSelected = tester.widget<GestureDetector>(
      find.byKey(const Key('upload-content-access-blurred')),
    );
    expect(blurredWhileThumbnailSelected.onTap, isNull);

    await tester.tap(thumbnailMode);
    await tester.pump();

    final blurredBeforeSelection = tester.widget<GestureDetector>(
      find.byKey(const Key('upload-content-access-blurred')),
    );
    expect(blurredBeforeSelection.onTap, isNotNull);

    await tester.tap(
      find.byKey(const Key('upload-content-access-blurred')),
      warnIfMissed: false,
    );
    await tester.pump();

    expect(
      find.text('Blurred is selected, so thumbnail is locked.'),
      findsOneWidget,
    );
    final nonBlurred = tester.widget<GestureDetector>(
      find.byKey(const Key('upload-content-access-unblurred')),
    );
    expect(nonBlurred.onTap, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'publish stays disabled until terms and then validates an applied link',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      await tester.binding.setSurfaceSize(const Size(430, 2400));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        const MaterialApp(home: UploadContentStudio(initialMode: 'flash')),
      );
      await tester.pump(const Duration(milliseconds: 300));

      final publish = find.byKey(const Key('upload-content-publish'));
      expect(
        tester.widget<GestureDetector>(publish).onTap,
        isNull,
        reason: 'Web keeps Publish disabled until terms are accepted.',
      );

      const linkedVideo = 'https://youtu.be/kuDQclcmJNg';
      await tester.enterText(find.byType(TextField).first, linkedVideo);
      await tester.tap(find.text('APPLY'));
      await tester.pump(const Duration(milliseconds: 300));

      await tester.tap(find.byKey(const Key('upload-content-terms-toggle')));
      await tester.pump();
      expect(tester.widget<GestureDetector>(publish).onTap, isNotNull);

      await tester.tap(publish);
      await tester.pumpAndSettle();
      expect(find.text('REQUIRED FIELD'), findsOneWidget);
      expect(find.text('Please select topics.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('publish reports the first missing field in web order', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'flash')),
    );
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byKey(const Key('upload-content-terms-toggle')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('upload-content-publish')));
    await tester.pumpAndSettle();

    expect(find.text('REQUIRED FIELD'), findsOneWidget);
    expect(find.text('Please add a link or upload an image.'), findsOneWidget);
    expect(find.text('Please select topics.'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('vault subscription sheet loads and can reuse a saved preset', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'googer-upload-content-subscription-packages-v2':
          '[{"label":"Package 1","price":25,"minutes":10,"affiliateCommission":4}]',
    });
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await tester.tap(find.text('+ ADD SUBSCRIPTION ACCESS'));
    await tester.pumpAndSettle();

    expect(find.text('Subscription Access Packages'), findsOneWidget);
    expect(find.text('USE SAVED'), findsOneWidget);
    expect(find.text('SAVE FOR FUTURE'), findsOneWidget);
    expect(find.textContaining('AUTO COMMISSION'), findsNothing);
    expect(
      tester
          .widget<Icon>(find.byKey(const Key('subscription-access-checkbox')))
          .icon,
      Ionicons.checkbox,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('vault subscription sheet can remove and clear its last preset', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'googer-upload-content-subscription-packages-v2':
          '[{"label":"Package 1","price":25,"minutes":10,"affiliateCommission":4}]',
    });
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      const MaterialApp(home: UploadContentStudio(initialMode: 'vault')),
    );
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('+ ADD SUBSCRIPTION ACCESS'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('REMOVE'));
    await tester.pump();
    expect(find.text('REMOVE'), findsNothing);

    await tester.tap(find.text('SAVE FOR FUTURE'));
    await tester.pumpAndSettle();
    final preferences = await SharedPreferences.getInstance();
    expect(
      preferences.getString('googer-upload-content-subscription-packages-v2'),
      '[]',
    );

    await tester.tap(find.byKey(const Key('subscription-packages-apply')));
    await tester.pumpAndSettle();
    expect(find.text('Subscription Access Packages'), findsNothing);
    expect(find.textContaining('APPLIED SUBSCRIPTION PACKAGES'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('existing vault content opens as a prefilled edit', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const item = UploadContent(
      ownerUserId: '42',
      id: 7,
      contentId: 'vault-7',
      type: 'vault',
      topic: 'Science',
      description: 'Existing title',
      hashtags: '#space #news',
      thumbnail: 'https://example.com/thumb.webp',
      thumbnailSource: '/uploads/thumb.webp',
      mediaUrl: 'https://example.com/video.mp4',
      mediaGallery: ['https://example.com/video.mp4'],
      mediaGallerySource: ['/uploads/video.mp4'],
      mediaPreviewSource: '/uploads/video.mp4',
      mediaType: 'video',
      externalLink: '',
      visibility: 'subscribers_only',
      contentAccessMode: 'unblurred',
      affiliateCommission: 4,
      showLinkOnHome: true,
      previewMode: 'thumbnail',
      videoDurationSeconds: 30,
      coins: 25,
      username: 'hee',
      fullName: 'Hee',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
      subscriptionPackages: [
        UploadSubscriptionPackage(id: 'package-1', price: 20, minutes: 10),
      ],
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: UploadContentStudio(initialMode: 'vault', initialContent: item),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Existing title'), findsWidgets);
    expect(find.text('Uploaded video'), findsOneWidget);
    expect(find.text('Creative ready'), findsOneWidget);
    expect(find.text('Current video'), findsNothing);
    expect(
      find.byKey(const Key('upload-content-existing-preview-thumbnail')),
      findsOneWidget,
    );
    expect(find.text('LIVE CONTENT'), findsNothing);
    expect(find.text('Science'), findsWidgets);
    expect(find.text('THUMBNAIL'), findsOneWidget);
    expect(find.text('3-SEC PREVIEW'), findsOneWidget);
    final thumbnailTop = tester.getTopLeft(find.text('THUMBNAIL')).dy;
    final autoPreviewTop = tester.getTopLeft(find.text('3-SEC PREVIEW')).dy;
    expect(autoPreviewTop, greaterThan(thumbnailTop));
    expect(find.text('SELECT VIDEO OR UP TO 5 IMAGES'), findsNothing);
    final fieldValues = tester
        .widgetList<TextField>(find.byType(TextField))
        .map((field) => field.controller?.text ?? '')
        .toList();
    expect(fieldValues, contains('25'));
    expect(fieldValues, contains('4.0'));
    expect(fieldValues, contains('1.00'));
    expect(find.text('APPLIED SUBSCRIPTION PACKAGES (1/3)'), findsOneWidget);
    expect(find.text('Package 1'), findsWidgets);
    expect(find.text('Rupieer 20 / 10 Minutes / 0%'), findsOneWidget);

    await tester.tap(find.text('THUMBNAIL'));
    await tester.pump();
    final autoPreviewButton = tester.widget<GestureDetector>(
      find
          .ancestor(
            of: find.text('3-SEC PREVIEW'),
            matching: find.byType(GestureDetector),
          )
          .first,
    );
    expect(autoPreviewButton.onTap, isNotNull);
    await tester.tap(find.text('3-SEC PREVIEW'));
    await tester.pump();
    expect(
      find.text('Click 3-sec Preview after selecting a raw video.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('existing media can keep a separately applied linked content', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const item = UploadContent(
      ownerUserId: '42',
      id: 17,
      contentId: 'vault-17',
      type: 'vault',
      topic: 'Science',
      description: 'Existing video',
      hashtags: '#science',
      thumbnail: 'https://example.com/thumb.webp',
      mediaUrl: 'https://example.com/video.mp4',
      mediaGallery: ['https://example.com/video.mp4'],
      mediaType: 'video',
      visibility: 'public',
      contentAccessMode: 'unblurred',
      previewMode: 'thumbnail',
      coins: 0,
      username: 'hee',
      fullName: 'Hee',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: UploadContentStudio(initialMode: 'vault', initialContent: item),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    await tester.enterText(
      find.byType(TextField).first,
      'https://youtu.be/kuDQclcmJNg',
    );
    await tester.tap(find.text('APPLY'));
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Uploaded video'), findsOneWidget);
    expect(find.text('YouTube preview'), findsWidgets);
    expect(find.text('REMOVE'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('existing raw video renders in mobile and desktop previews', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const item = UploadContent(
      ownerUserId: '42',
      id: 8,
      contentId: 'flash-8',
      type: 'flash',
      topic: 'Comedy',
      description: 'Existing raw video',
      hashtags: '#video',
      thumbnail: '',
      mediaUrl: 'https://example.com/video.mp4',
      mediaGallery: ['https://example.com/video.mp4'],
      mediaGallerySource: ['/uploads/video.mp4'],
      mediaPreviewSource: '/uploads/video.mp4',
      mediaType: 'video',
      videoDurationSeconds: 30,
      coins: 0,
      username: 'hee',
      fullName: 'Hee',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      const MaterialApp(
        home: UploadContentStudio(initialMode: 'flash', initialContent: item),
      ),
    );
    await tester.pump(const Duration(milliseconds: 300));

    expect(
      find.byKey(const Key('upload-content-existing-video-preview')),
      findsOneWidget,
    );
    expect(find.text('LIVE CONTENT'), findsNothing);

    await tester.tap(find.text('DESKTOP'));
    await tester.pump();

    expect(
      find.byKey(const Key('upload-content-existing-video-preview')),
      findsOneWidget,
    );
    expect(find.text('LIVE CONTENT'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
