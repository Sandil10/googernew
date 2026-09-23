import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/api/api.dart';
import 'package:googer_app/screens/cart_screen.dart';
import 'package:googer_app/services/cart_store.dart';

void main() {
  setUp(() {
    CartStore.items.value = const [
      CartItem(
        id: 1,
        productId: 10,
        title: 'Checkout product',
        price: 100,
        promoPrice: 100,
        sellerId: '42',
        paymentMethods: ['wallet', 'cod'],
        shippingInfo: {'unified': true, 'charge': 12},
      ),
    ];
    CartStore.address.value = {
      'firstName': 'Test',
      'lastName': 'Buyer',
      'houseNo': '1',
      'street': 'Main Street',
      'city': 'Colombo',
      'district': 'Colombo',
      'province': 'Western',
      'country': 'Sri Lanka',
      'phone': '0700000000',
    };
  });

  tearDown(() {
    CartStore.items.value = const [];
    CartStore.address.value = null;
    Api.token = null;
    Api.user = null;
  });

  for (final size in const [Size(430, 900), Size(360, 780), Size(320, 700)]) {
    testWidgets('checkout renders all payment methods at ${size.width}px', (
      tester,
    ) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(const MaterialApp(home: CartScreen()));
      await tester.pump();
      await tester.tap(find.text('ADDRESS'));
      await tester.pump();

      expect(find.text('GOOGER PAYMENT'), findsOneWidget);
      expect(find.text('GOOGER MANUAL PAYMENT'), findsOneWidget);
      if (find.text('CASH ON DELIVERY').evaluate().isEmpty) {
        await tester.drag(find.byType(ListView).last, const Offset(0, -240));
        await tester.pump();
      }
      expect(find.text('CASH ON DELIVERY'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('wallet shortfall opens the visible web-style balance dialog', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const MaterialApp(home: CartScreen()));
    await tester.pump();
    await tester.tap(find.text('ADDRESS'));
    await tester.pump();
    Api.token = 'checkout-test-token';
    Api.user = {'wallet_balance': 1};
    await tester.tap(find.text('GOOGER PAYMENT'));
    await tester.pumpAndSettle();

    expect(find.text('BALANCE ERROR'), findsOneWidget);
    expect(find.text('TOP UP WALLET NOW'), findsOneWidget);
    expect(find.text('CANCEL'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
