import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import '../widgets/kit.dart';
import '../widgets/product_card.dart';
import 'home_tab.dart';

/// Tab shell: TopBar + Home / Shop / [Add] / Wallet / Chats bottom nav.
class ShellScreen extends StatefulWidget {
  const ShellScreen();

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int index = 0;

  static const tabs = [
    (icon: Icons.home_outlined, active: Icons.home, label: "Home"),
    (
      icon: Icons.shopping_bag_outlined,
      active: Icons.shopping_bag,
      label: "Shop"
    ),
    (
      icon: Icons.account_balance_wallet_outlined,
      active: Icons.account_balance_wallet,
      label: "Wallet"
    ),
    (icon: Icons.forum_outlined, active: Icons.forum, label: "Chats"),
  ];

  void _openCreateSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => const CreateActionSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      const HomeTab(),
      const ShopTab(),
      const WalletTab(),
      const ChatsTab()
    ];
    return Scaffold(
      appBar: GoogerTopBar(tabIndex: index),
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: GoogerColors.nav,
          border: Border(top: BorderSide(color: GoogerColors.border)),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 6),
            child: Row(children: [
              _tab(0),
              _tab(1),
              // handoff bottom nav: floating gradient circular Add button
              Expanded(
                child: GestureDetector(
                  onTap: _openCreateSheet,
                  behavior: HitTestBehavior.opaque,
                  child: Transform.translate(
                    offset: const Offset(0, -8),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: GoogerColors.addButtonGradient,
                          border: Border.all(color: Colors.white24, width: 1.5),
                          boxShadow: [
                            BoxShadow(
                                color: Colors.black.withValues(alpha: 0.5),
                                blurRadius: 10,
                                offset: const Offset(0, 4))
                          ],
                        ),
                        child: const Icon(Icons.add,
                            size: 21, color: GoogerColors.text),
                      ),
                      const SizedBox(height: 3),
                      const Text("Add",
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                              color: GoogerColors.dim)),
                    ]),
                  ),
                ),
              ),
              _tab(2),
              _tab(3),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _tab(int i) {
    final t = tabs[i];
    final active = index == i;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => index = i),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(active ? t.active : t.icon,
              size: 21, color: active ? GoogerColors.text : GoogerColors.dim),
          const SizedBox(height: 3),
          Text(t.label,
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: active ? GoogerColors.text : GoogerColors.dim)),
        ]),
      ),
    );
  }
}

/// Topbar — real Googer logo, search / cart / notifications / avatar.
class GoogerTopBar extends StatelessWidget implements PreferredSizeWidget {
  final int tabIndex;
  const GoogerTopBar({this.tabIndex = 0});

  @override
  Size get preferredSize => const Size.fromHeight(72);

  bool get _showSearch => tabIndex == 0 || tabIndex == 1;
  String get _hint => tabIndex == 0 ? "Search Googs" : "Search Googer";

  @override
  Widget build(BuildContext context) {
    return AppBar(
      toolbarHeight: 72,
      titleSpacing: 14,
      backgroundColor: Colors.black,
      title: Row(children: [
        Image.asset(
          "assets/images/googer.png",
          width: 38,
          height: 38,
          errorBuilder: (_, __, ___) =>
              const IconChip(Icons.play_arrow_rounded, size: 38),
        ),
        if (_showSearch) ...[
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 42,
              child: TextField(
                readOnly: true,
                onTap: () => Navigator.pushNamed(context, "/search"),
                decoration: InputDecoration(
                  hintText: _hint,
                  prefixIcon:
                      const Icon(Icons.search, size: 18, color: GoogerColors.dim),
                  filled: true,
                  fillColor: Colors.black,
                  contentPadding: EdgeInsets.zero,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: GoogerColors.line),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: GoogerColors.line),
                  ),
                ),
                style: const TextStyle(
                    fontSize: 13,
                    color: Colors.white,
                    fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ] else
          const Spacer(),
      ]),
      actions: [
        GestureDetector(
          onTap: () => Navigator.pushNamed(context, "/cart"),
          child: const Padding(
            padding: EdgeInsets.only(right: 18),
            child: Icon(Icons.shopping_cart_outlined,
                size: 22, color: Colors.white),
          ),
        ),
        GestureDetector(
          onTap: () => Navigator.pushNamed(context, "/notifications"),
          child: const Padding(
            padding: EdgeInsets.only(right: 14),
            child: Icon(Icons.notifications_none_rounded,
                size: 23, color: Colors.white),
          ),
        ),
        GestureDetector(
          onTap: () => Navigator.pushNamed(context, "/profile"),
          child: Padding(
            padding: const EdgeInsets.only(right: 14),
            child:
                GoogerAvatar(url: Api.avatar, name: Api.displayName, size: 38),
          ),
        ),
      ],
    );
  }
}

