import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/screens/shop_feed_screen.dart';

void main() {
  test(
    'fresh product details preserve reseller attribution from deep link',
    () {
      final merged = mergeProductResellerAttribution(
        {'id': 19, 'title': 'Nico1'},
        {'id': 19, 'reseller_ref': '312495'},
      );

      expect(merged['reseller_ref'], '312495');
      expect(merged['resell_ref'], '312495');
    },
  );

  testWidgets('shop card loads the web profile picture through an HTML image', (
    tester,
  ) async {
    const avatar = 'https://media.example.com/profiles/seller.webp';
    await tester.binding.setSurfaceSize(const Size(400, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 190,
            height: 360,
            child: ProductGridCard(
              product: const {
                'id': 16,
                'user_id': 9,
                'owner_username': 'hee',
                'profile_picture': avatar,
                'image_url': 'https://media.example.com/products/item.webp',
                'title': 'Fish Bun11',
                'price': 100,
              },
              onOpen: () {},
              onLike: () {},
              onShare: (currentCount) async => currentCount,
              onComment: () {},
              onView: () {},
              onMenu: (_) {},
              onAddToBag: () {},
            ),
          ),
        ),
      ),
    );

    final matching = tester
        .widgetList<Image>(find.byType(Image))
        .where(
          (image) =>
              image.image is NetworkImage &&
              (image.image as NetworkImage).url == avatar,
        )
        .toList();
    expect(matching, hasLength(1));
  });

  testWidgets('shop two-dot button reports owner state', (tester) async {
    Api.user = {'id': 9, 'username': 'hee'};
    addTearDown(() => Api.user = null);
    bool? mine;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 190,
            height: 360,
            child: ProductGridCard(
              product: const {
                'id': 16,
                'user_id': 9,
                'owner_username': 'hee',
                'title': 'Fish Bun11',
                'price': 100,
              },
              onOpen: () {},
              onLike: () {},
              onShare: (currentCount) async => currentCount,
              onComment: () {},
              onView: () {},
              onMenu: (value) => mine = value,
              onAddToBag: () {},
            ),
          ),
        ),
      ),
    );

    final menuIcon = find.byWidgetPredicate(
      (widget) => widget.runtimeType.toString() == '_TwoDotMenuIcon',
    );
    expect(menuIcon, findsOneWidget);
    final menuButton = find
        .ancestor(of: menuIcon, matching: find.byType(GestureDetector))
        .first;
    await tester.tap(menuButton);
    expect(mine, isTrue);
  });
}
