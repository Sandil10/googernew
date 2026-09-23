import 'dart:math' as math;

import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../api/api.dart';
import 'download_bytes.dart';

class WalletReceiptDetail {
  final String label;
  final String value;

  const WalletReceiptDetail(this.label, this.value);
}

class WalletReceipt {
  final String headerTitle;
  final String title;
  final String transactionId;
  final String amount;
  final List<WalletReceiptDetail> details;
  final Map<String, dynamic> transaction;

  const WalletReceipt({
    required this.headerTitle,
    required this.title,
    required this.transactionId,
    required this.amount,
    required this.details,
    required this.transaction,
  });
}

double _number(dynamic value) => double.tryParse('${value ?? 0}') ?? 0;

String _account(dynamic id, dynamic username) =>
    'ID ${id ?? 'N/A'} (${('${username ?? 'Unknown'}').trim().isEmpty ? 'Unknown' : username})';

bool isGoogerCommissionWalletTransaction(Map<String, dynamic> tx) {
  final type = '${tx['type'] ?? ''}'.toLowerCase().replaceAll(
    'comission',
    'commission',
  );
  final note = '${tx['note'] ?? ''}';
  return type == 'commission_hold' &&
      RegExp(r'googer\s+comm?ission', caseSensitive: false).hasMatch(note);
}

String _status(Map<String, dynamic> tx) {
  final type = '${tx['type'] ?? ''}'.toLowerCase().replaceAll(
    'comission',
    'commission',
  );
  final status = '${tx['status'] ?? 'pending'}'.toLowerCase();
  final note = '${tx['note'] ?? ''}'.toLowerCase();
  if (type == 'request' || type == 'sell') {
    return status == 'accepted' || status == 'completed'
        ? 'Accepted'
        : 'Pending';
  }
  if (type == 'order_hold' && note.contains('manual payment')) {
    if (status == 'completed') return 'Paid';
    if (status == 'pending') return 'Pending';
  }
  return switch (status) {
    'accepted' => 'Accepted',
    'completed' => 'Completed',
    'rejected' => 'Rejected',
    'cancelled' => 'Cancelled',
    _ =>
      status.isEmpty
          ? 'Pending'
          : '${status[0].toUpperCase()}${status.substring(1)}',
  };
}

DateTime? _walletReceiptLocalDate(dynamic value) =>
    Api.parseServerTime(value)?.toLocal();

String _walletReceiptZone(DateTime date) {
  final offset = date.timeZoneOffset;
  final sign = offset.isNegative ? '-' : '+';
  final offsetMinutes = offset.inMinutes.abs();
  final hour = (offsetMinutes ~/ 60).toString();
  final minute = (offsetMinutes % 60).toString().padLeft(2, '0');
  return 'GMT$sign$hour:$minute';
}

String _walletReceiptDateCore(DateTime date) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
  final amPm = date.hour < 12 ? 'am' : 'pm';
  return '${date.day.toString().padLeft(2, '0')} '
      '${months[date.month - 1]} ${date.year}, '
      '${hour.toString().padLeft(2, '0')}:'
      '${date.minute.toString().padLeft(2, '0')}:'
      '${date.second.toString().padLeft(2, '0')} $amPm';
}

String formatWalletReceiptDateTime(dynamic value) {
  final date = _walletReceiptLocalDate(value);
  if (date == null) return 'Invalid date and time';
  return '${_walletReceiptDateCore(date)} ${_walletReceiptZone(date)}';
}

String formatWalletHistoryDateTime(dynamic value) {
  final date = _walletReceiptLocalDate(value);
  if (date == null) return 'Invalid date and time';
  return '${_walletReceiptDateCore(date).replaceFirst(',', ' |')}\n'
      '${_walletReceiptZone(date)}';
}

int _hashString(String value) {
  var hash = 0;
  for (final unit in value.codeUnits) {
    hash = ((hash << 5) - hash + unit).toSigned(32);
  }
  return hash.abs();
}

