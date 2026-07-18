import 'package:flutter/material.dart';
import '../api/api.dart';
import '../theme.dart';
import 'kit.dart';

/// Bottom sheet mirroring the web InteractionBottomSheet:
/// LIKES / COMMENTS / SHARES / VIEWS tabs, comment list with like/dislike/flag/reply,
/// ALL / RECENT / TOP RATED filter chips and the emoji quick row.
void showInteractionSheet(BuildContext context, int googId, String initialTab) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _InteractionSheet(googId: googId, initial: initialTab),
  );
}

class _InteractionSheet extends StatefulWidget {
  final int googId;
  final String initial;
  const _InteractionSheet({required this.googId, required this.initial});

  @override
  State<_InteractionSheet> createState() => _InteractionSheetState();
}

class _InteractionSheetState extends State<_InteractionSheet> {
  late String tab = widget.initial;
  String filter = "ALL";
  final input = TextEditingController();
  Future<List<Map<String, dynamic>>>? entries;

  static const tabs = [
    ("likes", Icons.favorite_border, "Likes"),
    ("comments", Icons.mode_comment_outlined, "Comments"),
    ("shares", Icons.share_outlined, "Shares"),
    ("views", Icons.remove_red_eye_outlined, "Views"),
  ];

  static const emojis = ["❤️", "😂", "🥰", "🔥", "👀", "👏", "💯", "✨", "😳", "😮"];

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => setState(() => entries = Api.googInteractions(widget.googId, tab));

