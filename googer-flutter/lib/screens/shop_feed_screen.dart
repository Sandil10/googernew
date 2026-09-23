import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:visibility_detector/visibility_detector.dart';
import 'package:file_picker/file_picker.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../data/mock.dart' show HomeAd;
import '../services/app_notifications.dart';
import '../services/cart_store.dart';
import '../services/shop_ranking.dart';
import '../theme/colors.dart';
import '../util/open_link.dart';
import '../util/hidden_feed_items.dart';
import '../util/upload_picker.dart';
import '../widgets/app_back_button.dart';
import '../widgets/verified_badge.dart';
import '../widgets/subscribe_button.dart';
import 'chat_dm_screen.dart';
import 'home_feed_screen.dart' show openInteractionsSheet, openShareSheet;
import 'product_promote_screen.dart';
import 'user_profile_screen.dart';

// ── shop data helpers (parse the raw `product: any` maps the web uses) ──────

dynamic _sp(dynamic value) {
  if (value == null) return null;
  if (value is! String) return value;
  final trimmed = value.trim();
  if (trimmed.isEmpty) return null;
  try {
    return jsonDecode(trimmed);
  } catch (_) {
    return value;
  }
}

Map<String, dynamic> mergeProductResellerAttribution(
  Map<String, dynamic> product,
  Map<String, dynamic>? attributedFallback,
) {
  if (attributedFallback == null) return product;
  final reseller =
      '${attributedFallback['reseller_ref'] ?? attributedFallback['resell_ref'] ?? ''}'
          .trim();
  if (reseller.isEmpty) return product;
  return {...product, 'reseller_ref': reseller, 'resell_ref': reseller};
}

String _str(Map m, List<String> keys, [String fallback = ""]) {
  for (final k in keys) {
    final v = m[k];
    if (v != null && "$v".trim().isNotEmpty) return "$v";
  }
  return fallback;
}

double _num(Map m, List<String> keys, [double fallback = 0]) {
  for (final k in keys) {
    final v = double.tryParse("${m[k]}");
    if (v != null) return v;
  }
  return fallback;
}

int _int(Map m, List<String> keys, [int fallback = 0]) =>
    _num(m, keys, fallback.toDouble()).round();

bool _placeholderImage(String src) {
  final v = src.trim().toLowerCase();
  return v.isEmpty ||
      v.contains("/assets/images/googer.png") ||
      v.contains("/assets/images/rupeer");
}

String _imgCandidate(dynamic value) {
  if (value is String) return value;
  if (value is Map) {
    return "${value["url"] ?? value["image_url"] ?? value["image"] ?? value["src"] ?? value["media_url"] ?? ""}";
  }
  return "";
}

/// First entry that is not blank once trimmed — the Dart stand-in for JS's
/// `a || b || c`, which `??` does not reproduce because `""` is not null.
String _firstNonEmpty(List<String> values) {
  for (final value in values) {
    if (value.trim().isNotEmpty) return value.trim();
  }
  return "";
}

List<Map<String, dynamic>> _variants(Map product) {
  final parsed = _sp(product["variants"]);
  if (parsed is List) {
    return parsed
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }
  return const [];
}

List<String> _productImages(Map product) {
  final out = <String>[];
  void add(dynamic value) {
    final candidate = _imgCandidate(value).trim();
    if (candidate.isNotEmpty &&
        !_placeholderImage(candidate) &&
        !out.contains(candidate)) {
      out.add(candidate);
    }
  }

  add(product["image_url"]);
  add(product["main_image"]);
  add(product["media_preview"]);
  final images = _sp(product["images"]);
  if (images is List) images.forEach(add);
  final gallery = _sp(product["media_gallery"]);
  if (gallery is List) gallery.forEach(add);
  add(product["media_url"]);
  add(product["thumbnail_url"]);
  for (final v in _variants(product)) {
    add(v["image_url"] ?? v["url"] ?? v["image"]);
  }
  return out;
}

String _primaryImage(Map product) {
  final images = _productImages(product);
  if (images.isEmpty) return "";
  return Api.resolveMedia(images.first);
}

double _displayPrice(Map product) {
  final promo = double.tryParse("${product["promo_price"]}");
  if (promo != null && promo > 0) return promo;
  return _num(product, ["price", "main_price", "product_price"]);
}

/// One destination a product ships to, with its charge.
class _ShippingRate {
  final String country;
  final double price;
  final String days;
  const _ShippingRate(this.country, this.price, this.days);

  /// Web shows "FREE" for a zero charge rather than "R 0".
  String get priceText => price == 0 ? "FREE" : "R ${_money(price)}";
}

const _defaultShippingDays = "3-5 Business Days";

/// Every destination a product ships to — a port of the web `parseShippingData`
/// so the mobile SHIPS TO picker offers exactly the same list as the web one.
///
/// The field is a moving target across endpoints: it can be a unified flat
/// charge, an explicit per-country rate table, or a bare comma-separated
/// country string, and it arrives either JSON-encoded or already decoded.
List<_ShippingRate> _shippingRates(Map product) {
  final info =
      _sp(product["shipping_info"]) ??
      _sp(product["shipping_data"]) ??
      _sp(product["shipping_rates"]);

  final rates = info is Map ? info["rates"] : (info is List ? info : null);

  final out = <_ShippingRate>[];

  if (info is Map && info["unified"] == true) {
    // One charge for every destination it lists.
    final charge = _numOf(info["charge"]);
    final days = "${info["days"] ?? info["date"] ?? _defaultShippingDays}";
    final list = rates is List && rates.isNotEmpty
        ? rates
        : const [<String, dynamic>{}];
    for (final entry in list) {
      final country = entry is Map ? "${entry["country"] ?? ""}" : "$entry";
      out.add(
        _ShippingRate(
          country.trim().isEmpty ? "Worldwide" : country,
          charge,
          days,
        ),
      );
    }
  } else if (rates is List && rates.isNotEmpty) {
    final fallbackDays = info is Map
        ? "${info["days"] ?? info["date"] ?? _defaultShippingDays}"
        : _defaultShippingDays;
    for (final entry in rates.whereType<Map>()) {
      out.add(
        _ShippingRate(
          "${entry["country"] ?? "Unknown"}",
          _numOf(entry["charge"] ?? entry["price"]),
          "${entry["days"] ?? entry["date"] ?? fallbackDays}",
        ),
      );
    }
  } else if (info is Map) {
    final countries =
        info["available_countries"] ?? info["countries"] ?? info["region"];
    final charge = _numOf(
      info["shipping_cost"] ?? info["price"] ?? info["charge"],
    );
    final days = "${info["days"] ?? info["date"] ?? _defaultShippingDays}";
    if (countries is String) {
      for (final name in countries.split(",")) {
        if (name.trim().isNotEmpty) {
          out.add(_ShippingRate(name.trim(), charge, days));
        }
      }
    } else if (countries is List) {
      for (final entry in countries) {
        if (entry is Map) {
          out.add(
            _ShippingRate(
              "${entry["country"] ?? entry["name"] ?? "Unknown"}",
              _numOf(entry["price"] ?? entry["cost"] ?? entry["charge"]) == 0
                  ? charge
                  : _numOf(entry["price"] ?? entry["cost"] ?? entry["charge"]),
              "${entry["days"] ?? entry["date"] ?? days}",
            ),
          );
        } else if ("$entry".trim().isNotEmpty) {
          out.add(_ShippingRate("$entry".trim(), charge, days));
        }
      }
    }
  }

  if (out.isEmpty) {
    return const [_ShippingRate("Worldwide", 0, _defaultShippingDays)];
  }
  return out;
}

double _numOf(dynamic value) => double.tryParse("${value ?? ""}") ?? 0;

double? _oldPrice(Map product) {
  final promo = double.tryParse("${product["promo_price"]}");
  final base = _num(product, ["price", "main_price"]);
  if (promo != null && promo > 0 && promo < base) return base;
  return null;
}

String? _discount(Map product) {
  final info = _sp(product["commission_info"]);
  if (info is Map) {
    final d = double.tryParse("${info["discount"]}");
    if (d != null && d > 0) return "${info["discount"]}";
  }
  return null;
}

/// Reseller commission used by the Web-compatible Share & Earn sheet.
String _resellPercent(Map product) {
  final info = _sp(product["commission_info"]);
  if (info is Map) {
    final v =
        info["resell_percentage"] ??
        info["resell_amount"] ??
        info["resell_commission"] ??
        info["reseller_commission"] ??
        info["googer_commission"];
    if (v != null && "$v".trim().isNotEmpty) return "$v%";
  }
  return "";
}

List<String> _uniqueVariantColors(Map product) {
  final out = <String>[];
  for (final v in _variants(product)) {
    final color = "${v["color"] ?? ""}".trim();
    if (color.isNotEmpty && color != "None" && !out.contains(color))
      out.add(color);
  }
  return out;
}

const Map<String, Color> _colorSwatch = {
  "black": Color(0xFF000000),
  "white": Color(0xFFFFFFFF),
  "red": Color(0xFFEF4444),
  "blue": Color(0xFF3B82F6),
  "green": Color(0xFF10B981),
  "yellow": Color(0xFFF59E0B),
  "gray": Color(0xFF6B7280),
  "grey": Color(0xFF6B7280),
  "purple": Color(0xFF8B5CF6),
  "pink": Color(0xFFEC4899),
  "orange": Color(0xFFF97316),
};

/// The card-dot palette, copied name-for-name **and case-for-case** from the
/// web `SharedProductCard.tsx` COLORS list.
///
/// Casing is significant here because the web matches with
/// `COLORS.find((c) => c.name === colorName)` — a strict `===`. A variant
/// stored as "blue" therefore gets no dot on the web, and must get none here
/// either, or mobile shows dots the web does not.
///
/// "None" is in the web list but never reaches this lookup: it is filtered out
/// by [_uniqueVariantColors] first, exactly as the web filters it.
const Map<String, Color> _cardDotSwatch = {
  "Black": Color(0xFF000000),
  "White": Color(0xFFFFFFFF),
  "Red": Color(0xFFEF4444),
  "Blue": Color(0xFF3B82F6),
  "Green": Color(0xFF10B981),
  "Yellow": Color(0xFFF59E0B),
  "Gray": Color(0xFF6B7280),
  "Purple": Color(0xFF8B5CF6),
  "Pink": Color(0xFFEC4899),
  "Orange": Color(0xFFF97316),
};

/// Grid-card dot colour, or null when the name is not an exact palette match —
/// the web renders no dot at all in that case (`if (!colorInfo) return null`).
Color? _swatchOrNull(String name) => _cardDotSwatch[name.trim()];

/// Swatch colour with a neutral fallback, for the second view.
///
/// Deliberately case-*insensitive* and separate from [_swatchOrNull]: the web's
/// second view does not consult the palette at all, it draws
/// `variant.color_hex || "#333"`. Matching loosely here keeps a lowercase
/// "blue" tile blue rather than dropping it to grey.
Color _swatch(String name) =>
    _colorSwatch[name.trim().toLowerCase()] ?? const Color(0xFF6B7280);

String _sellerName(Map product) => _str(product, [
  "owner_username",
  "shop_name",
  "username",
  "seller_username",
], "Seller");

String _sellerAvatar(Map product) {
  final owner = product["user"] is Map
      ? Map<String, dynamic>.from(product["user"])
      : product["owner"] is Map
      ? Map<String, dynamic>.from(product["owner"])
      : const <String, dynamic>{};
  final raw = _str(product, [
    "profile_picture",
    "profilePicture",
    "owner_profile_picture",
    "ownerProfilePicture",
    "profileImage",
    "seller_avatar",
    "avatar",
  ]);
  final value = raw.isNotEmpty
      ? raw
      : "${owner["profile_picture"] ?? owner["profilePicture"] ?? owner["profileImage"] ?? owner["avatar"] ?? ""}";
  return value.trim().isEmpty ? "" : Api.resolveAvatar(value);
}

/// Is this listing the signed-in viewer's own?
///
/// Guards against the empty-vs-empty match: a product with no `user_id` and a
/// logged-out (or not-yet-loaded) viewer both stringify to "", which a plain
/// `==` reports as a match.
bool _isOwnedByViewer(Map product) {
  final owner = "${product["user_id"] ?? ""}".trim();
  final viewer = Api.currentUserId.trim();
  return owner.isNotEmpty && viewer.isNotEmpty && owner == viewer;
}

String _sellerId(Map product) =>
    _str(product, ["user_id", "owner_id", "seller_id", "userId"]);

String _sellerUsername(Map product) =>
    _str(product, ["owner_username", "username", "seller_username"]);

/// Opens the seller's public profile — used wherever a seller name/avatar shows.
void _openSellerProfile(BuildContext context, Map product) {
  final id = _sellerId(product);
  final username = _sellerUsername(product);
  if (id.isEmpty && username.isEmpty) return;
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => UserProfileScreen(
        userId: id,
        username: username,
        displayName: _sellerName(product),
        avatar: _sellerAvatar(product),
      ),
    ),
  );
}

String _money(num value) {
  final d = value.toDouble();
  final s = d == d.roundToDouble()
      ? d.toStringAsFixed(0)
      : d.toStringAsFixed(2);
  final parts = s.split(".");
  final intPart = parts[0].replaceFirst("-", "");
  final buf = StringBuffer(d < 0 ? "-" : "");
  for (var i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 == 0) buf.write(",");
    buf.write(intPart[i]);
  }
  return parts.length > 1 ? "${buf.toString()}.${parts[1]}" : buf.toString();
}

// ── Shop tab ────────────────────────────────────────────────────────────────

/// Live marketplace tab — full parity port of the web `dashboard/shop` page.
/// Kept as `ShopFeedScreen` so the home shell's `case 1` wiring is untouched.
class ShopFeedScreen extends StatefulWidget {
  /// Query submitted in the shared [GoogerTopbar]. The shop no longer owns a
  /// search box of its own — the topbar's is the only one — so the shell hands
  /// the committed query down here.
  final String searchQuery;

  const ShopFeedScreen({super.key, this.searchQuery = ""});

  @override
  State<ShopFeedScreen> createState() => _ShopFeedScreenState();
}

class _ShopFeedScreenState extends State<ShopFeedScreen> {
  final ScrollController _scroll = ScrollController();
  final ScrollController _listingTabScroll = ScrollController();
  final ScrollController _orderTabScroll = ScrollController();

  // top-level tabs: 0 = Market, 1 = My Listings, 2 = My Orders
  int _tab = 0;

  /// My Listings sub-tabs, matching the web `mylisting-scroll` row. The
  /// "reviewing" pill relabels itself to Rejected Products when any listing has
  /// actually been rejected, exactly as the web does.
  List<_SubTab> get _listingSubTabs {
    final hasRejected = _myProducts.any(
      (p) => "${p["status"] ?? ""}".trim().toLowerCase() == "rejected",
    );
    return [
      const _SubTab(
        "active",
        "Active Products",
        Ionicons.checkmark_circle,
        Ionicons.checkmark_circle_outline,
      ),
      _SubTab(
        "all",
        "Your Orders",
        Ionicons.receipt,
        Ionicons.receipt_outline,
        badge: _int(_badge["seller"] is Map ? _badge["seller"] : const {}, [
          "total",
        ]),
      ),
      _SubTab(
        "reviewing",
        hasRejected ? "Rejected Products" : "Review Products",
        hasRejected ? Ionicons.close_circle : Ionicons.time,
        hasRejected ? Ionicons.close_circle_outline : Ionicons.time_outline,
      ),
      const _SubTab(
        "deleted",
        "Inactive Products",
        Ionicons.trash,
        Ionicons.trash_outline,
      ),
    ];
  }

  static const _listingStatus = {
    "active": "approved",
    "reviewing": "reviewing",
    "deleted": "deleted,inactive",
    "all": "",
  };
  String _listingSub = "active";

  /// My Orders sub-tabs — the web's buyer-side order stages.
  List<_SubTab> get _orderSubTabs {
    final buyer = _badge["buyer"] is Map
        ? Map<String, dynamic>.from(_badge["buyer"])
        : const <String, dynamic>{};
    return [
      _SubTab(
        "all",
        "All Orders",
        Ionicons.receipt,
        Ionicons.receipt_outline,
        badge: _int(buyer, ["all"]),
      ),
      _SubTab(
        "processing",
        "Processing",
        Ionicons.sync,
        Ionicons.sync_outline,
        badge: _int(buyer, ["processing"]),
      ),
      _SubTab(
        "shipped",
        "Shipped",
        Ionicons.airplane,
        Ionicons.airplane_outline,
        badge: _int(buyer, ["shipped"]),
      ),
      const _SubTab(
        "delivered",
        "Delivered",
        Ionicons.cube,
        Ionicons.cube_outline,
      ),
      const _SubTab(
        "returns",
        "Returns",
        Ionicons.refresh_circle,
        Ionicons.refresh_circle_outline,
      ),
    ];
  }

  /// web ORDER_STAGE_FILTERS — a sub-tab maps to a set of order statuses.
  static const _orderStageFilters = {
    "all":
        "pending,processing,shipped,delivered,received,reshipped,cancelled,returned,rejected",
    "processing": "processing",
    "shipped": "shipped",
    "delivered": "delivered,received,reshipped,rejected",
    "returns": "returned",
  };
  String _orderSub = "all";

  List<Map<String, dynamic>> _products = const [];
  List<HomeAd> _ads = const [];
  List<HomeAd> _profileAds = const [];
  List<Map<String, dynamic>> _myProducts = const [];
  List<Map<String, dynamic>> _orders = const [];
  final Set<String> _hidden = {};
  final Set<String> _hiddenAdIds = {};

  List<String> _chips = const ["All"];
  String _category = "All";
  String _search = "";

  /// The category tree, kept whole so the second and third levels can be
  /// derived from the current selection. The backend ignores the category
  /// params entirely, so all three levels filter client-side.
  List<Map<String, dynamic>> _tree = const [];
  String _subCategory = "";
  String _level3 = "";

  String _algorithm = ShopAlgorithm.recommended;
  String _sort = "";
  String _country = "";

  /// Grid ad cadence. The shop uses 6; the home feed uses 4.
  static const _shopAdRatio = 6;

  /// Advances per load so the grid does not always open with the same ad.
  int _adRotation = 0;

  /// Seconds spent on each product, keyed by [productRankingKey]. Purely local
  /// — it feeds the "recommended" ranking and is never sent anywhere.
  final Map<String, double> _timeSpent = {};
  final List<String> _seenProductIds = <String>[];
  final List<String> _lastShownOrderIds = <String>[];
  late String _marketFeedSession = _newMarketFeedSession();

  bool _loading = true;
  bool _loadingMore = false;
  Map<String, dynamic> _badge = const {};
  final String _adSeed = DateTime.now().millisecondsSinceEpoch.toString();

  String _newMarketFeedSession() =>
      '${DateTime.now().millisecondsSinceEpoch}-${math.Random().nextInt(1 << 32).toRadixString(36)}';

  void _rememberMarketOrder(List<Map<String, dynamic>> products) {
    final ids = products
        .map((p) => '${p["id"] ?? ""}'.trim())
        .where((id) => id.isNotEmpty)
        .toList(growable: false);
    if (ids.isEmpty) return;
    _lastShownOrderIds
      ..clear()
      ..addAll(ids.take(80));
    for (final id in ids) {
      _seenProductIds.remove(id);
      _seenProductIds.add(id);
    }
    if (_seenProductIds.length > 60) {
      _seenProductIds.removeRange(0, _seenProductIds.length - 60);
    }
  }

