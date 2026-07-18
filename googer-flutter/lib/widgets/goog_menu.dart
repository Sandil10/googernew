import 'package:flutter/material.dart';
import '../api/api.dart';
import '../theme.dart';
import 'share_sheet.dart';

/// 3-dot menu on goog posts — same options as the web:
/// Not Interested / Save / Subscribe / Share / Report, plus Edit/Delete on own posts.
void showGoogMenu(
  BuildContext context, {
  required int googId,
  required String shareUrl,
  required String title,
  VoidCallback? onHide,
  bool isOwn = false,
  String? googText,
  VoidCallback? onDeleted,
  VoidCallback? onEdited,
}) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (sheetCtx) => SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xF21B1B1E),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: GoogerColors.line),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          _item(sheetCtx, Icons.visibility_off_outlined, "Not Interested", () {
            Navigator.pop(sheetCtx);
            onHide?.call();
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text("Hidden for 24 hours — you'll see fewer posts like this"),
              behavior: SnackBarBehavior.floating,
            ));
          }),
          const Divider(height: 1),
          _item(sheetCtx, Icons.bookmark_border, "Save Goog", () async {
            Navigator.pop(sheetCtx);
            final saved = await Api.toggleGoogSave(googId);
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text(saved == null
                    ? "Log in to save googs"
                    : saved
                        ? "Saved to your bookmarks"
                        : "Removed from bookmarks"),
                behavior: SnackBarBehavior.floating,
              ));
            }
          }),
          if (!isOwn) ...[
            const Divider(height: 1),
            _item(sheetCtx, Icons.notifications_active_outlined, "Subscribe to author", () async {
              Navigator.pop(sheetCtx);
              final sub = await Api.toggleGoogSubscribe(googId);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(sub == null
                      ? "Log in to subscribe"
                      : sub
                          ? "Subscribed — you'll see more from this author"
                          : "Unsubscribed"),
                  behavior: SnackBarBehavior.floating,
                ));
              }
            }),
          ],
          const Divider(height: 1),
          _item(sheetCtx, Icons.share_outlined, "Share", () {
            Navigator.pop(sheetCtx);
            Api.shareGoog(googId);
            showShareSheet(context, title: title, url: shareUrl);
          }),
          if (isOwn) ...[
            const Divider(height: 1),
            _item(sheetCtx, Icons.edit_outlined, "Edit Goog", () {
              Navigator.pop(sheetCtx);
              _showEditForm(context, googId, googText ?? title, onEdited);
            }),
            const Divider(height: 1),
            _item(sheetCtx, Icons.delete_outline, "Delete Goog", () async {
              Navigator.pop(sheetCtx);
              final yes = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: GoogerColors.surface,
                  title: const Text("Delete this Goog?", style: TextStyle(fontSize: 15, color: GoogerColors.text)),
                  content: const Text("This can't be undone.", style: TextStyle(fontSize: 12.5, color: GoogerColors.muted)),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
                    TextButton(
                        onPressed: () => Navigator.pop(ctx, true),
                        child: const Text("Delete", style: TextStyle(color: GoogerColors.red))),
                  ],
                ),
              );
              if (yes != true) return;
              final ok = await Api.deleteGoog(googId);
              if (ok) onDeleted?.call();
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(ok ? "Goog deleted" : "Could not delete — try again"),
                  behavior: SnackBarBehavior.floating,
                ));
              }
            }),
          ] else ...[
            const Divider(height: 1),
            _item(sheetCtx, Icons.error_outline, "Report", () {
              Navigator.pop(sheetCtx);
              _showReportForm(context, googId);
            }),
          ],
        ]),
      ),
    ),
  );
}