  Future<void> _sendComment([String? emoji]) async {
    final text = emoji ?? input.text.trim();
    if (text.isEmpty) return;
    input.clear();
    final ok = await Api.postGoogComment(widget.googId, text);
    if (!mounted) return;
    if (ok) {
      _load();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Log in to comment"), behavior: SnackBarBehavior.floating),
      );
    }
  }

  Future<void> _reportComment(Map<String, dynamic> e) async {
    final commentId = int.tryParse("${e["id"] ?? e["comment_id"]}") ?? 0;
    if (commentId == 0) return;
    final ok = await Api.reportGoogComment(commentId, "Inappropriate");
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(ok ? "Comment reported" : "Log in to report comments"),
      behavior: SnackBarBehavior.floating,
    ));
  }

  Future<void> _deleteComment(Map<String, dynamic> e) async {
    final commentId = int.tryParse("${e["id"] ?? e["comment_id"]}") ?? 0;
    if (commentId == 0) return;
    final ok = await Api.deleteGoogComment(commentId);
    if (!mounted) return;
    if (ok) _load();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(ok ? "Comment deleted" : "Could not delete comment"),
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.72,
      minChildSize: 0.45,
      maxChildSize: 0.94,
      builder: (_, scroll) => Container(
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
          // Tab row — icon above tiny uppercase label, active chip elevated
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: tabs.map((t) {
                final active = tab == t.$1;
                return GestureDetector(
                  onTap: () {
                    tab = t.$1;
                    _load();
                  },
                  child: Container(
                    width: 74,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: active ? GoogerColors.soft10 : Colors.transparent,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(children: [
                      Icon(t.$2, size: 22, color: GoogerColors.text),
                      const SizedBox(height: 6),
                      Overline(t.$3, color: active ? GoogerColors.text : GoogerColors.dim),
                    ]),
                  ),
                );
              }).toList(),
            ),
          ),
          const Divider(height: 20),
          // Section header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Row(children: [
              // no close button — swipe down or tap outside to dismiss
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tab.toUpperCase(),
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: 1, color: GoogerColors.text)),
                const Overline("Goog Post", color: GoogerColors.sky),
              ]),
              const Spacer(),
            ]),
          ),
          if (tab == "comments") ...[
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18),
              child: Align(
                alignment: Alignment.centerLeft,
                child: ChoiceChipRow(
                  options: const ["ALL", "RECENT", "TOP RATED"],
                  selected: filter,
                  onSelect: (f) => setState(() => filter = f),
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          // Entries
          Expanded(
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: entries,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Center(child: GoogerSpinner(size: 30));
                }
                final list = snap.data ?? [];
                if (list.isEmpty) {
                  return EmptyState(
                      icon: tabs.firstWhere((t) => t.$1 == tab).$2,
                      title: "No $tab yet",
                      subtitle: tab == "comments" ? "Be the first to comment." : null);
                }
                return ListView.builder(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(18, 6, 18, 12),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final e = list[i];
                    final name = (e["username"] ?? e["full_name"] ?? e["name"] ?? "googer").toString();
                    final pic = (e["profile_picture"] ?? e["img"] ?? "").toString();
                    final text = (e["text"] ?? e["comment"] ?? "").toString();
                    final time = (e["created_at"] ?? "").toString().split("T").first;
                    if (tab != "comments") {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(children: [
                          GoogerAvatar(url: pic.isEmpty ? null : Api.resolveMedia(pic), name: name, size: 38),
                          const SizedBox(width: 12),
                          Text(name.toUpperCase(),
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.6, color: GoogerColors.text)),
                          const Spacer(),
                          Text(time, style: const TextStyle(fontSize: 10, color: GoogerColors.dim)),
                        ]),
                      );
                    }
                    // comment row: avatar, name+time, bubble, like/dislike/flag/reply
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        GoogerAvatar(url: pic.isEmpty ? null : Api.resolveMedia(pic), name: name, size: 38),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Text(name.toUpperCase(),
                                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: GoogerColors.text)),
                              const SizedBox(width: 6),
                              Text(time, style: const TextStyle(fontSize: 9, color: GoogerColors.dim)),
                            ]),
                            const SizedBox(height: 5),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                              decoration: BoxDecoration(
                                color: GoogerColors.soft6,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: GoogerColors.line),
                              ),
                              child: Text(text, style: const TextStyle(fontSize: 13, color: GoogerColors.text)),
                            ),
                            const SizedBox(height: 7),
                            Row(children: [
                              const Icon(Icons.thumb_up_off_alt, size: 15, color: GoogerColors.muted),
                              const SizedBox(width: 14),
                              const Icon(Icons.thumb_down_off_alt, size: 15, color: GoogerColors.muted),
                              const SizedBox(width: 14),
                              GestureDetector(
                                onTap: () => _reportComment(e),
                                child: const Icon(Icons.outlined_flag, size: 15, color: GoogerColors.muted),
                              ),
                              const SizedBox(width: 14),
                              GestureDetector(
                                onTap: () {
                                  input.text = "@$name ";
                                  input.selection = TextSelection.collapsed(offset: input.text.length);
                                },
                                child: const Text("REPLY",
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1, color: GoogerColors.sky)),
                              ),
                              if (Api.loggedIn && name.toLowerCase() == Api.username.toLowerCase()) ...[
                                const SizedBox(width: 14),
                                GestureDetector(
                                  onTap: () => _deleteComment(e),
                                  child: const Icon(Icons.delete_outline, size: 15, color: GoogerColors.red),
                                ),
                              ],
                            ]),
                          ]),
                        ),
                      ]),
                    );
                  },
                );
              },
            ),
          ),
          // Emoji quick row + composer (comments tab)
          if (tab == "comments")
            Container(
              decoration: const BoxDecoration(border: Border(top: BorderSide(color: GoogerColors.borderSoft))),
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: SafeArea(
                top: false,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  SizedBox(
                    height: 44,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: emojis.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) => GestureDetector(
                        onTap: () => _sendComment(emojis[i]),
                        child: Container(
                          width: 42,
                          decoration: const BoxDecoration(color: GoogerColors.soft6, shape: BoxShape.circle),
                          alignment: Alignment.center,
                          child: Text(emojis[i], style: const TextStyle(fontSize: 20)),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(children: [
                    GoogerAvatar(url: Api.avatar, name: Api.displayName, size: 34),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: input,
                        decoration: InputDecoration(
                          hintText: "Add a comment…",
                          fillColor: GoogerColors.soft6,
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: GoogerColors.line)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: GoogerColors.line)),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                        ),
                        style: const TextStyle(fontSize: 13, color: GoogerColors.text),
                        onSubmitted: (_) => _sendComment(),
                      ),
                    ),
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: _sendComment,
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                        child: const Icon(Icons.send, size: 15, color: Color(0xFF111111)),
                      ),
                    ),
                  ]),
                ]),
              ),
            ),
        ]),
      ),
    );
  }
}