/// Create sheet: New Goog / Ad Campaign / Add Product / Upload Content.
class CreateActionSheet extends StatelessWidget {
  const CreateActionSheet();

  @override
  Widget build(BuildContext context) {
    final actions = [
      (
        label: "New Goog",
        icon: Icons.edit_outlined,
        tint: GoogerColors.sky,
        route: "/write-goog"
      ),
      (
        label: "Ad Campaign",
        icon: Icons.campaign_outlined,
        tint: GoogerColors.rose,
        route: "/ads"
      ),
      (
        label: "Add Product",
        icon: Icons.inventory_2_outlined,
        tint: GoogerColors.emerald,
        route: "/add-product"
      ),
      (
        label: "Upload Content",
        icon: Icons.cloud_upload_outlined,
        tint: GoogerColors.cyan,
        route: "/ads/upload-content"
      ),
    ];
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: const Color(0xF2171719),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: GoogerColors.line),
        ),
        child: GridView.count(
          shrinkWrap: true,
          crossAxisCount: 2,
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
          childAspectRatio: 2.1,
          physics: const NeverScrollableScrollPhysics(),
          children: actions.map((a) {
            return InkWell(
              onTap: () {
                Navigator.pop(context);
                Navigator.pushNamed(context, a.route);
              },
              borderRadius: BorderRadius.circular(16),
              child: Container(
                decoration: BoxDecoration(
                  color: GoogerColors.soft,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: a.tint.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Icon(a.icon, size: 17, color: a.tint),
                      ),
                      const SizedBox(height: 6),
                      Text(a.label,
                          style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w500,
                              color: GoogerColors.text,
                              letterSpacing: 0.3)),
                    ]),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

/* ──────────────── Home tab — Search Googs + topics + mixed real-time feed ──────────────── */

class HomeTab extends StatelessWidget {
  const HomeTab();

  @override
  Widget build(BuildContext context) => const LiveHomeTab();
}

/* ───────────────────────── Shop tab — live products + popup flow ───────────────────────── */

class ShopTab extends StatefulWidget {
  const ShopTab();

  @override
  State<ShopTab> createState() => _ShopTabState();
}

class _ShopTabState extends State<ShopTab> {
  String query = "";
  String? category;
  late Future<List<Product>> items = Api.shopProducts();
  final _shopCategories = const ["All", "Aaa", "Fashion", "Wow", "Electronics"];

  String _categoryForProduct(Product p) => p.category.trim().isEmpty ? "Aaa" : p.category;

  Widget _marketTabs() {
    final tabs = [
      (Icons.storefront_outlined, "Market", true),
      (Icons.sell_outlined, "My Listings", false),
      (Icons.shopping_cart_outlined, "My Orders", false),
    ];
    return Container(
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: GoogerColors.line)),
      ),
      child: Row(
        children: tabs.map((t) {
          return Expanded(
            child: Container(
              padding: const EdgeInsets.fromLTRB(8, 16, 8, 14),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: t.$3 ? Colors.white : Colors.transparent, width: 2),
                ),
              ),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(t.$1, size: 20, color: t.$3 ? Colors.white : GoogerColors.dim),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(t.$2,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: t.$3 ? 21 : 16,
                          fontWeight: FontWeight.w900,
                          color: t.$3 ? Colors.white : GoogerColors.dim)),
                ),
              ]),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _categoryChips(List<Product> products) {
    final dynamicCategories = products
        .map((p) => _categoryForProduct(p))
        .where((c) => c.isNotEmpty)
        .toSet()
        .take(5)
        .toList();
    final chips = ["All", ..._shopCategories.skip(1), ...dynamicCategories]
        .fold<List<String>>([], (acc, item) {
      if (!acc.contains(item)) acc.add(item);
      return acc;
    }).take(8).toList();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(8, 20, 8, 4),
      child: Row(
        children: chips.map((c) {
          final active = (category == null && c == "All") || category == c;
          return Padding(
            padding: const EdgeInsets.only(right: 10),
            child: GestureDetector(
              onTap: () => setState(() => category = c == "All" ? null : c),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
                decoration: BoxDecoration(
                  color: active ? Colors.white : GoogerColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: active ? Colors.white : GoogerColors.line),
                ),
                child: Text(c,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                        color: active ? Colors.black : GoogerColors.dim)),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Product>>(
      future: items,
      builder: (context, snap) {
        final all = snap.data ?? const <Product>[];
        final visible = all
            .where((p) =>
                (category == null || _categoryForProduct(p).toLowerCase() == category!.toLowerCase()) &&
                (query.isEmpty ||
                    p.title.toLowerCase().contains(query.toLowerCase())))
            .toList();
        return Container(
          color: Colors.black,
          child: ListView(padding: EdgeInsets.zero, children: [
            _marketTabs(),
            _categoryChips(all),
            if (snap.connectionState == ConnectionState.waiting)
              const SizedBox(
                height: 300,
                child: Center(
                  child: SizedBox(
                    width: 52,
                    height: 52,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                  ),
                ),
              )
            else ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 26, 16, 14),
                child: Row(children: const [
                  Expanded(
                    child: Text("RECOMMENDED FOR YOU",
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.5,
                            color: Colors.white)),
                  ),
                  IconChip(Icons.chevron_left, size: 32, color: Colors.white),
                  SizedBox(width: 6),
                  IconChip(Icons.chevron_right, size: 32, color: Colors.white),
                ]),
              ),
              if (visible.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 80),
                  child: EmptyState(
                      icon: Icons.inventory_2_outlined,
                      title: "No products found",
                      subtitle: "Products from the real market will appear here."),
                )
              else
                GridView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 14,
                    crossAxisSpacing: 14,
                    childAspectRatio: 0.60,
                  ),
                  itemCount: visible.length,
                  itemBuilder: (_, i) => ProductCard(visible[i]),
                ),
            ],
          ]),
        );
      },
    );
  }
}