  @override
  void initState() {
    super.initState();
    _hiddenAdIds.addAll(readHiddenFeedItemIds(Api.currentUserId, 'ad'));
    _scroll.addListener(_onScroll);
    _search = widget.searchQuery.trim();
    _bootstrap();
  }

  @override
  void didUpdateWidget(ShopFeedScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Search now lives in the shared topbar, so a new query arrives as a widget
    // update rather than a text-field callback.
    final next = widget.searchQuery.trim();
    if (next == oldWidget.searchQuery.trim()) return;
    _search = next;
    _loadMarket(reset: true);
  }

  @override
  void dispose() {
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    _listingTabScroll.dispose();
    _orderTabScroll.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    _loadChips();
    _refreshCartAndBadges();
    await _loadMarket(reset: true);
  }

  Future<void> _loadChips() async {
    // The tree drives the second and third chip rows; the flat list is only the
    // top row, so keep both.
    final tree = await Api.categoryTree();
    final topLevel = tree
        .map((n) => "${n["name"] ?? n["title"] ?? ""}".trim())
        .where((n) => n.isNotEmpty)
        .toList();
    final chips = topLevel.isNotEmpty
        ? <String>["All", ...topLevel]
        : await Api.categories();
    if (!mounted) return;
    setState(() {
      _tree = tree;
      _chips = chips.isEmpty ? const ["All"] : chips;
    });
  }

  Future<void> _refreshCartAndBadges() async {
    // The cart badge is the topbar's job now; this only keeps the store and the
    // order-tab counts fresh.
    await CartStore.sync();
    final badge = await Api.orderBadgeCounts();
    if (mounted) {
      setState(() => _badge = badge);
    }
  }

