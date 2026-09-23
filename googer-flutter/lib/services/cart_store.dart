import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../api/api.dart';
import '../util/storage.dart';

const _cartStorageKey = 'googer_cart';
const _addressStorageKey = 'googer-cart-address-1';

double _num(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse('${value ?? ''}') ?? 0;
}

int _int(dynamic value) {
  if (value is num) return value.toInt();
  return int.tryParse('${value ?? ''}') ?? 0;
}

String? _nullableString(dynamic value) {
  final text = '${value ?? ''}'.trim();
  return text.isEmpty ? null : text;
}

/// One line in the bag. Mirrors the web `CartItem` (app/context/CartContext.tsx)
/// field for field so the same `/cart` rows round-trip through both clients.
class CartItem {
  /// Server row id once synced; a local timestamp id while offline.
  final int id;
  final int productId;
  final String title;
  final double price;
  final double promoPrice;
  final String imageUrl;
  final int quantity;
  final String? size;
  final String? color;
  final int? variantIndex;
  final bool selected;
  final String? sellerId;
  final dynamic shippingInfo;

  /// Seller-staked discount percentage (web `product_discount`).
  final double productDiscount;
  final String? selectedShippingCountry;
  final List<String> paymentMethods;
  final String? resellerRef;
  final double resellCommissionPercentage;

  const CartItem({
    required this.id,
    required this.productId,
    required this.title,
    required this.price,
    required this.promoPrice,
    this.imageUrl = '',
    this.quantity = 1,
    this.size,
    this.color,
    this.variantIndex,
    this.selected = true,
    this.sellerId,
    this.shippingInfo,
    this.productDiscount = 0,
    this.selectedShippingCountry,
    this.paymentMethods = const [],
    this.resellerRef,
    this.resellCommissionPercentage = 0,
  });

  /// Unit price actually charged — promo when present, else list price.
  double get unitPrice => promoPrice > 0 ? promoPrice : price;

  double get lineTotal => unitPrice * quantity;

  /// Seller-staked discount on this line (web `totalDiscount` per item).
  double get lineDiscount => (unitPrice * productDiscount / 100) * quantity;

  /// Items from the same seller share one delivery charge, exactly like the
  /// web `deliveryTotal` grouping.
  String get deliveryGroupId =>
      (sellerId ?? '').isNotEmpty ? 'seller_$sellerId' : 'prod_$productId';

  CartItem copyWith({int? id, int? quantity, bool? selected}) => CartItem(
    id: id ?? this.id,
    productId: productId,
    title: title,
    price: price,
    promoPrice: promoPrice,
    imageUrl: imageUrl,
    quantity: quantity ?? this.quantity,
    size: size,
    color: color,
    variantIndex: variantIndex,
    selected: selected ?? this.selected,
    sellerId: sellerId,
    shippingInfo: shippingInfo,
    productDiscount: productDiscount,
    selectedShippingCountry: selectedShippingCountry,
    paymentMethods: paymentMethods,
    resellerRef: resellerRef,
    resellCommissionPercentage: resellCommissionPercentage,
  );

  factory CartItem.fromJson(Map<String, dynamic> row) {
    final price = _num(row['price']);
    final promo = row['promo_price'] == null ? price : _num(row['promo_price']);
    var methods = <String>[];
    final rawMethods = row['payment_methods'];
    if (rawMethods is List) {
      methods = rawMethods.map((m) => '$m').toList();
    } else if (rawMethods is String && rawMethods.trim().isNotEmpty) {
      try {
        final parsed = jsonDecode(rawMethods);
        if (parsed is List) methods = parsed.map((m) => '$m').toList();
      } catch (_) {}
    }
    return CartItem(
      id: _int(row['id']),
      productId: _int(row['productId'] ?? row['product_id'] ?? row['id']),
      title: '${row['title'] ?? ''}',
      price: price,
      promoPrice: promo,
      imageUrl: '${row['image_url'] ?? row['imageUrl'] ?? ''}',
      quantity: _int(row['quantity']) < 1 ? 1 : _int(row['quantity']),
      size: _nullableString(row['size']),
      color: _nullableString(row['color']),
      variantIndex: row['variantIndex'] == null && row['variant_index'] == null
          ? null
          : _int(row['variantIndex'] ?? row['variant_index']),
      selected: row['selected'] != false,
      sellerId: _nullableString(row['seller_id']),
      shippingInfo: row['shipping_info'],
      productDiscount: _num(row['product_discount']),
      selectedShippingCountry: _nullableString(
        row['selected_shipping_country'],
      ),
      paymentMethods: methods,
      resellerRef: _nullableString(
        row['reseller_ref'] ?? row['resell_ref'] ?? row['resellerRef'],
      ),
      resellCommissionPercentage: _num(
        row['resell_commission_percentage'] ?? row['resell_percentage'],
      ),
    );
  }