String _base62(int value) {
  const alphabet =
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (value == 0) return '0';
  var current = value;
  var encoded = '';
  while (current > 0) {
    encoded = alphabet[current % alphabet.length] + encoded;
    current = current ~/ alphabet.length;
  }
  return encoded;
}

String _displayTransactionId(Map<String, dynamic> tx) {
  final provided = '${tx['transaction_id'] ?? ''}'.trim();
  if (provided.isNotEmpty) return provided;
  final raw = '${tx['order_id'] ?? tx['id'] ?? ''}';
  final manual =
      '${tx['type'] ?? ''}'.toLowerCase() == 'order_hold' &&
      RegExp(
        'manual payment',
        caseSensitive: false,
      ).hasMatch('${tx['note'] ?? ''}');
  if (manual) {
    final normalized = raw.replaceAll(RegExp(r'\D'), '').trim();
    final seed = normalized.isEmpty ? '0' : normalized;
    final digits =
        '${_hashString('manual:$seed')}$seed'
                '${_hashString('manual:receipt:$seed')}'
            .replaceAll(RegExp(r'\D'), '');
    return digits.substring(0, math.min(10, digits.length)).padRight(10, '0');
  }
  final normalized = raw.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '').trim();
  if (normalized.isEmpty) return 'G35hfSj5g7';
  final body = normalized.replaceFirst(RegExp(r'^[gG]'), '');
  if (RegExp('[A-Za-z]').hasMatch(body) && RegExp(r'\d').hasMatch(body)) {
    return 'G$body';
  }
  final seed = body.isEmpty ? '0' : body;
  var mixed =
      '${_base62(_hashString('googer:$seed'))}$seed'
              '${_base62(_hashString('wallet:$seed'))}'
          .replaceAll(RegExp(r'[^a-zA-Z0-9]'), '');
  if (!RegExp('[A-Za-z]').hasMatch(mixed)) mixed += 'hfSj';
  if (!RegExp(r'\d').hasMatch(mixed)) mixed += '357';
  mixed = mixed.substring(0, math.min(9, mixed.length)).padRight(9, '7');
  return 'G$mixed';
}

bool _isAdPayment(Map<String, dynamic> tx) {
  final type = '${tx['type'] ?? ''}'.toLowerCase().replaceAll(
    'comission',
    'commission',
  );
  final note = '${tx['note'] ?? ''}';
  return type == 'promo_ad' ||
      type == 'ad_hold_summary' ||
      RegExp(
        r'ad campaign budget|ad promote|profile promote|product promote|video promote|photo promote',
        caseSensitive: false,
      ).hasMatch(note);
}

bool _isSystemPurchaseTransaction(Map<String, dynamic> tx) {
  final type = '${tx['type'] ?? ''}'.toLowerCase();
  return const {
    'subscription_payment',
    'vault_purchase',
    'flash_purchase',
  }.contains(type);
}

/// Web parity: ad-campaign payment rows remain visible in wallet history but
/// intentionally have no receipt action. Their hold/deduction lifecycle is
/// summarized on the ad itself rather than represented as a transferable
/// wallet receipt. Subscription auto-renew rows still expose the normal wallet
/// receipt because the web history shows a receipt action for that transaction.
bool isWalletReceiptEligible(Map<String, dynamic> transaction) =>
    !_isAdPayment(transaction) && !_isSystemPurchaseTransaction(transaction);

