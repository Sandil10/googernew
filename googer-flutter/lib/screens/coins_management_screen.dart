import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Coins Management — send coins to another user, view pending requests.
class CoinsManagementScreen extends StatefulWidget {
  const CoinsManagementScreen({super.key});

  @override
  State<CoinsManagementScreen> createState() => _CoinsManagementScreenState();
}

class _CoinsManagementScreenState extends State<CoinsManagementScreen> {
  final _searchCtrl = TextEditingController();
  final _amountCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  static const _pending = [
    ['Ravi Perera', 'GOOG-48201', '250.00'],
    ['Nimal Silva', 'GOOG-39117', '500.00'],
  ];

  @override
  void dispose() {
    _searchCtrl.dispose();
    _amountCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 18, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text('Coins Management', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
            child: Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Your Balance', style: TextStyle(fontSize: 11, color: AppColors.textGray500, fontWeight: FontWeight.w500)),
                      SizedBox(height: 6),
                      Text('12,840.00', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white)),
                    ],
                  ),
                ),
                Image.asset('assets/images/coin.png', width: 34, height: 34, fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(Ionicons.disc_outline, size: 28, color: AppColors.purpleText)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _label('Recipient'),
          TextField(
            controller: _searchCtrl,
            style: const TextStyle(fontSize: 13, color: Colors.white),
            decoration: _inputDecoration('Search by ID or username', Ionicons.search_outline),
          ),
          const SizedBox(height: 16),
          _label('Amount'),
          TextField(
            controller: _amountCtrl,
            keyboardType: TextInputType.number,
            style: const TextStyle(fontSize: 13, color: Colors.white),
            decoration: _inputDecoration('0.00', Ionicons.disc_outline),
          ),
          const SizedBox(height: 16),
          _label('Note (optional)'),
          TextField(
            controller: _noteCtrl,
            style: const TextStyle(fontSize: 13, color: Colors.white),
            decoration: _inputDecoration('Add a note', Ionicons.chatbox_ellipses_outline),
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accentPurple,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
              ),
              child: const Text('Send Coins', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
            ),
          ),
          const SizedBox(height: 24),
          _label('Pending Requests'),
          const SizedBox(height: 4),
          for (final p in _pending) _pendingRow(p[0], p[1], p[2]),
        ],
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(left: 2, bottom: 8),
        child: Text(text.toUpperCase(), style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: AppColors.textGray400, letterSpacing: 0.5)),
      );

  InputDecoration _inputDecoration(String hint, IconData icon) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(fontSize: 13, color: AppColors.textGray600),
        filled: true,
        fillColor: AppColors.bg2,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        prefixIcon: Icon(icon, size: 18, color: AppColors.textGray500),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.inputBorder)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.purpleBorder)),
      );

  Widget _pendingRow(String name, String id, String amount) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.inputBorder)),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), shape: BoxShape.circle),
            child: const Icon(Ionicons.person_outline, size: 18, color: AppColors.textGray300),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(id, style: const TextStyle(fontSize: 10.5, color: AppColors.textGray500, fontFamily: 'monospace')),
              ],
            ),
          ),
          Row(
            children: [
              Image.asset('assets/images/coin.png', width: 16, height: 16, fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Icon(Ionicons.disc_outline, size: 14, color: AppColors.purpleText)),
              const SizedBox(width: 5),
              Text(amount, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
            ],
          ),
        ],
      ),
    );
  }
}
