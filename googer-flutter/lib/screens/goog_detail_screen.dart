import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// dashboard/googs/[id] · single trending post detail
class GoogDetailScreen extends StatelessWidget {
  const GoogDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1C1917),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1917),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.chevron_back_outline, size: 18, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text('Goog Details', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF211D1A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [const Color(0xFF4C1D95), const Color(0xFF0A0A0A)],
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Icon(Ionicons.image_outline, size: 56, color: Colors.white.withOpacity(0.5)),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(9999),
                        ),
                        child: const Text('DAILY TRENDING',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.4, color: AppColors.textGray400)),
                      ),
                      const SizedBox(height: 16),
                      const Text('Ginger candy that actually works',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, height: 1.2, color: Colors.white)),
                      const SizedBox(height: 12),
                      const Text(
                          'A small-batch snack drop that sold out in under an hour. Here is the story behind the recipe and how the reseller network helped it reach thousands.',
                          style: TextStyle(fontSize: 13, height: 1.6, color: AppColors.textGray400)),
                      const SizedBox(height: 20),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          _chip(Ionicons.eye_outline, '18.2K views'),
                          _chip(Ionicons.heart_outline, '1.2K likes'),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(9999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppColors.textGray400),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textGray400)),
        ],
      ),
    );
  }
}
