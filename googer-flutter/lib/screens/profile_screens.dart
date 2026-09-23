import 'package:flutter/material.dart';
import '../api/api.dart';
import '../data/mock.dart';
import '../theme.dart';
import '../widgets/goog_card.dart';
import '../widgets/kit.dart';


/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ My profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class MyProfileScreen extends StatefulWidget {
  const MyProfileScreen();

  @override
  State<MyProfileScreen> createState() => _MyProfileScreenState();
}

class _MyProfileScreenState extends State<MyProfileScreen> {
  String tab = "Googs";
  List<GoogPost> myGoogs = [];
  int followerCount = 0;
  int followingCount = 0;
  bool loaded = false;

  dynamic get _myId => Api.user?["id"];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_myId == null) {
      setState(() {
        myGoogs = [];
        loaded = true;
      });
      return;
    }
    final results = await Future.wait([
      Api.userGoogs(_myId),
      Api.followers(_myId),
      Api.following(_myId),
    ]);
    if (!mounted) return;
    setState(() {
      myGoogs = results[0] as List<GoogPost>;
      followerCount = (results[1] as List).length;
      followingCount = (results[2] as List).length;
      loaded = true;
    });
  }


  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: GoogerColors.text),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: const Text("My Profile"),
        actions: [
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, "/settings"),
            child: const Padding(
              padding: EdgeInsets.only(right: 14),
              child: IconChip(Icons.settings_outlined, size: 34, color: GoogerColors.text),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: GoogerColors.red,
        onRefresh: _load,
        child: ListView(children: [
          Padding(
            padding: const EdgeInsets.all(22),
            child: Column(children: [
              GoogerAvatar(url: Api.avatar, name: Api.displayName, size: 84),
              const SizedBox(height: 12),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Text(Api.displayName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: GoogerColors.text)),
                const SizedBox(width: 5),
                const VerifiedBadge(size: 15),
              ]),
              const SizedBox(height: 4),
              Text("@${Api.username} Â· ${Api.googerId}", style: const TextStyle(fontSize: 12, color: GoogerColors.dim)),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(42)),
                    onPressed: () async {
                      await Navigator.pushNamed(context, "/profile/edit");
                      if (mounted) setState(() {});
                    },
                    icon: const Icon(Icons.edit_outlined, size: 15),
                    label: const Text("Edit Profile"),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(42)),
                    onPressed: () {},
                    icon: const Icon(Icons.share_outlined, size: 15),
                    label: const Text("Share"),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: () {
                    Api.logout();
                    Navigator.pushNamedAndRemoveUntil(context, "/login", (_) => false);
                  },
                  child: const IconChip(Icons.logout, size: 42, color: GoogerColors.red),
                ),
              ]),
            ]),
          ),
          // Tabs
          Container(
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: GoogerColors.line))),
            child: Row(
              children: ["Googs", "Products", "Reels", "Saved"].map((t) {
                final active = tab == t;
                return Expanded(
                  child: InkWell(
                    onTap: () => setState(() => tab = t),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        border: Border(bottom: BorderSide(color: active ? Colors.white : Colors.transparent, width: 2)),
                      ),
                      alignment: Alignment.center,
                      child: Overline(t, color: active ? GoogerColors.text : GoogerColors.dim),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          if (tab == "Googs")
            if (!loaded)
              const Padding(
                padding: EdgeInsets.all(30),
                child: Center(child: GoogerSpinner(size: 30)),
              )
            else if (myGoogs.isEmpty)
              const EmptyState(icon: Icons.edit_note, title: "No googs yet", subtitle: "Write your first Goog!")
            else
              ...myGoogs.map((p) => GoogCard(p))
          else
            EmptyState(
                icon: tab == "Products"
                    ? Icons.inventory_2_outlined
                    : tab == "Reels"
                        ? Icons.movie_outlined
                        : Icons.bookmark_border,
                title: "No ${tab.toLowerCase()} yet"),
        ]),
      ),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Public profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class PublicProfileScreen extends StatefulWidget {
  const PublicProfileScreen();

  @override
  State<PublicProfileScreen> createState() => _PublicProfileScreenState();
}

class _PublicProfileScreenState extends State<PublicProfileScreen> {
  bool following = false;
  bool subscribed = false;
  Map<String, dynamic>? user;
  List<GoogPost> posts = [];
  int followerCount = 0;
  int followingCount = 0;
  bool loaded = false;
  String? _requestedUsername;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final username = (ModalRoute.of(context)?.settings.arguments as String?) ?? "";
    if (_requestedUsername != username) {
      _requestedUsername = username;
      _load(username);
    }
  }

  Future<void> _load(String username) async {
    final u = await Api.userByUsername(username);
    if (!mounted) return;
    if (u == null) {
      setState(() {
        posts = [];
        user = null;
        loaded = true;
      });
      return;
    }
    setState(() => user = u);
    final id = u["id"];
    Api.logProfileView(id); // same as web: log the visit
    final results = await Future.wait([
      Api.userGoogs(id),
      Api.followers(id),
      Api.following(id),
      Api.isSubscribedTo(id),
    ]);
    if (!mounted) return;
    setState(() {
      posts = results[0] as List<GoogPost>;
      followerCount = (results[1] as List).length;
      followingCount = (results[2] as List).length;
      following = results[3] as bool;
      subscribed = following;
      loaded = true;
    });
  }

  Future<void> _toggleFollow() async {
    final id = user?["id"];
    if (id == null || !Api.loggedIn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Log in to follow users"), behavior: SnackBarBehavior.floating),
      );
      return;
    }
    setState(() {
      following = !following;
      followerCount += following ? 1 : -1;
    });
    final result = await Api.toggleUserSubscription(id);
    if (result == null && mounted) {
      setState(() {
        following = !following;
        followerCount += following ? 1 : -1;
      });
    }
  }


  @override
  Widget build(BuildContext context) {
    final username = _requestedUsername ?? "googer";
    final name = (user?["full_name"] ?? user?["username"] ?? username).toString();
    final pic = user?["profile_picture"] != null && "${user!["profile_picture"]}".isNotEmpty
        ? Api.resolveMedia("${user!["profile_picture"]}")
        : null;
    return Scaffold(
      appBar: AppBar(title: Text("@$username")),
      body: ListView(children: [
        Padding(
          padding: const EdgeInsets.all(22),
          child: Column(children: [
            GoogerAvatar(url: pic, name: name, size: 84),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: GoogerColors.text)),
              const SizedBox(width: 5),
              const VerifiedBadge(size: 15),
            ]),
            const SizedBox(height: 4),
            Text("@$username", style: const TextStyle(fontSize: 12, color: GoogerColors.dim)),
            if ((user?["bio"] ?? "").toString().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text("${user!["bio"]}",
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12.5, height: 1.4, color: GoogerColors.muted)),
            ],
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: following
                    ? OutlinedButton(
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(42)),
                        onPressed: _toggleFollow,
                        child: const Text("Subscribed"))
                    : FilledButton(
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(42)),
                        onPressed: _toggleFollow,
                        child: const Text("Follow")),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(42),
                    foregroundColor: subscribed ? GoogerColors.red : GoogerColors.muted,
                    side: BorderSide(color: subscribed ? GoogerColors.red.withValues(alpha: 0.4) : GoogerColors.line),
                  ),
                  onPressed: _toggleFollow,
                  icon: Icon(subscribed ? Icons.notifications_active : Icons.notifications_none, size: 15),
                  label: Text(subscribed ? "Subscribed" : "Subscribe"),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => Navigator.pushNamed(context, "/chat", arguments: username),
                child: const IconChip(Icons.chat_bubble_outline, size: 42, color: GoogerColors.text),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => _showProfileActions(context),
                child: const IconChip(Icons.more_horiz, size: 42, color: GoogerColors.muted),
              ),
            ]),
          ]),
        ),
        const Padding(padding: EdgeInsets.fromLTRB(18, 0, 18, 10), child: Overline("Googs")),
        const Divider(),
        if (!loaded)
          const Padding(
            padding: EdgeInsets.all(30),
            child: Center(child: GoogerSpinner(size: 30)),
          )
        else if (posts.isEmpty)
          const EmptyState(icon: Icons.edit_note, title: "No googs yet")
        else
          ...posts.map((p) => GoogCard(p)),
      ]),
    );
  }

  /// Block / report â€” same options as the web public profile â‹® menu.
  void _showProfileActions(BuildContext context) {
    final id = user?["id"];
    showModalBottomSheet(
      context: context,
      backgroundColor: GoogerColors.surface,
      builder: (sheetCtx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const Icon(Icons.block, size: 20, color: GoogerColors.red),
            title: const Text("Block user", style: TextStyle(fontSize: 13.5, color: GoogerColors.red)),
            onTap: () async {
              Navigator.pop(sheetCtx);
              if (id == null) return;
              final ok = await Api.toggleBlockUser(id);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(ok ? "User blocked" : "Log in to block users"),
                  behavior: SnackBarBehavior.floating,
                ));
              }
            },
          ),
          ListTile(
            leading: const Icon(Icons.error_outline, size: 20, color: GoogerColors.text),
            title: const Text("Report user", style: TextStyle(fontSize: 13.5, color: GoogerColors.text)),
            onTap: () async {
              Navigator.pop(sheetCtx);
              if (id == null) return;
              final ok = await Api.reportUser(id, "Inappropriate profile");
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(ok ? "Report submitted" : "Log in to report users"),
                  behavior: SnackBarBehavior.floating,
                ));
              }
            },
          ),
        ]),
      ),
    );
  }
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Edit profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen();

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late final nameCtrl = TextEditingController(text: Api.user?["full_name"]?.toString() ?? "");
  late final usernameCtrl = TextEditingController(text: Api.user?["username"]?.toString() ?? "");
  late final bioCtrl = TextEditingController(text: Api.user?["bio"]?.toString() ?? "");
  late final countryCtrl = TextEditingController(text: Api.user?["country"]?.toString() ?? "");
  late final phoneCtrl = TextEditingController(text: Api.user?["phone_number"]?.toString() ?? "");
  bool saving = false;
  String? usernameNote;

  Future<void> _checkUsername(String value) async {
    final v = value.trim();
    if (v.isEmpty || v == Api.username) {
      setState(() => usernameNote = null);
      return;
    }
    final available = await Api.checkUsername(v);
    if (!mounted) return;
    setState(() => usernameNote = available == null
        ? null
        : available
            ? "âœ“ @$v is available"
            : "âœ— @$v is taken");
  }

  Future<void> _save() async {
    if (saving) return;
    setState(() => saving = true);
    final err = await Api.updateProfile({
      "fullName": nameCtrl.text.trim(),
      "username": usernameCtrl.text.trim(),
      "bio": bioCtrl.text.trim(),
      "country": countryCtrl.text.trim(),
      "phoneNumber": phoneCtrl.text.trim(),
    });
    if (!mounted) return;
    setState(() => saving = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(err ?? "Profile updated"),
      behavior: SnackBarBehavior.floating,
    ));
    if (err == null) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    Widget field(String label, TextEditingController ctrl, String hint,
            {int lines = 1, ValueChanged<String>? onChanged, String? note}) =>
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Overline(label),
          const SizedBox(height: 6),
          TextField(
              controller: ctrl,
              maxLines: lines,
              onChanged: onChanged,
              decoration: InputDecoration(hintText: hint),
              style: const TextStyle(fontSize: 14, color: GoogerColors.text)),
          if (note != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(note,
                  style: TextStyle(
                      fontSize: 11,
                      color: note.startsWith("âœ“") ? GoogerColors.green : GoogerColors.red)),
            ),
          const SizedBox(height: 14),
        ]);
    return Scaffold(
      appBar: AppBar(title: const Text("Edit Profile")),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        Center(
          child: Column(children: [
            Stack(children: [
              GoogerAvatar(url: Api.avatar, name: Api.displayName, size: 92),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(color: GoogerColors.page, width: 2),
                  ),
                  child: const Icon(Icons.camera_alt_outlined, size: 15, color: Color(0xFF111111)),
                ),
              ),
            ]),
            const SizedBox(height: 10),
            const Text("Change profile photo", style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: GoogerColors.blue)),
            const SizedBox(height: 20),
          ]),
        ),
        field("Full Name", nameCtrl, "Your name"),
        field("Username", usernameCtrl, "username", onChanged: _checkUsername, note: usernameNote),
        field("Bio", bioCtrl, "Tell Googer about yourself", lines: 3),
        field("Country", countryCtrl, "Country"),
        field("Phone", phoneCtrl, "+94 â€¦"),
        FilledButton(
          onPressed: saving ? null : _save,
          child: saving
              ? const GoogerSpinner(size: 16, color: Color(0xFF111111))
              : const Text("Save Changes"),
        ),
        const SizedBox(height: 10),
        OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text("Cancel")),
      ]),
    );
  }
}
