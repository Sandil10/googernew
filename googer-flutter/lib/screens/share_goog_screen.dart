import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// share/goog/[postId] · shared post landing page
class ShareGoogScreen extends StatelessWidget {
  const ShareGoogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1C1917),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1C1917),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 18, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text('Shared Goog', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          OutlinedButton.icon(
            onPressed: () {},
            icon: const Icon(Ionicons.grid_outline, size: 16, color: Colors.white),
            label: const Text('Go to Dashboard',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.4, color: Colors.white)),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AppColors.borderWhite10),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
          const SizedBox(height: 20),
          // Goog card
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
                // Header
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: const BoxDecoration(color: Color(0xFF4C1D95), shape: BoxShape.circle),
                        alignment: Alignment.center,
                        child: const Text('MK', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: Colors.white)),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Mira K.',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
                            Text('@mira.k · 2h',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 11, color: AppColors.textGray500)),
                          ],
                        ),
                      ),
                      const Icon(Ionicons.ellipsis_horizontal, size: 18, color: AppColors.textGray500),
                    ],
                  ),
                ),
                // Body text
                const Padding(
                  padding: EdgeInsets.fromLTRB(14, 0, 14, 14),
                  child: Text(
                      'Small-batch ginger candy drop is live now. Grab yours before it sells out again. #googer #snacks',
                      style: TextStyle(fontSize: 13.5, height: 1.5, color: AppColors.textGray200)),
                ),
                // Media
                AspectRatio(
                  aspectRatio: 4 / 3,
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [const Color(0xFF7C2D12), const Color(0xFF1A0A05)],
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Icon(Ionicons.nutrition_outline, size: 60, color: Colors.white.withOpacity(0.85)),
                  ),
                ),
                // Action bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _action(Ionicons.heart_outline, '1.2K'),
                      _action(Ionicons.chatbubble_outline, '96'),
                      _action(Ionicons.repeat_outline, '32'),
                      _action(Ionicons.share_social_outline, 'Share'),
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

  Widget _action(IconData icon, String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: AppColors.textGray400),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textGray400)),
        ],
      ),
    );
  }
}