  /// Body for `POST /cart/items` / local persistence — the backend only accepts
  /// this exact shape.
  Map<String, dynamic> toJson() => {
    'id': id,
    'productId': productId,
    'title': title,
    'price': price,
    'promo_price': promoPrice,
    'image_url': imageUrl,
    'quantity': quantity,
    'size': size,
    'color': color,
    'variantIndex': variantIndex,
    'selected': selected,
    'seller_id': sellerId,
    'shipping_info': shippingInfo,
    'product_discount': productDiscount,
    'selected_shipping_country': selectedShippingCountry,
    'payment_methods': paymentMethods,
    'reseller_ref': resellerRef,
    'resell_commission_percentage': resellCommissionPercentage,
  };

  /// Two lines merge only when every variant-defining field matches, which is
  /// the same key the backend's `findMatchingCartItem` uses.
  bool matches(CartItem other) =>
      productId == other.productId &&
      size == other.size &&
      color == other.color &&
      variantIndex == other.variantIndex &&
      selectedShippingCountry == other.selectedShippingCountry &&
      resellerRef == other.resellerRef;
}

/// Outcome of [CartStore.addProduct]. A rejection carries the numbers behind
/// it so the UI can say "only 2 left" instead of a bare "could not add to bag",
/// which is what a shopper needs in order to understand a refused tap.
class AddToBagResult {
  final bool ok;

  /// True when the bag refused because the line would exceed available stock,
  /// as opposed to a network or validation failure.
  final bool stockBlocked;

  /// Units the seller has, and units of this line already in the bag. Only
  /// meaningful when [stockBlocked].
  final int stock;
  final int inBag;

  const AddToBagResult._({
    required this.ok,
    required this.stockBlocked,
    this.stock = 0,
    this.inBag = 0,
  });

  static const added = AddToBagResult._(ok: true, stockBlocked: false);
  static const failed = AddToBagResult._(ok: false, stockBlocked: false);

  factory AddToBagResult.notEnoughStock({
    required int stock,
    required int inBag,
  }) => AddToBagResult._(
    ok: false,
    stockBlocked: true,
    stock: stock,
    inBag: inBag,
  );

  /// Units that would still fit on this line.
  int get remaining => stock - inBag < 0 ? 0 : stock - inBag;

  String get message {
    if (!stockBlocked) return '';
    if (remaining <= 0) {
      return inBag > 0
          ? 'All $stock in stock are already in your bag.'
          : 'This item is out of stock.';
    }
    return inBag > 0
        ? 'Only $remaining more can be added — $inBag of $stock is already in your bag.'
        : 'Only $remaining left in stock.';
  }
}

/// App-wide bag. The Flutter equivalent of the web `CartProvider`: one source
/// of truth for the topbar badge, the cart sheet, and checkout, kept in sync
/// with `/cart` for signed-in users and mirrored to local storage so the badge
/// survives a reload.
class CartStore {
  CartStore._();

  static final ValueNotifier<List<CartItem>> items =
      ValueNotifier<List<CartItem>>(const <CartItem>[]);

  /// Delivery address used by checkout (web `savedAddress`).
  static final ValueNotifier<Map<String, dynamic>?> address =
      ValueNotifier<Map<String, dynamic>?>(null);

  static bool _loaded = false;

  static List<CartItem> get _current => items.value;

  static List<CartItem> get selectedItems =>
      _current.where((i) => i.selected).toList();

