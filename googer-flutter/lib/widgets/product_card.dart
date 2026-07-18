import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import 'kit.dart';
import 'product_popup.dart';

class ProductCard extends StatefulWidget {
  final Product product;
  const ProductCard(this.product);

  @override
  State<ProductCard> createState() => _ProductCardState();
}

class _ProductCardState extends State<ProductCard> {
  late bool liked = widget.product.liked;
  late int likes = widget.product.likes;

  Product get product => widget.product;

  String _fmt(int n) => n > 999 ? "${(n / 1000).toStringAsFixed(1)}k" : "$n";

  @override
  Widget build(BuildContext context) {
    final sale = product.oldPrice != null && product.oldPrice! > product.price
        ? "+${(100 - product.price / product.oldPrice! * 100).round()}%"
        : null;
    return GestureDetector(
      onTap: () => showProductPopup(context, product),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF141414),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: GoogerColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 8, 6),
            child: Row(children: [
              GoogerAvatar(url: null, name: product.seller, size: 24),
              const SizedBox(width: 7),
              Expanded(
                child: Text(product.seller,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: Colors.white)),
              ),
              const Icon(Icons.more_vert, size: 18, color: Colors.white70),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Stack(children: [
                AspectRatio(
                  aspectRatio: 0.95,
                  child: product.image.isEmpty
                      ? Container(color: Colors.black)
                      : Image.network(product.image,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              Container(color: Colors.black)),
                ),
                if (sale != null)
                  Positioned(
                    right: 8,
                    bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF052F1F),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF0D8F52)),
                      ),
                      child: Text(sale,
                          style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              color: Color(0xFF00FF88))),
                    ),
                  ),
              ]),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(product.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        color: Colors.white)),
                const Spacer(),
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  const Padding(
                    padding: EdgeInsets.only(bottom: 3),
                    child: Text("R",
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w900,
                            color: GoogerColors.dim)),
                  ),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(product.price.toStringAsFixed(0),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 25,
                            fontWeight: FontWeight.w900,
                            color: Colors.white)),
                  ),
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.10),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white24),
                    ),
                    child: const Icon(Icons.shopping_cart_outlined,
                        size: 18, color: Colors.white),
                  ),
                ]),
                const SizedBox(height: 8),
                Row(children: [
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        liked = !liked;
                        likes += liked ? 1 : -1;
                      });
                      Api.toggleProductLike(product.id);
                    },
                    child: Row(children: [
                      Icon(liked ? Icons.favorite : Icons.favorite_border,
                          size: 15,
                          color: liked ? GoogerColors.red : Colors.white),
                      if (likes > 0) ...[
                        const SizedBox(width: 3),
                        Text(_fmt(likes),
                            style: const TextStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w800,
                                color: Colors.white)),
                      ],
                    ]),
                  ),
                  const SizedBox(width: 12),
                  const Icon(Icons.remove_red_eye_outlined,
                      size: 14, color: Colors.white),
                  const SizedBox(width: 3),
                  Text(_fmt(product.views),
                      style: const TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          color: Colors.white)),
                  const SizedBox(width: 12),
                  const Icon(Icons.mode_comment_outlined,
                      size: 13, color: Colors.white),
                  const SizedBox(width: 3),
                  Text(_fmt(product.comments),
                      style: const TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          color: Colors.white)),
                  const Spacer(),
                  const Icon(Icons.share_outlined, size: 14, color: Colors.white),
                ]),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}
