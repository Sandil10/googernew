import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// dashboard/admin/ads -> AdminAdsScreen
/// Review and approve user-submitted ads (demo data).
class AdminAdsScreen extends StatefulWidget {
  const AdminAdsScreen({super.key});

  @override
  State<AdminAdsScreen> createState() => _AdminAdsScreenState();
}

class _AdminAdsScreenState extends State<AdminAdsScreen> {
  static const _tabs = [
    'All', 'Under Review', 'Active', 'Paused', 'Removed', 'Completed', 'Expired', 'Cancelled',
  ];
  String _filter = 'Under Review';

  final List<_Ad> _ads = const [
    _Ad('Ginger Candy Promo', 'gingerco', 'Product Promote', 'Under Review'),
    _Ad('Summer Sale Campaign', 'sunbrand', 'Photo and Video', 'Under Review'),
    _Ad('New Launch Reveal', 'techzone', 'Flash Content', 'Active'),
    _Ad('Profile Boost', 'creator_x', 'Profile Promote', 'Paused'),
    _Ad('Vault Drop 01', 'artgallery', 'Vault Content', 'Completed'),
    _Ad('Old Winter Sale', 'coldwear', 'Photo and Video', 'Expired'),
  ];

  Color _statusColor(String s) {
    switch (s) {
      case 'Under Review':
        return const Color(0xFFFBBF24); // amber
      case 'Active':
        return AppColors.successGreen;
      case 'Paused':
        return const Color(0xFF60A5FA); // blue
      case 'Removed':
        return const Color(0xFFFB923C); // orange
      case 'Cancelled':
        return AppColors.likeRed;
      default:
        return AppColors.textGray400;
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered =
        _filter == 'All' ? _ads : _ads.where((a) => a.status == _filter).toList();
    final pending = _ads.where((a) => a.status == 'Under Review').length;

    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 18, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text('Ad Management',
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        actions: [
          if (pending > 0)
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFBBF24).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(9999),
                    border: Border.all(color: const Color(0xFFFBBF24).withOpacity(0.25)),
                  ),
                  child: Text('$pending pending',
                      style: const TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFFFBBF24))),
                ),
              ),
            ),
        ],
        bottom: const PreferredSize(
            preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: Column(
        children: [
          const SizedBox(height: 12),
          SizedBox(
            height: 34,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _tabs.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final tab = _tabs[i];
                final selected = _filter == tab;
                final count = tab == 'All'
                    ? _ads.length
                    : _ads.where((a) => a.status == tab).length;
                return InkWell(
                  borderRadius: BorderRadius.circular(9999),
                  onTap: () => setState(() => _filter = tab),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: selected ? Colors.white : Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(9999),
                      border: Border.all(
                          color: selected ? Colors.white : AppColors.borderWhite10),
                    ),
                    child: Row(
                      children: [
                        Text(tab,
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                                color: selected ? Colors.black : AppColors.textGray400)),
                        if (count > 0) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                              color: selected
                                  ? Colors.black.withOpacity(0.15)
                                  : Colors.white.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(9999),
                            ),
                            child: Text('$count',
                                style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    color: selected ? Colors.black : AppColors.textGray400)),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: filtered.isEmpty
                ? const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Ionicons.file_tray_outline, size: 40, color: AppColors.textGray600),
                        SizedBox(height: 12),
                        Text('No ads found',
                            style: TextStyle(fontSize: 13, color: AppColors.textGray500)),
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _adRow(filtered[i]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _adRow(_Ad ad) {
    final c = _statusColor(ad.status);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => _openDetail(ad),
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
              height: 52,
              width: 52,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Ionicons.image_outline, color: AppColors.textGray600),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(ad.title,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white)),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: c.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(9999),
                          border: Border.all(color: c.withOpacity(0.2)),
                        ),
                        child: Text(ad.status,
                            style: TextStyle(
                                fontSize: 10, fontWeight: FontWeight.w800, color: c)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('@${ad.owner} · ${ad.type}',
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, color: AppColors.textGray500)),
                ],
              ),
            ),
            const Icon(Ionicons.chevron_forward_outline, size: 16, color: AppColors.textGray600),
          ],
        ),
      ),
    );
  }

  void _openDetail(_Ad ad) {
    final c = _statusColor(ad.status);
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('Ad Details',
                    style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Ionicons.close_outline, color: AppColors.textGray400),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            Container(
              height: 160,
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Ionicons.image_outline, size: 40, color: AppColors.textGray600),
            ),
            const SizedBox(height: 16),
            _detailField('Owner', '@${ad.owner}'),
            _detailField('Type', ad.type),
            _detailField('Status', ad.status),
            _detailField('Budget', '₹500'),
            _detailField('Duration', '7 days'),
            const SizedBox(height: 16),
            if (ad.status == 'Under Review')
              Row(
                children: [
                  Expanded(
                    child: _actionButton('Approve', AppColors.successGreen, filled: true),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _actionButton('Reject', AppColors.likeRed, filled: false),
                  ),
                ],
              )
            else
              _actionButton(ad.status == 'Paused' ? 'Resume' : 'Pause', c, filled: false),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _detailField(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.textGray500)),
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

  Widget _actionButton(String label, Color color, {required bool filled}) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => Navigator.pop(context),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled ? color : color.withOpacity(0.15),
          borderRadius: BorderRadius.circular(16),
          border: filled ? null : Border.all(color: color.withOpacity(0.3)),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: filled ? Colors.white : color)),
      ),
    );
  }
}

class _Ad {
  final String title;
  final String owner;
  final String type;
  final String status;
  const _Ad(this.title, this.owner, this.type, this.status);
}