  /// Badge number — total units in the bag, like the web `cartCount`.
  static int get count => _current.fold(0, (sum, i) => sum + i.quantity);

  static int get selectedCount =>
      selectedItems.fold(0, (sum, i) => sum + i.quantity);

  static double get selectedTotal =>
      selectedItems.fold(0.0, (sum, i) => sum + i.lineTotal);

  static double get originalSelectedTotal =>
      selectedItems.fold(0.0, (sum, i) => sum + i.price * i.quantity);

  static double get totalDiscount =>
      selectedItems.fold(0.0, (sum, i) => sum + i.lineDiscount);

  static bool get isAllSelected =>
      _current.isNotEmpty && selectedItems.length == _current.length;

  static String get country =>
      '${address.value?['country'] ?? 'Sri Lanka'}'.trim();

  static List<String> paymentMethodsFrom(dynamic raw) {
    var value = raw;
    if (value is String && value.trim().isNotEmpty) {
      try {
        value = jsonDecode(value);
      } catch (_) {
        value = null;
      }
    }
    if (value is! List || value.isEmpty) return const ['wallet'];
    return value
        .map((method) => '$method'.trim().toLowerCase())
        .where((method) => method.isNotEmpty)
        .toSet()
        .toList(growable: false);
  }

  /// Checkout-only country validation. This intentionally requires an exact
  /// rate match, matching the web cart's final address validation.
  static String? shippingValidationError({
    Map<String, dynamic>? checkoutAddress,
    Iterable<CartItem>? checkoutItems,
  }) {
    final targetAddress = checkoutAddress ?? address.value;
    final addressCountry = '${targetAddress?['country'] ?? ''}'.trim();
    if (addressCountry.isEmpty || addressCountry.toLowerCase() == 'none') {
      return 'Add a delivery address before continuing.';
    }

    final target = addressCountry.toLowerCase();
    for (final item in checkoutItems ?? selectedItems) {
      final selected = (item.selectedShippingCountry ?? '').trim();
      if (selected.isNotEmpty && selected.toLowerCase() != target) {
        return '${item.title} was added for delivery to $selected, not $addressCountry.';
      }

      final raw = item.shippingInfo;
      if (raw == null) continue;
      try {
        final parsed = raw is String ? jsonDecode(raw) : raw;
        if (parsed is! Map || parsed['unified'] == true) continue;
        final rates = parsed['rates'] ?? parsed['shipping_rates'];
        if (rates is! List || rates.isEmpty) continue;
        final exact = rates.whereType<Map>().any(
          (rate) => '${rate['country'] ?? ''}'.trim().toLowerCase() == target,
        );
        if (!exact) {
          return '${item.title} cannot be delivered to $addressCountry.';
        }
      } catch (_) {
        // Keep the backend as the final authority for malformed legacy rows.
      }
    }
    return null;
  }

  static List<String> codBlockedTitles({Iterable<CartItem>? checkoutItems}) {
    return (checkoutItems ?? selectedItems)
        .where(
          (item) => !paymentMethodsFrom(item.paymentMethods).contains('cod'),
        )
        .map((item) => item.title)
        .toList(growable: false);
  }

  /// Shipping fee for one item under the active country, mirroring the web
  /// `getProductDeliveryInfo`: unified charge → exact country rate →
  /// worldwide/default rate → unavailable.
  static ({double fee, bool available}) deliveryInfoFor(CartItem item) {
    final raw = item.shippingInfo;
    if (raw == null) return (fee: 0.0, available: true);
    try {
      final parsed = raw is String ? jsonDecode(raw) : raw;
      if (parsed is! Map) return (fee: 0.0, available: true);
      if (parsed['unified'] == true) {
        return (fee: _num(parsed['charge']), available: true);
      }
      final rates = parsed['rates'] ?? parsed['shipping_rates'];
      if (rates is! List || rates.isEmpty) return (fee: 0.0, available: true);

      final active = (item.selectedShippingCountry ?? country)
          .toLowerCase()
          .trim();
      for (final rate in rates.whereType<Map>()) {
        if ('${rate['country'] ?? ''}'.toLowerCase().trim() == active) {
          return (fee: _num(rate['charge'] ?? rate['price']), available: true);
        }
      }
      for (final rate in rates.whereType<Map>()) {
        final name = '${rate['country'] ?? ''}'.toLowerCase().trim();
        if (name.contains('world') ||
            name.contains('global') ||
            rate['isDefault'] == true) {
          return (fee: _num(rate['charge'] ?? rate['price']), available: true);
        }
      }
      return (fee: 0.0, available: false);
    } catch (_) {
      return (fee: 0.0, available: true);
    }
  }

