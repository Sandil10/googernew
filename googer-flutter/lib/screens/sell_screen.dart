import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:image_picker/image_picker.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/ad_countries.dart';
import '../util/p2p_transaction_presentation.dart';
import '../widgets/app_back_button.dart';
import '../widgets/wallet_bits.dart';
import 'chat_dm_screen.dart';
import 'request_screen.dart';

/// Wallet · P2P coin marketplace — the port of the web `dashboard/wallet/sell`
/// (and its `topup` buy twin, which is the same page with the mirrored
/// endpoints). One screen carries both sides: BUY COINS lists `/p2p-ads`,
/// SELL COINS lists `/p2p-sell-ads`.
class SellScreen extends StatefulWidget {
  /// The wallet can land the user on either half of the marketplace.
  final bool startOnBuy;

  /// Opens the POST AD payment-method picker as soon as the page settles, so
  /// the chip can be pressed from another page and still land on the composer.
  final bool openPostAd;

  const SellScreen({
    super.key,
    this.startOnBuy = false,
    this.openPostAd = false,
  });

  @override
  State<SellScreen> createState() => _SellScreenState();
}

/* ── palette ─────────────────────────────────────────────────────────────── */

const _buyGreen = Color(0xFF16A34A);
const _sellRed = Color(0xFFEF4444);
const _amber = Color(0xFFF59E0B);
const _amberBg = Color(0x14F59E0B);
const _amberBorder = Color(0x33F59E0B);
const _cardBg = Color(0xFF0A0A0A);
const _chipBg = Color(0x0FFFFFFF);
const _webBorder = Color(0xB31F2937);
const _sheetBg = Color(0xFF09090B);
const _fieldBg = Color(0xFF030303);
const _greenBg = Color(0x1A22C55E);
const _greenBorder = Color(0x4022C55E);
const _redBg = Color(0x1AEF4444);
const _redBorder = Color(0x33EF4444);

/* ── payment-method catalogue ────────────────────────────────────────────── */

/// The web keeps a fixed 42-method catalogue and dims whatever admin has not
/// approved. Only the six categories the sheet shows are ported here; anything
/// the API returns that is missing from this list is appended to its own
/// category at runtime, so the sheet never hides a live method.
class _CatalogEntry {
  final String id;
  final String name;
  final String category;
  const _CatalogEntry(this.id, this.name, this.category);
}

String _catalogSvgFile(String id) {
  const files = <String, String>{
    'paypal': 'card_paypal.svg',
    'skrill': 'card_skrill_sofort.svg',
    'neteller': 'card_neteller.svg',
    'amazon_pay': 'card_amazon_pay.svg',
    'paysafecard': 'card_paysafecard.svg',
    'qiwi': 'card_qiwi.svg',
    'bank_transfer': 'card_bank-transfer.svg',
    'sepa': 'card_sepa-direct-debit.svg',
    'direct_debit': 'card_direct_debit.svg',
    'trustly': 'card_trustly.svg',
    'bitcoin': 'card_bitcoin.svg',
    'ethereum': 'card_ethereum.svg',
    'litecoin': 'card_litecoin.svg',
    'ripple': 'card_ripple.svg',
    'coinbase': 'card_coinbase.svg',
    'gocrypto': 'card_go-crypto.svg',
    'visa': 'card_visa.svg',
    'mastercard': 'card_mastercard.svg',
    'amex': 'card_american-express.svg',
    'maestro': 'card_maestro.svg',
    'discover': 'card_discover.svg',
    'jcb': 'card_jcb.svg',
    'diners': 'card_diners-club.svg',
    'unionpay': 'card_unionpay.svg',
    'google_pay': 'card_google-pay.svg',
    'apple_pay': 'card_apple-pay.svg',
    'samsung_pay': 'card_samsung-pay.svg',
    'wechat_pay': 'card_wechat-pay.svg',
    'alipay': 'card_alipay.svg',
    'stripe': 'card_stripe.svg',
    'klarna': 'card_klarna.svg',
    'braintree': 'card_braintree.svg',
  };
  return files[id] ?? '';
}

String _catalogClearbitDomain(String id) {
  const domains = <String, String>{
    'paypal': 'paypal.com',
    'skrill': 'skrill.com',
    'neteller': 'neteller.com',
    'payoneer': 'payoneer.com',
    'wise': 'wise.com',
    'amazon_pay': 'pay.amazon.com',
    'paysafecard': 'paysafecard.com',
    'qiwi': 'qiwi.com',
    'bank_transfer': 'swift.com',
    'trustly': 'trustly.com',
    'binance': 'binance.com',
    'bitcoin': 'bitcoin.org',
    'ethereum': 'ethereum.org',
    'usdt': 'tether.to',
    'litecoin': 'litecoin.org',
    'ripple': 'ripple.com',
    'coinbase': 'coinbase.com',
    'trust_wallet': 'trustwallet.com',
    'visa': 'visa.com',
    'mastercard': 'mastercard.com',
    'amex': 'americanexpress.com',
    'discover': 'discover.com',
    'jcb': 'jcb.co.jp',
    'diners': 'dinersclub.com',
    'unionpay': 'unionpayintl.com',
    'google_pay': 'pay.google.com',
    'apple_pay': 'apple.com',
    'samsung_pay': 'samsung.com',
    'wechat_pay': 'weixin.qq.com',
    'alipay': 'alipay.com',
    'stripe': 'stripe.com',
    'klarna': 'klarna.com',
    'braintree': 'braintreepayments.com',
  };
  return domains[id] ?? '';
}

String _methodKey(String value) {
  final lower = value.trim().toLowerCase();
  final cleaned = lower
      .replaceAll(RegExp(r'\.(svg|png|jpe?g|webp)$'), '')
      .replaceAll(RegExp(r'^card[_-]'), '')
      .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
      .replaceAll(RegExp(r'_+'), '_')
      .replaceAll(RegExp(r'^_|_$'), '');
  const aliases = <String, String>{
    'pay_pal': 'paypal',
    'go_crypto': 'gocrypto',
    'trust_wallet': 'trust_wallet',
    'banktransfer': 'bank_transfer',
    'bank': 'bank_transfer',
  };
  return aliases[cleaned] ?? cleaned;
}

String _paymentLogoUrl({
  required String name,
  String catalogId = '',
  String logo = '',
  String svgFile = '',
  String clearbitDomain = '',
}) {
  final raw = logo.trim();
  final catalogKey = _methodKey(catalogId.isNotEmpty ? catalogId : name);
  if (catalogKey == 'gocrypto') {
    return '${_Ad._payrexxBase}/card_go-crypto.svg';
  }
  if (raw.startsWith('http') || raw.startsWith('data:')) return raw;

  final fromSvg = svgFile.trim();
  if (fromSvg.isNotEmpty) {
    return fromSvg.startsWith('http')
        ? fromSvg
        : '${_Ad._payrexxBase}/${fromSvg.split('/').last}';
  }

  for (final candidate in [catalogId, raw, name]) {
    final key = _methodKey(candidate);
    final file = _catalogSvgFile(key);
    if (file.isNotEmpty) return '${_Ad._payrexxBase}/$file';
  }

  final domain = clearbitDomain.trim().isNotEmpty
      ? clearbitDomain.trim()
      : _catalogClearbitDomain(_methodKey(name));
  if (domain.isNotEmpty) return '${_Ad._clearbitBase}/$domain';

  if (raw.isNotEmpty &&
      (raw.contains('/') ||
          raw.startsWith('uploads') ||
          raw.startsWith('assets') ||
          raw.startsWith('/'))) {
    return Api.resolveMedia(raw);
  }
  return '';
}

const _categories = <String>[
  'WALLET',
  'BANK',
  'CRYPTO',
  'CARD',
  'DIGITAL',
  'GATEWAY',
];

const _catalog = <_CatalogEntry>[
  _CatalogEntry('paypal', 'PayPal', 'WALLET'),
  _CatalogEntry('skrill', 'Skrill', 'WALLET'),
  _CatalogEntry('neteller', 'Neteller', 'WALLET'),
  _CatalogEntry('payoneer', 'Payoneer', 'WALLET'),
  _CatalogEntry('wise', 'Wise', 'WALLET'),
  _CatalogEntry('amazon_pay', 'Amazon Pay', 'WALLET'),
  _CatalogEntry('paysafecard', 'PaySafeCard', 'WALLET'),
  _CatalogEntry('qiwi', 'QIWI', 'WALLET'),
  _CatalogEntry('bank_transfer', 'Bank Transfer', 'BANK'),
  _CatalogEntry('sepa', 'SEPA Direct Debit', 'BANK'),
  _CatalogEntry('direct_debit', 'Direct Debit', 'BANK'),
  _CatalogEntry('trustly', 'Trustly', 'BANK'),
  _CatalogEntry('binance', 'Binance', 'CRYPTO'),
  _CatalogEntry('bitcoin', 'Bitcoin', 'CRYPTO'),
  _CatalogEntry('ethereum', 'Ethereum', 'CRYPTO'),
  _CatalogEntry('usdt', 'USDT', 'CRYPTO'),
  _CatalogEntry('litecoin', 'Litecoin', 'CRYPTO'),
  _CatalogEntry('ripple', 'Ripple (XRP)', 'CRYPTO'),
  _CatalogEntry('coinbase', 'Coinbase', 'CRYPTO'),
  _CatalogEntry('trust_wallet', 'Trust Wallet', 'CRYPTO'),
  _CatalogEntry('gocrypto', 'GoCrypto', 'CRYPTO'),
  _CatalogEntry('visa', 'Visa', 'CARD'),
  _CatalogEntry('mastercard', 'Mastercard', 'CARD'),
  _CatalogEntry('amex', 'Amex', 'CARD'),
  _CatalogEntry('maestro', 'Maestro', 'CARD'),
  _CatalogEntry('discover', 'Discover', 'CARD'),
  _CatalogEntry('jcb', 'JCB', 'CARD'),
  _CatalogEntry('diners', 'Diners Club', 'CARD'),
  _CatalogEntry('unionpay', 'UnionPay', 'CARD'),
  _CatalogEntry('google_pay', 'Google Pay', 'DIGITAL'),
  _CatalogEntry('apple_pay', 'Apple Pay', 'DIGITAL'),
  _CatalogEntry('samsung_pay', 'Samsung Pay', 'DIGITAL'),
  _CatalogEntry('wechat_pay', 'WeChat Pay', 'DIGITAL'),
  _CatalogEntry('alipay', 'Alipay', 'DIGITAL'),
  _CatalogEntry('stripe', 'Stripe', 'GATEWAY'),
  _CatalogEntry('klarna', 'Klarna', 'GATEWAY'),
  _CatalogEntry('braintree', 'Braintree', 'GATEWAY'),
];

const _letterColors = <Color>[
  Color(0xFFEF4444),
  Color(0xFFF97316),
  Color(0xFFEAB308),
  Color(0xFF22C55E),
  Color(0xFF3B82F6),
  Color(0xFF8B5CF6),
  Color(0xFFEC4899),
  Color(0xFF06B6D4),
];

Color _letterColor(String name) {
  var hash = 0;
  for (final unit in name.codeUnits) {
    hash = (hash * 31 + unit) & 0x7fffffff;
  }
  return _letterColors[hash % _letterColors.length];
}

/* ── value objects ───────────────────────────────────────────────────────── */

String _pick(Map m, List<String> keys, [String fallback = '']) {
  for (final k in keys) {
    final v = m[k];
    if (v != null && '$v'.trim().isNotEmpty && '$v' != 'null') return '$v';
  }
  return fallback;
}

double _pickNum(Map m, List<String> keys) {
  for (final k in keys) {
    final v = double.tryParse('${m[k]}'.replaceAll(',', ''));
    if (v != null) return v;
  }
  return 0;
}

bool _pickFlag(Map m, List<String> keys) {
  for (final k in keys) {
    final v = m[k];
    final text = '$v'.trim().toLowerCase();
    if (v == true ||
        text == 'true' ||
        text == '1' ||
        text == 't' ||
        text == 'yes' ||
        text == 'on') {
      return true;
    }
  }
  return false;
}

/// Thousands-separated, decimals dropped when the value is whole — the web
/// prints limits as `R 1,000`, not `R 1,000.00`.
String _amount(double value) {
  final text = formatMoney(value);
  return text.endsWith('.00') ? text.substring(0, text.length - 3) : text;
}

double _parseAmountText(String value) {
  return double.tryParse(value.trim().replaceAll(',', '')) ?? 0;
}

String _cleanUiText(String value) {
  return value
      .replaceAll('â€“', '-')
      .replaceAll('â€"', '-')
      .replaceAll('â€”', '-')
      .replaceAll('Â·', '-')
      .replaceAll('·', '-')
      .replaceAll('–', '-')
      .replaceAll('—', '-');
}

/// One marketplace ad, normalised out of the loose backend row.
class _Ad {
  static const String _payrexxBase =
      'https://raw.githubusercontent.com/payrexx/payment-logos/main/assets/card-icons';
  static const String _clearbitBase = 'https://logo.clearbit.com';

  final String id;
  final String catalogId;
  final String name;
  final String category;
  final String ownerId;
  final String username;
  final String avatar;
  final String logo;
  final String svgFile;
  final String clearbitDomain;
  final String country;
  final String currency;
  final String releaseValue;
  final String releaseUnit;
  final String description;
  final List<Map<String, dynamic>> adminFields;
  final double rate;
  final double min;
  final double max;
  final double available;
  final bool mine;
  final bool serverLocked;
  final bool inactive;
  final bool verified;

  const _Ad({
    required this.id,
    required this.catalogId,
    required this.name,
    required this.category,
    required this.ownerId,
    required this.username,
    required this.avatar,
    required this.logo,
    required this.svgFile,
    required this.clearbitDomain,
    required this.country,
    required this.currency,
    required this.releaseValue,
    required this.releaseUnit,
    required this.description,
    required this.adminFields,
    required this.rate,
    required this.min,
    required this.max,
    required this.available,
    required this.mine,
    required this.serverLocked,
    required this.inactive,
    required this.verified,
  });

  factory _Ad.fromRow(Map<String, dynamic> row) {
    final category = _pick(row, ['category'], 'WALLET');
    final owner = _pick(row, ['user_id', 'seller_id', 'owner_id', 'userId']);
    final isOwn =
        _pickFlag(row, ['is_own', 'isOwn']) ||
        (owner.isNotEmpty && Api.currentUserIds.contains(owner.trim()));
    final avatar =
        Api.rawAvatar(row) ??
        _pick(row, [
          'profile_picture',
          'avatar',
          'user_avatar',
          'seller_profile_picture',
          'buyer_profile_picture',
        ]);
    final logo = _pick(row, ['icon', 'logo', 'image', 'payment_method_logo']);
    final svgFile = _pick(row, ['svg_file', 'svgFile']);
    final clearbitDomain = _pick(row, ['clearbit_domain', 'clearbitDomain']);
    // Web maps backend is_locked/is_inactive into adStatus; keep Flutter on the
    // same exact-ad state instead of deriving lock state from unrelated trades.
    final status = _pick(row, [
      'adStatus',
      'ad_status',
      'status',
    ], '').toLowerCase();
    final max = _pickNum(row, ['max_amount', 'max_limit', 'maximum']);
    return _Ad(
      id: _pick(row, ['id', 'ad_id']),
      catalogId: _pick(row, ['catalog_id', 'catalogId']),
      name: _pick(row, [
        'name',
        'payment_method',
        'method',
        'title',
      ], 'Payment'),
      category: category,
      ownerId: owner,
      username: _pick(row, [
        'username',
        'seller_username',
        'full_name',
      ], 'User'),
      avatar: avatar.isEmpty && isOwn
          ? (Api.avatar ?? '')
          : (avatar.isEmpty ? '' : Api.resolveAvatar(avatar)),
      logo: logo,
      svgFile: svgFile,
      clearbitDomain: clearbitDomain,
      country: _country(row),
      currency: _pick(row, [
        'crypto_currency',
        'currency',
      ], category.toUpperCase() == 'CRYPTO' ? 'USDT' : 'LKR'),
      releaseValue: _pick(row, ['release_value', 'release_time']),
      releaseUnit: _pick(row, ['release_unit'], 'h'),
      description: _description(row),
      adminFields: _adminFields(row),
      rate: _pickNum(row, ['lkr_rate', 'rate', 'price_per_coin', 'unit_price']),
      min: _pickNum(row, ['min_amount', 'min_limit', 'minimum']),
      max: max,
      available: row['available_amount'] == null
          ? max
          : _pickNum(row, ['available_amount', 'available_coins', 'coins']),
      mine: isOwn,
      serverLocked:
          _pickFlag(row, ['is_locked', 'locked']) || status == 'locked',
      inactive:
          _pickFlag(row, ['is_inactive']) ||
          status == 'inactive' ||
          status == 'cancelled',
      verified: _pickFlag(row, [
        'is_verified',
        'verified',
        'user_verified',
        'seller_verified',
      ]),
    );
  }