/// Edit own goog — PUT /googs/{id} with new text (color kept as chosen).
void _showEditForm(BuildContext context, int googId, String initialText, VoidCallback? onEdited) {
  final controller = TextEditingController(text: initialText);
  Color color = Colors.white;
  final palette = [Colors.white, ...List.generate(10, (i) => HSLColor.fromAHSL(1, 360 * i / 10, 0.85, 0.65).toColor())];
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => StatefulBuilder(
      builder: (sheetCtx, setState) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(sheetCtx).viewInsets.bottom),
        child: Container(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
          decoration: const BoxDecoration(
            color: GoogerColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: SafeArea(
            top: false,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(color: GoogerColors.soft10, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 14),
              const Text("Edit Goog", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: GoogerColors.text)),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                maxLines: 3,
                maxLength: 75,
                style: TextStyle(fontSize: 14, color: color),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: palette.map((c) {
                    final active = c.toARGB32() == color.toARGB32();
                    return GestureDetector(
                      onTap: () => setState(() => color = c),
                      child: Container(
                        width: 18,
                        height: 18,
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(
                          color: c,
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: active ? Colors.white : Colors.white24, width: active ? 2 : 1),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 14),
              FilledButton(
                onPressed: () async {
                  final text = controller.text.trim();
                  if (text.isEmpty) return;
                  Navigator.pop(sheetCtx);
                  final hex = "#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}";
                  final err = await Api.updateGoog(googId, text, hex);
                  if (err == null) onEdited?.call();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(err ?? "Goog updated"),
                      behavior: SnackBarBehavior.floating,
                    ));
                  }
                },
                child: const Text("Save Changes"),
              ),
            ]),
          ),
        ),
      ),
    ),
  );
}

Widget _item(BuildContext context, IconData icon, String label, VoidCallback onTap) {
  return InkWell(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Row(children: [
        Icon(icon, size: 20, color: GoogerColors.text),
        const SizedBox(width: 14),
        Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: GoogerColors.text)),
        const Spacer(),
      ]),
    ),
  );
}

/// Report form — reason list + details, POSTs /googs/{id}/report like the web.
void _showReportForm(BuildContext context, int googId) {
  String reason = "Spam";
  final details = TextEditingController();
  const reasons = ["Spam", "Harassment or bullying", "False information", "Scam or fraud", "Violence", "Nudity or sexual content", "Other"];
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => StatefulBuilder(
      builder: (sheetCtx, setState) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(sheetCtx).viewInsets.bottom),
        child: Container(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
          decoration: const BoxDecoration(
            color: GoogerColors.surface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: SafeArea(
            top: false,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(color: GoogerColors.soft10, borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(height: 14),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text("Report Goog", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: GoogerColors.text)),
              ),
              const SizedBox(height: 4),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text("Why are you reporting this post?", style: TextStyle(fontSize: 12, color: GoogerColors.dim)),
              ),
              const SizedBox(height: 12),
              ...reasons.map((r) {
                final active = reason == r;
                return InkWell(
                  onTap: () => setState(() => reason = r),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    child: Row(children: [
                      Icon(active ? Icons.radio_button_checked : Icons.radio_button_off,
                          size: 19, color: active ? GoogerColors.red : GoogerColors.dim),
                      const SizedBox(width: 12),
                      Text(r, style: const TextStyle(fontSize: 13.5, color: GoogerColors.text)),
                    ]),
                  ),
                );
              }),
              const SizedBox(height: 8),
              TextField(
                controller: details,
                maxLines: 2,
                decoration: const InputDecoration(hintText: "Additional details (optional)"),
                style: const TextStyle(fontSize: 13, color: GoogerColors.text),
              ),
              const SizedBox(height: 14),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: GoogerColors.red, foregroundColor: Colors.white),
                onPressed: () async {
                  Navigator.pop(sheetCtx);
                  final ok = await Api.reportGoog(googId, reason, details.text);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                      content: Text(ok ? "Report submitted — our team will review it" : "Log in to report posts"),
                      behavior: SnackBarBehavior.floating,
                    ));
                  }
                },
                child: const Text("Submit Report"),
              ),
            ]),
          ),
        ),
      ),
    ),
  );
}