  static bool isAvailable(CartItem item) => deliveryInfoFor(item).available;

  /// One delivery charge per seller group — the highest fee in that group.
  static double get deliveryTotal {
    final perGroup = <String, double>{};
    for (final item in selectedItems) {
      final info = deliveryInfoFor(item);
      if (!info.available) continue;
      final current = perGroup[item.deliveryGroupId] ?? 0;
      if (info.fee > current) perGroup[item.deliveryGroupId] = info.fee;
    }
    return perGroup.values.fold(0.0, (sum, fee) => sum + fee);
  }

  /// What CHECKOUT actually charges (web `payableTotal`).
  static double get payableTotal => selectedTotal + deliveryTotal;

  static void _publish(List<CartItem> next) {
    items.value = List<CartItem>.unmodifiable(next);
    writeStorage(
      _cartStorageKey,
      jsonEncode(next.map((i) => i.toJson()).toList()),
    );
  }

  /// Read the local mirror, then reconcile with the server when signed in.
  static Future<void> load({bool force = false}) async {
    if (!_loaded || force) {
      _loaded = true;
      final raw = readStorage(_cartStorageKey);
      if (raw != null && raw.isNotEmpty) {
        try {
          final parsed = jsonDecode(raw);
          if (parsed is List) {
            items.value = List<CartItem>.unmodifiable(
              parsed.whereType<Map>().map(
                (e) => CartItem.fromJson(Map<String, dynamic>.from(e)),
              ),
            );
          }
        } catch (_) {}
      }
      final storedAddress = readStorage(_addressStorageKey);
      if (storedAddress != null && storedAddress.isNotEmpty) {
        try {
          final parsed = jsonDecode(storedAddress);
          if (parsed is Map) {
            address.value = Map<String, dynamic>.from(parsed);
          }
        } catch (_) {}
      }
    }
    await sync();
    await loadAddressFromProfile();
  }

  /// Pull `/cart`. A signed-in user with a local-only bag gets it pushed up
  /// first, matching the web `mergeLocalIfRemoteEmpty` behaviour.
  static Future<void> sync() async {
    if (!Api.loggedIn) return;
    var remote = await Api.getCart();
    if (remote.isEmpty && _current.isNotEmpty) {
      for (final item in _current) {
        await Api.addToCart(item.toJson()..remove('id'));
      }
      remote = await Api.getCart();
    }
    _publish(remote.map(CartItem.fromJson).toList());
  }

  /// Adopt the shipping address stored on the profile (source of truth).
  static Future<void> loadAddressFromProfile() async {
    if (!Api.loggedIn) return;
    final raw = Api.user?['shipping_address'];
    if (raw == null) return;
    try {
      final parsed = raw is String ? jsonDecode(raw) : raw;
      if (parsed is Map && parsed.isNotEmpty) {
        setAddress(Map<String, dynamic>.from(parsed));
      }
    } catch (_) {}
  }

  static void setAddress(Map<String, dynamic> value) {
    address.value = value;
    writeStorage(_addressStorageKey, jsonEncode(value));
  }

  /// Persist the address on the account too, so web and mobile agree.
  static Future<String?> saveAddress(Map<String, dynamic> value) async {
    setAddress(value);
    if (!Api.loggedIn) return null;
    return Api.updateProfile({'shipping_address': jsonEncode(value)});
  }

  /// Variant rows off a product record, which the API hands over either as a
  /// JSON string or as a decoded list depending on the endpoint.
  static List<Map<String, dynamic>> _variantList(Map<String, dynamic> product) {
    var raw = product['variants'];
    if (raw is String) {
      final trimmed = raw.trim();
      if (trimmed.isEmpty) return const [];
      try {
        raw = jsonDecode(trimmed);
      } catch (_) {
        return const [];
      }
    }
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }

