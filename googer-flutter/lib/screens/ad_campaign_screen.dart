import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../theme/colors.dart';
import '../util/goog_link_preview.dart';
import '../util/open_link.dart';
import '../util/subscription_limits.dart';
import '../widgets/upgrade_plan_sheet.dart';
import 'add_product_screen.dart';
import 'flash_content_screen.dart';
import 'photo_video_ad_screen.dart';
import 'product_promote_screen.dart';
import 'profile_promote_screen.dart';
import 'upload_content_screen.dart';

/// 1i · Ad Campaign
class AdCampaignScreen extends StatelessWidget {
  const AdCampaignScreen({super.key});

  static void showCreateSheet(
    BuildContext context, {
    VoidCallback? onGoogPosted,
  }) => _quickCreateSheet(context, onGoogPosted: onGoogPosted);

  static void showWriteGoogDialog(
    BuildContext context, {
    Map<String, dynamic>? features,
    String initialText = '',
    Color initialColor = Colors.white,
    Future<String?> Function(String text, String colorHex)? submit,
    VoidCallback? onPosted,
  }) => _showWriteGoogPopup(
    context,
    featuresOverride: features,
    initialText: initialText,
    initialColor: initialColor,
    submit: submit,
    onPosted: onPosted,
  );

  static void _quickCreateSheet(
    BuildContext context, {
    VoidCallback? onGoogPosted,
  }) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.35),
      builder: (sheetCtx) {
        Widget action(
          String label,
          IconData icon,
          Future<void> Function() onTap,
        ) {
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
                      color: Colors.white.withValues(alpha: 0.08),
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
                      fontWeight: FontWeight.w600,
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
                        child: action(
                          'New Goog',
                          Ionicons.create_outline,
                          () async {
                            if (!context.mounted || !sheetCtx.mounted) return;
                            final usage = await Api.mySubscriptionUsage();
                            if (!context.mounted || !sheetCtx.mounted) return;
                            Navigator.pop(sheetCtx);
                            if (usage?['googAtLimit'] == true) {
                              _showGoogUpgradePrompt(context);
                            } else {
                              _showWriteGoogPopup(
                                context,
                                onPosted: onGoogPosted,
                              );
                            }
                          },
                        ),
                      ),
                      SizedBox(
                        width: tileWidth,
                        child: action(
                          'Ad Campaign',
                          Ionicons.megaphone_outline,
                          () async {
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
                        // Was pointing at SellScreen — the P2P coin marketplace,
                        // not a product listing form.
                        child: action(
                          'Add Product',
                          Ionicons.cube_outline,
                          () async {
                            final usage = await Api.mySubscriptionUsage();
                            if (!context.mounted || !sheetCtx.mounted) return;
                            Navigator.pop(sheetCtx);
                            if (usage?['productAtLimit'] == true) {
                              _showProductUpgradePrompt(context);
                            } else {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => const AddProductScreen(),
                                ),
                              );
                            }
                          },
                        ),
                      ),
                      SizedBox(
                        width: tileWidth,
                        child: action(
                          'Upload Content',
                          Ionicons.cloud_upload_outline,
                          () async {
                            Navigator.pop(sheetCtx);
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => const FlashContentScreen(),
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

  static bool _isGoogLimitError(String error) {
    final lower = error.toLowerCase();
    return lower.contains('daily goog posting limit') ||
        lower.contains('total goog posting limit') ||
        lower.contains('goog posting limit reached') ||
        (lower.contains('posting limit') && !lower.contains('colored'));
  }

  static bool _hasFiniteGoogPostingLimit(Map<String, dynamic> features) {
    bool finiteLimit(String key) {
      final raw = features[key];
      final value = raw is num ? raw.toInt() : int.tryParse('$raw');
      return value != null && value > 0 && value < 999999;
    }

    return finiteLimit('goog_posting_daily_limit') ||
        finiteLimit('goog_posting_total_limit') ||
        finiteLimit('write_goog_limit');
  }

  static void _showWriteGoogPopup(
    BuildContext context, {
    Map<String, dynamic>? featuresOverride,
    String initialText = '',
    Color initialColor = Colors.white,
    Future<String?> Function(String text, String colorHex)? submit,
    VoidCallback? onPosted,
  }) {
    final controller = TextEditingController(text: initialText);
    final featuresFuture = featuresOverride == null
        ? Api.myFeatures()
        : Future<Map<String, dynamic>?>.value(featuresOverride);
    Color selected = initialColor;
    var posting = false;
    var colorPage = 0;
    String? errorText;
    var limitPromptShown = false;
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.68),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (context, setState) => FutureBuilder<Map<String, dynamic>?>(
          future: featuresFuture,
          builder: (context, snapshot) {
            final features = snapshot.data ?? const <String, dynamic>{};
            final googLetterLimit = _featureInt(
              features,
              'goog_letter_limit',
              75,
            );
            final colorLimit = _featureIntAllowZero(
              features,
              'write_goog_color_limit',
              10,
            );
            final colors = _googTextColors(colorLimit);
            final linkPreview = googLinkPreview(controller.text);
            if (!colors.any((c) => c.toARGB32() == selected.toARGB32())) {
              selected = colors.first;
            }
            final pageCount = ((colors.length + 9) ~/ 10).clamp(1, 1000000);
            if (colorPage > pageCount - 1) colorPage = pageCount - 1;
            final visibleColors = colors
                .skip(colorPage * 10)
                .take(10)
                .toList(growable: false);
            void setColorPageClamped(int nextPage) {
              setState(() {
                if (nextPage < 0) {
                  colorPage = 0;
                } else if (nextPage >= pageCount) {
                  colorPage = pageCount - 1;
                } else {
                  colorPage = nextPage;
                }
              });
            }

            return Dialog(
              insetPadding: const EdgeInsets.symmetric(horizontal: 12),
              backgroundColor: const Color(0xFF151416),
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
                      padding: const EdgeInsets.symmetric(horizontal: 14),
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
                                horizontal: 16,
                                vertical: 8,
                              ),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                            child: const Text(
                              'CANCEL',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.1,
                              ),
                            ),
                          ),
                          Expanded(
                            child: Center(
                              child: Text(
                                submit == null ? 'Write a Goog' : 'Edit Goog',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.4,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 84),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _currentUserAvatar(),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Container(
                              height: 96,
                              color: const Color(0xFF08090B),
                              child: TextField(
                                controller: controller,
                                minLines: 3,
                                maxLines: 4,
                                onChanged: (value) {
                                  if (value.length > googLetterLimit) {
                                    final next = value.substring(
                                      0,
                                      googLetterLimit,
                                    );
                                    controller.value = TextEditingValue(
                                      text: next,
                                      selection: TextSelection.collapsed(
                                        offset: next.length,
                                      ),
                                    );
                                    setState(() {});
                                  } else {
                                    setState(() {});
                                  }
                                  if (value.length > googLetterLimit &&
                                      !limitPromptShown) {
                                    limitPromptShown = true;
                                    _showGoogUpgradePrompt(sheetCtx);
                                  }
                                },
                                style: TextStyle(
                                  fontSize: 14,
                                  height: 1.25,
                                  color: selected,
                                  fontWeight: FontWeight.w700,
                                ),
                                decoration: const InputDecoration(
                                  hintText: 'Write a Goog',
                                  hintStyle: TextStyle(
                                    color: AppColors.textGray400,
                                    fontWeight: FontWeight.w800,
                                  ),
                                  counterText: '',
                                  filled: true,
                                  fillColor: Color(0xFF08090B),
                                  contentPadding: EdgeInsets.fromLTRB(
                                    0,
                                    4,
                                    10,
                                    8,
                                  ),
                                  border: InputBorder.none,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (linkPreview != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                        child: _WriteGoogLinkPreview(preview: linkPreview),
                      ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                      child: Row(
                        children: [
                          const Text(
                            'Color',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: AppColors.textGray500,
                            ),
                          ),
                          const SizedBox(width: 8),
                          _ColorPageButton(
                            label: '<',
                            enabled: colorPage > 0,
                            onTap: () => setColorPageClamped(colorPage - 1),
                          ),
                          const SizedBox(width: 5),
                          Expanded(
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              physics: const NeverScrollableScrollPhysics(),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  for (final color in visibleColors)
                                    Padding(
                                      padding: const EdgeInsets.only(right: 5),
                                      child: GestureDetector(
                                        onTap: () =>
                                            setState(() => selected = color),
                                        child: Container(
                                          width: 16,
                                          height: 16,
                                          decoration: BoxDecoration(
                                            color: color,
                                            borderRadius: BorderRadius.circular(
                                              4,
                                            ),
                                            border: Border.all(
                                              color:
                                                  selected.toARGB32() ==
                                                      color.toARGB32()
                                                  ? Colors.white
                                                  : Colors.white24,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 5),
                          _ColorPageButton(
                            label: '>',
                            enabled: colorPage < pageCount - 1,
                            onTap: () => setColorPageClamped(colorPage + 1),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            '${controller.text.length}/$googLetterLimit',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color:
                                  subscriptionTextLimitExceeded(
                                    controller.text.length,
                                    googLetterLimit,
                                  )
                                  ? AppColors.likeRed
                                  : AppColors.textGray500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
                      decoration: const BoxDecoration(
                        color: Color(0xFF0F0F10),
                        border: Border(
                          top: BorderSide(color: AppColors.borderWhite06),
                        ),
                      ),
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: ElevatedButton(
                          onPressed: posting
                              ? null
                              : () async {
                                  final text = controller.text.trim();
                                  if (text.isEmpty) return;
                                  setState(() {
                                    posting = true;
                                    errorText = null;
                                  });
                                  final colorHex = _hex(selected);
                                  final error = submit == null
                                      ? await Api.createGoog(text, colorHex)
                                      : await submit(text, colorHex);
                                  if (!context.mounted) return;
                                  if (error == null) {
                                    Navigator.pop(sheetCtx);
                                    onPosted?.call();
                                    return;
                                  }
                                  if (_isGoogLimitError(error) &&
                                      _hasFiniteGoogPostingLimit(features)) {
                                    Navigator.pop(sheetCtx);
                                    _showGoogUpgradePrompt(context);
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
                            disabledBackgroundColor: Colors.white38,
                            disabledForegroundColor: Colors.black54,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(999),
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 8,
                            ),
                          ),
                          child: Text(
                            posting ? 'POSTING' : 'POST NOW',
                            style: const TextStyle(
                              fontSize: 8,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1,
                            ),
                          ),
                        ),
                      ),
                    ),
                    if (errorText != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            errorText!,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.likeRed,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  static Widget _currentUserAvatar() {
    final picture = Api.rawAvatar(Api.user ?? const {});
    final resolved = picture == null || picture.trim().isEmpty
        ? ''
        : Api.resolveAvatar(picture);
    final bytes = Api.decodeDataUri(resolved);
    final label = (Api.user?['full_name'] ?? Api.username)
        .toString()
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();
    return Container(
      width: 42,
      height: 42,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.07),
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: resolved.isEmpty
          ? Center(
              child: Text(
                label.isEmpty ? 'G' : label,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                ),
              ),
            )
          : bytes != null
          ? Image.memory(bytes, fit: BoxFit.cover)
          : Image.network(
              resolved,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) =>
                  const Icon(Ionicons.person, size: 18, color: Colors.white),
            ),
    );
  }

  static int _featureInt(
    Map<String, dynamic> features,
    String key,
    int fallback,
  ) {
    final raw = features[key];
    final parsed = raw is num ? raw.toInt() : int.tryParse('$raw');
    if (parsed == null || parsed <= 0) return fallback;
    return parsed;
  }

  static int _featureIntAllowZero(
    Map<String, dynamic> features,
    String key,
    int fallback,
  ) {
    final raw = features[key];
    final parsed = raw is num ? raw.toInt() : int.tryParse('$raw');
    if (parsed == null || parsed < 0) return fallback;
    return parsed;
  }

  static List<Color> _googTextColors(int count) {
    final total = count.clamp(1, 100);
    return List<Color>.generate(total, (i) {
      final hue = total == 1 ? 0.0 : ((360 * i) / total).roundToDouble();
      return HSLColor.fromAHSL(1, hue, 0.85, 0.65).toColor();
    });
  }

  static void _showGoogUpgradePrompt(BuildContext context) {
    UpgradePlanSheet.show(
      context,
      subtitle: 'Subscribe to post more Googs',
      limitMessage:
          'If you have reached your Goog posting limit, please subscribe to a higher plan below.',
    );
  }

  static void _showProductUpgradePrompt(BuildContext context) {
    UpgradePlanSheet.show(
      context,
      subtitle: 'Subscribe to list more products',
      limitMessage:
          'If you have reached your product upload limit, please subscribe to a higher plan below.',
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
                      fontWeight: FontWeight.w500,
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
                  color: statusColor.withValues(alpha: 0.2),
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

class _WriteGoogLinkPreview extends StatelessWidget {
  const _WriteGoogLinkPreview({required this.preview});

  final GoogLinkPreviewData preview;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      key: const Key('write-goog-link-preview'),
      borderRadius: BorderRadius.circular(12),
      onTap: () => openExternalLink(preview.href),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: preview.videoThumbnail != null
                  ? Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.network(
                          preview.videoThumbnail!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                            Ionicons.videocam,
                            size: 16,
                            color: Colors.white70,
                          ),
                        ),
                        const ColoredBox(color: Color(0x33000000)),
                        const Icon(
                          Ionicons.play,
                          size: 12,
                          color: Colors.white,
                        ),
                      ],
                    )
                  : Image.network(
                      preview.favicon,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => Icon(
                        preview.isVideo
                            ? Ionicons.videocam
                            : Ionicons.link_outline,
                        size: 16,
                        color: Colors.white70,
                      ),
                    ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          preview.host,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      if (preview.videoLabel != null) ...[
                        const SizedBox(width: 5),
                        Text(
                          preview.videoLabel!,
                          style: const TextStyle(
                            fontSize: 8,
                            fontWeight: FontWeight.w700,
                            color: AppColors.textGray400,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    preview.pathLabel.isEmpty
                        ? preview.href
                        : preview.pathLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 9,
                      color: AppColors.textGray500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 6),
            const Icon(
              Ionicons.open_outline,
              size: 14,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }
}

class _ColorPageButton extends StatelessWidget {
  const _ColorPageButton({
    required this.label,
    required this.enabled,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: SizedBox(
        width: 18,
        height: 20,
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w900,
              color: enabled ? Colors.white70 : Colors.white24,
            ),
          ),
        ),
      ),
    );
  }
}
