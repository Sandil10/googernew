import 'package:flutter/material.dart';
import '../theme.dart';
import '../widgets/kit.dart';

/* ───────────── Campaign hub ───────────── */

class AdCampaignHubScreen extends StatelessWidget {
  const AdCampaignHubScreen();

  static const types = [
    (title: "Photo & Video", desc: "Promote an image or video in the home feed", icon: Icons.photo_library_outlined, tint: GoogerColors.rose, route: "/ads/photo-video"),
    (title: "Product Promote", desc: "Boost one of your shop products to buyers", icon: Icons.inventory_2_outlined, tint: GoogerColors.emerald, route: "/ads/product-promote"),
    (title: "Profile Promote", desc: "Grow your followers with a profile carousel", icon: Icons.person_add_alt_outlined, tint: GoogerColors.blue, route: "/ads/profile-promote"),
    (title: "Upload Content", desc: "Publish monetized video content viewers can unlock", icon: Icons.cloud_upload_outlined, tint: GoogerColors.cyan, route: "/ads/upload-content"),
    (title: "Flash Content", desc: "24-hour high-visibility flash placement", icon: Icons.bolt_outlined, tint: GoogerColors.amber, route: "/ads/flash-content"),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Ad Campaign")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        ...types.map((t) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GoogerCard(
                onTap: () => Navigator.pushNamed(context, t.route),
                child: Row(children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(color: t.tint.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
                    child: Icon(t.icon, size: 22, color: t.tint),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(t.title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                      const SizedBox(height: 3),
                      Text(t.desc, style: const TextStyle(fontSize: 11, height: 1.35, color: GoogerColors.dim)),
                    ]),
                  ),
                  const Icon(Icons.chevron_right, size: 17, color: GoogerColors.faint),
                ]),
              ),
            )),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: GoogerColors.amber.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: GoogerColors.amber.withValues(alpha: 0.18)),
          ),
          child: Row(children: const [
            Icon(Icons.lightbulb_outline, size: 16, color: GoogerColors.amber),
            SizedBox(width: 10),
            Expanded(
              child: Text("Campaigns are paid with Rupier coins from your wallet. Track performance anytime in the Ad Center.",
                  style: TextStyle(fontSize: 11, height: 1.5, color: GoogerColors.muted)),
            ),
          ]),
        ),
      ]),
    );
  }
}

/* ───────────── Shared campaign editor ───────────── */

class CampaignEditor extends StatefulWidget {
  final String title, subtitle, mediaLabel;
  final IconData icon;
  final String? extraLabel, extraHint;
  const CampaignEditor({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.mediaLabel,
    this.extraLabel,
    this.extraHint,
  });

  @override
  State<CampaignEditor> createState() => _CampaignEditorState();
}

class _CampaignEditorState extends State<CampaignEditor> {
  final titleCtl = TextEditingController();
  final budget = TextEditingController(text: "500");
  String duration = "7 Days";
  String audience = "Everyone";
  bool coinReward = true;

