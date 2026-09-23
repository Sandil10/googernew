import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../services/app_notifications.dart';
import '../services/cart_store.dart';
import '../theme/colors.dart';
import '../util/storage.dart';
import '../widgets/app_back_button.dart';
import 'my_wallet_screen.dart';
import 'top_up_screen.dart';

const _panelBg = Color(0xFF050505);
const _cardBg = Color(0xFF0D0D0D);
const _accentBlue = Color(0xFF3B82F6);
const _accentGreen = Color(0xFF22C55E);
const _checkoutPaymentStorageKey = 'googer-flutter-checkout-payment';

String _money(double value) => 'R ${value.toStringAsFixed(2)}';

/// Payment options, matching the web cart 1:1.
/// `wallet_manual` only appears when every selected line is from one seller.
enum PayMethod { wallet, walletManual, cod }

extension on PayMethod {
  String get id => switch (this) {
    PayMethod.wallet => 'wallet',
    PayMethod.walletManual => 'wallet_manual',
    PayMethod.cod => 'cod',
  };

  String get label => switch (this) {
    PayMethod.wallet => 'Googer Payment',
    PayMethod.walletManual => 'Googer Manual Payment',
    PayMethod.cod => 'Cash on Delivery',
  };

  IconData get icon => switch (this) {
    PayMethod.wallet => Ionicons.wallet_outline,
    PayMethod.walletManual => Ionicons.card_outline,
    PayMethod.cod => Ionicons.bicycle_outline,
  };
}

/// Bag + checkout. Opened from the topbar cart icon.
///
/// Two views behind one header — CART (lines, selection, totals) and ADDRESS
/// (delivery address, items to deliver, payment method, place order) — mirroring
/// the web `CartSidebar`.
class CartScreen extends StatefulWidget {
  const CartScreen({super.key});

  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  bool _addressView = false;
  PayMethod _method = PayMethod.cod;

  /// Wallet transfer that funds this order — set by Googer Payment (pay now)
  /// or by verifying a manual payment hold. `null` for cash on delivery.
  String? _transferId;
  String? _paidCartSignature;
  bool _paying = false;
  bool _placing = false;

  final _manualTxnController = TextEditingController();
  String _manualSellerId = '';
  bool _manualResolving = false;
  bool _manualStarted = false;

