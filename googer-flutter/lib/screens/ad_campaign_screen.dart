import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../theme/colors.dart';
import 'flash_content_screen.dart';
import 'photo_video_ad_screen.dart';
import 'product_promote_screen.dart';
import 'profile_promote_screen.dart';
import 'sell_screen.dart';
import 'upload_content_screen.dart';

/// 1i · Ad Campaign
class AdCampaignScreen extends StatelessWidget {
  const AdCampaignScreen({super.key});

  static void showCreateSheet(
    BuildContext context, {
    VoidCallback? onGoogPosted,
  }) => _quickCreateSheet(context, onGoogPosted: onGoogPosted);

  static void _quickCreateSheet(
    BuildContext context, {
    VoidCallback? onGoogPosted,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(0.35),
      builder: (sheetCtx) {
        Widget action(String label, IconData icon, VoidCallback onTap) {
          return InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: Container(
              height: 72,
              decoration: BoxDecoration(
                color: const Color(0xFF1F2024),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderWhite06),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, size: 18, color: Colors.white),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    label.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.9,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
            child: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFF15161A),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: AppColors.borderWhite10),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black54,
                    blurRadius: 24,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final tileWidth = (constraints.maxWidth - 8) / 2;
                  return Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      SizedBox(
                        width: tileWidth,
                        child: action('New Goog', Ionicons.create_outline, () {
                          Navigator.pop(sheetCtx);
                          _showWriteGoogPopup(context, onPosted: onGoogPosted);
                        }),
                      ),
                      SizedBox(
                        width: tileWidth,
                        child: action(
                          'Ad Campaign',
                          Ionicons.megaphone_outline,
                          () {
                            Navigator.pop(sheetCtx);
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const PhotoVideoAdScreen(),
                              ),
                            );
                          },
                        ),
                      ),
                      SizedBox(
                        width: tileWidth,
                        child: action('Add Product', Ionicons.cube_outline, () {
                          Navigator.pop(sheetCtx);
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const SellScreen(),
                            ),
                          );
                        }),
                      ),
                      SizedBox(
                        width: tileWidth,
                        child: action(
                          'Upload Content',
                          Ionicons.cloud_upload_outline,
                          () {
                            Navigator.pop(sheetCtx);
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const UploadContentScreen(),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  static void _showWriteGoogPopup(
    BuildContext context, {
    VoidCallback? onPosted,
  }) {
    final controller = TextEditingController();
    Color selected = Colors.white;
    var posting = false;
    String? errorText;
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.68),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (context, setState) => Dialog(
          insetPadding: const EdgeInsets.symmetric(horizontal: 10),
          backgroundColor: const Color(0xFF111113),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
            side: const BorderSide(color: AppColors.borderWhite10),
          ),
          child: Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  height: 56,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: const BoxDecoration(
                    border: Border(
                      bottom: BorderSide(color: AppColors.borderWhite06),
                    ),
                  ),
                  child: Row(
                    children: [
                      TextButton(
                        onPressed: () => Navigator.pop(sheetCtx),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.white,
                          backgroundColor: AppColors.likeRed,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 13,
                            vertical: 7,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999),
                          ),
                        ),
                        child: const Text(
                          'Cancel',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      const Expanded(
                        child: Center(
                          child: Text(
                            'New Goog',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 72),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                  child: TextField(
                    controller: controller,
                    maxLength: 200,
                    minLines: 8,
                    maxLines: 10,
                    style: TextStyle(
                      fontSize: 15,
                      height: 1.35,
                      color: selected,
                      fontWeight: FontWeight.w600,
                    ),
                    decoration: InputDecoration(
                      hintText: 'Write a Goog',
                      hintStyle: const TextStyle(
                        color: AppColors.textGray500,
                        fontWeight: FontWeight.w700,
                      ),
                      counterStyle: const TextStyle(
                        color: AppColors.textGray500,
                        fontSize: 10,
                      ),
                      filled: true,
                      fillColor: Colors.black.withOpacity(0.42),
                      contentPadding: const EdgeInsets.all(14),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: AppColors.borderWhite06,
                        ),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: const BorderSide(
                          color: AppColors.borderWhite10,
                        ),
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 0, 18, 16),
                  child: Row(
                    children: [
                      const Text(
                        'Color',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          color: AppColors.textGray500,
                        ),
                      ),
                      const SizedBox(width: 16),
                      for (final color in const [
                        Colors.white,
                        Color(0xFFFF5B63),
                        Color(0xFF4ADE80),
                        Color(0xFF6366F1),
                      ])
                        GestureDetector(
                          onTap: () => setState(() => selected = color),
                          child: Container(
                            width: 18,
                            height: 18,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: selected == color
                                    ? AppColors.likeRed
                                    : AppColors.borderWhite10,
                              ),
                            ),
                          ),
                        ),
                      const Spacer(),
                      ElevatedButton(
                        onPressed: posting
                            ? null
                            : () async {
                                final text = controller.text.trim();
                                if (text.isEmpty) return;
                                setState(() {
                                  posting = true;
                                  errorText = null;
                                });
                                final error = await Api.createGoog(
                                  text,
                                  _hex(selected),
                                );
                                if (!context.mounted) return;
                                if (error == null) {
                                  Navigator.pop(sheetCtx);
                                  onPosted?.call();
                                  return;
                                }
                                setState(() {
                                  posting = false;
                                  errorText = error;
                                });
                              },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999),
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 13,
                            vertical: 7,
                          ),
                        ),
                        child: Text(
                          posting ? 'POSTING' : 'Post Now',
                          style: const TextStyle(
                            fontSize: 8.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (errorText != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(22, 0, 22, 14),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        errorText!,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.likeRed,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _hex(Color color) {
    return '#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';
  }

  static void _chooseCampaignType(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bg3,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetCtx) {
        Widget tile(String title, String subtitle, IconData icon, Widget dest) {
          return InkWell(
            onTap: () {
              Navigator.pop(sheetCtx);
              Navigator.push(context, MaterialPageRoute(builder: (_) => dest));
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: AppColors.purpleBg15,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(icon, size: 18, color: AppColors.purpleText),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.textGray500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Ionicons.chevron_forward,
                    size: 15,
                    color: AppColors.textGray500,
                  ),
                ],
              ),
            ),
          );
        }

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(18, 16, 18, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Create Campaign',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              tile(
                'Flash Content',
                'Short-lived video ad',
                Ionicons.flash_outline,
                const FlashContentScreen(),
              ),
              tile(
                'Photo / Video Ad',
                'Standard media campaign',
                Ionicons.images_outline,
                const PhotoVideoAdScreen(),
              ),
              tile(
                'Product Promote',
                'Boost a shop product',
                Ionicons.pricetag_outline,
                const ProductPromoteScreen(),
              ),
              tile(
                'Profile Promote',
                'Grow your audience',
                Ionicons.person_outline,
                const ProfilePromoteScreen(),
              ),
              tile(
                'Upload Content',
                'Vault / subscriber content',
                Ionicons.cloud_upload_outline,
                const UploadContentScreen(),
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        title: const Text(
          'Ad Campaigns',
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
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
          _campaignCard(
            'Ginger Candy Promo',
            '2,450 impressions',
            '₹500',
            AppColors.successGreen,
            'Active',
          ),
          _campaignCard(
            'Summer Sale Campaign',
            '1,200 impressions',
            '₹300',
            AppColors.utilityBlue,
            'Paused',
          ),
          _campaignCard(
            'New Product Launch',
            '450 impressions',
            '₹200',
            AppColors.likeRed,
            'Ended',
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () => _chooseCampaignType(context),
            icon: const Icon(Ionicons.add_circle_outline),
            label: const Text('Create New Campaign'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.accentPurple,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(9999),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _campaignCard(
    String title,
    String stats,
    String budget,
    Color statusColor,
    String status,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.bg2,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            stats,
            style: const TextStyle(fontSize: 11, color: AppColors.textGray500),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                budget,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              Icon(
                Icons.arrow_forward_ios,
                size: 14,
                color: AppColors.textGray600,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
