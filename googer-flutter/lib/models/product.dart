import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';

class Product {
  final String title;
  final String price;
  final String tag;
  final IconData icon;
  final List<Color> bgGradient;
  final String? imageUrl;
  final String? seller;

  const Product({
    required this.title,
    required this.price,
    required this.tag,
    required this.icon,
    required this.bgGradient,
    this.imageUrl,
    this.seller,
  });

  /// Builds a Product from a backend `/market/products` item.
  factory Product.fromJson(Map<String, dynamic> j, {List<Color>? bgGradient}) {
    String s(List<String> keys, [String fallback = '']) {
      for (final k in keys) {
        final v = j[k];
        if (v != null && '$v'.isNotEmpty) return '$v';
      }
      return fallback;
    }

    final img = s(['image_url', 'main_image', 'thumbnail_url', 'media_url']);
    final promo = s(['promo_price']);
    final price = s(['price'], '0');

    // Show a discount tag when a promo price is present and lower.
    String tag = '';
    final p = double.tryParse(price);
    final pr = double.tryParse(promo);
    if (p != null && pr != null && pr > 0 && pr < p) {
      final pct = ((1 - pr / p) * 100).round();
      tag = '−$pct%';
    }

    return Product(
      title: s(['title', 'name'], 'Product'),
      price: (pr != null && pr > 0) ? promo : price,
      tag: tag,
      icon: Ionicons.pricetag_outline,
      bgGradient: bgGradient ?? const [Color(0xFF374151), Color(0xFF0A0A0A)],
      imageUrl: img.isEmpty ? null : img,
      seller: s(['username', 'owner_username']),
    );
  }
}

final List<Product> demoProducts = [
  Product(title: 'Ginger Candy Pack', price: '120', tag: 'New', icon: Ionicons.nutrition_outline, bgGradient: [Color(0xFF7C2D12), Color(0xFF1A0A05)]),
  Product(title: 'Brass Lamp', price: '2,400', tag: '', icon: Ionicons.bulb_outline, bgGradient: [Color(0xFF78350F), Color(0xFF1A1206)]),
  Product(title: 'Cold Brew Kit', price: '850', tag: '−20%', icon: Ionicons.cafe_outline, bgGradient: [Color(0xFF374151), Color(0xFF0A0A0A)]),
  Product(title: 'Linen Tote', price: '640', tag: '', icon: Ionicons.bag_handle_outline, bgGradient: [Color(0xFF164E63), Color(0xFF08181C)]),
];