  /// A synthetic ad for a transaction whose ad row is no longer in the list —
  /// cancelled orders outlive the ad that produced them.
  factory _Ad.fromTransaction(Map<String, dynamic> tx) {
    final logo = _pick(tx, [
      'payment_method_logo',
      'method_logo',
      'ad_logo',
      'logo',
      'icon',
      'image',
    ]);
    final svgFile = _pick(tx, ['svg_file', 'svgFile']);
    final clearbitDomain = _pick(tx, ['clearbit_domain', 'clearbitDomain']);
    final avatar =
        Api.rawAvatar(tx) ??
        _pick(tx, [
          'seller_profile_picture',
          'seller_avatar',
          'buyer_profile_picture',
          'buyer_avatar',
          'profile_picture',
          'avatar',
          'user_avatar',
        ]);
    final sellerId = _pick(tx, ['seller_id']);
    return _Ad(
      id: 'tx-${_pick(tx, ['id'])}',
      catalogId: '',
      name: _pick(tx, ['ad_name', 'payment_method', 'method'], 'Payment ad'),
      category: 'WALLET',
      ownerId: sellerId,
      username: _pick(tx, [
        'seller_username',
        'buyer_username',
        'username',
      ], 'User'),
      avatar: avatar.isEmpty ? '' : Api.resolveAvatar(avatar),
      logo: logo,
      svgFile: svgFile,
      clearbitDomain: clearbitDomain,
      country: _country(tx),
      currency: _pick(tx, ['receive_currency', 'currency'], 'LKR'),
      releaseValue: '',
      releaseUnit: 'h',
      description: _description(tx),
      adminFields: const [],
      rate: 0,
      min: 0,
      max: 0,
      available: 0,
      mine: sellerId.isNotEmpty && Api.currentUserIds.contains(sellerId.trim()),
      serverLocked: false,
      inactive: false,
      verified: _pickFlag(tx, [
        'is_verified',
        'verified',
        'seller_verified',
        'buyer_verified',
      ]),
    );
  }

  String get resolvedLogo {
    return _paymentLogoUrl(
      name: name,
      catalogId: catalogId,
      logo: logo,
      svgFile: svgFile,
      clearbitDomain: clearbitDomain,
    );
  }

  String get timeWindow =>
      releaseValue.isEmpty ? '' : '$releaseValue $releaseUnit';

  static String _country(Map row) {
    final direct = _pick(row, ['country', 'ad_country']);
    if (direct.isNotEmpty) return direct;
    // The web stores the country inside the ad's `admin_fields` blob, which
    // arrives either decoded or as a JSON string depending on the driver.
    final fields = _adminFields(row);
    for (final field in fields) {
      if ('${field['key']}'.toLowerCase() == 'country') {
        return '${field['value'] ?? ''}';
      }
    }
    return '';
  }

  static String _description(Map row) {
    final direct = _pick(row, [
      'description',
      'ad_description',
      'guide_note',
      'guide',
      'note',
      'instructions',
    ]);
    if (direct.isNotEmpty) return direct;

    for (final containerKey in ['ad', 'payment', 'method', 'payment_method']) {
      final nested = row[containerKey];
      if (nested is Map) {
        final nestedDescription = _pick(nested, [
          'description',
          'ad_description',
          'guide_note',
          'guide',
          'note',
          'instructions',
        ]);
        if (nestedDescription.isNotEmpty) return nestedDescription;
      }
    }

    for (final field in _adminFields(row)) {
      final key = '${field['key'] ?? field['name'] ?? field['label'] ?? ''}'
          .toLowerCase()
          .trim();
      if ([
        'description',
        'ad_description',
        'guide_note',
        'guide',
        'note',
        'instructions',
      ].contains(key)) {
        final value = '${field['value'] ?? ''}'.trim();
        if (value.isNotEmpty && value != 'null') return value;
      }
    }
    return '';
  }

  static List<Map<String, dynamic>> _adminFields(Map row) {
    final raw = row['admin_fields'];
    List<dynamic> fields = const [];
    if (raw is List) {
      fields = raw;
    } else if (raw is String && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) fields = decoded;
      } catch (_) {
        fields = const [];
      }
    }
    return fields
        .whereType<Map>()
        .map((field) => Map<String, dynamic>.from(field))
        .toList(growable: false);
  }
}

/// An ad card, optionally bound to the transaction that produced it (the
/// PENDING / COMPLETE / CANCEL tabs show one card per order).
class _CardData {
  final _Ad ad;
  final Map<String, dynamic>? tx;
  const _CardData(this.ad, [this.tx]);
}

/* ── screen ──────────────────────────────────────────────────────────────── */

class _SellScreenState extends State<SellScreen> {
  static const _statusKeys = ['all', 'pending', 'completed', 'cancelled'];
  static const _statusLabels = {
    'all': 'ALL',
    'pending': 'PENDING',
    'completed': 'COMPLETE',
    'cancelled': 'CANCEL',
  };

  late bool _buyMode = widget.startOnBuy;
  bool _loading = true;

  List<Map<String, dynamic>> _rows = const [];
  List<Map<String, dynamic>> _txs = const [];
  List<Map<String, dynamic>> _methods = const [];
  List<AdCountry> _countryCatalog = adCountries;
  bool? _hasApproval;
  String _copiedOrderId = '';
  final Map<String, String> _avatarByUserId = {};
  final Map<String, double> _localReservationsByAdId = {};
  Timer? _refreshTimer;
  bool _openedInitialPostAd = false;

  String _currency = ''; // '' → All Currencies
  String _country = ''; // '' → All Countries
  String _status = 'all';

