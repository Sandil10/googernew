import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// 1m · Categories
class CategoriesScreen extends StatelessWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        title: const Text('Categories', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _categoryTile('Gadgets', Ionicons.laptop_outline),
          _categoryTile('Food & Beverages', Ionicons.restaurant_outline),
          _categoryTile('Apparel', Ionicons.shirt_outline),
          _categoryTile('Home & Garden', Ionicons.home_outline),
          _categoryTile('Electronics', Ionicons.phone_portrait_outline),
          _categoryTile('Books & Media', Ionicons.book_outline),
        ],
      ),
    );
  }

  Widget _categoryTile(String name, IconData icon) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.bg2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: Row(
        children: [
          Icon(icon, size: 24, color: AppColors.accentPurple),
          const SizedBox(width: 16),
          Expanded(
            child: Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
          ),
          const Icon(Icons.arrow_forward_ios, size: 16, color: AppColors.textGray500),
        ],
      ),
    );
  }
}
