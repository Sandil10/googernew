import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../models/product.dart';
import '../services/market_service.dart';

/// 1d · Shop Feed
class ShopFeedScreen extends StatefulWidget {
  const ShopFeedScreen({super.key});

  @override
  State<ShopFeedScreen> createState() => _ShopFeedScreenState();
}

class _ShopFeedScreenState extends State<ShopFeedScreen> {
  static const _categories = ['All', 'Trending', 'Gadgets', 'Food', 'Apparel'];

  List<Product> _products = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final items = await MarketService.products();
      final parsed = <Product>[];
      for (final item in items) {
        if (item is Map<String, dynamic>) parsed.add(Product.fromJson(item));
      }
      if (!mounted) return;
      setState(() {
        _products = parsed;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _products = demoProducts;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final products = _products.isEmpty ? demoProducts : _products;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 20, 12, 0),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.bg2,
              borderRadius: BorderRadius.circular(11),
              border: Border.all(color: AppColors.inputBorder),
            ),
            child: const Row(
              children: [
                Icon(Ionicons.search_outline, size: 15, color: AppColors.textGray600),
                SizedBox(width: 8),
                Text('search 12,481 items', style: TextStyle(fontSize: 12, color: AppColors.textGray600)),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
          child: SizedBox(
            height: 32,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _categories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final active = i == 0;
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: active ? Colors.white : AppColors.shopCard,
                    borderRadius: BorderRadius.circular(9999),
                    border: active ? null : Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    _categories[i],
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                      color: active ? Colors.black : AppColors.textGray300,
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: AppColors.accentPurple))
              : RefreshIndicator(
                  color: AppColors.accentPurple,
                  onRefresh: _load,
                  child: GridView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                    itemCount: products.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.72,
                    ),
                    itemBuilder: (context, i) => _ProductCard(product: products[i]),
                  ),
                ),
        ),
      ],
    );
  }
}

class _ProductCard extends StatelessWidget {
  final Product product;
  const _ProductCard({required this.product});

  Widget _placeholder() {
    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: product.bgGradient),
      ),
      alignment: Alignment.center,
      child: Icon(product.icon, size: 44, color: Colors.white.withOpacity(0.85)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      decoration: BoxDecoration(color: AppColors.shopCard, borderRadius: BorderRadius.circular(20)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: product.imageUrl != null
                      ? Image.network(
                          product.imageUrl!,
                          width: double.infinity,
                          height: double.infinity,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => _placeholder(),
                          loadingBuilder: (ctx, child, progress) =>
                              progress == null ? child : _placeholder(),
                        )
                      : _placeholder(),
                ),
                if (product.tag.isNotEmpty)
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                      decoration: BoxDecoration(color: Colors.black.withOpacity(0.65), borderRadius: BorderRadius.circular(9999)),
                      child: Text(product.tag, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: Colors.white)),
                    ),
                  ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.title, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.textGray200), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Image.asset('assets/images/rupee.png', width: 15, height: 9, fit: BoxFit.contain),
                    const SizedBox(width: 6),
                    Text(product.price, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: Colors.white)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
