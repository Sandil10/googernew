import 'package:flutter/material.dart';

import '../services/app_session.dart';
import '../services/googer_api.dart';
import '../theme/app_colors.dart';
import '../widgets/section_card.dart';

class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  int _subTab = 0;
  late Future<List<ProductItem>> _productsFuture;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _productsFuture = SessionScope.of(context).api.getProducts();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: Colors.white,
      backgroundColor: AppColors.surface,
      onRefresh: () async => setState(() => _productsFuture = SessionScope.of(context).api.getProducts()),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
                  decoration: BoxDecoration(color: AppColors.surface, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(999)),
                  child: const Row(children: [
                    Icon(Icons.search, size: 14, color: AppColors.textSecondary),
                    SizedBox(width: 6),
                    Text('Search Goog', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                  ]),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 33,
                height: 33,
                decoration: BoxDecoration(color: AppColors.surface, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.tune, size: 15, color: Color(0xFFC7C7CD)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _tabItem('Market', 0),
              const SizedBox(width: 16),
              _tabItem('My Listings', 1),
              const SizedBox(width: 16),
              _tabItem('My Orders', 2),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 12),
          if (_subTab == 0) _marketBody(),
          if (_subTab == 1) const _StateMessage(text: 'Your real listings will appear here when the listings endpoint is enabled for mobile.'),
          if (_subTab == 2) const _StateMessage(text: 'Your real orders will appear here when the orders endpoint is enabled for mobile.'),
        ],
      ),
    );
  }

  Widget _tabItem(String label, int index) {
    final active = _subTab == index;
    return GestureDetector(
      onTap: () => setState(() => _subTab = index),
      child: Container(
        padding: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: active ? AppColors.textPrimary : Colors.transparent, width: 2))),
        child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: active ? AppColors.textPrimary : AppColors.textMuted)),
      ),
    );
  }

  Widget _marketBody() {
    return FutureBuilder<List<ProductItem>>(
      future: _productsFuture,
      builder: (context, snapshot) {
        final products = snapshot.data ?? const <ProductItem>[];
        final categories = <String>{'All', ...products.map((p) => p.category).where((c) => c.trim().isNotEmpty)}.toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 34,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) => PillChip(label: categories[i], selected: i == 0),
              ),
            ),
            const SizedBox(height: 14),
            const Text('RECOMMENDED FOR YOU', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: AppColors.textSecondary)),
            const SizedBox(height: 10),
            if (snapshot.connectionState == ConnectionState.waiting)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: Colors.white)))
            else if (snapshot.hasError)
              _StateMessage(text: snapshot.error.toString().replaceFirst('Exception: ', ''))
            else if (products.isEmpty)
              const _StateMessage(text: 'No real products found yet.')
            else
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 0.62,
                children: products.map((product) => ProductCard(product: product)).toList(),
              ),
          ],
        );
      },
    );
  }
}

class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product});

  final ProductItem product;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(color: AppColors.surface, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(14)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color(0xFFFF8A3D), Color(0xFFD8482A)])),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(product.seller, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                      Text(product.category, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 8.5, color: AppColors.textMuted)),
                    ],
                  ),
                ),
                const Icon(Icons.more_vert, size: 16, color: Color(0xFFF4F4F5)),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (product.imageUrl.isNotEmpty)
                      Image.network(product.imageUrl, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: const Color(0xFF1A1A1D)))
                    else
                      Container(
                        color: const Color(0xFF1A1A1D),
                        alignment: Alignment.center,
                        child: const Icon(Icons.image_not_supported_outlined, color: AppColors.textFaint),
                      ),
                    Positioned(
                      bottom: 6,
                      right: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(color: const Color(0xFF0F2A1A), borderRadius: BorderRadius.circular(7)),
                        child: const Text('LIVE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.accentGreen)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                Text(product.price, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(children: [
                      const Icon(Icons.favorite_border, size: 12, color: AppColors.accentRed),
                      Text(' ${product.likes}  ', style: const TextStyle(fontSize: 9.5, color: AppColors.accentRed)),
                      const Icon(Icons.remove_red_eye_outlined, size: 12, color: AppColors.textSecondary),
                      Text(' ${product.views}', style: const TextStyle(fontSize: 9.5, color: AppColors.textSecondary)),
                    ]),
                    Container(
                      width: 28,
                      height: 28,
                      decoration: const BoxDecoration(color: AppColors.surfaceRaised, shape: BoxShape.circle),
                      child: const Icon(Icons.shopping_cart_outlined, size: 13, color: Color(0xFFC7C7CD)),
                    ),
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

class _StateMessage extends StatelessWidget {
  const _StateMessage({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      color: AppColors.surface,
      child: Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
    );
  }
}
