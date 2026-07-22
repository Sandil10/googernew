import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../../theme/colors.dart';

/// Shared campaign editor form used by all ad-campaign sub-screens.
/// Ported from the web `CampaignEditor` component (a large multi-section form).
/// Sections are toggled per campaign type via the flags below.
class CampaignEditor extends StatefulWidget {
  final String campaignType;
  final String title;
  final String subtitle;
  final IconData accentIcon;
  final bool videoOnly;
  final bool showDescription;
  final bool showCta;
  final bool showLink;
  final String? linkLabel;
  final String? linkHint;
  final bool showContentAccess;
  final bool showSubscription;
  final bool alwaysFree;

  const CampaignEditor({
    super.key,
    required this.campaignType,
    required this.title,
    required this.subtitle,
    required this.accentIcon,
    this.videoOnly = false,
    this.showDescription = false,
    this.showCta = false,
    this.showLink = false,
    this.linkLabel,
    this.linkHint,
    this.showContentAccess = false,
    this.showSubscription = false,
    this.alwaysFree = false,
  });

  @override
  State<CampaignEditor> createState() => _CampaignEditorState();
}

class _CampaignEditorState extends State<CampaignEditor> {
  int _durationDays = 7;
  String _gender = 'All';
  int _budget = 500;
  bool _allowComments = true;
  final Set<String> _placements = {'Feed', 'Marketplace'};
  final Set<String> _interests = {};

  static const _genders = ['All', 'Male', 'Female'];
  static const _placementOptions = ['Feed', 'Marketplace', 'Profile', 'Stories'];
  static const _interestOptions = [
    'Fashion', 'Tech', 'Food', 'Fitness', 'Travel', 'Beauty', 'Gaming', 'Music',
  ];

  @override
  Widget build(BuildContext context) {
    final free = widget.alwaysFree;
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 18, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: Text(widget.title,
            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _headerBanner(),
          const SizedBox(height: 16),
          _mediaUploadCard(),
          if (widget.showLink) ...[
            const SizedBox(height: 12),
            _linkCard(),
          ],
          if (widget.showDescription) ...[
            const SizedBox(height: 12),
            _descriptionCard(),
          ],
          if (widget.showCta) ...[
            const SizedBox(height: 12),
            _ctaCard(),
          ],
          if (widget.showContentAccess) ...[
            const SizedBox(height: 12),
            _contentAccessCard(),
          ],
          if (widget.showSubscription) ...[
            const SizedBox(height: 12),
            _subscriptionCard(),
          ],
          const SizedBox(height: 12),
          _durationCard(),
          const SizedBox(height: 12),
          _genderCard(),
          const SizedBox(height: 12),
          _interestsCard(),
          const SizedBox(height: 12),
          _placementsCard(),
          const SizedBox(height: 12),
          if (!free) _budgetCard(),
          const SizedBox(height: 12),
          _orderSummaryCard(free),
          const SizedBox(height: 20),
          _publishButton(),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  // ---- Section building blocks ----

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.bg3,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: child,
    );
  }