  final _deliverScroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _loadCheckout();
  }

  Future<void> _loadCheckout() async {
    if (Api.loggedIn) await Api.refreshProfile();
    await CartStore.load();
    if (!mounted) return;
    _restorePaymentIntent();
  }

  @override
  void dispose() {
    _manualTxnController.dispose();
    _deliverScroll.dispose();
    super.dispose();
  }

  /// Manual payment is a single seller-to-seller wallet transfer, so it is only
  /// offered when the whole selection belongs to one seller (web rule).
  bool get _singleSeller {
    final sellers = CartStore.selectedItems
        .map((i) => i.deliveryGroupId)
        .toSet();
    return sellers.length == 1;
  }

  List<PayMethod> get _methods => [
    PayMethod.wallet,
    if (_singleSeller) PayMethod.walletManual,
    PayMethod.cod,
  ];

  bool get _paid => _transferId != null;

  /// Wallet flows must settle before the order can be created; COD cannot.
  bool get _canPlaceOrder {
    if (CartStore.selectedItems.isEmpty) return false;
    if (CartStore.address.value == null) return false;
    if (_method == PayMethod.cod) return true;
    return _paid;
  }

  void _resetPayment() {
    _transferId = null;
    _paidCartSignature = null;
    _manualTxnController.clear();
    _manualStarted = false;
    writeStorage(_checkoutPaymentStorageKey, null);
  }

  String get _cartSignature {
    final rows =
        CartStore.selectedItems
            .map((item) => '${item.id}:${item.productId}:${item.quantity}')
            .toList()
          ..sort();
    return '${rows.join('|')}|${CartStore.payableTotal.toStringAsFixed(2)}';
  }

  void _persistPaymentIntent() {
    if (_transferId == null) return;
    _paidCartSignature = _cartSignature;
    writeStorage(
      _checkoutPaymentStorageKey,
      jsonEncode({
        'method': _method.id,
        'transferId': _transferId,
        'signature': _paidCartSignature,
        'manualTransactionId': _manualTxnController.text.trim(),
      }),
    );
  }

  void _restorePaymentIntent() {
    final raw = readStorage(_checkoutPaymentStorageKey);
    if (raw == null || raw.isEmpty) return;
    try {
      final data = jsonDecode(raw);
      if (data is! Map || '${data['signature'] ?? ''}' != _cartSignature) {
        writeStorage(_checkoutPaymentStorageKey, null);
        return;
      }
      final method = PayMethod.values.firstWhere(
        (candidate) => candidate.id == '${data['method'] ?? ''}',
      );
      setState(() {
        _method = method;
        _transferId = '${data['transferId'] ?? ''}'.trim();
        _paidCartSignature = '${data['signature']}';
        _manualTxnController.text = '${data['manualTransactionId'] ?? ''}'
            .trim();
        _manualStarted = _method == PayMethod.walletManual;
        _addressView = true;
      });
      if (_transferId?.isEmpty == true) _resetPayment();
      if (_method == PayMethod.walletManual) _resolveManualSeller();
    } catch (_) {
      writeStorage(_checkoutPaymentStorageKey, null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _panelBg,
      body: SafeArea(
        child: ValueListenableBuilder<List<CartItem>>(
          valueListenable: CartStore.items,
          builder: (context, items, _) {
            if (_paid && _paidCartSignature != _cartSignature) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) setState(_resetPayment);
              });
            }
            // Manual payment stops being valid the moment the cart spans
            // sellers — fall back to COD like the web does.
            if (_method == PayMethod.walletManual && !_singleSeller) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) setState(() => _method = PayMethod.cod);
              });
            }
            return Column(
              children: [
                _header(),
                Expanded(
                  child: _addressView ? _addressBody(items) : _cartBody(items),
                ),
                _addressView ? _addressFooter() : _cartFooter(),
              ],
            );
          },
        ),
      ),
    );
  }

  // ── header ────────────────────────────────────────────────────────────────

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: _cardBg,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Row(
              children: [
                _tab(
                  icon: Ionicons.cart,
                  label: 'CART',
                  active: !_addressView,
                  onTap: () {
                    if (_guardPaymentLock()) return;
                    setState(() => _addressView = false);
                  },
                ),
                _tab(
                  icon: Ionicons.location,
                  label: 'ADDRESS',
                  active: _addressView,
                  onTap: _openAddressView,
                ),
              ],
            ),
          ),
          const Spacer(),
          GestureDetector(
            onTap: () => Navigator.maybePop(context),
            behavior: HitTestBehavior.opaque,
            child: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: _cardBg,
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: const Icon(Ionicons.close, size: 19, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }

  Widget _tab({
    required IconData icon,
    required String label,
    required bool active,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 88,
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF1B1B1B) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: active ? AppColors.borderWhite10 : Colors.transparent,
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 15,
              color: active ? Colors.white : Colors.white.withOpacity(0.35),
            ),
            const SizedBox(height: 5),
            Text(
              label,
              style: TextStyle(
                fontSize: 8,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.4,
                color: active ? Colors.white : Colors.white.withOpacity(0.35),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openAddressView() {
    if (CartStore.selectedItems.isEmpty) {
      AppNotifications.error('Select at least one item to check out');
      return;
    }
    setState(() => _addressView = true);
    _resolveManualSeller();
  }

  bool _guardPaymentLock() {
    if (!_paid) return false;
    AppNotifications.info(
      'Checkout locked',
      'This payment is already on hold. Place the order to finish checkout.',
    );
    return true;
  }

  // ── cart view ─────────────────────────────────────────────────────────────

  Widget _cartBody(List<CartItem> items) {
    if (items.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Ionicons.cart_outline,
              size: 38,
              color: Colors.white.withOpacity(0.18),
            ),
            const SizedBox(height: 12),
            Text(
              'YOUR BAG IS EMPTY',
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                letterSpacing: 2,
                color: Colors.white.withOpacity(0.28),
              ),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 14),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
          child: Row(
            children: [
              _Checkbox(
                value: CartStore.isAllSelected,
                onTap: () {
                  if (_guardPaymentLock()) return;
                  CartStore.toggleAll(!CartStore.isAllSelected);
                },
              ),
              const SizedBox(width: 12),
              const Text(
                'SELECT ALL',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.6,
                  color: Colors.white,
                ),
              ),
              const Spacer(),
              Text(
                '${CartStore.selectedItems.length} SELECTED',
                style: TextStyle(
                  fontSize: 9,
                  fontStyle: FontStyle.italic,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: Colors.white.withOpacity(0.35),
                ),
              ),
            ],
          ),
        ),
        ...items.map(_cartRow),
      ],
    );
  }

  Widget _cartRow(CartItem item) {
    final unavailable = !CartStore.isAvailable(item);
    final saved = (item.price - item.unitPrice) * item.quantity;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
      decoration: BoxDecoration(
        color: _cardBg,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 18),
                child: _Checkbox(
                  value: item.selected,
                  onTap: () {
                    if (_guardPaymentLock()) return;
                    CartStore.toggleSelection(item.id);
                  },
                ),
              ),
              const SizedBox(width: 12),
              _thumb(item.imageUrl, 58),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title.toUpperCase(),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.4,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _spec('COLOR', item.color ?? 'NONE'),
                    const SizedBox(height: 3),
                    _spec('SIZE', item.size ?? 'NONE'),
                    if (unavailable) ...[
                      const SizedBox(height: 6),
                      Text(
                        'DOES NOT SHIP TO ${CartStore.country.toUpperCase()}',
                        style: const TextStyle(
                          fontSize: 8,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.8,
                          color: AppColors.likeRed,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              GestureDetector(
                onTap: () {
                  if (_guardPaymentLock()) return;
                  CartStore.remove(item.id);
                },
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.only(left: 6, bottom: 6),
                  child: Icon(
                    Ionicons.trash_outline,
                    size: 17,
                    color: Colors.white.withOpacity(0.45),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              const SizedBox(width: 30),
              _QtyStepper(
                quantity: item.quantity,
                onMinus: () {
                  if (_guardPaymentLock()) return;
                  CartStore.updateQuantity(item.id, -1);
                },
                onPlus: () {
                  if (_guardPaymentLock()) return;
                  CartStore.updateQuantity(item.id, 1);
                },
              ),
              const Spacer(),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    _money(item.lineTotal),
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  if (item.productDiscount > 0) ...[
                    const SizedBox(height: 2),
                    Text(
                      '-${item.productDiscount.toStringAsFixed(0)}% OFF',
                      style: const TextStyle(
                        fontSize: 8,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                        color: _accentGreen,
                      ),
                    ),
                  ],
                  if (saved > 0) ...[
                    const SizedBox(height: 2),
                    Text(
                      'SAVED ${_money(saved)}',
                      style: const TextStyle(
                        fontSize: 8,
                        fontStyle: FontStyle.italic,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                        color: _accentGreen,
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _spec(String label, String value) {
    return Text(
      '$label: ${value.toUpperCase()}',
      style: TextStyle(
        fontSize: 8.5,
        fontWeight: FontWeight.w500,
        letterSpacing: 1,
        color: Colors.white.withOpacity(0.35),
      ),
    );
  }

  Widget _cartFooter() {
    final discountPct = CartStore.selectedTotal > 0
        ? (CartStore.totalDiscount / CartStore.selectedTotal) * 100
        : 0.0;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 13, 16, 13),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.borderWhite10)),
      ),
      child: Column(
        children: [
          _summaryRow('ITEM SUBTOTAL', _money(CartStore.selectedTotal)),
          const SizedBox(height: 10),
          _summaryRow(
            'PRODUCT DISCOUNT (SELLER STAKED)',
            _money(CartStore.totalDiscount),
            valueColor: _accentGreen,
            labelColor: _accentGreen,
            badge: discountPct > 0
                ? '${discountPct.toStringAsFixed(0)}%'
                : null,
          ),
          const SizedBox(height: 10),
          _summaryRow('DELIVERY CHARGE', _money(CartStore.deliveryTotal)),
          const SizedBox(height: 14),
          const Divider(height: 1, color: AppColors.borderWhite10),
          const SizedBox(height: 14),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'GRAND TOTAL PAYABLE',
                  style: TextStyle(
                    fontSize: 10,
                    fontStyle: FontStyle.italic,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                    color: Colors.white,
                  ),
                ),
              ),
              Text(
                _money(CartStore.payableTotal),
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _PrimaryButton(
            label: 'CHECKOUT',
            enabled: CartStore.selectedItems.isNotEmpty,
            onTap: _openAddressView,
          ),
        ],
      ),
    );
  }

  Widget _summaryRow(
    String label,
    String value, {
    Color? valueColor,
    Color? labelColor,
    String? badge,
  }) {
    return Row(
      children: [
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.2,
              color: labelColor ?? Colors.white.withOpacity(0.4),
            ),
          ),
        ),
        if (badge != null) ...[
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
            decoration: BoxDecoration(
              color: _accentGreen.withOpacity(0.15),
              borderRadius: BorderRadius.circular(5),
            ),
            child: Text(
              badge,
              style: const TextStyle(
                fontSize: 7.5,
                fontWeight: FontWeight.w600,
                color: _accentGreen,
              ),
            ),
          ),
        ],
        const Spacer(),
        Text(
          value,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: valueColor ?? Colors.white,
          ),
        ),
      ],
    );
  }

  // ── address / checkout view ───────────────────────────────────────────────

  Widget _addressBody(List<CartItem> items) {
    final selected = items.where((i) => i.selected).toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 6, 14, 14),
      children: [
        _sectionLabel('ADDRESS & PAYMENTS'),
        const SizedBox(height: 10),
        _addressCard(),
        const SizedBox(height: 22),
        Row(
          children: [
            Expanded(child: _sectionLabel('ITEMS TO DELIVER')),
            // Leaves the address view for the cart list behind it.
            AppBackButton(
              onTap: () {
                if (_guardPaymentLock()) return;
                setState(() => _addressView = false);
              },
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
              color: _accentBlue,
            ),
            if (MediaQuery.sizeOf(context).width >= 360) ...[
              const SizedBox(width: 8),
              _roundIcon(
                Ionicons.chevron_back,
                () => _deliverScroll.animateTo(
                  (_deliverScroll.offset - 140).clamp(
                    0,
                    _deliverScroll.position.maxScrollExtent,
                  ),
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOut,
                ),
              ),
              const SizedBox(width: 6),
              _roundIcon(
                Ionicons.chevron_forward,
                () => _deliverScroll.animateTo(
                  (_deliverScroll.offset + 140).clamp(
                    0,
                    _deliverScroll.position.maxScrollExtent,
                  ),
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOut,
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 134,
          child: selected.isEmpty
              ? Center(
                  child: Text(
                    'NO ITEMS SELECTED',
                    style: TextStyle(
                      fontSize: 8,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.6,
                      color: Colors.white.withOpacity(0.25),
                    ),
                  ),
                )
              : ListView.separated(
                  controller: _deliverScroll,
                  scrollDirection: Axis.horizontal,
                  itemCount: selected.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (_, index) => _deliverCard(selected[index]),
                ),
        ),
        const SizedBox(height: 22),
        _sectionLabel('PAYMENT METHOD'),
        const SizedBox(height: 12),
        ..._methods.map(_methodRow),
        if (_method != PayMethod.cod) ...[
          const SizedBox(height: 14),
          _walletPanel(),
        ],
        const SizedBox(height: 10),
      ],
    );
  }

  Widget _sectionLabel(String text) => Text(
    text,
    style: TextStyle(
      fontSize: 9,
      fontStyle: FontStyle.italic,
      fontWeight: FontWeight.w600,
      letterSpacing: 2,
      color: Colors.white.withOpacity(0.32),
    ),
  );

  Widget _roundIcon(IconData icon, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    behavior: HitTestBehavior.opaque,
    child: Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, size: 12, color: Colors.white.withOpacity(0.45)),
    ),
  );

  Widget _addressCard() {
    return ValueListenableBuilder<Map<String, dynamic>?>(
      valueListenable: CartStore.address,
      builder: (context, address, _) {
        if (address == null) {
          return GestureDetector(
            onTap: () {
              if (_guardPaymentLock()) return;
              _editAddress();
            },
            behavior: HitTestBehavior.opaque,
            child: Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: _cardBg,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.borderWhite10),
              ),
              child: const Row(
                children: [
                  Icon(
                    Ionicons.add_circle_outline,
                    size: 18,
                    color: _accentBlue,
                  ),
                  SizedBox(width: 10),
                  Text(
                    'ADD DELIVERY ADDRESS',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.4,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        final name = [
          address['firstName'],
          address['lastName'],
        ].map((v) => '${v ?? ''}'.trim()).where((v) => v.isNotEmpty).join(' ');
        final phones = [address['phone'], address['phone2']]
            .map((v) => '${v ?? ''}'.trim())
            .where((v) => v.isNotEmpty)
            .join(' / ');
        final single = '${address['addressMode'] ?? 'detailed'}' == 'single';
        final line1 = single
            ? '${address['fullAddress'] ?? ''}'
            : [address['houseNo'], address['street'], address['city']]
                  .map((v) => '${v ?? ''}'.trim())
                  .where((v) => v.isNotEmpty)
                  .join(', ');
        final line2 = single
            ? ''
            : [address['district'], address['province'], address['country']]
                  .map((v) => '${v ?? ''}'.trim())
                  .where((v) => v.isNotEmpty)
                  .join(', ');

        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _cardBg,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.borderWhite10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: _accentBlue.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _accentBlue.withOpacity(0.22)),
                    ),
                    child: const Icon(
                      Ionicons.location,
                      size: 15,
                      color: _accentBlue,
                    ),
                  ),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name.isEmpty
                              ? 'DELIVERY ADDRESS'
                              : name.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 1.2,
                            color: Colors.white,
                          ),
                        ),
                        if (phones.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(
                            phones,
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w500,
                              letterSpacing: 1,
                              color: Colors.white.withOpacity(0.4),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  GestureDetector(
                    onTap: () {
                      if (_guardPaymentLock()) return;
                      _editAddress();
                    },
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.05),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Ionicons.create_outline,
                        size: 13,
                        color: Colors.white.withOpacity(0.45),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.45),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.borderWhite06),
                ),
                child: Text(
                  [
                    line1,
                    line2,
                  ].where((l) => l.trim().isNotEmpty).join('\n').toUpperCase(),
                  style: TextStyle(
                    fontSize: 9,
                    height: 1.7,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.6,
                    color: Colors.white.withOpacity(0.42),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _deliverCard(CartItem item) {
    return SizedBox(
      width: 86,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.borderWhite06),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _thumb(item.imageUrl, 68, radius: 10),
                const SizedBox(height: 6),
                Text(
                  item.title.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 7.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withOpacity(0.7),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _money(item.unitPrice),
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: _accentBlue,
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            top: -6,
            right: -6,
            child: GestureDetector(
              // Deselecting drops it from this order but keeps it in the bag,
              // same as the web's per-item close button.
              onTap: () {
                if (_guardPaymentLock()) return;
                CartStore.toggleSelection(item.id);
              },
              behavior: HitTestBehavior.opaque,
              child: Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: const Color(0xFF1A1A1A),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white.withOpacity(0.2)),
                ),
                child: Icon(
                  Ionicons.close,
                  size: 10,
                  color: Colors.white.withOpacity(0.55),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _methodRow(PayMethod method) {
    final active = _method == method;
    return GestureDetector(
      onTap: () {
        if (_paid) {
          AppNotifications.info(
            'Payment already made',
            'Place the order to finish, or reopen the cart to start over.',
          );
          return;
        }
        setState(() {
          _method = method;
          _resetPayment();
        });
        if (method == PayMethod.walletManual) _resolveManualSeller();
        if (method == PayMethod.wallet &&
            Api.balance < CartStore.payableTotal) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _method == PayMethod.wallet) {
              _showBalanceError(CartStore.payableTotal);
            }
          });
        }
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          color: active ? Colors.white.withOpacity(0.05) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: active
                ? Colors.white.withOpacity(0.2)
                : AppColors.borderWhite06,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: active
                    ? _accentBlue.withOpacity(0.2)
                    : Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(
                method.icon,
                size: 14,
                color: active ? _accentBlue : Colors.white.withOpacity(0.22),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                method.label.toUpperCase(),
                style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: active ? Colors.white : Colors.white.withOpacity(0.4),
                ),
              ),
            ),
            Container(
              width: 17,
              height: 17,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: active ? _accentBlue : Colors.transparent,
                border: Border.all(
                  color: active ? _accentBlue : Colors.white.withOpacity(0.12),
                  width: 2,
                ),
              ),
              child: active
                  ? const Icon(
                      Ionicons.checkmark,
                      size: 10,
                      color: Colors.white,
                    )
                  : null,
            ),
          ],
        ),
      ),
    );
  }

  /// Wallet / manual payment panel — totals plus the action that produces the
  /// wallet transfer id the order is created against.
  Widget _walletPanel() {
    final total = CartStore.payableTotal;
    final insufficient =
        _method == PayMethod.wallet && Api.balance < total && !_paid;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_paid)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: _accentGreen.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _accentGreen.withOpacity(0.25)),
              ),
              child: const Text(
                'PAYMENT SUCCESSFUL — PLACE YOUR ORDER',
                style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: _accentGreen,
                ),
              ),
            ),
          Row(
            children: [
              Text(
                'TOTAL AMOUNT',
                style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: Colors.white.withOpacity(0.25),
                ),
              ),
              const Spacer(),
              Text(
                _money(total),
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: _accentBlue,
                ),
              ),
            ],
          ),
          if (CartStore.totalDiscount > 0) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Text(
                  'TOTAL DISCOUNT',
                  style: TextStyle(
                    fontSize: 9,
                    fontStyle: FontStyle.italic,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.4,
                    color: _accentGreen.withOpacity(0.45),
                  ),
                ),
                const Spacer(),
                Text(
                  _money(CartStore.totalDiscount),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: _accentGreen,
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Text(
                'WALLET BALANCE',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: Colors.white.withOpacity(0.25),
                ),
              ),
              const Spacer(),
              Text(
                _money(Api.balance),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Api.balance < total && _method == PayMethod.wallet
                      ? AppColors.likeRed
                      : Colors.white,
                ),
              ),
            ],
          ),
          if (_method == PayMethod.walletManual) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Text(
                  'PAY TO SELLER ID',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                    color: Colors.white.withOpacity(0.25),
                  ),
                ),
                const Spacer(),
                Text(
                  _manualResolving
                      ? '…'
                      : (_manualSellerId.isEmpty ? 'N/A' : _manualSellerId),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
                if (_manualSellerId.isNotEmpty) ...[
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: _manualSellerId));
                      AppNotifications.success('Seller ID copied');
                    },
                    behavior: HitTestBehavior.opaque,
                    child: const Text(
                      'COPY',
                      style: TextStyle(
                        fontSize: 8,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.2,
                        color: _accentBlue,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            Text(
              _manualStarted ? 'ENTER TRANSACTION ID' : 'PAYMENT REQUIRED',
              style: TextStyle(
                fontSize: 8.5,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.4,
                color: Colors.white.withOpacity(0.25),
              ),
            ),
            if (_manualStarted) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _manualTxnController,
                enabled: !_paid,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
                decoration: InputDecoration(
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  filled: true,
                  fillColor: Colors.black.withOpacity(0.4),
                  hintText: 'G123456789',
                  hintStyle: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withOpacity(0.15),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: AppColors.borderWhite10,
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(
                      color: AppColors.borderWhite10,
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide(color: _accentBlue.withOpacity(0.4)),
                  ),
                ),
              ),
            ],
          ],
          if (insufficient) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.likeRed.withOpacity(0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.likeRed.withOpacity(0.25)),
              ),
              child: Column(
                children: [
                  const Text(
                    'INSUFFICIENT FUNDS',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1.2,
                      color: AppColors.likeRed,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'SHORTFALL ${_money(total - Api.balance)}',
                    style: TextStyle(
                      fontSize: 8,
                      letterSpacing: 1,
                      color: AppColors.likeRed.withOpacity(0.7),
                    ),
                  ),
                  const SizedBox(height: 10),
                  _PrimaryButton(
                    label: 'TOP UP WALLET',
                    filled: false,
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const TopUpScreen()),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          _PrimaryButton(
            label: _paying
                ? 'PROCESSING…'
                : _paid
                ? 'PAID'
                : _method == PayMethod.wallet
                ? 'PAY NOW'
                : _manualStarted
                ? 'VERIFY PAYMENT'
                : 'MAKE PAYMENT',
            enabled: !_paying && !_paid && !insufficient,
            filled: false,
            onTap: _method == PayMethod.wallet
                ? _payWithWallet
                : _manualStarted
                ? _verifyManualPayment
                : _startManualPayment,
          ),
        ],
      ),
    );
  }

  Widget _addressFooter() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 11, 16, 13),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.borderWhite10)),
      ),
      child: _PrimaryButton(
        label: _placing
            ? 'PROCESSING…'
            : CartStore.address.value == null
            ? 'SET ADDRESS'
            : 'PLACE ORDER',
        enabled:
            !_placing && (CartStore.address.value == null || _canPlaceOrder),
        onTap: CartStore.address.value == null ? _editAddress : _placeOrder,
      ),
    );
  }

  Widget _thumb(String url, double size, {double radius = 12}) {
    final resolved = url.trim().isEmpty ? '' : Api.resolveMedia(url);
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: AppColors.borderWhite06),
      ),
      child: resolved.isEmpty
          ? Icon(
              Ionicons.image_outline,
              size: size * 0.34,
              color: Colors.white.withOpacity(0.2),
            )
          : Image.network(
              resolved,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Icon(
                Ionicons.image_outline,
                size: size * 0.34,
                color: Colors.white.withOpacity(0.2),
              ),
            ),
    );
  }

  // ── payment + order actions ───────────────────────────────────────────────

  /// The manual flow pays one seller directly, so resolve that seller's public
  /// Googer ID (the number the buyer transfers to).
  Future<void> _resolveManualSeller() async {
    if (!_singleSeller) return;
    final items = CartStore.selectedItems;
    if (items.isEmpty) return;
    setState(() => _manualResolving = true);
    final product = await Api.productById(items.first.productId);
    if (!mounted) return;
    final raw =
        product?['owner_public_user_id'] ??
        product?['owner_user_id'] ??
        product?['seller_user_id'] ??
        product?['seller_googer_id'] ??
        (product?['user'] is Map ? product!['user']['user_id'] : null) ??
        items.first.sellerId;
    final digits = '${raw ?? ''}'.replaceAll(RegExp(r'\D'), '');
    setState(() {
      _manualResolving = false;
      _manualSellerId = digits.isEmpty
          ? '${raw ?? ''}'
          : digits.padLeft(6, '0').substring(digits.padLeft(6, '0').length - 6);
    });
  }

  Future<void> _payWithWallet() async {
    if (!Api.loggedIn) {
      AppNotifications.error('Log in to pay with your Googer wallet');
      return;
    }
    final total = CartStore.payableTotal;
    if (total <= 0) return;
    if (Api.balance < total) {
      await _showBalanceError(total);
      return;
    }
    if (!await _validateCheckoutEligibility()) return;
    if (!mounted) return;
    final confirmed = await _confirmCheckoutAction(
      title: 'CONFIRM PAYMENT',
      message: 'Pay ${_money(total)} with Googer Payment?',
      confirmLabel: 'CONFIRM',
    );
    if (!confirmed || !mounted) return;
    setState(() => _paying = true);
    try {
      final transferId = await Api.walletPayOrder(total, note: 'Order payment');
      if (!mounted) return;
      setState(() {
        _transferId = transferId;
        _paying = false;
      });
      _persistPaymentIntent();
      AppNotifications.success(
        'Payment on hold',
        'Released to the seller once your order is delivered.',
      );
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() => _paying = false);
      AppNotifications.error('Payment failed', e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _paying = false);
      AppNotifications.error('Payment failed', 'Could not reach the server.');
    }
  }

  Future<void> _verifyManualPayment() async {
    final txn = _manualTxnController.text.trim();
    if (txn.isEmpty) {
      AppNotifications.error('Enter the transaction ID from your transfer');
      return;
    }
    if (!RegExp(r'^[a-zA-Z0-9]{6,20}$').hasMatch(txn)) {
      AppNotifications.error('Enter a valid manual transaction ID');
      return;
    }
    if (_manualSellerId.isEmpty) {
      AppNotifications.error('Could not resolve the seller for this order');
      return;
    }
    if (!await _validateCheckoutEligibility()) return;
    setState(() => _paying = true);
    try {
      final transferId = await Api.verifyManualPaymentHold(
        transactionId: txn,
        sellerId: _manualSellerId,
        amount: CartStore.payableTotal,
      );
      if (!mounted) return;
      setState(() => _paying = false);
      final confirmed = await _confirmCheckoutAction(
        title: 'CONFIRM MANUAL PAYMENT',
        message:
            'Use transaction ${_manualTxnController.text.trim()} for this order?',
        confirmLabel: 'YES / CONFIRM',
      );
      if (!confirmed || !mounted) return;
      setState(() {
        _transferId = transferId;
      });
      _persistPaymentIntent();
      AppNotifications.success('Manual payment verified');
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() => _paying = false);
      AppNotifications.error('Verification failed', e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _paying = false);
      AppNotifications.error(
        'Verification failed',
        'Could not reach the server.',
      );
    }
  }

  Future<void> _startManualPayment() async {
    if (!await _validateCheckoutEligibility()) return;
    if (!mounted) return;
    if (_manualSellerId.isEmpty) {
      AppNotifications.error('Could not resolve the seller for this order');
      return;
    }
    if (Api.balance < CartStore.payableTotal) {
      await _showBalanceError(CartStore.payableTotal);
      return;
    }

    final transactionId = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) => MyWalletScreen(
          lockedSellerId: _manualSellerId,
          lockedAmount: CartStore.payableTotal,
        ),
      ),
    );
    if (!mounted) return;
    if (transactionId == null) return;
    setState(() {
      _manualStarted = true;
      _manualTxnController.text = transactionId;
    });
  }

  Future<void> _placeOrder() async {
    if (!Api.loggedIn) {
      AppNotifications.error('Log in to place an order');
      return;
    }
    final selected = CartStore.selectedItems;
    if (selected.isEmpty) {
      AppNotifications.error('Select at least one item');
      return;
    }
    final address = CartStore.address.value;
    if (address == null) {
      _editAddress();
      return;
    }
    if (!_canPlaceOrder) {
      AppNotifications.error(
        _method == PayMethod.wallet
            ? 'Complete the wallet payment first'
            : 'Verify your manual payment first',
      );
      return;
    }

    if (!await _validateCheckoutEligibility(
      validateCod: _method == PayMethod.cod,
    )) {
      return;
    }

    setState(() => _placing = true);

    // One delivery charge per seller group, applied to the group's first line —
    // the same allocation the web checkout sends.
    final chargedGroups = <String>{};
    final itemsPayload = selected.map((item) {
      final group = item.deliveryGroupId;
      var fee = 0.0;
      if (!chargedGroups.contains(group)) {
        fee = selected
            .where((i) => i.deliveryGroupId == group)
            .map((i) => CartStore.deliveryInfoFor(i).fee)
            .fold(0.0, (a, b) => a > b ? a : b);
        chargedGroups.add(group);
      }
      return {
        'item_id': item.productId,
        'quantity': item.quantity,
        'size': item.size,
        'color': item.color,
        'variant_index': item.variantIndex,
        'total_price': item.lineTotal,
        'shipping_fee': fee,
        'reseller_ref': item.resellerRef,
        'resell_commission_percentage': item.resellCommissionPercentage,
      };
    }).toList();

    final shippingAddress = <String, dynamic>{
      ...address,
      'delivery_charge': CartStore.deliveryTotal,
      'total_discount': CartStore.totalDiscount,
      'items_subtotal': CartStore.selectedTotal,
      if (_method == PayMethod.walletManual)
        'manual_payment': {
          'seller_id': _manualSellerId,
          'transaction_id': _manualTxnController.text.trim(),
        },
    };

    final result = await Api.createBulkOrderDetailed({
      'items': itemsPayload,
      'shipping_address': jsonEncode(shippingAddress),
      'payment_method': _method.id,
      'total_order_price': CartStore.payableTotal,
      if (_transferId != null) 'wallet_transfer_id': _transferId,
    });

    if (!mounted) return;
    setState(() => _placing = false);

    if (result.error != null) {
      final message = result.error!;
      if (_isBalanceFailure(message)) {
        await _showBalanceError(CartStore.payableTotal);
      } else {
        await _showCheckoutError(
          title: 'ORDER ERROR',
          subtitle: 'ORDER COULD NOT BE PLACED',
          message: message,
          icon: Ionicons.alert_circle_outline,
        );
      }
      return;
    }

    final count = CartStore.selectedCount;
    final total = CartStore.payableTotal;

    // Manual payment settles one seller at a time, so only the paid lines
    // leave the bag; every other flow clears it.
    if (_method == PayMethod.walletManual) {
      await CartStore.removeMany(selected.map((i) => i.id));
    } else {
      await CartStore.clear();
    }

    if (!mounted) return;
    setState(() {
      _resetPayment();
      _method = PayMethod.cod;
      _addressView = false;
    });

    AppNotifications.success(
      'Order placed',
      '$count item${count == 1 ? '' : 's'} · ${_money(total)}'
          '${result.orderNumbers.isEmpty ? '' : ' · ${result.orderNumbers.join(', ')}'}',
    );
    await _showOrderPlaced(count, total, result.orderNumbers);
  }

  Future<bool> _validateCheckoutEligibility({bool validateCod = false}) async {
    final shippingError = CartStore.shippingValidationError();
    if (shippingError != null) {
      await _showCheckoutError(
        title: 'DELIVERY ERROR',
        subtitle: 'DELIVERY UNAVAILABLE',
        message: shippingError,
        icon: Ionicons.location_outline,
      );
      return false;
    }

    final selected = CartStore.selectedItems;
    final liveProducts = <int, Map<String, dynamic>>{};
    for (final productId in selected.map((item) => item.productId).toSet()) {
      final product = await Api.productById(productId);
      if (product != null) liveProducts[productId] = product;
    }
    if (!mounted) return false;

    for (final item in selected) {
      final product = liveProducts[item.productId];
      if (product == null) continue;
      final hasStockData =
          product.containsKey('stock') ||
          product.containsKey('quantity') ||
          product.containsKey('variants');
      final stock = CartStore.availableStock(
        product,
        size: item.size,
        variantIndex: item.variantIndex,
      );
      if (hasStockData && stock <= 0) {
        await _showCheckoutError(
          title: 'STOCK ERROR',
          subtitle: 'PRODUCT SOLD OUT',
          message: '${item.title} is no longer in stock.',
          icon: Ionicons.cube_outline,
        );
        return false;
      }
      if (hasStockData && stock > 0 && item.quantity > stock) {
        await _showCheckoutError(
          title: 'STOCK ERROR',
          subtitle: 'AVAILABLE QUANTITY CHANGED',
          message: 'Only $stock of ${item.title} can be ordered.',
          icon: Ionicons.cube_outline,
        );
        return false;
      }
    }

    if (validateCod) {
      final blocked = <String>[];
      for (final item in selected) {
        final live = liveProducts[item.productId];
        final methods = live == null
            ? CartStore.paymentMethodsFrom(item.paymentMethods)
            : CartStore.paymentMethodsFrom(
                live['payment_methods'] ?? live['payment_modes'],
              );
        if (!methods.contains('cod')) blocked.add(item.title);
      }
      if (blocked.isNotEmpty) {
        await _showCodUnavailable(blocked);
        return false;
      }
    }
    return true;
  }

  bool _isBalanceFailure(String message) {
    final normalized = message.toLowerCase();
    return normalized.contains('insufficient wallet') ||
        normalized.contains('insufficient balance') ||
        normalized.contains('not have enough funds');
  }

  Future<void> _showBalanceError(double requiredTotal) async {
    if (!mounted) return;
    final shortfall = (requiredTotal - Api.balance).clamp(0, double.infinity);
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.88),
      builder: (dialogContext) => Dialog(
        backgroundColor: const Color(0xFF080808),
        insetPadding: const EdgeInsets.symmetric(horizontal: 22),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: BorderSide(color: AppColors.likeRed.withOpacity(0.55)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _checkoutErrorIcon(Ionicons.wallet_outline),
              const SizedBox(height: 16),
              const Text(
                'BALANCE ERROR',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.4,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'YOUR GOOGER WALLET DOES NOT HAVE ENOUGH FUNDS TO AUTHORIZE THIS TRANSACTION.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 9,
                  height: 1.55,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1,
                  color: Colors.white.withOpacity(0.34),
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.025),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderWhite06),
                ),
                child: Column(
                  children: [
                    _errorAmountRow('CURRENT BALANCE', _money(Api.balance)),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 10),
                      child: Divider(height: 1, color: AppColors.borderWhite06),
                    ),
                    _errorAmountRow(
                      'SHORTFALL',
                      _money(shortfall.toDouble()),
                      danger: true,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              _DialogAction(
                label: 'TOP UP WALLET NOW',
                filled: true,
                onTap: () {
                  Navigator.pop(dialogContext);
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const TopUpScreen()),
                  );
                },
              ),
              const SizedBox(height: 8),
              _DialogAction(
                label: 'CANCEL',
                onTap: () => Navigator.pop(dialogContext),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showCodUnavailable(List<String> blocked) async {
    await _showCheckoutError(
      title: 'PAYMENT ERROR',
      subtitle: 'COD NOT AVAILABLE',
      message: blocked
          .map(
            (title) =>
                'This product is not available for Cash on Delivery: $title',
          )
          .join('\n'),
      icon: Ionicons.cash_outline,
      actionLabel: 'CHANGE PAYMENT METHOD',
    );
  }

  Future<void> _showCheckoutError({
    required String title,
    required String subtitle,
    required String message,
    required IconData icon,
    String actionLabel = 'OK',
  }) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.88),
      builder: (dialogContext) => Dialog(
        backgroundColor: const Color(0xFF080808),
        insetPadding: const EdgeInsets.symmetric(horizontal: 22),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: BorderSide(color: AppColors.likeRed.withOpacity(0.48)),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _checkoutErrorIcon(icon),
              const SizedBox(height: 15),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.4,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                  color: AppColors.likeRed.withOpacity(0.72),
                ),
              ),
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                constraints: const BoxConstraints(maxHeight: 150),
                padding: const EdgeInsets.all(13),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.025),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderWhite06),
                ),
                child: SingleChildScrollView(
                  child: Text(
                    message,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 9.5,
                      height: 1.55,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withOpacity(0.7),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              _DialogAction(
                label: actionLabel,
                filled: true,
                light: true,
                onTap: () => Navigator.pop(dialogContext),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _checkoutErrorIcon(IconData icon) => SizedBox(
    width: 58,
    height: 58,
    child: Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 58,
          height: 58,
          decoration: BoxDecoration(
            color: AppColors.likeRed.withOpacity(0.1),
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.likeRed.withOpacity(0.3)),
          ),
          child: Icon(icon, size: 25, color: Colors.white),
        ),
        Positioned(
          right: -1,
          top: -2,
          child: Container(
            width: 21,
            height: 21,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.likeRed,
              shape: BoxShape.circle,
            ),
            child: const Text(
              '!',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    ),
  );

  Widget _errorAmountRow(String label, String value, {bool danger = false}) =>
      Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 8.5,
                fontWeight: FontWeight.w600,
                fontStyle: FontStyle.italic,
                letterSpacing: 1,
                color: danger
                    ? AppColors.likeRed.withOpacity(0.7)
                    : Colors.white.withOpacity(0.28),
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: danger ? AppColors.likeRed : Colors.white.withOpacity(0.7),
            ),
          ),
        ],
      );

  Future<bool> _confirmCheckoutAction({
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: _cardBg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        title: Text(
          title,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            letterSpacing: 1.2,
            color: Colors.white,
          ),
        ),
        content: Text(
          message,
          style: TextStyle(
            fontSize: 11,
            height: 1.5,
            color: Colors.white.withOpacity(0.65),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('CANCEL'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return result == true;
  }

  Future<void> _showOrderPlaced(
    int count,
    double total,
    List<String> orderNumbers,
  ) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: _cardBg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: AppColors.borderWhite10),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 26, 22, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: _accentGreen.withOpacity(0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Ionicons.checkmark,
                  size: 26,
                  color: _accentGreen,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'ORDER PLACED',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 2,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '$count item${count == 1 ? '' : 's'} · ${_money(total)}',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 1,
                  color: Colors.white.withOpacity(0.45),
                ),
              ),
              if (orderNumbers.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  orderNumbers.join(', '),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                    color: Colors.white.withOpacity(0.3),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              _PrimaryButton(
                label: 'DONE',
                onTap: () {
                  Navigator.pop(dialogContext);
                  Navigator.maybePop(context);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _editAddress() async {
    final saved = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _AddressForm(initial: CartStore.address.value),
    );
    if (saved == null || !mounted) return;
    final error = await CartStore.saveAddress(saved);
    if (!mounted) return;
    if (error != null) {
      // The address still applies to this checkout; only the profile sync failed.
      AppNotifications.error('Address saved locally', error);
    } else {
      AppNotifications.success('Delivery address saved');
    }
    setState(() {});
  }
}

// ── small shared pieces ──────────────────────────────────────────────────────

class _Checkbox extends StatelessWidget {
  final bool value;
  final VoidCallback onTap;

  const _Checkbox({required this.value, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 19,
        height: 19,
        decoration: BoxDecoration(
          color: value ? Colors.white : Colors.transparent,
          borderRadius: BorderRadius.circular(5),
          border: Border.all(
            color: value ? Colors.white : Colors.white.withOpacity(0.22),
            width: 1.6,
          ),
        ),
        child: value
            ? const Icon(Ionicons.checkmark, size: 12, color: Colors.black)
            : null,
      ),
    );
  }
}

class _QtyStepper extends StatelessWidget {
  final int quantity;
  final VoidCallback onMinus;
  final VoidCallback onPlus;

  const _QtyStepper({
    required this.quantity,
    required this.onMinus,
    required this.onPlus,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 32,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.5),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _step(Ionicons.remove, onMinus),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            child: Text(
              '$quantity',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
          _step(Ionicons.add, onPlus),
        ],
      ),
    );
  }

  Widget _step(IconData icon, VoidCallback onTap) => GestureDetector(
    onTap: onTap,
    behavior: HitTestBehavior.opaque,
    child: SizedBox(
      width: 26,
      height: 30,
      child: Icon(icon, size: 14, color: Colors.white.withOpacity(0.75)),
    ),
  );
}

