/// Client-side product ranking for the shop feed.
///
/// The backend has no ranking: `GET /market` honours `search` and nothing else,
/// so the `algorithm`, `sort`, `country` and category params the app sends are
/// discarded server-side. The web does the whole thing on the client
/// (`app/dashboard/shop/page.tsx`), and this is a port of that model so mobile
/// ranks identically instead of showing whatever order the API happened to
/// return.
///
/// See `docs/feature-map/11-SHOP-FEED-UI.md` §3 for the formulas and weights.
library;

import 'dart:math' as math;

/// Ranking algorithms, in the web's declaration order.
class ShopAlgorithm {
  static const trending = 'trending';
  static const recommended = 'recommended';
  static const bestSellers = 'best-sellers';
  static const newArrivals = 'new-arrivals';
  static const mostViewed = 'most-viewed';
  static const popularWeek = 'popular-week';

  /// id → label, matching the web `MARKET_ALGORITHM_OPTIONS`.
  static const labels = <String, String>{
    trending: 'Trending Now',
    recommended: 'Recommended For You',
    bestSellers: 'Best Sellers',
    newArrivals: 'New Arrivals',
    mostViewed: 'Most Viewed',
    popularWeek: 'Popular This Week',
  };

  static const ordered = <String>[
    trending,
    recommended,
    bestSellers,
    newArrivals,
    mostViewed,
    popularWeek,
  ];
}

/// Explicit sort overrides, applied after the algorithm.
class ShopSort {
  static const topSales = 'top-sales';
  static const priceLowHigh = 'price-low-high';
  static const priceHighLow = 'price-high-low';

  static const labels = <String, String>{
    topSales: 'Top sales',
    priceLowHigh: 'Price low to high',
    priceHighLow: 'Price high to low',
  };
}

double _n(dynamic value, [double fallback = 0]) {
  if (value is num) return value.toDouble();
  final parsed = double.tryParse('${value ?? ''}');
  return parsed == null || !parsed.isFinite ? fallback : parsed;
}

String _s(dynamic value) => '${value ?? ''}';

/// Effective price — promo when it is a real value, else the list price.
double productPromoPrice(Map p) {
  final promo = _n(p['promo_price']);
  if (promo > 0) return promo;
  return _n(p['price'] ?? p['main_price'] ?? p['product_price']);
}

/// Stable identity used for dwell-time bookkeeping. A promoted product and the
/// listing behind it share one key, so time spent on either counts once.
String productRankingKey(Map p) =>
    '${p['product_id'] ?? p['linked_product_id'] ?? p['id'] ?? p['product_code'] ?? ''}';

/// Hours since creation. Unparseable dates sort as ancient rather than as new.
double productAgeHours(Map p) {
  final raw = '${p['created_at'] ?? p['createdAt'] ?? ''}';
  final dt = DateTime.tryParse(raw);
  if (dt == null) return 9999;
  final hours = DateTime.now().difference(dt).inMilliseconds / (1000 * 60 * 60);
  return hours.isFinite && hours > 0 ? hours : (hours.isFinite ? 0 : 9999);
}

/// Banded freshness, not a continuous decay.
double productFreshnessScore(Map p) {
  final h = productAgeHours(p);
  if (h <= 24) return 100;
  if (h <= 72) return 70;
  if (h <= 168) return 45;
  if (h <= 720) return 20;
  return 5;
}

double productEngagementScore(Map p) =>
    _n(p['views_count']) +
    _n(p['likes_count']) * 3 +
    _n(p['comments_count']) * 4 +
    _n(p['shares_count']) * 5 +
    _n(p['add_to_cart_count']) * 8 +
    _n(p['purchases_count']) * 15 +
    math.min(180, _n(p['_local_time_spent'] ?? p['time_spent_seconds'])) * 0.2;

double productSalesScore(Map p) =>
    _n(p['purchases_count']) * 1000 +
    _n(p['add_to_cart_count']) * 50 +
    _n(p['likes_count']) * 5 +
    _n(p['views_count']);

/// Velocity rather than volume. The 6-hour floor stops a minutes-old product
/// dividing by ~0 and swamping the board.
double productTrendingScore(Map p) {
  final hours = math.max(productAgeHours(p), 6);
  final velocity = productEngagementScore(p) / math.sqrt(hours);
  return velocity +
      productFreshnessScore(p) * 0.35 +
      _n(p['search_count'] ?? p['search_frequency']) * 6;
}

