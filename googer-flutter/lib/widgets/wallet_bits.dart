import 'package:flutter/material.dart';
import '../theme/colors.dart';

/// Small pieces shared by the wallet pages, so the balance panel and Googer-ID
/// card stay identical wherever the web repeats them.

/// The Rupieer coin mark, with a drawn fallback so a missing asset never
/// collapses a balance row.
///
/// [size] is the rendered *height*. The artwork is 591x422, so a square box
/// scaled it down to fit the width and left it looking half the size asked
/// for — the box has to carry the asset's own aspect ratio.
class RupeeCoin extends StatelessWidget {
  static const double _aspect = 591 / 422;

  final double size;
  const RupeeCoin({super.key, this.size = 26});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/rupee.png',
      width: size * _aspect,
      height: size,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: const BoxDecoration(
          color: Color(0xFFCA8A04),
          shape: BoxShape.circle,
        ),
        child: Text(
          'R',
          style: TextStyle(
            fontSize: size * 0.6,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

/// Thousands-separated, two decimals — how the web prints every balance.
String formatMoney(double value) {
  final fixed = value.toStringAsFixed(2);
  final parts = fixed.split('.');
  final digits = parts.first.replaceAll('-', '');
  final buffer = StringBuffer(value < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return '$buffer.${parts.last}';
}

/// The white `( My Googer ID - NNNNNN )` header card.
class GoogerIdCard extends StatelessWidget {
  final String googerId;
  const GoogerIdCard({super.key, required this.googerId});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        '( My Googer ID - ${googerId.isEmpty ? "—" : googerId} )',
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: Colors.black,
        ),
      ),
    );
  }
}

class WalletBalanceCard extends StatelessWidget {
  final double amount;
  final String label;
  const WalletBalanceCard({
    super.key,
    required this.amount,
    this.label = 'Total Wallet Balance',
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        children: [
          Text(
            label,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const RupeeCoin(size: 19),
              const SizedBox(width: 10),
              Flexible(
                child: Text(
                  formatMoney(amount),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
