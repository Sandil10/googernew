import 'package:flutter/material.dart';
import '../data/mock.dart';
import '../theme.dart';
import '../widgets/kit.dart';
import '../widgets/product_card.dart';

/* ───────────── Product detail ───────────── */

class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen();

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  int qty = 1;

  @override
  Widget build(BuildContext context) {
    final id = ModalRoute.of(context)?.settings.arguments as int? ?? 1;
    final product = products.firstWhere((p) => p.id == id, orElse: () => products.first);
    final related = products.where((p) => p.id != product.id).take(2).toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(product.category.toUpperCase(),
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 1.5, color: GoogerColors.dim)),
        actions: const [Padding(padding: EdgeInsets.only(right: 14), child: Icon(Icons.share_outlined, size: 19))],
      ),
      body: ListView(padding: const EdgeInsets.only(bottom: 110), children: [
        Stack(children: [
          AspectRatio(
            aspectRatio: 1,
            child: Image.network(product.image, fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(color: GoogerColors.soft6)),
          ),
          if (product.oldPrice != null)
            Positioned(
              bottom: 14,
              left: 14,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: GoogerColors.red, borderRadius: BorderRadius.circular(999)),
                child: Text("-${(100 - product.price / product.oldPrice! * 100).round()}% OFF",
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.white)),
              ),
            ),
        ]),
        Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(product.title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600, height: 1.3, color: GoogerColors.text)),
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.star, size: 14, color: GoogerColors.amber),
              const SizedBox(width: 4),
              Text("${product.rating}", style: const TextStyle(fontSize: 12, color: GoogerColors.muted)),
              Text("  ·  ${product.sold} sold", style: const TextStyle(fontSize: 12, color: GoogerColors.dim)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: GoogerColors.soft6,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: GoogerColors.line),
                ),
                child: Row(children: [
                  const Icon(Icons.storefront_outlined, size: 12, color: GoogerColors.muted),
                  const SizedBox(width: 5),
                  Text(product.seller, style: const TextStyle(fontSize: 10.5, color: GoogerColors.muted)),
                ]),
              ),
            ]),
            const SizedBox(height: 14),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text("R ${product.price.toStringAsFixed(0)}",
                  style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600, letterSpacing: -0.5, color: GoogerColors.text)),
              if (product.oldPrice != null) ...[
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text("R ${product.oldPrice!.toStringAsFixed(0)}",
                      style: const TextStyle(fontSize: 14, color: GoogerColors.dim, decoration: TextDecoration.lineThrough)),
                ),
              ],
            ]),
            const SizedBox(height: 16),
            GoogerCard(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Overline("Description", color: GoogerColors.dim),
                const SizedBox(height: 8),
                Text(product.description, style: const TextStyle(fontSize: 13, height: 1.55, color: GoogerColors.muted)),
              ]),
            ),
            const SizedBox(height: 16),
            Row(children: [
              const Text("Quantity", style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
              const Spacer(),
              GestureDetector(
                onTap: () => setState(() => qty = qty > 1 ? qty - 1 : 1),
                child: const IconChip(Icons.remove, size: 32, color: GoogerColors.text),
              ),
              SizedBox(
                width: 44,
                child: Text("$qty",
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: GoogerColors.text)),
              ),
              GestureDetector(
                onTap: () => setState(() => qty++),
                child: const IconChip(Icons.add, size: 32, color: GoogerColors.text),
              ),
            ]),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: GoogerColors.sky.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: GoogerColors.sky.withValues(alpha: 0.2)),
              ),
              child: Row(children: [
                const Icon(Icons.link, size: 18, color: GoogerColors.sky),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                    Text("Resell & Earn", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                    SizedBox(height: 2),
                    Text("Share your reseller link and earn commission on every sale.",
                        style: TextStyle(fontSize: 10.5, height: 1.4, color: GoogerColors.muted)),
                  ]),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: GoogerColors.sky.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: GoogerColors.sky.withValues(alpha: 0.3)),
                  ),
                  child: const Text("Get Link", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: GoogerColors.sky)),
                ),
              ]),
            ),
            const SizedBox(height: 20),
            const SectionTitle(title: "You may also like"),
            Row(
              children: related
                  .map((p) => Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(right: 12),
                          child: ProductCard(p),
                        ),
                      ))
                  .toList(),
            ),
          ]),
        ),
      ]),
      bottomSheet: Container(
        decoration: const BoxDecoration(
          color: GoogerColors.nav,
          border: Border(top: BorderSide(color: GoogerColors.border)),
        ),
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
        child: SafeArea(
          top: false,
          child: Row(children: [
            GestureDetector(
              onTap: () => Navigator.pushNamed(context, "/chat", arguments: conversations.first.username),
              child: const IconChip(Icons.chat_bubble_outline, size: 46, color: GoogerColors.text),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: () => Navigator.pushNamed(context, "/cart"),
                child: const Text("Add to Cart"),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: FilledButton(
                onPressed: () => Navigator.pushNamed(context, "/wallet/pay"),
                child: Text("Buy · R ${(product.price * qty).toStringAsFixed(0)}"),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/* ───────────── Add product ───────────── */

class AddProductScreen extends StatefulWidget {
  const AddProductScreen();

  @override
  State<AddProductScreen> createState() => _AddProductScreenState();
}

class _AddProductScreenState extends State<AddProductScreen> {
  String? category;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Add Product")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Container(
          padding: const EdgeInsets.symmetric(vertical: 34),
          decoration: BoxDecoration(
            color: GoogerColors.soft,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GoogerColors.line),
          ),
          child: Column(children: const [
            Icon(Icons.photo_library_outlined, size: 30, color: GoogerColors.faint),
            SizedBox(height: 8),
            Text("Add photos or video", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.muted)),
            SizedBox(height: 3),
            Text("Up to 6 images · first image is the cover", style: TextStyle(fontSize: 10, color: GoogerColors.dim)),
          ]),
        ),
        const SizedBox(height: 16),
        const Overline("Product Title"),
        const SizedBox(height: 6),
        const TextField(decoration: InputDecoration(hintText: "What are you selling?"), style: TextStyle(fontSize: 14, color: GoogerColors.text)),
        const SizedBox(height: 14),
        Row(children: const [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Overline("Price (R)"),
              SizedBox(height: 6),
              TextField(keyboardType: TextInputType.number, decoration: InputDecoration(hintText: "0.00"), style: TextStyle(fontSize: 14, color: GoogerColors.text)),
            ]),
          ),
          SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Overline("Stock"),
              SizedBox(height: 6),
              TextField(keyboardType: TextInputType.number, decoration: InputDecoration(hintText: "1"), style: TextStyle(fontSize: 14, color: GoogerColors.text)),
            ]),
          ),
        ]),
        const SizedBox(height: 14),
        const Overline("Category"),
        const SizedBox(height: 8),
        ChoiceChipRow(
          options: categories.map((c) => c.name).toList(),
          selected: category ?? "",
          onSelect: (c) => setState(() => category = c),
        ),
        const SizedBox(height: 14),
        const Overline("Description"),
        const SizedBox(height: 6),
        const TextField(
          maxLines: 4,
          decoration: InputDecoration(hintText: "Describe condition, shipping, warranty…"),
          style: TextStyle(fontSize: 14, color: GoogerColors.text),
        ),
        const SizedBox(height: 18),
        FilledButton(onPressed: () => Navigator.pop(context), child: const Text("Publish Product")),
      ]),
    );
  }
}

