import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../data/mock.dart' show Conversation;
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/storage.dart';
import '../widgets/message_status_ring.dart';
import '../widgets/verified_badge.dart';
import 'chat_dm_screen.dart';

/// Chats tab — live port of the web `dashboard/chats` conversation list.
/// Search, presence, unread badges, per-conversation menu (block / hide /
/// delete), blocked-users sheet and call summaries.
class ChatsScreen extends StatefulWidget {
  /// Query typed into the shared [GoogerTopbar]. This screen has no search box
  /// of its own — the topbar's is the only one, matching the shop.
  final String searchQuery;

  const ChatsScreen({super.key, this.searchQuery = ''});

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  List<Conversation> _convos = const [];
  String _query = "";
  bool _loading = true;
  Timer? _poll;

  /// Drives whether the blocked-users shortcut is shown at all.
  int _blockedCount = 0;

  /// The web keeps hidden chat ids locally because `/chat/conversations`
  /// filters them out. Keep a small snapshot so Flutter can show a restore
  /// sheet after a chat has disappeared from the backend list.
  final Map<int, Conversation> _hidden = {};

  /// A block hides the conversation from the backend list but does not delete
  /// its messages. Keep the last list row until the user unblocks the peer so
  /// the same thread (preview, avatar and message history) can be restored.
  final Map<int, Conversation> _blockedSnapshots = {};

  /// Users matching the search that aren't already in the conversation list —
  /// searching should be able to start a new chat, not just filter existing
  /// ones.
  List<Map<String, dynamic>> _userResults = const [];
  bool _searchingUsers = false;
  Timer? _searchDebounce;

  /// Conversations pinned to the top, and those hidden by a swipe-delete this
  /// session (the row is removed immediately; the server call follows).
  final Set<int> _pinned = {};