double productPopularWeekScore(Map p) {
  final boost = productAgeHours(p) <= 168 ? 1.4 : 0.65;
  return productEngagementScore(p) * boost + productSalesScore(p) * 0.12;
}

double productCtrScore(Map p) {
  final views = _n(p['views_count']);
  final clicks = _n(p['clicks_count'] ?? p['click_count'] ?? p['likes_count']);
  if (views > 0) return math.min(100, (clicks / views) * 300);
  return clicks > 0 ? 40 : 0;
}

double productConversionScore(Map p) {
  final views = _n(p['views_count']);
  final purchases = _n(p['purchases_count']);
  final carts = _n(p['add_to_cart_count']);
  if (views <= 0) return math.min(100, purchases * 25 + carts * 8);
  return math.min(100, ((purchases * 4 + carts) / views) * 100);
}

double productPriceCompetitivenessScore(Map p) {
  final price = productPromoPrice(p);
  final original = _n(
    p['price'] ?? p['main_price'] ?? p['product_price'],
    price,
  );
  if (price == 0) return 0;
  if (original > price) {
    return math.min(100, 55 + ((original - price) / original) * 150);
  }
  return 45;
}

/// Out of stock scores zero but is *not* removed — it ranks low, it still shows.
double productStockScore(Map p) {
  final stock = _n(p['stock'] ?? p['total_stock'] ?? p['available_stock']);
  if (stock <= 0) return 0;
  if (stock >= 20) return 100;
  return 45 + stock * 2.75;
}

double productSellerPerformanceScore(Map p) {
  var score = 50.0;
  if (p['seller_verified'] == true || p['verified_seller'] == true) score += 20;
  score += math.min(20, _n(p['seller_rating'] ?? p['rating']) * 4);
  if (p['seller_fast_response'] == true) score += 10;
  score -= math.min(35, _n(p['seller_cancel_rate']));
  if (p['seller_reported'] == true) score -= 45;
  return score.clamp(0, 100).toDouble();
}

/// Keyword overlap against the searchable fields. Words shorter than two
/// characters are ignored, and each hit is worth 35 up to a ceiling of 100.
double textMatchScore(Map p, String query) {
  final keywords = query
      .toLowerCase()
      .split(RegExp(r'[^a-z0-9]+'))
      .where((w) => w.length >= 2)
      .toList();
  if (keywords.isEmpty) return 0;
  final haystack = [
    p['title'],
    p['description'],
    p['category'],
    p['sub_category'],
    p['manual_category'],
    p['username'],
    p['owner_username'],
  ].map((v) => _s(v).toLowerCase()).join(' ');
  final hits = keywords.where(haystack.contains).length;
  return math.min(100, hits * 35).toDouble();
}

/// The learning-to-rank blend behind "Recommended For You". Weights sum to 1.00.
double productLtrScore(Map p, String query) =>
    textMatchScore(p, query) * 0.22 +
    productCtrScore(p) * 0.15 +
    productConversionScore(p) * 0.18 +
    math.min(100, productSalesScore(p) / 10) * 0.14 +
    productPriceCompetitivenessScore(p) * 0.10 +
    productStockScore(p) * 0.10 +
    productSellerPerformanceScore(p) * 0.08 +
    math.min(100, _n(p['_local_time_spent'] ?? p['time_spent_seconds'])) * 0.03;

double scoreProduct(Map p, String algorithm, String query) {
  switch (algorithm) {
    case ShopAlgorithm.trending:
      return productTrendingScore(p);
    case ShopAlgorithm.bestSellers:
      return productSalesScore(p);
    case ShopAlgorithm.newArrivals:
      return productFreshnessScore(p) * 100 - productAgeHours(p);
    case ShopAlgorithm.mostViewed:
      return _n(p['views_count']);
    case ShopAlgorithm.popularWeek:
      return productPopularWeekScore(p);
    default:
      return productLtrScore(p, query) + productTrendingScore(p) * 0.18;
  }
}

/// Rank a product list. Ties break on `created_at` descending, like the web.
List<Map<String, dynamic>> rankMarketProducts(
  List<Map<String, dynamic>> products,
  String algorithm, {
  String query = '',
}) {
  final out = [...products];
  out.sort((a, b) {
    final diff =
        scoreProduct(b, algorithm, query) - scoreProduct(a, algorithm, query);
    if (diff != 0) return diff > 0 ? 1 : -1;
    final at = DateTime.tryParse('${a['created_at'] ?? ''}');
    final bt = DateTime.tryParse('${b['created_at'] ?? ''}');
    return (bt?.millisecondsSinceEpoch ?? 0).compareTo(
      at?.millisecondsSinceEpoch ?? 0,
    );
  });
  return out;
}

