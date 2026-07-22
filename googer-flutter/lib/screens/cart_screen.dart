import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

class CartItemData {
  final String title;
  final String price;
  final int qty;
  final IconData icon;
  final List<Color> bg;
  const CartItemData({required this.title, required this.price, required this.qty, required this.icon, required this.bg});
}

final demoCartItems = [
  CartItemData(title: 'Ginger Candy Pack', price: '120', qty: 2, icon: Ionicons.nutrition_outline, bg: [const Color(0xFF7C2D12), const Color(0xFF1A0A05)]),
  CartItemData(title: 'Cold Brew Kit', price: '850', qty: 1, icon: Ionicons.cafe_outline, bg: [const Color(0xFF374151), const Color(0xFF0A0A0A)]),
];

/// 1l · Cart / Checkout
class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        toolbarHeight: 52,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 16, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text('Cart (2)', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          ...demoCartItems.map((ci) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
                  child: Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: ci.bg),
                        ),
                        alignment: Alignment.center,
                        child: Icon(ci.icon, size: 22, color: Colors.white.withOpacity(0.85)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(ci.title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Image.asset('assets/images/rupee.png', width: 13, height: 7, fit: BoxFit.contain),
                                const SizedBox(width: 5),
                                Text(ci.price, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Colors.white)),
                              ],
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(9999), border: Border.all(color: AppColors.inputBorder)),
                        child: Row(
                          children: [
                            const Text('−', style: TextStyle(fontSize: 11, color: Colors.white)),
                            Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text('${ci.qty}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white))),
                            const Text('+', style: TextStyle(fontSize: 11, color: Colors.white)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              )),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
            child: Column(
              children: [
                _summaryRow('Subtotal', '970'),
                const SizedBox(height: 8),
                _summaryRow('Delivery', '40'),
                const SizedBox(height: 10),
                const Divider(height: 1, color: AppColors.inputBorder),
                const SizedBox(height: 10),
                _summaryRow('Total', '1,010', isBold: true),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 11),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
              ),
              child: const Text('Proceed to Checkout', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.black)),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _summaryRow(String label, String amount, {bool isBold = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: 12, color: AppColors.textGray400, fontWeight: isBold ? FontWeight.w600 : FontWeight.w500)),
        Row(
          children: [
            Image.asset('assets/images/rupee.png', width: 13, height: 7, fit: BoxFit.contain),
            const SizedBox(width: 6),
            Text(amount, style: TextStyle(fontSize: 12, fontWeight: isBold ? FontWeight.w700 : FontWeight.w600, color: Colors.white)),
          ],
        ),
      ],
    );
  }
}