  @override
  Widget build(BuildContext context) {
    final num = double.tryParse(budget.text) ?? 0;
    final estViews = (num * 18).round();
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.title),
          Text(widget.subtitle, style: const TextStyle(fontSize: 11, color: GoogerColors.dim)),
        ]),
      ),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Container(
          padding: const EdgeInsets.symmetric(vertical: 30),
          decoration: BoxDecoration(
            color: GoogerColors.soft,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: GoogerColors.line),
          ),
          child: Column(children: [
            IconChip(widget.icon, size: 52, color: GoogerColors.text),
            const SizedBox(height: 8),
            Text(widget.mediaLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: GoogerColors.text)),
            const SizedBox(height: 3),
            const Text("Tap to select from your device", style: TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
          ]),
        ),
        const SizedBox(height: 16),
        const Overline("Campaign Title"),
        const SizedBox(height: 6),
        TextField(controller: titleCtl, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "Name your campaign"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
        if (widget.extraLabel != null) ...[
          const SizedBox(height: 14),
          Overline(widget.extraLabel!),
          const SizedBox(height: 6),
          TextField(decoration: InputDecoration(hintText: widget.extraHint), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
        ],
        const SizedBox(height: 14),
        const Overline("Budget (Rupier Coins)"),
        const SizedBox(height: 6),
        TextField(controller: budget, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: "500"), style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
        const SizedBox(height: 8),
        Row(
          children: [100, 500, 1000, 5000].map((a) {
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () => setState(() => budget.text = "$a"),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
                  decoration: BoxDecoration(
                    color: GoogerColors.soft6,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: GoogerColors.line),
                  ),
                  child: Text("$a", style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, color: GoogerColors.muted)),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
        const Overline("Duration"),
        const SizedBox(height: 8),
        ChoiceChipRow(options: const ["1 Day", "3 Days", "7 Days", "14 Days", "30 Days"], selected: duration, onSelect: (d) => setState(() => duration = d)),
        const SizedBox(height: 16),
        const Overline("Audience"),
        const SizedBox(height: 8),
        ChoiceChipRow(options: const ["Everyone", "Followers", "Sri Lanka", "Custom"], selected: audience, onSelect: (a) => setState(() => audience = a)),
        const SizedBox(height: 16),
        GestureDetector(
          onTap: () => setState(() => coinReward = !coinReward),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: GoogerColors.amber.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: GoogerColors.amber.withValues(alpha: 0.2)),
            ),
            child: Row(children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(color: GoogerColors.amber.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.toll_outlined, size: 17, color: GoogerColors.amber),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
                  Text("Viewer Coin Rewards", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                  SizedBox(height: 2),
                  Text("Viewers can collect coins from this ad — boosts engagement", style: TextStyle(fontSize: 10.5, height: 1.4, color: GoogerColors.muted)),
                ]),
              ),
              Icon(coinReward ? Icons.check_box : Icons.check_box_outline_blank, size: 20, color: coinReward ? GoogerColors.green : GoogerColors.dim),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        GoogerCard(
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Overline("Estimated Reach", color: GoogerColors.dim),
                const SizedBox(height: 4),
                Text("$estViews views", style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: GoogerColors.text)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              const Overline("Total Cost", color: GoogerColors.dim),
              const SizedBox(height: 4),
              Text("${num.toStringAsFixed(0)} coins", style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: GoogerColors.text)),
            ]),
          ]),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: titleCtl.text.isNotEmpty && num > 0 ? () => Navigator.pushNamed(context, "/wallet/ad-center") : null,
          child: const Text("Launch Campaign"),
        ),
        const SizedBox(height: 10),
        OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text("Save Draft")),
      ]),
    );
  }
}

class PhotoVideoCampaignScreen extends StatelessWidget {
  const PhotoVideoCampaignScreen();
  @override
  Widget build(BuildContext context) => const CampaignEditor(
      title: "Photo & Video Ad", subtitle: "Feed placement campaign", icon: Icons.photo_library_outlined,
      mediaLabel: "Add photo or video", extraLabel: "Destination Link (optional)", extraHint: "https://");
}

class ProductPromoteCampaignScreen extends StatelessWidget {
  const ProductPromoteCampaignScreen();
  @override
  Widget build(BuildContext context) => const CampaignEditor(
      title: "Product Promote", subtitle: "Boost a shop product", icon: Icons.inventory_2_outlined,
      mediaLabel: "Select a product from your shop", extraLabel: "Promo Text", extraHint: "e.g. Flash sale — 20% off this week");
}

class ProfilePromoteCampaignScreen extends StatelessWidget {
  const ProfilePromoteCampaignScreen();
  @override
  Widget build(BuildContext context) => const CampaignEditor(
      title: "Profile Promote", subtitle: "Grow your followers", icon: Icons.person_add_alt_outlined,
      mediaLabel: "Your profile card will be promoted", extraLabel: "Headline", extraHint: "Why should people follow you?");
}

class UploadContentCampaignScreen extends StatelessWidget {
  const UploadContentCampaignScreen();
  @override
  Widget build(BuildContext context) => const CampaignEditor(
      title: "Upload Content", subtitle: "Monetized video content", icon: Icons.cloud_upload_outlined,
      mediaLabel: "Upload your video content", extraLabel: "Unlock Price (coins)", extraHint: "e.g. 10 coins per view");
}

class FlashContentCampaignScreen extends StatelessWidget {
  const FlashContentCampaignScreen();
  @override
  Widget build(BuildContext context) => const CampaignEditor(
      title: "Flash Content", subtitle: "24-hour flash placement", icon: Icons.bolt_outlined,
      mediaLabel: "Add flash photo or clip", extraLabel: "Flash Caption", extraHint: "Short punchy caption (24h only)");
}
