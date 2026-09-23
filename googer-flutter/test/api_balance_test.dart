import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/data/mock.dart';
import 'package:googer_app/screens/home_feed_screen.dart';

void main() {
  tearDown(() {
    Api.user = null;
  });

  test('balance reads backend snake_case profile field', () {
    Api.user = {'wallet_balance': '99.20'};

    expect(Api.balance, 99.20);
  });

  test('balance reads web camelCase profile field', () {
    Api.user = {'walletBalance': '99.20'};

    expect(Api.balance, 99.20);
  });

  test('upload content parser uses pending edit thumbnail as poster', () {
    final item = Api.parseUploadContent({
      'id': 7,
      'content_id': '1234567890',
      'content_type': 'flash',
      'description': 'dd',
      'topic': 'Comedy',
      'status': 'Pending Approval',
      'media_type': 'video',
      'media_gallery': ['/uploads/video.mp4'],
      'edit_draft': {
        'thumbnail_url': '/uploads/thumb.jpg',
        'media_gallery': ['/uploads/video.mp4'],
      },
    });

    expect(item, isNotNull);
    expect(item!.thumbnail, contains('/uploads/thumb.jpg'));
    expect(item.mediaGallery, isNot(contains(item.thumbnail)));
  });

  test(
    'upload content parser uses feed media preview image as video poster',
    () {
      final item = Api.parseUploadContent({
        'id': 8,
        'content_id': '87654321',
        'content_type': 'flash',
        'description': 'dd',
        'topic': 'Comedy',
        'status': 'Pending Approval',
        'media_type': 'video',
        'media_preview': '/uploads/poster.jpg',
        'media_gallery': ['/uploads/video.mp4'],
      });

      expect(item, isNotNull);
      expect(item!.thumbnail, contains('/uploads/poster.jpg'));
      expect(item.mediaUrl, contains('/uploads/video.mp4'));
      expect(item.mediaGallery, isNot(contains(item.thumbnail)));
    },
  );

  test('upload content share code matches web backend short code', () {
    expect(Api.buildShareCode('u', '6733263930'), 'gM0NHpc9');
  });

  test('upload content parser preserves canonical share code', () {
    final item = Api.parseUploadContent({
      'id': 51,
      'content_id': '6733263930',
      'share_code': 'gM0NHpc9',
      'content_type': 'flash',
      'description': 'dd',
      'topic': 'Comedy',
      'status': 'Approved',
    });

    expect(item, isNotNull);
    expect(item!.shareCode, 'gM0NHpc9');
  });

  test('upload content parser preserves reseller attribution', () {
    final item = Api.parseUploadContent({
      'id': 24,
      'content_id': '2665836449',
      'share_code': 'QVHG8duH',
      'content_type': 'vault',
      'status': 'Approved',
      'price': 10,
      'affiliate_commission': 10,
      'reseller_ref': '312495',
    });

    expect(item, isNotNull);
    expect(item!.resellerRef, '312495');
    expect(item.affiliateCommission, 10);
  });

  test(
    'upload content parser keeps web owner id and nested account fields',
    () {
      final item = Api.parseUploadContent({
        'id': 31,
        'content_id': '2252359152',
        'content_type': 'vault',
        'topic': 'Comedy',
        'description': 'creator upload',
        'status': 'Approved',
        'owner_id': 102811,
        'user': {
          'username': 'goo',
          'full_name': 'Goo',
          'profile_picture': '/uploads/goo.png',
        },
      });

      expect(item, isNotNull);
      expect(item!.ownerUserId, '102811');
      expect(item.username, 'goo');
      expect(item.fullName, 'Goo');
    },
  );

  test('upload content parser matches Web blurred flag fallbacks', () {
    final snakeCase = Api.parseUploadContent({
      'id': 25,
      'content_type': 'vault',
      'status': 'Approved',
      'is_blurred': true,
    });
    final camelCase = Api.parseUploadContent({
      'id': 26,
      'content_type': 'vault',
      'status': 'Approved',
      'isBlurred': 1,
    });

    expect(snakeCase?.contentAccessMode, 'blurred');
    expect(camelCase?.contentAccessMode, 'blurred');
  });

  test('upload share badge matches Web Flash and Vault rules', () {
    const base = UploadContent(
      id: 1,
      contentId: '1',
      type: 'vault',
      topic: 'Comedy',
      description: '',
      hashtags: '',
      thumbnail: '',
      mediaUrl: '',
      coins: 0,
      username: 'hee',
      fullName: 'Hee',
      avatar: '',
      time: '',
      status: 'Approved',
      reposts: 0,
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
    );
    const paid = UploadContent(
      id: 2,
      contentId: '2',
      type: 'vault',
      topic: 'Comedy',
      description: '',
      hashtags: '',
      thumbnail: '',
      mediaUrl: '',
      coins: 0,
      username: 'hee',
      fullName: 'Hee',
      avatar: '',
      time: '',
      status: 'Approved',
      affiliateCommission: 7.5,
      reposts: 0,
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
    );
    const flash = UploadContent(
      id: 3,
      contentId: '3',
      type: 'flash',
      topic: 'Comedy',
      description: '',
      hashtags: '',
      thumbnail: '',
      mediaUrl: '',
      coins: 0,
      username: 'hee',
      fullName: 'Hee',
      avatar: '',
      time: '',
      status: 'Approved',
      affiliateCommission: 9,
      reposts: 0,
      likes: 0,
      comments: 0,
      views: 0,
      shares: 0,
    );

    expect(uploadShareCommissionLabel(base), '0%');
    expect(uploadShareCommissionLabel(paid), '7.5%');
    expect(uploadShareCommissionLabel(flash), '');
    expect(uploadShareAndEarnAllowed(base), isTrue);
    expect(uploadShareAndEarnAllowed(paid), isTrue);
    expect(uploadShareAndEarnAllowed(flash), isFalse);
  });
}
