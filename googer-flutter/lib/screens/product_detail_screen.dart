import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// 1j · Product Detail
class ProductDetailScreen extends StatelessWidget {
  const ProductDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 16, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        actions: [
          IconButton(
            icon: const Icon(Ionicons.heart_outline, size: 18, color: Colors.white),
            onPressed: () {},
          ),
        ],
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            width: double.infinity,
            height: 200,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [const Color(0xFF7C2D12), const Color(0xFF1A0A05)],
              ),
            ),
            alignment: Alignment.center,
            child: const Icon(Ionicons.nutrition_outline, size: 80, color: Colors.white),
          ),
          const SizedBox(height: 20),
          const Text('Ginger Candy Pack', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 8),
          Row(
            children: [
              Image.asset('assets/images/rupee.png', width: 16, height: 9, fit: BoxFit.contain),
              const SizedBox(width: 6),
              const Text('120', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
              const SizedBox(width: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.amber.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text('New', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.amber)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Premium ginger candy pack made with natural ingredients. Perfect for gifting or personal enjoyment. Packed with antioxidants and great taste.',
            style: TextStyle(fontSize: 13, color: AppColors.textGray300, height: 1.6),
          ),
          const SizedBox(height: 20),
          const Text('Seller Info', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.bg2,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.inputBorder),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: const BoxDecoration(color: Color(0xFF4C1D95), shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: const Text('MK', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Colors.white)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: const [
                      Text('Mira K.', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
                      Text('12.4K followers', style: TextStyle(fontSize: 10, color: AppColors.textGray500)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(9999),
                  ),
                  child: const Text('Follow', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Ionicons.bag_add_outline),
                  label: const Text('Add to Cart'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: () {},
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accentPurple,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                  ),
                  child: const Text('Buy Now', style: TextStyle(fontWeight: FontWeight.w600, color: Colors.white)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