  @override
  void didUpdateWidget(covariant ChatsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.searchQuery != widget.searchQuery) {
      _onSearchChanged(widget.searchQuery);
    }
  }

  @override
  void initState() {
    super.initState();
    _restoreLocalChatState();
    if (widget.searchQuery.isNotEmpty) {
      _onSearchChanged(widget.searchQuery);
    }
    _load();
    // Web polls the conversation list; keep unread counts fresh.
    _poll = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _load(silent: true),
    );
    Api.updatePresence();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _searchDebounce?.cancel();
    super.dispose();
  }

  String get _hiddenKey => 'googer_hidden_chats_${Api.currentUserId}';
  String get _pinnedKey => 'googer_pinned_chats_${Api.currentUserId}';
  String get _blockedSnapshotKey =>
      'googer_blocked_chat_snapshots_${Api.currentUserId}';

  void _restoreLocalChatState() {
    try {
      final rawHidden = readStorage(_hiddenKey);
      if (rawHidden != null && rawHidden.isNotEmpty) {
        final decoded = jsonDecode(rawHidden);
        if (decoded is List) {
          for (final entry in decoded.whereType<Map>()) {
            final convo = _conversationFromStorage(entry);
            if (convo.peerId != 0) _hidden[convo.peerId] = convo;
          }
        }
      }
    } catch (_) {}
    try {
      final rawBlocked = readStorage(_blockedSnapshotKey);
      if (rawBlocked != null && rawBlocked.isNotEmpty) {
        final decoded = jsonDecode(rawBlocked);
        if (decoded is List) {
          for (final entry in decoded.whereType<Map>()) {
            final convo = _conversationFromStorage(entry);
            if (convo.peerId != 0) _blockedSnapshots[convo.peerId] = convo;
          }
        }
      }
    } catch (_) {}
    try {
      final rawPinned = readStorage(_pinnedKey);
      if (rawPinned != null && rawPinned.isNotEmpty) {
        final decoded = jsonDecode(rawPinned);
        if (decoded is List) {
          _pinned
            ..clear()
            ..addAll(
              decoded
                  .map((e) => int.tryParse('$e') ?? 0)
                  .where((id) => id != 0),
            );
        }
      }
    } catch (_) {}
  }

  void _persistHidden() {
    final data = _hidden.values
        .map(
          (c) => {
            'peerId': c.peerId,
            'username': c.username,
            'name': c.name,
            'img': _avatarFor(c),
            'last': c.last,
            'time': c.time,
            'unread': c.unread,
            'online': c.online,
            'lastStatus': c.lastStatus,
            'lastFromMe': c.lastFromMe,
          },
        )
        .toList(growable: false);
    writeStorage(_hiddenKey, jsonEncode(data));
  }

  void _persistPinned() =>
      writeStorage(_pinnedKey, jsonEncode(_pinned.toList()));

  void _persistBlockedSnapshots() {
    final data = _blockedSnapshots.values
        .map(
          (c) => {
            'peerId': c.peerId,
            'username': c.username,
            'name': c.name,
            'img': _avatarFor(c),
            'last': c.last,
            'time': c.time,
            'unread': c.unread,
            'online': c.online,
            'lastStatus': c.lastStatus,
            'lastFromMe': c.lastFromMe,
          },
        )
        .toList(growable: false);
    writeStorage(_blockedSnapshotKey, jsonEncode(data));
  }

  void _rememberBlockedConversation(Conversation c) {
    _blockedSnapshots[c.peerId] = c;
    _persistBlockedSnapshots();
  }

  Conversation _conversationFromStorage(Map entry) => Conversation(
    '${entry['username'] ?? ''}',
    '${entry['name'] ?? ''}',
    '${entry['img'] ?? ''}',
    '${entry['last'] ?? ''}',
    '${entry['time'] ?? ''}',
    int.tryParse('${entry['unread'] ?? 0}') ?? 0,
    entry['online'] == true,
    int.tryParse('${entry['peerId'] ?? 0}') ?? 0,
    '${entry['lastStatus'] ?? 'sent'}',
    entry['lastFromMe'] == true,
  );

  Future<void> _load({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    final items = await Api.chats();
    final blocked = await Api.blockedChatUsers();
    if (!mounted) return;
    final blockedIds = blocked
        .map((u) => int.tryParse('${u['id'] ?? u['user_id'] ?? 0}') ?? 0)
        .where((id) => id != 0)
        .toSet();
    final serverIds = items.map((c) => c.peerId).toSet();
    for (final id in serverIds) {
      if (!blockedIds.contains(id)) _blockedSnapshots.remove(id);
    }
    final restored = _blockedSnapshots.values
        .where((c) => !blockedIds.contains(c.peerId))
        .where((c) => !serverIds.contains(c.peerId))
        .where(
          (c) =>
              c.peerId.toString() != Api.currentUserId.trim() &&
              c.username.trim().toLowerCase() !=
                  Api.username.trim().toLowerCase(),
        );
    setState(() {
      _convos = [...items, ...restored];
      for (final c in items) {
        _hidden.remove(c.peerId);
      }
      _persistHidden();
      _pinned.removeWhere((id) => !_convos.any((c) => c.peerId == id));
      _persistPinned();
      _blockedCount = blocked.length;
      _loading = false;
    });
    _persistBlockedSnapshots();
    unawaited(_backfillAvatars());
  }

  /// Some conversation rows come back without a picture. Rather than settle for
  /// a letter placeholder, look the peer up and fill the avatar in. Cached per
  /// peer so the list poll doesn't refetch every 20s.
  final Map<int, String> _avatarCache = {};

  Future<void> _backfillAvatars() async {
    final missing = _convos
        .where(
          (c) =>
              c.img.trim().isEmpty &&
              c.peerId != 0 &&
              !_avatarCache.containsKey(c.peerId),
        )
        .map((c) => c.peerId)
        .take(12)
        .toList();
    if (missing.isEmpty) return;

    for (final peerId in missing) {
      final user = await Api.userById(peerId);
      final picture = (Api.rawAvatar(user) ?? '').trim();
      // Cache the miss too, so a peer with no picture isn't retried forever.
      _avatarCache[peerId] = picture.isEmpty ? '' : Api.resolveAvatar(picture);
    }
    if (!mounted) return;
    setState(() {});
  }

  /// The resolved avatar for a row — the conversation's own picture when it has
  /// one, otherwise whatever the backfill found.
  String _avatarFor(Conversation c) =>
      c.img.trim().isNotEmpty ? c.img : (_avatarCache[c.peerId] ?? '');

  /// Searching looks up Googers as well as filtering the list, so a chat can be
  /// started with someone you have never messaged.
  void _onSearchChanged(String value) {
    setState(() => _query = value);
    _searchDebounce?.cancel();
    final term = value.trim();
    if (term.isEmpty) {
      setState(() {
        _userResults = const [];
        _searchingUsers = false;
      });
      return;
    }
    setState(() => _searchingUsers = true);
    _searchDebounce = Timer(const Duration(milliseconds: 350), () async {
      // searchPeople excludes staff/support, deactivated and blocked accounts
      // server-side, so Googer Support can never surface here either.
      final users = await Api.searchPeople(term);
      if (!mounted) return;
      final known = _convos.map((c) => c.peerId).toSet();
      setState(() {
        _userResults = users.where((u) {
          final id = int.tryParse('${u["id"] ?? 0}') ?? 0;
          return id != 0 &&
              id.toString() != Api.currentUserId.trim() &&
              '${u["username"] ?? ''}'.trim().toLowerCase() !=
                  Api.username.trim().toLowerCase() &&
              !known.contains(id);
        }).toList();
        _searchingUsers = false;
      });
    });
  }

  List<Conversation> get _visible {
    final q = _query.trim().toLowerCase();
    final ordered =
        _convos
            .where(
              (c) =>
                  !_hidden.containsKey(c.peerId) &&
                  c.peerId.toString() != Api.currentUserId.trim() &&
                  c.username.trim().toLowerCase() !=
                      Api.username.trim().toLowerCase(),
            )
            .toList(growable: false)
          ..sort((a, b) {
            final ap = _pinned.contains(a.peerId) ? 0 : 1;
            final bp = _pinned.contains(b.peerId) ? 0 : 1;
            return ap.compareTo(bp);
          });
    if (q.isEmpty) return ordered;
    return ordered
        .where(
          (c) =>
              c.name.toLowerCase().contains(q) ||
              c.username.toLowerCase().contains(q) ||
              c.last.toLowerCase().contains(q),
        )
        .toList();
  }

  void _togglePin(Conversation c) {
    setState(() {
      _pinned.contains(c.peerId)
          ? _pinned.remove(c.peerId)
          : _pinned.add(c.peerId);
      _persistPinned();
    });
  }

  Future<void> _hideConversation(Conversation c) async {
    setState(() {
      _hidden[c.peerId] = c;
      _convos = _convos.where((x) => x.peerId != c.peerId).toList();
      _pinned.remove(c.peerId);
      _persistHidden();
      _persistPinned();
    });
    final ok = await Api.hideConversation(c.peerId);
    if (!mounted) return;
    if (ok) {
      AppNotifications.info('Conversation hidden');
    } else {
      AppNotifications.error('Could not hide conversation');
      _hidden.remove(c.peerId);
      _persistHidden();
      _load(silent: true);
    }
  }

  Future<void> _unhideConversation(Conversation c) async {
    final ok = await Api.unhideConversation(c.peerId);
    if (!mounted) return;
    if (!ok) {
      AppNotifications.error('Could not restore conversation');
      return;
    }
    setState(() {
      _hidden.remove(c.peerId);
      _persistHidden();
    });
    AppNotifications.info('Conversation restored');
    _load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final convos = _visible;
    final queryActive = _query.trim().isNotEmpty;
    final listChildren = <Widget>[
      if (convos.isEmpty && !queryActive) ...[
        const SizedBox(height: 120),
        const Center(
          child: Text(
            'No conversations yet',
            style: TextStyle(fontSize: 12.5, color: AppColors.textGray500),
          ),
        ),
      ] else ...[
        for (var i = 0; i < convos.length; i++) ...[
          _swipeableTile(convos[i]),
          if (i != convos.length - 1)
            const Divider(height: 1, color: AppColors.borderWhite06),
        ],
      ],
      if (queryActive) _userSearchSection(),
    ];
    return Column(
      children: [
        // Identity row, matching the web chats header.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          child: Row(
            children: [
              _Avatar(url: Api.avatar ?? '', name: Api.displayName, size: 34),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            Api.displayName.toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12.5,
                              letterSpacing: 1.2,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(width: 5),
                        UserVerifiedBadge(userId: Api.currentUserId, size: 12),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '@${Api.username}',
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
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(
                  color: AppColors.likeRed,
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 5),
          child: Row(
            children: [
              Text(
                '${convos.length} CONVERSATIONS',
                style: const TextStyle(
                  fontSize: 10,
                  letterSpacing: 2,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textGray500,
                ),
              ),
              const SizedBox(width: 8),
              if (_blockedCount > 0)
                _statusChip(
                  Ionicons.ban_outline,
                  '$_blockedCount BLOCKED',
                  _openBlockedUsers,
                  color: const Color(0xFFF97316),
                ),
              if (_hidden.isNotEmpty) ...[
                const SizedBox(width: 6),
                _statusChip(
                  Ionicons.eye_off_outline,
                  '${_hidden.length} HIDDEN',
                  _openHiddenUsers,
                  color: AppColors.textGray300,
                ),
              ],
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      color: AppColors.textGray400,
                      strokeWidth: 2,
                    ),
                  ),
                )
              : RefreshIndicator(
                  color: AppColors.textGray300,
                  backgroundColor: AppColors.bg1,
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    children: listChildren,
                  ),
                ),
        ),
      ],
    );
  }

  /// Swipe left to delete, right to pin — the two row gestures the web list
  /// offers.
  Widget _swipeableTile(Conversation c) {
    final pinned = _pinned.contains(c.peerId);
    return Dismissible(
      key: ValueKey('convo-${c.peerId}'),
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        color: AppColors.utilityBlue.withOpacity(0.25),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              pinned ? Ionicons.remove_circle_outline : Ionicons.pin_outline,
              size: 17,
              color: Colors.white,
            ),
            const SizedBox(width: 8),
            Text(
              pinned ? 'UNPIN' : 'PIN',
              style: const TextStyle(
                fontSize: 10,
                letterSpacing: 1.3,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
      secondaryBackground: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        color: AppColors.likeRed.withOpacity(0.3),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'DELETE',
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1.3,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            SizedBox(width: 8),
            Icon(Ionicons.trash_outline, size: 17, color: Colors.white),
          ],
        ),
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          // Pin is a toggle, not a dismissal — keep the row in place.
          _togglePin(c);
          return false;
        }
        return _confirmDeleteConversation(c);
      },
      onDismissed: (_) async {
        setState(() {
          _convos = _convos.where((x) => x.peerId != c.peerId).toList();
          _pinned.remove(c.peerId);
          _persistPinned();
        });
        final ok = await Api.deleteConversation(c.peerId);
        if (!mounted) return;
        if (ok) {
          AppNotifications.info('Conversation deleted');
        } else {
          AppNotifications.error('Could not delete conversation');
          _load(silent: true);
        }
      },
      child: _tile(c),
    );
  }

  Future<bool> _confirmDeleteConversation(Conversation c) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFF121216),
        title: const Text(
          'Delete conversation',
          style: TextStyle(fontSize: 15, color: Colors.white),
        ),
        content: Text(
          'This removes the thread with ${c.name.isEmpty ? c.username : c.name}.',
          style: const TextStyle(fontSize: 13, color: AppColors.textGray400),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(
              'Cancel',
              style: TextStyle(color: AppColors.textGray300),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(
              'Delete',
              style: TextStyle(color: AppColors.likeRed),
            ),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  /// Googers matching the search who have no thread yet — tapping one opens a
  /// fresh conversation.
  Widget _userSearchSection() {
    if (_searchingUsers) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 26),
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.textGray400,
            ),
          ),
        ),
      );
    }
    if (_userResults.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(8, 18, 8, 8),
          child: Text(
            'GOOGERS',
            style: TextStyle(
              fontSize: 9.5,
              letterSpacing: 1.6,
              fontWeight: FontWeight.w600,
              color: AppColors.textGray600,
            ),
          ),
        ),
        for (final user in _userResults) _userResultTile(user),
      ],
    );
  }

  Widget _userResultTile(Map<String, dynamic> user) {
    final name = '${user["full_name"] ?? user["username"] ?? "Googer user"}';
    final username = '${user["username"] ?? ""}';
    final picture = '${user["profile_picture"] ?? ""}';
    final peerId = int.tryParse('${user["id"] ?? 0}') ?? 0;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 6),
      onTap: peerId == 0
          ? null
          : () async {
              final hidden = _hidden[peerId];
              if (hidden != null) await _unhideConversation(hidden);
              if (!mounted) return;
              await Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChatDmScreen(
                    name: name,
                    username: username,
                    avatar: picture.isEmpty ? '' : Api.resolveAvatar(picture),
                    peerId: peerId,
                  ),
                ),
              );
              if (mounted) _load(silent: true);
            },
      leading: _Avatar(
        url: picture.isEmpty ? '' : Api.resolveAvatar(picture),
        name: name,
        size: 42,
      ),
      title: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 12.5,
          fontWeight: FontWeight.w500,
          color: Colors.white,
        ),
      ),
      subtitle: Text(
        '@$username',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 11, color: AppColors.textGray600),
      ),
      trailing: const Icon(
        Ionicons.chatbubble_outline,
        size: 16,
        color: AppColors.textGray500,
      ),
    );
  }

  Widget _statusChip(
    IconData icon,
    String label,
    VoidCallback onTap, {
    required Color color,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: color.withOpacity(0.35)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 11, color: color),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 0.8,
                fontWeight: FontWeight.w800,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile(Conversation c) {
    return InkWell(
      onTap: () {
        _rememberBlockedConversation(c);
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ChatDmScreen(
              name: c.name,
              username: c.username,
              avatar: _avatarFor(c),
              peerId: c.peerId,
            ),
          ),
        ).then((_) => _load(silent: true));
      },
      onLongPress: () => _openConvoMenu(c),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                _Avatar(url: _avatarFor(c), name: c.name, size: 42),
                if (c.online)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 11,
                      height: 11,
                      decoration: BoxDecoration(
                        color: AppColors.successGreen,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.bg0, width: 2),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          c.name.isEmpty ? c.username : c.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      if (c.time.isNotEmpty)
                        Text(
                          Api.relativeTime(c.time),
                          style: const TextStyle(
                            fontSize: 10,
                            color: AppColors.textGray600,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          c.last.isEmpty ? 'Tap to start chatting' : c.last,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11.5,
                            color: c.unread > 0
                                ? AppColors.textGray300
                                : AppColors.textGray600,
                            fontWeight: c.unread > 0
                                ? FontWeight.w600
                                : FontWeight.w400,
                          ),
                        ),
                      ),
                      // My own last message gets a delivery ring; the peer's
                      // gets an unread badge. They never both apply.
                      if (c.lastFromMe && c.unread == 0) ...[
                        const SizedBox(width: 8),
                        MessageStatusRing(status: c.lastStatus, listSize: true),
                      ],
                      if (c.unread > 0) ...[
                        const SizedBox(width: 8),
                        Container(
                          constraints: const BoxConstraints(
                            minWidth: 18,
                            minHeight: 18,
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          decoration: BoxDecoration(
                            color: AppColors.likeRed,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '${c.unread}',
                            style: const TextStyle(
                              fontWeight: FontWeight.w500,
                              fontSize: 9.5,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openConvoMenu(Conversation c) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _menuItem(
              _pinned.contains(c.peerId)
                  ? Ionicons.remove_circle_outline
                  : Ionicons.pin_outline,
              _pinned.contains(c.peerId) ? 'Unpin' : 'Pin to top',
              () {
                Navigator.maybePop(sheetContext);
                _togglePin(c);
              },
            ),
            // The list-level call button is gone (calls start inside a thread),
            // so history lives here rather than disappearing with it.
            _menuItem(Ionicons.call_outline, 'Call history', () {
              Navigator.maybePop(sheetContext);
              _openCallSummaries();
            }),
            _menuItem(Ionicons.eye_off_outline, 'Hide conversation', () async {
              Navigator.maybePop(sheetContext);
              await _hideConversation(c);
            }),
            _menuItem(Ionicons.ban_outline, 'Block user', () async {
              Navigator.maybePop(sheetContext);
              if (await Api.blockChatUser(c.peerId)) {
                setState(() {
                  _rememberBlockedConversation(c);
                  _convos = _convos.where((x) => x.peerId != c.peerId).toList();
                  _hidden.remove(c.peerId);
                  _pinned.remove(c.peerId);
                  _persistHidden();
                  _persistPinned();
                });
                AppNotifications.info('Blocked @${c.username}');
                _load(silent: true);
              }
            }, danger: true),
            _menuItem(Ionicons.trash_outline, 'Delete conversation', () async {
              Navigator.maybePop(sheetContext);
              if (await Api.deleteConversation(c.peerId)) {
                setState(() {
                  _convos = _convos.where((x) => x.peerId != c.peerId).toList();
                  _hidden.remove(c.peerId);
                  _pinned.remove(c.peerId);
                  _persistHidden();
                  _persistPinned();
                });
                AppNotifications.info('Conversation deleted');
                _load(silent: true);
              }
            }, danger: true),
          ],
        ),
      ),
    );
  }

  Widget _menuItem(
    IconData icon,
    String label,
    VoidCallback onTap, {
    bool danger = false,
  }) {
    return ListTile(
      leading: Icon(
        icon,
        size: 20,
        color: danger ? AppColors.likeRed : Colors.white,
      ),
      title: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: danger ? AppColors.likeRed : Colors.white,
        ),
      ),
      onTap: onTap,
    );
  }

  void _openBlockedUsers() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _ListSheet(
        title: 'Blocked users',
        emptyLabel: 'You have not blocked anyone',
        load: Api.blockedChatUsers,
        trailingBuilder: (item, refresh) => TextButton(
          onPressed: () async {
            final id = int.tryParse('${item["id"] ?? item["user_id"] ?? ""}');
            if (id == null) return;
            if (await Api.unblockChatUser(id)) {
              AppNotifications.info('User unblocked');
              refresh();
              await _load(silent: true);
            }
          },
          child: const Text(
            'Unblock',
            style: TextStyle(fontSize: 11, color: AppColors.purpleText),
          ),
        ),
      ),
    );
  }

  void _openHiddenUsers() {
    final items = _hidden.values.toList(growable: false);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => SizedBox(
        height: MediaQuery.of(context).size.height * 0.6,
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.textGray700,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Hidden chats',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
            const Divider(height: 1, color: AppColors.borderWhite10),
            Expanded(
              child: items.isEmpty
                  ? const Center(
                      child: Text(
                        'No hidden chats',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textGray500,
                        ),
                      ),
                    )
                  : ListView.builder(
                      itemCount: items.length,
                      itemBuilder: (context, index) {
                        final c = items[index];
                        return ListTile(
                          leading: _Avatar(
                            url: _avatarFor(c),
                            name: c.name.isEmpty ? c.username : c.name,
                            size: 38,
                          ),
                          title: Text(
                            c.name.isEmpty ? c.username : c.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                            ),
                          ),
                          subtitle: Text(
                            '@${c.username}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.textGray600,
                            ),
                          ),
                          trailing: TextButton(
                            onPressed: () async {
                              Navigator.maybePop(context);
                              await _unhideConversation(c);
                            },
                            child: const Text(
                              'Restore',
                              style: TextStyle(
                                fontSize: 11,
                                color: AppColors.purpleText,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  void _openCallSummaries() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _ListSheet(
        title: 'Calls',
        emptyLabel: 'No calls yet',
        load: Api.callSummaries,
      ),
    );
  }
}

/// Generic sheet that loads a list of user-ish maps (blocked users, calls).
class _ListSheet extends StatefulWidget {
  final String title;
  final String emptyLabel;
  final Future<List<Map<String, dynamic>>> Function() load;
  final Widget Function(Map<String, dynamic> item, VoidCallback refresh)?
  trailingBuilder;
  const _ListSheet({
    required this.title,
    required this.emptyLabel,
    required this.load,
    this.trailingBuilder,
  });

  @override
  State<_ListSheet> createState() => _ListSheetState();
}

class _ListSheetState extends State<_ListSheet> {
  List<Map<String, dynamic>> _items = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    if (mounted) setState(() => _loading = true);
    final items = await widget.load();
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  String _pick(Map<String, dynamic> m, List<String> keys) {
    for (final k in keys) {
      final v = m[k];
      if (v != null && '$v'.trim().isNotEmpty) return '$v';
    }
    return '';
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.6,
      child: Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.textGray700,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              widget.title,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
          const Divider(height: 1, color: AppColors.borderWhite10),
          Expanded(
            child: _loading
                ? const Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        color: AppColors.textGray400,
                        strokeWidth: 2,
                      ),
                    ),
                  )
                : _items.isEmpty
                ? Center(
                    child: Text(
                      widget.emptyLabel,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textGray500,
                      ),
                    ),
                  )
                : ListView.builder(
                    itemCount: _items.length,
                    itemBuilder: (_, i) {
                      final item = _items[i];
                      final name = _pick(item, [
                        'full_name',
                        'name',
                        'username',
                        'peer_name',
                      ]);
                      final sub = _pick(item, [
                        'username',
                        'call_type',
                        'status',
                        'created_at',
                      ]);
                      final avatar = _pick(item, [
                        'profile_picture',
                        'avatar',
                        'img',
                      ]);
                      return ListTile(
                        leading: _Avatar(
                          url: avatar.isEmpty ? '' : Api.resolveAvatar(avatar),
                          name: name,
                          size: 38,
                        ),
                        title: Text(
                          name.isEmpty ? 'Googer user' : name,
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                            color: Colors.white,
                          ),
                        ),
                        subtitle: sub.isEmpty
                            ? null
                            : Text(
                                sub,
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.textGray500,
                                ),
                              ),
                        trailing: widget.trailingBuilder?.call(item, _refresh),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String url;
  final String name;
  final double size;
  const _Avatar({required this.url, required this.name, this.size = 40});

  @override
  Widget build(BuildContext context) {
    final bytes = Api.decodeDataUri(url);
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2563EB), Color(0xFF7C3AED)],
        ),
      ),
      child: url.trim().isEmpty
          ? _initial()
          : bytes != null
          ? Image.memory(
              bytes,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _initial(),
            )
          : Image.network(
              url,
              fit: BoxFit.cover,
              webHtmlElementStrategy: WebHtmlElementStrategy.prefer,
              errorBuilder: (_, __, ___) => _initial(),
            ),
    );
  }

  Widget _initial() => Center(
    child: Text(
      name.trim().isEmpty ? '?' : name.trim().substring(0, 1).toUpperCase(),
      style: TextStyle(
        fontSize: size * 0.4,
        fontWeight: FontWeight.w600,
        color: Colors.white,
      ),
    ),
  );
}
