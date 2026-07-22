import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Top Up · Bank Transfer — bank details + receipt upload.
class BankTransferScreen extends StatefulWidget {
  const BankTransferScreen({super.key, this.amount = '1000'});

  final String amount;

  @override
  State<BankTransferScreen> createState() => _BankTransferScreenState();
}

class _BankTransferScreenState extends State<BankTransferScreen> {
  String? _fileName;

  static const _fields = [
    ['Account Name', 'I.p.p.c fernando'],
    ['Account Number', '0112755676'],
    ['Bank Branch', 'Commercial Bank'],
    ['Bank Name', 'BOC'],
    ['Branch Code', '12345'],
    ['Shift Code', 'CERWLKX'],
  ];

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
        title: const Text('Bank Details', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.bg3,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.inputBorder),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Image.asset('assets/images/coin.png', width: 34, height: 34, fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Icon(Ionicons.disc_outline, size: 30, color: AppColors.purpleText)),
                const SizedBox(width: 12),
                Text('${widget.amount} Coins', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
              color: AppColors.bg3,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.inputBorder),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [for (final f in _fields) _fieldRow(f[0], f[1])],
            ),
          ),
          const SizedBox(height: 20),
          const Text('Upload Receipt', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: 1.2)),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.bg2,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.inputBorder),
            ),
            child: Row(
              children: [
                ElevatedButton(
                  onPressed: () => setState(() => _fileName = 'receipt.jpg'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
                  ),
                  child: const Text('CHOOSE FILE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.utilityBlue)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(_fileName ?? 'no file selected',
                      style: const TextStyle(fontSize: 11, color: AppColors.textGray500), overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.maybePop(context),
                  style: OutlinedButton.styleFrom(
                    backgroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                    side: BorderSide.none,
                  ),
                  child: const Text('CANCEL', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.black)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: _fileName == null ? null : () {},
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accentPurple,
                    disabledBackgroundColor: AppColors.bg1,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                  ),
                  child: const Text('BUY COINS', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text('Terms', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white, letterSpacing: 1.2)),
          const SizedBox(height: 6),
          const Text(
            'Use only a banking or payment platform that matches your name on Googer.',
            style: TextStyle(fontSize: 11, color: AppColors.textGray500, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _fieldRow(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.inputBorder))),
      child: Row(
        children: [
          Expanded(
            child: Text(label.toUpperCase(),
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.textGray500, letterSpacing: 0.5)),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(value,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
                overflow: TextOverflow.ellipsis, textAlign: TextAlign.right),
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: () {},
            child: const Icon(Ionicons.copy_outline, size: 15, color: AppColors.textGray500),
          ),
        ],
      ),
    );
  }
}