  /// Units the seller actually has for one product/size/variant combination —
  /// the same walk the web `getAvailableCountForSize` does, so the bag enforces
  /// exactly the ceiling the product sheet puts on screen.
  ///
  /// A result of 0 is ambiguous: it means either genuinely sold out *or* that
  /// the record we were handed carries no stock field at all (the Product
  /// Promote fallback map, for one). Callers must treat 0 as "unknown, don't
  /// enforce" rather than as a hard zero.
  static int availableStock(
    Map<String, dynamic> product, {
    String? size,
    int? variantIndex,
  }) {
    final variants = _variantList(product);
    final active = variants.isEmpty
        ? product
        : variants[(variantIndex ?? 0).clamp(0, variants.length - 1)];

    final trimmed = (size ?? '').trim();
    if (trimmed.isNotEmpty && trimmed != 'None') {
      final selections = active['selections'];
      if (selections is List) {
        for (final entry in selections.whereType<Map>()) {
          if ('${entry['value'] ?? ''}'.trim() == trimmed) {
            return _int(entry['stock'] ?? entry['quantity']);
          }
        }
      }
      final activeColor = '${active['color'] ?? ''}';
      for (final variant in variants) {
        if ('${variant['size'] ?? ''}'.trim() == trimmed &&
            (activeColor.isEmpty ||
                '${variant['color'] ?? ''}'.isEmpty ||
                '${variant['color']}' == activeColor)) {
          return _int(variant['stock'] ?? variant['quantity']);
        }
      }
    }

    final fromVariant = _int(active['stock'] ?? active['quantity']);
    return fromVariant > 0 ? fromVariant : _int(product['stock']);
  }

  /// Units of this exact line already sitting in the bag. Built through
  /// [_fromProduct] so it matches on the same key [CartItem.matches] uses —
  /// a different size or colour is a different line, with its own ceiling.
  static int quantityInBag(
    Map<String, dynamic> product, {
    String? size,
    String? color,
    int? variantIndex,
    String? selectedShippingCountry,
  }) {
    final probe = _fromProduct(
      product,
      quantity: 1,
      size: size,
      color: color,
      variantIndex: variantIndex,
      selectedShippingCountry: selectedShippingCountry,
    );
    if (probe.productId <= 0) return 0;
    final index = _current.indexWhere((i) => i.matches(probe));
    return index < 0 ? 0 : _current[index].quantity;
  }

  /// Add a product row built from a market/product record.
  ///
  /// Lines merge by quantity, so capping the stepper alone is not enough — five
  /// separate taps of "add 3" would still bank 15 units of a 3-unit product.
  /// The ceiling has to be enforced here, on the merged total.
  static Future<AddToBagResult> addProduct(
    Map<String, dynamic> product, {
    int quantity = 1,
    String? size,
    String? color,
    int? variantIndex,
    String? selectedShippingCountry,
  }) async {
    final item = _fromProduct(
      product,
      quantity: quantity,
      size: size,
      color: color,
      variantIndex: variantIndex,
      selectedShippingCountry: selectedShippingCountry,
    );
    if (item.productId <= 0) return AddToBagResult.failed;

    // Optimistic local merge so the badge moves on the same frame as the tap.
    final next = List<CartItem>.from(_current);
    final existing = next.indexWhere((i) => i.matches(item));
    final already = existing >= 0 ? next[existing].quantity : 0;

    final stock = availableStock(
      product,
      size: size,
      variantIndex: variantIndex,
    );
    if (stock > 0 && already + item.quantity > stock) {
      return AddToBagResult.notEnoughStock(stock: stock, inBag: already);
    }

    if (existing >= 0) {
      next[existing] = next[existing].copyWith(
        quantity: already + item.quantity,
        selected: true,
      );
    } else {
      next.add(item);
    }
    _publish(next);

    if (!Api.loggedIn) return AddToBagResult.added;
    final saved = await Api.addToCart(item.toJson()..remove('id'));
    await sync();
    return saved == null ? AddToBagResult.failed : AddToBagResult.added;
  }

