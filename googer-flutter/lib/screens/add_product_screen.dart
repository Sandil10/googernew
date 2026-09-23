import 'dart:math' show min;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/upload_picker.dart';
import '../util/video_trim.dart';
import '../widgets/upgrade_plan_sheet.dart';

/// Add Listing — mobile port of the web `AddProductModal`.
///
/// The web modal is one 200 KB component; this mirrors its section order
/// (Media → Product Information → Logistics → Payments → Commissions) and,
/// importantly, its submit contract. `POST /market/create` pairs uploaded files
/// with `variants_data` entries **positionally**: the backend walks the variant
/// list and consumes `req.files[i]` for each variant still pointing at a
/// `blob:` URL (`marketController.js:1668`). Variant order and file order must
/// therefore stay in lockstep — see [_buildVariantsPayload].
class AddProductScreen extends StatefulWidget {
  /// Called after a successful create so the caller can refresh its list.
  final VoidCallback? onCreated;

  const AddProductScreen({super.key, this.onCreated});

  @override
  State<AddProductScreen> createState() => _AddProductScreenState();
}

/// One media slot: an uploaded file, or an external link.
class _MediaSlot {
  ApiUploadFile? file;
  String mediaType; // 'image' | 'video'
  String linkUrl; // set when the media came from a pasted link
  String color = 'None';

  _MediaSlot({this.file, this.mediaType = 'image', this.linkUrl = ''});

  bool get needsUpload => file != null;
}

/// A size/UOM row inside a variant, each carrying its own stock.
class _Selection {
  String kind = 'Size'; // 'Size' | 'UOM'
  String value = '';
  String detail = '';
  String stock = '';

  _Selection({this.kind = 'Size', this.value = ''});

  bool get isComplete =>
      value.trim().isNotEmpty &&
      detail.trim().isNotEmpty &&
      (int.tryParse(stock.trim()) ?? 0) > 0;

  Map<String, dynamic> toJson() => {
    'type': kind.toLowerCase(),
    'value': value.trim(),
    'detail': detail.trim(),
    'stock': int.tryParse(stock.trim()) ?? 0,
    'quantity': int.tryParse(stock.trim()) ?? 0,
  };
}

class _ShippingRow {
  String country;
  String charge = '0';
  String date = '';
  String customDate = '';
  bool free = true;

  _ShippingRow({required this.country});

  Map<String, dynamic> toJson() => {
    'country': country,
    'charge': free ? '0' : (charge.trim().isEmpty ? '0' : charge.trim()),
    'price': free ? '0' : (charge.trim().isEmpty ? '0' : charge.trim()),
    'date': date == 'Custom' ? customDate.trim() : date,
  };
}

class _AddProductScreenState extends State<AddProductScreen> {
  static const _accent = Color(0xFFF43F5E);
  static const _webPanel = Color(0xFF1A1A1A);
  static const _webField = Color(0xFF0F0F10);
  static const _webInput = Color(0xFF050507);
  static const _webSheet = Color(0xFF0B0B0C);
  static const _webBlue = Color(0xFF3A3A3D);
  static const _webSoftBlue = Color(0xFFA1A1AA);
  static const _maxMedia = 5;

  // ---- Media / variants ----
  /// null until the user picks Single or Variants — the web gates all media
  /// behind this choice ("CHOOSE MODE / WAIT, FIRST CHOICE REQUIRED").
  String? _uploadMode; // 'single' | 'variants'
  final List<_MediaSlot> _media = [];
  final List<List<_Selection>> _selections = [];
  int _activeIndex = 0;

  // ---- Product information ----
  final _title = TextEditingController();
  final _description = TextEditingController();
  String _category = '';
  String _subCategory = '';
  String _level3Category = '';
  final String _manualCategory = '';
  final _price = TextEditingController();
  final _promoPrice = TextEditingController();

  List<Map<String, dynamic>> _categoryTree = const [];
  bool _categoriesLoading = true;
  bool _manualGoogerCommissionEnabled = false;
  double _globalGoogerCommission = 0;

  // ---- Logistics ----
  final List<_ShippingRow> _shipping = [_ShippingRow(country: 'Sri Lanka')];
  bool _unifiedShipping = false;
  final _unifiedCharge = TextEditingController();
  String _unifiedDate = '';
  final _customUnifiedDate = TextEditingController();
  String _warranty = 'No Warranty';
  final _customWarranty = TextEditingController();
  String _returnPolicy = '';

  // ---- Payments / commissions ----
  final Set<String> _paymentMethods = {'wallet'};
  final _resellPercentage = TextEditingController();
  final _resellAmount = TextEditingController();
  final _googerCommission = TextEditingController(text: '0');
  final _productDiscount = TextEditingController(text: '0');

  // ---- Submit ----
  bool _submitting = false;
  bool _trimming = false;
  final Set<String> _errors = {};

  static const _sizes = ['S', 'M', 'L', 'XL', 'XXL', 'Kg', 'Gram', 'mm', 'cm'];
  static const _uoms = [
    'Piece',
    'Pair',
    'Set',
    'Kg',
    'Gram',
    'Litre',
    'ML',
    'Pack',
    'Box',
    'Dozon',
    'Metre',
    'Yard',
    'Foot',
    'Inch',
    'mm',
    'cm',
    'Sq Ft',
    'Roll',
    'Bundle',
    'Bag',
    'Bottle',
    'Can',
    'Carton',
    'Pallet',
    'Unit',
    'Service',
    'Hour',
    'Day',
    'Month',
  ];
  static const _deliveryOptions = [
    '1-3 days',
    '1-5 days',
    '1-7 days',
    '1-14 days',
    '1-21 days',
    '1-30 days',
    'Custom',
  ];
  static const _returnOptions = [
    '1 day',
    '2 days',
    '3 days',
    '4 days',
    '5 days',
    '6 days',
    '7 days',
    '14 days',
    '30 days',
    'No Return',
  ];
  static const _warrantyOptions = [
    'No Warranty',
    '7 Days',
    '1 Month',
    '3 Months',
    '6 Months',
    '1 Year',
    '2 Years',
    'Custom',
  ];
  static const _paymentOptions = <String, (String, IconData)>{
    'wallet': ('Rupieer Payments', Ionicons.wallet_outline),
    'cod': ('Cash on Delivery', Ionicons.cash_outline),
    'card': ('Credit/Debit Card', Ionicons.card_outline),
  };
  static const _colorNames = [
    'None',
    'Black',
    'White',
    'Red',
    'Blue',
    'Green',
    'Yellow',
    'Orange',
    'Purple',
    'Pink',
    'Grey',
    'Brown',
    'Beige',
    'Navy',
    'Gold',
    'Silver',
  ];

  @override
  void initState() {
    super.initState();
    _guardProductLimit();
    _loadCategories();
    _loadCommissionSettings();
  }

  Future<void> _guardProductLimit() async {
    final usage = await Api.mySubscriptionUsage();
    if (!mounted || usage?['productAtLimit'] != true) return;
    Navigator.maybePop(context);
    UpgradePlanSheet.show(
      context,
      subtitle: 'Subscribe to list more products',
      limitMessage:
          'If you have reached your product upload limit, please subscribe to a higher plan below.',
    );
  }