  Widget _sectionLabel(String text) {
    return Text(text,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white));
  }

  Widget _hint(String text) {
    return Text(text, style: const TextStyle(fontSize: 11, color: AppColors.textGray500));
  }

  Widget _headerBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.purpleBg10,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.purpleBorder),
      ),
      child: Row(
        children: [
          Container(
            height: 44,
            width: 44,
            decoration: BoxDecoration(
              color: AppColors.purpleBg15,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(widget.accentIcon, color: AppColors.purpleText, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.title,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white)),
                const SizedBox(height: 2),
                Text(widget.subtitle,
                    overflow: TextOverflow.ellipsis,
                    maxLines: 2,
                    style: const TextStyle(fontSize: 11, color: AppColors.textGray400)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _mediaUploadCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(widget.videoOnly ? 'Upload Video' : 'Upload Media'),
          const SizedBox(height: 4),
          _hint(widget.videoOnly
              ? 'Flash Content supports video uploads only.'
              : 'Add a photo or video to promote.'),
          const SizedBox(height: 12),
          DottedUploadBox(
            icon: widget.videoOnly ? Ionicons.videocam_outline : Ionicons.cloud_upload_outline,
            label: widget.videoOnly ? 'Tap to upload video' : 'Tap to upload media',
          ),
        ],
      ),
    );
  }

  Widget _linkCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel(widget.linkLabel ?? 'Apply Link'),
          const SizedBox(height: 10),
          _textField(hint: widget.linkHint ?? 'https://...'),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _outlineButton(
                    'Use My Profile', Ionicons.person_outline, () {}),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _outlineButton('Apply', Ionicons.checkmark_outline, () {}),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _descriptionCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Description'),
          const SizedBox(height: 10),
          _textField(hint: 'Write short description...', maxLines: 4),
          const SizedBox(height: 12),
          _toggleRow('Allow comments', _allowComments,
              (v) => setState(() => _allowComments = v)),
        ],
      ),
    );
  }

  Widget _ctaCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Call To Action'),
          const SizedBox(height: 10),
          _textField(hint: 'Shop Now'),
        ],
      ),
    );
  }

  Widget _contentAccessCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Content Access'),
          const SizedBox(height: 4),
          _hint('Set a fixed price and preview time for locked content.'),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _priceField('Fixed Price', '₹', '500'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _priceField('Preview Time', 's', '10'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _subscriptionCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _sectionLabel('Subscription Access')),
              _outlineButton('Add Subscription', Ionicons.add_outline, () {}),
            ],
          ),
          const SizedBox(height: 10),
          _appliedPackageRow('Package 1', '₹300 / 30 Days / 15%'),
          const SizedBox(height: 8),
          _appliedPackageRow('Package 2', '₹500 / Month / 20%'),
        ],
      ),
    );
  }

  Widget _appliedPackageRow(String left, String right) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        children: [
          Text(left,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
          const Spacer(),
          Flexible(
            child: Text(right,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11, color: AppColors.textGray300)),
          ),
        ],
      ),
    );
  }

  Widget _durationCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Duration'),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Slider(
                  value: _durationDays.toDouble(),
                  min: 1,
                  max: 30,
                  divisions: 29,
                  activeColor: AppColors.accentPurple,
                  inactiveColor: AppColors.border1,
                  label: '$_durationDays days',
                  onChanged: (v) => setState(() => _durationDays = v.round()),
                ),
              ),
              const SizedBox(width: 8),
              Text('$_durationDays days',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _genderCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Gender'),
          const SizedBox(height: 12),
          Row(
            children: _genders.map((g) {
              final selected = _gender == g;
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _chip(g, selected, () => setState(() => _gender = g)),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _interestsCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Interest Topics'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _interestOptions.map((topic) {
              final selected = _interests.contains(topic);
              return _chip(topic, selected, () {
                setState(() {
                  if (selected) {
                    _interests.remove(topic);
                  } else {
                    _interests.add(topic);
                  }
                });
              });
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _placementsCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Placements'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _placementOptions.map((p) {
              final selected = _placements.contains(p);
              return _chip(p, selected, () {
                setState(() {
                  if (selected) {
                    _placements.remove(p);
                  } else {
                    _placements.add(p);
                  }
                });
              });
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _budgetCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Total Budget'),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Slider(
                  value: _budget.toDouble(),
                  min: 100,
                  max: 5000,
                  divisions: 49,
                  activeColor: AppColors.accentPurple,
                  inactiveColor: AppColors.border1,
                  label: '₹$_budget',
                  onChanged: (v) => setState(() => _budget = v.round()),
                ),
              ),
              const SizedBox(width: 8),
              _rupee(),
              Text('$_budget',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _orderSummaryCard(bool free) {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionLabel('Order Summary'),
          const SizedBox(height: 12),
          _summaryRow('Total Budget', free ? 'Free' : '₹$_budget'),
          _summaryRow('Duration', '$_durationDays days'),
          _summaryRow('Gender', _gender),
          _summaryRow('Estimated Reach',
              free ? '~2,500' : '~${(_budget * 5).toString()}'),
        ],
      ),
    );
  }

  Widget _summaryRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12, color: AppColors.textGray400)),
          ),
          Text(value,
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
        ],
      ),
    );
  }

  Widget _publishButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: () {},
        icon: const Icon(Ionicons.rocket_outline, size: 18),
        label: const Text('Publish Campaign'),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accentPurple,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
        ),
      ),
    );
  }

  // ---- small shared widgets ----

  Widget _rupee() {
    return Padding(
      padding: const EdgeInsets.only(right: 2),
      child: Image.asset('assets/images/rupee.png',
          height: 12,
          width: 12,
          errorBuilder: (_, __, ___) => const Text('₹',
              style: TextStyle(fontSize: 12, color: Colors.white))),
    );
  }

  Widget _textField({required String hint, int maxLines = 1}) {
    return TextField(
      maxLines: maxLines,
      style: const TextStyle(fontSize: 13, color: Colors.white),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(fontSize: 13, color: AppColors.textGray600),
        filled: true,
        fillColor: Colors.black.withOpacity(0.2),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.accentPurple),
        ),
      ),
    );
  }

  Widget _priceField(String label, String prefix, String hint) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.2),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 8, fontWeight: FontWeight.w800, color: AppColors.textGray500)),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(prefix,
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
              const SizedBox(width: 4),
              Expanded(
                child: Text(hint,
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, bool selected, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(9999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppColors.purpleBg15 : Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(9999),
          border: Border.all(
              color: selected ? AppColors.purpleBorder : AppColors.borderWhite10),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: selected ? AppColors.purpleText : AppColors.textGray300)),
      ),
    );
  }

  Widget _outlineButton(String label, IconData icon, VoidCallback onTap) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: Colors.white),
            const SizedBox(width: 6),
            Flexible(
              child: Text(label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _toggleRow(String label, bool value, ValueChanged<bool> onChanged) {
    return Row(
      children: [
        Expanded(
          child: Text(label,
              style: const TextStyle(fontSize: 13, color: Colors.white)),
        ),
        Switch(
          value: value,
          activeColor: Colors.white,
          activeTrackColor: AppColors.successGreen,
          inactiveTrackColor: AppColors.border1,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

/// Dashed upload placeholder box.
class DottedUploadBox extends StatelessWidget {
  final IconData icon;
  final String label;
  const DottedUploadBox({super.key, required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () {},
      child: Container(
        height: 140,
        width: double.infinity,
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.2),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 30, color: AppColors.textGray500),
            const SizedBox(height: 8),
            Text(label,
                style: const TextStyle(fontSize: 12, color: AppColors.textGray500)),
          ],
        ),
      ),
    );
  }
}
