import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme.dart';

/// Share bottom sheet mirroring the web ShareModal:
/// WhatsApp / Facebook / Instagram / X / Telegram / Copy Link + link box.
void showShareSheet(BuildContext context, {required String title, required String url}) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (_) => _ShareSheet(title: title, url: url),
  );
}

class _ShareSheet extends StatelessWidget {
  final String title, url;
  const _ShareSheet({required this.title, required this.url});

  void _copy(BuildContext context, {String? note}) {
    Clipboard.setData(ClipboardData(text: url));
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(note ?? "Link copied"),
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final targets = [
      ("WhatsApp", Icons.chat, const Color(0xFF25D366)),
      ("Facebook", Icons.facebook, const Color(0xFF1877F2)),
      ("Instagram", Icons.camera_alt_outlined, const Color(0xFFE1306C)),
      ("X (Twitter)", Icons.close, Colors.black),
      ("Telegram", Icons.send, const Color(0xFF29A9EB)),
      ("Copy Link", Icons.link, GoogerColors.soft10),
    ];
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(0),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
        decoration: const BoxDecoration(
          color: GoogerColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 38,
            height: 4,
            decoration: BoxDecoration(color: GoogerColors.soft10, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(height: 14),
          // no close button — swipe down or tap outside to dismiss
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text("Share", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: GoogerColors.text)),
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: GoogerColors.dim)),
              ]),
            ),
          ]),
          const Divider(height: 24),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 3,
            mainAxisSpacing: 14,
            childAspectRatio: 1.35,
            children: targets.map((t) {
              return GestureDetector(
                onTap: () {
                  Navigator.pop(context);
                  _copy(context, note: t.$1 == "Copy Link" ? "Link copied" : "Link copied — paste it in ${t.$1}");
                },
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(color: t.$3, borderRadius: BorderRadius.circular(16)),
                    child: Icon(t.$2, size: 24, color: Colors.white),
                  ),
                  const SizedBox(height: 7),
                  Text(t.$1, style: const TextStyle(fontSize: 11, color: GoogerColors.muted)),
                ]),
              );
            }).toList(),
          ),
          const SizedBox(height: 6),
          const Align(alignment: Alignment.centerLeft, child: Overline("Link", color: GoogerColors.dim)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
            decoration: BoxDecoration(
              color: GoogerColors.soft6,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: GoogerColors.line),
            ),
            child: Row(children: [
              Expanded(
                child: Text(url, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: GoogerColors.muted)),
              ),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(72, 36), padding: const EdgeInsets.symmetric(horizontal: 14)),
                onPressed: () => _copy(context),
                child: const Text("Copy", style: TextStyle(fontSize: 12)),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