WalletReceipt buildWalletReceipt(Map<String, dynamic> tx) {
  if (_isAdPayment(tx)) return _buildAdReceipt(tx);

  final type = '${tx['type'] ?? ''}'.toLowerCase().replaceAll(
    'comission',
    'commission',
  );
  final note = '${tx['note'] ?? ''}';
  final commission = _number(tx['commission_percentage']);
  final amount = _number(tx['amount']);
  final sellerBuyDiscount =
      type == 'request' &&
      commission > 0 &&
      '${tx['sender_user_type'] ?? ''}'.toLowerCase() == 'seller';
  final sellerRefund =
      type == 'discount_refund' &&
      RegExp('seller discount', caseSensitive: false).hasMatch(note);
  final productRefund =
      type == 'discount_refund' &&
      RegExp('product discount', caseSensitive: false).hasMatch(note);
  final googerCommission = isGoogerCommissionWalletTransaction(tx);
  final googerPaymentHold =
      type == 'order_hold' &&
      !RegExp('manual payment', caseSensitive: false).hasMatch(note);
  final productDiscount = type == 'discount_staking';
  final productPct = _number(
    tx['product_discount_percentage'] ?? tx['commission_percentage'],
  );
  final originalPct = _number(tx['original_discount_percentage']);
  final sellerDiscountAmount = amount * commission / 100;

  var title = 'Wallet Transaction';
  var amountLabel = 'Amount';
  var typeLabel = type.isEmpty ? 'Wallet' : type;
  if (type == 'sell') {
    title = commission > 0
        ? 'Send Coins & Discount Request'
        : 'Direct Coin Transfer';
    amountLabel = 'Send Coins';
    typeLabel = commission > 0 ? 'Sell' : 'Direct Coin Transfer';
  } else if (type == 'request') {
    title = sellerBuyDiscount
        ? 'Coin Request and Send Discount'
        : commission > 0
        ? 'Discount Request'
        : 'Coin Request';
    amountLabel = sellerBuyDiscount
        ? 'Coin Request'
        : commission > 0
        ? 'Coins'
        : 'Buy Coins';
    typeLabel = title;
  } else if (type == 'seller_discount') {
    title = 'Send Discount';
    typeLabel = 'Send Discount';
  } else if (type == 'transfer') {
    title = commission > 0 ? 'Send Coins & Discount Request' : 'Send Coins';
    amountLabel = 'Send Coins';
    typeLabel = 'Send';
  } else if (type == 'order_hold') {
    title = googerPaymentHold ? 'Googer Payments' : 'Order Payment Hold';
    typeLabel = googerPaymentHold ? 'Googer Payments' : 'Order Hold';
  } else if (type == 'discount_refund') {
    title = productRefund ? 'Product Discount' : 'Discount Refund';
    typeLabel = title;
  } else if (type == 'commission_hold') {
    title = 'Googer Commission Fee';
    typeLabel = 'Googer Commission';
  } else if (type == 'discount_staking') {
    title = 'Product Discount';
    typeLabel = 'Product Discount';
  }

  final details = <WalletReceiptDetail>[
    WalletReceiptDetail(
      amountLabel,
      (type == 'seller_discount' ? sellerDiscountAmount : amount)
          .toStringAsFixed(2),
    ),
  ];
  if (productRefund) {
    details.addAll([
      WalletReceiptDetail(
        'Product Discount',
        productPct > 0 ? '$productPct%' : 'Product Discount',
      ),
      const WalletReceiptDetail(
        'Referral Deductions',
        'Referral level amounts are deducted first. This is the remaining discount balance.',
      ),
    ]);
  } else if (googerCommission) {
    details.add(const WalletReceiptDetail('Googer Commission', 'Fee'));
  } else if (productDiscount) {
    details.add(
      WalletReceiptDetail(
        'Product Discount',
        productPct > 0 ? '$productPct%' : 'Product Discount',
      ),
    );
  } else if (type == 'seller_discount' && commission > 0) {
    details.add(WalletReceiptDetail('Send Discount', '$commission%'));
  } else if (sellerRefund && originalPct > 0) {
    details.addAll([
      WalletReceiptDetail('Send Discount', '$originalPct%'),
      const WalletReceiptDetail(
        'Referral Deductions',
        'Referral level amounts are deducted first. This is the remaining discount balance.',
      ),
    ]);
  } else if (commission > 0) {
    details.add(
      WalletReceiptDetail(
        sellerBuyDiscount
            ? 'Send Discount'
            : type == 'request'
            ? 'Discount Request'
            : 'Discount Requested',
        '$commission%',
      ),
    );
  }

  final manualOrder =
      type == 'order_hold' &&
      RegExp('manual payment', caseSensitive: false).hasMatch(note);
  if (manualOrder) {
    details.addAll([
      WalletReceiptDetail(
        'Buyer ID',
        _account(
          tx['sender_readable_id'] ?? tx['sender_id'],
          tx['sender_username'],
        ),
      ),
      WalletReceiptDetail(
        'Seller ID',
        _account(
          tx['receiver_readable_id'] ?? tx['receiver_id'],
          tx['receiver_username'],
        ),
      ),
    ]);
  } else {
    details.addAll([
      WalletReceiptDetail(
        'From Account',
        _account(
          tx['sender_readable_id'] ?? tx['sender_id'],
          tx['sender_username'],
        ),
      ),
      WalletReceiptDetail(
        sellerBuyDiscount
            ? 'Request To'
            : type == 'request'
            ? 'Requested From'
            : 'Send To',
        googerCommission
            ? 'Googer Commission'
            : _account(
                tx['receiver_readable_id'] ?? tx['receiver_id'],
                tx['receiver_username'],
              ),
      ),
    ]);
  }

  final transactionId = _displayTransactionId(tx);
  details.addAll([
    WalletReceiptDetail('Transaction ID', transactionId),
    WalletReceiptDetail(
      'Date & Time',
      formatWalletReceiptDateTime(tx['created_at']),
    ),
    WalletReceiptDetail('Type', typeLabel),
    WalletReceiptDetail('Status', _status(tx)),
  ]);
  return WalletReceipt(
    headerTitle: productDiscount || productRefund
        ? 'Product Discount Receipt'
        : 'GOOGER WALLET Transaction Receipt',
    title: title,
    transactionId: transactionId,
    amount: amount.toStringAsFixed(2),
    details: details,
    transaction: tx,
  );
}

