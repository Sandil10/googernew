import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// dashboard/admin/verification -> AdminVerificationScreen
/// Review and manage user verification applications (demo data).
class AdminVerificationScreen extends StatefulWidget {
  const AdminVerificationScreen({super.key});

  @override
  State<AdminVerificationScreen> createState() => _AdminVerificationScreenState();
}

class _AdminVerificationScreenState extends State<AdminVerificationScreen> {
  static const _tabs = ['All', 'Under Review', 'Verified', 'Rejected'];
  String _filter = 'Under Review';

  final List<_Rec> _records = const [
    _Rec('Aarav Sharma', 'aarav', 'Under Review', 'Passport', 'IN', 'aarav@mail.com'),
    _Rec('Meera Patel', 'meera_p', 'Under Review', 'National ID', 'IN', 'meera@mail.com'),
    _Rec('TechZone Ltd', 'techzone', 'Verified', 'Business Reg.', 'US', 'hi@techzone.com'),
    _Rec('Rohan Das', 'rohan.d', 'Rejected', 'Driver License', 'IN', 'rohan@mail.com'),
  ];

  Color _statusColor(String s) {
    switch (s) {
      case 'Under Review':
        return const Color(0xFFFBBF24);
      case 'Verified':
        return AppColors.successGreen;
      case 'Rejected':
        return AppColors.likeRed;
      default:
        return AppColors.textGray400;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered =
        _filter == 'All' ? _records : _records.where((r) => r.status == _filter).toList();
    final pending = _records.where((r) => r.status == 'Under Review').length;

    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 18, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text('Verification',
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Row(
                children: [
                  Container(
                    height: 8,
                    width: 8,
                    decoration: BoxDecoration(
                      color: pending > 0 ? const Color(0xFFFBBF24) : AppColors.textGray700,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text('$pending Pending',
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textGray400)),
                ],
              ),
            ),
          ),
        ],
        bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 46,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _tabs.length,
              separatorBuilder: (_, __) => const SizedBox(width: 20),
              itemBuilder: (_, i) {
                final tab = _tabs[i];
                final selected = _filter == tab;
                return InkWell(
                  onTap: () => setState(() => _filter = tab),
                  child: Container(
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: selected ? Colors.white : Colors.transparent,
                          width: 2,
                        ),
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(tab,
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: selected ? Colors.white : AppColors.textGray500)),
                  ),
                );
              },
            ),
          ),
          const Divider(height: 1, color: AppColors.border1),
          Expanded(
            child: filtered.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Ionicons.shield_outline, size: 40, color: AppColors.textGray600),
                        SizedBox(height: 12),
                        Text('No applications',
                            style: TextStyle(fontSize: 13, color: AppColors.textGray500)),
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _recordRow(filtered[i]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _recordRow(_Rec rec) {
    final c = _statusColor(rec.status);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => _openDetail(rec),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.bg3,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.inputBorder),
        ),
        child: Row(
          children: [
            Container(
              height: 40,
              width: 40,
              decoration: const BoxDecoration(
                color: AppColors.avatarSlate,
                shape: BoxShape.circle,
              ),
              child: const Icon(Ionicons.person_outline, size: 18, color: AppColors.slateIcon),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(rec.fullName,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
                  const SizedBox(height: 2),
                  Text('@${rec.username}',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, color: AppColors.textGray500)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: c.withOpacity(0.1),
                borderRadius: BorderRadius.circular(9999),
                border: Border.all(color: c.withOpacity(0.2)),
              ),
              child: Text(rec.status,
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: c)),
            ),
          ],
        ),
      ),
    );
  }

  void _openDetail(_Rec rec) {
    final c = _statusColor(rec.status);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF0E0E0E),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    height: 48,
                    width: 48,
                    decoration: const BoxDecoration(
                      color: AppColors.avatarSlate,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Ionicons.person_outline, color: AppColors.slateIcon),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rec.fullName,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                        Text('@${rec.username}',
                            style: const TextStyle(fontSize: 12, color: AppColors.textGray500)),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Ionicons.close_outline, color: AppColors.textGray400),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: c.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: c.withOpacity(0.2)),
                ),
                child: Row(
                  children: [
                    Container(
                      height: 8,
                      width: 8,
                      decoration: BoxDecoration(color: c, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 8),
                    Text(rec.status,
                        style: TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700, color: c)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _sectionTitle('Personal Information'),
              _detailRow('Full Name', rec.fullName),
              _detailRow('Email', rec.email),
              _detailRow('Country', rec.country),
              const SizedBox(height: 16),
              _sectionTitle('Identity Document'),
              _detailRow('Document Type', rec.docType),
              _detailRow('ID Number', '**** 4821'),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _docBox('Front Side')),
                  const SizedBox(width: 12),
                  Expanded(child: _docBox('Back Side')),
                ],
              ),
              const SizedBox(height: 16),
              if (rec.status == 'Under Review') ...[
                _fullButton('Approve & Verify', Ionicons.shield_checkmark_outline,
                    AppColors.successGreen),
                const SizedBox(height: 10),
                _fullButton('Reject Application', Ionicons.close_circle_outline,
                    AppColors.likeRed),
              ] else if (rec.status == 'Verified')
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.successGreen.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.successGreen.withOpacity(0.2)),
                  ),
                  child: const Row(
                    children: [
                      Icon(Ionicons.shield_checkmark,
                          size: 18, color: AppColors.successGreen),
                      SizedBox(width: 8),
                      Text('This account is verified',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.successGreen)),
                    ],
                  ),
                ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionTitle(String t) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(t.toUpperCase(),
          style: const TextStyle(
              fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.textGray500)),
    );
  }

  Widget _detailRow(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border1)),
      ),
      child: Row(
        children: [
          Text(label,
              style: const TextStyle(fontSize: 12, color: AppColors.textGray500)),
          const Spacer(),
          Flexible(
            child: Text(value,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _docBox(String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: const TextStyle(
                fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.textGray500)),
        const SizedBox(height: 6),
        Container(
          height: 90,
          decoration: BoxDecoration(
            color: const Color(0xFF050505),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.inputBorder),
          ),
          child: const Icon(Ionicons.document_outline, color: AppColors.textGray400),
        ),
      ],
    );
  }

  Widget _fullButton(String label, IconData icon, Color color) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => Navigator.pop(context),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 8),
            Text(label,
                style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w800, color: color)),
          ],
        ),
      ),
    );
  }
}

class _Rec {
  final String fullName;
  final String username;
  final String status;
  final String docType;
  final String country;
  final String email;
  const _Rec(this.fullName, this.username, this.status, this.docType, this.country, this.email);
}
