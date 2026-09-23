import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:ionicons/ionicons.dart';
import '../services/app_notifications.dart';
import '../util/upload_picker.dart';
import '../widgets/app_back_button.dart';
import '../theme/colors.dart';

/// Wallet · Top Up · Bank Transfer — bank details + receipt upload.
class BankTransferScreen extends StatefulWidget {
  const BankTransferScreen({
    super.key,
    this.amount = '1000',
    this.methodName = 'Direct Bank Transfer',
    this.methodFields = const <Map<String, String>>[],
  });

  final String amount;
  final String methodName;
  final List<Map<String, String>> methodFields;

  @override
  State<BankTransferScreen> createState() => _BankTransferScreenState();
}

class _BankTransferScreenState extends State<BankTransferScreen> {
  String? _fileName;
  bool _picking = false;

  static const _fallbackFields = [
    {'label': 'Account Name', 'value': 'I.p.p.c fernando'},
    {'label': 'Account Number', 'value': '0112755676'},
    {'label': 'Bank Branch', 'value': 'Commercial Bank'},
    {'label': 'Bank Name', 'value': 'BOC'},
    {'label': 'Branch Code', 'value': '12345'},
    {'label': 'Shift Code', 'value': 'CERWLKX'},
  ];

  List<Map<String, String>> get _fields => widget.methodFields.isEmpty
      ? _fallbackFields
      : widget.methodFields;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leadingWidth: AppBackButton.appBarLeadingWidth,
        leading: const AppBackButton.appBar(),
        title: const Text(
          'Bank Details',
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.border1),
        ),
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
                Image.asset(
                  'assets/images/coin.png',
                  width: 34,
                  height: 34,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Icon(
                    Ionicons.disc_outline,
                    size: 30,
                    color: AppColors.purpleText,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  '${widget.amount} Coins',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text(
            widget.methodName,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray400,
              letterSpacing: 0.5,
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
              children: [for (final field in _fields) _fieldRow(field)],
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Upload Receipt',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: Colors.white,
              letterSpacing: 1.2,
            ),
          ),
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
                  onPressed: _picking ? null : _pickReceipt,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 10,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(9),
                    ),
                  ),
                  child: Text(
                    _picking ? 'CHOOSING...' : 'CHOOSE FILE',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: AppColors.utilityBlue,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _fileName ?? 'no file selected',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textGray500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
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
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(9999),
                    ),
                    side: BorderSide.none,
                  ),
                  child: const Text(
                    'CANCEL',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: Colors.black,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: _fileName == null ? null : _buyCoins,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accentPurple,
                    disabledBackgroundColor: AppColors.bg1,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(9999),
                    ),
                  ),
                  child: const Text(
                    'BUY COINS',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text(
            'Terms',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: Colors.white,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Use only a banking or payment platform that matches your name on Googer.',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.textGray500,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickReceipt() async {
    setState(() => _picking = true);
    final files = await pickUploadFiles(
      field: 'receipt',
      type: FileType.custom,
      allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    );
    if (!mounted) return;
    setState(() {
      _fileName = files.isEmpty ? _fileName : files.first.filename;
      _picking = false;
    });
  }

  void _buyCoins() {
    AppNotifications.success(
      'Receipt selected',
      'Your payment proof is ready for review.',
    );
    Navigator.maybePop(context);
  }

  Widget _fieldRow(Map<String, String> field) {
    final label = field['label'] ?? '';
    final value = field['value'] ?? '';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.inputBorder)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label.toUpperCase(),
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray500,
                letterSpacing: 0.5,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: Colors.white,
              ),
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
            ),
          ),
          const SizedBox(width: 6),
          GestureDetector(
            onTap: () => _copyField(label, value),
            child: const Icon(
              Ionicons.copy_outline,
              size: 15,
              color: AppColors.textGray500,
            ),
          ),
        ],
      ),
    );
  }

  void _copyField(String label, String value) {
    Clipboard.setData(ClipboardData(text: value));
    AppNotifications.info('$label copied');
  }
}