/* ───────────── Cart ───────────── */

class CartScreen extends StatefulWidget {
  const CartScreen();

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  final items = <(Product, int)>[(products[0], 1), (products[3], 2)];

  @override
  Widget build(BuildContext context) {
    final subtotal = items.fold<double>(0, (sum, e) => sum + e.$1.price * e.$2);
    return Scaffold(
      appBar: AppBar(title: Text("Cart · ${items.length} items")),
      body: items.isEmpty
          ? const EmptyState(icon: Icons.shopping_cart_outlined, title: "Your cart is empty", subtitle: "Browse the shop to add products.")
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 140),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final (p, qty) = items[i];
                return GoogerCard(
                  padding: const EdgeInsets.all(12),
                  child: Row(children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(p.image, width: 70, height: 70, fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(width: 70, height: 70, color: GoogerColors.soft6)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(p.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 12.5, height: 1.3, color: GoogerColors.text)),
                        Text(p.seller, style: const TextStyle(fontSize: 10, color: GoogerColors.dim)),
                        const SizedBox(height: 4),
                        Text("R ${p.price.toStringAsFixed(0)}",
                            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                      ]),
                    ),
                    Column(children: [
                      GestureDetector(
                        onTap: () => setState(() => items[i] = (p, qty + 1)),
                        child: const IconChip(Icons.add, size: 26, color: GoogerColors.text),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        child: Text("$qty", style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                      ),
                      GestureDetector(
                        onTap: () => setState(() {
                          if (qty == 1) {
                            items.removeAt(i);
                          } else {
                            items[i] = (p, qty - 1);
                          }
                        }),
                        child: IconChip(qty == 1 ? Icons.delete_outline : Icons.remove,
                            size: 26, color: qty == 1 ? GoogerColors.red : GoogerColors.text),
                      ),
                    ]),
                  ]),
                );
              },
            ),
      bottomSheet: items.isEmpty
          ? null
          : Container(
              decoration: const BoxDecoration(
                color: GoogerColors.nav,
                border: Border(top: BorderSide(color: GoogerColors.border)),
              ),
              padding: const EdgeInsets.all(16),
              child: SafeArea(
                top: false,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Row(children: [
                    const Text("Subtotal", style: TextStyle(fontSize: 12.5, color: GoogerColors.muted)),
                    const Spacer(),
                    Rupee(subtotal, size: 16),
                  ]),
                  const SizedBox(height: 12),
                  FilledButton(
                      onPressed: () => Navigator.pushNamed(context, "/wallet/pay"),
                      child: const Text("Checkout with Googer Pay")),
                ]),
              ),
            ),
    );
  }
}

/* ───────────── Categories ───────────── */

class CategoriesScreen extends StatelessWidget {
  const CategoriesScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Categories")),
      body: GridView.builder(
        padding: const EdgeInsets.all(18),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.25,
        ),
        itemCount: categories.length,
        itemBuilder: (_, i) {
          final c = categories[i];
          final count = products.where((p) => p.category == c.name).length;
          return GoogerCard(
            onTap: () => Navigator.pop(context),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              // ignore: non_const_argument_for_const_parameter
              IconChip(IconData(c.icon, fontFamily: "MaterialIcons"), size: 52, color: GoogerColors.text),
              const SizedBox(height: 10),
              Text(c.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: GoogerColors.text)),
              const SizedBox(height: 2),
              Text(count > 0 ? "$count items" : "120+ items", style: const TextStyle(fontSize: 10, color: GoogerColors.dim)),
            ]),
          );
        },
      ),
    );
  }
}
