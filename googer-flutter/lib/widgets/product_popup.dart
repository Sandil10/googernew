import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import 'kit.dart';
import 'share_sheet.dart';

/// Product quick-view — mirrors the web ShopProductSecondViewModal:
/// header (avatar · name · time · SUBSCRIBE · ✕ · ⋮), media with the right-side
/// icon rail (heart/eye/comment/share + counts), title, category, description box,
/// price + old price + QTY stepper, colors, sizes, delivery time, returns &
/// warranty, ships-to, sticky total bar and the order form flow.
void showProductPopup(BuildContext context, Product product) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ProductPopup(product),
  );
}

class _ProductPopup extends StatefulWidget {
  final Product product;
  const _ProductPopup(this.product);

  @override
  State<_ProductPopup> createState() => _ProductPopupState();
}

class _ProductPopupState extends State<_ProductPopup> {
  int qty = 1;
  bool ordering = false;
  bool subscribed = false;
  late bool liked = widget.product.liked;
  late int likes = widget.product.likes;
  String size = "STANDARD";
  final name = TextEditingController();
  final phone = TextEditingController();
  final address = TextEditingController();

  String _fmt(int n) => n > 999 ? "${(n / 1000).toStringAsFixed(1)}k" : "$n";

  @override
  void initState() {
    super.initState();
    // count a product view once when the popup opens (web logs on quick-view)
    Api.markProductView(widget.product.id);
  }