/* ───────────────────── Wallet tab — fintech card UI (Binance/Bybit style) ───────────────────── */

const _binanceYellow = GoogerColors.gold; // handoff accentGold

class _ScreenshotWalletTab extends StatelessWidget {
  const _ScreenshotWalletTab();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 24),
      children: [
        Row(children: const [
          Text("Estimated Balance",
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: GoogerColors.dim)),
          SizedBox(width: 5),
          Icon(Icons.visibility_outlined, size: 13, color: GoogerColors.dim),
          SizedBox(width: 3),
          Icon(Icons.chevron_right, size: 13, color: GoogerColors.dim),
        ]),
        const SizedBox(height: 9),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: const [
          Text("9,612.00",
              style: TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.8,
                  color: Colors.white)),
          SizedBox(width: 7),
          Padding(
            padding: EdgeInsets.only(bottom: 4),
            child: Text("RC",
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: GoogerColors.dim)),
          ),
        ]),
        const SizedBox(height: 4),
        const Text("≈ R 9,612.00",
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: GoogerColors.dim)),
        const SizedBox(height: 22),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: const [
            _WalletAction(Icons.arrow_upward, "Top Up"),
            _WalletAction(Icons.arrow_downward, "Withdraw"),
            _WalletAction(Icons.swap_horiz, "Transfer"),
            _WalletAction(Icons.receipt_long_outlined, "History"),
          ],
        ),
        const SizedBox(height: 18),
        Container(
          decoration: BoxDecoration(
              color: GoogerColors.surface,
              borderRadius: BorderRadius.circular(14)),
          child: Column(children: const [
            _WalletAssetRow(
              iconText: "R",
              iconColor: _binanceYellow,
              title: "Rupier Coin",
              subtitle: "Available",
              amount: "9,612.00",
              subAmount: "≈ R 9,612.00",
            ),
            Divider(height: 1, color: GoogerColors.borderSoft),
            _WalletAssetRow(
              icon: Icons.campaign_outlined,
              iconColor: GoogerColors.dim,
              title: "Ad Center",
              subtitle: "2 ads running",
              trailing: _LivePill(),
            ),
          ]),
        ),
        const SizedBox(height: 15),
        const Text("MORE SERVICES",
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w900,
                color: GoogerColors.dim)),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
              color: GoogerColors.surface,
              borderRadius: BorderRadius.circular(14)),
          child: Column(children: const [
            _ServiceRow(Icons.verified_user_outlined, "Get Verified"),
            Divider(height: 1, color: GoogerColors.borderSoft),
            _ServiceRow(Icons.card_membership_outlined, "Subscription"),
          ]),
        ),
        const SizedBox(height: 24),
        const Padding(
          padding: EdgeInsets.only(left: 10),
          child: Text("Refer & Earn",
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  color: Colors.white)),
        ),
        const Padding(
          padding: EdgeInsets.only(left: 10, top: 4),
          child: Text("Share your link and get rewarded.",
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  color: GoogerColors.dim)),
        ),
        const SizedBox(height: 9),
        Align(
          alignment: Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.only(left: 10),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
                color: Colors.white, borderRadius: BorderRadius.circular(999)),
            child: const Text("Learn more",
                style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF111111))),
          ),
        ),
        const SizedBox(height: 24),
        Row(children: const [
          Text("RECENT ACTIVITY",
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  color: GoogerColors.dim)),
          Spacer(),
          Text("See all",
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: GoogerColors.dim)),
        ]),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
              color: GoogerColors.surface,
              borderRadius: BorderRadius.circular(14)),
          child: const Column(children: [
            _ActivityRow(
              initial: "B",
              avatarColor: GoogerColors.purple,
              title: "Ben Wayne",
              subtitle: "Thanks for the dinner! · 1:22 PM",
              amount: "+R 128.00",
              amountColor: GoogerColors.green,
            ),
            Divider(height: 1, color: GoogerColors.borderSoft),
            _ActivityRow(
              initial: "C",
              avatarColor: GoogerColors.pink,
              title: "Carhartt",
              subtitle: "Dubai Mall · 12:45 PM",
              amount: "R 234.00",
              amountColor: Colors.white,
            ),
          ]),
        ),
      ],
    );
  }
}

