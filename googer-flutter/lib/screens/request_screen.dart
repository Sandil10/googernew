import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Request — request coins from the admin/topup desk.
class RequestScreen extends StatefulWidget {
  const RequestScreen({super.key});

  @override
  State<RequestScreen> createState() => _RequestScreenState();
}

class _RequestScreenState extends State<RequestScreen> {
  final _amountCtrl = TextEditingController();

  static const _requests = [
    ['500', 'Verified', '12 Jun 2026'],
    ['1,000', 'Pending', '10 Jun 2026'],
    ['250', 'Rejected', '02 Jun 2026'],
  ];

  @override
  void dispose() {
    _amountCtrl.dispose();
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
        title: const Text('Request', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.inputBorder)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Coin Request', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                const SizedBox(height: 4),
                const Text('Request coins to be added to your wallet.', style: TextStyle(fontSize: 11, color: AppColors.textGray500)),
                const SizedBox(height: 14),
                TextField(
                  controller: _amountCtrl,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(fontSize: 13, color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Enter amount',
                    hintStyle: const TextStyle(fontSize: 13, color: AppColors.textGray600),
                    filled: true,
                    fillColor: AppColors.bg2,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    prefixIcon: const Icon(Ionicons.disc_outline, size: 18, color: AppColors.textGray500),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.inputBorder)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.purpleBorder)),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {},
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accentPurple,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                    ),
                    child: const Text('Send Request', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const Padding(
            padding: EdgeInsets.only(left: 4, bottom: 10),
            child: Text('My Requests', style: TextStyle(fontSize: 12, color: AppColors.textGray400, fontWeight: FontWeight.w600)),
          ),
          for (final r in _requests) _requestRow(r[0], r[1], r[2]),
        ],
      ),
    );
  }

  Widget _requestRow(String amount, String status, String date) {
    final color = status == 'Verified'
        ? AppColors.successGreen
        : status == 'Rejected'
            ? AppColors.likeRed
            : const Color(0xFFFBBF24);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.bg3, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.inputBorder)),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), borderRadius: BorderRadius.circular(10)),
            child: const Icon(Ionicons.arrow_down_outline, size: 18, color: AppColors.textGray300),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Coin Request $amount', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(date, style: const TextStyle(fontSize: 10.5, color: AppColors.textGray500)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(6), border: Border.all(color: color.withOpacity(0.25))),
            child: Text(status, style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w600, color: color)),
          ),
        ],
      ),
    );
  }
}
