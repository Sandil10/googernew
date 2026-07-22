import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// Wallet · Verification — multi-step KYC (Personal, Identity, Authenticity, Business).
class WalletVerificationScreen extends StatefulWidget {
  const WalletVerificationScreen({super.key});

  @override
  State<WalletVerificationScreen> createState() => _WalletVerificationScreenState();
}

class _WalletVerificationScreenState extends State<WalletVerificationScreen> {
  int _step = 0;
  static const _steps = ['Personal Info', 'Identity', 'Authenticity', 'Business'];

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
        title: const Text('ID Verification', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                for (int i = 0; i < _steps.length; i++) ...[
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i <= _step ? AppColors.accentPurple : AppColors.bg1,
                      border: Border.all(color: i <= _step ? AppColors.accentPurple : AppColors.inputBorder),
                    ),
                    child: Center(
                      child: i < _step
                          ? const Icon(Ionicons.checkmark_outline, size: 14, color: Colors.white)
                          : Text('${i + 1}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: i <= _step ? Colors.white : AppColors.textGray500)),
                    ),
                  ),
                  if (i < _steps.length - 1)
                    Expanded(child: Container(height: 2, color: i < _step ? AppColors.accentPurple : AppColors.inputBorder)),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(_steps[_step], style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
          ),
          Expanded(child: _stepBody()),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                if (_step > 0)
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() => _step--),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        side: const BorderSide(color: AppColors.inputBorder),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                      ),
                      child: const Text('Back', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                    ),
                  ),
                if (_step > 0) const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => setState(() {
                      if (_step < _steps.length - 1) _step++;
                    }),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accentPurple,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
                    ),
                    child: Text(_step < _steps.length - 1 ? 'Continue' : 'Submit Application',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _stepBody() {
    switch (_step) {
      case 0:
        return ListView(
          padding: const EdgeInsets.all(16),
          children: const [
            _Field(label: 'Full Name', hint: 'John Doe'),
            _Field(label: 'Email Address', hint: 'john@example.com'),
            _Field(label: 'Phone Number', hint: '+94 77 123 4567'),
            _Field(label: 'Address', hint: 'Street, City'),
            _Field(label: 'Date of Birth', hint: 'DD / MM / YYYY'),
            _Field(label: 'Country', hint: 'Sri Lanka'),
          ],
        );
      case 1:
        return ListView(
          padding: const EdgeInsets.all(16),
          children: const [
            _Field(label: 'Document Type', hint: 'NIC / Passport / Driving License'),
            SizedBox(height: 8),
            _UploadBox(label: 'Document Front'),
            SizedBox(height: 12),
            _UploadBox(label: 'Document Back'),
          ],
        );
      case 2:
        return ListView(
          padding: const EdgeInsets.all(16),
          children: const [
            Text('All fields optional', style: TextStyle(fontSize: 11, color: AppColors.textGray500)),
            SizedBox(height: 12),
            _Field(label: 'Official Website', hint: 'https://'),
            SizedBox(height: 8),
            _UploadBox(label: 'Brand Ownership Proof'),
          ],
        );
      default:
        return ListView(
          padding: const EdgeInsets.all(16),
          children: const [
            _Field(label: 'Official Business Website', hint: 'https://'),
            SizedBox(height: 8),
            _UploadBox(label: 'Business Registration Certificate'),
            SizedBox(height: 12),
            _UploadBox(label: 'Company Documents'),
          ],
        );
    }
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.hint});
  final String label;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: AppColors.textGray400, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          TextField(
            style: const TextStyle(fontSize: 13, color: Colors.white),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(fontSize: 13, color: AppColors.textGray600),
              filled: true,
              fillColor: AppColors.bg2,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.inputBorder)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.purpleBorder)),
            ),
          ),
        ],
      ),
    );
  }
}

class _UploadBox extends StatelessWidget {
  const _UploadBox({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 26),
      decoration: BoxDecoration(
        color: AppColors.bg2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: Column(
        children: [
          const Icon(Ionicons.cloud_upload_outline, size: 26, color: AppColors.textGray500),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textGray300)),
          const SizedBox(height: 2),
          const Text('Click to upload', style: TextStyle(fontSize: 10, color: AppColors.textGray600)),
        ],
      ),
    );
  }
}