class _WalletAction extends StatelessWidget {
  final IconData icon;
  final String label;
  const _WalletAction(this.icon, this.label);

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Container(
        width: 44,
        height: 44,
        decoration: const BoxDecoration(
            color: GoogerColors.surface, shape: BoxShape.circle),
        child: Icon(icon, size: 18, color: Colors.white70),
      ),
      const SizedBox(height: 8),
      Text(label,
          style: const TextStyle(
              fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white)),
    ]);
  }
}

class _WalletAssetRow extends StatelessWidget {
  final IconData? icon;
  final String? iconText;
  final Color iconColor;
  final String title;
  final String subtitle;
  final String? amount;
  final String? subAmount;
  final Widget? trailing;

  const _WalletAssetRow({
    this.icon,
    this.iconText,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    this.amount,
    this.subAmount,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
      child: Row(children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.18), shape: BoxShape.circle),
          alignment: Alignment.center,
          child: iconText != null
              ? Text(iconText!,
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: iconColor))
              : Icon(icon, size: 16, color: iconColor),
        ),
        const SizedBox(width: 12),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: GoogerColors.text)),
            Text(subtitle,
                style: const TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w600,
                    color: GoogerColors.dim)),
          ]),
        ),
        if (trailing != null)
          trailing!
        else
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(amount ?? "",
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: Colors.white)),
            Text(subAmount ?? "",
                style: const TextStyle(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w600,
                    color: GoogerColors.dim)),
          ]),
        const SizedBox(width: 6),
        const Icon(Icons.chevron_right, size: 15, color: GoogerColors.faint),
      ]),
    );
  }
}

class _LivePill extends StatelessWidget {
  const _LivePill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
          color: GoogerColors.green.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(999)),
      child: const Text("LIVE",
          style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.w900,
              color: GoogerColors.green)),
    );
  }
}