  void _onScroll() {
    if (_tab != 0 || _loadingMore || !Api.shopHasMore) return;
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 500) {
      _loadMore();
    }
  }

  Future<void> _loadMarket({bool reset = false}) async {
    if (reset && mounted) setState(() => _loading = true);
    if (reset) _marketFeedSession = _newMarketFeedSession();
    final products = await Api.shopProductsRaw(
      search: _search,
      category: _category,
      country: _country,
      sort: _sort,
      algorithm: _algorithm,
      status: 'approved',
      shuffle: DateTime.now().millisecondsSinceEpoch.toString(),
      feedSession: _marketFeedSession,
      seenProductIds: _seenProductIds,
      lastShownOrderIds: _lastShownOrderIds,
      limit: 20,
      offset: 0,
    );
    final ads = await Api.activeAds(shuffleSeed: _adSeed);
    if (!mounted) return;
    setState(() {
      _rememberMarketOrder(products);
      _products = products;
      _ads = ads
          .where(
            (a) =>
                a.isProductPromote &&
                a.linkedProductId > 0 &&
                !_hiddenAdIds.contains(a.adId),
          )
          .toList();
      // Profile Promote never sits inline in the grid — it gets its own
      // carousel rows, exactly as on the web.
      _profileAds = ads
          .where((a) => a.isProfilePromote && !_hiddenAdIds.contains(a.adId))
          .toList();
      // Advance the ad cycle each load so the grid does not always open on the
      // same promoted product.
      _adRotation += 1;
      _loading = false;
    });
  }

  Future<void> _loadMore() async {
    if (mounted) setState(() => _loadingMore = true);
    final more = await Api.shopProductsRaw(
      search: _search,
      category: _category,
      country: _country,
      sort: _sort,
      algorithm: _algorithm,
      status: 'approved',
      shuffle: DateTime.now().millisecondsSinceEpoch.toString(),
      feedSession: _marketFeedSession,
      seenProductIds: _seenProductIds,
      lastShownOrderIds: _lastShownOrderIds,
      limit: 20,
      offset: Api.shopNextOffset,
    );
    if (!mounted) return;
    setState(() {
      final ids = _products.map((p) => "${p["id"]}").toSet();
      _products = [
        ..._products,
        ...more.where((p) => !ids.contains("${p["id"]}")),
      ];
      _rememberMarketOrder(_products);
      _loadingMore = false;
    });
  }

  Future<void> _loadMyProducts() async {
    if (mounted) setState(() => _loading = true);
    // The Reviewing tab covers both statuses on the web — a rejected listing
    // has no tab of its own, so it lives here. Fetch unfiltered and narrow
    // locally, since the endpoint takes a single status.
    // "Your Orders" is the seller-order view, not a product list.
    if (_listingSub == "all") {
      final orders = await Api.sellerOrders();
      if (!mounted) return;
      setState(() {
        _orders = orders;
        _myProducts = const [];
        _loading = false;
      });
      return;
    }
    final reviewing = _listingSub == "reviewing";
    var items = await Api.myProducts(
      status: reviewing ? "" : (_listingStatus[_listingSub] ?? ""),
    );
    if (reviewing) {
      items = items.where((p) {
        final status = "${p["status"] ?? ""}".trim().toLowerCase();
        return status == "reviewing" || status == "rejected";
      }).toList();
    }
    if (!mounted) return;
    setState(() {
      _myProducts = items;
      _loading = false;
    });
  }

  /// My Orders is the buyer side; the stage pills narrow it by order status.
  /// The endpoint has no status filter, so the stage set is applied here.
  Future<void> _loadOrders() async {
    if (mounted) setState(() => _loading = true);
    final items = await Api.buyerOrders();
    if (!mounted) return;
    final allowed = (_orderStageFilters[_orderSub] ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .where((s) => s.isNotEmpty)
        .toSet();
    final filtered = allowed.isEmpty
        ? items
        : items
              .where(
                (o) => allowed.contains(
                  "${o["status"] ?? ""}".trim().toLowerCase(),
                ),
              )
              .toList();
    setState(() {
      _orders = filtered;
      _loading = false;
    });
  }

  void _switchTab(int tab) {
    if (_tab == tab) return;
    setState(() => _tab = tab);
    if (tab == 1) {
      _loadMyProducts();
    } else if (tab == 2) {
      _loadOrders();
    } else if (_products.isEmpty) {
      _loadMarket(reset: true);
    }
  }

  /// Grid contents for the market tab.
  ///
  /// The backend does no ranking — `GET /market` honours `search` and drops
  /// `algorithm`, `sort`, `country` and the category params on the floor — so
  /// the whole pipeline runs here, exactly as the web does it. Order matters;
  /// see `docs/feature-map/11-SHOP-FEED-UI.md` §2.
  List<_Cell> get _cells {
    var visible = _products
        .where((p) => !_hidden.contains("${p["id"]}"))
        .where(_matchesCategory)
        .toList();

    // Country filter — a product that ships worldwide passes any country.
    final country = _country.trim().toLowerCase();
    if (country.isNotEmpty) {
      visible = visible.where((p) {
        final countries = productCountryValues(p, _sp);
        return countries.contains(country) || countries.contains("worldwide");
      }).toList();
    }

    // Dwell time is a local signal the server never sees; it feeds the
    // "recommended" blend.
    visible = visible.map((p) {
      final spent = _timeSpent[productRankingKey(p)];
      if (spent == null) return p;
      return <String, dynamic>{...p, "_local_time_spent": spent};
    }).toList();

    visible = rankMarketProducts(visible, _algorithm, query: _search);
    visible = applyShopSort(visible, _sort);

    return _insertProfileCarousels(_interleaveAds(visible));
  }

  /// Child names of a node in [_tree] matching `name`, searched at any depth.
  List<String> _childrenOf(String name) {
    if (name.isEmpty || name == "All") return const [];
    final target = name.trim().toLowerCase();
    List<String>? found;

    void walk(List list) {
      for (final raw in list) {
        if (found != null) return;
        if (raw is! Map) continue;
        final node = Map<String, dynamic>.from(raw);
        final label = "${node["name"] ?? node["title"] ?? ""}".trim();
        final kids = node["children"] ?? node["subcategories"] ?? node["items"];
        if (label.toLowerCase() == target) {
          found = kids is List
              ? kids
                    .whereType<Map>()
                    .map((c) => "${c["name"] ?? c["title"] ?? ""}".trim())
                    .where((c) => c.isNotEmpty)
                    .toList()
              : const [];
          return;
        }
        if (kids is List) walk(kids);
      }
    }

    walk(_tree);
    return found ?? const [];
  }

  List<String> get _subChips => _childrenOf(_category);
  List<String> get _level3Chips => _childrenOf(_subCategory);

  /// Does a product sit under the selected category path? Matched against the
  /// three category fields the web's text search also reads.
  bool _matchesCategory(Map product) {
    bool has(String value) {
      if (value.isEmpty || value == "All") return true;
      final needle = value.trim().toLowerCase();
      for (final key in const ["category", "sub_category", "manual_category"]) {
        if ("${product[key] ?? ""}".trim().toLowerCase() == needle) return true;
      }
      return false;
    }

    return has(_category) && has(_subCategory) && has(_level3);
  }

  /// The six algorithm rows. Built from the same visible/filtered set the grid
  /// uses, but each ranked by its own algorithm.
  List<ShopAlgorithmSection> get _sections {
    if (_tab != 0) return const [];
    final base = _products
        .where((p) => !_hidden.contains("${p["id"]}"))
        .where((p) => p["is_sponsored"] != true)
        .toList();
    if (base.isEmpty) return const [];
    return buildAlgorithmSections(base, _adSeed, query: _search);
  }

  /// Web `insertProfilePromoteCarouselRows`: the first carousel lands after 4
  /// grid slots, every later one after 24. Carousel rows do not count toward
  /// their own interval.
  List<_Cell> _insertProfileCarousels(List<_Cell> items) {
    if (_profileAds.isEmpty) return items;
    if (items.isEmpty) return [_ProfileCarouselCell(_profileAds, 0)];

    const intervals = [4, 24];
    var intervalIndex = 0;
    var sinceCarousel = 0;
    var count = 0;
    final out = <_Cell>[];

    for (final item in items) {
      out.add(item);
      if (item is _ProfileCarouselCell) continue;
      sinceCarousel += 1;
      if (sinceCarousel == intervals[intervalIndex]) {
        out.add(_ProfileCarouselCell(_profileAds, count));
        count += 1;
        sinceCarousel = 0;
        if (intervalIndex < intervals.length - 1) intervalIndex += 1;
      }
    }
    return out;
  }

  /// Web `interleaveShopProductsWithAds`: an ad after every 6th product, with
  /// two special cases so ad inventory still shows on a thin grid.
  List<_Cell> _interleaveAds(List<Map<String, dynamic>> products) {
    final cells = <_Cell>[];
    if (_ads.isEmpty) {
      return products.map<_Cell>((p) => _ProductCell(p)).toList();
    }
    // Rotate so the grid does not open with the same ad on every visit.
    final rotation = _ads.isEmpty ? 0 : _adRotation.abs() % _ads.length;
    final ads = [..._ads.skip(rotation), ..._ads.take(rotation)];

    if (products.isEmpty) return [_AdCell(ads.first)];
    if (products.length < _shopAdRatio) {
      return [
        ...products.map<_Cell>((p) => _ProductCell(p)),
        _AdCell(ads.first),
      ];
    }

    var adIndex = 0;
    for (var i = 0; i < products.length; i++) {
      cells.add(_ProductCell(products[i]));
      if ((i + 1) % _shopAdRatio == 0) {
        cells.add(_AdCell(ads[adIndex % ads.length]));
        adIndex++;
      }
    }
    return cells;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // No controls row: the web's mobile shop goes straight from the topbar
        // into the tabs. The filter and categories buttons that used to sit
        // here were the last two of the duplicated header controls.
        _tabStrip(),
        if (_tab == 1)
          _subTabStrip(_listingSubTabs, _listingSub, (v) {
            setState(() => _listingSub = v);
            _loadMyProducts();
          }, controller: _listingTabScroll),
        if (_tab == 2)
          _subTabStrip(_orderSubTabs, _orderSub, (v) {
            setState(() => _orderSub = v);
            _loadOrders();
          }, controller: _orderTabScroll),
        if (_tab == 0) _categoryChips(),
        Expanded(child: _body()),
      ],
    );
  }

  Widget _circleButton(
    IconData icon,
    VoidCallback onTap, {
    bool active = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: active ? AppColors.purpleBg15 : AppColors.bg2,
          shape: BoxShape.circle,
          border: Border.all(
            color: active ? AppColors.purpleBorder : AppColors.borderWhite10,
          ),
        ),
        child: Icon(
          icon,
          size: 18,
          color: active ? AppColors.purpleText : Colors.white,
        ),
      ),
    );
  }

  Widget _tabStrip() {
    final tabs = ["Market", "My Listings", "My Orders"];
    // web: storefront / pricetag / cart, outline when inactive.
    const icons = [Ionicons.storefront, Ionicons.pricetag, Ionicons.cart];
    const iconsOutline = [
      Ionicons.storefront_outline,
      Ionicons.pricetag_outline,
      Ionicons.cart_outline,
    ];
    final badges = [
      0,
      _int(_badge["seller"] is Map ? _badge["seller"] : const {}, ["total"]),
      _int(_badge["buyer"] is Map ? _badge["buyer"] : const {}, ["total"]),
    ];
    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.borderWhite10)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          for (var i = 0; i < tabs.length; i++)
            GestureDetector(
              onTap: () => _switchTab(i),
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.only(right: 22, top: 8, bottom: 8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Icon(
                          _tab == i ? icons[i] : iconsOutline[i],
                          size: _tab == i && i == 0 ? 18 : 15,
                          color: _tab == i
                              ? Colors.white
                              : AppColors.textGray500,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          tabs[i],
                          style: TextStyle(
                            fontSize: _tab == i && i == 0 ? 16 : 13,
                            fontWeight: _tab == i
                                ? FontWeight.w600
                                : FontWeight.w600,
                            color: _tab == i
                                ? Colors.white
                                : AppColors.textGray500,
                          ),
                        ),
                        if (badges[i] > 0) ...[
                          const SizedBox(width: 5),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 5,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.likeRed,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              "${badges[i]}",
                              style: const TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 6),
                    Container(
                      height: 2,
                      width: 26,
                      color: _tab == i ? Colors.white : Colors.transparent,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// Sub-tab carousel: a ‹ button, a scrolling tray of pills, a › button.
  ///
  /// Mirrors the web's `mylisting-scroll` / `myorders-scroll` rows — a
  /// `bg-white/5` rounded tray with a hairline border, an active pill in solid
  /// white on black text, inactive pills in slate with an outline icon, and
  /// chevron buttons that nudge the tray by 150px.
  Widget _subTabStrip(
    List<_SubTab> items,
    String selected,
    ValueChanged<String> onTap, {
    required ScrollController controller,
  }) {
    void nudge(double delta) {
      if (!controller.hasClients) return;
      final target = (controller.offset + delta).clamp(
        0.0,
        controller.position.maxScrollExtent,
      );
      controller.animateTo(
        target,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOut,
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
      child: Row(
        children: [
          _carouselArrow(Ionicons.chevron_back, () => nudge(-150)),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              height: 46,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withOpacity(0.05)),
              ),
              child: ListView.separated(
                controller: controller,
                scrollDirection: Axis.horizontal,
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) {
                  final tab = items[i];
                  final active = tab.id == selected;
                  return GestureDetector(
                    onTap: () => onTap(tab.id),
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(
                        color: active ? Colors.white : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            active ? tab.icon : tab.iconOutline,
                            size: 14,
                            color: active
                                ? Colors.black
                                : AppColors.textGray500,
                          ),
                          const SizedBox(width: 7),
                          Text(
                            tab.label.toUpperCase(),
                            style: TextStyle(
                              fontSize: 10,
                              letterSpacing: 0.8,
                              fontWeight: FontWeight.w600,
                              color: active
                                  ? Colors.black
                                  : AppColors.textGray500,
                            ),
                          ),
                          if (tab.badge > 0) ...[
                            const SizedBox(width: 6),
                            Container(
                              constraints: const BoxConstraints(minWidth: 18),
                              height: 18,
                              alignment: Alignment.center,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 5,
                              ),
                              decoration: BoxDecoration(
                                color: active
                                    ? Colors.black
                                    : AppColors.likeRed,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                "${tab.badge}",
                                style: const TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(width: 8),
          _carouselArrow(Ionicons.chevron_forward, () => nudge(150)),
        ],
      ),
    );
  }

  /// The web's empty state: a dashed rounded panel with a basket glyph and
  /// wide-tracked "NO ITEMS FOUND HERE".
  Widget _emptyPanel() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      child: CustomPaint(
        painter: _DashedBorderPainter(
          color: Colors.white.withOpacity(0.10),
          radius: 26,
        ),
        child: SizedBox(
          height: 320,
          width: double.infinity,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Ionicons.basket_outline,
                size: 40,
                color: Colors.white.withOpacity(0.18),
              ),
              const SizedBox(height: 18),
              Text(
                "NO ITEMS FOUND HERE",
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 2.4,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withOpacity(0.22),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _carouselArrow(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.06),
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Icon(icon, size: 16, color: Colors.white),
      ),
    );
  }

  /// Three stacked chip rows — category, then sub-category, then level 3. The
  /// deeper rows only appear once their parent has children, matching the web's
  /// three-level tree.
  Widget _categoryChips() {
    final sub = _subChips;
    final level3 = _level3Chips;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _chipRow(_chips, _category, (value) {
          setState(() {
            _category = value;
            _subCategory = "";
            _level3 = "";
          });
        }),
        if (sub.isNotEmpty)
          _chipRow(
            ["All", ...sub],
            _subCategory.isEmpty ? "All" : _subCategory,
            (value) {
              setState(() {
                _subCategory = value == "All" ? "" : value;
                _level3 = "";
              });
            },
            dense: true,
          ),
        if (level3.isNotEmpty)
          _chipRow(
            ["All", ...level3],
            _level3.isEmpty ? "All" : _level3,
            (value) => setState(() => _level3 = value == "All" ? "" : value),
            dense: true,
          ),
      ],
    );
  }

  Widget _chipRow(
    List<String> items,
    String selected,
    void Function(String) onTap, {
    bool dense = false,
  }) {
    return SizedBox(
      height: dense ? 32 : 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.fromLTRB(12, dense ? 0 : 6, 12, dense ? 6 : 8),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final active = items[i] == selected;
          return GestureDetector(
            onTap: () => onTap(items[i]),
            child: Container(
              alignment: Alignment.center,
              padding: EdgeInsets.symmetric(horizontal: dense ? 10 : 12),
              decoration: BoxDecoration(
                color: active
                    ? (dense ? AppColors.textGray300 : Colors.white)
                    : AppColors.bg0,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: Text(
                items[i],
                style: TextStyle(
                  fontSize: dense ? 9 : 10,
                  fontWeight: FontWeight.w600,
                  color: active ? Colors.black : AppColors.textGray300,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 26,
          height: 26,
          child: CircularProgressIndicator(
            color: AppColors.textGray300,
            strokeWidth: 2,
          ),
        ),
      );
    }
    if (_tab == 1) return _myListingsBody();
    if (_tab == 2) return _ordersBody();
    return _marketBody();
  }

  Widget _marketBody() {
    final cells = _cells;
    return RefreshIndicator(
      color: AppColors.textGray300,
      backgroundColor: AppColors.bg1,
      onRefresh: () async {
        await _loadMarket(reset: true);
        await _refreshCartAndBadges();
      },
      child: cells.isEmpty
          ? ListView(children: [_emptyPanel()])
          : CustomScrollView(
              controller: _scroll,
              slivers: [
                // "Recommended For You", "Trending Now", … above the grid.
                for (final section in _sections)
                  SliverToBoxAdapter(child: _algorithmSection(section)),
                // The grid is two fixed columns, so a full-width carousel row
                // cannot live inside it. Emit the cells as alternating runs:
                // grid slivers for products/ads, box adapters for carousels.
                ..._gridSlivers(cells),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    child: Center(
                      child: _loadingMore
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                color: AppColors.textGray400,
                                strokeWidth: 2,
                              ),
                            )
                          : (Api.shopHasMore
                                ? const SizedBox(height: 4)
                                : const Text(
                                    "You're all caught up",
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: AppColors.textGray600,
                                    ),
                                  )),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  /// Split the cell list into grid runs separated by full-width carousel rows.
  List<Widget> _gridSlivers(List<_Cell> cells) {
    final slivers = <Widget>[];
    var run = <_Cell>[];

    void flush() {
      if (run.isEmpty) return;
      final batch = run;
      run = <_Cell>[];
      slivers.add(
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.56,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, i) => _buildCell(batch[i]),
              childCount: batch.length,
            ),
          ),
        ),
      );
    }

    for (final cell in cells) {
      if (cell is _ProfileCarouselCell) {
        flush();
        slivers.add(SliverToBoxAdapter(child: _profileCarousel(cell)));
      } else {
        run.add(cell);
      }
    }
    flush();
    return slivers;
  }

  /// A horizontal "Recommended For You" / "Trending Now" row.
  ///
  /// Cards are sized from the same numbers the grid uses — 12dp side padding,
  /// 12dp gutter, two columns, aspect 0.56 — so exactly two fit per view and a
  /// section card is indistinguishable in size from a grid card, as on the web.
  Widget _algorithmSection(ShopAlgorithmSection section) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const sidePadding = 12.0;
        const gutter = 12.0;
        const aspect = 0.56;
        final cardWidth = (constraints.maxWidth - sidePadding * 2 - gutter) / 2;
        final cardHeight = cardWidth / aspect;

        return Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                child: Text(
                  section.label.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 11,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
              SizedBox(
                height: cardHeight,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: sidePadding),
                  itemCount: section.products.length,
                  separatorBuilder: (_, __) => const SizedBox(width: gutter),
                  itemBuilder: (_, i) => SizedBox(
                    width: cardWidth,
                    child: _buildCell(_ProductCell(section.products[i])),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Full-width Profile Promote carousel row.
  Widget _profileCarousel(_ProfileCarouselCell cell) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(14, 4, 14, 8),
            child: Text(
              "PROMOTED PROFILES",
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 1.6,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray500,
              ),
            ),
          ),
          SizedBox(
            height: 108,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: cell.ads.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final ad = cell.ads[i];
                return GestureDetector(
                  onTap: () {
                    Api.markAdClick(ad.interactionId, 'visit');
                    _openSellerProfile(context, {
                      "user_id": ad.ownerUserId,
                      "username": ad.username,
                    });
                  },
                  child: Container(
                    width: 96,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.04),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.borderWhite06),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _MiniAvatar(
                          url: ad.avatar.isEmpty
                              ? ""
                              : Api.resolveMedia(ad.avatar),
                          name: ad.username,
                          size: 44,
                        ),
                        const SizedBox(height: 8),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          child: Text(
                            "@${ad.username}",
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCell(_Cell cell) {
    if (cell is _AdCell) {
      final ad = cell.ad;
      return ProductGridCard(
        product: {
          "id": "ad-${ad.adId}",
          "linked_product_id": ad.linkedProductId,
          "title": ad.title,
          "price": ad.price,
          "promo_price": ad.promoPrice,
          "image_url": ad.mediaPreview,
          "username": ad.username,
          "profile_picture": ad.avatar,
          "user_id": ad.ownerUserId,
          "likes_count": ad.likes,
          "views_count": ad.views,
          "comments_count": ad.comments,
          "shares_count": ad.shares,
          "user_liked": ad.liked,
          "commission_info": ad.discount.isEmpty
              ? (ad.resellCommission.isEmpty
                    ? null
                    : {"resell_percentage": ad.resellCommission})
              : {
                  "discount": ad.discount,
                  if (ad.resellCommission.isNotEmpty)
                    "resell_percentage": ad.resellCommission,
                },
          "product_code": ad.linkedProductShareCode,
          "campaign_type": ad.campaignType,
          "is_sponsored": true,
        },
        isAd: true,
        onImpression: () async {
          await Api.markAdImpression(ad.interactionId);
          return Api.markAdView(ad.interactionId);
        },
        onOpen: () => _openLinkedAd(ad),
        onLike: () async {
          await Api.toggleAdLike(ad.interactionId);
          await _loadMarket(reset: false);
        },
        onShare: (currentCount) => _shareShopAd(ad, currentCount: currentCount),
        onComment: () => _openShopAdInteractions(ad, 'comments'),
        onTrackedView: () => Api.markAdView(ad.interactionId),
        onView: () => _openShopAdInteractions(ad, 'views'),
        onMenu: (_) => _openShopAdMenu(ad),
        onAddToBag: () => _openLinkedAd(ad),
      );
    }
    final product = (cell as _ProductCell).product;
    return ProductGridCard(
      product: product,
      onOpen: () => _openQuickView(product),
      onLike: () => _toggleLike(product),
      onShare: (currentCount) =>
          _openShareSheet(product, currentCount: currentCount),
      onComment: () => _openInteractions(product, "comments"),
      onTrackedView: () => Api.markProductView(_int(product, ["id"])),
      onView: () => _openInteractions(product, "views"),
      onMenu: (mine) => _openProductMenu(product, mine: mine),
      onAddToBag: () => _openQuickView(product),
    );
  }

  Widget _myListingsBody() {
    return RefreshIndicator(
      color: AppColors.textGray300,
      backgroundColor: AppColors.bg1,
      onRefresh: _loadMyProducts,
      child: CustomScrollView(
        slivers: [
          // The web has no "List a product" banner on this tab — listing is
          // reached from the shell's ADD button — so it is not rendered here.
          if (_myProducts.isEmpty)
            SliverToBoxAdapter(child: _emptyPanel())
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 0.56,
                ),
                delegate: SliverChildBuilderDelegate((context, i) {
                  final product = _myProducts[i];
                  return ProductGridCard(
                    product: product,
                    showStatus: true,
                    onOpen: () => _openQuickView(product, isOwn: true),
                    onLike: () => _toggleLike(product),
                    onShare: (currentCount) =>
                        _openShareSheet(product, currentCount: currentCount),
                    onComment: () => _openInteractions(product, "comments"),
                    onTrackedView: () =>
                        Api.markProductView(_int(product, ["id"])),
                    onView: () => _openInteractions(product, "views"),
                    onMenu: (_) => _openOwnProductMenu(product),
                    onAddToBag: () => _openQuickView(product, isOwn: true),
                  );
                }, childCount: _myProducts.length),
              ),
            ),
        ],
      ),
    );
  }

  Widget _ordersBody() {
    if (_orders.isEmpty) {
      return RefreshIndicator(
        color: AppColors.textGray300,
        backgroundColor: AppColors.bg1,
        onRefresh: _loadOrders,
        child: ListView(children: [_emptyPanel()]),
      );
    }
    return RefreshIndicator(
      color: AppColors.textGray300,
      backgroundColor: AppColors.bg1,
      onRefresh: _loadOrders,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 16),
        itemCount: _orders.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _OrderCard(
          order: _orders[i],
          // My Orders is the buyer side; My Listings > Your Orders is the
          // seller side and reuses this card.
          isSeller: _tab == 1,
          onStatus: (status) => _changeOrderStatus(_orders[i], status),
          onReport: () => _reportOrder(_orders[i]),
          onChat: () => _openOrderChat(_orders[i]),
        ),
      ),
    );
  }

  // ── interactions ──────────────────────────────────────────────────────────

  Future<void> _toggleLike(Map product) async {
    await Api.toggleProductLikeState(product["id"]);
  }

  void _openLinkedAd(HomeAd ad) async {
    Api.markAdView(ad.interactionId);
    final product = await Api.productById(ad.linkedProductId);
    if (!mounted) return;
    if (product != null) {
      _openQuickView(product);
    } else if (ad.activeLink.isNotEmpty) {
      openExternalLink(ad.activeLink);
    }
  }

  void _openShopAdInteractions(HomeAd ad, String kind) {
    openInteractionsSheet(
      context,
      title: ad.title,
      subtitle: 'Sponsored',
      initialKind: kind,
      counts: {
        'likes': ad.likes,
        'views': ad.views,
        'comments': ad.comments,
        'shares': ad.shares,
      },
      fetch: (value) => Api.adInteractions(ad.interactionId, value),
      addComment: (text, {parentId}) =>
          Api.addAdComment(ad.interactionId, text, parentId: parentId),
      onCommentsChanged: () => _loadMarket(reset: false),
    );
  }

  Future<int?> _shareShopAd(HomeAd ad, {int? currentCount}) async {
    final nextShares = await Api.shareAd(
      ad.interactionId,
      currentCount: currentCount ?? ad.shares,
    );
    if (!mounted) return nextShares;
    final product = ad.isProductPromote;
    final code = product && Api.isCanonicalShareCode(ad.linkedProductShareCode)
        ? ad.linkedProductShareCode
        : (Api.isCanonicalShareCode(ad.shareCode.trim())
              ? ad.shareCode.trim()
              : Api.buildShareCode(
                  product ? 'p' : 'a',
                  product ? ad.linkedProductId : ad.adId,
                ));
    final url = product
        ? 'https://googer.site/product/$code'
        : 'https://googer.site/share/$code';
    openShareSheet(
      context,
      title: ad.title,
      subtitle: product ? 'PRODUCT' : 'Sponsored ad',
      url: url,
      linkLabel: product ? 'Product Link' : 'Share Link',
      canEarn: product,
      earnTitle: 'Share & Earn',
      earnSubtitle: product ? 'Create your personalized resell link' : '',
      commission: product && ad.resellCommission.isNotEmpty
          ? '${ad.resellCommission}%'
          : '',
      earnUrlBuilder: (id) => '$url/${Uri.encodeComponent(id)}',
      earnKind: 'Generate Share',
    );
    return nextShares;
  }

  bool _isMineAd(HomeAd ad) =>
      Api.currentUserIds.contains(ad.ownerUserId.trim()) ||
      ad.username.trim().toLowerCase() == Api.username.trim().toLowerCase();

  void _hideShopAd(HomeAd ad) {
    hideFeedItemFor24Hours(Api.currentUserId, 'ad', ad.adId);
    setState(() {
      _hiddenAdIds.add(ad.adId);
      _ads = _ads.where((candidate) => candidate.adId != ad.adId).toList();
      _profileAds = _profileAds
          .where((candidate) => candidate.adId != ad.adId)
          .toList();
    });
  }

  void _openShopAdMenu(HomeAd ad) {
    final mine = _isMineAd(ad);
    _sheet([
      _SheetItem(
        'Share Link',
        Ionicons.share_social_outline,
        () => _shareShopAd(ad),
        iconColor: const Color(0xFF60A5FA),
      ),
      _SheetItem(
        mine ? 'Promote Again' : 'Promote',
        Ionicons.megaphone_outline,
        () => Navigator.of(
          context,
        ).push(MaterialPageRoute(builder: (_) => const ProductPromoteScreen())),
        iconColor: const Color(0xFF34D399),
      ),
      if (!mine)
        _SheetItem(
          'Report',
          Ionicons.alert_circle_outline,
          () => _reportSheet((reason, detail) async {
            await Api.reportAd(ad.adId, reason, detail);
          }),
          iconColor: const Color(0xFFEAB308),
        ),
      if (!mine)
        _SheetItem(
          'Not Interested',
          Ionicons.eye_off_outline,
          () => _hideShopAd(ad),
          iconColor: AppColors.textGray500,
        ),
    ]);
  }

  void _openQuickView(Map product, {bool isOwn = false}) {
    // Dwell time feeds the "recommended" ranking. The web measures the same
    // signal client-side and never sends it anywhere; so do we.
    final rankingKey = productRankingKey(product);
    final openedAt = DateTime.now();
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.92),
      builder: (_) => _QuickViewSheet(
        product: Map<String, dynamic>.from(product),
        isOwn: isOwn,
        // web isReviewMode = my-products tab + "reviewing" sub-tab
        isReviewMode: isOwn && _tab == 1 && _listingSub == "Reviewing",
        onAddToBag: _addToCart,
        onBuyNow: _buyNow,
        onShare: (p, resell) => _openShareSheet(p, resell: resell),
        onComment: (p) => _openInteractions(p, "comments"),
        onOpenSheet: _openInteractions,
        onReport: (p) => _reportProduct(p),
        onSubscribe: (p) async {
          await Api.toggleUserSubscription(_sellerId(p));
          _snack("Subscribed to @${_sellerName(p)}");
        },
      ),
    ).then((_) {
      if (rankingKey.isEmpty) return;
      final seconds =
          DateTime.now().difference(openedAt).inMilliseconds / 1000.0;
      if (seconds <= 0) return;
      _timeSpent[rankingKey] = (_timeSpent[rankingKey] ?? 0) + seconds;
    });
  }

  void _openInteractions(Map product, String initial) {
    showShopProductInteractions(
      context,
      Map<String, dynamic>.from(product),
      initial,
      onCommentsChanged: () => _loadMarket(reset: true),
    );
  }

  /// The card's ⋮ menu. Item set, order and icon tints mirror the web
  /// `SharedProductCard` menu: Share Link · Promote · [Edit · Delete] ·
  /// Report · Not Interested.
  void _openProductMenu(Map product, {required bool mine}) {
    final reviewing =
        "${product["status"] ?? ""}".trim().toLowerCase() == "reviewing";
    _sheet([
      _SheetItem(
        "Share Link",
        Ionicons.share_social_outline,
        () => _openShareSheet(product),
        iconColor: const Color(0xFF60A5FA), // blue-400
      ),
      if (!reviewing)
        _SheetItem(
          "Promote",
          Ionicons.megaphone_outline,
          () => _promoteProduct(product),
          iconColor: const Color(0xFF34D399), // emerald-400
        ),
      if (mine)
        _SheetItem("Edit Post", Ionicons.create_outline, () async {
          final saved = await showEditProductSheet(context, product);
          if (saved) _loadMarket(reset: true);
        }, iconColor: const Color(0xFF34D399)),
      if (mine)
        _SheetItem("Delete Post", Ionicons.trash_outline, () async {
          final ok = await _confirm("Delete this listing?");
          if (ok != true) return;
          await Api.deleteProduct(product["id"]);
          _loadMyProducts();
        }, danger: true),
      if (!mine)
        _SheetItem(
          "Report",
          Ionicons.alert_circle_outline,
          () => _reportProduct(product),
          iconColor: const Color(0xFFEAB308), // yellow-500
        ),
      if (!mine)
        _SheetItem(
          "Not Interested",
          Ionicons.eye_off_outline,
          () => setState(() => _hidden.add("${product["id"]}")),
          iconColor: AppColors.textGray500, // slate-500
        ),
    ]);
  }

  /// Opens the Product Promote campaign builder for this listing.
  void _promoteProduct(Map product) {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const ProductPromoteScreen()));
    _snack("Promoting ${_str(product, ["title", "name"], "product")}");
  }

  void _openOwnProductMenu(Map product) {
    _sheet([
      _SheetItem(
        "Share Link",
        Ionicons.share_social_outline,
        () => _openShareSheet(product),
      ),
      _SheetItem("Edit Post", Ionicons.create_outline, () async {
        final saved = await showEditProductSheet(context, product);
        if (saved) _loadMyProducts();
      }, iconColor: const Color(0xFF34D399)),
      _SheetItem("Delete Listing", Ionicons.trash_outline, () async {
        final ok = await _confirm("Delete this listing?");
        if (ok != true) return;
        await Api.deleteProduct(product["id"]);
        _loadMyProducts();
      }, danger: true),
    ]);
  }

  Future<void> _addToCart(
    Map product,
    int qty,
    String? size,
    String? color,
    int? variantIndex,
    String? shippingCountry,
  ) async {
    final result = await CartStore.addProduct(
      Map<String, dynamic>.from(product),
      quantity: qty,
      size: size,
      color: color,
      variantIndex: variantIndex,
      selectedShippingCountry: shippingCountry,
    );
    if (!mounted) return;
    if (result.ok) {
      _refreshCartAndBadges();
      _snack("Added to bag", type: 'success');
    } else if (result.stockBlocked) {
      _snack(result.message, type: 'error');
    } else {
      _snack("Could not add to bag", type: 'error');
    }
  }

  Future<void> _buyNow(
    Map product,
    int qty,
    String? size,
    String? color,
    int? variantIndex,
  ) async {
    final error = await Api.createOrder({
      "item_id": _int(product, ["id"]),
      "quantity": qty,
      if (size != null) "size": size,
      if (color != null) "color": color,
      if (variantIndex != null) "variant_index": variantIndex,
      "total_price": _displayPrice(product) * qty,
      "payment_method": "wallet",
    });
    if (!mounted) return;
    _snack(error ?? "Order placed", type: error == null ? 'success' : 'error');
    if (error == null) _refreshCartAndBadges();
  }

  Future<void> _changeOrderStatus(Map order, String status) async {
    final id = _str(order, ["id", "order_id"]);
    final ok = await Api.updateOrderStatus(id, status);
    if (ok) _loadOrders();
  }

  /// Order-scoped chat with the counterparty — seller when the viewer is the
  /// buyer, buyer when the viewer is the seller.
  void _openOrderChat(Map order) {
    final counterparty = _tab == 1
        ? _str(order, ["buyer_username", "buyer_name"])
        : _str(order, ["seller_username", "owner_username", "seller_name"]);
    final peerId = _tab == 1
        ? _int(order, ["buyer_id", "buyer_user_id"])
        : _int(order, ["seller_id", "owner_user_id", "seller_user_id"]);
    if (counterparty.isEmpty || peerId <= 0) {
      _snack("No chat available for this order", type: 'error');
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatDmScreen(
          name: counterparty,
          username: counterparty,
          peerId: peerId,
        ),
      ),
    );
  }

  void _reportOrder(Map order) {
    _reportSheet((reason, detail) async {
      await Api.submitOrderReport(
        _str(order, ["id"]),
        reason,
        detail,
        _orderSub == "Selling" ? "seller" : "buyer",
      );
      _snack("Report submitted");
    });
  }

  void _reportProduct(Map product) {
    _reportSheet((reason, detail) async {
      await Api.reportProduct(_int(product, ["id"]), reason, detail);
      _snack("Report submitted");
    });
  }

  Future<int?> _openShareSheet(
    Map product, {
    bool resell = false,
    int? currentCount,
  }) async {
    final storedCode = _str(product, ["product_code", "share_code", "code"]);
    final code = Api.isCanonicalShareCode(storedCode)
        ? storedCode
        : Api.buildShareCode(
            'p',
            _str(product, ["linked_product_id", "product_id", "id"]),
          );
    var url = code.isNotEmpty
        ? "https://googer.site/product/$code"
        : "https://googer.site/shop";
    if (resell) {
      final link = await Api.resellShareLink(url);
      if (link != null) url = link;
    }
    final nextShares = await Api.shareProduct(
      _int(product, ['id']),
      currentCount:
          currentCount ?? _int(product, ['shares_count', 'shareCount']),
    );
    if (!mounted) return nextShares;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                resell ? "Resell commission link" : "Share product",
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 14,
                runSpacing: 14,
                children: [
                  _shareTarget(
                    "WhatsApp",
                    Ionicons.logo_whatsapp,
                    const Color(0xFF25D366),
                    "https://api.whatsapp.com/send?text=${Uri.encodeComponent(url)}",
                  ),
                  _shareTarget(
                    "Facebook",
                    Ionicons.logo_facebook,
                    const Color(0xFF1877F2),
                    "https://www.facebook.com/sharer/sharer.php?u=${Uri.encodeComponent(url)}",
                  ),
                  _shareTarget(
                    "X",
                    Ionicons.logo_twitter,
                    Colors.white,
                    "https://twitter.com/intent/tweet?url=${Uri.encodeComponent(url)}",
                  ),
                  _shareTarget(
                    "Telegram",
                    Ionicons.paper_plane_outline,
                    const Color(0xFF2AABEE),
                    "https://t.me/share/url?url=${Uri.encodeComponent(url)}",
                  ),
                  _shareTargetCopy(url),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    return nextShares;
  }

  Widget _shareTarget(String label, IconData icon, Color color, String target) {
    return GestureDetector(
      onTap: () {
        Navigator.maybePop(context);
        openExternalLink(target);
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: AppColors.bg2,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Icon(icon, size: 22, color: color),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(fontSize: 10, color: AppColors.textGray400),
          ),
        ],
      ),
    );
  }

  Widget _shareTargetCopy(String url) {
    return GestureDetector(
      onTap: () {
        Clipboard.setData(ClipboardData(text: url));
        Navigator.maybePop(context);
        _snack("Link copied");
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: AppColors.bg2,
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: const Icon(
              Ionicons.copy_outline,
              size: 20,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            "Copy",
            style: TextStyle(fontSize: 10, color: AppColors.textGray400),
          ),
        ],
      ),
    );
  }

  void _openCart() {
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => _CartView(onCheckout: _checkoutCart),
          ),
        )
        .then((_) => _refreshCartAndBadges());
  }

  Future<String?> _checkoutCart(
    List<Map<String, dynamic>> items,
    String address,
  ) async {
    final orderItems = items
        .map(
          (it) => {
            "item_id": _int(it, ["item_id", "product_id", "id"]),
            "quantity": _int(it, ["quantity", "qty"], 1),
            "size": it["size"],
            "color": it["color"],
            "variant_index": it["variant_index"],
            "total_price":
                _num(it, ["price", "total_price"]) *
                _int(it, ["quantity", "qty"], 1),
          },
        )
        .toList();
    final total = orderItems.fold<double>(
      0,
      (sum, it) => sum + (double.tryParse("${it["total_price"]}") ?? 0),
    );
    final error = await Api.createBulkOrder({
      "items": orderItems,
      "shipping_address": address,
      "payment_method": "wallet",
      "total_order_price": total,
    });
    if (error == null) _refreshCartAndBadges();
    return error;
  }

  void _openAddProduct() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _AddProductForm(onCreated: _loadMyProducts),
    );
  }

  void _openFilters() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _FiltersSheet(
        algorithm: _algorithm,
        sort: _sort,
        country: _country,
        onApply: (algorithm, sort, country) {
          setState(() {
            _algorithm = algorithm;
            _sort = sort;
            _country = country;
          });
          _loadMarket(reset: true);
        },
        onClear: () {
          setState(() {
            _algorithm = "recommended";
            _sort = "";
            _country = "";
          });
          _loadMarket(reset: true);
        },
      ),
    );
  }

  void _openCategories() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _CategoryDrawer(
        selected: _category,
        onSelect: (name) {
          setState(() => _category = name);
          if (!_chips.contains(name)) _chips = [..._chips, name];
          _loadMarket(reset: true);
        },
      ),
    );
  }

  // ── small helpers ───────────────────────────────────────────────────────

  void _sheet(List<_SheetItem> items) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 10, 8, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: items
                .map(
                  (item) => ListTile(
                    leading: Icon(
                      item.icon,
                      size: 18,
                      color: item.danger
                          ? AppColors.likeRed
                          : (item.iconColor ?? Colors.white),
                    ),
                    // web: text-[11px] font-bold
                    title: Text(
                      item.label,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: item.danger ? AppColors.likeRed : Colors.white,
                      ),
                    ),
                    onTap: () {
                      Navigator.maybePop(context);
                      item.onTap();
                    },
                  ),
                )
                .toList(),
          ),
        ),
      ),
    );
  }

  void _reportSheet(
    Future<void> Function(String reason, String detail) submit,
  ) {
    final detailCtrl = TextEditingController();
    var reason = "Inappropriate content";
    const reasons = [
      "Inappropriate content",
      "Counterfeit / fake",
      "Prohibited item",
      "Scam or fraud",
      "Other",
    ];
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => StatefulBuilder(
        builder: (ctx, setModal) => Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Report",
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 12),
              ...reasons.map(
                (r) => RadioListTile<String>(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  activeColor: AppColors.accentPurple,
                  value: r,
                  groupValue: reason,
                  onChanged: (v) => setModal(() => reason = v!),
                  title: Text(
                    r,
                    style: const TextStyle(
                      fontSize: 12.5,
                      color: AppColors.textGray200,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: detailCtrl,
                style: const TextStyle(fontSize: 12.5, color: Colors.white),
                maxLines: 2,
                decoration: InputDecoration(
                  hintText: "Add details (optional)",
                  hintStyle: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textGray600,
                  ),
                  filled: true,
                  fillColor: AppColors.bg2,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(
                      color: AppColors.borderWhite10,
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(
                      color: AppColors.borderWhite10,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accentPurple,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  onPressed: () {
                    Navigator.maybePop(ctx);
                    submit(reason, detailCtrl.text.trim());
                  },
                  child: const Text(
                    "Submit report",
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<bool?> _confirm(String message) {
    return showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.bg1,
        title: const Text(
          "Confirm",
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        content: Text(
          message,
          style: const TextStyle(fontSize: 13, color: AppColors.textGray300),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text(
              "Cancel",
              style: TextStyle(color: AppColors.textGray400),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text(
              "Confirm",
              style: TextStyle(color: AppColors.likeRed),
            ),
          ),
        ],
      ),
    );
  }

  /// Results go to the topbar notification centre, not a bottom toast.
  void _snack(String message, {String type = 'info'}) {
    AppNotifications.add(title: message, type: type);
  }
}

abstract class _Cell {}

/// Dashed rounded-rect border, for the empty-state panel. Flutter has no
/// dashed `BoxDecoration`, so the path is walked manually.
class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final double radius;
  static const dash = 6.0;
  static const gap = 5.0;
  const _DashedBorderPainter({required this.color, this.radius = 20});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)),
      );
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = (distance + dash).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance = next + gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) =>
      old.color != color || old.radius != radius;
}

/// The product card's options trigger.
///
/// Web draws **two** 4px dots stacked with a 2px gap
/// (`SharedProductCard.tsx`: `flex flex-col gap-0.5` + two `w-1 h-1`
/// circles) — not the three-dot `ellipsis-vertical` glyph mobile was using.
class _TwoDotMenuIcon extends StatelessWidget {
  final Color color;
  const _TwoDotMenuIcon({this.color = AppColors.textGray300});

  @override
  Widget build(BuildContext context) {
    Widget dot() => Container(
      width: 4,
      height: 4,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [dot(), const SizedBox(height: 2), dot()],
    );
  }
}

/// One pill in a sub-tab carousel.
class _SubTab {
  final String id;
  final String label;
  final IconData icon;
  final IconData iconOutline;
  final int badge;
  const _SubTab(
    this.id,
    this.label,
    this.icon,
    this.iconOutline, {
    this.badge = 0,
  });
}

class _ProductCell extends _Cell {
  final Map<String, dynamic> product;
  _ProductCell(this.product);
}

class _AdCell extends _Cell {
  final HomeAd ad;
  _AdCell(this.ad);
}

/// A full-width Profile Promote carousel row. It spans the grid rather than
/// occupying one cell, so the grid renders it outside the two-column flow.
class _ProfileCarouselCell extends _Cell {
  final List<HomeAd> ads;
  final int index;
  _ProfileCarouselCell(this.ads, this.index);
}

class _SheetItem {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool danger;

  /// Web tints each menu icon separately from its label — share is blue,
  /// promote/edit emerald, report yellow, "not interested" slate — while the
  /// label stays white. Only Delete turns the whole row red.
  final Color? iconColor;
  _SheetItem(
    this.label,
    this.icon,
    this.onTap, {
    this.danger = false,
    this.iconColor,
  });
}

/// Opens the shared interactions sheet for a product or sponsored-product ad.
///
/// Shop products, Product Promote ads and every ad category now go through the
/// very same sheet the home feed uses, so threaded replies, the report dialog,
/// relative timestamps and comment counts behave identically everywhere.
void showShopProductInteractions(
  BuildContext context,
  Map<String, dynamic> product,
  String initialKind, {
  VoidCallback? onCommentsChanged,
}) {
  final id = _int(product, ["id"]);
  openInteractionsSheet(
    context,
    title: _str(product, ["title", "name"]).isEmpty
        ? _sellerName(product)
        : _str(product, ["title", "name"]),
    subtitle: "PRODUCT",
    initialKind: initialKind,
    counts: {
      'likes': _int(product, ["likes_count"]),
      'comments': _int(product, ["comments_count"]),
      'views': _int(product, ["views_count"]),
      'shares': _int(product, ["shares_count"]),
    },
    fetch: (kind) => kind == "comments"
        ? Api.productComments(id)
        : Api.productInteractions(product["id"], kind),
    addComment: (text, {parentId}) =>
        Api.addProductComment(id, text, parentId: parentId),
    reportComment: (commentId, reason) =>
        Api.reportProductComment(commentId, reason),
    deleteComment: (commentId) => Api.deleteProductComment(commentId),
    likeComment: (commentId) => Api.likeProductComment(commentId),
    dislikeComment: (commentId) => Api.dislikeProductComment(commentId),
    onCommentsChanged: onCommentsChanged,
  );
}

/// Opens the shop's product quick-view for a product id.
///
/// The web reuses the very same `ShopProductSecondViewModal` for a Product
/// Promote ad's second view as it does in the shop, so the home feed calls this
/// to get an identical modal instead of a look-alike.
Future<bool> showEditProductSheet(BuildContext context, Map product) async {
  final title = TextEditingController(text: '${product["title"] ?? ""}');
  final price = TextEditingController(text: '${product["price"] ?? ""}');
  final stock = TextEditingController(text: '${product["stock"] ?? ""}');
  final description = TextEditingController(
    text: '${product["description"] ?? ""}',
  );

  Widget field(
    TextEditingController controller,
    String hint, {
    TextInputType keyboard = TextInputType.text,
    int lines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: controller,
        keyboardType: keyboard,
        maxLines: lines,
        style: const TextStyle(fontSize: 12, color: Colors.white),
        cursorColor: AppColors.accentPurple,
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(
            fontSize: 11,
            color: AppColors.textGray600,
          ),
          isDense: true,
          filled: true,
          fillColor: AppColors.bg2,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 11,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.borderWhite10),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.borderWhite10),
          ),
        ),
      ),
    );
  }

  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.bg1,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Edit product',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          field(title, 'Title'),
          field(price, 'Price', keyboard: TextInputType.number),
          field(stock, 'Stock', keyboard: TextInputType.number),
          field(description, 'Description', lines: 3),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () async {
                final ok = await Api.updateProduct(product['id'], {
                  'title': title.text.trim(),
                  'price': double.tryParse(price.text.trim()) ?? 0,
                  'stock': int.tryParse(stock.text.trim()) ?? 0,
                  'description': description.text.trim(),
                });
                if (!sheetContext.mounted) return;
                Navigator.pop(sheetContext, ok);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentPurple,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: const Text(
                'Save changes',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
  title.dispose();
  price.dispose();
  stock.dispose();
  description.dispose();
  if (saved == false) {
    AppNotifications.error('Could not update listing');
  }
  if (saved == true) {
    AppNotifications.success('Listing updated');
  }
  return saved == true;
}

Future<void> showShopProductQuickView(
  BuildContext context,
  dynamic productId, {
  Map<String, dynamic>? fallback,
  String adId = "",
  String adOwnerUserId = "",
  bool adCoinCollected = false,

  /// Home-feed Product Promote second view: the footer collapses to a single
  /// full-width ADD TO BAG (no Buy Now), so the ad routes into the bag/checkout
  /// flow instead of an instant purchase.
  bool promoteMode = false,
}) async {
  final loaded = await Api.productById(productId);
  final product = loaded == null
      ? fallback
      : mergeProductResellerAttribution(loaded, fallback);
  if (product == null || !context.mounted) return;

  void snack(String message, {String type = 'info'}) {
    AppNotifications.add(title: message, type: type);
  }

  void openInteractions(Map p, String kind) {
    showShopProductInteractions(context, Map<String, dynamic>.from(p), kind);
  }

  /// Opens the same share sheet the rest of the app uses. It previously only
  /// copied the link and pushed a topbar notice, so tapping share in the second
  /// view looked like nothing happened.
  Future<void> share(Map p, bool resell) async {
    final storedCode = _str(p, ["product_code", "share_code", "code"]);
    final code = Api.isCanonicalShareCode(storedCode)
        ? storedCode
        : Api.buildShareCode(
            'p',
            _str(p, ["linked_product_id", "product_id", "id"]),
          );
    final url = code.isNotEmpty
        ? "https://googer.site/product/$code"
        : "https://googer.site/shop";
    await Api.shareProduct(_int(p, ["id"]));
    if (!context.mounted) return;
    final commission = _resellPercent(p);
    openShareSheet(
      context,
      title: _str(p, ["title", "name"]),
      subtitle: "PRODUCT",
      url: url,
      linkLabel: "Product Link",
      canEarn: commission.isNotEmpty,
      earnTitle: "Share & Earn",
      earnSubtitle: "Create your personalized resell link",
      commission: commission,
      earnUrlBuilder: (id) => "$url/${Uri.encodeComponent(id)}",
      earnKind: "Generate Share",
    );
  }

  await showDialog<void>(
    context: context,
    barrierColor: Colors.black.withOpacity(0.92),
    builder: (_) => _QuickViewSheet(
      product: Map<String, dynamic>.from(product),
      isOwn: false,
      adId: adId,
      adOwnerUserId: adOwnerUserId,
      adCoinCollected: adCoinCollected,
      promoteMode: promoteMode,
      onAddToBag: (p, qty, size, color, variantIndex, shippingCountry) async {
        final result = await CartStore.addProduct(
          Map<String, dynamic>.from(p),
          quantity: qty,
          size: size,
          color: color,
          variantIndex: variantIndex,
          selectedShippingCountry: shippingCountry,
        );
        snack(
          result.ok
              ? "Added to bag"
              : result.stockBlocked
              ? result.message
              : "Could not add to bag",
        );
      },
      onBuyNow: (p, qty, size, color, variantIndex) async {
        final error = await Api.createOrder({
          "item_id": _int(p, ["id"]),
          "quantity": qty,
          if (size != null) "size": size,
          if (color != null) "color": color,
          if (variantIndex != null) "variant_index": variantIndex,
          "total_price": _displayPrice(p) * qty,
          "payment_method": "wallet",
        });
        snack(error ?? "Order placed");
      },
      onShare: (p, resell) => share(p, resell),
      onComment: (p) => openInteractions(p, "comments"),
      onOpenSheet: openInteractions,
      onReport: (p) async {
        await Api.reportProduct(_int(p, ["id"]), "Inappropriate content", "");
        snack("Report submitted");
      },
      onSubscribe: (p) async {
        await Api.toggleUserSubscription(_sellerId(p));
        snack("Subscribed to @${_sellerName(p)}");
      },
    ),
  );
}

// ── product grid card (web SharedProductCard) ────────────────────────────────

class ProductGridCard extends StatefulWidget {
  final Map product;
  final bool isAd;
  final bool showStatus;
  final VoidCallback onOpen;
  final VoidCallback onLike;
  final Future<int?> Function(int currentCount) onShare;
  final VoidCallback onComment;
  final VoidCallback onView;
  final Future<int?> Function()? onImpression;
  final Future<int?> Function()? onTrackedView;
  final void Function(bool mine) onMenu;
  final VoidCallback onAddToBag;
  const ProductGridCard({
    super.key,
    required this.product,
    this.isAd = false,
    this.showStatus = false,
    required this.onOpen,
    required this.onLike,
    required this.onShare,
    required this.onComment,
    required this.onView,
    this.onImpression,
    this.onTrackedView,
    required this.onMenu,
    required this.onAddToBag,
  });

  @override
  State<ProductGridCard> createState() => ProductGridCardState();
}

class ProductGridCardState extends State<ProductGridCard> {
  late bool _liked = widget.product["user_liked"] == true;
  late int _likes = _int(widget.product, ["likes_count", "likeCount"]);
  late int _views = _int(widget.product, ["views_count", "viewCount"]);
  late int _shares = _int(widget.product, ["shares_count", "shareCount"]);
  bool _liveViewKnown = false;
  bool _adVisible = false;
  int _lastImpressionAtMs = 0;

  @override
  void didUpdateWidget(covariant ProductGridCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    final incoming = _int(widget.product, ["views_count", "viewCount"]);
    if (oldWidget.product["id"] != widget.product["id"]) {
      _views = incoming;
      _shares = _int(widget.product, ["shares_count", "shareCount"]);
      _liveViewKnown = false;
      _adVisible = false;
      _lastImpressionAtMs = 0;
    } else if (!_liveViewKnown &&
        incoming != _int(oldWidget.product, ["views_count", "viewCount"])) {
      _views = incoming;
    }
    final incomingShares = _int(widget.product, ["shares_count", "shareCount"]);
    if (incomingShares !=
        _int(oldWidget.product, ["shares_count", "shareCount"])) {
      _shares = incomingShares;
    }
  }

  Future<void> _handleView() async {
    final next = await widget.onTrackedView?.call();
    if (mounted && next != null) {
      _liveViewKnown = true;
      if (next != _views) {
        setState(() => _views = next);
      }
    }
    widget.onView();
  }

  Future<void> _handleOpen() async {
    if (!widget.isAd) {
      final next = await widget.onTrackedView?.call();
      if (mounted && next != null) {
        _liveViewKnown = true;
        if (next != _views) {
          setState(() => _views = next);
        }
      }
    }
    widget.onOpen();
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final image = widget.isAd
        ? Api.resolveMedia("${product["image_url"] ?? ""}")
        : _primaryImage(product);
    final discount = _discount(product);
    final status = "${product["status"] ?? ""}".toLowerCase();
    final reviewing = !widget.isAd && status == "reviewing";
    final colors = _uniqueVariantColors(product);
    // Both ids must be present to claim ownership. A bare `==` treated a
    // missing owner id and a missing viewer id as a match, which made every
    // product look like yours and silently dropped Report / Not Interested
    // from the options menu.
    final mine = _isOwnedByViewer(product);

    final card = GestureDetector(
      onTap: reviewing ? null : _handleOpen,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF141414),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppColors.borderWhite06),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 6, 4),
              child: Row(
                children: [
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _openSellerProfile(context, product),
                    child: _MiniAvatar(
                      url: _sellerAvatar(product),
                      name: _sellerName(product),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () =>
                                    _openSellerProfile(context, product),
                                // web seller name: font-black, normal-case,
                                // tracking-tight, leading-none, white.
                                child: Text(
                                  _sellerName(product),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 9,
                                    height: 1,
                                    letterSpacing: -0.2,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 3),
                            UserVerifiedBadge(
                              userId: _sellerId(product),
                              size: 10,
                            ),
                          ],
                        ),
                        if (widget.isAd)
                          const Row(
                            children: [
                              Icon(
                                Ionicons.megaphone_outline,
                                size: 8,
                                color: AppColors.successGreen,
                              ),
                              SizedBox(width: 3),
                              Text(
                                "Ad",
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.successGreen,
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => widget.onMenu(mine),
                    behavior: HitTestBehavior.opaque,
                    child: const Padding(
                      padding: EdgeInsets.all(6),
                      child: _TwoDotMenuIcon(color: AppColors.textGray400),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (image.isNotEmpty)
                        Image.network(
                          image,
                          fit: BoxFit.cover,
                          webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
                          errorBuilder: (_, __, ___) => _imgFallback(),
                        )
                      else
                        _imgFallback(),
                      if (reviewing)
                        Container(
                          color: Colors.black.withOpacity(0.6),
                          alignment: Alignment.center,
                          child: const Text(
                            "REVIEWING",
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      if (discount != null)
                        Positioned(
                          right: 8,
                          bottom: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0x1A22C55E),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: const Color(0x3322C55E),
                              ),
                            ),
                            child: Text(
                              "+$discount%",
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: AppColors.successGreen,
                              ),
                            ),
                          ),
                        ),
                      if (widget.showStatus && status.isNotEmpty && !reviewing)
                        Positioned(
                          top: 8,
                          right: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.6),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              status.toUpperCase(),
                              style: const TextStyle(
                                fontSize: 7.5,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.8,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 2),
              child: Row(
                children: [
                  Expanded(
                    // web title: text-[9px] font-black uppercase tracking-tight
                    // leading-tight, white.
                    child: Text(
                      "${product["title"] ?? product["name"] ?? "Product"}"
                          .toUpperCase(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 9,
                        height: 1.15,
                        letterSpacing: -0.2,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  // Variant colour dots. Only recognised colours get a dot and
                  // there is no cap — the web draws one per known colour and
                  // skips the rest. A `.take(3)` here plus a grey fallback for
                  // unknown names was showing three dots where the web shows
                  // two.
                  if (colors.isNotEmpty)
                    Row(
                      children: [
                        for (final c in colors)
                          if (_swatchOrNull(c) != null)
                            Container(
                              margin: const EdgeInsets.only(left: 3),
                              width: 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: _swatchOrNull(c),
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: AppColors.borderWhite10,
                                ),
                              ),
                            ),
                      ],
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 2, 8, 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  // web: "R" is text-xs (12) font-black at white/40; the amount
                  // is text-2xl (24) font-black tracking-tighter in white.
                  Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: Text(
                      "R ",
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.white.withOpacity(0.40),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      _money(_displayPrice(product)),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 24,
                        letterSpacing: -1,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                        height: 1.0,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: widget.onAddToBag,
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: const Icon(
                        Ionicons.cart_outline,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _CardStat(
                    icon: _liked ? Ionicons.heart : Ionicons.heart_outline,
                    label: "$_likes",
                    color: _liked ? AppColors.likeRed : Colors.white,
                    onTap: () {
                      setState(() {
                        _liked = !_liked;
                        _likes += _liked ? 1 : -1;
                      });
                      widget.onLike();
                    },
                  ),
                  _CardStat(
                    icon: Ionicons.eye_outline,
                    label: "$_views",
                    onTap: _handleView,
                  ),
                  _CardStat(
                    icon: Ionicons.chatbubble_outline,
                    label:
                        "${_int(product, ["comments_count", "commentCount"])}",
                    onTap: widget.onComment,
                  ),
                  _CardStat(
                    icon: Ionicons.share_social_outline,
                    label: '$_shares',
                    onTap: () async {
                      final next = await widget.onShare(_shares);
                      if (mounted && next != null) {
                        setState(() => _shares = next);
                      }
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
    if (!widget.isAd || widget.onImpression == null) return card;
    return VisibilityDetector(
      key: ValueKey('shop-ad-impression-${product["id"]}'),
      onVisibilityChanged: (info) async {
        final isVisible = info.visibleFraction >= 0.5;
        if (!isVisible) {
          _adVisible = false;
          return;
        }
        final now = DateTime.now().millisecondsSinceEpoch;
        if (_adVisible || now - _lastImpressionAtMs < 1500) return;
        _adVisible = true;
        _lastImpressionAtMs = now;
        final next = await widget.onImpression!();
        if (!mounted || next == null) return;
        _liveViewKnown = true;
        if (next != _views) {
          setState(() => _views = next);
        }
      },
      child: card,
    );
  }

  Widget _imgFallback() => Container(
    color: Colors.white.withOpacity(0.04),
    alignment: Alignment.center,
    child: const Icon(
      Ionicons.image_outline,
      size: 26,
      color: AppColors.textGray700,
    ),
  );
}

class _CardStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _CardStat({
    required this.icon,
    required this.label,
    this.color = Colors.white,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          if (label.isNotEmpty) ...[
            const SizedBox(width: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MiniAvatar extends StatelessWidget {
  final String url;
  final String name;
  final double size;
  const _MiniAvatar({required this.url, required this.name, this.size = 20});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2563EB), Color(0xFF7C3AED)],
        ),
      ),
      child: url.isNotEmpty
          ? Image.network(
              url,
              fit: BoxFit.cover,
              webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
              errorBuilder: (_, __, ___) => _initial(),
            )
          : _initial(),
    );
  }

  Widget _initial() => Center(
    child: Text(
      name.isEmpty ? "?" : name.substring(0, 1).toUpperCase(),
      style: TextStyle(
        fontSize: size * 0.42,
        fontWeight: FontWeight.w600,
        color: Colors.white,
      ),
    ),
  );
}

// ── quick-view (web ShopProductSecondViewModal) ──────────────────────────────

class _QuickViewSheet extends StatefulWidget {
  final Map<String, dynamic> product;
  final bool isOwn;

  /// My Listings → Reviewing: shows the commission grid + Edit/Delete footer
  /// and hides the buy controls (web `isReviewMode`).
  final bool isReviewMode;

  /// Set when opened as a Product Promote ad's second view — enables the
  /// Rupieer collect-coin button (web `isProductPromoteSecondView`).
  final String adId;
  final String adOwnerUserId;
  final bool adCoinCollected;

  /// Home-feed Product Promote second view — footer is a single full-width
  /// ADD TO BAG instead of the shop's two-button row.
  final bool promoteMode;

  /// `shippingCountry` is the destination picked in the SHIPS TO dropdown; the
  /// bag stores it per line (backend `selected_shipping_country`) so the
  /// delivery quote survives to checkout.
  final Future<void> Function(
    Map product,
    int qty,
    String? size,
    String? color,
    int? variantIndex,
    String? shippingCountry,
  )
  onAddToBag;
  final Future<void> Function(
    Map product,
    int qty,
    String? size,
    String? color,
    int? variantIndex,
  )
  onBuyNow;

  /// resell=true generates the reseller/commission link (web "Resell
  /// Commission Link"), false is the plain share link.
  final void Function(Map product, bool resell) onShare;
  final void Function(Map product) onComment;
  final void Function(Map product, String kind) onOpenSheet;
  final void Function(Map product) onReport;
  final Future<void> Function(Map product) onSubscribe;
  const _QuickViewSheet({
    required this.product,
    required this.isOwn,
    this.isReviewMode = false,
    this.adId = "",
    this.adOwnerUserId = "",
    this.adCoinCollected = false,
    this.promoteMode = false,
    required this.onAddToBag,
    required this.onBuyNow,
    required this.onShare,
    required this.onComment,
    required this.onOpenSheet,
    required this.onReport,
    required this.onSubscribe,
  });

  @override
  State<_QuickViewSheet> createState() => _QuickViewSheetState();
}

class _QuickViewSheetState extends State<_QuickViewSheet> {
  int _previewIndex = 0;
  int? _variantIndex;
  String? _size;
  int _qty = 1;
  bool _sizeError = false;
  String? _shippingCountry;
  late bool _liked = widget.product["user_liked"] == true;
  late int _likes = _int(widget.product, ["likes_count"]);
  late bool _coinCollected = widget.adCoinCollected;
  Map<String, dynamic>? _full;

  Map<String, dynamic> get _p => _full ?? widget.product;

  /// web canShowCollectCoinButton: reward enabled && sponsored && signed in &&
  /// liked && not already collected && not the ad owner.
  bool get _canCollectCoin =>
      Api.adCoinRewardEnabled &&
      widget.adId.isNotEmpty &&
      Api.loggedIn &&
      _liked &&
      !_coinCollected &&
      (widget.adOwnerUserId.isEmpty ||
          widget.adOwnerUserId != Api.currentUserId);

  Future<void> _collectCoin() async {
    final amount = await Api.collectAdCoin(
      widget.adId,
      adType: "Product Promote",
    );
    if (!mounted) return;
    if (amount == null) {
      AppNotifications.error("Could not collect the coin");
      return;
    }
    setState(() => _coinCollected = true);
    AppNotifications.success(
      "Coin collected",
      "${_money(amount)} Rupieer added to your wallet.",
    );
  }

  /// Stock for a size, mirroring the web getAvailableCountForSize().
  int _stockForSize(String? size) {
    final variants = _variants(_p);
    final active = _variantIndex != null && _variantIndex! < variants.length
        ? variants[_variantIndex!]
        : (variants.isNotEmpty ? variants.first : _p);
    final trimmed = (size ?? "").trim();
    final selections = active["selections"];
    if (selections is List) {
      for (final entry in selections.whereType<Map>()) {
        if ("${entry["value"] ?? ""}".trim() == trimmed) {
          return _int(Map<String, dynamic>.from(entry), ["stock", "quantity"]);
        }
      }
    }
    final activeColor = "${active["color"] ?? ""}";
    for (final variant in variants) {
      if ("${variant["size"] ?? ""}".trim() == trimmed &&
          (activeColor.isEmpty ||
              "${variant["color"] ?? ""}".isEmpty ||
              "${variant["color"]}" == activeColor)) {
        return _int(variant, ["stock", "quantity"]);
      }
    }
    final fallback = _int(Map<String, dynamic>.from(active), [
      "stock",
      "quantity",
    ]);
    return fallback > 0 ? fallback : _int(_p, ["stock"]);
  }

  /// Units the buyer is actually allowed to take, mirroring the web
  /// `currentVariantStock`: the selected size's stock once a size is picked,
  /// otherwise the active variant's (falling back to the product's).
  int get _currentStock {
    final size = (_size ?? "").trim();
    if (size.isNotEmpty && size != "None") return _stockForSize(_size);
    final variants = _variants(_p);
    final active = variants.isEmpty
        ? _p
        : variants[(_variantIndex ?? 0).clamp(0, variants.length - 1)];
    final fromVariant = _int(Map<String, dynamic>.from(active), [
      "stock",
      "quantity",
    ]);
    return fromVariant > 0 ? fromVariant : _int(_p, ["stock"]);
  }

  List<_ShippingRate> get _rates => _shippingRates(_p);

  /// Destination in force, mirroring the web
  /// `selectedCountry || savedAddress?.country || defaultCountry`.
  String get _shipsToCountry {
    final picked = (_shippingCountry ?? "").trim();
    if (picked.isNotEmpty) return picked;
    final saved = "${CartStore.address.value?["country"] ?? ""}".trim();
    if (saved.isNotEmpty) return saved;
    return _rates.first.country;
  }

  /// Rate for the destination in force. Falls back to a "Worldwide" row when
  /// the buyer's country is not listed individually, exactly as the web does.
  _ShippingRate? get _shipsToRate {
    final target = _shipsToCountry.toLowerCase();
    for (final rate in _rates) {
      if (rate.country.toLowerCase() == target) return rate;
    }
    for (final rate in _rates) {
      if (rate.country.toLowerCase().contains("world")) return rate;
    }
    return null;
  }

  /// Web prints "N/A" when the seller does not ship to the chosen country.
  String get _shipsToFeeText => _shipsToRate?.priceText ?? "N/A";

  /// Colour of the active variant, as the bag records it on a line.
  String? get _activeColor {
    final variants = _variants(_p);
    return _variantIndex != null && _variantIndex! < variants.length
        ? "${variants[_variantIndex!]["color"] ?? ""}"
        : null;
  }

  /// What can still be taken, i.e. stock minus whatever is already sitting in
  /// the bag for this exact size/colour line.
  ///
  /// Capping the stepper at raw stock is not enough on its own: the bag merges
  /// lines by quantity, so three separate "add 3" taps on a 3-unit product
  /// would still bank 9. This is the ceiling the stepper and the buttons work
  /// against; the "N IN STOCK" caption keeps showing the seller's real figure.
  int get _addableStock {
    final stock = _currentStock;
    if (stock <= 0) return 0;
    final left =
        stock -
        CartStore.quantityInBag(
          Map<String, dynamic>.from(_p),
          size: _size,
          color: _activeColor,
          variantIndex: _variantIndex,
        );
    return left < 0 ? 0 : left;
  }

  /// Pull the quantity back inside the current ceiling. Needed whenever that
  /// ceiling can move under the buyer — a size/colour switch, the full product
  /// record arriving after the sheet opened, or a successful add to the bag.
  void _clampQty() {
    final left = _addableStock;
    if (left > 0 && _qty > left) _qty = left;
    if (_qty < 1) _qty = 1;
  }

  @override
  void initState() {
    super.initState();
    Api.markProductView(_int(widget.product, ["id"]));
    // The remaining-stock ceiling is derived from the bag, so it has to track
    // the bag rather than be read once — a server sync or the bag sheet opened
    // over this one can both move it while the sheet is up.
    CartStore.items.addListener(_onBagChanged);
    _loadFull();
  }

  @override
  void dispose() {
    CartStore.items.removeListener(_onBagChanged);
    super.dispose();
  }

  void _onBagChanged() {
    if (mounted) setState(_clampQty);
  }

  Future<void> _loadFull() async {
    final data = await Api.productById(widget.product["id"]);
    if (data != null && mounted) {
      setState(() {
        _full = data;
        // The card we were opened from may have carried a stale/absent stock
        // figure; the full record is authoritative.
        _clampQty();
      });
    }
  }

  List<String> get _images => _productImages(_p);

  List<String> get _sizes {
    final variants = _variants(_p);
    final active = _variantIndex != null && _variantIndex! < variants.length
        ? variants[_variantIndex!]
        : (variants.isNotEmpty ? variants.first : _p);
    final selections = active["selections"];
    if (selections is List) {
      final values = selections
          .map((s) => s is Map ? "${s["value"] ?? ""}" : "$s")
          .where((v) => v.trim().isNotEmpty)
          .toList();
      if (values.isNotEmpty) return values;
    }
    final sizeField = _sp(_p["sizes"]);
    if (sizeField is List) {
      final values = sizeField
          .map((s) => s is Map ? "${s["value"] ?? ""}" : "$s")
          .where((v) => v.trim().isNotEmpty)
          .toList();
      if (values.isNotEmpty) return values;
    }
    // Last resort: some products carry the size on the variant rows themselves
    // rather than in `selections`/`sizes`, which left the SIZES row hidden.
    final fromVariants = <String>[];
    for (final variant in variants) {
      final value = "${variant["size"] ?? ""}".trim();
      if (value.isNotEmpty && !fromVariants.contains(value)) {
        fromVariants.add(value);
      }
    }
    return fromVariants;
  }

  /// The product has sizes but none is chosen yet.
  bool get _needsSize =>
      _sizes.isNotEmpty && (_size == null || _size == "None");

  /// Whether ADD TO BAG / BUY NOW may be pressed at all. An out-of-stock
  /// selection, or a quantity the shelf cannot cover, greys the buttons out
  /// instead of letting the tap through to a failure.
  ///
  /// While no size is picked the buttons stay live on purpose: pressing one
  /// should surface the "Select Size" error, not look broken.
  bool get _canCommit {
    if (_needsSize) return true;
    final left = _addableStock;
    return left > 0 && _qty <= left;
  }

  /// A dead button with no explanation reads as a bug, so the primary action
  /// says why it is dead. BUY NOW keeps its label — repeating the reason twice
  /// side by side is just noise.
  String _commitLabel(String base) {
    if (_needsSize) return base;
    if (_currentStock <= 0) return "OUT OF STOCK";
    if (_addableStock <= 0) return "ALL IN BAG";
    return base;
  }

  /// Last line of defence before the quantity leaves the sheet. The stepper
  /// already caps `_qty`, but the ceiling can move underneath it (the full
  /// product record loading in, a size switch), so re-check before committing.
  bool _stockAllows() {
    if (_currentStock <= 0) {
      AppNotifications.error("Out of stock");
      return false;
    }
    final left = _addableStock;
    if (left <= 0) {
      AppNotifications.error(
        "Not enough stock",
        "All $_currentStock in stock are already in your bag.",
      );
      return false;
    }
    if (_qty > left) {
      setState(() => _qty = left);
      AppNotifications.error(
        "Not enough stock",
        "Only $left more can be added — the quantity was reduced.",
      );
      return false;
    }
    return true;
  }

  void _addToBag() {
    if (_needsSize) {
      setState(() => _sizeError = true);
      return;
    }
    if (!_stockAllows()) return;
    final color = _activeColor;
    Navigator.maybePop(context);
    widget.onAddToBag(_p, _qty, _size, color, _variantIndex, _shipsToCountry);
  }

  void _buyNow() {
    if (_needsSize) {
      setState(() => _sizeError = true);
      return;
    }
    if (!_stockAllows()) return;
    final color = _activeColor;
    Navigator.maybePop(context);
    widget.onBuyNow(_p, _qty, _size, color, _variantIndex);
  }

  @override
  Widget build(BuildContext context) {
    final product = _p;
    final images = _images;
    final currentImage = images.isEmpty
        ? ""
        : Api.resolveMedia(images[_previewIndex.clamp(0, images.length - 1)]);
    final variants = _variants(product);
    final sizes = _sizes;
    final oldPrice = _oldPrice(product);
    // Both ids must be present to claim ownership. A bare `==` treated a
    // missing owner id and a missing viewer id as a match, which made every
    // product look like yours and silently dropped Report / Not Interested
    // from the options menu.
    final mine = _isOwnedByViewer(product);
    final status = "${product["status"] ?? ""}".toLowerCase();

    return Dialog(
      backgroundColor: const Color(0xFF121212),
      insetPadding: const EdgeInsets.all(12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppColors.borderWhite10),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.9,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // header
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 8, 8),
              child: Row(
                children: [
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _openSellerProfile(context, product),
                    child: _MiniAvatar(
                      url: _sellerAvatar(product),
                      name: _sellerName(product),
                      size: 34,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () =>
                                    _openSellerProfile(context, product),
                                child: Text(
                                  _sellerName(product),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 4),
                            UserVerifiedBadge(
                              userId: _sellerId(product),
                              size: 11,
                            ),
                          ],
                        ),
                        Text(
                          product["category"]?.toString() ?? "General",
                          style: const TextStyle(
                            fontSize: 9,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (!mine)
                    SubscribeButton(
                      userId: _sellerId(product),
                      authorName: _sellerName(product),
                    ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const _TwoDotMenuIcon(color: Colors.white),
                    onPressed: () => _openMenu(mine),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(
                      Ionicons.close_outline,
                      size: 20,
                      color: AppColors.textGray400,
                    ),
                    onPressed: () => Navigator.maybePop(context),
                  ),
                ],
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // image + interaction rail
                    Stack(
                      children: [
                        AspectRatio(
                          aspectRatio: 1,
                          child: GestureDetector(
                            // web: main image is cursor-zoom-in → fullscreen
                            onTap: currentImage.isEmpty
                                ? null
                                : () => _openFullscreen(currentImage),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: currentImage.isEmpty
                                  ? Container(
                                      color: Colors.white.withOpacity(0.04),
                                      alignment: Alignment.center,
                                      child: const Icon(
                                        Ionicons.image_outline,
                                        size: 40,
                                        color: AppColors.textGray700,
                                      ),
                                    )
                                  : Image.network(
                                      currentImage,
                                      fit: BoxFit.cover,
                                      webHtmlElementStrategy:
                                          WebHtmlElementStrategy.prefer,
                                      errorBuilder: (_, __, ___) => Container(
                                        color: Colors.white.withOpacity(0.04),
                                      ),
                                    ),
                            ),
                          ),
                        ),
                        if (currentImage.isNotEmpty)
                          Positioned(
                            left: 10,
                            bottom: 10,
                            child: IgnorePointer(
                              child: Container(
                                padding: const EdgeInsets.all(7),
                                decoration: BoxDecoration(
                                  color: Colors.black.withOpacity(0.5),
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: AppColors.borderWhite10,
                                  ),
                                ),
                                child: const Icon(
                                  Ionicons.search_outline,
                                  size: 14,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        if (_canCollectCoin)
                          Positioned(
                            right: 8,
                            top: 8,
                            child: _RupieerButton(onTap: _collectCoin),
                          ),
                        Positioned(
                          right: 8,
                          top: 0,
                          bottom: 0,
                          child: Center(
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                vertical: 6,
                                horizontal: 4,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.5),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: AppColors.borderWhite10,
                                ),
                              ),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  _railIcon(
                                    _liked
                                        ? Ionicons.heart
                                        : Ionicons.heart_outline,
                                    _likes > 0 ? "$_likes" : "",
                                    color: _liked
                                        ? AppColors.likeRed
                                        : Colors.white,
                                    onTap: () {
                                      setState(() {
                                        _liked = !_liked;
                                        _likes += _liked ? 1 : -1;
                                      });
                                      Api.toggleProductLikeState(product["id"]);
                                    },
                                  ),
                                  _railIcon(
                                    Ionicons.eye_outline,
                                    "${_int(product, ["views_count"])}",
                                    onTap: () {
                                      Api.markProductView(
                                        _int(product, ["id"]),
                                      );
                                      widget.onOpenSheet(product, "views");
                                    },
                                  ),
                                  _railIcon(
                                    Ionicons.chatbubble_outline,
                                    "${_int(product, ["comments_count"])}",
                                    onTap: () =>
                                        widget.onOpenSheet(product, "comments"),
                                  ),
                                  _railIcon(
                                    Ionicons.share_social_outline,
                                    "${_int(product, ["shares_count"])}",
                                    onTap: () => widget.onShare(product, false),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (images.length > 1) ...[
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 54,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: images.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 8),
                          itemBuilder: (_, i) {
                            final active = i == _previewIndex;
                            return GestureDetector(
                              onTap: () => setState(() => _previewIndex = i),
                              child: Container(
                                width: 54,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: active
                                        ? Colors.white
                                        : AppColors.borderWhite10,
                                    width: active ? 2 : 1,
                                  ),
                                ),
                                clipBehavior: Clip.antiAlias,
                                child: Image.network(
                                  Api.resolveMedia(images[i]),
                                  fit: BoxFit.cover,
                                  webHtmlElementStrategy:
                                      WebHtmlElementStrategy.prefer,
                                  errorBuilder: (_, __, ___) => Container(
                                    color: Colors.white.withOpacity(0.04),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    if (widget.isReviewMode) ...[
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            "PRODUCT REVIEW",
                            style: TextStyle(
                              fontSize: 15,
                              letterSpacing: 0.4,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0x1A3B82F6),
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(
                                color: const Color(0x333B82F6),
                              ),
                            ),
                            child: const Text(
                              "AWAITING APPROVAL",
                              style: TextStyle(
                                fontSize: 8,
                                letterSpacing: 1.2,
                                fontWeight: FontWeight.w600,
                                color: Color(0xFF60A5FA),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                    ],
                    Text(
                      "${product["title"] ?? "Product"}",
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "${product["category"] ?? "General"}".toUpperCase(),
                      style: const TextStyle(
                        fontSize: 9,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF60A5FA),
                      ),
                    ),
                    const SizedBox(height: 10),
                    // Currency label sitting between the category and the price
                    // pill, as on the web panel.
                    const Text(
                      "Rupieer",
                      style: TextStyle(
                        fontSize: 11,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray500,
                      ),
                    ),
                    if (widget.isReviewMode) ...[
                      const SizedBox(height: 16),
                      const Text(
                        "COMMISSION & PRICING",
                        style: TextStyle(
                          fontSize: 9,
                          letterSpacing: 1.6,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textGray500,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _commissionTile(
                            Ionicons.logo_google,
                            const Color(0xFFEF4444),
                            "GOOGER FEE",
                            _commission(product, [
                              "googer_commission",
                              "googer_fee",
                            ]),
                          ),
                          const SizedBox(width: 8),
                          _commissionTile(
                            Ionicons.people_outline,
                            const Color(0xFF3B82F6),
                            "RESELLER",
                            _commission(product, [
                              "resell_percentage",
                              "reseller_commission",
                            ]),
                          ),
                          const SizedBox(width: 8),
                          _commissionTile(
                            Ionicons.pricetag_outline,
                            const Color(0xFF10B981),
                            "DISCOUNT",
                            _commission(product, ["discount"]),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 16),
                    // price + qty
                    Container(
                      // Rounded price pill with the leading dot, matching the
                      // web product panel.
                      padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.03),
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 9,
                            height: 9,
                            margin: const EdgeInsets.only(right: 12, bottom: 6),
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // The app reads without bold everywhere else;
                              // price, stock and the running total in this
                              // second view are the deliberate exceptions.
                              Text(
                                _money(_displayPrice(product)),
                                style: const TextStyle(
                                  fontSize: 30,
                                  height: 1.05,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                ),
                              ),
                              if (oldPrice != null)
                                Text(
                                  "R ${_money(oldPrice)}",
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.likeRed,
                                    decoration: TextDecoration.lineThrough,
                                    decorationColor: AppColors.likeRed,
                                  ),
                                ),
                            ],
                          ),
                          const Spacer(),
                          // web hides the qty stepper in review mode
                          if (!widget.isReviewMode) ...[
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text(
                                  "QTY",
                                  style: TextStyle(
                                    fontSize: 7,
                                    letterSpacing: 1.4,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.textGray600,
                                  ),
                                ),
                                Text(
                                  _currentStock > 0
                                      ? "$_currentStock IN STOCK"
                                      : "OUT OF STOCK",
                                  style: const TextStyle(
                                    fontSize: 6.5,
                                    letterSpacing: 1.1,
                                    fontWeight: FontWeight.w900,
                                    color: Color(0xFF60A5FA),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(width: 8),
                            // The buyer must not be able to dial past what is
                            // actually on the shelf — web disables `+` at the
                            // ceiling and mobile now does the same.
                            _QtyStepper(
                              qty: _qty,
                              canMinus: _qty > 1,
                              canPlus: _qty < _addableStock,
                              onMinus: () => setState(
                                () => _qty = (_qty - 1).clamp(1, 999),
                              ),
                              onPlus: () => setState(
                                () => _qty = (_qty + 1).clamp(
                                  1,
                                  _addableStock < 1 ? 1 : _addableStock,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (variants.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          const Text(
                            "AVAILABLE COLORS",
                            style: TextStyle(
                              fontSize: 9,
                              letterSpacing: 1.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textGray500,
                            ),
                          ),
                          const Spacer(),
                          Text(
                            "STANDARD",
                            style: TextStyle(
                              fontSize: 8.5,
                              letterSpacing: 1.4,
                              fontWeight: FontWeight.w600,
                              color: Colors.white.withOpacity(0.28),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        height: 64,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: variants.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(width: 10),
                          itemBuilder: (_, i) {
                            final variant = variants[i];
                            final active = _variantIndex == i;
                            final vImg = _imgCandidate(
                              variant["image_url"] ??
                                  variant["url"] ??
                                  variant["image"],
                            );
                            return GestureDetector(
                              onTap: () => setState(() {
                                _variantIndex = i;
                                _size = null;
                                _sizeError = false;
                                _qty = 1;
                                final idx = _images.indexWhere(
                                  (im) => im == vImg,
                                );
                                if (idx != -1) _previewIndex = idx;
                              }),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 42,
                                    height: 42,
                                    clipBehavior: Clip.antiAlias,
                                    decoration: BoxDecoration(
                                      color: _swatch(
                                        "${variant["color"] ?? ""}",
                                      ),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: active
                                            ? Colors.white
                                            : AppColors.borderWhite10,
                                        width: active ? 2 : 1,
                                      ),
                                    ),
                                    child: vImg.trim().isNotEmpty
                                        ? Image.network(
                                            Api.resolveMedia(vImg),
                                            fit: BoxFit.cover,
                                            errorBuilder: (_, __, ___) =>
                                                const SizedBox(),
                                          )
                                        : null,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    // web: `color || description || "Style"` —
                                    // a falsy chain, so an empty colour falls
                                    // through. `??` alone would print a blank
                                    // label for `color: ""`.
                                    _firstNonEmpty([
                                      "${variant["color"] ?? ""}",
                                      "${variant["description"] ?? ""}",
                                      "Style",
                                    ]),
                                    style: TextStyle(
                                      fontSize: 8,
                                      fontWeight: FontWeight.w500,
                                      color: active
                                          ? Colors.white
                                          : AppColors.textGray600,
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                    if ("${product["description"] ?? ""}"
                        .trim()
                        .isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.bg2,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.borderWhite10),
                        ),
                        child: Text(
                          "${product["description"]}",
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.5,
                            color: AppColors.textGray200,
                          ),
                        ),
                      ),
                    ],
                    // The web modal shows BOTH the swatch row above and this
                    // labelled dropdown, so mobile keeps both to match.
                    if (variants.isNotEmpty)
                      _dropdownRow(
                        label: "AVAILABLE COLORS",
                        value:
                            _variantIndex != null &&
                                _variantIndex! < variants.length
                            ? "${variants[_variantIndex!]["color"] ?? "Standard"}"
                            : "Colors",
                        onTap: () => _pickColor(variants),
                      ),
                    if (sizes.isNotEmpty)
                      _dropdownRow(
                        label: "SIZES",
                        value: _size == null
                            ? "Sizes"
                            : "$_size (${_stockForSize(_size)})",
                        error: _sizeError,
                        onTap: () => _pickSize(sizes),
                      ),
                    if (_sizeError)
                      const Padding(
                        padding: EdgeInsets.only(top: 4, bottom: 4),
                        child: Text(
                          "Select Size",
                          style: TextStyle(
                            fontSize: 9,
                            letterSpacing: 1.2,
                            fontWeight: FontWeight.w600,
                            color: AppColors.likeRed,
                          ),
                        ),
                      ),
                    _infoRow("DELIVERY TIME", _deliveryText(product)),
                    _infoRow(
                      "RETURNS & WARRANTY",
                      "${_returnText(product)}  ·  ${_warrantyText(product)}",
                    ),
                    if (!widget.isReviewMode) _shipsToRow(),
                  ],
                ),
              ),
            ),
            // footer
            Container(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: AppColors.borderWhite10)),
              ),
              child: widget.isReviewMode
                  ? _reviewFooter(product)
                  : (widget.isOwn && status.isNotEmpty)
                  ? _ownerFooter(product, status)
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _runningTotal(product),
                        const SizedBox(height: 10),
                        // Every second view is bag-only now — the shop's used
                        // to add a BUY NOW beside it, but the Product Promote
                        // view has only ever shown ADD TO BAG and both
                        // surfaces are meant to look the same.
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: _canCommit ? _addToBag : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              disabledBackgroundColor: Colors.white.withOpacity(
                                0.18,
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 13),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                            child: Text(
                              _commitLabel("ADD TO BAG"),
                              style: TextStyle(
                                fontSize: 11,
                                letterSpacing: 2.4,
                                fontWeight: FontWeight.w600,
                                color: _canCommit
                                    ? Colors.black
                                    : Colors.white.withOpacity(0.45),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  /// Running total for the chosen quantity — the web footer bar shows
  /// `price * quantity` while the big price block higher up stays a unit
  /// price, so this is the only place the quantity is reflected in money.
  Widget _runningTotal(Map product) {
    return Row(
      children: [
        const Text(
          "Rupieer",
          style: TextStyle(
            fontSize: 10,
            letterSpacing: 3,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        const Spacer(),
        Text(
          _money(_displayPrice(product) * _qty),
          style: const TextStyle(
            fontSize: 19,
            height: 1,
            letterSpacing: 1.2,
            fontWeight: FontWeight.w900,
            color: Colors.white,
          ),
        ),
      ],
    );
  }

  Widget _ownerFooter(Map product, String status) {
    String? next;
    String label = "";
    if (status == "pending" || status == "approved") {
      next = "processing";
      label = "Approve / Process";
    } else if (status == "processing") {
      next = "shipped";
      label = "Mark as Shipped";
    } else if (status == "shipped") {
      next = "delivered";
      label = "Mark as Delivered";
    }
    if (next == null) {
      return Center(
        child: Text(
          status.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: AppColors.textGray400,
          ),
        ),
      );
    }
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: () {
          Navigator.maybePop(context);
          Api.updateProductStatus(product["id"], next!);
        },
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.successGreen,
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  /// web review-mode footer: Edit Product / Delete.
  Widget _reviewFooter(Map product) {
    return Row(
      children: [
        Expanded(
          child: ElevatedButton(
            onPressed: () => _editListing(product),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.utilityBlue,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text(
              "EDIT PRODUCT",
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.6,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton(
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  backgroundColor: AppColors.bg1,
                  title: const Text(
                    "Delete listing?",
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext, false),
                      child: const Text(
                        "Cancel",
                        style: TextStyle(color: AppColors.textGray400),
                      ),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(dialogContext, true),
                      child: const Text(
                        "Delete",
                        style: TextStyle(color: AppColors.likeRed),
                      ),
                    ),
                  ],
                ),
              );
              if (ok != true || !mounted) return;
              await Api.deleteProduct(product["id"]);
              if (mounted) Navigator.maybePop(context);
            },
            style: OutlinedButton.styleFrom(
              side: BorderSide(color: AppColors.likeRed.withOpacity(0.4)),
              backgroundColor: AppColors.likeRed.withOpacity(0.12),
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text(
              "DELETE",
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.6,
                fontWeight: FontWeight.w600,
                color: AppColors.likeRed,
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// Edit an own listing — PUT /market/{id} (text fields; media stays as-is).
  void _editListing(Map product) {
    final title = TextEditingController(text: "${product["title"] ?? ""}");
    final price = TextEditingController(text: "${product["price"] ?? ""}");
    final description = TextEditingController(
      text: "${product["description"] ?? ""}",
    );
    final stock = TextEditingController(text: "${product["stock"] ?? ""}");

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "Edit product",
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            _editField(title, "Title"),
            _editField(price, "Price", keyboard: TextInputType.number),
            _editField(stock, "Stock", keyboard: TextInputType.number),
            _editField(description, "Description", lines: 3),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () async {
                  Navigator.maybePop(sheetContext);
                  await Api.updateProduct(product["id"], {
                    "title": title.text.trim(),
                    "price": double.tryParse(price.text.trim()) ?? 0,
                    "stock": int.tryParse(stock.text.trim()) ?? 0,
                    "description": description.text.trim(),
                  });
                  if (mounted) Navigator.maybePop(context);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accentPurple,
                  padding: const EdgeInsets.symmetric(vertical: 13),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                child: const Text(
                  "Save changes",
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _editField(
    TextEditingController controller,
    String hint, {
    TextInputType keyboard = TextInputType.text,
    int lines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: controller,
        keyboardType: keyboard,
        maxLines: lines,
        style: const TextStyle(fontSize: 12.5, color: Colors.white),
        cursorColor: AppColors.accentPurple,
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(
            fontSize: 12,
            color: AppColors.textGray600,
          ),
          isDense: true,
          filled: true,
          fillColor: AppColors.bg2,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.borderWhite10),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.borderWhite10),
          ),
        ),
      ),
    );
  }

  void _openMenu(bool mine) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      // Keep the quick-view actions aligned with the web product card.
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _menuTile(
              "Share Link",
              Ionicons.share_social_outline,
              const Color(0xFF60A5FA),
              () => widget.onShare(_p, false),
            ),
            if ("${_p["status"] ?? ""}".trim().toLowerCase() != "reviewing")
              _menuTile(
                "Promote",
                Ionicons.megaphone_outline,
                const Color(0xFF34D399),
                () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const ProductPromoteScreen(),
                  ),
                ),
              ),
            if (mine)
              _menuTile(
                "Edit Post",
                Ionicons.create_outline,
                const Color(0xFF34D399),
                () => _editListing(_p),
              ),
            if (mine)
              _menuTile(
                "Delete Post",
                Ionicons.trash_outline,
                AppColors.likeRed,
                () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (dialogContext) => AlertDialog(
                      backgroundColor: AppColors.bg1,
                      title: const Text(
                        "Delete listing?",
                        style: TextStyle(fontSize: 15, color: Colors.white),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(dialogContext, false),
                          child: const Text("Cancel"),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(dialogContext, true),
                          child: const Text(
                            "Delete",
                            style: TextStyle(color: AppColors.likeRed),
                          ),
                        ),
                      ],
                    ),
                  );
                  if (ok != true || !mounted) return;
                  await Api.deleteProduct(_p["id"]);
                  if (mounted) Navigator.maybePop(context);
                },
              ),
            if (!mine)
              _menuTile(
                "Report",
                Ionicons.alert_circle_outline,
                const Color(0xFFEAB308),
                () => widget.onReport(_p),
              ),
            if (!mine)
              _menuTile(
                "Not Interested",
                Ionicons.eye_off_outline,
                AppColors.textGray500,
                () => Navigator.maybePop(context),
              ),
          ],
        ),
      ),
    );
  }

  /// One row of the second view's options menu — web: 11px bold label, white,
  /// with a per-item icon tint.
  Widget _menuTile(
    String label,
    IconData icon,
    Color iconColor,
    VoidCallback onTap,
  ) {
    return ListTile(
      leading: Icon(icon, size: 18, color: iconColor),
      title: Text(
        label,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: Colors.white,
        ),
      ),
      onTap: () {
        Navigator.maybePop(context);
        onTap();
      },
    );
  }

  /// Reads a percentage out of the product's commission_info JSON.
  String _commission(Map product, List<String> keys) {
    final info = _sp(product["commission_info"]);
    if (info is Map) {
      for (final key in keys) {
        final value = info[key];
        if (value != null && "$value".trim().isNotEmpty) {
          final parsed = double.tryParse("$value");
          if (parsed != null) return "${_money(parsed)}%";
        }
      }
    }
    return "0%";
  }

  Widget _commissionTile(
    IconData icon,
    Color color,
    String label,
    String value,
  ) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: const Color(0xFF151515),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderWhite06),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(height: 6),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 6.5,
                letterSpacing: 1.0,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray500,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              value,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// web: `LABEL` on the left, white pill dropdown button on the right.
  Widget _dropdownRow({
    required String label,
    required String value,
    required VoidCallback onTap,
    bool error = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.borderWhite06)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 8.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: GestureDetector(
              onTap: onTap,
              behavior: HitTestBehavior.opaque,
              child: Container(
                constraints: const BoxConstraints(minWidth: 110, maxWidth: 220),
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: error ? AppColors.likeRed : Colors.transparent,
                    width: error ? 2 : 1,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Expanded(
                      child: Text(
                        value.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10,
                          letterSpacing: 0.6,
                          fontWeight: FontWeight.w600,
                          color: Colors.black,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Icon(
                      Ionicons.chevron_down,
                      size: 11,
                      color: Colors.black,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _pickColor(List<Map<String, dynamic>> variants) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1A1A1A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            for (var i = 0; i < variants.length; i++)
              ListTile(
                dense: true,
                selected: _variantIndex == i,
                selectedTileColor: Colors.white,
                title: Text(
                  "${variants[i]["color"] ?? variants[i]["description"] ?? "Style ${i + 1}"}"
                      .toUpperCase(),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                    color: _variantIndex == i
                        ? Colors.black
                        : AppColors.textGray200,
                  ),
                ),
                trailing: _variantIndex == i
                    ? const Icon(
                        Ionicons.checkmark,
                        size: 14,
                        color: Colors.black,
                      )
                    : null,
                onTap: () {
                  Navigator.maybePop(sheetContext);
                  setState(() {
                    _variantIndex = i;
                    _size = null;
                    _sizeError = false;
                    _qty = 1;
                    final vImg = _imgCandidate(
                      variants[i]["image_url"] ??
                          variants[i]["url"] ??
                          variants[i]["image"],
                    );
                    final idx = _images.indexWhere((im) => im == vImg);
                    if (idx != -1) _previewIndex = idx;
                  });
                },
              ),
          ],
        ),
      ),
    );
  }

  /// SHIPS TO dropdown. The web lists every destination with its charge and
  /// switches the quoted rate on selection; this is the same list as a sheet.
  void _pickShippingCountry() {
    final rates = _rates;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1A1A1A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(18, 14, 18, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  "SHIPS TO",
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.6,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray500,
                  ),
                ),
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.only(bottom: 8),
                children: [
                  for (final rate in rates)
                    ListTile(
                      dense: true,
                      selected:
                          rate.country.toLowerCase() ==
                          _shipsToCountry.toLowerCase(),
                      selectedTileColor: Colors.white,
                      title: Text(
                        rate.country.toUpperCase(),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 0.6,
                          color:
                              rate.country.toLowerCase() ==
                                  _shipsToCountry.toLowerCase()
                              ? Colors.black
                              : AppColors.textGray200,
                        ),
                      ),
                      trailing: Text(
                        rate.priceText,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color:
                              rate.country.toLowerCase() ==
                                  _shipsToCountry.toLowerCase()
                              ? Colors.black54
                              : AppColors.textGray500,
                        ),
                      ),
                      onTap: () {
                        Navigator.maybePop(sheetContext);
                        setState(() => _shippingCountry = rate.country);
                      },
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _pickSize(List<String> sizes) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1A1A1A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            for (final size in sizes)
              Builder(
                builder: (_) {
                  final stock = _stockForSize(size);
                  final out = stock <= 0;
                  final active = _size == size;
                  return ListTile(
                    dense: true,
                    enabled: !out,
                    selected: active,
                    selectedTileColor: Colors.white,
                    title: Text(
                      "$size ($stock)".toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                        color: out
                            ? AppColors.textGray700
                            : active
                            ? Colors.black
                            : AppColors.textGray200,
                      ),
                    ),
                    onTap: out
                        ? null
                        : () {
                            Navigator.maybePop(sheetContext);
                            setState(() {
                              _size = size;
                              _sizeError = false;
                              _clampQty();
                            });
                          },
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  /// web isFullscreenPreviewOpen — full-bleed object-contain preview with a
  /// close button. Pinch/double-tap to zoom on mobile.
  void _openFullscreen(String url) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.95),
      builder: (dialogContext) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              onTap: () => Navigator.maybePop(dialogContext),
              child: InteractiveViewer(
                minScale: 1,
                maxScale: 5,
                child: Center(
                  child: Image.network(
                    url,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(
                      Ionicons.image_outline,
                      size: 40,
                      color: AppColors.textGray700,
                    ),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            top: 24,
            right: 20,
            child: GestureDetector(
              onTap: () => Navigator.maybePop(dialogContext),
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Ionicons.close_outline,
                  size: 24,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _railIcon(
    IconData icon,
    String label, {
    Color color = Colors.white,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 20, color: color),
            if (label.isNotEmpty)
              Text(
                label,
                style: TextStyle(
                  fontSize: 8,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// SHIPS TO, as a control rather than a label: the web version is a dropdown
  /// over every destination the seller ships to, so this opens the same list
  /// and shows a chevron to say it is tappable.
  Widget _shipsToRow() {
    return InkWell(
      onTap: _pickShippingCountry,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              "SHIPS TO",
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray500,
              ),
            ),
            const SizedBox(width: 12),
            Flexible(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Text(
                      _shipsToCountry.toUpperCase(),
                      textAlign: TextAlign.right,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _shipsToFeeText,
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      color: AppColors.textGray400,
                    ),
                  ),
                  const Icon(
                    Ionicons.chevron_down,
                    size: 12,
                    color: AppColors.textGray500,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 9,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _deliveryText(Map product) {
    final info =
        _sp(product["shipping_info"]) ??
        _sp(product["shipping_data"]) ??
        _sp(product["shipping_rates"]);
    String days = "3-5 Business Days";
    if (info is Map) {
      days = "${info["days"] ?? info["date"] ?? days}";
    }
    return days;
  }

  String _returnText(Map product) {
    final ret = _sp(product["return_policy"]) ?? _sp(product["return_data"]);
    if (ret is Map) {
      final text = ret["text"] ?? ret["return_days"];
      if (text != null && "$text".trim().isNotEmpty)
        return "$text".toUpperCase();
    }
    return "14 DAYS RETURN";
  }

  String _warrantyText(Map product) {
    final w = _sp(product["warranty_info"]);
    if (w is Map && "${w["warranty"] ?? ""}".trim().isNotEmpty) {
      return "${w["warranty"]}".toUpperCase();
    }
    return "NO WARRANTY";
  }
}

/// web collect-coin pill: red rounded-full with the rupee coin + "Rupieer".
class _RupieerButton extends StatelessWidget {
  final VoidCallback onTap;
  const _RupieerButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: const Color(0xFFDC2626),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0x4DF87171)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.35),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 22,
              height: 22,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.14),
                shape: BoxShape.circle,
              ),
              child: Image.asset(
                'assets/images/rupee.png',
                width: 15,
                height: 15,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(
                  Ionicons.cash_outline,
                  size: 12,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 6),
            const Text(
              'RUPIEER',
              style: TextStyle(
                fontSize: 8,
                letterSpacing: 1.0,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QtyStepper extends StatelessWidget {
  final int qty;
  final VoidCallback onMinus;
  final VoidCallback onPlus;

  /// Web dims a stepper arrow to `opacity-20` and ignores clicks once it would
  /// push the quantity out of range (below 1, or past the available stock).
  final bool canMinus;
  final bool canPlus;

  const _QtyStepper({
    required this.qty,
    required this.onMinus,
    required this.onPlus,
    this.canMinus = true,
    this.canPlus = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 34,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Plain ASCII hyphen, like the web's `<button>-</button>`. The
          // typographic minus (U+2212) that used to be here is missing from
          // some fonts and rendered as a tofu box.
          _btn("-", onMinus, canMinus),
          SizedBox(
            width: 30,
            child: Text(
              "$qty",
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
          _btn("+", onPlus, canPlus),
        ],
      ),
    );
  }

  Widget _btn(String label, VoidCallback onTap, bool enabled) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 34,
        height: 34,
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w500,
              color: Colors.white.withOpacity(enabled ? 1.0 : 0.2),
            ),
          ),
        ),
      ),
    );
  }
}

// ── interactions sheet (likes / comments / views / shares) ───────────────────

class _InteractionsSheet extends StatefulWidget {
  final Map<String, dynamic> product;
  final String initialKind;
  const _InteractionsSheet({required this.product, required this.initialKind});

  @override
  State<_InteractionsSheet> createState() => _InteractionsSheetState();
}

class _InteractionsSheetState extends State<_InteractionsSheet> {
  static const _kinds = ["likes", "comments", "views", "shares"];
  late String _kind = widget.initialKind;
  final _commentCtrl = TextEditingController();
  List<Map<String, dynamic>> _data = const [];
  bool _loading = true;
  Map<String, dynamic>? _replyingTo;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final id = widget.product["id"];
    final data = _kind == "comments"
        ? await Api.productComments(_int(widget.product, ["id"]))
        : await Api.productInteractions(id, _kind);
    if (!mounted) return;
    setState(() {
      _data = data;
      _loading = false;
    });
  }

  Future<void> _addComment() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty) return;
    final parentId = _replyingTo == null
        ? null
        : int.tryParse(
            '${_replyingTo!["id"] ?? _replyingTo!["comment_id"] ?? _replyingTo!["commentId"] ?? 0}',
          );
    _commentCtrl.clear();
    setState(() => _replyingTo = null);
    await Api.addProductComment(
      _int(widget.product, ["id"]),
      text,
      parentId: parentId,
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.72,
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.textGray700,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: _kinds.map((k) {
                final active = k == _kind;
                return GestureDetector(
                  onTap: () {
                    setState(() => _kind = k);
                    _load();
                  },
                  behavior: HitTestBehavior.opaque,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      vertical: 8,
                      horizontal: 4,
                    ),
                    child: Text(
                      k[0].toUpperCase() + k.substring(1),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: active ? FontWeight.w600 : FontWeight.w600,
                        color: active ? Colors.white : AppColors.textGray500,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
            const Divider(height: 1, color: AppColors.borderWhite10),
            Expanded(
              child: _loading
                  ? const Center(
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          color: AppColors.textGray400,
                          strokeWidth: 2,
                        ),
                      ),
                    )
                  : _data.isEmpty
                  ? Center(
                      child: Text(
                        "No $_kind yet",
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.textGray500,
                        ),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      itemCount: _data.length,
                      itemBuilder: (_, i) => _row(_data[i]),
                    ),
            ),
            if (_kind == "comments")
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
                  child: Column(
                    children: [
                      if (_replyingTo != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  'Replying to ${_str(_replyingTo!, ["full_name", "name", "username", "commenter_name"], "comment")}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.textGray500,
                                  ),
                                ),
                              ),
                              GestureDetector(
                                onTap: () => setState(() => _replyingTo = null),
                                child: const Icon(
                                  Ionicons.close_outline,
                                  size: 16,
                                  color: AppColors.textGray500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _commentCtrl,
                              style: const TextStyle(
                                fontSize: 12.5,
                                color: Colors.white,
                              ),
                              cursorColor: AppColors.accentPurple,
                              decoration: InputDecoration(
                                hintText: "Add a comment…",
                                hintStyle: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textGray600,
                                ),
                                isDense: true,
                                filled: true,
                                fillColor: AppColors.bg2,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 10,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(999),
                                  borderSide: const BorderSide(
                                    color: AppColors.borderWhite10,
                                  ),
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(999),
                                  borderSide: const BorderSide(
                                    color: AppColors.borderWhite10,
                                  ),
                                ),
                              ),
                              onSubmitted: (_) => _addComment(),
                            ),
                          ),
                          const SizedBox(width: 8),
                          GestureDetector(
                            onTap: _addComment,
                            child: Container(
                              width: 40,
                              height: 40,
                              decoration: const BoxDecoration(
                                color: AppColors.accentPurple,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Ionicons.send,
                                size: 18,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(Map<String, dynamic> item) {
    final name = _str(item, [
      "full_name",
      "name",
      "username",
      "commenter_name",
    ], "Googer User");
    final username = _str(item, ["username", "commenter_username"]);
    final avatar = _str(item, ["profile_picture", "avatar"]);
    final text = _str(item, ["text", "comment", "body"]);
    final commentId = item["id"];
    final mine = username.toLowerCase() == Api.username.toLowerCase();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => _openSellerProfile(context, item),
            child: _MiniAvatar(
              url: avatar.isEmpty ? "" : Api.resolveMedia(avatar),
              name: name,
              size: 32,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _openSellerProfile(context, item),
                  child: Text(
                    name,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                ),
                if (text.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      text,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textGray300,
                      ),
                    ),
                  ),
                if (_kind == "comments")
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      children: [
                        _commentAction(Ionicons.thumbs_up_outline, () async {
                          await Api.likeProductComment(commentId);
                          _load();
                        }),
                        const SizedBox(width: 16),
                        _commentAction(Ionicons.thumbs_down_outline, () async {
                          await Api.dislikeProductComment(commentId);
                          _load();
                        }),
                        const SizedBox(width: 16),
                        _commentAction(
                          Ionicons.chatbubble_ellipses_outline,
                          () {
                            setState(() {
                              _replyingTo = item;
                              _commentCtrl.text = '';
                            });
                          },
                        ),
                        const SizedBox(width: 16),
                        if (mine)
                          _commentAction(Ionicons.trash_outline, () async {
                            await Api.deleteProductComment(commentId);
                            _load();
                          })
                        else
                          _commentAction(Ionicons.flag_outline, () async {
                            await Api.reportProductComment(commentId);
                            _load();
                          }),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _commentAction(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Icon(icon, size: 14, color: AppColors.textGray500),
    );
  }
}

// ── order card ───────────────────────────────────────────────────────────────

class _OrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final bool isSeller;
  final void Function(String status) onStatus;
  final VoidCallback onReport;

  /// Opens the order-scoped conversation with the counterparty.
  final VoidCallback onChat;
  const _OrderCard({
    required this.order,
    required this.isSeller,
    required this.onStatus,
    required this.onReport,
    required this.onChat,
  });

  /// "25 MAY 2026 09:37 AM" — the web's order timestamp format.
  static String _orderStamp(dynamic raw) {
    final dt = Api.parseServerTime(raw);
    if (dt == null) return "";
    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];
    final hour24 = dt.hour;
    final hour = hour24 % 12 == 0 ? 12 : hour24 % 12;
    final minute = dt.minute.toString().padLeft(2, '0');
    final meridiem = hour24 < 12 ? "AM" : "PM";
    final day = dt.day.toString().padLeft(2, '0');
    return "$day ${months[dt.month - 1]} ${dt.year} "
        "${hour.toString().padLeft(2, '0')}:$minute $meridiem";
  }

  @override
  Widget build(BuildContext context) {
    final title = _str(order, [
      "item_title",
      "title",
      "product_title",
      "name",
    ], "Order item");
    final status = _str(order, ["status"], "pending").toLowerCase();
    final qty = _int(order, ["quantity", "qty"], 1);
    final total = _num(order, ["total_price", "amount", "price"]);
    final unit = _num(order, ["price", "unit_price", "item_price"]);
    final orderNo = _str(order, ["order_number", "order_no", "id"]);
    final image = _primaryImage(order);
    final seller = _str(order, [
      "seller_username",
      "owner_username",
      "seller_name",
    ]);
    final size = _str(order, ["size"]);
    final colorName = _str(order, ["color"]);
    final stamp = _orderStamp(order["created_at"] ?? order["createdAt"]);

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF121212),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderWhite06),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── header: receipt glyph, spaced order number, product count/date
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderWhite06),
                ),
                child: const Icon(
                  Ionicons.receipt_outline,
                  size: 18,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      orderNo,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        letterSpacing: 3,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      stamp.isEmpty ? "1 PRODUCT" : "1 PRODUCT • $stamp",
                      style: const TextStyle(
                        fontSize: 9,
                        letterSpacing: 0.6,
                        fontWeight: FontWeight.w500,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // ── order total + summary (eye) button
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      "ORDER TOTAL",
                      style: TextStyle(
                        fontSize: 9,
                        letterSpacing: 1.4,
                        fontStyle: FontStyle.italic,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Padding(
                          padding: EdgeInsets.only(bottom: 4),
                          child: Text(
                            "R ",
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textGray500,
                            ),
                          ),
                        ),
                        Text(
                          _money(total),
                          style: const TextStyle(
                            fontSize: 26,
                            height: 1,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: () => _openSummary(context, total, unit),
                child: Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.05),
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: const Icon(
                    Ionicons.eye_outline,
                    size: 17,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          // ── the product tile
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.borderWhite06),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 62,
                      height: 62,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: Colors.black,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.borderWhite06),
                      ),
                      child: image.isEmpty
                          ? const Icon(
                              Ionicons.image_outline,
                              size: 18,
                              color: AppColors.textGray700,
                            )
                          : Image.network(
                              image,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const SizedBox(),
                            ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title.toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 7),
                          Wrap(
                            spacing: 14,
                            runSpacing: 5,
                            children: [
                              if (seller.isNotEmpty)
                                _meta(
                                  Ionicons.person_circle_outline,
                                  "SELLER: @$seller",
                                ),
                              if (unit > 0)
                                _meta(
                                  Ionicons.pricetag_outline,
                                  "PRICE: R ${_money(unit)}",
                                ),
                              if (size.isNotEmpty)
                                _meta(Ionicons.resize_outline, "SIZE: $size"),
                              if (colorName.isNotEmpty)
                                _meta(
                                  Ionicons.color_palette_outline,
                                  "COLOR: ${colorName.toUpperCase()}",
                                ),
                              _meta(Ionicons.layers_outline, "QTY: $qty"),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (_shippingLines().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.utilityBlue.withOpacity(0.07),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppColors.utilityBlue.withOpacity(0.18),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Ionicons.navigate_outline,
                              size: 12,
                              color: AppColors.utilityBlue,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              "SHIPPING ADDRESS",
                              style: TextStyle(
                                fontSize: 9,
                                letterSpacing: 1.2,
                                fontWeight: FontWeight.w600,
                                color: AppColors.utilityBlue,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 7),
                        for (final line in _shippingLines())
                          Padding(
                            padding: const EdgeInsets.only(bottom: 2),
                            child: Text(
                              line,
                              style: const TextStyle(
                                fontSize: 11,
                                height: 1.35,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textGray200,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 9,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.04),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: Text(
                        status.toUpperCase(),
                        style: TextStyle(
                          fontSize: 10,
                          letterSpacing: 1.2,
                          fontWeight: FontWeight.w600,
                          color: _statusColor(status),
                        ),
                      ),
                    ),
                    const Spacer(),
                    ..._actions(status),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // ── chat row
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 46,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.02),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.borderWhite06),
                  ),
                  child: Text(
                    isSeller ? "BUYER CHAT AVAILABLE" : "SELLER CHAT AVAILABLE",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 10,
                      letterSpacing: 0.8,
                      fontWeight: FontWeight.w600,
                      color: Colors.white.withOpacity(0.22),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: GestureDetector(
                  onTap: onChat,
                  child: Container(
                    height: 46,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Ionicons.chatbubble_ellipses_outline,
                          size: 14,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 7),
                        Text(
                          isSeller ? "CHAT WITH BUYER" : "CHAT WITH SELLER",
                          style: const TextStyle(
                            fontSize: 10,
                            letterSpacing: 0.8,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// One icon + label pair in the product tile's meta row.
  Widget _meta(IconData icon, String label) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 11, color: AppColors.textGray500),
        const SizedBox(width: 4),
        Text(
          label,
          style: const TextStyle(
            fontSize: 9.5,
            letterSpacing: 0.4,
            fontStyle: FontStyle.italic,
            fontWeight: FontWeight.w500,
            color: AppColors.textGray300,
          ),
        ),
      ],
    );
  }

  /// Name / phones / address, in the order the web's block prints them.
  List<String> _shippingLines() {
    final raw = _sp(order["shipping_address"]) ?? order["shipping_address"];
    final map = raw is Map ? Map<String, dynamic>.from(raw) : null;
    if (map == null) {
      final flat = "${order["shipping_address"] ?? ""}".trim();
      return flat.isEmpty ? const [] : [flat];
    }
    final name = [
      "${map["first_name"] ?? map["firstName"] ?? ""}".trim(),
      "${map["last_name"] ?? map["lastName"] ?? ""}".trim(),
    ].where((s) => s.isNotEmpty).join(" ");
    final phones = [
      "${map["phone"] ?? map["phone1"] ?? ""}".trim(),
      "${map["phone2"] ?? map["alt_phone"] ?? ""}".trim(),
    ].where((s) => s.isNotEmpty).join(" / ");
    final address = [
      map["house_no"] ?? map["houseNo"],
      map["building"] ?? map["building_num"],
      map["street"] ?? map["street_name"],
      map["city"],
      map["district"],
      map["province"] ?? map["state"],
      map["country"],
    ].map((v) => "${v ?? ""}".trim()).where((s) => s.isNotEmpty).join(", ");
    return [
      if (name.isNotEmpty) name.toUpperCase(),
      if (phones.isNotEmpty) phones,
      if (address.isNotEmpty) address,
    ];
  }

  /// The eye button's ORDER SUMMARY sheet.
  void _openSummary(BuildContext context, double total, double unit) {
    final qty = _int(order, ["quantity", "qty"], 1);
    final subtotal = unit > 0 ? unit * qty : total;
    final discount = _num(order, ["product_discount_amount", "discount"]);
    final delivery = _num(order, ["shipping_fee", "delivery_charge"]);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF121212),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          "ORDER SUMMARY",
                          style: TextStyle(
                            fontSize: 19,
                            letterSpacing: 0.4,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          "ORDER #${_str(order, ["order_number", "order_no", "id"])}",
                          style: const TextStyle(
                            fontSize: 10,
                            letterSpacing: 1.2,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () => Navigator.maybePop(sheetContext),
                    child: Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.06),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Ionicons.close,
                        size: 17,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              const Text(
                "TRANSACTION DETAILS",
                style: TextStyle(
                  fontSize: 10,
                  letterSpacing: 1.6,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textGray500,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.02),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderWhite06),
                ),
                child: Column(
                  children: [
                    _summaryRow("ITEMS SUBTOTAL", "R ${_money(subtotal)}"),
                    if (discount > 0)
                      _summaryRow(
                        "PRODUCT DISCOUNT",
                        "- R ${_money(discount)}",
                        color: AppColors.successGreen,
                      ),
                    if (delivery > 0)
                      _summaryRow("DELIVERY CHARGE", "R ${_money(delivery)}"),
                    _summaryRow(
                      "PAYMENT METHOD",
                      "GOOGER WALLET",
                      color: const Color(0xFFF5C542),
                    ),
                    const Divider(height: 18, color: AppColors.borderWhite06),
                    _summaryRow(
                      "GRAND TOTAL",
                      "R ${_money(total)}",
                      emphasis: true,
                    ),
                  ],
                ),
              ),
              if (_shippingLines().isNotEmpty) ...[
                const SizedBox(height: 18),
                const Text(
                  "SHIPPING INFORMATION",
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.6,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.02),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.borderWhite06),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final line in _shippingLines())
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            line,
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.4,
                              fontWeight: FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _summaryRow(
    String label,
    String value, {
    Color? color,
    bool emphasis = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: emphasis ? 11 : 10.5,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w600,
              color: color ?? AppColors.textGray400,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: emphasis ? 17 : 12,
              fontStyle: emphasis ? FontStyle.italic : FontStyle.normal,
              fontWeight: FontWeight.w600,
              color: color ?? Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _actions(String status) {
    final buttons = <Widget>[];
    if (isSeller) {
      if (status == "pending" || status == "approved") {
        buttons.add(
          _btn("Process", AppColors.successGreen, () => onStatus("processing")),
        );
      } else if (status == "processing") {
        buttons.add(
          _btn("Ship", AppColors.utilityBlue, () => onStatus("shipped")),
        );
      } else if (status == "shipped") {
        buttons.add(
          _btn("Deliver", AppColors.successGreen, () => onStatus("delivered")),
        );
      }
    } else {
      if (status == "delivered") {
        buttons.add(
          _btn("Received", AppColors.successGreen, () => onStatus("received")),
        );
      }
      buttons.add(_outlineBtn("Report", onReport));
    }
    return buttons
        .expand((w) => [w, const SizedBox(width: 8)])
        .take(buttons.isEmpty ? 0 : buttons.length * 2 - 1)
        .toList();
  }

  Widget _btn(String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
    );
  }

  Widget _outlineBtn(String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            color: AppColors.textGray300,
          ),
        ),
      ),
    );
  }

  static Color _statusColor(String status) {
    switch (status) {
      case "delivered":
      case "received":
      case "completed":
        return AppColors.successGreen;
      case "cancelled":
      case "rejected":
        return AppColors.likeRed;
      case "shipped":
        return AppColors.utilityBlue;
      default:
        return const Color(0xFFFBBF24);
    }
  }
}

// ── cart view ────────────────────────────────────────────────────────────────

class _CartView extends StatefulWidget {
  final Future<String?> Function(
    List<Map<String, dynamic>> items,
    String address,
  )
  onCheckout;
  const _CartView({required this.onCheckout});

  @override
  State<_CartView> createState() => _CartViewState();
}

class _CartViewState extends State<_CartView> {
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;
  bool _placing = false;
  final _addressCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _addressCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final items = await Api.getCart();
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  double get _total => _items.fold<double>(
    0,
    (sum, it) =>
        sum +
        _num(it, ["price", "total_price"]) * _int(it, ["quantity", "qty"], 1),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        leading: const AppBackButton.appBar(),
        title: Text(
          "Cart (${_items.length})",
          style: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.border1),
        ),
      ),
      body: _loading
          ? const Center(
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  color: AppColors.textGray400,
                  strokeWidth: 2,
                ),
              ),
            )
          : _items.isEmpty
          ? const Center(
              child: Text(
                "Your cart is empty",
                style: TextStyle(fontSize: 13, color: AppColors.textGray500),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(14),
              children: [
                ..._items.map(_cartRow),
                const SizedBox(height: 8),
                TextField(
                  controller: _addressCtrl,
                  style: const TextStyle(fontSize: 12.5, color: Colors.white),
                  maxLines: 2,
                  decoration: InputDecoration(
                    hintText: "Shipping address",
                    hintStyle: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textGray600,
                    ),
                    filled: true,
                    fillColor: AppColors.bg2,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                        color: AppColors.borderWhite10,
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(
                        color: AppColors.borderWhite10,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.bg2,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "Total",
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: Colors.white,
                        ),
                      ),
                      Text(
                        "R ${_money(_total)}",
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _placing ? null : _checkout,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                    child: _placing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              color: Colors.black,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text(
                            "Checkout with wallet",
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: Colors.black,
                            ),
                          ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _cartRow(Map<String, dynamic> item) {
    final title = _str(item, [
      "item_title",
      "title",
      "name",
      "product_title",
    ], "Item");
    final qty = _int(item, ["quantity", "qty"], 1);
    final price = _num(item, ["price", "total_price"]);
    final image = _primaryImage(item);
    final itemId = item["id"] ?? item["cart_item_id"];
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF141414),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite06),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.04),
              borderRadius: BorderRadius.circular(10),
            ),
            child: image.isEmpty
                ? const Icon(
                    Ionicons.image_outline,
                    size: 18,
                    color: AppColors.textGray700,
                  )
                : Image.network(
                    image,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const SizedBox(),
                  ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "R ${_money(price)}",
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
          _QtyStepper(
            qty: qty,
            onMinus: () => _updateQty(itemId, qty - 1),
            onPlus: () => _updateQty(itemId, qty + 1),
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: () async {
              await Api.removeCartItem(itemId);
              _load();
            },
            child: const Icon(
              Ionicons.trash_outline,
              size: 18,
              color: AppColors.textGray500,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _updateQty(dynamic itemId, int qty) async {
    if (qty < 1) {
      await Api.removeCartItem(itemId);
    } else {
      await Api.updateCartItem(itemId, {"quantity": qty});
    }
    _load();
  }

  Future<void> _checkout() async {
    if (_items.isEmpty) return;
    setState(() => _placing = true);
    final error = await widget.onCheckout(_items, _addressCtrl.text.trim());
    if (!mounted) return;
    setState(() => _placing = false);
    if (error == null) {
      AppNotifications.success(
        "Order placed",
        "Your order was created and paid from your wallet.",
      );
    } else {
      AppNotifications.error("Checkout failed", error);
    }
    if (error == null) {
      await _load();
      if (mounted) Navigator.maybePop(context);
    }
  }
}

// ── add product form ─────────────────────────────────────────────────────────

class _AddProductForm extends StatefulWidget {
  final VoidCallback onCreated;
  const _AddProductForm({required this.onCreated});

  @override
  State<_AddProductForm> createState() => _AddProductFormState();
}

class _AddProductFormState extends State<_AddProductForm> {
  final _title = TextEditingController();
  final _price = TextEditingController();
  final _category = TextEditingController();
  final _description = TextEditingController();
  final _stock = TextEditingController(text: "1");
  List<ApiUploadFile> _images = const [];
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _price.dispose();
    _category.dispose();
    _description.dispose();
    _stock.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _title.text.trim();
    final price = double.tryParse(_price.text.trim());
    if (title.isEmpty || price == null) {
      setState(() => _error = "Enter a title and a valid price.");
      return;
    }
    if (_images.isEmpty) {
      setState(() => _error = "Add at least one product photo.");
      return;
    }
    final stock = int.tryParse(_stock.text.trim()) ?? 1;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final error = await Api.createProduct({
      "title": title,
      "price": price,
      "category": _category.text.trim().isEmpty
          ? "General"
          : _category.text.trim(),
      "description": _description.text.trim(),
      "stock": stock,
      "variants_data": [
        for (var i = 0; i < _images.length; i++)
          {
            "image_url": "blob:mobile-product-$i",
            "stock": i == 0 ? stock : 0,
            "quantity": i == 0 ? stock : 0,
          },
      ],
    }, images: _images);
    if (!mounted) return;
    setState(() => _submitting = false);
    if (error == null) {
      Navigator.maybePop(context);
      widget.onCreated();
    } else {
      setState(() => _error = error);
    }
  }

  Future<void> _pickImages() async {
    final files = await pickUploadFiles(
      field: "images",
      allowMultiple: true,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp'],
      type: FileType.custom,
    );
    if (!mounted || files.isEmpty) return;
    setState(() => _images = files.take(5).toList());
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "List a product",
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            "Add photos before publishing, matching the web listing form.",
            style: TextStyle(fontSize: 10.5, color: AppColors.textGray500),
          ),
          const SizedBox(height: 14),
          _field(_title, "Title"),
          _field(_price, "Price (R)", keyboard: TextInputType.number),
          _field(_category, "Category"),
          _field(_stock, "Stock", keyboard: TextInputType.number),
          _field(_description, "Description", lines: 3),
          _uploadButton(
            label: _images.isEmpty
                ? "Add product photos"
                : "${_images.length} photo${_images.length == 1 ? "" : "s"} selected",
            onTap: _pickImages,
          ),
          if (_images.isNotEmpty) _selectedFiles(_images),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _error!,
                style: const TextStyle(fontSize: 11, color: AppColors.likeRed),
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentPurple,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Text(
                      "Publish listing",
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: Colors.white,
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _uploadButton({required String label, required VoidCallback onTap}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.bg2,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Row(
            children: [
              const Icon(
                Ionicons.images_outline,
                size: 17,
                color: Colors.white,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _selectedFiles(List<ApiUploadFile> files) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: files
            .map(
              (file) => Chip(
                label: Text(
                  file.filename,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 10, color: Colors.white),
                ),
                backgroundColor: AppColors.bg3,
                side: const BorderSide(color: AppColors.borderWhite10),
                deleteIcon: const Icon(
                  Ionicons.close_outline,
                  size: 14,
                  color: AppColors.textGray400,
                ),
                onDeleted: () => setState(
                  () => _images = _images
                      .where((item) => item.filename != file.filename)
                      .toList(),
                ),
              ),
            )
            .toList(),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String hint, {
    TextInputType keyboard = TextInputType.text,
    int lines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: controller,
        keyboardType: keyboard,
        maxLines: lines,
        style: const TextStyle(fontSize: 12.5, color: Colors.white),
        cursorColor: AppColors.accentPurple,
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(
            fontSize: 12,
            color: AppColors.textGray600,
          ),
          isDense: true,
          filled: true,
          fillColor: AppColors.bg2,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.borderWhite10),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.borderWhite10),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.purpleBorder),
          ),
        ),
      ),
    );
  }
}

// ── filters sheet ─────────────────────────────────────────────────────────────

class _FiltersSheet extends StatefulWidget {
  final String algorithm;
  final String sort;
  final String country;
  final void Function(String algorithm, String sort, String country) onApply;
  final VoidCallback onClear;
  const _FiltersSheet({
    required this.algorithm,
    required this.sort,
    required this.country,
    required this.onApply,
    required this.onClear,
  });

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late String _algorithm = widget.algorithm;
  late String _sort = widget.sort;
  late final TextEditingController _country = TextEditingController(
    text: widget.country,
  );

  static const _algorithms = {
    "recommended": "Recommended",
    "relevance": "Relevance",
    "engagement": "Engagement",
    "freshness": "Freshness",
  };
  static const _sorts = {
    "": "Default",
    "newest": "Newest",
    "price_asc": "Price: Low to High",
    "price_desc": "Price: High to Low",
    "popular": "Most Popular",
  };

  @override
  void dispose() {
    _country.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                "Filters",
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              GestureDetector(
                onTap: () {
                  Navigator.maybePop(context);
                  widget.onClear();
                },
                child: const Text(
                  "Clear all",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textGray400,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Text(
            "ALGORITHM",
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _algorithms.entries
                .map(
                  (e) => _pill(
                    e.value,
                    _algorithm == e.key,
                    () => setState(() => _algorithm = e.key),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 16),
          const Text(
            "SORT",
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _sorts.entries
                .map(
                  (e) => _pill(
                    e.value,
                    _sort == e.key,
                    () => setState(() => _sort = e.key),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 16),
          const Text(
            "COUNTRY",
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _country,
            style: const TextStyle(fontSize: 12.5, color: Colors.white),
            cursorColor: AppColors.accentPurple,
            decoration: InputDecoration(
              hintText: "Any country",
              hintStyle: const TextStyle(
                fontSize: 12,
                color: AppColors.textGray600,
              ),
              isDense: true,
              filled: true,
              fillColor: AppColors.bg2,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: AppColors.borderWhite10),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: AppColors.borderWhite10),
              ),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Navigator.maybePop(context);
                widget.onApply(_algorithm, _sort, _country.text.trim());
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentPurple,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              child: const Text(
                "Apply filters",
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _pill(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? Colors.white : AppColors.bg2,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: active ? Colors.black : AppColors.textGray300,
          ),
        ),
      ),
    );
  }
}

// ── categories drawer ─────────────────────────────────────────────────────────

class _CategoryDrawer extends StatefulWidget {
  final String selected;
  final void Function(String name) onSelect;
  const _CategoryDrawer({required this.selected, required this.onSelect});

  @override
  State<_CategoryDrawer> createState() => _CategoryDrawerState();
}

class _CategoryDrawerState extends State<_CategoryDrawer> {
  List<Map<String, dynamic>> _tree = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final tree = await Api.categoryTree();
    if (!mounted) return;
    setState(() {
      _tree = tree;
      _loading = false;
    });
  }

  List _children(Map node) {
    final children = node["children"] ?? node["subcategories"] ?? node["items"];
    return children is List ? children : const [];
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.75,
      child: Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.textGray700,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              "Categories",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
          const Divider(height: 1, color: AppColors.borderWhite10),
          Expanded(
            child: _loading
                ? const Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        color: AppColors.textGray400,
                        strokeWidth: 2,
                      ),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    children: [
                      _tile("All"),
                      ..._tree.map((node) {
                        final name = "${node["name"] ?? node["title"] ?? ""}"
                            .trim();
                        final children = _children(node);
                        if (name.isEmpty) return const SizedBox.shrink();
                        if (children.isEmpty) return _tile(name);
                        return Theme(
                          data: Theme.of(
                            context,
                          ).copyWith(dividerColor: Colors.transparent),
                          child: ExpansionTile(
                            iconColor: AppColors.textGray400,
                            collapsedIconColor: AppColors.textGray400,
                            title: GestureDetector(
                              onTap: () {
                                Navigator.maybePop(context);
                                widget.onSelect(name);
                              },
                              child: Text(
                                name,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            children: children.whereType<Map>().map((child) {
                              final childName =
                                  "${child["name"] ?? child["title"] ?? ""}"
                                      .trim();
                              if (childName.isEmpty)
                                return const SizedBox.shrink();
                              return Padding(
                                padding: const EdgeInsets.only(left: 16),
                                child: _tile(childName, small: true),
                              );
                            }).toList(),
                          ),
                        );
                      }),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _tile(String name, {bool small = false}) {
    final active = name == widget.selected;
    return ListTile(
      dense: small,
      title: Text(
        name,
        style: TextStyle(
          fontSize: small ? 12 : 13,
          fontWeight: active ? FontWeight.w600 : FontWeight.w600,
          color: active ? AppColors.purpleText : Colors.white,
        ),
      ),
      trailing: active
          ? const Icon(
              Ionicons.checkmark,
              size: 16,
              color: AppColors.purpleText,
            )
          : null,
      onTap: () {
        Navigator.maybePop(context);
        widget.onSelect(name);
      },
    );
  }
}
