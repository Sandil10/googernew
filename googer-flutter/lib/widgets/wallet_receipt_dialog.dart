import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';

import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/wallet_receipt.dart';

Future<void> showWalletReceiptDialog(
  BuildContext context,
  Map<String, dynamic> transaction,
) => showDialog<void>(
  context: context,
  barrierColor: Colors.black.withValues(alpha: 0.92),
  builder: (_) =>
      _WalletReceiptDialog(receipt: buildWalletReceipt(transaction)),
);

class _WalletReceiptDialog extends StatefulWidget {
  final WalletReceipt receipt;

  const _WalletReceiptDialog({required this.receipt});

  @override
  State<_WalletReceiptDialog> createState() => _WalletReceiptDialogState();
}

class _WalletReceiptDialogState extends State<_WalletReceiptDialog> {
  bool _copied = false;
  bool _downloading = false;

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: widget.receipt.transactionId));
    if (!mounted) return;
    setState(() => _copied = true);
    Future<void>.delayed(const Duration(milliseconds: 1800), () {
      if (mounted) setState(() => _copied = false);
    });
  }

  Future<void> _download() async {
    setState(() => _downloading = true);
    try {
      final downloaded = await downloadWalletReceiptPdf(widget.receipt);
      if (!mounted) return;
      if (downloaded) {
        AppNotifications.success('Receipt downloaded');
      } else {
        AppNotifications.error(
          'Download unavailable',
          'Receipt download is not supported on this device yet.',
        );
      }
    } catch (error) {
      if (mounted) {
        AppNotifications.error('Could not download receipt', '$error');
      }
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.sizeOf(context).height * 0.88;
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      backgroundColor: Colors.transparent,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: 438, maxHeight: maxHeight),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(21),
            border: Border.all(color: AppColors.borderWhite10),
            boxShadow: const [
              BoxShadow(
                color: Colors.black87,
                blurRadius: 38,
                offset: Offset(0, 16),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: const BoxDecoration(
                  color: Color(0xFF080808),
                  border: Border(
                    bottom: BorderSide(color: AppColors.borderWhite10),
                  ),
                ),
                child: Image.asset(
                  'assets/images/googer.png',
                  height: 50,
                  fit: BoxFit.contain,
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(18, 17, 18, 14),
                  child: Column(
                    children: [
                      Text(
                        widget.receipt.headerTitle,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 13,
                          letterSpacing: 0.4,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 9),
                      Text.rich(
                        TextSpan(
                          children: [
                            const TextSpan(
                              text: '! ',
                              style: TextStyle(color: Color(0xFFFB7185)),
                            ),
                            TextSpan(
                              text: '${widget.receipt.title} - Successfully!',
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 11.5,
                          height: 1.35,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.fromLTRB(13, 13, 13, 12),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.018),
                          borderRadius: BorderRadius.circular(17),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.10),
                            style: BorderStyle.solid,
                          ),
                        ),
                        child: Column(
                          children: [
                            for (
                              var i = 0;
                              i < widget.receipt.details.length;
                              i++
                            ) ...[
                              _detailRow(widget.receipt.details[i]),
                              if (i < widget.receipt.details.length - 1)
                                const Divider(
                                  height: 13,
                                  color: Color(0xFF171717),
                                ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
                decoration: const BoxDecoration(
                  color: Colors.black,
                  border: Border(
                    top: BorderSide(color: AppColors.borderWhite10),
                  ),
                ),
                child: Column(
                  children: [
                    FilledButton.icon(
                      key: const Key('wallet-receipt-download'),
                      onPressed: _downloading ? null : _download,
                      icon: Icon(
                        _downloading
                            ? Ionicons.hourglass_outline
                            : Ionicons.download_outline,
                        size: 17,
                      ),
                      label: Text(
                        _downloading
                            ? 'PREPARING RECEIPT...'
                            : 'DOWNLOAD RECEIPT',
                      ),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        backgroundColor: const Color(0xFF2563FF),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        textStyle: const TextStyle(
                          fontSize: 10,
                          letterSpacing: 2,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _downloading
                          ? null
                          : () => Navigator.pop(context),
                      child: const Text(
                        'CLOSE',
                        style: TextStyle(
                          fontSize: 9,
                          letterSpacing: 1.8,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textGray500,
                        ),
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
  }

  Widget _detailRow(WalletReceiptDetail detail) {
    final transactionId = detail.label == 'Transaction ID';
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 105,
          child: Text(
            detail.label,
            style: const TextStyle(
              fontSize: 10,
              height: 1.4,
              fontWeight: FontWeight.w800,
              color: AppColors.textGray400,
            ),
          ),
        ),
        const Text(
          '-',
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            color: AppColors.textGray600,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                detail.value,
                textAlign: TextAlign.right,
                style: const TextStyle(
                  fontSize: 11,
                  height: 1.35,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              if (transactionId)
                GestureDetector(
                  key: const Key('wallet-receipt-copy'),
                  onTap: _copy,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _copied
                              ? Ionicons.checkmark_outline
                              : Ionicons.copy_outline,
                          size: 11,
                          color: const Color(0xFF60A5FA),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          _copied ? 'COPIED' : 'COPY',
                          style: const TextStyle(
                            fontSize: 8.5,
                            letterSpacing: 1.5,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF60A5FA),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