class _ServiceRow extends StatelessWidget {
  final IconData icon;
  final String title;
  const _ServiceRow(this.icon, this.title);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 13, 8, 13),
      child: Row(children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
              color: GoogerColors.gold.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(8)),
          child: Icon(icon, size: 15, color: GoogerColors.gold),
        ),
        const SizedBox(width: 12),
        Expanded(
            child: Text(title,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: GoogerColors.text))),
        const Icon(Icons.chevron_right, size: 15, color: GoogerColors.faint),
      ]),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final String initial;
  final Color avatarColor;
  final String title;
  final String subtitle;
  final String amount;
  final Color amountColor;
  const _ActivityRow({
    required this.initial,
    required this.avatarColor,
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.amountColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
      child: Row(children: [
        CircleAvatar(
          radius: 16,
          backgroundColor: avatarColor,
          child: Text(initial,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  color: Colors.white)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                    color: GoogerColors.text)),
            Text(subtitle,
                style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: GoogerColors.dim)),
          ]),
        ),
        Text(amount,
            style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w900,
                color: amountColor)),
      ]),
    );
  }
}

class WalletTab extends StatelessWidget {
  const WalletTab();

  @override
  Widget build(BuildContext context) => const _ScreenshotWalletTab();
}

// ignore: unused_element
class _OldWalletTabState extends State<StatefulWidget> {
  bool hideBalance = false;
  late Future<List<Tx>> history = Api.walletHistory();

  static const services = [
    (Icons.receipt_long_outlined, "History", "/wallet/transactions"),
    (Icons.verified_outlined, "Verify", "/wallet/verification"),
    (Icons.card_membership_outlined, "Plans", "/wallet/subscription"),
    (Icons.campaign_outlined, "Ads", "/wallet/ad-center"),
    (Icons.toll_outlined, "Coins", "/wallet/coins"),
    (Icons.sell_outlined, "Sell", "/wallet/sell"),
    (Icons.call_received, "Request", "/wallet/request"),
    (Icons.account_balance_wallet_outlined, "Details", "/wallet/my-wallet"),
  ];

