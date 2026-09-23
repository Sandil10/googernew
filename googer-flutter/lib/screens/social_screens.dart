import 'dart:async';

import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import '../widgets/kit.dart';

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Chat conversation â€” real messages via /chat/messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class ChatConversationScreen extends StatefulWidget {
  const ChatConversationScreen();

  @override
  State<ChatConversationScreen> createState() => _ChatConversationScreenState();
}

class _ChatConversationScreenState extends State<ChatConversationScreen> {
  final draft = TextEditingController();
  Conversation? peer;
  List<ChatMessage> messages = [];
  bool loading = true;
  bool demo = false;
  bool peerTyping = false;
  bool blocked = false;
  Timer? _poll;
  DateTime _lastTypingSent = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (peer == null) _init();
  }

  @override
  void dispose() {
    _poll?.cancel();
    Api.updatePresence(); // clear active conversation
    super.dispose();
  }

  void _startPolling() {
    if (demo || peer == null || peer!.peerId <= 0 || !Api.loggedIn) return;
    Api.updatePresence(activeParticipantId: peer!.peerId);
    _poll = Timer.periodic(const Duration(seconds: 4), (_) async {
      final typing = await Api.peerTyping(peer!.peerId);
      if (mounted && typing != peerTyping) setState(() => peerTyping = typing);
    });
  }

  void _onDraftChanged(String _) {
    // web sends /chat/typing on keystrokes; throttle to every 3s
    if (demo || !Api.loggedIn) return;
    final now = DateTime.now();
    if (now.difference(_lastTypingSent).inSeconds >= 3) {
      _lastTypingSent = now;
      Api.sendTyping();
    }
  }

  Future<void> _toggleBlock() async {
    if (peer == null || peer!.peerId <= 0) return;
    final ok = blocked ? await Api.unblockChatUser(peer!.peerId) : await Api.blockChatUser(peer!.peerId);
    if (ok && mounted) {
      setState(() => blocked = !blocked);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(blocked ? "User blocked" : "User unblocked"),
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  Future<void> _deleteConversation() async {
    if (peer == null || peer!.peerId <= 0) return;
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: GoogerColors.surface,
        title: const Text("Delete conversation?", style: TextStyle(fontSize: 15, color: GoogerColors.text)),
        content: const Text("Messages will be removed from your inbox.",
            style: TextStyle(fontSize: 12.5, color: GoogerColors.muted)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text("Delete", style: TextStyle(color: GoogerColors.red))),
        ],
      ),
    );
    if (yes != true) return;
    final ok = await Api.deleteConversation(peer!.peerId);
    if (ok && mounted) Navigator.pop(context);
  }

  Future<void> _init() async {
    final arg = ModalRoute.of(context)?.settings.arguments;
    final all = await Api.chats();
    Conversation resolved;
    if (arg is Conversation) {
      resolved = arg;
    } else {
      final username = arg is String ? arg : all.first.username;
      resolved = all.firstWhere((c) => c.username == username, orElse: () => all.first);
    }
    peer = resolved;
    if (resolved.peerId > 0) {
      final raw = await Api.chatMessages(resolved.peerId);
      final myId = "${Api.user?["id"] ?? ""}";
      messages = raw.map((m) {
        return ChatMessage(
          int.tryParse("${m["id"]}") ?? 0,
          (m["text"] ?? m["message"] ?? "").toString(),
          "${m["sender_id"] ?? m["senderId"]}" == myId,
          (m["created_at"] ?? "").toString().split("T").last.split(".").first,
        );
      }).toList();
    } else {
      demo = true;
      messages = List<ChatMessage>.from(chatSeed);
    }
    if (mounted) setState(() => loading = false);
    _startPolling();
  }

  Future<void> _send() async {
    final text = draft.text.trim();
    if (text.isEmpty || peer == null) return;
    draft.clear();
    setState(() {
      messages.add(ChatMessage(DateTime.now().millisecondsSinceEpoch, text, true,
          TimeOfDay.now().format(context)));
    });
    if (!demo && peer!.peerId > 0) {
      final ok = await Api.sendChatMessage(peer!.peerId, text);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Message not delivered â€” log in first"), behavior: SnackBarBehavior.floating),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = peer;
    if (loading || p == null) {
      return const Scaffold(
        body: Center(child: GoogerSpinner(size: 30)),
      );
    }
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 126,
        backgroundColor: Colors.black,
        titleSpacing: 0,
        automaticallyImplyLeading: false,
        title: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
            child: Row(children: [
              Image.asset("assets/images/googer.png",
                  width: 38,
                  height: 38,
                  errorBuilder: (_, __, ___) =>
                      const IconChip(Icons.play_arrow_rounded, size: 38)),
              const Spacer(),
              const Icon(Icons.shopping_cart_outlined,
                  size: 22, color: Colors.white),
              const SizedBox(width: 24),
              const Icon(Icons.notifications_none_rounded,
                  size: 23, color: Colors.white),
              const SizedBox(width: 18),
              GoogerAvatar(url: Api.avatar, name: Api.displayName, size: 38),
            ]),
          ),
          const Divider(height: 1, color: GoogerColors.line),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 10, 8, 10),
            child: Row(children: [
              GestureDetector(
                onTap: () => Navigator.maybePop(context),
                child: const IconChip(Icons.arrow_back,
                    size: 40, color: Colors.white),
              ),
              const SizedBox(width: 8),
              GoogerAvatar(url: p.img, name: p.name, size: 40, online: p.online),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.5,
                              color: Colors.white)),
                      Row(children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                              color: p.online
                                  ? GoogerColors.green
                                  : Colors.white70,
                              shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 6),
                        Text(
                            peerTyping
                                ? "TYPING"
                                : (p.online ? "ONLINE" : "OFFLINE"),
                            style: const TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                                color: GoogerColors.dim)),
                      ]),
                    ]),
              ),
              const IconChip(Icons.dark_mode, size: 44, color: Colors.white),
              const SizedBox(width: 8),
              const IconChip(Icons.call_outlined, size: 44, color: Colors.white),
              const SizedBox(width: 8),
              const IconChip(Icons.videocam_outlined,
                  size: 44, color: Colors.white),
              PopupMenuButton<String>(
                icon:
                    const Icon(Icons.more_vert, size: 18, color: Colors.white70),
                color: GoogerColors.raised,
                onSelected: (v) {
                  if (v == "block") _toggleBlock();
                  if (v == "delete") _deleteConversation();
                },
                itemBuilder: (_) => [
                  PopupMenuItem(
                      value: "block",
                      child: Text(blocked ? "Unblock user" : "Block user",
                          style: const TextStyle(
                              fontSize: 12.5, color: GoogerColors.text))),
                  const PopupMenuItem(
                      value: "delete",
                      child: Text("Delete conversation",
                          style:
                              TextStyle(fontSize: 12.5, color: GoogerColors.red))),
                ],
              ),
            ]),
          ),
        ]),
      ),
      body: Column(children: [
        Expanded(
          child: messages.isEmpty
              ? const EmptyState(icon: Icons.forum_outlined, title: "No messages yet", subtitle: "Say hi ðŸ‘‹")
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: messages.length,
                  itemBuilder: (_, i) {
                    final m = messages[i];
                    // Instagram DM style: blue sent bubbles, grey incoming with avatar
                    final bubble = Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                      decoration: BoxDecoration(
                        color: m.mine ? const Color(0xFF3797F0) : GoogerColors.soft10,
                        borderRadius: BorderRadius.only(
                          topLeft: const Radius.circular(20),
                          topRight: const Radius.circular(20),
                          bottomLeft: Radius.circular(m.mine ? 20 : 5),
                          bottomRight: Radius.circular(m.mine ? 5 : 20),
                        ),
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.end, mainAxisSize: MainAxisSize.min, children: [
                        Text(m.text,
                            style: TextStyle(fontSize: 13.5, height: 1.4, color: m.mine ? Colors.white : GoogerColors.text)),
                        Text(m.time,
                            style: TextStyle(fontSize: 8.5, color: m.mine ? Colors.white60 : GoogerColors.faint)),
                      ]),
                    );
                    if (m.mine) return Align(alignment: Alignment.centerRight, child: bubble);
                    return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Padding(
                        padding: const EdgeInsets.only(right: 8, bottom: 8),
                        child: GoogerAvatar(url: p.img, name: p.name, size: 24),
                      ),
                      bubble,
                    ]);
                  },
                ),
        ),
        Container(
          decoration: const BoxDecoration(
            color: GoogerColors.nav,
            border: Border(top: BorderSide(color: GoogerColors.borderSoft)),
          ),
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
          child: SafeArea(
            top: false,
            child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              const Padding(padding: EdgeInsets.all(8), child: Icon(Icons.add, size: 21, color: GoogerColors.muted)),
              const Padding(padding: EdgeInsets.all(8), child: Icon(Icons.emoji_emotions_outlined, size: 19, color: GoogerColors.muted)),
              Expanded(
                child: TextField(
                  controller: draft,
                  minLines: 1,
                  maxLines: 4,
                  decoration: InputDecoration(
                    hintText: "Messageâ€¦",
                    fillColor: GoogerColors.soft6,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: GoogerColors.line)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: GoogerColors.line)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                  ),
                  style: const TextStyle(fontSize: 13.5, color: GoogerColors.text),
                  onChanged: _onDraftChanged,
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 6),
              GestureDetector(
                onTap: _send,
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  child: const Icon(Icons.send, size: 16, color: Color(0xFF111111)),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}
/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Reel viewer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class ReelViewerScreen extends StatelessWidget {
  const ReelViewerScreen();

  static const reels = [];

  @override
  Widget build(BuildContext context) {
    if (reels.isEmpty) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: EmptyState(
            icon: Icons.movie_outlined,
            title: "No reels yet",
            subtitle: "Real reel content will appear here when it is available.",
          ),
        ),
      );
    }
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        PageView.builder(
          scrollDirection: Axis.vertical,
          itemCount: reels.length,
          itemBuilder: (_, i) {
            final r = reels[i];
            return Stack(fit: StackFit.expand, children: [
              Image.network(r.cover, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(color: GoogerColors.surfaceStrong)),
              Container(color: Colors.black26),
              Center(
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: const BoxDecoration(color: Colors.black38, shape: BoxShape.circle),
                  child: const Icon(Icons.play_arrow, size: 32, color: Colors.white70),
                ),
              ),
              // right rail
              Positioned(
                right: 12,
                bottom: 110,
                child: Column(children: [
                  _rail(Icons.favorite_border, "${r.likes}"),
                  _rail(Icons.mode_comment_outlined, "${r.comments}"),
                  _rail(Icons.share_outlined, "${r.shares}"),
                  _rail(Icons.bookmark_border, ""),
                ]),
              ),
              // bottom meta
              Positioned(
                left: 14,
                right: 80,
                bottom: 100,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    GoogerAvatar(url: r.img, name: r.name, size: 34),
                    const SizedBox(width: 8),
                    Text("@${r.user}", style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Colors.white)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.white54),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text("Follow", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: Colors.white)),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  Text(r.caption, maxLines: 2, style: const TextStyle(fontSize: 12.5, height: 1.4, color: Colors.white)),
                ]),
              ),
            ]);
          },
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              GestureDetector(
                onTap: () => Navigator.pop(context),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: const BoxDecoration(color: Colors.black45, shape: BoxShape.circle),
                  child: const Icon(Icons.keyboard_arrow_down, size: 22, color: Colors.white),
                ),
              ),
              const Spacer(),
              const Overline("Reels", color: Colors.white),
              const Spacer(),
              const SizedBox(width: 36),
            ]),
          ),
        ),
      ]),
    );
  }

  static Widget _rail(IconData icon, String count) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(children: [
        Icon(icon, size: 27, color: Colors.white),
        if (count.isNotEmpty)
          Text(count, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: Colors.white)),
      ]),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Write a Goog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class WriteGoogScreen extends StatefulWidget {
  const WriteGoogScreen();

  @override
  State<WriteGoogScreen> createState() => _WriteGoogScreenState();
}