  static CartItem _fromProduct(
    Map<String, dynamic> product, {
    required int quantity,
    String? size,
    String? color,
    int? variantIndex,
    String? selectedShippingCountry,
  }) {
    double discount = 0;
    double resellPct = 0;
    try {
      final raw = product['commission_info'];
      final info = raw is String ? jsonDecode(raw) : raw;
      if (info is Map) {
        discount = _num(info['discount']);
        resellPct = _num(
          info['resell_percentage'] ??
              info['resell_percent'] ??
              info['resell_commission'],
        );
      }
    } catch (_) {}

    var methods = <String>[];
    final rawMethods = product['payment_methods'] ?? product['payment_data'];
    if (rawMethods is List) {
      methods = rawMethods.map((m) => '$m').toList();
    } else if (rawMethods is String && rawMethods.trim().isNotEmpty) {
      try {
        final parsed = jsonDecode(rawMethods);
        if (parsed is List) methods = parsed.map((m) => '$m').toList();
      } catch (_) {}
    }
    if (methods.isEmpty) methods = const ['wallet'];

    final price = _num(product['price']);
    final promo = _num(product['promo_price']);
    final images = product['images'];
    final image = '${product['image_url'] ?? ''}'.trim().isNotEmpty
        ? '${product['image_url']}'
        : (images is List && images.isNotEmpty ? '${images.first}' : '');

    return CartItem(
      id: DateTime.now().millisecondsSinceEpoch,
      productId: _int(
        product['id'] ?? product['productId'] ?? product['product_id'],
      ),
      title: '${product['title'] ?? ''}',
      price: price,
      promoPrice: promo > 0 ? promo : price,
      imageUrl: image,
      quantity: quantity < 1 ? 1 : quantity,
      size: _nullableString(size),
      color: (color ?? '').trim().isEmpty || color == 'None' ? null : color,
      variantIndex: variantIndex,
      sellerId: _nullableString(product['owner_user_id'] ?? product['user_id']),
      shippingInfo: product['shipping_info'] ?? product['shipping_data'],
      productDiscount: discount,
      selectedShippingCountry: _nullableString(selectedShippingCountry),
      paymentMethods: methods,
      resellerRef: _nullableString(
        product['reseller_ref'] ??
            product['resell_ref'] ??
            product['resellerRef'],
      ),
      resellCommissionPercentage: resellPct,
    );
  }

  static Future<void> updateQuantity(int itemId, int delta) async {
    final next = List<CartItem>.from(_current);
    final index = next.indexWhere((i) => i.id == itemId);
    if (index < 0) return;
    final quantity = (next[index].quantity + delta).clamp(1, 999);
    if (quantity == next[index].quantity) return;
    next[index] = next[index].copyWith(quantity: quantity);
    _publish(next);
    if (!Api.loggedIn) return;
    await Api.updateCartItem(itemId, {'quantity': quantity});
  }

  static Future<void> toggleSelection(int itemId) async {
    final next = List<CartItem>.from(_current);
    final index = next.indexWhere((i) => i.id == itemId);
    if (index < 0) return;
    final selected = !next[index].selected;
    next[index] = next[index].copyWith(selected: selected);
    _publish(next);
    if (!Api.loggedIn) return;
    await Api.updateCartItem(itemId, {'selected': selected});
  }

  static Future<void> toggleAll(bool selected) async {
    final next = _current.map((i) => i.copyWith(selected: selected)).toList();
    _publish(next);
    if (!Api.loggedIn) return;
    for (final item in next) {
      await Api.updateCartItem(item.id, {'selected': selected});
    }
  }

  static Future<void> remove(int itemId) async {
    _publish(_current.where((i) => i.id != itemId).toList());
    if (!Api.loggedIn) return;
    await Api.removeCartItem(itemId);
  }

  static Future<void> removeMany(Iterable<int> itemIds) async {
    final ids = itemIds.toSet();
    _publish(_current.where((i) => !ids.contains(i.id)).toList());
    if (!Api.loggedIn) return;
    for (final id in ids) {
      await Api.removeCartItem(id);
    }
  }

  static Future<void> clear() async {
    _publish(const <CartItem>[]);
    if (!Api.loggedIn) return;
    await Api.clearCart();
  }
}