  @override
  Widget build(BuildContext context) {
    final balanceText =
        hideBalance ? "••••••" : "R ${Api.balance.toStringAsFixed(2)}";
    return FutureBuilder<List<Tx>>(
      future: history,
      builder: (context, snap) {
        final txs = (snap.data ?? const <Tx>[]).take(3).toList();
        return RefreshIndicator(
          color: GoogerColors.red,
          backgroundColor: GoogerColors.surface,
          onRefresh: () async {
            await Api.refreshProfile();
            setState(() => history = Api.walletHistory());
          },
          child: ListView(padding: const EdgeInsets.all(16), children: [
            const Overline("Wallet", color: GoogerColors.dim),
            const SizedBox(height: 10),
            // ── Big balance card (fintech reference) ──
            GlowCard(
              height: 172,
              glow: _binanceYellow,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Text(balanceText,
                            style: const TextStyle(
                                fontSize: 30,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.8,
                                color: Colors.white)),
                        const SizedBox(width: 10),
                        GestureDetector(
                          onTap: () =>
                              setState(() => hideBalance = !hideBalance),
                          child: Icon(
                              hideBalance
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                              size: 17,
                              color: Colors.white54),
                        ),
                        const Spacer(),
                        const Icon(Icons.credit_card,
                            size: 26, color: Colors.white70),
                      ]),
                      const SizedBox(height: 4),
                      Text("Googer ID · ${Api.googerId}",
                          style: const TextStyle(
                              fontSize: 11.5, color: Colors.white54)),
                      const Spacer(),
                      Row(children: [
                        _cardAction("Deposit", Icons.add,
                            filled: true,
                            onTap: () =>
                                Navigator.pushNamed(context, "/wallet/topup")),
                        const SizedBox(width: 8),
                        _cardAction("Withdraw", Icons.arrow_downward,
                            onTap: () => Navigator.pushNamed(
                                context, "/wallet/withdrawal")),
                        const SizedBox(width: 8),
                        _cardAction("Transfer", Icons.swap_horiz,
                            onTap: () =>
                                Navigator.pushNamed(context, "/wallet/pay")),
                      ]),
                    ]),
              ),
            ),
            const SizedBox(height: 14),
            // ── tiles row: Transactions | Cashback ──
            Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(
                child: GoogerCard(
                  padding: const EdgeInsets.all(14),
                  onTap: () =>
                      Navigator.pushNamed(context, "/wallet/transactions"),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("Transactions",
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: GoogerColors.text)),
                        const SizedBox(height: 2),
                        Text("${txs.length} recent",
                            style: const TextStyle(
                                fontSize: 10.5, color: GoogerColors.dim)),
                        const SizedBox(height: 12),
                        Row(
                          children: txs.map((tx) {
                            final out =
                                tx.type == "sent" || tx.type == "withdrawal";
                            return Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: Container(
                                width: 30,
                                height: 30,
                                decoration: BoxDecoration(
                                  color: (out
                                          ? GoogerColors.red
                                          : GoogerColors.green)
                                      .withValues(alpha: 0.14),
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                    out
                                        ? Icons.arrow_upward
                                        : Icons.arrow_downward,
                                    size: 14,
                                    color: out
                                        ? const Color(0xFFF87171)
                                        : GoogerColors.green),
                              ),
                            );
                          }).toList(),
                        ),
                      ]),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GoogerCard(
                  padding: const EdgeInsets.all(14),
                  onTap: () => Navigator.pushNamed(context, "/wallet/coins"),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text("Cashback",
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: GoogerColors.text)),
                        const SizedBox(height: 2),
                        const Text("Rupier coins earned",
                            style: TextStyle(
                                fontSize: 10.5, color: GoogerColors.dim)),
                        const SizedBox(height: 12),
                        Row(children: [
                          _dot(_binanceYellow, "R"),
                          _dot(GoogerColors.greenDeep, "+"),
                          _dot(const Color(0xFF7C3AED), "%"),
                        ]),
                      ]),
                ),
              ),
            ]),
            const SizedBox(height: 18),
            // ── All services grid ──
            Row(children: const [
              Overline("All services", color: GoogerColors.dim),
              Spacer(),
              Icon(Icons.chevron_right, size: 16, color: GoogerColors.dim),
            ]),
            const SizedBox(height: 10),
            GoogerCard(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 4,
                mainAxisSpacing: 16,
                childAspectRatio: 1.15,
                children: services.map((s) {
                  return GestureDetector(
                    onTap: () => Navigator.pushNamed(context, s.$3),
                    child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(s.$1, size: 22, color: GoogerColors.text),
                          const SizedBox(height: 6),
                          Text(s.$2,
                              style: const TextStyle(
                                  fontSize: 10, color: GoogerColors.muted)),
                        ]),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 14),
            // ── Assets (Binance style) ──
            const Overline("Assets", color: GoogerColors.dim),
            const SizedBox(height: 10),
            GoogerCard(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Column(children: [
                _asset("Rupier Coin", "RPC", Api.balance, _binanceYellow, "R"),
                const Divider(),
                _asset("Sri Lankan Rupee", "LKR", Api.balance,
                    GoogerColors.green, "₨"),
              ]),
            ),
            const SizedBox(height: 14),
            // ── Refer and Earn banner ──
            GoogerCard(
              onTap: () => Navigator.pushNamed(context, "/wallet/my-wallet"),
              child: Row(children: [
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text("Refer and Earn",
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: GoogerColors.text)),
                        SizedBox(height: 4),
                        Text(
                            "Invite a friend with your Googer ID and earn Rupier coins on their first top-up.",
                            style: TextStyle(
                                fontSize: 11,
                                height: 1.5,
                                color: GoogerColors.dim)),
                        SizedBox(height: 8),
                        Text("Learn more",
                            style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: _binanceYellow)),
                      ]),
                ),
                const SizedBox(width: 12),
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: _binanceYellow.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.card_giftcard,
                      size: 24, color: _binanceYellow),
                ),
              ]),
            ),
            const SizedBox(height: 24),
          ]),
        );
      },
    );
  }

  Widget _cardAction(String label, IconData icon,
      {bool filled = false, required VoidCallback onTap}) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color:
                filled ? _binanceYellow : Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon,
                size: 14,
                color: filled ? const Color(0xFF181A20) : Colors.white),
            const SizedBox(width: 5),
            Text(label,
                style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: filled ? const Color(0xFF181A20) : Colors.white)),
          ]),
        ),
      ),
    );
  }

  Widget _dot(Color color, String glyph) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
            color: color.withValues(alpha: 0.16), shape: BoxShape.circle),
        alignment: Alignment.center,
        child: Text(glyph,
            style: TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700, color: color)),
      ),
    );
  }

  Widget _asset(
      String name, String symbol, double amount, Color color, String glyph) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
          alignment: Alignment.center,
          child: Text(glyph,
              style: TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w600, color: color)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(symbol,
                style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: GoogerColors.text)),
            Text(name,
                style:
                    const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(hideBalance ? "••••" : amount.toStringAsFixed(2),
              style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: GoogerColors.text)),
          Text(hideBalance ? "" : "≈ \$${(amount / 300).toStringAsFixed(2)}",
              style: const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
        ]),
      ]),
    );
  }
}
/* ───────────────────── Chats tab — Instagram DM style ───────────────────── */