class _WriteGoogScreenState extends State<WriteGoogScreen> {
  static const limit = 75;
  final controller = TextEditingController();
  Color color = Colors.white;
  int length = 0;
  bool posting = false;

  String get _hex =>
      "#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}";

  Future<void> _post() async {
    final text = controller.text.trim();
    if (text.isEmpty || posting) return;
    setState(() => posting = true);
    final err = await Api.createGoog(text, _hex);
    if (!mounted) return;
    setState(() => posting = false);
    if (err == null) {
      Navigator.pop(context, true); // signal the feed to refresh
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Goog posted ðŸŽ‰"), behavior: SnackBarBehavior.floating),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(err), behavior: SnackBarBehavior.floating),
      );
    }
  }

  List<Color> get palette =>
      [Colors.white, ...List.generate(10, (i) => HSLColor.fromAHSL(1, 360 * i / 10, 0.85, 0.65).toColor())];

  @override
  Widget build(BuildContext context) {
    final nearLimit = length >= limit * 0.85;
    final atLimit = length >= limit;
    return Scaffold(
      backgroundColor: GoogerColors.surface,
      appBar: AppBar(
        backgroundColor: GoogerColors.surface,
        automaticallyImplyLeading: false,
        title: const Text("Write a Goog", style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        centerTitle: true,
        leading: Padding(
          padding: const EdgeInsets.only(left: 12, top: 10, bottom: 10),
          child: GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(color: GoogerColors.redDark, borderRadius: BorderRadius.circular(999)),
              alignment: Alignment.center,
              child: const Text("Cancel", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.white)),
            ),
          ),
        ),
        leadingWidth: 80,
      ),
      body: Column(children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              GoogerAvatar(url: Api.avatar, name: Api.displayName, size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: controller,
                  autofocus: true,
                  maxLines: null,
                  maxLength: limit,
                  onChanged: (v) => setState(() => length = v.length),
                  decoration: const InputDecoration(
                    hintText: "Write a Goog",
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    counterText: "",
                  ),
                  style: TextStyle(fontSize: 16, height: 1.5, color: color),
                  cursorColor: color,
                ),
              ),
            ]),
          ),
        ),
        Container(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: GoogerColors.borderSoft))),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Row(children: [
            const Text("Color", style: TextStyle(fontSize: 10, color: GoogerColors.dim)),
            const SizedBox(width: 8),
            Expanded(
              child: SingleChildScrollView(
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
            ),
            Text("$length/$limit",
                style: TextStyle(
                    fontSize: 10,
                    color: atLimit ? const Color(0xFFF87171) : nearLimit ? GoogerColors.amber : GoogerColors.faint)),
          ]),
        ),
        Container(
          color: GoogerColors.surfaceStrong,
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
          child: SafeArea(
            top: false,
            child: Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(120, 38)),
                onPressed: length == 0 || posting ? null : _post,
                child: posting
                    ? const GoogerSpinner(size: 16, color: Color(0xFF111111))
                    : const Text("Post Now"),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class SearchScreen extends StatefulWidget {
  const SearchScreen();

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  String query = "";

  @override
  Widget build(BuildContext context) {
    const users = <GoogPost>[];
    const matched = <Product>[];
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          autofocus: true,
          onChanged: (v) => setState(() => query = v),
          decoration: InputDecoration(
            hintText: "Search Googer",
            prefixIcon: const Icon(Icons.search, size: 18, color: GoogerColors.dim),
            fillColor: GoogerColors.soft6,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: const BorderSide(color: GoogerColors.line)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: const BorderSide(color: GoogerColors.line)),
            contentPadding: const EdgeInsets.symmetric(vertical: 8),
          ),
          style: const TextStyle(fontSize: 13.5, color: GoogerColors.text),
        ),
        actions: const [SizedBox(width: 14)],
      ),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        const Overline("People"),
        const SizedBox(height: 8),
        ...users.map((u) => InkWell(
              onTap: () => Navigator.pushNamed(context, "/profile/user", arguments: u.username),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(children: [
                  GoogerAvatar(url: u.img, name: u.name, size: 42),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(u.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                      Text("@${u.username}", style: const TextStyle(fontSize: 11, color: GoogerColors.dim)),
                    ]),
                  ),
                  const Icon(Icons.chevron_right, size: 17, color: GoogerColors.faint),
                ]),
              ),
            )),
        const SizedBox(height: 16),
        const Overline("Products"),
        const SizedBox(height: 8),
        ...matched.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: GoogerCard(
                padding: const EdgeInsets.all(12),
                onTap: () => Navigator.pushNamed(context, "/product", arguments: p.id),
                child: Row(children: [
                  const IconChip(Icons.inventory_2_outlined, size: 34),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(p.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: GoogerColors.text)),
                      Text("R ${p.price.toStringAsFixed(0)} Â· ${p.seller}",
                          style: const TextStyle(fontSize: 10.5, color: GoogerColors.dim)),
                    ]),
                  ),
                ]),
              ),
            )),
      ]),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen();

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Notif> items = notifs;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final raw = await Api.notifications();
    if (!mounted) return;
    setState(() {
      loading = false;
      if (raw.isNotEmpty) {
        items = raw.map((m) {
          return Notif(
            int.tryParse("${m["id"]}") ?? 0,
            Icons.notifications_outlined.codePoint,
            0xFF60A5FA,
            (m["title"] ?? m["message"] ?? m["text"] ?? "Notification").toString(),
            (m["created_at"] ?? "").toString().split("T").first,
          );
        }).toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Notifications"),
        actions: [
          TextButton(
            onPressed: () async {
              await Api.markAllNotificationsRead();
              _load();
            },
            child: const Text("Mark all read",
                style: TextStyle(fontSize: 11, color: GoogerColors.muted)),
          ),
          const SizedBox(width: 6),
        ],
      ),
      body: loading
          ? const Center(child: GoogerSpinner(size: 30))
          : ListView.separated(
        padding: const EdgeInsets.all(18),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final n = items[i];
          return GoogerCard(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Color(n.color).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: n.icon == Icons.notifications_outlined.codePoint
                    ? Icon(Icons.notifications_outlined, size: 17, color: Color(n.color))
                    // ignore: non_const_argument_for_const_parameter
                    : Icon(IconData(n.icon, fontFamily: "MaterialIcons"), size: 17, color: Color(n.color)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(n.title, style: const TextStyle(fontSize: 12.5, height: 1.35, color: GoogerColors.text)),
                  const SizedBox(height: 3),
                  Text("${n.time} ago", style: const TextStyle(fontSize: 10, color: GoogerColors.dim)),
                ]),
              ),
            ]),
          );
        },
      ),
    );
  }
}
