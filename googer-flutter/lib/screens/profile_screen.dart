import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../widgets/googer_topbar.dart';
import '../widgets/googer_bottom_nav.dart';

/// 1e · Profile
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: const GoogerTopbar(title: 'Googer'),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppColors.bg1,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.borderWhite10, width: 2),
                  boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 25, offset: const Offset(0, 20))],
                ),
                alignment: Alignment.center,
                child: const Text('MK', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: Colors.white)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: const [
                        Text('Mira K.', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white, letterSpacing: -0.2)),
                        SizedBox(width: 5),
                        Icon(Icons.verified, size: 12, color: Color(0xFF3897F0)),
                      ],
                    ),
                    const SizedBox(height: 3),
                    const Text('@mira.k', style: TextStyle(color: AppColors.textGray400, fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _stat('12.4K', 'Googers'),
              const SizedBox(width: 14),
              _stat('218', 'Following'),
            ],
          ),
          const SizedBox(height: 16),
          const Text('selling small-batch snacks on Shop. googing daily.',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: AppColors.textGray200, height: 1.5)),
          const SizedBox(height: 3),
          RichText(
            text: const TextSpan(
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: AppColors.linkBlue),
              children: [TextSpan(text: '#googer '), TextSpan(text: '@rohit_p')],
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: const [
              Icon(Ionicons.link_outline, size: 14, color: AppColors.linkBlue),
              SizedBox(width: 6),
              Text('googer.app/mira.k', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.linkBlue)),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(9999),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: const Text('Subscribe', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.black)),
              ),
              const SizedBox(width: 10),
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: const Icon(Ionicons.share_social_outline, size: 17, color: Colors.white),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Container(
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.borderWhite10))),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.only(bottom: 11),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Colors.white, width: 2))),
                  child: const Text('Products', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
                ),
                const SizedBox(width: 24),
                const Padding(
                  padding: EdgeInsets.only(bottom: 11),
                  child: Text('Googs', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.textGray500)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 0.78,
            children: [
              _productTile('Ginger Candy Pack', '120', Ionicons.nutrition_outline, [const Color(0xFF7C2D12), const Color(0xFF1A0A05)]),
              _productTile('Cold Brew Kit', '850', Ionicons.cafe_outline, [const Color(0xFF374151), const Color(0xFF0A0A0A)]),
            ],
          ),
        ],
      ),
      bottomNavigationBar: GoogerBottomNav(active: GoogerTab.home, onTap: (_) {}),
    );
  }

  Widget _stat(String value, String label) {
    return RichText(
      text: TextSpan(
        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
        children: [
          TextSpan(text: value, style: const TextStyle(color: Colors.white)),
          TextSpan(text: ' $label', style: const TextStyle(color: AppColors.textGray500)),
        ],
      ),
    );
  }

  Widget _productTile(String title, String price, IconData icon, List<Color> gradient) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
      decoration: BoxDecoration(color: AppColors.shopCard, borderRadius: BorderRadius.circular(20)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: gradient),
              ),
              alignment: Alignment.center,
              child: Icon(icon, size: 44, color: Colors.white.withOpacity(0.85)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.textGray200)),
                const SizedBox(height: 5),
                Row(
                  children: [
                    Image.asset('assets/images/rupee.png', width: 15, height: 9, fit: BoxFit.contain),
                    const SizedBox(width: 6),
                    Text(price, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: Colors.white)),
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