  @override
  void initState() {
    super.initState();
    _load();
    _refreshTimer = Timer.periodic(const Duration(seconds: 12), (_) {
      if (!mounted || _loading) return;
      _load(showLoading: false);
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool showLoading = true}) async {
    if (showLoading && mounted) setState(() => _loading = true);
    try {
      final buy = _buyMode;
      final results = await Future.wait([
        buy ? Api.buyAds() : Api.sellAds(),
        buy ? Api.buyAdTransactions() : Api.sellTransactions(),
        Api.activeTopupMethods(),
        Api.countryCatalog(),
        Api.myCoinRequests(),
      ]);
      final hydratedRows = await _hydrateAdAvatars(results[0] as List<dynamic>);
      final hydratedTxs = await _hydrateTxAvatars(results[1] as List<dynamic>);
      await Api.refreshProfile();
      if (!mounted) return;
      setState(() {
        _rows = hydratedRows;
        _txs = hydratedTxs;
        _methods = results[2];
        _countryCatalog = adCountriesFromApiRows(results[3] as List<dynamic>);
        _hasApproval = (results[4] as List<dynamic>).whereType<Map>().any(
          (row) => _pick(row, ['status']).toLowerCase() == 'verified',
        );
        _localReservationsByAdId.clear();
        _loading = false;
      });
      _openInitialPostAdIfNeeded();
    } catch (error) {
      if (!mounted) return;
      if (showLoading) {
        AppNotifications.error('Wallet unavailable', '$error');
      }
      setState(() => _loading = false);
    }
  }

  void _openInitialPostAdIfNeeded() {
    if (!widget.openPostAd || _openedInitialPostAd || !mounted) return;
    _openedInitialPostAd = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _openMethodPicker();
    });
  }

  Future<List<Map<String, dynamic>>> _hydrateTxAvatars(
    List<dynamic> rawRows,
  ) async {
    final rows = rawRows
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
    await _hydrateRowsByUserId(rows, const [
      'seller_id',
      'user_id',
      'owner_id',
    ]);
    return rows;
  }

  Future<List<Map<String, dynamic>>> _hydrateAdAvatars(
    List<dynamic> rawRows,
  ) async {
    final rows = rawRows
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList(growable: false);
    await _hydrateRowsByUserId(rows, const [
      'user_id',
      'seller_id',
      'owner_id',
      'userId',
    ]);
    return rows;
  }

  Future<void> _hydrateRowsByUserId(
    List<Map<String, dynamic>> rows,
    List<String> ownerKeys,
  ) async {
    final missingOwnerIds = <String>{};
    for (final row in rows) {
      if ((Api.rawAvatar(row) ?? '').isNotEmpty) continue;
      final ownerId = _pick(row, ownerKeys);
      if (ownerId.isNotEmpty && !_avatarByUserId.containsKey(ownerId)) {
        missingOwnerIds.add(ownerId);
      }
    }
    if (missingOwnerIds.isNotEmpty) {
      final profiles = await Future.wait(
        missingOwnerIds.map((id) async => MapEntry(id, await Api.userById(id))),
      );
      for (final entry in profiles) {
        _avatarByUserId[entry.key] = (Api.rawAvatar(entry.value) ?? '').trim();
      }
    }
    for (final row in rows) {
      if ((Api.rawAvatar(row) ?? '').isNotEmpty) continue;
      final ownerId = _pick(row, ownerKeys);
      final avatar = _avatarByUserId[ownerId] ?? '';
      if (avatar.isNotEmpty) row['profile_picture'] = avatar;
    }
  }

  void _setMode(bool buy) {
    if (_buyMode == buy) return;
    setState(() {
      _buyMode = buy;
      _rows = const [];
      _txs = const [];
    });
    _load();
  }

  /* ── derived data ── */

  List<_Ad> get _ads => _rows.map(_Ad.fromRow).toList(growable: false);

  String _txStatus(Map tx) =>
      _pick(tx, ['status'], 'pending').toLowerCase().trim();

  String _txAdId(Map tx) => _pick(tx, ['ad_id', 'adId']);

  dynamic _tryJson(String value) {
    try {
      return jsonDecode(value);
    } catch (_) {
      return null;
    }
  }

  String _methodFieldKey(Map<String, dynamic> field) =>
      _pick(field, ['key', 'name', 'id', 'label']);

  List<Map<String, dynamic>> _methodFieldsForName(String methodName) {
    final method = _methods.firstWhere(
      (row) =>
          _pick(row, ['name', 'title']).toLowerCase() ==
          methodName.toLowerCase(),
      orElse: () => const <String, dynamic>{},
    );
    final raw = method['fields'];
    final parsed = raw is String ? _tryJson(raw) : raw;
    if (parsed is! List) return const [];
    return parsed
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .where((field) => _methodFieldKey(field).isNotEmpty)
        .toList(growable: false);
  }

  List<Map<String, dynamic>> _methodFieldsFor(_Ad ad) =>
      _methodFieldsForName(ad.name);

  double _tradeReceive(_Ad ad, double value) {
    final rate = ad.rate <= 0 ? 0.0001 : ad.rate;
    return _buyMode ? value * rate : value / rate;
  }

  String _txReference(Map tx) => _pick(tx, [
    'tx_id',
    'transaction_id',
    'payment_reference',
    'reference',
    'receipt_number',
  ]);

  String _txProofValue(Map tx) => _pick(tx, [
    'screenshot_data',
    'screenshot_url',
    'screenshot',
    'payment_screenshot',
    'payment_proof',
    'proof_url',
    'proof',
    'receipt_url',
    'receipt',
    'image_url',
  ]);

  bool _txHasImageProof(Map tx) => _txProofValue(tx).isNotEmpty;

  String _txProofName(Map tx) => _pick(tx, [
    'screenshot_name',
    'screenshot_filename',
    'payment_screenshot_name',
    'proof_name',
    'receipt_name',
  ]);

  List<String> _proofUrlCandidates(String proof) {
    final raw = proof.trim();
    if (raw.isEmpty) return const [];
    if (raw.startsWith('data:') || raw.startsWith('http')) return [raw];
    final normalized = raw.replaceAll('\\', '/');
    final candidates = <String>[
      Api.resolveMedia(normalized),
      normalized.startsWith('/') ? normalized : '/$normalized',
    ];
    if (!normalized.startsWith('/uploads/')) {
      candidates.add('/uploads/${normalized.split('/').last}');
    }
    final seen = <String>{};
    return [
      for (final url in candidates)
        if (url.trim().isNotEmpty && seen.add(url)) url,
    ];
  }

  List<Map<String, String>> _transactionRows(
    Map tx, {
    required List<String> detailKeys,
    required List<String> fieldKeys,
    required Map<String, String> directKeys,
    List<Map<String, dynamic>> fallbackFields = const [],
  }) {
    final rows = <Map<String, String>>[];
    void add(String label, dynamic value) {
      final text = _cleanUiText('$value'.trim());
      if (text.isEmpty || text == 'null') return;
      final cleanLabel = _cleanUiText(label.trim());
      if (cleanLabel.isEmpty || cleanLabel.toLowerCase() == 'null') return;
      if (rows.any(
        (row) => row['label'] == cleanLabel && row['value'] == text,
      )) {
        return;
      }
      rows.add({'label': cleanLabel, 'value': text});
    }

    void addMap(Map source) {
      for (final entry in source.entries) {
        final key = '${entry.key}'.trim();
        if (key.isEmpty) continue;
        final label = key
            .replaceAll('_', ' ')
            .split(' ')
            .where((part) => part.isNotEmpty)
            .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
            .join(' ');
        add(label, entry.value);
      }
    }

    void addFieldList(dynamic raw) {
      final parsed = raw is String ? _tryJson(raw) : raw;
      if (parsed is! List) return;
      for (final field in parsed.whereType<Map>()) {
        add(
          '${field['label'] ?? field['key'] ?? field['name'] ?? ''}',
          field['value'],
        );
      }
    }

    void addDetails(dynamic raw) {
      final parsed = raw is String ? _tryJson(raw) : raw;
      if (parsed is Map) addMap(parsed);
      if (parsed is List) addFieldList(parsed);
    }

    for (final key in detailKeys) {
      addDetails(tx[key]);
    }
    for (final key in fieldKeys) {
      addFieldList(tx[key]);
    }
    for (final entry in directKeys.entries) {
      add(entry.value, tx[entry.key]);
    }
    if (rows.isEmpty) addFieldList(fallbackFields);
    return rows;
  }

  List<Map<String, String>> _buyerDetailRows(Map tx) {
    return _transactionRows(
      tx,
      detailKeys: const ['buyer_details'],
      fieldKeys: const ['buyer_fields'],
      directKeys: const {
        'buyer_email': 'Email',
        'buyer_phone': 'Phone',
        'buyer_mobile': 'Phone',
      },
    );
  }

  List<Map<String, String>> _paymentDestinationRows(_Ad ad, Map tx) {
    return _transactionRows(
      tx,
      detailKeys: const ['payment_details', 'seller_details'],
      fieldKeys: const ['seller_fields'],
      directKeys: const {
        'seller_email': 'Email',
        'bank_name': 'Bank Name',
        'bank_account_name': 'Account Name',
        'account_name': 'Account Name',
        'account_number': 'Account Number',
        'bank_account_number': 'Account Number',
        'branch': 'Branch',
        'bank_branch': 'Branch',
        'swift': 'SWIFT',
        'iban': 'IBAN',
        'wallet_address': 'Wallet Address',
        'phone': 'Phone',
        'email': 'Email',
      },
      fallbackFields: ad.adminFields,
    );
  }

  bool _isBuyerTx(Map tx) =>
      _pick(tx, ['buyer_id']).isNotEmpty &&
      Api.currentUserIds.contains(_pick(tx, ['buyer_id']).trim());

  bool _isSellerTx(_Ad ad, Map tx) {
    final sellerId = _pick(tx, ['seller_id']).trim();
    if (sellerId.isNotEmpty) return Api.currentUserIds.contains(sellerId);
    return ad.mine && !_isBuyerTx(tx);
  }

  bool _txHasProof(Map tx) =>
      _txReference(tx).isNotEmpty ||
      _txProofName(tx).isNotEmpty ||
      _txProofValue(tx).isNotEmpty;

  String _txSubmittedCurrency(_Ad ad, Map tx, bool isBuyer) {
    final direct = _pick(tx, ['amount_currency', 'pay_currency']);
    if (direct.isNotEmpty) return direct;
    return _buyMode ? ad.currency : 'Rupieer';
  }

  String _txReceiveCurrency(_Ad ad, Map tx, bool isBuyer) {
    final direct = _pick(tx, ['receive_currency']);
    if (direct.isNotEmpty) return direct;
    return _buyMode ? 'R' : ad.currency;
  }

  String _txAmountDisplay(double value, String currency) {
    final cleanCurrency = currency.trim();
    final amount = _amount(value);
    if (cleanCurrency.isEmpty) return amount;
    if (cleanCurrency.toUpperCase() == 'R') return 'R $amount';
    return '$amount $cleanCurrency';
  }

  bool _canSubmitProof(_Ad ad, Map tx) {
    if (_txStatus(tx) != 'pending' || _txHasProof(tx)) return false;
    return _buyMode ? _isBuyerTx(tx) : _isSellerTx(ad, tx);
  }

  bool _canConfirmProof(_Ad ad, Map tx) {
    if (_txStatus(tx) != 'pending' || !_txHasProof(tx)) return false;
    return _buyMode ? _isSellerTx(ad, tx) : _isBuyerTx(tx);
  }

  double _displayAvailable(_Ad ad) {
    final reserved = _localReservationsByAdId[ad.id] ?? 0;
    final available = ad.available - reserved;
    return available < 0 ? 0 : available;
  }

  String _orderId(Map tx) {
    final raw =
        '${_pick(tx, ['id'])}-${_txAdId(tx)}-${_pick(tx, ['buyer_id'])}-${_pick(tx, ['seller_id'])}-${_pick(tx, ['created_at'])}';
    var hash = 2166136261;
    for (final unit in raw.codeUnits) {
      hash = _imul32(hash ^ unit, 16777619);
    }
    final padded = hash.toString().padLeft(10, '0');
    return padded.length > 10 ? padded.substring(padded.length - 10) : padded;
  }

  int _imul32(int a, int b) {
    final ah = (a >> 16) & 0xffff;
    final al = a & 0xffff;
    final bh = (b >> 16) & 0xffff;
    final bl = b & 0xffff;
    return ((al * bl) + (((ah * bl + al * bh) & 0xffff) << 16)) & 0xffffffff;
  }

  String _formatTxTimestamp(String raw) {
    if (raw.trim().isEmpty) return '';
    final time = DateTime.tryParse(raw)?.toLocal();
    if (time == null) return raw;
    final months = const [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final day = time.day.toString().padLeft(2, '0');
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$day ${months[time.month - 1]} ${time.year}, $hour:$minute';
  }

  Duration? _releaseDuration(_Ad ad) {
    final value = int.tryParse(ad.releaseValue.trim());
    if (value == null || value <= 0) return null;
    switch (ad.releaseUnit.trim()) {
      case 's':
        return Duration(seconds: value);
      case 'min':
        return Duration(minutes: value);
      default:
        return Duration(hours: value);
    }
  }

  String? _releaseCountdown(_Ad ad, Map tx) {
    final duration = _releaseDuration(ad);
    final createdAt = DateTime.tryParse(_pick(tx, ['created_at']));
    if (duration == null || createdAt == null) return null;
    final endsAt = createdAt.toLocal().add(duration);
    final left = endsAt.difference(DateTime.now());
    if (left.isNegative) return '0s';
    if (left.inHours > 0) {
      final minutes = left.inMinutes.remainder(60).toString().padLeft(2, '0');
      return '${left.inHours}h $minutes';
    }
    if (left.inMinutes > 0) {
      final seconds = left.inSeconds.remainder(60).toString().padLeft(2, '0');
      return '${left.inMinutes}m $seconds';
    }
    return '${left.inSeconds}s';
  }

  String _txPartnerName(_Ad ad, Map tx) {
    if (_isBuyerTx(tx)) {
      return _pick(tx, ['seller_full_name', 'seller_username'], ad.username);
    }
    return _pick(tx, ['buyer_full_name', 'buyer_username'], 'Buyer');
  }

  int _txPartnerId(_Ad ad, Map tx) {
    final raw = _isBuyerTx(tx)
        ? _pick(tx, ['seller_id'])
        : _pick(tx, ['buyer_id']);
    return int.tryParse(raw) ?? 0;
  }

  String _guessImageContentType(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  Uint8List? _decodeDataUri(String value) {
    final comma = value.indexOf(',');
    if (!value.startsWith('data:') || comma < 0) return null;
    try {
      return base64Decode(value.substring(comma + 1));
    } catch (_) {
      return null;
    }
  }

  Future<ApiUploadFile?> _pickProofImage() async {
    final source = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(
                  Ionicons.images_outline,
                  color: AppColors.successGreen,
                ),
                title: const Text(
                  'Choose from gallery',
                  style: TextStyle(color: Colors.white),
                ),
                onTap: () => Navigator.pop(ctx, 'gallery'),
              ),
              ListTile(
                leading: const Icon(
                  Ionicons.camera_outline,
                  color: AppColors.successGreen,
                ),
                title: const Text(
                  'Take photo',
                  style: TextStyle(color: Colors.white),
                ),
                onTap: () => Navigator.pop(ctx, 'camera'),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null) return null;
    Uint8List bytes;
    String filename;
    String? mimeType;
    if (source == 'gallery') {
      final picked = await FilePicker.platform.pickFiles(
        type: FileType.image,
        allowMultiple: false,
        withData: true,
      );
      final file = picked?.files.single;
      if (file == null) return null;
      bytes = file.bytes ?? Uint8List(0);
      if (bytes.isEmpty && file.path != null) {
        final xfile = XFile(file.path!);
        bytes = await xfile.readAsBytes();
      }
      filename = file.name.isEmpty
          ? 'proof-${DateTime.now().millisecondsSinceEpoch}.jpg'
          : file.name;
    } else {
      final file = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 92,
        maxWidth: 1600,
      );
      if (file == null) return null;
      bytes = await file.readAsBytes();
      filename = file.name.isEmpty
          ? 'proof-${DateTime.now().millisecondsSinceEpoch}.jpg'
          : file.name;
      mimeType = file.mimeType;
    }
    if (bytes.isEmpty) return null;
    return ApiUploadFile(
      field: 'screenshot',
      filename: filename,
      bytes: bytes,
      contentType: mimeType ?? _guessImageContentType(filename),
    );
  }

  Future<void> _openTradeChat(_Ad ad, Map tx) async {
    final peerId = _txPartnerId(ad, tx);
    if (peerId <= 0) {
      AppNotifications.error('Chat unavailable', 'Could not find chat user.');
      return;
    }
    final partner = _txPartnerName(ad, tx);
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatDmScreen(
          name: partner,
          username: partner,
          avatar: ad.avatar,
          peerId: peerId,
        ),
      ),
    );
  }

  Set<String> get _liveAdIds => {for (final ad in _ads) ad.id};

  Iterable<Map<String, dynamic>> get _openUserTransactions => _txs.where((tx) {
    final adId = _txAdId(tx);
    return _txStatus(tx) == 'pending' &&
        _isBuyerTx(tx) &&
        adId.isNotEmpty &&
        _liveAdIds.contains(adId);
  });

  Set<String> get _openUserAdIds => {
    for (final tx in _openUserTransactions)
      if (_txAdId(tx).isNotEmpty) _txAdId(tx),
  };

  int _txSortStamp(Map tx) {
    final raw = _pick(tx, ['completed_at', 'created_at']);
    return Api.parseServerTime(raw)?.millisecondsSinceEpoch ?? 0;
  }

  Map<String, Map<String, dynamic>> get _latestTxByAdId {
    final latest = <String, Map<String, dynamic>>{};
    for (final raw in _txs.whereType<Map>()) {
      final tx = Map<String, dynamic>.from(raw);
      final adId = _txAdId(tx);
      if (adId.isEmpty) continue;
      final existing = latest[adId];
      if (existing == null || _txSortStamp(tx) >= _txSortStamp(existing)) {
        latest[adId] = tx;
      }
    }
    return latest;
  }

  bool get _hasOpenUserTrade => _openUserTransactions.isNotEmpty;

  bool _adHasOpenUserTrade(_Ad ad) => _openUserAdIds.contains(ad.id);

  Map<String, dynamic>? get _activeOpenUserTrade {
    final list = _openUserTransactions.toList()
      ..sort((a, b) => _txSortStamp(b).compareTo(_txSortStamp(a)));
    return list.isEmpty ? null : Map<String, dynamic>.from(list.first);
  }

  bool _hasUnsubmittedSellerLock(_Ad ad) {
    final tx = _latestTxByAdId[ad.id];
    if (tx == null) return false;
    return _txStatus(tx) == 'pending' && !_txHasProof(tx);
  }

  bool _hasBuySellerUnsubmittedLock(_Ad ad) {
    for (final tx in _latestTxByAdId.values) {
      if (_txStatus(tx) != 'pending' || _txHasProof(tx)) continue;
      if (_pick(tx, ['seller_id']).trim() == ad.ownerId.trim()) return true;
    }
    return false;
  }

  bool _isGlobalTradeBlockedForAd(_Ad ad) {
    if (_buyMode) return _hasOpenUserTrade && !_adHasOpenUserTrade(ad);
    return _hasOpenUserTrade;
  }

  bool _isOwnAdLocked(_Ad ad) =>
      ad.serverLocked || _hasUnsubmittedSellerLock(ad);

  bool _isTradeActionLocked(_Ad ad) => _buyMode
      ? _hasBuySellerUnsubmittedLock(ad)
      : _hasUnsubmittedSellerLock(ad);

  Map<String, dynamic>? _blockingTradeForAd(_Ad ad) {
    if (_hasOpenUserTrade) return _activeOpenUserTrade;
    final adTx = _latestTxByAdId[ad.id];
    if (adTx != null && _txStatus(adTx) == 'pending' && !_txHasProof(adTx)) {
      return adTx;
    }
    return null;
  }

  _Ad _freshAd(_Ad ad) {
    for (final item in _ads) {
      if (item.id == ad.id) return item;
    }
    return ad;
  }

  List<String> get _currencyOptions {
    final set = <String>{'LKR', 'USD', 'USDT'};
    for (final ad in _ads) {
      if (ad.currency.trim().isNotEmpty) set.add(ad.currency.trim());
    }
    final list = set.toList()..sort();
    return list;
  }

  List<String> get _countryOptions {
    final catalog = _countryCatalog.isEmpty ? adCountries : _countryCatalog;
    final set = <String>{for (final country in catalog) country.name};
    for (final ad in _ads) {
      if (ad.country.trim().isNotEmpty) set.add(ad.country.trim());
    }
    final list = set.toList()..sort();
    return list;
  }

  String _countryFlag(String name) {
    final raw = name.trim();
    if (raw.length == 2) return adCountryFlagFromCode(raw.toUpperCase());
    final catalog = _countryCatalog.isEmpty ? adCountries : _countryCatalog;
    for (final country in catalog) {
      if (country.name.toLowerCase() == name.trim().toLowerCase()) {
        return country.flag;
      }
    }
    return adCountryFlagByName(name);
  }

  bool _passesFilters(_Ad ad) {
    if (_currency.isNotEmpty && ad.currency != _currency) return false;
    if (_country.isNotEmpty && ad.country != _country) return false;
    return true;
  }

  _Ad? _ownAdForCatalogEntry(_CatalogEntry entry) {
    final entryKeys = <String>{_methodKey(entry.id), _methodKey(entry.name)}
      ..removeWhere((key) => key.isEmpty);
    for (final ad in _ads) {
      if (!ad.mine) continue;
      final adKeys = <String>{
        _methodKey(ad.catalogId),
        _methodKey(ad.name),
        _methodKey(ad.svgFile),
        _methodKey(ad.logo),
      }..removeWhere((key) => key.isEmpty);
      if (adKeys.any(entryKeys.contains)) return ad;
    }
    return null;
  }

  List<_CardData> get _cards {
    final ads = _ads;
    if (_status == 'all') {
      return ads
          // Someone else's inactive ad is not tradeable, so the web hides it.
          .where((ad) => (ad.mine || !ad.inactive) && _passesFilters(ad))
          .map((ad) => _CardData(ad))
          .toList(growable: false);
    }
    // Status tabs are transaction views: one card per order, newest first, the
    // ad row merged in when it still exists.
    final byId = {for (final ad in ads) ad.id: ad};
    final matching = _txs.where((tx) => _txStatus(tx) == _status).toList()
      ..sort(
        (a, b) => _pick(b, [
          'completed_at',
          'created_at',
        ]).compareTo(_pick(a, ['completed_at', 'created_at'])),
      );
    return matching
        .map(
          (tx) => _CardData(byId[_txAdId(tx)] ?? _Ad.fromTransaction(tx), tx),
        )
        .where(
          (card) => card.ad.id.startsWith('tx-') || _passesFilters(card.ad),
        )
        .toList(growable: false);
  }

  /* ── build ── */

  @override
  Widget build(BuildContext context) {
    final cards = _cards;
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: AppColors.textGray300,
          backgroundColor: AppColors.bg1,
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 40),
            children: [
              AppBackButton(),
              const SizedBox(height: 14),
              _modeButtons(),
              const SizedBox(height: 10),
              const Text(
                'Your active payment methods.',
                style: TextStyle(fontSize: 11, color: AppColors.textGray600),
              ),
              const SizedBox(height: 12),
              _filterRow(),
              const SizedBox(height: 12),
              _statusChips(),
              const SizedBox(height: 14),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 60),
                  child: Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.textGray400,
                      ),
                    ),
                  ),
                )
              else if (cards.isEmpty)
                _emptyState()
              else
                for (final card in cards) ...[
                  KeyedSubtree(
                    key: ValueKey(
                      '${_buyMode ? 'buy' : 'sell'}-$_status-${card.ad.id}-${card.tx == null ? 'ad' : _pick(card.tx!, ['id', 'transaction_id'])}',
                    ),
                    child: _adCard(card),
                  ),
                  const SizedBox(height: 10),
                ],
            ],
          ),
        ),
      ),
    );
  }

  /* ── header controls ── */

  Widget _modeButtons() {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        _modeButton(
          'BUY COINS',
          Ionicons.cash_outline,
          active: _buyMode,
          activeColor: _buyGreen,
          onTap: () => _setMode(true),
        ),
        _modeButton(
          'SELL COINS',
          Ionicons.cash_outline,
          active: !_buyMode,
          activeColor: _sellRed,
          onTap: () => _setMode(false),
        ),
        _modeButton(
          'REQUEST',
          Ionicons.paper_plane_outline,
          active: false,
          activeColor: _sellRed,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const RequestScreen()),
          ),
        ),
        if (!_buyMode)
          _modeButton(
            'TOP UP',
            Ionicons.add_circle_outline,
            active: false,
            activeColor: _sellRed,
            onTap: () => _setMode(true),
          ),
        _modeButton(
          'POST AD',
          Ionicons.add_outline,
          active: false,
          activeColor: _sellRed,
          light: true,
          onTap: _openMethodPicker,
        ),
      ],
    );
  }

  Widget _modeButton(
    String label,
    IconData icon, {
    required bool active,
    required Color activeColor,
    required VoidCallback onTap,
    bool light = false,
  }) {
    final background = light
        ? Colors.white
        : active
        ? activeColor
        : _chipBg;
    final foreground = light
        ? Colors.black
        : active
        ? (activeColor == _buyGreen ? Colors.black : Colors.white)
        : AppColors.textGray300;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: light || active
                ? Colors.transparent
                : AppColors.borderWhite10,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 11, color: foreground),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w600,
                color: foreground,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _filterRow() {
    final filtered = _currency.isNotEmpty || _country.isNotEmpty;
    return Row(
      children: [
        Expanded(
          child: _selector(
            _currency.isEmpty ? 'All Currencies' : _currency,
            muted: _currency.isEmpty,
            onTap: () async {
              final picked = await _pickOption(
                'Currency',
                'All Currencies',
                _currencyOptions,
                _currency,
              );
              if (picked != null && mounted) setState(() => _currency = picked);
            },
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _selector(
            _country.isEmpty
                ? 'All Countries'
                : '${_countryFlag(_country)} $_country'.trim(),
            muted: _country.isEmpty,
            onTap: () async {
              final picked = await _pickOption(
                'Country',
                'All Countries',
                _countryOptions,
                _country,
                showCountryFlags: true,
              );
              if (picked != null && mounted) setState(() => _country = picked);
            },
          ),
        ),
        if (filtered) ...[
          const SizedBox(width: 6),
          GestureDetector(
            onTap: () => setState(() {
              _currency = '';
              _country = '';
            }),
            behavior: HitTestBehavior.opaque,
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
              child: Text(
                'CLEAR',
                style: TextStyle(
                  fontSize: 9.5,
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textGray400,
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _selector(String label, {required bool muted, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
        decoration: BoxDecoration(
          color: _cardBg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _webBorder),
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
                  color: muted ? AppColors.textGray400 : Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Ionicons.chevron_down_outline,
              size: 10,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusChips() {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final key in _statusKeys)
          GestureDetector(
            onTap: () => setState(() => _status = key),
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: _status == key ? Colors.white : _chipBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: _status == key ? Colors.white : _webBorder,
                ),
              ),
              child: Text(
                _statusLabels[key]!,
                style: TextStyle(
                  fontSize: 9.5,
                  letterSpacing: 1.2,
                  fontWeight: FontWeight.w800,
                  color: _status == key ? Colors.black : AppColors.textGray500,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _emptyState() {
    final label = _status == 'all'
        ? 'No ads posted yet'
        : 'No ${_statusLabels[_status]!.toLowerCase()} orders';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Column(
        children: [
          const Icon(
            Ionicons.card_outline,
            size: 34,
            color: AppColors.textGray700,
          ),
          const SizedBox(height: 10),
          Text(
            label.toUpperCase(),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 10,
              letterSpacing: 1.4,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray600,
            ),
          ),
        ],
      ),
    );
  }

  /* ── ad card ── */

  Widget _adCard(_CardData card) {
    final ad = card.ad;
    final freshAd = _freshAd(ad);
    final locked = ad.mine
        ? (!freshAd.inactive && _isOwnAdLocked(freshAd))
        : _isTradeActionLocked(freshAd);
    final isCancelledTabTx = _status == 'cancelled' && card.tx != null;
    final content = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _webBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          card.tx == null || isCancelledTabTx
              ? _userRow(ad)
              : _tradeUserRow(ad, card.tx!),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: _priceBlock(card)),
              const SizedBox(width: 10),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 132),
                child: _sideBlock(card, locked),
              ),
            ],
          ),
          if (card.tx != null && !isCancelledTabTx) ...[
            ..._reportBadges(card.tx!).map(
              (badge) => Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Align(
                  alignment: Alignment.centerRight,
                  child: _reportBadge(badge, compact: true),
                ),
              ),
            ),
          ],
          if (card.tx == null && locked && ad.mine && !ad.inactive) ...[
            const SizedBox(height: 10),
            _lockLine(),
          ],
        ],
      ),
    );
    if (card.tx == null || isCancelledTabTx) return content;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _openTxDetails(ad, card.tx!),
      child: content,
    );
  }

  Widget _userRow(_Ad ad) {
    return Row(
      children: [
        _avatar(ad),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            ad.username,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(width: 4),
        const Icon(
          Ionicons.checkmark_circle,
          size: 13,
          color: AppColors.successGreen,
        ),
      ],
    );
  }

  Widget _tradeUserRow(_Ad ad, Map tx) {
    return Row(
      children: [
        _avatar(ad),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            ad.username,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(width: 4),
        const Icon(
          Ionicons.checkmark_circle,
          size: 13,
          color: AppColors.successGreen,
        ),
      ],
    );
  }

  Widget _avatar(_Ad ad) {
    final initial = ad.username.isEmpty
        ? '?'
        : ad.username.characters.first.toUpperCase();
    final fallback = Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: _greenBg,
        shape: BoxShape.circle,
        border: Border.fromBorderSide(BorderSide(color: _greenBorder)),
      ),
      child: Text(
        initial,
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: AppColors.successGreen,
        ),
      ),
    );
    final memoryBytes = _decodeDataUri(ad.avatar);
    if (memoryBytes != null) {
      return ClipOval(
        child: Image.memory(
          memoryBytes,
          width: 28,
          height: 28,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => fallback,
        ),
      );
    }
    if (ad.avatar.isEmpty) return fallback;
    return ClipOval(
      child: ad.avatar.toLowerCase().contains('.svg')
          ? SvgPicture.network(
              ad.avatar,
              width: 28,
              height: 28,
              fit: BoxFit.cover,
              placeholderBuilder: (_) => fallback,
            )
          : Image.network(
              ad.avatar,
              width: 28,
              height: 28,
              fit: BoxFit.cover,
              webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
              errorBuilder: (_, __, ___) => fallback,
            ),
    );
  }

  Widget _priceBlock(_CardData card) {
    final ad = card.ad;
    final tx = _status == 'cancelled' ? null : card.tx;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // The rate is the largest text on the card; scaling it down beats
        // clipping it when a four-digit rate meets a 320px screen.
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              const Text(
                'R',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textGray400,
                ),
              ),
              const SizedBox(width: 3),
              Text(
                _amount(ad.rate),
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 4),
              Text(
                '/${ad.currency}',
                style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.textGray400,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        _statLine('Limit', 'R ${_amount(ad.min)} – R ${_amount(ad.max)}'),
        const SizedBox(height: 2),
        _statLine('Available', 'R ${_amount(_displayAvailable(ad))}'),
        if (tx != null) ...[
          const SizedBox(height: 2),
          _copyStatLine('Order ID', _orderId(tx)),
          const SizedBox(height: 2),
          _statLine(
            _txStatus(tx) == 'completed'
                ? 'Confirmed'
                : (_releaseCountdown(ad, tx) != null ? 'Time Left' : 'Started'),
            _txStatus(tx) == 'completed'
                ? _formatTxTimestamp(_pick(tx, ['completed_at', 'created_at']))
                : (_releaseCountdown(ad, tx) ??
                      _formatTxTimestamp(_pick(tx, ['created_at']))),
          ),
        ],
        if (ad.mine && ad.inactive) ...[
          const SizedBox(height: 3),
          const Text(
            'Inactive · wallet below balance',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w500,
              color: _sellRed,
            ),
          ),
        ],
      ],
    );
  }

  Widget _statLine(String label, String value) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: '$label  ',
            style: const TextStyle(color: AppColors.textGray600),
          ),
          TextSpan(
            text: _cleanUiText(value),
            style: const TextStyle(
              color: AppColors.textGray300,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 10.5),
    );
  }

  Widget _copyStatLine(String label, String value) {
    final copied = _copiedOrderId == value;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(child: _statLine(label, value)),
        const SizedBox(width: 4),
        GestureDetector(
          onTap: () => _copyOrderId(value),
          behavior: HitTestBehavior.opaque,
          child: Icon(
            copied ? Ionicons.checkmark : Ionicons.copy_outline,
            size: 12,
            color: copied ? AppColors.successGreen : AppColors.textGray500,
          ),
        ),
      ],
    );
  }

  Widget _sideBlock(_CardData card, bool locked) {
    final ad = card.ad;
    final tx = card.tx;
    final isCancelledTabTx = _status == 'cancelled' && tx != null;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (tx != null && _canShowTradeChat(ad, tx)) ...[
          _tradeChatBadge(ad, tx),
          const SizedBox(height: 8),
        ],
        Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            Flexible(
              child: Text(
                _cleanUiText(ad.name),
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 5),
            _methodBadge(ad.name, ad.resolvedLogo, size: 16),
          ],
        ),
        if (ad.country.isNotEmpty) ...[
          const SizedBox(height: 2),
          Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              const Icon(
                Ionicons.globe_outline,
                size: 9,
                color: AppColors.textGray600,
              ),
              const SizedBox(width: 3),
              Flexible(
                child: Text(
                  _cleanUiText(ad.country),
                  textAlign: TextAlign.right,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textGray500,
                  ),
                ),
              ),
            ],
          ),
        ],
        if (ad.timeWindow.isNotEmpty) ...[
          const SizedBox(height: 2),
          Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              const Icon(
                Ionicons.time_outline,
                size: 10,
                color: AppColors.textGray600,
              ),
              const SizedBox(width: 3),
              Flexible(
                child: Text(
                  ad.timeWindow,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.textGray500,
                  ),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 8),
        if (isCancelledTabTx) _txChip('cancelled') else _actions(card, locked),
      ],
    );
  }

  bool _canShowTradeChat(_Ad ad, Map tx) =>
      _txPartnerId(ad, tx) > 0 &&
      (_txStatus(tx) == 'pending' || _txStatus(tx) == 'completed');

  Future<void> _copyOrderId(String id) async {
    await Clipboard.setData(ClipboardData(text: id));
    if (!mounted) return;
    setState(() => _copiedOrderId = id);
    AppNotifications.info('Order ID copied');
    Future.delayed(const Duration(seconds: 3), () {
      if (!mounted || _copiedOrderId != id) return;
      setState(() => _copiedOrderId = '');
    });
  }

  Widget _tradeChatBadge(_Ad ad, Map tx) {
    final partner = _txPartnerName(ad, tx);
    return GestureDetector(
      onTap: () => _openTradeChat(ad, tx),
      behavior: HitTestBehavior.opaque,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 128),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: _greenBg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _greenBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                partner,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.successGreen,
                ),
              ),
            ),
            const SizedBox(width: 5),
            const Icon(
              Ionicons.chatbubble_ellipses_outline,
              size: 12,
              color: AppColors.successGreen,
            ),
          ],
        ),
      ),
    );
  }

  Widget _methodBadge(String name, String logo, {required double size}) {
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: _letterColor(name),
        borderRadius: BorderRadius.circular(size * 0.25),
      ),
      child: Text(
        name.isEmpty ? '?' : name.characters.first.toUpperCase(),
        style: TextStyle(
          fontSize: size * 0.55,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),
    );
    final memoryBytes = _decodeDataUri(logo);
    if (memoryBytes != null) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.25),
        child: Container(
          width: size,
          height: size,
          color: Colors.white,
          padding: EdgeInsets.all(size * 0.1),
          child: Image.memory(
            memoryBytes,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => fallback,
          ),
        ),
      );
    }
    if (logo.isEmpty) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.25),
      child: Container(
        width: size,
        height: size,
        color: Colors.white,
        padding: EdgeInsets.all(size * 0.1),
        child: logo.toLowerCase().contains('.svg')
            ? SvgPicture.network(
                logo,
                fit: BoxFit.contain,
                placeholderBuilder: (_) => fallback,
              )
            : Image.network(
                logo,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => fallback,
              ),
      ),
    );
  }

  Widget _actions(_CardData card, bool locked) {
    final ad = card.ad;
    final tx = card.tx;

    if (tx != null) return _txActions(ad, tx);

    if (ad.mine) {
      // A locked ad is mid-trade; editing or deleting it under the buyer would
      // strand the transaction, so both actions go dead until it unlocks.
      return Wrap(
        alignment: WrapAlignment.end,
        spacing: 6,
        runSpacing: 6,
        children: [
          _pillButton(
            'Edit',
            enabled: !locked,
            onTap: () => _openAdForm(ad: ad),
          ),
          _pillButton(
            'Delete',
            enabled: !locked,
            danger: true,
            onTap: () => _deleteAd(ad),
          ),
        ],
      );
    }

    final label = _buyMode ? 'Buy' : 'Sell';
    final tone = _buyMode ? _buyGreen : _sellRed;
    if (ad.inactive) {
      return _solidButton('Inactive', _sellRed, enabled: false, onTap: () {});
    }
    final targetAd = _freshAd(ad);
    final globallyBlocked = _isGlobalTradeBlockedForAd(targetAd);
    final adLocked = _isTradeActionLocked(targetAd);
    final blockedByOpenTrade = globallyBlocked || adLocked;
    return _solidButton(
      label,
      tone,
      enabled: !adLocked,
      onTap: globallyBlocked
          ? () => _showPendingTradeLock(_blockingTradeForAd(targetAd))
          : blockedByOpenTrade
          ? () {}
          : () => _openTradeSheet(targetAd),
    );
  }

  Widget _txActions(_Ad ad, Map<String, dynamic> tx) {
    final status = _txStatus(tx);
    final chip = _txChip(status);
    final canConfirm = _canConfirmProof(ad, tx);
    final canOpenDetails =
        status == 'pending' &&
        (ad.mine || _isBuyerTx(tx) || _txHasProof(tx) || canConfirm);
    if (status == 'cancelled') {
      return Wrap(
        alignment: WrapAlignment.end,
        spacing: 6,
        runSpacing: 6,
        children: [chip],
      );
    }
    return Wrap(
      alignment: WrapAlignment.end,
      spacing: 6,
      runSpacing: 6,
      children: [
        chip,
        if (canConfirm)
          _pillButton(
            'Confirm',
            tone: AppColors.successGreen,
            onTap: () => _confirmTrade(tx),
          ),
        if (canOpenDetails)
          _pillButton('View', onTap: () => _openTxDetails(ad, tx)),
        if (status == 'pending' &&
            _buyMode &&
            _isBuyerTx(tx) &&
            !_txHasProof(tx))
          _pillButton(
            'Cancel',
            danger: true,
            onTap: () => _confirmCancelBuy(tx),
          ),
        if (status == 'pending' && !_buyMode && ad.mine && !_txHasProof(tx))
          _pillButton(
            'Cancel',
            danger: true,
            onTap: () => _txAction(tx, 'cancel'),
          ),
        if (_canReportTx(tx))
          _pillButton('Report', danger: true, onTap: () => _reportTx(tx)),
      ],
    );
  }

  Widget _txChip(String status) {
    final (label, tone) = switch (status) {
      'completed' => ('COMPLETED', AppColors.successGreen),
      'cancelled' => ('CANCELLED', _sellRed),
      _ => ('PENDING', _amber),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: tone == _amber
            ? _amberBg
            : tone == _sellRed
            ? _redBg
            : _greenBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: tone == _amber
              ? _amberBorder
              : tone == _sellRed
              ? _redBorder
              : _greenBorder,
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 9,
          letterSpacing: 1.1,
          fontWeight: FontWeight.w700,
          color: tone,
        ),
      ),
    );
  }

  List<({String label, String reason})> _reportBadges(Map tx) {
    final buyerReason = _pick(tx, [
      'buyer_report_reason',
      'buyer_report',
      'buyerReportReason',
      'buyer_reason',
      'buyerReport',
      'reported_by_buyer_reason',
    ]);
    final sellerReason = _pick(tx, [
      'seller_report_reason',
      'seller_report',
      'sellerReportReason',
      'seller_reason',
      'sellerReport',
      'reported_by_seller_reason',
    ]);
    final genericReason = _pick(tx, [
      'report_reason',
      'reported_reason',
      'reportReason',
      'reason',
      'report',
    ]);
    final reporter = _pick(tx, [
      'reported_by',
      'reporter',
      'reporter_role',
      'report_role',
    ]).toLowerCase();
    return [
      if (sellerReason.isNotEmpty ||
          (genericReason.isNotEmpty && reporter.contains('seller')))
        (
          label: 'REPORTED BY SELLER',
          reason: sellerReason.isNotEmpty ? sellerReason : genericReason,
        ),
      if (buyerReason.isNotEmpty ||
          (genericReason.isNotEmpty && reporter.contains('buyer')))
        (
          label: 'REPORTED BY BUYER',
          reason: buyerReason.isNotEmpty ? buyerReason : genericReason,
        ),
      if (buyerReason.isEmpty &&
          sellerReason.isEmpty &&
          genericReason.isNotEmpty &&
          !reporter.contains('seller') &&
          !reporter.contains('buyer'))
        (label: 'REPORTED', reason: genericReason),
    ];
  }

  String _ownReportReason(Map tx) {
    if (_isBuyerTx(tx)) {
      return _pick(tx, [
        'buyer_report_reason',
        'buyer_report',
        'buyerReportReason',
        'buyer_reason',
        'buyerReport',
        'reported_by_buyer_reason',
      ]);
    }
    return _pick(tx, [
      'seller_report_reason',
      'seller_report',
      'sellerReportReason',
      'seller_reason',
      'sellerReport',
      'reported_by_seller_reason',
    ]);
  }

  bool _canReportTx(Map tx) {
    final status = _txStatus(tx);
    return (status == 'pending' || status == 'completed') &&
        _ownReportReason(tx).isEmpty;
  }

  Widget _reportBadge(
    ({String label, String reason}) badge, {
    bool compact = false,
  }) {
    return Container(
      constraints: compact
          ? const BoxConstraints(maxWidth: 170)
          : const BoxConstraints(minWidth: double.infinity),
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 10 : 12,
        vertical: compact ? 8 : 10,
      ),
      decoration: BoxDecoration(
        color: const Color(0x26EF4444),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0x80EF4444)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            badge.label,
            style: const TextStyle(
              fontSize: 8,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w800,
              color: Color(0xFFFF6666),
            ),
          ),
          SizedBox(height: compact ? 3 : 5),
          Text(
            badge.reason,
            maxLines: compact ? 2 : null,
            overflow: compact ? TextOverflow.ellipsis : TextOverflow.visible,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: Color(0xFFFFB4B4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _lockLine() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: _amberBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _amberBorder),
      ),
      child: Row(
        children: [
          const Icon(Ionicons.lock_closed_outline, size: 11, color: _amber),
          const SizedBox(width: 6),
          const Expanded(
            child: Text(
              'Locked · transaction in progress',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w500,
                color: _amber,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showApprovalRequired() {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              color: AppColors.bg1,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _amberBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: _amberBorder),
                  ),
                  child: const Icon(
                    Ionicons.lock_closed_outline,
                    size: 20,
                    color: _amber,
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Approval Required',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'You need admin approval before posting an ad.\nPlease send a request and wait for it to be verified.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11.5,
                    height: 1.45,
                    color: AppColors.textGray500,
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.maybePop(ctx),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(
                            color: AppColors.borderWhite10,
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: const Text(
                          'CANCEL',
                          style: TextStyle(color: Colors.white),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.maybePop(ctx);
                          Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const RequestScreen(),
                            ),
                          );
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: const Text('SEND REQUEST'),
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
  }

  Future<void> _showPendingTradeLock(Map<String, dynamic>? tx) {
    final adId = tx == null ? '' : _txAdId(tx);
    _Ad? ad;
    if (adId.isNotEmpty) {
      for (final item in _ads) {
        if (item.id == adId) {
          ad = item;
          break;
        }
      }
    }
    final name =
        ad?.name ??
        (tx == null
            ? 'Pending trade'
            : _pick(tx, [
                'payment_method_name',
                'method_name',
                'ad_name',
                'name',
              ], 'Pending trade'));
    final amount = tx == null ? 0.0 : _pickNum(tx, ['amount', 'coins']);
    final submitted = tx == null || _txHasProof(tx);
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              color: AppColors.bg1,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 50,
                  height: 50,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _amberBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: _amberBorder),
                  ),
                  child: const Icon(
                    Ionicons.time_outline,
                    size: 24,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Locked - Pending Transaction',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'You already have a pending transaction. Cancel or complete it before buying from another ad.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.45,
                    color: AppColors.textGray500,
                  ),
                ),
                if (tx != null) ...[
                  const SizedBox(height: 18),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.black,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.borderWhite10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'PENDING TRANSACTION',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.4,
                            color: AppColors.textGray500,
                          ),
                        ),
                        const SizedBox(height: 7),
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          'ID: ${_pick(tx, ['id'])} - Amount: ${_amount(amount)} - ${submitted ? 'Submitted, awaiting seller' : 'Awaiting payment details'}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textGray600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () => Navigator.maybePop(ctx),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF232327),
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'OK',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          Navigator.maybePop(ctx);
                          setState(() => _status = 'pending');
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'VIEW PENDING',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1,
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
  }

  Widget _pillButton(
    String label, {
    required VoidCallback onTap,
    bool enabled = true,
    bool danger = false,
    Color? tone,
  }) {
    final color = tone ?? (danger ? _sellRed : AppColors.textGray300);
    return GestureDetector(
      onTap: enabled ? onTap : null,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
        decoration: BoxDecoration(
          color: danger ? _redBg : _chipBg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: danger ? _redBorder : AppColors.borderWhite10,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: enabled ? color : AppColors.textGray700,
          ),
        ),
      ),
    );
  }

  Widget _solidButton(
    String label,
    Color tone, {
    required VoidCallback onTap,
    bool enabled = true,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          color: enabled ? tone : _chipBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: enabled ? Colors.transparent : AppColors.borderWhite10,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: enabled
                ? (tone == _buyGreen ? Colors.black : Colors.white)
                : AppColors.textGray600,
          ),
        ),
      ),
    );
  }

  /* ── sheets ── */

  Future<String?> _pickOption(
    String title,
    String anyLabel,
    List<String> options,
    String current, {
    bool showCountryFlags = false,
  }) {
    final search = TextEditingController();
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.black,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final query = search.text.trim().toLowerCase();
          final pickerOptions = showCountryFlags && options.isEmpty
              ? adCountries.map((country) => country.name).toList()
              : options;
          final filtered = query.isEmpty
              ? pickerOptions
              : pickerOptions
                    .where((option) {
                      final catalog = _countryCatalog.isEmpty
                          ? adCountries
                          : _countryCatalog;
                      final country = catalog.firstWhere(
                        (row) =>
                            row.name.toLowerCase() ==
                            option.trim().toLowerCase(),
                        orElse: () => AdCountry('', option),
                      );
                      return option.toLowerCase().contains(query) ||
                          country.code.toLowerCase().contains(query);
                    })
                    .toList(growable: false);
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(ctx).size.height * 0.68,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  if (showCountryFlags) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                      child: SizedBox(
                        height: 40,
                        child: TextField(
                          controller: search,
                          onChanged: (_) => setSheet(() {}),
                          style: const TextStyle(
                            fontSize: 12,
                            color: Colors.white,
                          ),
                          cursorColor: Colors.white,
                          decoration: InputDecoration(
                            prefixIcon: const Icon(
                              Ionicons.search_outline,
                              size: 15,
                              color: AppColors.textGray500,
                            ),
                            hintText: 'Search countries',
                            hintStyle: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textGray600,
                            ),
                            isDense: true,
                            filled: true,
                            fillColor: const Color(0xFF0D0D0D),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(
                                color: AppColors.borderWhite10,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(
                                color: AppColors.borderWhite10,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(10),
                              borderSide: const BorderSide(
                                color: AppColors.successGreen,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      padding: const EdgeInsets.fromLTRB(10, 0, 10, 14),
                      children: [
                        for (final option in ['', ...filtered])
                          ListTile(
                            dense: true,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 2,
                            ),
                            title: Row(
                              children: [
                                if (showCountryFlags && option.isNotEmpty) ...[
                                  SizedBox(
                                    width: 28,
                                    child: Text(
                                      _countryFlag(option),
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(fontSize: 18),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                ],
                                Expanded(
                                  child: Text(
                                    option.isEmpty ? anyLabel : option,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: showCountryFlags ? 13.5 : 12.5,
                                      fontWeight: FontWeight.w600,
                                      color: option == current
                                          ? Colors.white
                                          : AppColors.textGray300,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            trailing: option == current
                                ? const Icon(
                                    Ionicons.checkmark,
                                    size: 15,
                                    color: AppColors.successGreen,
                                  )
                                : null,
                            onTap: () => Navigator.pop(ctx, option),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ).whenComplete(search.dispose);
  }

  Widget _countryPickerField(
    TextEditingController controller,
    String hint, {
    required ValueChanged<String> onPicked,
  }) {
    final current = controller.text.trim();
    final display = current.isEmpty
        ? hint
        : '${_countryFlag(current)} $current'.trim();
    return GestureDetector(
      onTap: () async {
        final picked = await _pickOption(
          'Country',
          'All Countries',
          _countryOptions,
          current,
          showCountryFlags: true,
        );
        if (picked == null) return;
        controller.text = picked;
        onPicked(picked);
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                display,
                style: TextStyle(
                  fontSize: 12.5,
                  color: current.isEmpty ? AppColors.textGray600 : Colors.white,
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Icon(
              Ionicons.chevron_down_outline,
              size: 14,
              color: AppColors.textGray500,
            ),
          ],
        ),
      ),
    );
  }

  /// `Select Payment Method` — the catalogue grid. Only methods admin has
  /// approved (whatever `active-topup-methods` returns) can be picked; the rest
  /// stay in the grid, dimmed, so the user can see what exists.
  Future<void> _openMethodPicker({_Ad? editing}) async {
    if (editing == null && _buyMode && _hasApproval == false) {
      _showApprovalRequired();
      return;
    }
    final approved = <String, Map<String, dynamic>>{};
    for (final method in _methods) {
      final name = _pick(method, ['name', 'title']);
      final keys = <String>{
        _methodKey(name),
        _methodKey(_pick(method, ['catalog_id', 'catalogId'])),
        _methodKey(_pick(method, ['svg_file', 'svgFile'])),
        name.trim().toLowerCase(),
      }..removeWhere((key) => key.isEmpty);
      for (final key in keys) {
        approved[key] = method;
      }
    }

    // Catalogue first, then any approved method the catalogue does not know
    // about, filed under its own `category`/`type` (WALLET when unset).
    final entries = <_CatalogEntry>[..._catalog];
    for (final method in _methods) {
      final name = _pick(method, ['name', 'title']);
      if (name.isEmpty) continue;
      final known = entries.any(
        (e) => e.name.toLowerCase() == name.toLowerCase(),
      );
      if (known) continue;
      final category = _pick(method, [
        'category',
        'type',
      ], 'WALLET').toUpperCase();
      entries.add(
        _CatalogEntry(
          _pick(method, ['catalog_id', 'id'], name.toLowerCase()),
          name,
          _categories.contains(category) ? category : 'WALLET',
        ),
      );
    }

    final selected = await showModalBottomSheet<_CatalogEntry>(
      context: context,
      backgroundColor: Colors.black,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        var category = editing == null
            ? _categories.first
            : (_categories.contains(editing.category.toUpperCase())
                  ? editing.category.toUpperCase()
                  : _categories.first);
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            final visible = entries
                .where((e) => e.category == category)
                .toList(growable: false);

            return SafeArea(
              child: SizedBox(
                height: MediaQuery.of(ctx).size.height * 0.72,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 12, 10),
                      child: Row(
                        children: [
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Select Payment Method',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                ),
                                SizedBox(height: 3),
                                Text(
                                  'Only admin-approved methods can be selected',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 10.5,
                                    color: AppColors.textGray600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          GestureDetector(
                            onTap: () => Navigator.maybePop(ctx),
                            behavior: HitTestBehavior.opaque,
                            child: Container(
                              width: 28,
                              height: 28,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: _chipBg,
                                borderRadius: BorderRadius.circular(9),
                              ),
                              child: const Icon(
                                Ionicons.close_outline,
                                size: 15,
                                color: AppColors.textGray400,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1, color: AppColors.borderWhite10),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                      child: Row(
                        children: [
                          for (final tab in _categories) ...[
                            GestureDetector(
                              onTap: () => setSheet(() => category = tab),
                              behavior: HitTestBehavior.opaque,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 7,
                                ),
                                decoration: BoxDecoration(
                                  color: category == tab
                                      ? Colors.white
                                      : _chipBg,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  tab,
                                  style: TextStyle(
                                    fontSize: 11,
                                    letterSpacing: 1.1,
                                    fontWeight: FontWeight.w600,
                                    color: category == tab
                                        ? Colors.black
                                        : AppColors.textGray500,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                          ],
                        ],
                      ),
                    ),
                    const Divider(height: 1, color: AppColors.borderWhite10),
                    Expanded(
                      child: GridView.count(
                        crossAxisCount: 4,
                        padding: const EdgeInsets.all(12),
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 0.82,
                        children: [
                          for (final entry in visible)
                            Builder(
                              builder: (_) {
                                final existingAd =
                                    editing ?? _ownAdForCatalogEntry(entry);
                                final posted =
                                    editing == null && existingAd != null;
                                final approvedForEntry =
                                    approved.containsKey(
                                      _methodKey(entry.id),
                                    ) ||
                                    approved.containsKey(
                                      _methodKey(entry.name),
                                    ) ||
                                    approved.containsKey(
                                      entry.name.toLowerCase(),
                                    );
                                return _methodTile(
                                  entry,
                                  approved: approvedForEntry,
                                  blocked: posted,
                                  selected:
                                      posted ||
                                      (editing != null &&
                                          editing.name.toLowerCase() ==
                                              entry.name.toLowerCase()),
                                  onTap: () => Navigator.pop(ctx, entry),
                                );
                              },
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );

    if (selected == null || !mounted) return;
    _openAdForm(
      ad: editing ?? _ownAdForCatalogEntry(selected),
      entry: selected,
    );
  }

  Widget _methodTile(
    _CatalogEntry entry, {
    required bool approved,
    bool blocked = false,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final enabled = (approved || selected) && !blocked;
    final entryKeys = <String>{
      _methodKey(entry.id),
      _methodKey(entry.name),
      entry.name.toLowerCase(),
    }..removeWhere((key) => key.isEmpty);
    final method = _methods.firstWhere((m) {
      final methodKeys = <String>{
        _methodKey(_pick(m, ['name', 'title'])),
        _methodKey(_pick(m, ['catalog_id', 'catalogId'])),
        _methodKey(_pick(m, ['svg_file', 'svgFile'])),
        _methodKey(_pick(m, ['icon', 'logo', 'image'])),
        _pick(m, ['name', 'title']).toLowerCase(),
      }..removeWhere((key) => key.isEmpty);
      return methodKeys.any(entryKeys.contains);
    }, orElse: () => const <String, dynamic>{});
    final logo = _pick(method, ['icon', 'logo', 'image']);
    final svgFile = _pick(method, [
      'svg_file',
      'svgFile',
    ], _catalogSvgFile(entry.id));
    final clearbitDomain = _pick(method, [
      'clearbit_domain',
      'clearbitDomain',
    ], _catalogClearbitDomain(entry.id));
    final resolvedLogo = _paymentLogoUrl(
      name: entry.name,
      catalogId: entry.id,
      logo: logo,
      svgFile: svgFile,
      clearbitDomain: clearbitDomain,
    );
    final tile = Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
      decoration: BoxDecoration(
        color: selected ? _greenBg : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: selected
              ? AppColors.successGreen
              : enabled
              ? _greenBorder
              : AppColors.borderWhite06,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          _methodBadge(entry.name, resolvedLogo, size: 32),
          const SizedBox(height: 5),
          Text(
            entry.name,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 9.5,
              height: 1.15,
              fontWeight: FontWeight.w500,
              color: selected
                  ? AppColors.successGreen
                  : enabled
                  ? AppColors.textGray300
                  : AppColors.textGray700,
            ),
          ),
        ],
      ),
    );
    return GestureDetector(
      onTap: enabled ? onTap : null,
      behavior: HitTestBehavior.opaque,
      child: Opacity(
        opacity: selected || enabled ? 1 : 0.28,
        child: Stack(
          children: [
            Positioned.fill(child: tile),
            if (blocked)
              const Positioned(top: 3, right: 3, child: _LockBadge())
            else if (selected)
              const Positioned(top: 3, right: 3, child: _CheckBadge()),
          ],
        ),
      ),
    );
  }

  /// Create / edit an ad. `entry` is the method picked from the catalogue;
  /// when editing without re-picking, the ad's own method is kept.
  void _openAdForm({_Ad? ad, _CatalogEntry? entry}) {
    final methodName = entry?.name ?? ad?.name ?? '';
    final catalogId = entry?.id ?? ad?.catalogId ?? '';
    final category = entry?.category ?? ad?.category ?? 'WALLET';
    // Buy ads collect admin-defined payment details here. Sell ads collect
    // buyer payment details later, when the trade is opened.
    final methodFields = _buyMode
        ? _methodFieldsForName(methodName)
        : const <Map<String, dynamic>>[];

    String savedValue(String key) {
      for (final field in ad?.adminFields ?? const <Map<String, dynamic>>[]) {
        if ('${field['key']}'.toLowerCase() == key.toLowerCase()) {
          return '${field['value'] ?? ''}';
        }
      }
      return '';
    }

    final rate = TextEditingController(
      text: ad == null || ad.rate == 0 ? '' : _amount(ad.rate),
    );
    final min = TextEditingController(
      text: ad == null || ad.min == 0 ? '' : _amount(ad.min),
    );
    final max = TextEditingController(
      text: ad == null || ad.max == 0 ? '' : _amount(ad.max),
    );
    final country = TextEditingController(text: ad?.country ?? '');
    final release = TextEditingController(text: ad?.releaseValue ?? '');
    final description = TextEditingController(text: ad?.description ?? '');
    final fieldControllers = <String, TextEditingController>{
      for (final field in methodFields)
        _methodFieldKey(field): TextEditingController(
          text: savedValue(_methodFieldKey(field)).isNotEmpty
              ? savedValue(_methodFieldKey(field))
              : '${field['defaultValue'] ?? ''}',
        ),
    };
    var currency = ad?.currency ?? (category == 'CRYPTO' ? 'USDT' : 'LKR');
    var releaseUnit = ad?.releaseUnit.isNotEmpty == true
        ? ad!.releaseUnit
        : 'h';
    String? error;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _sheetBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final bottomInset = MediaQuery.of(ctx).viewInsets.bottom;
          final sheetMaxHeight = MediaQuery.sizeOf(ctx).height * 0.92;
          final minDraftValue = _parseAmountText(min.text);
          final maxDraftValue = _parseAmountText(max.text);
          final minExceedsWallet =
              min.text.trim().isNotEmpty && minDraftValue > Api.balance;
          final maxExceedsWallet =
              max.text.trim().isNotEmpty && maxDraftValue > Api.balance;
          return AnimatedPadding(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            padding: EdgeInsets.only(bottom: bottomInset),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: sheetMaxHeight),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                    child: Row(
                      children: [
                        _methodBadge(
                          methodName,
                          ad?.resolvedLogo ?? '',
                          size: 34,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                methodName.isEmpty ? 'Post Ad' : methodName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                              Text(
                                ad == null ? 'Create details' : 'Edit details',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 10.5,
                                  color: AppColors.textGray600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: () => Navigator.maybePop(ctx),
                          behavior: HitTestBehavior.opaque,
                          child: Container(
                            width: 30,
                            height: 30,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: const Color(0x0FFFFFFF),
                              borderRadius: BorderRadius.circular(9),
                            ),
                            child: const Icon(
                              Ionicons.close_outline,
                              size: 18,
                              color: AppColors.textGray400,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Divider(color: _webBorder, height: 20),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (category.toUpperCase().contains('BANK')) ...[
                            _label('COUNTRY *'),
                            _countryPickerField(
                              country,
                              'Country',
                              onPicked: (_) => setSheet(() {}),
                            ),
                          ],
                          if (methodFields.isNotEmpty) ...[
                            for (final field in methodFields) ...[
                              _label(
                                '${field['label'] ?? _methodFieldKey(field)} *'
                                    .toUpperCase(),
                              ),
                              _field(
                                fieldControllers[_methodFieldKey(field)]!,
                                '${field['placeholder'] ?? field['label'] ?? _methodFieldKey(field)}',
                              ),
                            ],
                            const Divider(color: _webBorder, height: 24),
                          ],
                          _label('YOUR SETTINGS'),
                          const SizedBox(height: 6),
                          _label('RATE *'),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: 92,
                                child: _selectBox(
                                  currency,
                                  const ['LKR', 'USD', 'USDT'],
                                  (value) => setSheet(() => currency = value),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _field(
                                  rate,
                                  '330',
                                  number: true,
                                  suffix: 'R',
                                ),
                              ),
                            ],
                          ),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Text(
                              '1 ${currency == 'LKR' ? 'LKR' : currency} = ${rate.text.trim().isEmpty ? '1' : rate.text.trim()} R',
                              style: const TextStyle(
                                fontSize: 9,
                                color: AppColors.textGray600,
                              ),
                            ),
                          ),
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _label('MINIMUM AMOUNT (R) *'),
                                    _field(
                                      min,
                                      'e.g. 10',
                                      number: true,
                                      suffix: 'R',
                                      textColor: AppColors.textGray200,
                                      errorText: minExceedsWallet
                                          ? 'Exceeds wallet balance'
                                          : null,
                                      onChanged: (_) => setSheet(() {}),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _label('MAXIMUM AMOUNT (R) *'),
                                    _field(
                                      max,
                                      _amount(Api.balance),
                                      number: true,
                                      suffix: 'R',
                                      hintColor: AppColors.textGray300,
                                      textColor: AppColors.textGray200,
                                      errorText: maxExceedsWallet
                                          ? 'Exceeds wallet balance'
                                          : null,
                                      onChanged: (_) => setSheet(() {}),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Text(
                              'Wallet balance: R ${_amount(Api.balance)}',
                              style: const TextStyle(
                                fontSize: 9,
                                color: AppColors.textGray600,
                              ),
                            ),
                          ),
                          _label('COIN RELEASE TIME'),
                          Container(
                            margin: const EdgeInsets.only(bottom: 4),
                            decoration: BoxDecoration(
                              color: _cardBg,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: _webBorder),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: release,
                                    keyboardType: TextInputType.number,
                                    style: const TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                    cursorColor: Colors.white,
                                    decoration: const InputDecoration(
                                      hintText: '1',
                                      hintStyle: TextStyle(
                                        fontSize: 12,
                                        color: AppColors.textGray600,
                                      ),
                                      isDense: true,
                                      border: InputBorder.none,
                                      contentPadding: EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 12,
                                      ),
                                    ),
                                  ),
                                ),
                                GestureDetector(
                                  onTap: () => setSheet(() {
                                    releaseUnit = releaseUnit == 'h'
                                        ? 'min'
                                        : releaseUnit == 'min'
                                        ? 's'
                                        : 'h';
                                  }),
                                  behavior: HitTestBehavior.opaque,
                                  child: Container(
                                    width: 46,
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 13,
                                    ),
                                    alignment: Alignment.center,
                                    decoration: const BoxDecoration(
                                      border: Border(
                                        left: BorderSide(color: _webBorder),
                                      ),
                                    ),
                                    child: Text(
                                      releaseUnit,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w800,
                                        color: AppColors.successGreen,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Padding(
                            padding: EdgeInsets.only(bottom: 10),
                            child: Text(
                              'Tap the unit to switch between h · min · s',
                              style: TextStyle(
                                fontSize: 9,
                                color: AppColors.textGray600,
                              ),
                            ),
                          ),
                          _label('DESCRIPTION'),
                          _formTextArea(
                            description,
                            'Add any instructions or details for the buyer...',
                          ),
                          if (error != null) ...[
                            Text(
                              error!,
                              style: const TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w500,
                                color: _sellRed,
                              ),
                            ),
                            const SizedBox(height: 8),
                          ],
                          const SizedBox(height: 4),
                        ],
                      ),
                    ),
                  ),
                  const Divider(color: _webBorder, height: 1),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                    child: Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () => Navigator.maybePop(ctx),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF232327),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: const Text(
                              'CANCEL',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () async {
                              final rateValue = _parseAmountText(rate.text);
                              final minValue = _parseAmountText(min.text);
                              final maxValue = _parseAmountText(max.text);
                              if (methodName.isEmpty) {
                                setSheet(
                                  () => error = 'Pick a payment method first.',
                                );
                                return;
                              }
                              if (rateValue <= 0) {
                                setSheet(() => error = 'Enter a valid rate.');
                                return;
                              }
                              if (minValue <= 0 || maxValue < minValue) {
                                setSheet(
                                  () => error =
                                      'Limits must be positive, min ≤ max.',
                                );
                                return;
                              }
                              if (minValue > Api.balance ||
                                  maxValue > Api.balance) {
                                setSheet(() => error = null);
                                return;
                              }
                              for (final field in methodFields) {
                                final key = _methodFieldKey(field);
                                if ((fieldControllers[key]?.text.trim() ?? '')
                                    .isEmpty) {
                                  setSheet(
                                    () => error =
                                        '${field['label'] ?? key} is required.',
                                  );
                                  return;
                                }
                              }
                              final availableValue = ad == null
                                  ? maxValue
                                  : (ad.available > maxValue
                                        ? maxValue
                                        : ad.available);
                              final adminFields = <Map<String, dynamic>>[
                                for (final field in methodFields)
                                  {
                                    'key': _methodFieldKey(field),
                                    'label':
                                        '${field['label'] ?? _methodFieldKey(field)}',
                                    'value':
                                        fieldControllers[_methodFieldKey(
                                              field,
                                            )]!
                                            .text
                                            .trim(),
                                    'locked': field['locked'] == true,
                                  },
                                if (country.text.trim().isNotEmpty)
                                  {
                                    'key': 'country',
                                    'label': 'Country',
                                    'value': country.text.trim(),
                                    'locked': false,
                                  },
                              ];
                              final body = <String, dynamic>{
                                'catalog_id': catalogId,
                                'name': methodName,
                                'category': category,
                                'lkr_rate': rateValue,
                                'crypto_currency': currency,
                                'min_amount': minValue,
                                'max_amount': maxValue,
                                'available_amount': availableValue,
                                'admin_fields': adminFields,
                                'release_value': release.text.trim().isEmpty
                                    ? null
                                    : release.text.trim(),
                                'release_unit': releaseUnit,
                                'description': description.text.trim().isEmpty
                                    ? null
                                    : description.text.trim(),
                              };
                              Navigator.maybePop(ctx);
                              await _submitAd(ad, body);
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: Text(
                              ad == null ? 'POST AD' : 'UPDATE',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1,
                                color: Colors.black,
                              ),
                            ),
                          ),
                        ),
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

  void _openTradeSheet(_Ad ad) {
    final amount = TextEditingController();
    final sellFields = _buyMode
        ? const <Map<String, dynamic>>[]
        : _methodFieldsFor(ad);
    final sellFieldControllers = <String, TextEditingController>{
      for (final field in sellFields)
        _methodFieldKey(field): TextEditingController(),
    };
    String? error;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _sheetBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final value = _parseAmountText(amount.text);
          final receive = _tradeReceive(ad, value);
          final liveError = amount.text.trim().isEmpty
              ? null
              : _tradeError(ad, value);
          final receiveHasError = liveError != null;
          final canSubmitSellPopup = _buyMode
              ? true
              : amount.text.trim().isNotEmpty &&
                    liveError == null &&
                    sellFields.every((field) {
                      final key = _methodFieldKey(field);
                      final required =
                          field['required'] == true ||
                          '${field['required']}'.toLowerCase() == 'true';
                      return !required ||
                          (sellFieldControllers[key]?.text.trim().isNotEmpty ??
                              false);
                    });
          return Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 16,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _methodBadge(ad.name, ad.resolvedLogo, size: 36),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _cleanUiText(ad.name),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              'R ${_amount(ad.rate)} / ${ad.currency} - ${ad.timeWindow.isEmpty ? '1h' : ad.timeWindow}',
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
                      GestureDetector(
                        onTap: () => Navigator.maybePop(ctx),
                        behavior: HitTestBehavior.opaque,
                        child: Container(
                          width: 34,
                          height: 34,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: const Color(0x0FFFFFFF),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Ionicons.close_outline,
                            size: 18,
                            color: AppColors.textGray300,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _tradeLimitPanel(ad),
                  const SizedBox(height: 14),
                  _label(
                    _buyMode
                        ? 'ENTER AMOUNT (${ad.currency}) *'
                        : 'YOU PAY (RUPIEER) *',
                  ),
                  _field(
                    amount,
                    _buyMode
                        ? 'Min ${ad.currency} ${ad.rate <= 0 ? _amount(ad.min) : _amount(ad.min / ad.rate)}'
                        : 'Rupieer ${_amount(ad.min)} - Rupieer ${_amount(ad.max)}',
                    number: true,
                    suffix: _buyMode ? ad.currency : 'Rupieer',
                    onChanged: (_) => setSheet(() => error = null),
                  ),
                  if (!_buyMode) ...[
                    const SizedBox(height: 4),
                    const Text(
                      'Cannot exceed your wallet balance.',
                      style: TextStyle(
                        fontSize: 9,
                        color: AppColors.textGray600,
                      ),
                    ),
                  ],
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 16,
                    ),
                    decoration: BoxDecoration(
                      color: receiveHasError ? _redBg : _greenBg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: receiveHasError ? _redBorder : _greenBorder,
                      ),
                    ),
                    child: Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'You will receive',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textGray500,
                            ),
                          ),
                        ),
                        Text(
                          _buyMode
                              ? '${formatMoney(receive)} R'
                              : '${formatMoney(receive)} ${ad.currency}',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: receiveHasError
                                ? _sellRed
                                : AppColors.successGreen,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (liveError != null) ...[
                    const SizedBox(height: 14),
                    _tradeErrorBanner(liveError),
                  ],
                  if (!_buyMode && sellFields.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    _tradePaymentFields(
                      sellFields,
                      sellFieldControllers,
                      onChanged: (_) => setSheet(() => error = null),
                    ),
                  ],
                  const SizedBox(height: 14),
                  _tradeGuidePanel(
                    ad.description,
                    _buyMode
                        ? const [
                            'Enter the amount you want to buy.',
                            'Click Make Payment.',
                            'Enter the Transaction ID or upload the payment slip.',
                            'Click Submit to confirm your payment.',
                          ]
                        : const [
                            'Enter the Rupieer amount you want to sell.',
                            'Add your payment method.',
                            'Click Sell Now to place the order.',
                            'Wait for the buyer to submit transaction details.',
                            'Verify the payment and confirm the order.',
                          ],
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      error!,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        color: _sellRed,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => Navigator.maybePop(ctx),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF232327),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'CANCEL',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.2,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _buyMode || canSubmitSellPopup
                              ? () async {
                                  final entered = _parseAmountText(amount.text);
                                  final problem = _tradeError(ad, entered);
                                  if (problem != null) {
                                    setSheet(() => error = problem);
                                    return;
                                  }
                                  if (!_buyMode) {
                                    for (final field in sellFields) {
                                      final key = _methodFieldKey(field);
                                      final required =
                                          field['required'] == true ||
                                          '${field['required']}'
                                                  .toLowerCase() ==
                                              'true';
                                      if (required &&
                                          (sellFieldControllers[key]?.text
                                                  .trim()
                                                  .isEmpty ??
                                              true)) {
                                        setSheet(() {
                                          error =
                                              '${field['label'] ?? key} is required.';
                                        });
                                        return;
                                      }
                                    }
                                  }
                                  final buyerFields = !_buyMode
                                      ? sellFields
                                            .map(
                                              (field) => {
                                                'key': _methodFieldKey(field),
                                                'label':
                                                    '${field['label'] ?? _methodFieldKey(field)}',
                                                'value':
                                                    sellFieldControllers[_methodFieldKey(
                                                          field,
                                                        )]
                                                        ?.text
                                                        .trim(),
                                                'locked':
                                                    field['locked'] == true,
                                              },
                                            )
                                            .toList(growable: false)
                                      : null;
                                  Navigator.maybePop(ctx);
                                  await _startTrade(
                                    ad,
                                    entered,
                                    buyerFields: buyerFields,
                                  );
                                }
                              : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _buyMode ? _buyGreen : _sellRed,
                            foregroundColor: _buyMode
                                ? Colors.black
                                : Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: Text(
                            _buyMode ? 'MAKE PAYMENT' : 'SELL NOW',
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _tradeLimitPanel(_Ad ad) {
    if (!_buyMode) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'WALLET BALANCE',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                      color: AppColors.textGray600,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    'Rupieer ${formatMoney(Api.balance)}',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.successGreen,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text(
                    'LIMIT',
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                      color: AppColors.textGray600,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    'Rupieer ${_amount(ad.min)} - Rupieer ${_amount(ad.max)}',
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'AVAILABLE',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                      color: AppColors.textGray600,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    'Rupieer ${_amount(_displayAvailable(ad))}',
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: AppColors.successGreen,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Row(
        children: [
          Expanded(
            child: _tradeStat(
              'LIMIT',
              'R ${_amount(ad.min)} - R ${_amount(ad.max)}',
              Colors.white,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _tradeStat(
              'AVAILABLE',
              'R ${_amount(_displayAvailable(ad))}',
              AppColors.successGreen,
              alignRight: true,
            ),
          ),
        ],
      ),
    );
  }

  Widget _tradeStat(
    String label,
    String value,
    Color color, {
    bool alignRight = false,
  }) {
    return Column(
      crossAxisAlignment: alignRight
          ? CrossAxisAlignment.end
          : CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2,
            color: AppColors.textGray600,
          ),
        ),
        const SizedBox(height: 7),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _tradeGuidePanel(String description, List<String> guide) {
    final cleanDescription = description.trim();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (cleanDescription.isNotEmpty) ...[
            const Text(
              'DESCRIPTION',
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
                color: AppColors.textGray600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              cleanDescription,
              style: const TextStyle(fontSize: 11, color: Colors.white),
            ),
            const Divider(height: 22, color: AppColors.borderWhite10),
          ],
          const Text(
            'GUIDE NOTE',
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              color: AppColors.textGray600,
            ),
          ),
          const SizedBox(height: 8),
          for (var i = 0; i < guide.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '${i + 1}. ${guide[i]}',
                style: const TextStyle(
                  fontSize: 11,
                  height: 1.25,
                  color: AppColors.textGray400,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _tradeErrorBanner(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _redBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _redBorder),
      ),
      child: Row(
        children: [
          const Icon(Ionicons.alert_circle_outline, size: 16, color: _sellRed),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Color(0xFFFF8A8A),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tradePaymentFields(
    List<Map<String, dynamic>> fields,
    Map<String, TextEditingController> controllers, {
    ValueChanged<String>? onChanged,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PAYMENT METHOD FIELDS',
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              color: AppColors.textGray600,
            ),
          ),
          const SizedBox(height: 12),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 124),
            child: SingleChildScrollView(
              child: Column(
                children: [
                  for (final field in fields) ...[
                    _label(
                      '${field['label'] ?? _methodFieldKey(field)}${field['required'] == true || '${field['required']}'.toLowerCase() == 'true' ? ' *' : ''}',
                    ),
                    _field(
                      controllers[_methodFieldKey(field)]!,
                      '${field['placeholder'] ?? field['defaultValue'] ?? field['label'] ?? _methodFieldKey(field)}',
                      onChanged: onChanged,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Start a trade against someone else's ad.
  // Kept as a fallback while the web-style trade sheet is wired to cards.
  // ignore: unused_element
  void _openTrade(_Ad ad) {
    final amount = TextEditingController();
    String? error;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (ctx, setSheet) {
          final value = _parseAmountText(amount.text);
          final receive = _tradeReceive(ad, value);
          return Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 16,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _buyMode ? 'Buy coins' : 'Sell coins',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${ad.name} · R ${_amount(ad.rate)} /${ad.currency}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textGray500,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const RupeeCoin(size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Wallet balance ${formatMoney(Api.balance)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textGray300,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _field(
                    amount,
                    'Amount (R ${_amount(ad.min)} – R ${_amount(ad.max)})',
                    number: true,
                    onChanged: (_) => setSheet(() => error = null),
                  ),
                  Text(
                    _buyMode
                        ? 'You receive ~ R ${formatMoney(receive)}'
                        : 'You receive ~ ${formatMoney(receive)} ${ad.currency}',
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: AppColors.textGray500,
                    ),
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      error!,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w500,
                        color: _sellRed,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () async {
                        final entered = _parseAmountText(amount.text);
                        final problem = _tradeError(ad, entered);
                        if (problem != null) {
                          setSheet(() => error = problem);
                          return;
                        }
                        Navigator.maybePop(ctx);
                        await _startTrade(ad, entered);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _buyMode ? _buyGreen : _sellRed,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                      child: Text(
                        _buyMode ? 'Buy now' : 'Sell now',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
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
    );
  }

  String? _tradeError(_Ad ad, double value) {
    if (value <= 0) return 'Enter a valid amount.';
    final liveAvailable = _displayAvailable(ad);
    if (_buyMode) {
      final receiveRupee = _tradeReceive(ad, value);
      final effectiveMax = ad.max > 0
          ? (liveAvailable < ad.max ? liveAvailable : ad.max)
          : liveAvailable;
      if (ad.min > 0 && receiveRupee < ad.min) {
        return 'Minimum receive amount is R ${_amount(ad.min)}.';
      }
      if (receiveRupee > effectiveMax) {
        return 'Available balance is R ${_amount(effectiveMax)}.';
      }
      return null;
    } else {
      if (ad.min > 0 && value < ad.min) {
        return 'Minimum amount is R ${_amount(ad.min)}.';
      }
      if (ad.max > 0 && value > ad.max) {
        return 'Maximum amount is R ${_amount(ad.max)}.';
      }
      if (value > liveAvailable) {
        return 'Available balance is R ${_amount(liveAvailable)}.';
      }
      if (value > Api.balance) {
        return 'Amount exceeds your wallet balance (R ${_amount(Api.balance)}).';
      }
    }
    return null;
  }

  void _reportTx(Map<String, dynamic> tx) {
    final isBuyer = _isBuyerTx(tx);
    final role = isBuyer ? 'BUYER' : 'SELLER';
    final reasons = _reportReasons(isBuyer: isBuyer);
    var reason = reasons.first;
    final details = TextEditingController();
    var reportError = '';
    final adName = _pick(tx, [
      'payment_method_name',
      'method_name',
      'ad_name',
      'name',
    ], 'Transaction');
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              left: 14,
              right: 14,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 12,
            ),
            child: Align(
              alignment: Alignment.bottomCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Container(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.of(ctx).size.height * 0.86,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.bg1,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.borderWhite10),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
                        child: Row(
                          children: [
                            Container(
                              width: 34,
                              height: 34,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: _redBg,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: _redBorder),
                              ),
                              child: const Icon(
                                Ionicons.flag_outline,
                                size: 17,
                                color: _sellRed,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Report Transaction',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Row(
                                    children: [
                                      Flexible(
                                        child: Text(
                                          '$adName · Order #${_orderId(tx)}',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: AppColors.textGray600,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 7,
                                          vertical: 2,
                                        ),
                                        decoration: BoxDecoration(
                                          color: const Color(0x332F195D),
                                          borderRadius: BorderRadius.circular(
                                            5,
                                          ),
                                        ),
                                        child: Text(
                                          role,
                                          style: const TextStyle(
                                            fontSize: 8,
                                            letterSpacing: 1,
                                            fontWeight: FontWeight.w900,
                                            color: Color(0xFFC4A3FF),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: () => Navigator.maybePop(ctx),
                              icon: const Icon(
                                Ionicons.close_outline,
                                color: AppColors.textGray300,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Divider(height: 1, color: AppColors.borderWhite10),
                      Flexible(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'SELECT A REASON',
                                style: TextStyle(
                                  fontSize: 10.5,
                                  letterSpacing: 1.5,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.textGray600,
                                ),
                              ),
                              const SizedBox(height: 12),
                              for (final option in reasons)
                                GestureDetector(
                                  onTap: () => setSheet(() {
                                    reason = option;
                                    reportError = '';
                                  }),
                                  behavior: HitTestBehavior.opaque,
                                  child: Padding(
                                    padding: const EdgeInsets.only(bottom: 10),
                                    child: Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 14,
                                      ),
                                      decoration: BoxDecoration(
                                        color: reason == option
                                            ? _redBg
                                            : _chipBg,
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: reason == option
                                              ? _redBorder
                                              : AppColors.borderWhite10,
                                        ),
                                      ),
                                      child: Row(
                                        children: [
                                          Icon(
                                            reason == option
                                                ? Ionicons
                                                      .radio_button_on_outline
                                                : Ionicons
                                                      .radio_button_off_outline,
                                            size: 18,
                                            color: reason == option
                                                ? _sellRed
                                                : AppColors.textGray600,
                                          ),
                                          const SizedBox(width: 12),
                                          Expanded(
                                            child: Text(
                                              option,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w800,
                                                color: reason == option
                                                    ? _sellRed
                                                    : AppColors.textGray400,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              if (reason == 'Other') ...[
                                const SizedBox(height: 2),
                                TextField(
                                  controller: details,
                                  minLines: 3,
                                  maxLines: 4,
                                  onChanged: (_) =>
                                      setSheet(() => reportError = ''),
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: Colors.white,
                                  ),
                                  decoration: InputDecoration(
                                    hintText: 'Describe the issue...',
                                    hintStyle: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: AppColors.textGray600,
                                    ),
                                    filled: true,
                                    fillColor: const Color(0xFF09090B),
                                    contentPadding: const EdgeInsets.symmetric(
                                      horizontal: 14,
                                      vertical: 13,
                                    ),
                                    enabledBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      borderSide: const BorderSide(
                                        color: AppColors.borderWhite10,
                                      ),
                                    ),
                                    focusedBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      borderSide: const BorderSide(
                                        color: _redBorder,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                              if (reportError.isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 10,
                                  ),
                                  decoration: BoxDecoration(
                                    color: _redBg,
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(color: _redBorder),
                                  ),
                                  child: Row(
                                    children: [
                                      const Icon(
                                        Ionicons.alert_circle_outline,
                                        size: 15,
                                        color: _sellRed,
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: Text(
                                          reportError,
                                          style: const TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800,
                                            color: _sellRed,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                      const Divider(height: 1, color: AppColors.borderWhite10),
                      Padding(
                        padding: const EdgeInsets.all(18),
                        child: Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => Navigator.maybePop(ctx),
                                style: OutlinedButton.styleFrom(
                                  side: BorderSide.none,
                                  backgroundColor: _chipBg,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 13,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: const Text(
                                  'CANCEL',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.7,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: () async {
                                  final customDetails = details.text.trim();
                                  if (reason == 'Other' &&
                                      customDetails.isEmpty) {
                                    setSheet(
                                      () => reportError =
                                          'Describe the issue before submitting.',
                                    );
                                    return;
                                  }
                                  Navigator.maybePop(ctx);
                                  final failure = _buyMode
                                      ? await Api.reportBuyTransaction(
                                          tx['id'],
                                          reason,
                                          customDetails,
                                        )
                                      : await Api.reportSellTransaction(
                                          tx['id'],
                                          reason,
                                          customDetails,
                                        );
                                  if (failure == null) {
                                    AppNotifications.success(
                                      'Report submitted',
                                    );
                                    await _load();
                                  } else {
                                    AppNotifications.error(
                                      'Report failed',
                                      failure,
                                    );
                                  }
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: _sellRed,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 13,
                                  ),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                                child: const Text(
                                  'SUBMIT REPORT',
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.7,
                                  ),
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
            ),
          ),
        ),
      ),
    ).whenComplete(details.dispose);
  }

  List<String> _reportReasons({required bool isBuyer}) {
    if (_buyMode) {
      return isBuyer
          ? const [
              'Payment still pending',
              'Payment Not Received',
              'Seller Not Responding',
              'Other',
            ]
          : const [
              'User Not Responding',
              'Payment still pending',
              'Payment Not Received',
              'Fake Receipt Uploaded',
              'Buyer Marked as Paid Without Paying',
              'Other',
            ];
    }
    return isBuyer
        ? const [
            'Payment still pending',
            'Fake Payment Receipt',
            'Payment Not Received',
            'Seller Not Responding',
            'Other',
          ]
        : const [
            'User Not Responding',
            'Payment still pending',
            'Payment Not Received',
            'Other',
          ];
  }

  /* ── shared inputs ── */

  Widget _label(String text) {
    const style = TextStyle(
      fontSize: 9.5,
      letterSpacing: 1.3,
      fontWeight: FontWeight.w700,
      color: AppColors.textGray500,
    );
    if (!text.contains('*')) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: style),
      );
    }
    final parts = text.split('*');
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: RichText(
        text: TextSpan(
          children: [
            TextSpan(text: parts.first, style: style),
            const TextSpan(
              text: '*',
              style: TextStyle(
                fontSize: 9.5,
                letterSpacing: 1.3,
                fontWeight: FontWeight.w800,
                color: _sellRed,
              ),
            ),
            if (parts.length > 1)
              TextSpan(text: parts.skip(1).join('*'), style: style),
          ],
        ),
      ),
    );
  }

  Widget _selectBox(
    String value,
    List<String> options,
    ValueChanged<String> onChanged,
  ) {
    return Container(
      height: 46,
      padding: const EdgeInsets.symmetric(horizontal: 13),
      decoration: BoxDecoration(
        color: _fieldBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: options.contains(value) ? value : options.first,
          dropdownColor: AppColors.bg1,
          icon: const Icon(
            Ionicons.chevron_down_outline,
            size: 14,
            color: Colors.white,
          ),
          isExpanded: true,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
          items: [
            for (final option in options)
              DropdownMenuItem<String>(value: option, child: Text(option)),
          ],
          onChanged: (next) {
            if (next != null) onChanged(next);
          },
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String hint, {
    bool number = false,
    String? suffix,
    String? errorText,
    Color? hintColor,
    Color? textColor,
    ValueChanged<String>? onChanged,
  }) {
    final borderColor = errorText == null ? _webBorder : _sellRed;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: controller,
            keyboardType: number ? TextInputType.number : TextInputType.text,
            onChanged: onChanged,
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: textColor ?? Colors.white,
            ),
            cursorColor: Colors.white,
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: hintColor ?? AppColors.textGray600,
              ),
              suffixText: suffix,
              suffixStyle: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: AppColors.textGray500,
              ),
              isDense: true,
              filled: true,
              fillColor: _fieldBg,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 13,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: borderColor),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: borderColor),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: borderColor),
              ),
            ),
          ),
          if (errorText != null) ...[
            const SizedBox(height: 5),
            Text(
              errorText,
              style: const TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w600,
                color: _sellRed,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _formTextArea(TextEditingController controller, String hint) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: controller,
        minLines: 3,
        maxLines: 3,
        keyboardType: TextInputType.multiline,
        style: const TextStyle(
          fontSize: 12.5,
          fontWeight: FontWeight.w500,
          color: Colors.white,
        ),
        cursorColor: Colors.white,
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.textGray600,
          ),
          filled: true,
          fillColor: _fieldBg,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 13,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: _webBorder),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: _webBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: _webBorder),
          ),
        ),
      ),
    );
  }

  /* ── actions ── */

  Future<void> _submitAd(_Ad? ad, Map<String, dynamic> body) async {
    final String? failure;
    if (ad == null) {
      failure = _buyMode
          ? await Api.createBuyAd(body)
          : await Api.createSellAd(body);
    } else {
      failure = _buyMode
          ? await Api.updateBuyAd(ad.id, body)
          : await Api.updateSellAd(ad.id, body);
    }
    if (!mounted) return;
    if (failure == null) {
      AppNotifications.success(ad == null ? 'Ad published' : 'Ad updated');
      await _load();
    } else {
      AppNotifications.error('Could not save the ad', failure);
    }
  }

  Future<bool> _confirmDangerAction({
    required String title,
    required String message,
    required String confirmLabel,
    bool danger = true,
  }) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.bg1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        content: Text(
          message,
          style: const TextStyle(fontSize: 12.5, color: AppColors.textGray300),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(
              'Cancel',
              style: TextStyle(color: AppColors.textGray400),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
              confirmLabel,
              style: TextStyle(
                color: danger ? _sellRed : AppColors.successGreen,
              ),
            ),
          ),
        ],
      ),
    );
    return confirmed == true;
  }

  Future<void> _deleteAd(_Ad ad) async {
    final confirmed = await _confirmDangerAction(
      title: 'Delete Ad?',
      message: 'This ad will be permanently removed.',
      confirmLabel: 'Delete',
    );
    if (confirmed != true) return;
    final ok = _buyMode
        ? await Api.deleteBuyAd(ad.id)
        : await Api.deleteSellAd(ad.id);
    if (!mounted) return;
    if (ok) {
      AppNotifications.info('Ad deleted');
      await _load();
    } else {
      AppNotifications.error('Could not delete the ad');
    }
  }

  Future<void> _startTrade(
    _Ad ad,
    double value, {
    List<Map<String, dynamic>>? buyerFields,
  }) async {
    final payload = P2pTradeStartPayload.fromEntry(
      mode: _buyMode ? P2pMarketMode.buyCoins : P2pMarketMode.sellCoins,
      enteredAmount: value,
      rate: ad.rate,
      adCurrency: ad.currency,
    );
    final body = payload.toJson(buyerFields: buyerFields);
    final reservation = payload.reservedRupieer;
    setState(() {
      _localReservationsByAdId[ad.id] =
          (_localReservationsByAdId[ad.id] ?? 0) + reservation;
    });
    final failure = _buyMode
        ? await Api.startBuyAdTrade(ad.id, body)
        : await Api.startSellAdTrade(ad.id, body);
    if (!mounted) return;
    if (failure == null) {
      AppNotifications.success(
        'Trade started',
        'The ad is locked until this order is completed or cancelled.',
      );
      setState(() => _status = 'pending');
      await _load();
    } else {
      setState(() {
        final next = (_localReservationsByAdId[ad.id] ?? 0) - reservation;
        if (next <= 0) {
          _localReservationsByAdId.remove(ad.id);
        } else {
          _localReservationsByAdId[ad.id] = next;
        }
      });
      AppNotifications.error('Could not start the trade', failure);
    }
  }

  Future<bool> _txAction(Map<String, dynamic> tx, String action) async {
    final isCancel = action == 'cancel';
    final confirmed = await _confirmDangerAction(
      title: isCancel ? 'Cancel Transaction?' : 'Confirm Transaction?',
      message: isCancel
          ? 'Are you sure you want to cancel this transaction? This cannot be undone.'
          : 'Are you sure you want to confirm this transaction? Coins will be released after confirmation.',
      confirmLabel: isCancel ? 'Cancel Transaction' : 'Confirm',
      danger: isCancel,
    );
    if (!confirmed) return false;

    final failure = _buyMode
        ? action == 'cancel'
              ? await Api.cancelBuyTransaction(tx['id'])
              : await Api.confirmBuyTransaction(tx['id'])
        : await Api.sellTransactionAction(tx['id'], action);
    if (!mounted) return false;
    if (failure == null) {
      AppNotifications.success(
        isCancel ? 'Transaction cancelled' : 'Transaction confirmed',
      );
      await _load();
      return true;
    } else {
      AppNotifications.error('Action failed', failure);
      return false;
    }
  }

  Future<bool> _confirmTrade(Map<String, dynamic> tx) async {
    return _txAction(tx, 'confirm');
  }

  Future<bool> _confirmCancelBuy(Map<String, dynamic> tx) async {
    return _txAction(tx, 'cancel');
  }

  void _openTxDetails(_Ad ad, Map<String, dynamic> tx) {
    final txId = TextEditingController(text: _txReference(tx));
    ApiUploadFile? proofFile;
    String? error;
    bool submitting = false;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: _sheetBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => StatefulBuilder(
        builder: (ctx, setSheet) {
          Future<void> copySheetValue(String value) async {
            await Clipboard.setData(ClipboardData(text: value));
            if (!mounted) return;
            setState(() => _copiedOrderId = value);
            setSheet(() {});
            AppNotifications.info('Copied');
            Future.delayed(const Duration(seconds: 3), () {
              if (!mounted || _copiedOrderId != value) return;
              setState(() => _copiedOrderId = '');
              if (sheetContext.mounted) setSheet(() {});
            });
          }

          final status = _txStatus(tx);
          final isBuyer = _isBuyerTx(tx);
          final canSubmit = _canSubmitProof(ad, tx);
          final canConfirm = _canConfirmProof(ad, tx);
          final hasProof = _txHasProof(tx);
          final hasImageProof = _txHasImageProof(tx);
          final paymentRows = _buyMode
              ? _paymentDestinationRows(ad, tx)
              : _buyerDetailRows(tx);
          final showBuyerDetails =
              !_buyMode &&
              (status == 'pending' || status == 'completed') &&
              paymentRows.isNotEmpty;
          final displayValues = P2pTransactionDisplayValues.fromApi(
            mode: _buyMode ? P2pMarketMode.buyCoins : P2pMarketMode.sellCoins,
            apiAmount: _pickNum(tx, ['amount', 'coins']),
            apiReceiveAmount: _pickNum(tx, [
              'receive_amount',
              'received_amount',
            ]),
            adCurrency: _txSubmittedCurrency(ad, tx, isBuyer),
            apiReceiveCurrency: _pick(tx, ['receive_currency']),
          );
          final summary = P2pTransactionSummary.forTransaction(
            mode: _buyMode ? P2pMarketMode.buyCoins : P2pMarketMode.sellCoins,
            isBuyer: isBuyer,
            status: status,
            amount: displayValues.amount,
            receiveAmount: displayValues.receiveAmount,
            adCurrency: displayValues.amountCurrency,
            receiveCurrency: displayValues.receiveCurrency.isEmpty
                ? _txReceiveCurrency(ad, tx, isBuyer)
                : displayValues.receiveCurrency,
          );
          final amountLabel = summary.leftLabel;
          final receiveLabel = summary.rightLabel;
          final amountValue = _txAmountDisplay(
            summary.leftAmount,
            summary.leftCurrency,
          );
          final receiveValue = _txAmountDisplay(
            summary.rightAmount,
            summary.rightCurrency,
          );
          return Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 16,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      _methodBadge(ad.name, ad.resolvedLogo, size: 40),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              ad.name,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: status == 'completed'
                                    ? _greenBg
                                    : status == 'cancelled'
                                    ? _redBg
                                    : _amberBg,
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: Text(
                                status.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.5,
                                  color: status == 'completed'
                                      ? AppColors.successGreen
                                      : status == 'cancelled'
                                      ? _sellRed
                                      : _amber,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.maybePop(ctx),
                        icon: const Icon(
                          Ionicons.close_outline,
                          color: AppColors.textGray400,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _summaryBox(
                          amountLabel,
                          amountValue,
                          Colors.white,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _summaryBox(
                          receiveLabel,
                          receiveValue,
                          AppColors.successGreen,
                        ),
                      ),
                    ],
                  ),
                  if (_buyMode && status == 'completed') ...[
                    const SizedBox(height: 12),
                    _detailCard([
                      _detailLine(
                        'Order ID',
                        _orderId(tx),
                        copyable: true,
                        onCopy: copySheetValue,
                      ),
                      if (_pick(tx, ['completed_at']).isNotEmpty)
                        _detailLine(
                          'Confirmed',
                          _formatTxTimestamp(_pick(tx, ['completed_at'])),
                        ),
                    ]),
                  ],
                  if (_buyMode &&
                      (canSubmit ||
                          (isBuyer &&
                              (status == 'pending' ||
                                  status == 'completed'))) &&
                      paymentRows.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _paymentRowsCard(
                      paymentRows,
                      title: _buyMode ? 'SEND PAYMENT TO' : 'BUYER DETAILS',
                      onCopy: copySheetValue,
                    ),
                  ],
                  if (showBuyerDetails) ...[
                    const SizedBox(height: 12),
                    _paymentRowsCard(
                      paymentRows,
                      title: 'BUYER DETAILS',
                      onCopy: copySheetValue,
                    ),
                  ],
                  if (!canSubmit && _txReference(tx).isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _singleDetailCard(
                      'TRANSACTION ID',
                      _txReference(tx),
                      onCopy: copySheetValue,
                    ),
                  ],
                  if (!canSubmit && hasImageProof) ...[
                    const SizedBox(height: 12),
                    _proofPreview(tx),
                  ],
                  if (status == 'pending' && (!canSubmit || hasProof)) ...[
                    const SizedBox(height: 12),
                    _statusNotice(
                      hasProof
                          ? (_buyMode
                                ? (isBuyer
                                      ? 'Submitted · Waiting for seller confirmation'
                                      : 'Submitted · Ready for your confirmation')
                                : (!isBuyer
                                      ? 'Submitted · Waiting for buyer confirmation'
                                      : 'Submitted · Ready for your confirmation'))
                          : (_buyMode
                                ? 'Waiting for buyer to submit transaction details.'
                                : 'Waiting for seller to submit transaction details.'),
                    ),
                  ],
                  if (status != 'completed')
                    ..._reportBadges(tx).map(
                      (badge) => Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: _reportBadge(badge),
                      ),
                    ),
                  if (canSubmit) ...[
                    const SizedBox(height: 12),
                    _label('TRANSACTION ID *'),
                    _field(txId, 'e.g. TXN123456789'),
                    _label('PAYMENT SCREENSHOT'),
                    GestureDetector(
                      onTap: () async {
                        final picked = await _pickProofImage();
                        if (picked == null) return;
                        setSheet(() {
                          proofFile = picked;
                          error = null;
                        });
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 18,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.borderWhite10),
                        ),
                        child: Column(
                          children: [
                            Icon(
                              proofFile == null
                                  ? Ionicons.cloud_upload_outline
                                  : Ionicons.image_outline,
                              size: 24,
                              color: proofFile == null
                                  ? AppColors.textGray500
                                  : AppColors.successGreen,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              proofFile?.filename ?? 'Tap to upload screenshot',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: proofFile == null
                                    ? AppColors.textGray400
                                    : AppColors.successGreen,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (_canReportTx(tx)) ...[
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: submitting ? null : () => _reportTx(tx),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: _redBorder),
                            padding: const EdgeInsets.symmetric(vertical: 9),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'REPORT',
                            style: TextStyle(
                              fontSize: 11,
                              color: _sellRed,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                  if (status == 'completed') ...[
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: _greenBg,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: _greenBorder),
                      ),
                      child: Text(
                        _buyMode
                            ? 'Transaction confirmed - Coins released to buyer'
                            : 'Completed${_pick(tx, ['completed_at']).isNotEmpty ? ' - ${_formatTxTimestamp(_pick(tx, ['completed_at']))}' : ''}',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppColors.successGreen,
                        ),
                      ),
                    ),
                    ..._reportBadges(tx).map(
                      (badge) => Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: _reportBadge(badge),
                      ),
                    ),
                  ],
                  if (!canSubmit && _canReportTx(tx)) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: submitting ? null : () => _reportTx(tx),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: _redBorder),
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: const Text(
                          'REPORT',
                          style: TextStyle(
                            fontSize: 11,
                            color: _sellRed,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                    ),
                  ],
                  if (error != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      error!,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        color: _sellRed,
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: submitting
                              ? null
                              : () => Navigator.maybePop(ctx),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: _webBorder),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: const Text(
                            'CLOSE',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.1,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      if (canSubmit || canConfirm) ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: submitting
                                ? null
                                : () async {
                                    if (canConfirm) {
                                      final confirmed = await _confirmTrade(tx);
                                      if (sheetContext.mounted) {
                                        if (confirmed) {
                                          Navigator.of(sheetContext).maybePop();
                                        } else {
                                          setSheet(() => submitting = false);
                                        }
                                      }
                                      return;
                                    }
                                    if (txId.text.trim().isEmpty &&
                                        proofFile == null) {
                                      setSheet(
                                        () => error =
                                            'Enter a transaction ID or upload a screenshot.',
                                      );
                                      return;
                                    }
                                    setSheet(() => submitting = true);
                                    final failure = _buyMode
                                        ? await Api.submitBuyTransactionDetails(
                                            tx['id'],
                                            txId: txId.text.trim(),
                                            screenshot: proofFile,
                                          )
                                        : await Api.submitSellTransactionDetails(
                                            tx['id'],
                                            txId: txId.text.trim(),
                                            screenshot: proofFile,
                                          );
                                    if (!mounted) return;
                                    if (!sheetContext.mounted) return;
                                    setSheet(() => submitting = false);
                                    if (failure == null) {
                                      Navigator.of(sheetContext).maybePop();
                                      AppNotifications.success(
                                        'Payment details submitted',
                                      );
                                      await _load();
                                    } else {
                                      setSheet(() => error = failure);
                                    }
                                  },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.successGreen,
                              foregroundColor: Colors.black,
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: Text(
                              canConfirm
                                  ? (submitting ? 'Confirming...' : 'Confirm')
                                  : (submitting ? 'Submitting...' : 'Submit'),
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _summaryBox(String label, String value, Color valueColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: _fieldBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 9.5,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w800,
              color: AppColors.textGray600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 14.5,
              fontWeight: FontWeight.w700,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusNotice(String text) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _amberBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _amberBorder),
      ),
      child: Row(
        children: [
          const Icon(Ionicons.time_outline, size: 15, color: _amber),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: _amber,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailCard(List<Widget> children) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _fieldBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Column(children: children),
    );
  }

  Widget _paymentRowsCard(
    List<Map<String, String>> rows, {
    String title = 'SEND PAYMENT TO',
    Future<void> Function(String value)? onCopy,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _fieldBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              title,
              style: TextStyle(
                fontSize: 9.5,
                letterSpacing: 1.1,
                fontWeight: FontWeight.w800,
                color: AppColors.textGray600,
              ),
            ),
          ),
          const SizedBox(height: 12),
          for (final row in rows)
            _detailLine(
              row['label']!,
              row['value']!,
              copyable: true,
              onCopy: onCopy,
            ),
        ],
      ),
    );
  }

  Widget _singleDetailCard(
    String label,
    String value, {
    Future<void> Function(String value)? onCopy,
  }) {
    final copied = _copiedOrderId == value;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _fieldBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                    color: AppColors.textGray600,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => (onCopy ?? _copyOrderId)(value),
            behavior: HitTestBehavior.opaque,
            child: Icon(
              copied ? Ionicons.checkmark : Ionicons.copy_outline,
              size: 15,
              color: copied ? AppColors.successGreen : AppColors.textGray400,
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailLine(
    String label,
    String value, {
    bool copyable = false,
    Future<void> Function(String value)? onCopy,
  }) {
    final copied = _copiedOrderId == value;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w500,
                color: AppColors.textGray500,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _cleanUiText(value),
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
          if (copyable && value.trim().isNotEmpty) ...[
            const SizedBox(width: 7),
            GestureDetector(
              onTap: () => (onCopy ?? _copyOrderId)(value),
              behavior: HitTestBehavior.opaque,
              child: Icon(
                copied ? Ionicons.checkmark : Ionicons.copy_outline,
                size: 13,
                color: copied ? AppColors.successGreen : AppColors.textGray500,
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _openProofZoom(Map tx) {
    final proof = _txProofValue(tx);
    final name = _txProofName(tx);
    final urls = _proofUrlCandidates(proof);
    final url = urls.isEmpty ? '' : urls.first;
    final memoryBytes = _decodeDataUri(proof);
    if (memoryBytes == null && url.isEmpty) return;

    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.92),
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        backgroundColor: Colors.black,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Stack(
          children: [
            SizedBox(
              width: double.infinity,
              height: MediaQuery.sizeOf(ctx).height * 0.78,
              child: InteractiveViewer(
                minScale: 0.8,
                maxScale: 5,
                child: Center(
                  child: memoryBytes != null
                      ? Image.memory(memoryBytes, fit: BoxFit.contain)
                      : Image.network(
                          url,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => Text(
                            name.isEmpty ? 'Image unavailable' : name,
                            style: const TextStyle(color: Colors.white),
                          ),
                        ),
                ),
              ),
            ),
            Positioned(
              right: 10,
              top: 10,
              child: IconButton(
                onPressed: () => Navigator.maybePop(ctx),
                style: IconButton.styleFrom(
                  backgroundColor: const Color(0xCC1F2024),
                ),
                icon: const Icon(Ionicons.close_outline, color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _proofPreview(Map tx) {
    final proof = _txProofValue(tx);
    final name = _txProofName(tx);
    final urls = _proofUrlCandidates(proof);
    final memoryBytes = _decodeDataUri(proof);
    Widget buildZoomOverlay(Widget child) {
      return Stack(
        alignment: Alignment.center,
        children: [
          Positioned.fill(child: child),
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.45),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.35)),
            ),
            child: const Icon(
              Ionicons.search_outline,
              size: 28,
              color: Colors.white,
            ),
          ),
          const Positioned(
            bottom: 14,
            child: Text(
              'ZOOM',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.7,
                color: Colors.white,
              ),
            ),
          ),
        ],
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _fieldBg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _webBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PAYMENT PROOF',
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
              color: AppColors.textGray600,
            ),
          ),
          const SizedBox(height: 10),
          if (memoryBytes != null)
            GestureDetector(
              onTap: () => _openProofZoom(tx),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: double.infinity,
                  height: 260,
                  child: buildZoomOverlay(
                    Image.memory(
                      memoryBytes,
                      width: double.infinity,
                      height: double.infinity,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => _proofFallbackText(
                        name.isEmpty ? 'Payment proof' : name,
                      ),
                    ),
                  ),
                ),
              ),
            )
          else if (urls.isNotEmpty)
            GestureDetector(
              onTap: () => _openProofZoom(tx),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox(
                  width: double.infinity,
                  height: 260,
                  child: buildZoomOverlay(
                    _ProofNetworkImage(
                      urls: urls,
                      fallbackText: name.isEmpty ? proof : name,
                    ),
                  ),
                ),
              ),
            )
          else
            Text(
              name.isEmpty ? 'No image available' : name,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray500,
              ),
            ),
        ],
      ),
    );
  }

  Widget _proofFallbackText(String text) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Text(
          text,
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

/// The green tick on a selected method tile.
class _CheckBadge extends StatelessWidget {
  const _CheckBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 14,
      height: 14,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: AppColors.successGreen,
        shape: BoxShape.circle,
      ),
      child: const Icon(Ionicons.checkmark, size: 9, color: Colors.black),
    );
  }
}

/// The lock on a method tile that already has a posted ad.
class _LockBadge extends StatelessWidget {
  const _LockBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 15,
      height: 15,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: _amber, shape: BoxShape.circle),
      child: const Icon(Ionicons.lock_closed, size: 9, color: Colors.black),
    );
  }
}

class _ProofNetworkImage extends StatefulWidget {
  final List<String> urls;
  final String fallbackText;

  const _ProofNetworkImage({required this.urls, required this.fallbackText});

  @override
  State<_ProofNetworkImage> createState() => _ProofNetworkImageState();
}

class _ProofNetworkImageState extends State<_ProofNetworkImage> {
  int _index = 0;

  @override
  void didUpdateWidget(covariant _ProofNetworkImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.urls.join('\n') != widget.urls.join('\n')) {
      _index = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.urls.isEmpty || _index >= widget.urls.length) {
      return _fallback();
    }
    return Image.network(
      widget.urls[_index],
      width: double.infinity,
      height: double.infinity,
      fit: BoxFit.contain,
      webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
      frameBuilder: (context, child, frame, wasSync) {
        if (wasSync || frame != null) return child;
        return const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.textGray400,
            ),
          ),
        );
      },
      errorBuilder: (_, __, ___) {
        if (_index + 1 < widget.urls.length) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _index += 1);
          });
          return const Center(
            child: SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.textGray400,
              ),
            ),
          );
        }
        return _fallback();
      },
    );
  }

  Widget _fallback() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Text(
          widget.fallbackText,
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}