WalletReceipt _buildAdReceipt(Map<String, dynamic> tx) {
  final note = '${tx['note'] ?? ''}';
  final type = '${tx['type'] ?? ''}'.toLowerCase();
  final idMatch = RegExp(r'\b\d{10,12}\b').firstMatch(note);
  final adId = idMatch?.group(0) ?? '';
  final media = RegExp('profile promote', caseSensitive: false).hasMatch(note)
      ? 'Profile'
      : RegExp('product promote', caseSensitive: false).hasMatch(note)
      ? 'Product'
      : RegExp(r'video promote|\bvideo\b', caseSensitive: false).hasMatch(note)
      ? 'Video'
      : 'Photo';
  final free =
      type == 'promo_ad' ||
      RegExp(
        r'promo free|\bstatus:\s*free\b',
        caseSensitive: false,
      ).hasMatch(note);
  final amount = _number(tx['amount']);
  final transactionId = _displayTransactionId(tx);
  final details = <WalletReceiptDetail>[
    WalletReceiptDetail('Status', free ? 'Free' : _status(tx)),
    WalletReceiptDetail(
      'Hold Amount',
      free ? 'Free' : 'R ${amount.toStringAsFixed(2)}',
    ),
    WalletReceiptDetail(
      'Deducted Amount',
      free ? 'Free' : 'R ${amount.toStringAsFixed(2)}',
    ),
    if (adId.isNotEmpty) WalletReceiptDetail('Ad ID', adId),
    WalletReceiptDetail('Ad Type', '$media Promotion'),
    WalletReceiptDetail(
      'Date & Time',
      formatWalletReceiptDateTime(tx['created_at']),
    ),
  ];
  return WalletReceipt(
    headerTitle: 'GOOGER WALLET Transaction Receipt',
    title:
        'Ad Hold Summary - $media Promotion${adId.isEmpty ? '' : ' - Ad ID: $adId'}',
    transactionId: transactionId,
    amount: amount.toStringAsFixed(2),
    details: details,
    transaction: tx,
  );
}