class _PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool enabled;

  /// Filled white pill (checkout / place order) vs outlined (in-panel actions).
  final bool filled;

  const _PrimaryButton({
    required this.label,
    required this.onTap,
    this.enabled = true,
    this.filled = true,
  });

  @override
  Widget build(BuildContext context) {
    final active = enabled;
    return Opacity(
      opacity: active ? 1 : 0.4,
      child: GestureDetector(
        onTap: active ? onTap : null,
        behavior: HitTestBehavior.opaque,
        child: Container(
          width: double.infinity,
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: filled ? const Color(0xFFF2F2F2) : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: filled ? Colors.transparent : AppColors.borderWhite10,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w600,
              letterSpacing: 2,
              color: filled ? Colors.black : Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}

class _DialogAction extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  final bool filled;
  final bool light;

  const _DialogAction({
    required this.label,
    required this.onTap,
    this.filled = false,
    this.light = false,
  });

  @override
  Widget build(BuildContext context) {
    final background = light
        ? const Color(0xFFF4F4F4)
        : filled
        ? AppColors.likeRed
        : Colors.white.withOpacity(0.045);
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: double.infinity,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(
            color: filled ? Colors.transparent : AppColors.borderWhite06,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
            color: light ? Colors.black : Colors.white,
          ),
        ),
      ),
    );
  }
}

