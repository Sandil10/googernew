import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/data/mock.dart';
import 'package:googer_app/screens/home_feed_screen.dart';
import 'package:googer_app/screens/profile_screen.dart';
import 'package:googer_app/theme/app_theme.dart';
import 'package:ionicons/ionicons.dart';
import 'package:visibility_detector/visibility_detector.dart';

void main() {
  VisibilityDetectorController.instance.updateInterval = Duration.zero;

  test('upload-content access follows purchase expiry', () {
    final now = DateTime.utc(2026, 8, 23, 12);

    expect(
      uploadContentAccessIsActive(
        hasAccess: true,
        isOwner: false,
        purchaseExpiresAt: '2026-08-23T11:59:59Z',
        now: now,
      ),
      isFalse,
    );
    expect(
      uploadContentAccessIsActive(
        hasAccess: true,
        isOwner: false,
        purchaseExpiresAt: '2026-08-23T12:00:01Z',
        now: now,
      ),
      isTrue,
    );
    expect(
      uploadContentAccessIsActive(
        hasAccess: true,
        isOwner: true,
        purchaseExpiresAt: '2026-08-23T11:59:59Z',
        now: now,
      ),
      isTrue,
    );
    expect(
      uploadContentAccessIsActive(
        hasAccess: true,
        isOwner: false,
        purchaseExpiresAt: '',
        now: now,
      ),
      isTrue,
    );
  });

  test('upload-content blur follows content access mode only', () {
    expect(uploadContentShouldBlur('blurred'), isTrue);
    expect(uploadContentShouldBlur('Blurred'), isTrue);
    expect(uploadContentShouldBlur('unblurred'), isFalse);
    expect(uploadContentShouldBlur('non blurred'), isFalse);
    expect(uploadContentShouldBlur('non-blurred'), isFalse);
  });

  for (final size in const [Size(430, 900), Size(360, 780)]) {
    testWidgets('profile renders at ${size.width}x${size.height}', (
      tester,
    ) async {
      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(const MaterialApp(home: ProfileScreen()));
      await tester.pump(const Duration(milliseconds: 300));

      expect(tester.takeException(), isNull);
      // The header rework: Googers count, Subscribe, and the two tabs.
      expect(find.text('Googers'), findsWidgets);
      expect(find.text('Subscribe'), findsOneWidget);
      expect(find.text('Products'), findsOneWidget);
    });
  }

  testWidgets('edit/share profile buttons are gone from the header', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 1400));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(const MaterialApp(home: ProfileScreen()));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Edit profile'), findsNothing);
    // "Share profile" now lives in the ⋯ menu, not as a header button.
    expect(find.text('Share profile'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test('theme mode persists through AppTheme', () {
    AppTheme.set(ThemeMode.system);
    expect(AppTheme.mode, ThemeMode.system);
    AppTheme.set(ThemeMode.dark);
    expect(AppTheme.mode, ThemeMode.dark);
  });

  testWidgets('paid profile ad shows saved bookmark and expiry warning', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(407, 675));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    const ad = HomeAd(
      adId: '123456',
      campaignType: 'Photo and Video',
      title: 'Saved ad',
      description: '',
      mediaType: 'video',
      username: 'googer',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeAdFeedCard(
            ad: ad,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
            showSaveButton: true,
            initialSaved: true,
            savedStateKnown: true,
            showExpiryWarning: true,
          ),
        ),
      ),
    );

    expect(find.byIcon(Ionicons.bookmark), findsOneWidget);
    expect(find.text('Your video will be removed soon'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('basic profile ad hides the save control', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const ad = HomeAd(
      adId: '123456',
      campaignType: 'Photo and Video',
      title: 'Basic ad',
      description: '',
      mediaType: 'photo',
      username: 'googer',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeAdFeedCard(
            ad: ad,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );

    expect(find.byIcon(Ionicons.bookmark), findsNothing);
    expect(find.byIcon(Ionicons.bookmark_outline), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('vault card opens creator subscription package selector', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const upload = UploadContent(
      id: 91,
      type: 'vault',
      topic: 'Science',
      description: 'Subscriber content',
      hashtags: '#science',
      thumbnail: '',
      mediaUrl: '',
      coins: 10,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
      subscriptionPackages: [
        UploadSubscriptionPackage(id: 'starter', price: 30, minutes: 10),
        UploadSubscriptionPackage(id: 'plus', price: 50, minutes: 30),
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('WATCH ALL CONTENT'), findsOneWidget);
    await tester.tap(find.text('WATCH ALL CONTENT'));
    await tester.pumpAndSettle();

    expect(find.text('Subscribe for full access'), findsOneWidget);
    expect(find.text('10 minutes full access'), findsOneWidget);
    expect(find.text('30 Coins'), findsOneWidget);
    expect(find.text('30 minutes full access'), findsOneWidget);
    expect(find.text('50 Coins'), findsOneWidget);
    expect(find.text('CONFIRM SUBSCRIBE'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('vault WATCH NOW keeps web-style label before confirmation', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(407, 675));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final previousUser = Api.user;
    Api.user = {'id': 77, 'user_id': '312495', 'wallet_balance': 100};
    addTearDown(() => Api.user = previousUser);

    const upload = UploadContent(
      id: 194,
      type: 'vault',
      topic: 'Comedy',
      description: 'Paid vault content',
      hashtags: '#vault',
      thumbnail: 'https://example.com/thumb.jpg',
      mediaUrl: 'https://example.com/video.mp4',
      mediaType: 'video',
      status: 'approved',
      coins: 10,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('WATCH NOW'), findsOneWidget);
    await tester.tap(find.text('WATCH NOW'));
    await tester.pump();

    expect(find.text('UNLOCKING'), findsNothing);
    expect(find.text('WATCH NOW'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Watch Content'), findsOneWidget);
    expect(find.text('Confirm & Watch'), findsOneWidget);
    await tester.tap(find.text('Confirm & Watch'));
    await tester.pump();
    expect(find.text('Unlocking...'), findsNothing);
    expect(find.text('Confirm & Watch'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('vault share opens immediately and exposes Share & Earn', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(407, 675));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final previousUser = Api.user;
    Api.user = {'id': 77, 'user_id': '312495', 'username': 'hee'};
    addTearDown(() => Api.user = previousUser);

    const upload = UploadContent(
      id: 191,
      contentId: '8813463417',
      shareCode: '5slqqwkw',
      type: 'vault',
      topic: 'Comedy',
      description: 'Vault share content',
      hashtags: '#vault',
      thumbnail: 'https://example.com/thumb.jpg',
      mediaUrl: 'https://example.com/video.mp4',
      mediaType: 'video',
      affiliateCommission: 10,
      coins: 10,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.byIcon(Ionicons.share_social_outline).last);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('upload-share-earn')), findsOneWidget);
    expect(find.text('Share & Earn'), findsOneWidget);
    expect(
      tester.getCenter(find.byKey(const Key('upload-share-earn'))).dy,
      lessThan(675),
    );
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('upload-share-earn')));
    await tester.pump();
    expect(find.text('10%'), findsWidgets);
    expect(find.text('SHARE COMMISSION'), findsOneWidget);
    expect(find.text('10% per eligible watch'), findsOneWidget);
    expect(find.text('Credited after eligible watch.'), findsOneWidget);
    expect(find.text('Generate Share'), findsOneWidget);
    final backControl = find.byKey(const Key('share-link-back'));
    expect(backControl, findsOneWidget);
    expect(find.text('BACK'), findsOneWidget);
    expect(
      find.descendant(
        of: backControl,
        matching: find.byIcon(Ionicons.chevron_back),
      ),
      findsOneWidget,
    );
    // The Web reference uses a bare chevron + BACK label, not a circular
    // background. Keep this structural check so the compact icon-only style
    // cannot return unnoticed.
    expect(
      find.descendant(of: backControl, matching: find.byType(Container)),
      findsNothing,
    );
    final backRect = tester.getRect(backControl);
    final titleRect = tester.getRect(find.text('Share Link'));
    final closeRect = tester.getRect(find.byIcon(Ionicons.close));
    expect(titleRect.left, greaterThan(backRect.right));
    expect(closeRect.left, greaterThan(titleRect.left));
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Generate Share'));
    await tester.pump();
    expect(find.text('SHARE LINK READY'), findsOneWidget);
    expect(find.text('YOUR SHARE LINK'), findsOneWidget);
    expect(
      find.text('https://googer.site/reel/5slqqwkw/312495'),
      findsOneWidget,
    );
    expect(find.text('Copy Share Link'), findsOneWidget);
    expect(find.text('SHARE YOUR SHARE LINK'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('share-link-back')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('upload-share-earn')), findsOneWidget);
    expect(find.text('BACK'), findsNothing);
  });

  testWidgets('other-user upload menu matches the web action set', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 1100));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const upload = UploadContent(
      id: 92,
      ownerUserId: 'other-user',
      type: 'flash',
      topic: 'Science',
      description: 'Other creator content',
      hashtags: '#science',
      thumbnail: '',
      mediaUrl: '',
      coins: 10,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('upload-content-menu-92')));
    await tester.pumpAndSettle();

    expect(find.text('Share'), findsOneWidget);
    expect(find.text('Promote'), findsOneWidget);
    expect(find.text('Not Interested'), findsOneWidget);
    expect(find.text('Report'), findsOneWidget);
    expect(find.text('Insights'), findsNothing);
    expect(find.text('Edit'), findsNothing);
    expect(find.text('Delete'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pending profile upload keeps the static review presentation', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const upload = UploadContent(
      id: 93,
      ownerUserId: 'current-user',
      type: 'flash',
      topic: 'Comedy',
      description: 'Review content',
      hashtags: '#comedy',
      thumbnail: 'https://example.com/poster.jpg',
      mediaUrl: 'https://example.com/video.mp4',
      mediaType: 'video',
      status: 'pending',
      coins: 0,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            profilePresentation: true,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('WATCH NOW'), findsOneWidget);
    expect(find.text('WATCH MORE'), findsNothing);
    expect(find.text('REVIEWING'), findsOneWidget);
    expect(
      find.text('Waiting for admin approval. Other users cannot see it yet.'),
      findsOneWidget,
    );
    await tester.tap(find.text('WATCH NOW'));
    await tester.pump();

    expect(find.text('WATCH NOW'), findsNothing);
    expect(find.text('BACK'), findsNothing);
    expect(
      find.text('Waiting for admin approval. Other users cannot see it yet.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('basic approved profile upload shows dynamic expiry notice', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final previousUser = Api.user;
    // The live profile can carry an internal owner id while the cached account
    // exposes a public Googer id. Own-profile presentation is authoritative.
    Api.user = {'user_id': '312495'};
    addTearDown(() => Api.user = previousUser);

    const upload = UploadContent(
      id: 94,
      ownerUserId: '5',
      type: 'vault',
      topic: 'Comedy',
      description: 'Approved basic content',
      hashtags: '#comedy',
      thumbnail: 'https://example.com/poster.jpg',
      mediaUrl: '',
      status: 'Approved',
      approvalPlanSlug: 'basic',
      approvalExpiryValue: 10,
      approvalExpiryUnit: 'minutes',
      ownerHasPaidPlan: false,
      coins: 0,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            profilePresentation: true,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(
      find.text(
        'This content will be deleted from your profile after 10 minutes. Get a subscription package to keep it on your profile.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('Waiting for admin approval. Other users cannot see it yet.'),
      findsNothing,
    );
  });

  testWidgets('paid approved profile upload shows plan expiry notice', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final previousUser = Api.user;
    Api.user = {'id': 'current-user'};
    addTearDown(() => Api.user = previousUser);

    const upload = UploadContent(
      id: 95,
      ownerUserId: 'current-user',
      type: 'flash',
      topic: 'Comedy',
      description: 'Approved content',
      hashtags: '#comedy',
      thumbnail: 'https://example.com/poster.jpg',
      mediaUrl: '',
      status: 'Approved',
      approvalPlanSlug: 'package-1',
      approvalExpiryValue: 30,
      approvalExpiryUnit: 'days',
      ownerHasPaidPlan: true,
      coins: 0,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            profilePresentation: true,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(
      find.text(
        'This content will be deleted from your profile after 30 days. This is based on your current subscription package.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('profile expiry notice stays off the home feed', (tester) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final previousUser = Api.user;
    Api.user = {'id': 'current-user'};
    addTearDown(() => Api.user = previousUser);

    const upload = UploadContent(
      id: 96,
      ownerUserId: 'current-user',
      type: 'flash',
      topic: 'Comedy',
      description: 'Approved paid content',
      hashtags: '#comedy',
      thumbnail: 'https://example.com/poster.jpg',
      mediaUrl: '',
      status: 'Approved',
      approvalPlanSlug: 'package-1',
      approvalExpiryValue: 30,
      approvalExpiryUnit: 'days',
      ownerHasPaidPlan: true,
      coins: 0,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            profilePresentation: false,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(
      find.textContaining('deleted from your profile after'),
      findsNothing,
    );
  });

  testWidgets('raw flash preview falls back to WATCH MORE after its window', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const upload = UploadContent(
      id: 94,
      ownerUserId: 'current-user',
      type: 'flash',
      topic: 'Comedy',
      description: 'Automatic preview',
      hashtags: '#comedy',
      thumbnail: '',
      mediaUrl: 'https://example.com/video.mp4',
      mediaGallery: ['https://example.com/video.mp4'],
      mediaType: 'video',
      previewMode: 'auto_preview',
      status: 'approved',
      coins: 0,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            profilePresentation: true,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('WATCH MORE'), findsNothing);
    await tester.pump(
      Duration(milliseconds: (Api.flashPreviewSeconds * 1000) + 400),
    );
    expect(find.text('WATCH MORE'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('blurred Vault poster uses a real image filter', (tester) async {
    await tester.binding.setSurfaceSize(const Size(407, 675));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const upload = UploadContent(
      id: 193,
      type: 'vault',
      topic: 'Comedy',
      description: 'Blurred vault content',
      hashtags: '#vault',
      thumbnail: 'https://example.com/thumb.jpg',
      mediaUrl: 'https://example.com/video.mp4',
      mediaType: 'video',
      contentAccessMode: 'blurred',
      coins: 10,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(ImageFiltered), findsOneWidget);
    expect(find.text('WATCH NOW'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('blurred Vault raw video preview uses a real blur filter', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(407, 675));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const upload = UploadContent(
      id: 195,
      type: 'vault',
      topic: 'Food & Cooking',
      description: 'Blurred vault video content',
      hashtags: '#vault',
      thumbnail: '',
      mediaUrl: 'https://example.com/video.mp4',
      mediaGallery: ['https://example.com/video.mp4'],
      mediaType: 'video',
      contentAccessMode: 'blurred',
      coins: 10,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(ImageFiltered), findsOneWidget);
    expect(find.text('WATCH NOW'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('paid unblurred Vault poster is not blurred before purchase', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(407, 675));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const upload = UploadContent(
      id: 194,
      type: 'vault',
      topic: 'Food & Cooking',
      description: 'Non blurred vault content',
      hashtags: '#vault',
      thumbnail: 'https://example.com/thumb.jpg',
      mediaUrl: 'https://example.com/video.mp4',
      mediaType: 'video',
      contentAccessMode: 'unblurred',
      coins: 10,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(ImageFiltered), findsNothing);
    expect(find.text('WATCH NOW'), findsOneWidget);
    expect(find.text('10 Coins'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Vault image WATCH NOW opens swipe gallery with dots', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(407, 675));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const upload = UploadContent(
      id: 196,
      type: 'vault',
      topic: 'Comedy',
      description: 'Gallery vault content',
      hashtags: '#gallery',
      thumbnail: 'https://example.com/three.jpg',
      mediaUrl: '',
      mediaGallery: [
        'https://example.com/one.jpg',
        'https://example.com/two.jpg',
      ],
      mediaType: 'image',
      contentAccessMode: 'unblurred',
      coins: 0,
      username: 'creator',
      fullName: 'Creator',
      avatar: '',
      time: 'now',
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
      reposts: 0,
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: UploadFeedCard(
            item: upload,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.pump();

    await tester.tap(find.text('WATCH NOW'));
    await tester.pumpAndSettle();

    expect(find.byType(PageView), findsOneWidget);
    expect(find.byKey(const ValueKey('upload-inline-dot-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('upload-inline-dot-1')), findsOneWidget);
    expect(find.byKey(const ValueKey('upload-inline-dot-2')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('photo-video ad menu matches the web action order', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    const ad = HomeAd(
      adId: 'menu-ad',
      ownerUserId: 'other-user',
      campaignType: 'Photo and Video',
      title: 'Ad actions',
      description: '',
      mediaType: 'photo',
      username: 'creator',
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: HomeAdFeedCard(
            ad: ad,
            onHide: () {},
            onRefresh: ({bool silent = false}) async {},
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const ValueKey('ad-menu-menu-ad')));
    await tester.pumpAndSettle();

    expect(find.text('Not Interested'), findsOneWidget);
    expect(find.text('Share Link'), findsOneWidget);
    expect(find.text('Report'), findsOneWidget);
    expect(find.text('Delete Ad'), findsNothing);
    expect(find.text('Promote Again'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