Future<bool> downloadWalletReceiptPdf(WalletReceipt receipt) async {
  final document = pw.Document();
  final regularFont = pw.Font.ttf(
    await rootBundle.load('assets/fonts/Geist-Regular.ttf'),
  );
  final boldFont = pw.Font.ttf(
    await rootBundle.load('assets/fonts/Geist-Bold.ttf'),
  );
  pw.MemoryImage? logo;
  try {
    final bytes = await rootBundle.load('assets/images/googer.png');
    logo = pw.MemoryImage(bytes.buffer.asUint8List());
  } catch (_) {}
  document.addPage(
    pw.Page(
      pageFormat: PdfPageFormat(88 * PdfPageFormat.mm, 180 * PdfPageFormat.mm),
      margin: pw.EdgeInsets.zero,
      theme: pw.ThemeData.withFont(base: regularFont, bold: boldFont),
      build: (_) => pw.Container(
        color: PdfColors.black,
        padding: const pw.EdgeInsets.fromLTRB(7, 9, 7, 9),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.stretch,
          children: [
            if (logo != null)
              pw.Center(
                child: pw.Image(
                  logo,
                  width: 34 * PdfPageFormat.mm,
                  height: 12 * PdfPageFormat.mm,
                  fit: pw.BoxFit.contain,
                ),
              )
            else
              pw.Center(
                child: pw.Text(
                  'GOOGER',
                  style: pw.TextStyle(
                    color: PdfColors.white,
                    fontSize: 11,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
              ),
            pw.SizedBox(height: 5),
            pw.Text(
              receipt.headerTitle,
              textAlign: pw.TextAlign.center,
              style: pw.TextStyle(
                color: PdfColors.white,
                fontSize: 7.5,
                fontWeight: pw.FontWeight.bold,
              ),
            ),
            pw.SizedBox(height: 3),
            pw.Text(
              'Verified and Confirmed by System',
              textAlign: pw.TextAlign.center,
              style: const pw.TextStyle(
                color: PdfColors.blueGrey300,
                fontSize: 5.2,
              ),
            ),
            pw.SizedBox(height: 6),
            pw.Container(
              padding: const pw.EdgeInsets.all(5),
              decoration: pw.BoxDecoration(
                color: const PdfColor.fromInt(0xFF0A0A0A),
                borderRadius: pw.BorderRadius.circular(3),
              ),
              child: pw.Column(
                children: [
                  pw.Text(
                    '${receipt.title} - Successfully!',
                    textAlign: pw.TextAlign.center,
                    style: pw.TextStyle(
                      color: PdfColors.white,
                      fontSize: 6.5,
                      fontWeight: pw.FontWeight.bold,
                    ),
                  ),
                  pw.SizedBox(height: 5),
                  for (final detail in receipt.details)
                    pw.Container(
                      padding: const pw.EdgeInsets.symmetric(vertical: 3),
                      decoration: const pw.BoxDecoration(
                        border: pw.Border(
                          bottom: pw.BorderSide(
                            color: PdfColor.fromInt(0xFF262626),
                            width: 0.4,
                          ),
                        ),
                      ),
                      child: pw.Row(
                        crossAxisAlignment: pw.CrossAxisAlignment.start,
                        children: [
                          pw.SizedBox(
                            width: 25 * PdfPageFormat.mm,
                            child: pw.Text(
                              detail.label.toUpperCase(),
                              style: pw.TextStyle(
                                color: PdfColors.blueGrey300,
                                fontSize: 5.2,
                                fontWeight: pw.FontWeight.bold,
                              ),
                            ),
                          ),
                          pw.Text(
                            ' - ',
                            style: const pw.TextStyle(
                              color: PdfColors.blueGrey500,
                              fontSize: 5.2,
                            ),
                          ),
                          pw.Expanded(
                            child: pw.Text(
                              detail.value,
                              textAlign: pw.TextAlign.right,
                              style: pw.TextStyle(
                                color: PdfColors.white,
                                fontSize: 6.2,
                                fontWeight: pw.FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
  final bytes = await document.save();
  final id = '${receipt.transaction['id'] ?? receipt.transactionId}'.replaceAll(
    RegExp(r'[^a-zA-Z0-9_-]'),
    '',
  );
  return downloadBytes(bytes, 'Googer_Receipt_$id.pdf', 'application/pdf');
}