  /// Comments thread — GET/POST /market/{id}/comments, like the web product modal.
  void _showComments() {
    final input = TextEditingController();
    Future<List<Map<String, dynamic>>> future = Api.productComments(widget.product.id);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StatefulBuilder(
        builder: (sheetCtx, setSheet) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.of(sheetCtx).viewInsets.bottom),
          child: Container(
            height: MediaQuery.of(sheetCtx).size.height * 0.6,
            decoration: const BoxDecoration(
              color: GoogerColors.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(children: [
              Container(
                width: 38,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(color: GoogerColors.soft10, borderRadius: BorderRadius.circular(2)),
              ),
              const Text("Comments", style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: GoogerColors.text)),
              const SizedBox(height: 8),
              Expanded(
                child: FutureBuilder<List<Map<String, dynamic>>>(
                  future: future,
                  builder: (context, snap) {
                    if (snap.connectionState == ConnectionState.waiting) {
                      return const Center(child: GoogerSpinner(size: 30));
                    }
                    final list = snap.data ?? [];
                    if (list.isEmpty) {
                      return const Center(
                          child: Text("No comments yet — be the first!",
                              style: TextStyle(fontSize: 12, color: GoogerColors.dim)));
                    }
                    return ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: list.length,
                      itemBuilder: (_, i) {
                        final c = list[i];
                        final user = (c["username"] ?? c["full_name"] ?? "googer").toString();
                        final text = (c["text"] ?? c["comment"] ?? "").toString();
                        final time = (c["created_at"] ?? "").toString().split("T").first;
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            GoogerAvatar(url: null, name: user, size: 32),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Row(children: [
                                  Text("@$user",
                                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: GoogerColors.text)),
                                  const SizedBox(width: 6),
                                  Text(time, style: const TextStyle(fontSize: 9, color: GoogerColors.dim)),
                                ]),
                                const SizedBox(height: 3),
                                Text(text, style: const TextStyle(fontSize: 12.5, height: 1.4, color: GoogerColors.muted)),
                              ]),
                            ),
                          ]),
                        );
                      },
                    );
                  },
                ),
              ),
              Container(
                decoration: const BoxDecoration(border: Border(top: BorderSide(color: GoogerColors.borderSoft))),
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
                child: SafeArea(
                  top: false,
                  child: Row(children: [
                    Expanded(
                      child: TextField(
                        controller: input,
                        decoration: InputDecoration(
                          hintText: "Add a comment…",
                          fillColor: GoogerColors.soft6,
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(20),
                              borderSide: const BorderSide(color: GoogerColors.line)),
                          enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(20),
                              borderSide: const BorderSide(color: GoogerColors.line)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        ),
                        style: const TextStyle(fontSize: 13, color: GoogerColors.text),
                      ),
                    ),
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: () async {
                        final text = input.text.trim();
                        if (text.isEmpty) return;
                        input.clear();
                        final ok = await Api.addProductComment(widget.product.id, text);
                        if (ok) {
                          setSheet(() => future = Api.productComments(widget.product.id));
                        } else if (sheetCtx.mounted) {
                          ScaffoldMessenger.of(sheetCtx).showSnackBar(
                            const SnackBar(content: Text("Log in to comment"), behavior: SnackBarBehavior.floating),
                          );
                        }
                      },
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                        child: const Icon(Icons.send, size: 15, color: Color(0xFF111111)),
                      ),
                    ),
                  ]),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final total = p.price * qty;
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      minChildSize: 0.55,
      maxChildSize: 0.96,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          color: GoogerColors.surfaceStrong,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(children: [
          Expanded(
            child: ListView(controller: scroll, padding: EdgeInsets.zero, children: [
              const SizedBox(height: 8),
              // ── header: avatar · name · time · SUBSCRIBE · ✕ · ⋮ ──
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 6, 10, 10),
                child: Row(children: [
                  GoogerAvatar(url: null, name: p.seller, size: 38),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(p.seller, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: GoogerColors.text)),
                      const Text("3 M", style: TextStyle(fontSize: 10, color: GoogerColors.dim)),
                    ]),
                  ),
                  GestureDetector(
                    onTap: () => setState(() => subscribed = !subscribed),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: subscribed ? GoogerColors.soft10 : Colors.white,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(subscribed ? "SUBSCRIBED" : "SUBSCRIBE",
                          style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.8,
                              color: subscribed ? GoogerColors.text : const Color(0xFF111111))),
                    ),
                  ),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: const Icon(Icons.close, size: 22, color: GoogerColors.text),
                  ),
                  const SizedBox(width: 12),
                  const Icon(Icons.more_vert, size: 20, color: GoogerColors.text),
                  const SizedBox(width: 4),
                ]),
              ),
              if (!ordering) ...[
                // ── media + right icon rail ──
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: AspectRatio(
                      aspectRatio: 1.45,
                      child: Stack(fit: StackFit.expand, children: [
                        Image.network(p.image, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(color: GoogerColors.soft6)),
                        // right-side rail: heart / eye / comment / share + counts
                        Positioned(
                          right: 8,
                          top: 8,
                          bottom: 8,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.45),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Column(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                              _rail(liked ? Icons.favorite : Icons.favorite_border, _fmt(likes),
                                  color: liked ? GoogerColors.red : Colors.white,
                                  onTap: () {
                                    setState(() {
                                      liked = !liked;
                                      likes += liked ? 1 : -1;
                                    });
                                    Api.toggleProductLike(p.id);
                                  }),
                              _rail(Icons.remove_red_eye_outlined, _fmt(p.views)),
                              _rail(Icons.mode_comment_outlined, _fmt(p.comments), onTap: _showComments),
                              _rail(Icons.share_outlined, _fmt(p.shares), onTap: () {
                                Api.shareProduct(p.id);
                                showShareSheet(context,
                                    title: p.title, url: "https://googer.site/product/${p.id}");
                              }),
                            ]),
                          ),
                        ),
                      ]),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    // title + category
                    Text(p.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, height: 1.25, color: GoogerColors.text)),
                    const SizedBox(height: 5),
                    Overline(p.category, color: const Color(0xFF7B8FB8)),
                    const SizedBox(height: 12),
                    // description box
                    if (p.description.isNotEmpty)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF11151D),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: GoogerColors.line),
                        ),
                        child: Text(p.description, style: const TextStyle(fontSize: 13, height: 1.5, color: GoogerColors.text)),
                      ),
                    const SizedBox(height: 16),
                    // RUPIEER price row + QTY stepper
                    const Overline("Rupieer", color: Color(0xFF7B8FB8)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: GoogerColors.soft,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: GoogerColors.line),
                      ),
                      child: Row(children: [
                        Container(width: 6, height: 6, decoration: const BoxDecoration(color: GoogerColors.text, shape: BoxShape.circle)),
                        const SizedBox(width: 10),
                        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(p.price.toStringAsFixed(2),
                              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4, color: GoogerColors.text)),
                          if (p.oldPrice != null)
                            Text("R ${p.oldPrice!.toStringAsFixed(2)}",
                                style: const TextStyle(fontSize: 11.5, color: GoogerColors.red, decoration: TextDecoration.lineThrough, decorationColor: GoogerColors.red)),
                        ]),
                        const Spacer(),
                        Column(crossAxisAlignment: CrossAxisAlignment.end, children: const [
                          Overline("Qty", color: GoogerColors.dim),
                          SizedBox(height: 2),
                          Text("1 IN STOCK", style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: GoogerColors.sky)),
                        ]),
                        const SizedBox(width: 12),
                        Container(
                          decoration: BoxDecoration(
                            color: GoogerColors.soft6,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: GoogerColors.line),
                          ),
                          child: Row(children: [
                            _qtyBtn(Icons.remove, () => setState(() => qty = qty > 1 ? qty - 1 : 1)),
                            SizedBox(width: 30, child: Text("$qty", textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: GoogerColors.text))),
                            _qtyBtn(Icons.add, () => setState(() => qty++)),
                          ]),
                        ),
                      ]),
                    ),
                    const SizedBox(height: 16),
                    // colors + sizes
                    Row(children: [
                      const Overline("Available Colors", color: Color(0xFF7B8FB8)),
                      const Spacer(),
                      Text(size, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: GoogerColors.dim)),
                    ]),
                    const SizedBox(height: 8),
                    Row(children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.network(p.image, width: 44, height: 44, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(width: 44, height: 44, color: GoogerColors.soft6)),
                      ),
                      const SizedBox(width: 10),
                      _whitePill("COLORS"),
                    ]),
                    const SizedBox(height: 14),
                    Row(children: [
                      const Overline("Sizes", color: Color(0xFF7B8FB8)),
                      const SizedBox(width: 14),
                      Expanded(
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            children: ["STANDARD", "S", "M", "L", "XL"].map((s) {
                              final active = size == s;
                              return Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: GestureDetector(
                                  onTap: () => setState(() => size = s),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                    decoration: BoxDecoration(
                                      color: active ? Colors.white : GoogerColors.soft6,
                                      borderRadius: BorderRadius.circular(999),
                                      border: Border.all(color: active ? Colors.white : GoogerColors.line),
                                    ),
                                    child: Text(s,
                                        style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            letterSpacing: 0.6,
                                            color: active ? const Color(0xFF111111) : GoogerColors.muted)),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 16),
                    // delivery time
                    Row(children: const [
                      Overline("Delivery Time", color: Color(0xFF7B8FB8)),
                      Spacer(),
                      Text("JUL 11 - JUL 16 DELIVERY",
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: GoogerColors.text)),
                    ]),
                    const SizedBox(height: 12),
                    // returns & warranty / ships to
                    Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: GoogerColors.soft,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: GoogerColors.line),
                          ),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                            Overline("Returns & Warranty", color: GoogerColors.dim),
                            SizedBox(height: 6),
                            Text("14 DAYS RETURN", style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: GoogerColors.text)),
                            SizedBox(height: 2),
                            Text("NO WARRANTY", style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: GoogerColors.dim)),
                          ]),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                            Overline("Ships To", color: Colors.black54),
                            SizedBox(height: 6),
                            Text("SRI LANKA", style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Color(0xFF111111))),
                          ]),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 16),
                    // actions
                    Row(children: [
                      GestureDetector(
                        onTap: () => Navigator.pushNamed(context, "/chat", arguments: conversations.first.username),
                        child: const IconChip(Icons.chat_bubble_outline, size: 46, color: GoogerColors.text),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () {
                            Navigator.pop(context);
                            Navigator.pushNamed(context, "/cart");
                          },
                          child: const Text("Add to Cart"),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        flex: 2,
                        child: FilledButton(
                          onPressed: () => setState(() => ordering = true),
                          child: const Text("Buy Now"),
                        ),
                      ),
                    ]),
                  ]),
                ),
              ] else ...[
                // ── order form ──
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      GestureDetector(
                        onTap: () => setState(() => ordering = false),
                        child: const Icon(Icons.arrow_back, size: 20, color: GoogerColors.text),
                      ),
                      const SizedBox(width: 12),
                      const Text("Delivery Details", style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                    ]),
                    const SizedBox(height: 16),
                    GoogerCard(
                      padding: const EdgeInsets.all(12),
                      child: Row(children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(p.image, width: 46, height: 46, fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(width: 46, height: 46, color: GoogerColors.soft6)),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: GoogerColors.text))),
                        Text("×$qty · R ${total.toStringAsFixed(0)}", style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                      ]),
                    ),
                    const SizedBox(height: 16),
                    const Overline("Full Name"),
                    const SizedBox(height: 6),
                    TextField(controller: name, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "Receiver's name"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
                    const SizedBox(height: 12),
                    const Overline("Phone"),
                    const SizedBox(height: 6),
                    TextField(controller: phone, keyboardType: TextInputType.phone, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "07X XXX XXXX"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
                    const SizedBox(height: 12),
                    const Overline("Delivery Address"),
                    const SizedBox(height: 6),
                    TextField(controller: address, maxLines: 3, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "Street, city, postal code"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: name.text.isNotEmpty && phone.text.isNotEmpty && address.text.isNotEmpty
                          ? () {
                              Navigator.pop(context);
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                                content: Text("Order placed — R ${total.toStringAsFixed(0)} paid from wallet"),
                                behavior: SnackBarBehavior.floating,
                              ));
                            }
                          : null,
                      child: Text("Place Order · R ${total.toStringAsFixed(0)}"),
                    ),
                  ]),
                ),
              ],
              const SizedBox(height: 12),
            ]),
          ),
          // sticky total bar (like the web modal footer)
          if (!ordering)
            Container(
              decoration: const BoxDecoration(
                color: GoogerColors.nav,
                border: Border(top: BorderSide(color: GoogerColors.border)),
              ),
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
              child: SafeArea(
                top: false,
                child: Row(children: [
                  Container(
                    width: 30,
                    height: 30,
                    decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                    alignment: Alignment.center,
                    child: const Text("N", style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF111111))),
                  ),
                  const SizedBox(width: 10),
                  Overline("Rupieer", color: GoogerColors.text),
                  const Spacer(),
                  Text(total.toStringAsFixed(2),
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.4, color: GoogerColors.text)),
                ]),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _rail(IconData icon, String count, {Color color = Colors.white, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 19, color: color),
        const SizedBox(height: 2),
        Text(count, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Colors.white)),
      ]),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Padding(padding: const EdgeInsets.all(8), child: Icon(icon, size: 15, color: GoogerColors.text)),
    );
  }

  Widget _whitePill(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: Color(0xFF111111))),
    );
  }
}