  Future<void> _loadCommissionSettings() async {
    final results = await Future.wait([
      Api.globalCategoryCommission(),
      Api.manualCategoryCommissionEnabled(),
    ]);
    if (!mounted) return;
    setState(() {
      _globalGoogerCommission = results[0] as double;
      _manualGoogerCommissionEnabled = results[1] as bool;
      if (_manualGoogerCommissionEnabled) {
        _googerCommission.clear();
      }
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _price.dispose();
    _promoPrice.dispose();
    _unifiedCharge.dispose();
    _customUnifiedDate.dispose();
    _customWarranty.dispose();
    _resellPercentage.dispose();
    _resellAmount.dispose();
    _googerCommission.dispose();
    _productDiscount.dispose();
    for (final slot in _media) {
      if (slot.linkUrl.startsWith('blob:')) releaseVideoUrl(slot.linkUrl);
    }
    super.dispose();
  }

  Future<void> _loadCategories() async {
    final tree = await Api.categoryTree();
    if (!mounted) return;
    setState(() {
      _categoryTree = tree;
      _categoriesLoading = false;
    });
  }

  // ---- Category tree helpers ----

  List<Map<String, dynamic>> _childrenOf(String? parentName) {
    if (parentName == null || parentName.isEmpty) return _categoryTree;
    Map<String, dynamic>? find(List<Map<String, dynamic>> nodes, String name) {
      for (final node in nodes) {
        if ('${node['name']}' == name) return node;
        final kids = _asNodes(node['children']);
        final hit = find(kids, name);
        if (hit != null) return hit;
      }
      return null;
    }

    final node = find(_categoryTree, parentName);
    return node == null ? const [] : _asNodes(node['children']);
  }

  List<Map<String, dynamic>> _asNodes(dynamic value) => value is List
      ? value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
      : const [];

  List<String> _namesOf(List<Map<String, dynamic>> nodes) =>
      nodes.map((n) => '${n['name']}').where((n) => n.isNotEmpty).toList();

  String _formatNumber(num value) =>
      value % 1 == 0 ? value.toInt().toString() : value.toStringAsFixed(2);

  Map<String, dynamic>? _categoryNamed(String name) {
    for (final node in _categoryTree) {
      if ('${node['name']}' == name) return node;
    }
    return null;
  }

  // ---- Build ----

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        bottom: false,
        child: Container(
          margin: const EdgeInsets.fromLTRB(10, 4, 10, 0),
          decoration: BoxDecoration(
            color: _webPanel,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              _header(),
              const Divider(height: 1, color: AppColors.borderWhite10),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 30),
                  children: [
                    _mediaSection(),
                    const SizedBox(height: 14),
                    _productInformationSection(),
                    const SizedBox(height: 14),
                    _logisticsSection(),
                    const SizedBox(height: 14),
                    _paymentSection(),
                    const SizedBox(height: 14),
                    _commissionSection(),
                    const SizedBox(height: 16),
                    _publishButton(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() {
    final variantCount = _media.length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Add Listing',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(
                      '${_media.length}/$_maxMedia IMAGES',
                      style: TextStyle(
                        fontSize: 7.8,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w900,
                        color: _errors.contains('images')
                            ? AppColors.likeRed
                            : AppColors.textGray500,
                      ),
                    ),
                    Text(
                      ' *',
                      style: TextStyle(
                        fontSize: 7.8,
                        fontWeight: FontWeight.w900,
                        color: AppColors.likeRed,
                      ),
                    ),
                    const Text(
                      '  •  ',
                      style: TextStyle(
                        fontSize: 7.8,
                        color: AppColors.textGray700,
                      ),
                    ),
                    Text(
                      '$variantCount VARIANTS',
                      style: const TextStyle(
                        fontSize: 7.8,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w900,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: _submitting ? null : () => Navigator.maybePop(context),
            child: Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
                border: Border.all(color: AppColors.likeRed, width: 2),
              ),
              child: const Icon(
                Ionicons.close_outline,
                size: 22,
                color: AppColors.likeRed,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---- Media ----

  Widget _mediaSection() {
    if (_uploadMode == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _chooseModeBox(),
          const SizedBox(height: 10),
          _initialAddTile(),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _activeMediaPreview(),
        const SizedBox(height: 12),
        _mediaStrip(),
        if (_media.isNotEmpty) ...[
          const SizedBox(height: 14),
          _variantEditor(),
        ],
      ],
    );
  }

  Widget _initialAddTile() {
    return GestureDetector(
      onTap: _openModeSheet,
      child: SizedBox(
        width: 60,
        child: Column(
          children: [
            Container(
              width: 52,
              height: 52,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: _webPanel,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _webBlue.withValues(alpha: 0.72)),
              ),
              child: const Icon(
                Ionicons.add_outline,
                size: 19,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'ADD NEW',
              style: TextStyle(
                fontSize: 6.5,
                letterSpacing: 0.9,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _chooseModeBox() {
    return GestureDetector(
      onTap: _openModeSheet,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 110,
        width: double.infinity,
        decoration: BoxDecoration(
          color: _webField,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: _errors.contains('images')
                ? AppColors.likeRed
                : _webBlue.withValues(alpha: 0.7),
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 62,
              height: 62,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
              ),
              child: const Icon(
                Ionicons.camera_outline,
                size: 25,
                color: AppColors.textGray400,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'CHOOSE MODE',
              style: TextStyle(
                fontSize: 10.5,
                letterSpacing: 1.6,
                fontWeight: FontWeight.w900,
                color: _webSoftBlue,
              ),
            ),
            const SizedBox(height: 5),
            const Text(
              'WAIT, FIRST CHOICE REQUIRED',
              style: TextStyle(
                fontSize: 7.5,
                letterSpacing: 1.1,
                fontStyle: FontStyle.italic,
                fontWeight: FontWeight.w500,
                color: _webBlue,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openModeSheet() {
    _sheet(
      title: 'CHOOSE MODE',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _modeTile(
            'Single Product',
            'One item, one set of sizes and stock.',
            Ionicons.cube_outline,
            'single',
          ),
          _modeTile(
            'Multiple Variants',
            'A separate image, colour and stock list per variant.',
            Ionicons.layers_outline,
            'variants',
          ),
          const SizedBox(height: 10),
        ],
      ),
    );
  }

  Widget _modeTile(String title, String subtitle, IconData icon, String mode) {
    return Material(
      color: Colors.transparent,
      child: ListTile(
        onTap: () {
          Navigator.maybePop(context);
          setState(() => _uploadMode = mode);
          _addMedia();
        },
        leading: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, size: 19, color: Colors.white),
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w500,
            color: Colors.white,
          ),
        ),
        subtitle: Text(
          subtitle,
          style: const TextStyle(fontSize: 10, color: AppColors.textGray500),
        ),
      ),
    );
  }

  Widget _activeMediaPreview() {
    if (_media.isEmpty) {
      return GestureDetector(
        onTap: _addMedia,
        behavior: HitTestBehavior.opaque,
        child: Container(
          height: 110,
          width: double.infinity,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: _webField,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: _errors.contains('images')
                  ? AppColors.likeRed
                  : _webBlue.withValues(alpha: 0.7),
            ),
          ),
          child: const Text(
            'ADD YOUR FIRST IMAGE OR VIDEO',
            style: TextStyle(
              fontSize: 9,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray500,
            ),
          ),
        ),
      );
    }

    final index = _activeIndex.clamp(0, _media.length - 1);
    final slot = _media[index];
    return Container(
      height: 110,
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          _slotThumb(slot, fit: BoxFit.cover),
          Positioned(
            left: 10,
            top: 10,
            child: Row(
              children: [
                _tag(slot.mediaType == 'video' ? 'VIDEO' : 'IMAGE'),
                if (slot.color != 'None') ...[
                  const SizedBox(width: 6),
                  _tag(slot.color.toUpperCase()),
                ],
              ],
            ),
          ),
          Positioned(
            right: 10,
            top: 10,
            child: GestureDetector(
              onTap: () => _removeMedia(index),
              child: Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.6),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: const Icon(
                  Ionicons.trash_outline,
                  size: 14,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tag(String text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: AppColors.borderWhite10),
    ),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 7,
        letterSpacing: 1.1,
        fontWeight: FontWeight.w600,
        color: Colors.white,
      ),
    ),
  );

  Widget _slotThumb(_MediaSlot slot, {BoxFit fit = BoxFit.cover}) {
    final bytes = slot.file?.bytes;
    if (slot.mediaType == 'video') {
      return Container(
        color: Colors.black,
        child: const Center(
          child: Icon(
            Ionicons.play_circle_outline,
            size: 34,
            color: AppColors.textGray500,
          ),
        ),
      );
    }
    if (bytes != null) return Image.memory(bytes, fit: fit);
    if (slot.linkUrl.isNotEmpty) {
      return Image.network(
        slot.linkUrl,
        fit: fit,
        errorBuilder: (_, __, ___) => const Center(
          child: Icon(
            Ionicons.image_outline,
            size: 26,
            color: AppColors.textGray600,
          ),
        ),
      );
    }
    return const Center(
      child: Icon(
        Ionicons.image_outline,
        size: 26,
        color: AppColors.textGray600,
      ),
    );
  }

  Widget _mediaStrip() {
    final canAddMore =
        _media.length < (_uploadMode == 'single' ? 1 : _maxMedia);
    return SizedBox(
      height: 64,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _media.length + (canAddMore ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) {
          if (i == _media.length) {
            return GestureDetector(
              onTap: _addMedia,
              child: Container(
                width: 60,
                decoration: BoxDecoration(
                  color: _webPanel,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _webBlue.withValues(alpha: 0.72)),
                ),
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Ionicons.add_outline, size: 19, color: Colors.white),
                    SizedBox(height: 4),
                    Text(
                      'ADD NEW',
                      style: TextStyle(
                        fontSize: 6.5,
                        letterSpacing: 0.9,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }
          final selected = i == _activeIndex;
          return GestureDetector(
            onTap: () => setState(() => _activeIndex = i),
            child: Container(
              width: 60,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: selected ? _accent : AppColors.borderWhite10,
                  width: selected ? 2 : 1,
                ),
              ),
              child: _slotThumb(_media[i]),
            ),
          );
        },
      ),
    );
  }

  Future<void> _addMedia() async {
    final limit = _uploadMode == 'single' ? 1 : _maxMedia;
    if (_media.length >= limit) {
      AppNotifications.info(
        'Limit reached',
        _uploadMode == 'single'
            ? 'Single mode allows one media item.'
            : 'Up to $_maxMedia media items.',
      );
      return;
    }
    if (!mounted) return;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.78),
      builder: (sheetContext) => SafeArea(
        child: Container(
          margin: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          padding: const EdgeInsets.fromLTRB(40, 42, 40, 34),
          decoration: BoxDecoration(
            color: _webSheet,
            borderRadius: BorderRadius.circular(30),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'ADD MEDIA',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 20,
                  fontStyle: FontStyle.italic,
                  letterSpacing: 4,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'SELECT YOUR SOURCE OR PASTE LINK',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 9,
                  letterSpacing: 1.8,
                  fontWeight: FontWeight.w900,
                  color: AppColors.textGray500,
                ),
              ),
              const SizedBox(height: 36),
              _mediaSourceButton(
                Ionicons.cloud_upload_outline,
                'UPLOAD MEDIA',
                () {
                  Navigator.maybePop(sheetContext);
                  _pickFromDevice();
                },
              ),
              const SizedBox(height: 16),
              _mediaSourceButton(Ionicons.link_outline, 'ADD MEDIA LINK', () {
                Navigator.maybePop(sheetContext);
                _addFromLink();
              }),
              const SizedBox(height: 34),
              GestureDetector(
                onTap: () => Navigator.maybePop(sheetContext),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                  child: Text(
                    'BACK',
                    style: TextStyle(
                      fontSize: 10,
                      letterSpacing: 4,
                      fontWeight: FontWeight.w900,
                      color: AppColors.textGray500,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _mediaSourceButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 64,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.02),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 20, color: Colors.white),
            const SizedBox(width: 14),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                letterSpacing: 0.8,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickFromDevice() async {
    final files = await pickUploadFiles(
      field: 'images',
      allowMultiple: _uploadMode != 'single',
      type: FileType.media,
    );
    if (!mounted || files.isEmpty) return;

    final limit = _uploadMode == 'single' ? 1 : _maxMedia;
    for (final file in files) {
      if (_media.length >= limit) break;
      final isVideo = (file.contentType ?? '').startsWith('video/');
      if (!isVideo) {
        _appendSlot(_MediaSlot(file: file, mediaType: 'image'));
        continue;
      }
      final accepted = await _acceptVideo(file);
      if (!mounted) return;
      if (accepted != null) {
        _appendSlot(_MediaSlot(file: accepted, mediaType: 'video'));
      }
    }
    if (mounted) setState(() {});
  }

  /// Videos longer than [videoMaxDurationSeconds] must be trimmed first. On the
  /// web that is done in-browser; anywhere else the only honest option is to
  /// reject the file rather than silently upload an over-length clip.
  Future<ApiUploadFile?> _acceptVideo(ApiUploadFile file) async {
    final info = await inspectVideo(file.bytes, file.filename);
    if (info == null || info.duration <= 0) {
      // Duration unknown — let it through and let the backend decide.
      return file;
    }
    if (info.duration <= videoMaxDurationSeconds) {
      releaseVideoUrl(info.sourceUrl);
      return file;
    }
    if (!canTrimVideo) {
      releaseVideoUrl(info.sourceUrl);
      if (mounted) {
        AppNotifications.error(
          'Video too long',
          'Videos must be under ${videoMaxDurationSeconds}s. Trimming needs a browser.',
        );
      }
      return null;
    }
    if (!mounted) {
      releaseVideoUrl(info.sourceUrl);
      return null;
    }
    return _openTrimSheet(file, info);
  }

  Future<ApiUploadFile?> _openTrimSheet(
    ApiUploadFile file,
    PendingVideoTrim info,
  ) async {
    var start = 0.0;
    // `clamp` widens to num, which RangeSlider and trimVideoClip both reject.
    var end = videoMaxDurationSeconds
        .toDouble()
        .clamp(0.0, info.duration)
        .toDouble();

    final result = await showModalBottomSheet<ApiUploadFile?>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      backgroundColor: const Color(0xFF0E0E0E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'TRIM VIDEO',
                  style: TextStyle(
                    fontSize: 12,
                    letterSpacing: 2.2,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'This clip is ${info.duration.toStringAsFixed(1)}s. '
                  'Pick up to ${videoMaxDurationSeconds}s to upload.',
                  style: const TextStyle(
                    fontSize: 11.5,
                    height: 1.5,
                    color: AppColors.textGray400,
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  '${start.toStringAsFixed(1)}s  →  ${end.toStringAsFixed(1)}s'
                  '   (${(end - start).toStringAsFixed(1)}s)',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 6),
                RangeSlider(
                  min: 0,
                  max: info.duration,
                  values: RangeValues(start, end),
                  activeColor: _accent,
                  inactiveColor: Colors.white24,
                  onChanged: _trimming
                      ? null
                      : (v) => setSheet(() {
                          start = v.start;
                          end = v.end;
                          // Hold the window at or under the cap, moving
                          // whichever edge the user is not dragging.
                          if (end - start > videoMaxDurationSeconds) {
                            end = start + videoMaxDurationSeconds;
                          }
                        }),
                ),
                const SizedBox(height: 14),
                if (_trimming)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Text(
                      'Trimming plays the clip through in real time — '
                      'this takes about as long as the selection.',
                      style: TextStyle(
                        fontSize: 9.5,
                        height: 1.5,
                        color: AppColors.textGray500,
                      ),
                    ),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: _trimming
                            ? null
                            : () => Navigator.pop(sheetContext, null),
                        child: Container(
                          height: 46,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.05),
                            borderRadius: BorderRadius.circular(13),
                            border: Border.all(color: AppColors.borderWhite10),
                          ),
                          child: const Text(
                            'CANCEL',
                            style: TextStyle(
                              fontSize: 11,
                              letterSpacing: 1.6,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: GestureDetector(
                        onTap: _trimming
                            ? null
                            : () async {
                                setSheet(() => _trimming = true);
                                try {
                                  final bytes = await trimVideoClip(
                                    info.sourceUrl,
                                    startSeconds: start,
                                    endSeconds: end,
                                  );
                                  if (!sheetContext.mounted) return;
                                  Navigator.pop(
                                    sheetContext,
                                    ApiUploadFile(
                                      field: 'images',
                                      filename: _webmName(file.filename),
                                      bytes: bytes,
                                      contentType: 'video/webm',
                                    ),
                                  );
                                } catch (e) {
                                  setSheet(() => _trimming = false);
                                  AppNotifications.error('Trim failed', '$e');
                                }
                              },
                        child: Container(
                          height: 46,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: _trimming
                                ? _accent.withValues(alpha: 0.5)
                                : _accent,
                            borderRadius: BorderRadius.circular(13),
                          ),
                          child: _trimming
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text(
                                  'TRIM & USE',
                                  style: TextStyle(
                                    fontSize: 11,
                                    letterSpacing: 1.6,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );

    releaseVideoUrl(info.sourceUrl);
    if (mounted) setState(() => _trimming = false);
    return result;
  }

  static String _webmName(String original) {
    final base = original.contains('.')
        ? original.substring(0, original.lastIndexOf('.'))
        : original;
    return '$base-trimmed.webm';
  }

  void _addFromLink() {
    final controller = TextEditingController();
    _sheet(
      title: 'ADD FROM LINK',
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 4, 18, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _input(controller, 'https://example.com/photo.jpg'),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: () {
                final url = controller.text.trim();
                if (url.isEmpty) return;
                Navigator.maybePop(context);
                final isVideo = RegExp(
                  r'\.(mp4|webm|mov)(\?|$)',
                  caseSensitive: false,
                ).hasMatch(url);
                _appendSlot(
                  _MediaSlot(
                    linkUrl: url,
                    mediaType: isVideo ? 'video' : 'image',
                  ),
                );
                setState(() {});
              },
              child: Container(
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Text(
                  'ADD LINK',
                  style: TextStyle(
                    fontSize: 12,
                    letterSpacing: 1.8,
                    fontWeight: FontWeight.w600,
                    color: Colors.black,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _appendSlot(_MediaSlot slot) {
    _media.add(slot);
    _selections.add(<_Selection>[]);
    _activeIndex = _media.length - 1;
    _errors.remove('images');
  }

  void _removeMedia(int index) {
    setState(() {
      final slot = _media.removeAt(index);
      if (slot.linkUrl.startsWith('blob:')) releaseVideoUrl(slot.linkUrl);
      _selections.removeAt(index);
      if (_activeIndex >= _media.length) {
        _activeIndex = _media.isEmpty ? 0 : _media.length - 1;
      }
    });
  }

  // ---- Variant editor ----

  Widget _variantEditor() {
    final index = _activeIndex.clamp(0, _media.length - 1);
    final slot = _media[index];
    final rows = _selections[index];

    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PRODUCT CONFIGURATION',
            style: TextStyle(
              fontSize: 12,
              fontStyle: FontStyle.italic,
              letterSpacing: 1.8,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            'CONFIGURING ${slot.color.toUpperCase()} UNIT',
            style: const TextStyle(
              fontSize: 7.8,
              letterSpacing: 1.5,
              fontWeight: FontWeight.w900,
              color: AppColors.textGray500,
            ),
          ),
          const SizedBox(height: 18),
          Center(
            child: GestureDetector(
              onTap: _uploadMode == 'variants'
                  ? () => _pick(
                      title: 'VARIANT COLOUR',
                      options: _colorNames,
                      current: slot.color,
                      onPicked: (v) => setState(() => slot.color = v),
                    )
                  : null,
              child: Column(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    clipBehavior: Clip.antiAlias,
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: _slotThumb(slot),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: Text(
                      slot.color.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 6.5,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          for (var i = 0; i < rows.length; i++) ...[
            _selectionRow(rows[i], index, i),
            const SizedBox(height: 10),
          ],
          Row(
            children: [
              Expanded(
                child: _configAction(
                  Ionicons.resize_outline,
                  '+ ADD SIZES',
                  () => _addSelectionFromPicker(index, 'Size'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _configAction(
                  Ionicons.cube_outline,
                  '+ ADD UOM',
                  () => _addSelectionFromPicker(index, 'UOM'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _configAction(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 46,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: _webInput,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 12, color: AppColors.textGray300),
            const SizedBox(width: 7),
            Text(
              label,
              style: const TextStyle(
                fontSize: 9,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _addSelectionFromPicker(int variantIndex, String kind) {
    _pick(
      title: kind == 'Size' ? 'ADD SIZES' : 'ADD UOM',
      options: kind == 'Size' ? _sizes : _uoms,
      current: '',
      allowCustom: true,
      requireConfirm: true,
      onPicked: (v) => setState(() {
        _selections[variantIndex].add(_Selection(kind: kind, value: v));
        _errors.remove('variants');
      }),
    );
  }

  Widget _selectionRow(_Selection row, int variantIndex, int rowIndex) {
    final invalid = _errors.contains('variants') && !row.isComplete;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: invalid ? AppColors.likeRed : AppColors.borderWhite10,
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                flex: 3,
                child: _miniPicker(
                  row.kind,
                  () => _pick(
                    title: 'TYPE',
                    options: const ['Size', 'UOM'],
                    current: row.kind,
                    onPicked: (v) => setState(() {
                      row.kind = v;
                      row.value = '';
                    }),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 4,
                child: _miniPicker(
                  row.value.isEmpty ? 'Select' : row.value,
                  () => _pick(
                    title: row.kind == 'Size' ? 'SIZE' : 'UNIT OF MEASURE',
                    options: row.kind == 'Size' ? _sizes : _uoms,
                    current: row.value,
                    allowCustom: true,
                    onPicked: (v) => setState(() => row.value = v),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 3,
                child: _inlineField(
                  hint: 'Stock',
                  value: row.stock,
                  numeric: true,
                  onChanged: (v) => row.stock = v,
                ),
              ),
              if (rowIndex > 0) ...[
                const SizedBox(width: 6),
                GestureDetector(
                  onTap: () => setState(
                    () => _selections[variantIndex].removeAt(rowIndex),
                  ),
                  child: const Icon(
                    Ionicons.close_circle_outline,
                    size: 19,
                    color: AppColors.textGray500,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          _inlineField(
            hint: 'Detail (optional) — e.g. 42 EU, 500ml',
            value: row.detail,
            onChanged: (v) => row.detail = v,
          ),
        ],
      ),
    );
  }

  Widget _miniPicker(String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 9),
        decoration: BoxDecoration(
          color: _webInput,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 10.2,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
            const Icon(
              Ionicons.chevron_down_outline,
              size: 12,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }

  Widget _inlineField({
    required String hint,
    required String value,
    required ValueChanged<String> onChanged,
    bool numeric = false,
  }) {
    return TextFormField(
      initialValue: value,
      onChanged: onChanged,
      keyboardType: numeric ? TextInputType.number : TextInputType.text,
      inputFormatters: numeric
          ? [FilteringTextInputFormatter.digitsOnly]
          : null,
      style: const TextStyle(fontSize: 10.2, color: Colors.white),
      cursorColor: _accent,
      decoration: InputDecoration(
        isDense: true,
        hintText: hint,
        hintStyle: const TextStyle(fontSize: 10, color: AppColors.textGray600),
        filled: true,
        fillColor: _webInput,
        contentPadding: const EdgeInsets.symmetric(horizontal: 9, vertical: 10),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.borderWhite10),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: _accent),
        ),
      ),
    );
  }

  // ---- Product information ----

  Widget _productInformationSection() {
    final level2 = _namesOf(_childrenOf(_category));
    final level3 = _namesOf(_childrenOf(_subCategory));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeading('Product Information', 'FILL ALL FIELDS TO PUBLISH'),
        const SizedBox(height: 12),
        _fieldLabel('PRODUCT NAME', required: true, error: 'title'),
        const SizedBox(height: 7),
        _input(_title, 'e.g. Nike Air Max', error: 'title'),
        const SizedBox(height: 13),
        _fieldLabel('DESCRIPTION (OPTIONAL)'),
        const SizedBox(height: 7),
        _input(_description, 'Detailed product description...', maxLines: 3),
        const SizedBox(height: 13),
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 620;
            final categoryFields = [
              _formFieldBlock(
                'CATEGORY',
                required: true,
                error: 'category',
                child: _pickerField(
                  _category.isEmpty ? 'Select Category' : _category,
                  _categoriesLoading
                      ? null
                      : () => _pick(
                          title: 'CATEGORY',
                          options: _namesOf(_categoryTree),
                          current: _category,
                          allowCustom: true,
                          onPicked: (v) => setState(() {
                            _category = v;
                            _subCategory = '';
                            _level3Category = '';
                            final node = _categoryNamed(v);
                            final categoryCommission =
                                double.tryParse(
                                  '${node?['commission_percentage'] ?? 0}',
                                ) ??
                                0;
                            _googerCommission.text = categoryCommission > 0
                                ? _formatNumber(categoryCommission)
                                : _manualGoogerCommissionEnabled
                                ? ''
                                : '0';
                            _errors.remove('category');
                          }),
                        ),
                  placeholder: _category.isEmpty,
                  error: 'category',
                ),
              ),
              _formFieldBlock(
                'SUB CATEGORY (LEVEL 2)',
                required: true,
                error: 'subCategory',
                child: _pickerField(
                  _subCategory.isEmpty ? 'Select Sub Category' : _subCategory,
                  _category.isEmpty
                      ? null
                      : () => _pick(
                          title: 'SUB CATEGORY (LEVEL 2)',
                          subtitle: 'PICK FROM LIST OR ENTER MANUALLY',
                          options: level2,
                          current: _subCategory,
                          allowCustom: true,
                          onPicked: (v) => setState(() {
                            _subCategory = v;
                            _level3Category = '';
                            _errors.remove('subCategory');
                          }),
                        ),
                  placeholder: _subCategory.isEmpty,
                  error: 'subCategory',
                ),
              ),
              _formFieldBlock(
                'SUB CATEGORY (LEVEL 3)',
                child: _pickerField(
                  _level3Category.isEmpty
                      ? 'Select Level 3 Category'
                      : _level3Category,
                  _subCategory.isEmpty
                      ? null
                      : () => _pick(
                          title: 'SUB CATEGORY (LEVEL 3)',
                          subtitle: 'PICK FROM LIST OR ENTER MANUALLY',
                          options: level3,
                          current: _level3Category,
                          allowCustom: true,
                          onPicked: (v) => setState(() => _level3Category = v),
                        ),
                  placeholder: _level3Category.isEmpty,
                ),
              ),
            ];
            if (wide) {
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < categoryFields.length; i++) ...[
                    Expanded(child: categoryFields[i]),
                    if (i != categoryFields.length - 1)
                      const SizedBox(width: 14),
                  ],
                ],
              );
            }
            return Column(
              children: [
                for (var i = 0; i < categoryFields.length; i++) ...[
                  categoryFields[i],
                  if (i != categoryFields.length - 1)
                    const SizedBox(height: 13),
                ],
              ],
            );
          },
        ),
        const SizedBox(height: 13),
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 430;
            final priceFields = [
              _formFieldBlock(
                'MAIN PRICE (R)',
                required: true,
                error: 'price',
                child: _input(_price, '0.00', numeric: true, error: 'price'),
              ),
              _formFieldBlock(
                'PROMO PRICE (R)',
                required: true,
                error: 'promoPrice',
                child: _input(
                  _promoPrice,
                  '0.00',
                  numeric: true,
                  error: 'promoPrice',
                ),
              ),
            ];
            if (wide) {
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: priceFields[0]),
                  const SizedBox(width: 14),
                  Expanded(child: priceFields[1]),
                ],
              );
            }
            return Column(
              children: [
                priceFields[0],
                const SizedBox(height: 13),
                priceFields[1],
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _formFieldBlock(
    String label, {
    required Widget child,
    bool required = false,
    String? error,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _fieldLabel(label, required: required, error: error),
        const SizedBox(height: 7),
        child,
      ],
    );
  }

  // ---- Logistics ----

  Widget _logisticsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeading('Logistics', ''),
        const SizedBox(height: 14),
        _panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'SHIPPING RATES',
                      style: TextStyle(
                        fontSize: 10.5,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const Text(
                    'UNIFIED FEE',
                    style: TextStyle(
                      fontSize: 8,
                      letterSpacing: 1.1,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textGray500,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Switch(
                    value: _unifiedShipping,
                    activeThumbColor: Colors.white,
                    activeTrackColor: _accent,
                    inactiveTrackColor: AppColors.border1,
                    onChanged: (v) => setState(() => _unifiedShipping = v),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (_unifiedShipping)
                ..._unifiedShippingFields()
              else
                ..._perCountryShippingFields(),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _fieldLabel('WARRANTY'),
                    const SizedBox(height: 8),
                    _pickerField(
                      _warranty,
                      () => _pick(
                        title: 'WARRANTY',
                        options: _warrantyOptions,
                        current: _warranty,
                        onPicked: (v) => setState(() => _warranty = v),
                      ),
                    ),
                    if (_warranty == 'Custom') ...[
                      const SizedBox(height: 8),
                      _input(_customWarranty, 'Describe warranty'),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _fieldLabel('RETURN DAYS'),
                    const SizedBox(height: 8),
                    _pickerField(
                      _returnPolicy.isEmpty
                          ? 'Pick Return Days'
                          : _returnPolicy,
                      () => _pick(
                        title: 'RETURN DAYS',
                        options: _returnOptions,
                        current: _returnPolicy,
                        onPicked: (v) => setState(() => _returnPolicy = v),
                      ),
                      placeholder: _returnPolicy.isEmpty,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  List<Widget> _unifiedShippingFields() {
    return [
      _fieldLabel('UNIFIED CHARGE (R)', required: true, error: 'unifiedCharge'),
      const SizedBox(height: 8),
      _input(_unifiedCharge, '0.00', numeric: true, error: 'unifiedCharge'),
      const SizedBox(height: 12),
      _fieldLabel('SHIPPING DATE', required: true, error: 'unifiedDate'),
      const SizedBox(height: 8),
      _pickerField(
        _unifiedDate.isEmpty ? 'Select' : _unifiedDate,
        () => _pick(
          title: 'SHIPPING DATE',
          options: _deliveryOptions,
          current: _unifiedDate,
          onPicked: (v) => setState(() {
            _unifiedDate = v;
            _errors.remove('unifiedDate');
          }),
        ),
        placeholder: _unifiedDate.isEmpty,
        error: 'unifiedDate',
      ),
      if (_unifiedDate == 'Custom') ...[
        const SizedBox(height: 8),
        _input(_customUnifiedDate, 'e.g. 2-4 weeks'),
      ],
    ];
  }

  List<Widget> _perCountryShippingFields() {
    return [
      GestureDetector(
        onTap: _addShippingCountry,
        child: Container(
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(11),
            border: Border.all(
              color: _errors.contains('shipping')
                  ? AppColors.likeRed
                  : AppColors.borderWhite10,
            ),
          ),
          child: const Text(
            '+ ADD SHIPPING COUNTRY',
            style: TextStyle(
              fontSize: 8.5,
              letterSpacing: 1.3,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
      ),
      const SizedBox(height: 12),
      for (var i = 0; i < _shipping.length; i++) ...[
        _shippingCard(_shipping[i], i),
        const SizedBox(height: 10),
      ],
      if (_shipping.isEmpty)
        _hint('Add at least one shipping country, or switch on Unified Fee.'),
    ];
  }

  Widget _shippingCard(_ShippingRow row, int index) {
    final dateMissing = _errors.contains('shipping_date_$index');
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.25),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: dateMissing ? AppColors.likeRed : AppColors.borderWhite10,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  row.country.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.2,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
              GestureDetector(
                onTap: () => setState(() => _shipping.removeAt(index)),
                child: Container(
                  width: 24,
                  height: 24,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.likeRed.withValues(alpha: 0.18),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Ionicons.close_outline,
                    size: 13,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _freeManualToggle(row),
              const Spacer(),
              if (!row.free)
                SizedBox(
                  width: 110,
                  child: _inlineField(
                    hint: 'Charge (R)',
                    value: row.charge,
                    numeric: true,
                    onChanged: (v) => row.charge = v,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          _fieldLabel(
            'SHIPPING DATE',
            required: true,
            error: 'shipping_date_$index',
          ),
          const SizedBox(height: 8),
          _pickerField(
            row.date.isEmpty ? 'Select' : row.date,
            () => _pick(
              title: 'SHIPPING DATE: ${row.country}',
              options: _deliveryOptions,
              current: row.date,
              onPicked: (v) => setState(() {
                row.date = v;
                _errors.remove('shipping_date_$index');
              }),
            ),
            placeholder: row.date.isEmpty,
            trailingIcon: Ionicons.calendar_outline,
            error: 'shipping_date_$index',
          ),
          if (row.date == 'Custom') ...[
            const SizedBox(height: 8),
            _inlineField(
              hint: 'e.g. 2-4 weeks',
              value: row.customDate,
              onChanged: (v) => row.customDate = v,
            ),
          ],
        ],
      ),
    );
  }

  Widget _freeManualToggle(_ShippingRow row) {
    Widget option(String label, bool selected, VoidCallback onTap) {
      return GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.black : AppColors.textGray400,
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          option('FREE', row.free, () => setState(() => row.free = true)),
          option('MANUAL', !row.free, () => setState(() => row.free = false)),
        ],
      ),
    );
  }

  void _addShippingCountry() {
    final taken = _shipping.map((s) => s.country).toSet();
    final options = _shippingCountries
        .where((c) => !taken.contains(c))
        .toList();
    _pick(
      title: 'ADD COUNTRIES',
      options: options,
      current: '',
      onPicked: (v) => setState(() {
        _shipping.add(_ShippingRow(country: v));
        _errors.remove('shipping');
      }),
    );
  }

  // ---- Payments ----

  Widget _paymentSection() {
    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PAYMENT METHODS',
            style: TextStyle(
              fontSize: 9.5,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          for (final entry in _paymentOptions.entries) ...[
            _paymentRow(entry.key, entry.value.$1, entry.value.$2),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  Widget _paymentRow(String id, String label, IconData icon) {
    final selected = _paymentMethods.contains(id);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => setState(() {
        if (!_paymentMethods.remove(id)) _paymentMethods.add(id);
        // At least one method must remain payable.
        if (_paymentMethods.isEmpty) _paymentMethods.add('wallet');
      }),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: selected
              ? const Color(0xFF111111)
              : Colors.black.withValues(alpha: 0.22),
          borderRadius: BorderRadius.circular(13),
          border: Border.all(
            color: selected
                ? Colors.white.withValues(alpha: 0.18)
                : AppColors.borderWhite10,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: id == 'wallet'
                    ? Colors.white
                    : Colors.white.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                icon,
                size: 15,
                color: id == 'wallet' ? Colors.black : Colors.white,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 11.8,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
            Container(
              width: 19,
              height: 19,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? Colors.white : Colors.transparent,
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? Colors.white : AppColors.textGray600,
                ),
              ),
              child: selected
                  ? const Icon(
                      Ionicons.checkmark,
                      size: 11,
                      color: Colors.black,
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }

  // ---- Commissions ----

  Widget _commissionSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'RESELL COMMISSION',
                style: TextStyle(
                  fontSize: 9.5,
                  letterSpacing: 1.4,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _fieldLabel('%'),
                        const SizedBox(height: 6),
                        _input(_resellPercentage, '%', numeric: true),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _fieldLabel('FIXED AMOUNT (R)'),
                        const SizedBox(height: 6),
                        _input(_resellAmount, '0.00', numeric: true),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _fieldLabel('GOOGER COMM. (%)', required: true),
                    const SizedBox(height: 8),
                    _input(
                      _googerCommission,
                      _manualGoogerCommissionEnabled
                          ? 'Enter commission'
                          : _formatNumber(_globalGoogerCommission),
                      numeric: true,
                      enabled: _manualGoogerCommissionEnabled,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _fieldLabel('PROD. DISCOUNT (%)', required: true),
                    const SizedBox(height: 8),
                    _input(_productDiscount, '0', numeric: true),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _publishButton() {
    return GestureDetector(
      onTap: _submitting ? null : _publish,
      child: Container(
        height: 50,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: _submitting ? Colors.white70 : Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: _submitting
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: Colors.black,
                ),
              )
            : const Text(
                'PUBLISH PRODUCT',
                style: TextStyle(
                  fontSize: 11,
                  letterSpacing: 1.8,
                  fontWeight: FontWeight.w600,
                  color: Colors.black,
                ),
              ),
      ),
    );
  }

  // ---- Validation + submit ----

  /// Mirrors the web `handleSubmit` validation, including the variant rule that
  /// every variant needs at least one fully-filled size/UOM row with stock.
  Set<String> _validate() {
    final errors = <String>{};
    if (_title.text.trim().isEmpty) errors.add('title');
    if (_category.trim().isEmpty) errors.add('category');
    if (_subCategory.trim().isEmpty) errors.add('subCategory');
    if (_price.text.trim().isEmpty) errors.add('price');
    if (_promoPrice.text.trim().isEmpty) errors.add('promoPrice');
    if (_media.isEmpty) errors.add('images');

    if (_shipping.isEmpty && !_unifiedShipping) errors.add('shipping');
    if (_unifiedShipping) {
      if (_unifiedCharge.text.trim().isEmpty) errors.add('unifiedCharge');
      if (_unifiedDate.isEmpty) errors.add('unifiedDate');
    } else {
      for (var i = 0; i < _shipping.length; i++) {
        if (_shipping[i].date.isEmpty) errors.add('shipping_date_$i');
      }
    }

    final count = _uploadMode == 'single'
        ? (_media.isEmpty ? 0 : 1)
        : _media.length;
    for (var i = 0; i < count; i++) {
      final rows = i < _selections.length
          ? _selections[i]
          : const <_Selection>[];
      if (rows.isEmpty || !rows.any((r) => r.isComplete)) {
        errors.add('variants');
        break;
      }
    }
    return errors;
  }

  /// Variant order and file order must match — the backend consumes
  /// `req.files` positionally for every variant still on a `blob:` URL.
  (List<Map<String, dynamic>>, List<ApiUploadFile>) _buildVariantsPayload() {
    final variants = <Map<String, dynamic>>[];
    final files = <ApiUploadFile>[];

    for (var i = 0; i < _media.length; i++) {
      final slot = _media[i];
      final rows = i < _selections.length ? _selections[i] : <_Selection>[];
      final complete = rows.where((r) => r.isComplete).toList();
      final stock = complete.fold<int>(
        0,
        (sum, r) => sum + (int.tryParse(r.stock.trim()) ?? 0),
      );

      String imageUrl;
      String? videoUrl;
      if (slot.needsUpload) {
        // Placeholder the backend recognises as "replace me with req.files[n]".
        final token = 'blob:googer-media-$i';
        imageUrl = token;
        if (slot.mediaType == 'video') videoUrl = token;
        files.add(slot.file!);
      } else {
        imageUrl = slot.linkUrl;
        if (slot.mediaType == 'video') videoUrl = slot.linkUrl;
      }

      variants.add({
        'index': i,
        'color': slot.color,
        'image_url': imageUrl,
        'url': imageUrl,
        'media_type': slot.mediaType,
        if (videoUrl != null) 'video_url': videoUrl,
        'stock': stock,
        'quantity': stock,
        'selections': complete.map((r) => r.toJson()).toList(),
      });
    }
    return (variants, files);
  }

  Future<void> _publish() async {
    final errors = _validate();
    if (errors.isNotEmpty) {
      setState(
        () => _errors
          ..clear()
          ..addAll(errors),
      );
      AppNotifications.error(
        errors.contains('variants')
            ? 'Each variant needs a size/UOM with stock'
            : 'Please complete all required fields',
      );
      return;
    }

    setState(() {
      _errors.clear();
      _submitting = true;
    });

    final (variants, files) = _buildVariantsPayload();
    final totalStock = variants.fold<int>(
      0,
      (sum, v) => sum + ((v['stock'] as int?) ?? 0),
    );

    final error = await Api.createProduct({
      'title': _title.text.trim(),
      'description': _description.text.trim(),
      'category': _category,
      'sub_category': _subCategory,
      'level3_category': _level3Category,
      'manual_category': _manualCategory,
      'price': _price.text.trim(),
      'promo_price': _promoPrice.text.trim(),
      'stock': totalStock,
      'warranty_data': {
        'warranty': _warranty,
        'custom': _customWarranty.text.trim(),
      },
      'payment_data': _paymentMethods.toList(),
      'shipping_data': {
        'rates': _shipping.map((s) => s.toJson()).toList(),
        'unified': _unifiedShipping,
        'charge': _unifiedCharge.text.trim(),
        'date': _unifiedDate == 'Custom'
            ? _customUnifiedDate.text.trim()
            : _unifiedDate,
      },
      'return_data': {'text': _returnPolicy, 'date': ''},
      'commission_data': {
        'resell_amount': _resellAmount.text.trim(),
        'resell_percentage': _resellPercentage.text.trim(),
        'googer_commission': _googerCommission.text.trim(),
        'discount': _productDiscount.text.trim(),
      },
      'variants_data': variants,
    }, images: files);

    if (!mounted) return;
    setState(() => _submitting = false);

    if (error == null) {
      AppNotifications.success('Product Published', 'Your listing is live.');
      widget.onCreated?.call();
      Navigator.maybePop(context);
    } else {
      if (_isSubscriptionLimitError(error)) {
        UpgradePlanSheet.show(
          context,
          subtitle: 'Subscribe to list more products',
          limitMessage:
              'If you have reached your product upload limit, please subscribe to a higher plan below.',
        );
      }
      AppNotifications.error('Publish failed', error);
    }
  }

  bool _isSubscriptionLimitError(String error) {
    final text = error.toLowerCase();
    return text.contains('subscription') ||
        text.contains('plan') ||
        text.contains('limit') ||
        text.contains('product upload');
  }

  // ---- Shared widgets ----

  Widget _panel({required Widget child}) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: _webField,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: AppColors.borderWhite10),
    ),
    child: child,
  );

  Widget _sectionHeading(String title, String subtitle) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(
          fontSize: 14,
          fontStyle: FontStyle.italic,
          fontWeight: FontWeight.w800,
          color: Colors.white,
        ),
      ),
      if (subtitle.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text(
          subtitle,
          style: const TextStyle(
            fontSize: 7.8,
            letterSpacing: 2.4,
            fontWeight: FontWeight.w900,
            color: AppColors.textGray500,
          ),
        ),
      ],
    ],
  );

  /// One `Text.rich` rather than a Row — these labels sit in 160px-wide
  /// two-column cells on a 360px phone, where a Row cannot wrap and overflows.
  Widget _fieldLabel(String text, {bool required = false, String? error}) {
    final invalid = error != null && _errors.contains(error);
    return Text.rich(
      TextSpan(
        text: text,
        children: required
            ? const [
                TextSpan(
                  text: ' *',
                  style: TextStyle(color: AppColors.likeRed),
                ),
              ]
            : null,
      ),
      maxLines: 2,
      style: TextStyle(
        fontSize: 8,
        letterSpacing: 1.0,
        height: 1.25,
        fontWeight: FontWeight.w900,
        color: invalid ? AppColors.likeRed : Colors.white,
      ),
    );
  }

  Widget _hint(String text) => Text(
    text,
    style: const TextStyle(
      fontSize: 8.8,
      height: 1.5,
      color: AppColors.textGray600,
    ),
  );

  Widget _input(
    TextEditingController controller,
    String hint, {
    int maxLines = 1,
    bool numeric = false,
    bool enabled = true,
    String? error,
  }) {
    final invalid = error != null && _errors.contains(error);
    return TextField(
      controller: controller,
      enabled: enabled,
      maxLines: maxLines,
      keyboardType: numeric
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      inputFormatters: numeric
          ? [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))]
          : null,
      onChanged: (_) {
        if (invalid) setState(() => _errors.remove(error));
      },
      style: const TextStyle(
        fontSize: 10.5,
        fontWeight: FontWeight.w700,
        color: Colors.white,
      ),
      cursorColor: _accent,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w700,
          color: AppColors.textGray600,
        ),
        filled: true,
        fillColor: enabled ? _webInput : _webField,
        contentPadding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(11),
          borderSide: BorderSide(
            color: invalid ? AppColors.likeRed : AppColors.borderWhite10,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(11),
          borderSide: BorderSide(color: invalid ? AppColors.likeRed : _accent),
        ),
      ),
    );
  }

  Widget _pickerField(
    String label,
    VoidCallback? onTap, {
    bool placeholder = false,
    IconData trailingIcon = Ionicons.chevron_down_outline,
    String? error,
  }) {
    final invalid = error != null && _errors.contains(error);
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Opacity(
        opacity: onTap == null ? 0.5 : 1,
        child: Container(
          height: 40,
          padding: const EdgeInsets.symmetric(horizontal: 11),
          decoration: BoxDecoration(
            color: _webField,
            borderRadius: BorderRadius.circular(11),
            border: Border.all(
              color: invalid ? AppColors.likeRed : AppColors.borderWhite10,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: placeholder ? AppColors.textGray500 : Colors.white,
                  ),
                ),
              ),
              Icon(trailingIcon, size: 15, color: AppColors.textGray500),
            ],
          ),
        ),
      ),
    );
  }

  void _sheet({
    required String title,
    String? subtitle,
    required Widget child,
  }) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.72),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Container(
          margin: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          decoration: BoxDecoration(
            color: _webSheet,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(
                  18,
                  18,
                  18,
                  subtitle == null ? 14 : 5,
                ),
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 12,
                    letterSpacing: 2.2,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
              ),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 0, 18, 12),
                  child: Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 8.5,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textGray500,
                    ),
                  ),
                ),
              const Divider(height: 1, color: AppColors.borderWhite10),
              Flexible(child: child),
            ],
          ),
        ),
      ),
    );
  }

  /// The web's shared picker: searchable list, optional free-text "Custom"
  /// entry, and a CANCEL footer.
  void _pick({
    required String title,
    String? subtitle,
    required List<String> options,
    required String current,
    required ValueChanged<String> onPicked,
    bool allowCustom = false,
    bool requireConfirm = false,
  }) {
    final search = TextEditingController();
    final manual = TextEditingController();
    final needsConfirm =
        requireConfirm || title.toUpperCase().contains('COUNTRIES');
    var selectedValue = current;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.78),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheet) {
          final query = search.text.trim().toLowerCase();
          final rows = options
              .where((o) => query.isEmpty || o.toLowerCase().contains(query))
              .toList();
          final sheetHeight = min(
            MediaQuery.of(sheetContext).size.height * 0.82,
            720.0,
          );
          void commit(String value) {
            final trimmed = value.trim();
            if (trimmed.isEmpty) return;
            onPicked(trimmed);
            Navigator.maybePop(sheetContext);
          }

          return SafeArea(
            child: Container(
              height: sheetHeight,
              margin: const EdgeInsets.fromLTRB(10, 0, 10, 10),
              decoration: BoxDecoration(
                color: _webSheet,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(30, 22, 28, 22),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 11.5,
                                  letterSpacing: 3,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 7),
                              Text(
                                subtitle ?? 'PICK FROM LIST OR ENTER MANUALLY',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w900,
                                  color: AppColors.textGray500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: () => Navigator.maybePop(sheetContext),
                          child: Container(
                            width: 36,
                            height: 36,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(
                              color: Color(0xFF171717),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Ionicons.close,
                              size: 16,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.borderWhite10),
                  Container(
                    width: double.infinity,
                    color: Colors.black.withValues(alpha: 0.14),
                    padding: const EdgeInsets.fromLTRB(22, 20, 22, 16),
                    child: Container(
                      height: 48,
                      padding: const EdgeInsets.symmetric(horizontal: 15),
                      decoration: BoxDecoration(
                        color: const Color(0xFF08080C),
                        borderRadius: BorderRadius.circular(17),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Ionicons.search_outline,
                            size: 17,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextField(
                              controller: search,
                              onChanged: (_) => setSheet(() {}),
                              style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                              cursorColor: _webSoftBlue,
                              decoration: const InputDecoration(
                                isDense: true,
                                border: InputBorder.none,
                                hintText: 'Search...',
                                hintStyle: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textGray600,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (allowCustom)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 10, 18, 14),
                      child: Container(
                        height: 54,
                        padding: const EdgeInsets.fromLTRB(11, 8, 11, 8),
                        decoration: BoxDecoration(
                          color: const Color(0xFF111111),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: AppColors.borderWhite10),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: manual,
                                onChanged: (_) => setSheet(() {}),
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                ),
                                cursorColor: _webSoftBlue,
                                decoration: const InputDecoration(
                                  isDense: true,
                                  border: InputBorder.none,
                                  hintText: 'Manual category...',
                                  hintStyle: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textGray600,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            GestureDetector(
                              onTap: manual.text.trim().isEmpty
                                  ? null
                                  : () => commit(manual.text),
                              child: Container(
                                height: 38,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 18,
                                ),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: manual.text.trim().isEmpty
                                      ? Colors.white.withValues(alpha: 0.35)
                                      : Colors.white,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Text(
                                  'CONFIRM',
                                  style: TextStyle(
                                    fontSize: 10,
                                    letterSpacing: 0.3,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.black,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  Expanded(
                    child: rows.isEmpty
                        ? const Padding(
                            padding: EdgeInsets.fromLTRB(28, 20, 28, 20),
                            child: Text(
                              'Nothing to pick here yet.',
                              style: TextStyle(
                                fontSize: 11,
                                color: AppColors.textGray600,
                              ),
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(28, 12, 28, 16),
                            itemCount: rows.length,
                            itemBuilder: (_, i) {
                              final option = rows[i];
                              final selected = option == selectedValue;
                              return GestureDetector(
                                onTap: () {
                                  if (needsConfirm) {
                                    setSheet(() => selectedValue = option);
                                  } else {
                                    commit(option);
                                  }
                                },
                                child: Container(
                                  height: 52,
                                  alignment: Alignment.centerLeft,
                                  decoration: BoxDecoration(
                                    border: Border(
                                      bottom: BorderSide(
                                        color: selected && needsConfirm
                                            ? Colors.white.withValues(
                                                alpha: 0.16,
                                              )
                                            : Colors.transparent,
                                      ),
                                    ),
                                  ),
                                  child: Text(
                                    option,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w800,
                                      color: selected
                                          ? Colors.white
                                          : AppColors.textGray400,
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                  ),
                  Container(
                    decoration: const BoxDecoration(
                      border: Border(
                        top: BorderSide(color: AppColors.borderWhite10),
                      ),
                    ),
                    padding: const EdgeInsets.fromLTRB(28, 28, 28, 20),
                    child: Row(
                      children: [
                        Expanded(
                          flex: needsConfirm ? 2 : 1,
                          child: GestureDetector(
                            onTap: () => Navigator.maybePop(sheetContext),
                            child: Container(
                              height: 50,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: const Color(0xFF171717),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: const Text(
                                'CANCEL',
                                style: TextStyle(
                                  fontSize: 10.8,
                                  letterSpacing: 1.4,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (needsConfirm) ...[
                          const SizedBox(width: 14),
                          Expanded(
                            flex: 3,
                            child: GestureDetector(
                              onTap: selectedValue.trim().isEmpty
                                  ? null
                                  : () => commit(selectedValue),
                              child: Container(
                                height: 50,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: selectedValue.trim().isEmpty
                                      ? Colors.white.withValues(alpha: 0.42)
                                      : Colors.white,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: const Text(
                                  'CONFIRM',
                                  style: TextStyle(
                                    fontSize: 10.8,
                                    letterSpacing: 1.4,
                                    fontWeight: FontWeight.w900,
                                    color: Colors.black,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  static const _shippingCountries = [
    'Sri Lanka',
    'India',
    'United Kingdom',
    'United States',
    'Australia',
    'Canada',
    'Singapore',
    'United Arab Emirates',
    'Malaysia',
    'Pakistan',
    'Bangladesh',
    'Nepal',
    'Maldives',
    'Germany',
    'France',
    'Italy',
    'Spain',
    'Netherlands',
    'Sweden',
    'Norway',
    'Denmark',
    'Ireland',
    'New Zealand',
    'South Africa',
    'Kenya',
    'Nigeria',
    'Egypt',
    'Saudi Arabia',
    'Qatar',
    'Kuwait',
    'Oman',
    'Bahrain',
    'Japan',
    'China',
    'South Korea',
    'Thailand',
    'Vietnam',
    'Indonesia',
    'Philippines',
    'Brazil',
    'Mexico',
    'Argentina',
    'Worldwide',
  ];
}