/// Delivery address form. Field names match the web `AddressModal` exactly so
/// the same `shipping_address` JSON works in both clients.
class _AddressForm extends StatefulWidget {
  final Map<String, dynamic>? initial;

  const _AddressForm({this.initial});

  @override
  State<_AddressForm> createState() => _AddressFormState();
}

class _AddressFormState extends State<_AddressForm> {
  late final Map<String, TextEditingController> _controllers = {
    for (final field in _fields)
      field.key: TextEditingController(
        text: '${widget.initial?[field.key] ?? field.initial}',
      ),
  };

  static const _fields = <_Field>[
    _Field('firstName', 'First name'),
    _Field('lastName', 'Last name'),
    _Field('phone', 'Phone'),
    _Field('phone2', 'Second phone (optional)'),
    _Field('houseNo', 'House no'),
    _Field('street', 'Street name'),
    _Field('city', 'City'),
    _Field('district', 'District'),
    _Field('province', 'Province'),
    _Field('country', 'Country', initial: 'Sri Lanka'),
  ];

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  void _submit() {
    final values = {
      for (final entry in _controllers.entries)
        entry.key: entry.value.text.trim(),
    };
    if (values['firstName']!.isEmpty ||
        values['phone']!.isEmpty ||
        values['city']!.isEmpty ||
        values['country']!.isEmpty) {
      AppNotifications.error('Name, phone, city and country are required');
      return;
    }
    Navigator.pop(context, {
      ...?widget.initial,
      ...values,
      'addressMode': 'detailed',
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: _cardBg,
      insetPadding: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: const BorderSide(color: AppColors.borderWhite10),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.85,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 20, 20, 12),
              child: Row(
                children: [
                  Text(
                    'DELIVERY ADDRESS',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 2,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: _fields
                    .map(
                      (field) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: TextField(
                          controller: _controllers[field.key],
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: Colors.white,
                          ),
                          decoration: InputDecoration(
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 12,
                            ),
                            filled: true,
                            fillColor: Colors.white.withOpacity(0.03),
                            hintText: field.label,
                            hintStyle: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: Colors.white.withOpacity(0.2),
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(
                                color: AppColors.borderWhite10,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(
                                color: AppColors.borderWhite10,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(
                                color: _accentBlue.withOpacity(0.4),
                              ),
                            ),
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 18),
              child: Row(
                children: [
                  Expanded(
                    child: _PrimaryButton(
                      label: 'CANCEL',
                      filled: false,
                      onTap: () => Navigator.pop(context),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _PrimaryButton(label: 'SAVE', onTap: _submit),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Field {
  final String key;
  final String label;
  final String initial;

  const _Field(this.key, this.label, {this.initial = ''});
}
