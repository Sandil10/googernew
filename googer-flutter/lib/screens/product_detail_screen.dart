import 'package:flutter/material.dart';

import '../api/api.dart';
import '../theme/colors.dart';
import '../widgets/app_back_button.dart';
import 'shop_feed_screen.dart';

/// Public `/product/{shareCode}/{resellerRef?}` entry point.
///
/// The reseller reference is attached to the product before the shared shop
/// quick view opens. CartStore then preserves it through checkout, matching the
/// Next.js product-share route and backend order contract.
class ProductDetailScreen extends StatefulWidget {
  final String shareCode;
  final String resellerRef;

  const ProductDetailScreen({
    super.key,
    required this.shareCode,
    this.resellerRef = '',
  });

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  Map<String, dynamic>? _product;
  String _error = '';
  bool _opened = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final raw = await Api.publicProductByShareCode(widget.shareCode);
    if (!mounted) return;
    if (raw == null) {
      setState(() => _error = 'This product is not available.');
      return;
    }
    final product = Map<String, dynamic>.from(raw);
    final reseller = widget.resellerRef.trim();
    if (reseller.isNotEmpty) {
      product['reseller_ref'] = reseller;
      product['resell_ref'] = reseller;
    }
    setState(() => _product = product);
    WidgetsBinding.instance.addPostFrameCallback((_) => _openProduct());
  }

  Future<void> _openProduct() async {
    final product = _product;
    if (!mounted || product == null || _opened) return;
    _opened = true;
    await showShopProductQuickView(
      context,
      product['id'] ?? product['product_id'],
      fallback: product,
    );
    if (mounted) setState(() => _opened = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        leading: const AppBackButton.appBar(),
      ),
      body: Center(
        child: _error.isNotEmpty
            ? Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _error,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.textGray400,
                    fontSize: 12,
                  ),
                ),
              )
            : _product == null
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : TextButton(
                onPressed: _openProduct,
                child: const Text('VIEW PRODUCT'),
              ),
      ),
    );
  }
}
