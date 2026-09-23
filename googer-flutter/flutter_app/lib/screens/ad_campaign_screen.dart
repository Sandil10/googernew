import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Ad Campaign screen — 5 category tabs (Photo & Video, Product Promote,
/// Profile Promote, Flash Content, Vault Content), each with a 2-step flow:
/// Setup form -> Preview & Publish.
class AdCampaignScreen extends StatefulWidget {
  const AdCampaignScreen({super.key});

  @override
  State<AdCampaignScreen> createState() => _AdCampaignScreenState();
}

class _AdCampaignScreenState extends State<AdCampaignScreen> {
  int _tab = 0;
  int _step = 0; // 0 = setup, 1 = preview & publish

  static const _tabs = [
    'PHOTO & VIDEO',
    'PRODUCT PROMOTE',
    'PROFILE PROMOTE',
    'FLASH CONTENT',
    'VAULT CONTENT',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary, size: 20),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Ad Campaign', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
      ),
      body: Column(
        children: [
          // Category tabs
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              itemCount: _tabs.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (context, i) {
                final selected = i == _tab;
                return GestureDetector(
                  onTap: () => setState(() { _tab = i; _step = 0; }),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                    decoration: BoxDecoration(
                      color: selected ? Colors.white : AppColors.surface,
                      border: selected ? null : Border.all(color: AppColors.border),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(_tabs[i], style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: selected ? Colors.black : AppColors.textSecondary)),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 14),
          _stepIndicator(),
          const SizedBox(height: 10),
          Expanded(child: _step == 0 ? _setupForm() : _previewAndPublish()),
        ],
      ),
    );
  }

  Widget _stepIndicator() {
    Widget dot(bool active) => Container(
          width: 11, height: 11,
          decoration: BoxDecoration(shape: BoxShape.circle, color: active ? Colors.white : const Color(0xFF374151)),
        );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        children: [
          Row(children: [dot(_step == 0), Expanded(child: Container(height: 2, color: const Color(0xFF1F2937))), dot(_step == 1)]),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('1. SETUP', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: _step == 0 ? Colors.white : const Color(0xFF4B5563))),
              Text('2. PREVIEW & PUBLISH', style: TextStyle(fontSize: 9.5, fontWeight: FontWeight.w800, color: _step == 1 ? Colors.white : const Color(0xFF4B5563))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _label(String text) => Text(text.toUpperCase(), style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, letterSpacing: 1, color: Color(0xFF6B7280)));

  Widget _fieldBox(String hint, {double? height}) => Container(
        width: double.infinity,
        height: height,
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(color: const Color(0xFF070707), border: Border.all(color: const Color(0xFF1F2937)), borderRadius: BorderRadius.circular(12)),
        child: Text(hint, style: const TextStyle(fontSize: 12, color: Color(0xFF52525B), fontWeight: FontWeight.w600)),
      );

  Widget _uploadBox(String hint) => Container(
        width: double.infinity,
        height: 150,
        margin: const EdgeInsets.only(top: 6),
        decoration: BoxDecoration(
          color: const Color(0xFF070707),
          border: Border.all(color: const Color(0xFF374151), style: BorderStyle.solid),
          borderRadius: BorderRadius.circular(14),
        ),
        alignment: Alignment.center,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_upload_outlined, color: Color(0xFF52525B), size: 26),
            const SizedBox(height: 6),
            Text(hint, style: const TextStyle(fontSize: 10.5, color: Color(0xFF52525B))),
          ],
        ),
      );

  Widget _setupForm() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _label('Apply Link'),
        _fieldBox('https://your-link-here.com'),
        const SizedBox(height: 16),
        _label(_tab == 1 ? 'Select Product' : _tab == 2 ? 'Profile' : 'Select Ad Media'),
        if (_tab == 2)
          Container(
            margin: const EdgeInsets.only(top: 6),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: const Color(0xFF070707), border: Border.all(color: const Color(0xFF1F2937)), borderRadius: BorderRadius.circular(14)),
            child: const Row(children: [
              CircleAvatar(radius: 26, backgroundColor: Color(0xFF3A3A40)),
              SizedBox(width: 12),
              Expanded(child: Text('@googer — your profile will be promoted as a suggested account.', style: TextStyle(fontSize: 11, color: AppColors.textSecondary))),
            ]),
          )
        else
          _uploadBox(_tab == 3
              ? 'Upload flash photo/video (disappears)'
              : _tab == 4
                  ? 'Upload vault content (coin-locked)'
                  : 'Upload photo or video (max 60s)'),
        const SizedBox(height: 16),
        _label('Description'),
        _fieldBox('Write a short description for your ad… (0/50)', height: 70),
        const SizedBox(height: 16),
        _label('Call to Action'),
        _fieldBox('Learn More'),
        const SizedBox(height: 16),
        _label('Budget — R 500'),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Slider(value: 500, min: 300, max: 100000, activeColor: AppColors.accentRed, inactiveColor: const Color(0xFF1F2937), onChanged: (_) {}),
        ),
        _label('Duration'),
        _fieldBox('1 day'),
        const SizedBox(height: 16),
        _label('Location'),
        _fieldBox('Sri Lanka, India  ·  + Add'),
        const SizedBox(height: 16),
        _label('Gender'),
        Container(
          margin: const EdgeInsets.only(top: 6),
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(color: const Color(0xFF070707), border: Border.all(color: const Color(0xFF1F2937)), borderRadius: BorderRadius.circular(999)),
          child: Row(
            children: ['All', 'Male', 'Female'].map((g) {
              final selected = g == 'All';
              return Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 9),
                  decoration: BoxDecoration(color: selected ? Colors.white : Colors.transparent, borderRadius: BorderRadius.circular(999)),
                  alignment: Alignment.center,
                  child: Text(g, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: selected ? Colors.black : AppColors.textSecondary)),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 16),
        _label('Age Range — 18-65'),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: RangeSlider(values: const RangeValues(18, 65), min: 18, max: 65, activeColor: AppColors.accentRed, inactiveColor: const Color(0xFF1F2937), onChanged: (_) {}),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(vertical: 15),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
            ),
            onPressed: () => setState(() => _step = 1),
            child: const Text('CONTINUE TO PREVIEW', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
          ),
        ),
      ],
    );
  }

  Widget _previewAndPublish() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _label('Order Summary'),
        Container(
          margin: const EdgeInsets.only(top: 6),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFF070707), border: Border.all(color: const Color(0xFF1F2937)), borderRadius: BorderRadius.circular(14)),
          child: const Column(
            children: [
              _SummaryRow('Estimated Reach', '3,900 – 6,500'),
              SizedBox(height: 6),
              _SummaryRow('Duration', '1 day'),
              Divider(color: Color(0xFF1F2937), height: 20),
              _SummaryRow('Total', 'R 500', bold: true),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _label('Ad Preview'),
        Container(
          margin: const EdgeInsets.only(top: 6),
          height: 220,
          decoration: BoxDecoration(color: const Color(0xFF070707), border: Border.all(color: const Color(0xFF1F2937)), borderRadius: BorderRadius.circular(16)),
          alignment: Alignment.center,
          child: const Text('SPONSORED PREVIEW', style: TextStyle(fontSize: 10, letterSpacing: 1, color: Color(0xFF52525B), fontFamily: 'monospace')),
        ),
        const SizedBox(height: 12),
        TextButton.icon(
          onPressed: () => setState(() => _step = 0),
          icon: const Icon(Icons.chevron_left, size: 16, color: Color(0xFF6B7280)),
          label: const Text('Edit Setup', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF6B7280))),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1F2937),
                  foregroundColor: const Color(0xFFE5E7EB),
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                ),
                onPressed: () => Navigator.of(context).maybePop(),
                child: const Text('CANCEL', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFFF0554F), Color(0xFFDC2626)]),
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: [BoxShadow(color: const Color(0xFFDC2626).withValues(alpha: 0.35), blurRadius: 20, offset: const Offset(0, 8))],
                ),
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                  ),
                  onPressed: () {},
                  child: const Text('PUBLISH AD', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  const _SummaryRow(this.label, this.value, {this.bold = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: bold ? 13 : 11.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w400, color: bold ? const Color(0xFFE5E7EB) : const Color(0xFF9CA3AF))),
        Text(value, style: TextStyle(fontSize: bold ? 13 : 11.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w700, color: bold ? const Color(0xFFE5E7EB) : Colors.white)),
      ],
    );
  }
}