class ChatsTab extends StatefulWidget {
  const ChatsTab();

  @override
  State<ChatsTab> createState() => _ChatsTabState();
}

class _ChatsTabState extends State<ChatsTab> {
  String query = "";
  late Future<List<Conversation>> convos = Api.chats();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Conversation>>(
      future: convos,
      builder: (context, snap) {
        final all = snap.data ?? const <Conversation>[];
        final visible = all
            .where((c) =>
                query.isEmpty ||
                c.name.toLowerCase().contains(query.toLowerCase()) ||
                c.username.contains(query.toLowerCase()))
            .toList();
        final online = all.where((c) => c.online).toList();
        return ListView(children: [
          // IG-style header: username with chevron + new message
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
            child: Row(children: [
              Text(Api.username, style: Theme.of(context).textTheme.titleLarge),
              const Icon(Icons.keyboard_arrow_down,
                  size: 20, color: GoogerColors.text),
              const Spacer(),
              const Icon(Icons.edit_square, size: 20, color: GoogerColors.text),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: TextField(
              onChanged: (v) => setState(() => query = v),
              decoration: const InputDecoration(
                hintText: "Search",
                prefixIcon:
                    Icon(Icons.search, size: 18, color: GoogerColors.dim),
              ),
              style: const TextStyle(fontSize: 13, color: GoogerColors.text),
            ),
          ),
          // IG "active now" avatar strip
          if (online.isNotEmpty) ...[
            const SizedBox(height: 14),
            SizedBox(
              height: 84,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                scrollDirection: Axis.horizontal,
                itemCount: online.length,
                separatorBuilder: (_, __) => const SizedBox(width: 16),
                itemBuilder: (_, i) {
                  final c = online[i];
                  return GestureDetector(
                    onTap: () =>
                        Navigator.pushNamed(context, "/chat", arguments: c),
                    child: Column(children: [
                      GoogerAvatar(
                          url: c.img, name: c.name, size: 56, online: true),
                      const SizedBox(height: 5),
                      SizedBox(
                        width: 60,
                        child: Text(c.username,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 10, color: GoogerColors.muted)),
                      ),
                    ]),
                  );
                },
              ),
            ),
          ],
          const Padding(
            padding: EdgeInsets.fromLTRB(18, 12, 18, 4),
            child: Text("Messages",
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: GoogerColors.text)),
          ),
          ...visible.map((c) => InkWell(
                onTap: () =>
                    Navigator.pushNamed(context, "/chat", arguments: c),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                  child: Row(children: [
                    GoogerAvatar(
                        url: c.img, name: c.name, size: 52, online: c.online),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: c.unread > 0
                                        ? FontWeight.w600
                                        : FontWeight.w500,
                                    color: GoogerColors.text)),
                            const SizedBox(height: 3),
                            Text("${c.last} · ${c.time}",
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: c.unread > 0
                                        ? GoogerColors.text
                                        : GoogerColors.dim,
                                    fontWeight: c.unread > 0
                                        ? FontWeight.w500
                                        : FontWeight.w400)),
                          ]),
                    ),
                    if (c.unread > 0)
                      Container(
                        margin: const EdgeInsets.only(right: 12),
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                            color: Color(0xFF3797F0), shape: BoxShape.circle),
                      ),
                    const Icon(Icons.camera_alt_outlined,
                        size: 21, color: GoogerColors.dim),
                  ]),
                ),
              )),
          const SizedBox(height: 20),
        ]);
      },
    );
  }
}