/// The explicit sort override, applied on top of the algorithm ordering.
List<Map<String, dynamic>> applyShopSort(
  List<Map<String, dynamic>> products,
  String sort,
) {
  if (sort.isEmpty) return products;
  final out = [...products];
  switch (sort) {
    case ShopSort.priceLowHigh:
      out.sort((a, b) => productPromoPrice(a).compareTo(productPromoPrice(b)));
      break;
    case ShopSort.priceHighLow:
      out.sort((a, b) => productPromoPrice(b).compareTo(productPromoPrice(a)));
      break;
    case ShopSort.topSales:
      out.sort((a, b) => productSalesScore(b).compareTo(productSalesScore(a)));
      break;
  }
  return out;
}

/// FNV-1a. Used to order items from a seed so a shuffle is stable across
/// rebuilds but still varies between sessions.
int stableHash(String value) {
  var hash = 0x811c9dc5;
  for (var i = 0; i < value.length; i++) {
    hash ^= value.codeUnitAt(i);
    hash = (hash * 0x01000193) & 0x7fffffff;
  }
  return hash;
}

/// Seeded shuffle — the web `shuffleItemsWithSeed`. Same seed, same order.
List<T> shuffleItemsWithSeed<T>(
  List<T> items,
  String seed,
  String Function(T) keyOf,
) {
  final out = [...items];
  out.sort(
    (a, b) => stableHash(
      '$seed:${keyOf(a)}',
    ).compareTo(stableHash('$seed:${keyOf(b)}')),
  );
  return out;
}

/// One "Trending Now" / "Best Sellers" style row.
class ShopAlgorithmSection {
  final String id;
  final String label;
  final List<Map<String, dynamic>> products;
  const ShopAlgorithmSection(this.id, this.label, this.products);
}

/// The six horizontal rows above the main grid.
///
/// Each takes the top 10 for its algorithm, seed-shuffles them, and — the
/// web's quirk — pads a 1-3 item row back up to 4 by repeating entries, so a
/// thin section still fills the row rather than looking broken. Empty sections
/// are dropped and `recommended` is forced first.
List<ShopAlgorithmSection> buildAlgorithmSections(
  List<Map<String, dynamic>> products,
  String seed, {
  String query = '',
}) {
  final sections = <ShopAlgorithmSection>[];
  for (final id in ShopAlgorithm.ordered) {
    final ranked = shuffleItemsWithSeed(
      rankMarketProducts(products, id, query: query).take(10).toList(),
      '$seed:$id',
      (p) => '${p['id'] ?? ''}',
    );
    if (ranked.isEmpty) continue;
    final padded = ranked.length < 4
        ? List<Map<String, dynamic>>.generate(
            4,
            (i) => ranked[i % ranked.length],
          )
        : ranked;
    sections.add(ShopAlgorithmSection(id, ShopAlgorithm.labels[id]!, padded));
  }
  // `recommended` leads; the rest keep declaration order. Built by partition
  // rather than a comparator — "recommended wins, everything else ties" is not
  // a valid total order and List.sort is free to misbehave on it.
  return [
    ...sections.where((s) => s.id == ShopAlgorithm.recommended),
    ...sections.where((s) => s.id != ShopAlgorithm.recommended),
  ];
}

/// Countries a product ships to, lowercased. Mirrors the web
/// `getProductCountryValues` closely enough for the filter: any product that
/// ships worldwide passes every country filter.
Set<String> productCountryValues(Map p, dynamic Function(dynamic) safeParse) {
  final out = <String>{};
  void add(dynamic v) {
    final s = _s(v).trim().toLowerCase();
    if (s.isNotEmpty) out.add(s);
  }

  final info =
      safeParse(p['shipping_info']) ??
      safeParse(p['shipping_data']) ??
      safeParse(p['shipping_rates']);
  if (info is Map) {
    if (info['unified'] == true) add('worldwide');
    final rates = info['rates'] ?? info['shipping_rates'];
    if (rates is List) {
      for (final r in rates) {
        add(r is Map ? r['country'] : r);
      }
    }
    final listed =
        info['available_countries'] ?? info['countries'] ?? info['region'];
    if (listed is String) {
      for (final c in listed.split(',')) {
        add(c);
      }
    } else if (listed is List) {
      for (final c in listed) {
        add(c is Map ? (c['country'] ?? c['name']) : c);
      }
    }
  }
  add(p['country']);
  if (out.isEmpty) out.add('worldwide');
  return out;
}
