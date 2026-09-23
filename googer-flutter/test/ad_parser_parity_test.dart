import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/data/mock.dart';
import 'package:googer_app/screens/home_feed_screen.dart';

void main() {
  test('ad counts accept the same fallback fields as the web normalizer', () {
    final ad = Api.parseHomeAds([
      {
        'id': 12,
        'campaignType': 'Photo and Video',
        'likeCount': 4,
        'commentCount': '5',
        'views': 6,
        'shareCount': '7',
        'editDraft': {'carryOverViews': 8},
      },
    ]).single;

    expect(ad.likes, 4);
    expect(ad.comments, 5);
    expect(ad.views, 14);
    expect(ad.shares, 7);
  });

  test('snake case counts keep the same precedence as the web normalizer', () {
    final ad = Api.parseHomeAds([
      {
        'id': 13,
        'campaign_type': 'Product Promote',
        'likes_count': 10,
        'likeCount': 99,
        'comments_count': 11,
        'commentCount': 99,
        'views_count': 12,
        'viewCount': 99,
        'shares_count': 13,
        'shareCount': 99,
        'edit_draft': {'carry_over_views': -5},
      },
    ]).single;

    expect(ad.likes, 10);
    expect(ad.comments, 11);
    expect(ad.views, 12);
    expect(ad.shares, 13);
  });

  test('ad parser keeps web category fields for home category chips', () {
    final ad = Api.parseHomeAds([
      {
        'id': 14,
        'campaign_type': 'Photo and Video',
        'title': 'Sponsored post',
        'description': 'category lives outside title',
        'category': 'Comedy',
      },
    ]).single;

    expect(ad.feedCategory, 'Comedy');
  });

  test('product promote keeps discount and reseller commission separate', () {
    final ad = Api.parseHomeAds([
      {
        'id': 19,
        'campaign_type': 'Product Promote',
        'linked_product_id': 19,
        'linked_product_share_code': 'JXRGJVKT',
        'commission_info': {'discount': '10', 'resell_percentage': '7.5'},
      },
    ]).single;

    expect(ad.discount, '10');
    expect(ad.resellCommission, '7.5');
    expect(ad.linkedProductShareCode, 'JXRGJVKT');
  });

  test('share counters follow backend increment and dedupe responses', () {
    expect(
      resolveShareCountResponse({'incremented': true}, currentCount: 7),
      8,
    );
    expect(
      resolveShareCountResponse({'incremented': false}, currentCount: 8),
      8,
    );
    expect(
      resolveShareCountResponse({'shares_count': 14}, currentCount: 8),
      14,
    );
  });

  test('product reseller link preserves the canonical product route', () async {
    final previous = Api.user;
    Api.user = {'id': 5, 'user_id': '312495', 'username': 'von'};
    addTearDown(() => Api.user = previous);

    expect(
      await Api.resellShareLink('https://googer.site/product/JXRGJVKT'),
      'https://googer.site/product/JXRGJVKT/312495',
    );
  });

  test('ad audience targeting matches country, gender, and age', () {
    final ad = <String, dynamic>{
      'editDraft': {
        'selectedLocationCodes': ['LK'],
        'genderTarget': 'Female',
        'ageMin': 21,
        'ageMax': 40,
      },
    };

    expect(
      Api.canViewerSeeAdForTesting(ad, {
        'country': 'Sri Lanka',
        'gender': 'Female',
        'date_of_birth': '1996-01-01',
      }),
      isTrue,
    );
    expect(
      Api.canViewerSeeAdForTesting(ad, {
        'countryCode': 'US',
        'gender': 'Female',
        'date_of_birth': '1996-01-01',
      }),
      isFalse,
    );
    expect(
      Api.canViewerSeeAdForTesting(ad, {
        'countryCode': 'LK',
        'gender': 'Male',
        'date_of_birth': '1996-01-01',
      }),
      isFalse,
    );
  });

  test('ad promote actions follow the same surface rules as web', () {
    const completedPhoto = HomeAd(
      adId: '1',
      campaignType: 'Photo and Video',
      title: '',
      description: '',
      username: 'hee',
      status: 'Completed',
    );
    const activePhoto = HomeAd(
      adId: '2',
      campaignType: 'Photo and Video',
      title: '',
      description: '',
      username: 'hee',
      status: 'Active',
    );
    const detachedProduct = HomeAd(
      adId: '3',
      campaignType: 'Product Promote',
      title: '',
      description: '',
      username: 'hee',
    );
    const linkedProduct = HomeAd(
      adId: '4',
      campaignType: 'Product Promote',
      title: '',
      description: '',
      username: 'hee',
      linkedProductId: 19,
    );

    expect(
      canShowPhotoVideoPromoteAgain(
        ad: completedPhoto,
        mine: true,
        allowOnSurface: true,
        saved: true,
      ),
      isTrue,
    );
    expect(
      canShowPhotoVideoPromoteAgain(
        ad: activePhoto,
        mine: true,
        allowOnSurface: true,
        saved: true,
      ),
      isFalse,
    );
    expect(
      canShowPhotoVideoPromoteAgain(
        ad: completedPhoto,
        mine: true,
        allowOnSurface: false,
        saved: true,
      ),
      isFalse,
    );
    expect(canShowProductPromoteAction(detachedProduct), isFalse);
    expect(canShowProductPromoteAction(linkedProduct), isTrue);
  });
}
