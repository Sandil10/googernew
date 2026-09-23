import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/services/cart_store.dart';

CartItem item({
  String? selectedCountry,
  dynamic shipping,
  List<String> methods = const ['wallet'],
}) => CartItem(
  id: 1,
  productId: 10,
  title: 'Test product',
  price: 100,
  promoPrice: 100,
  selectedShippingCountry: selectedCountry,
  shippingInfo: shipping,
  paymentMethods: methods,
);

void main() {
  tearDown(() {
    CartStore.items.value = const [];
    CartStore.address.value = null;
  });

  test(
    'checkout rejects a country different from the selected ship-to choice',
    () {
      final error = CartStore.shippingValidationError(
        checkoutAddress: {'country': 'Sri Lanka'},
        checkoutItems: [item(selectedCountry: 'India')],
      );

      expect(error, contains('India'));
      expect(error, contains('Sri Lanka'));
    },
  );

  test('checkout requires an exact configured country rate like web', () {
    final error = CartStore.shippingValidationError(
      checkoutAddress: {'country': 'Sri Lanka'},
      checkoutItems: [
        item(
          shipping: {
            'unified': false,
            'rates': [
              {'country': 'Worldwide', 'charge': 12},
            ],
          },
        ),
      ],
    );

    expect(error, contains('cannot be delivered'));
  });

  test('unified shipping is valid for the saved address', () {
    final error = CartStore.shippingValidationError(
      checkoutAddress: {'country': 'Sri Lanka'},
      checkoutItems: [
        item(shipping: {'unified': true, 'charge': 12}),
      ],
    );

    expect(error, isNull);
  });

  test('COD is blocked unless every selected product enables it', () {
    expect(CartStore.codBlockedTitles(checkoutItems: [item()]), [
      'Test product',
    ]);
    expect(
      CartStore.codBlockedTitles(
        checkoutItems: [
          item(methods: const ['wallet', 'cod']),
        ],
      ),
      isEmpty,
    );
  });

  test('payment methods accept the backend JSON representation', () {
    expect(CartStore.paymentMethodsFrom('["wallet","cod"]'), ['wallet', 'cod']);
    expect(CartStore.paymentMethodsFrom(null), ['wallet']);
  });
}
