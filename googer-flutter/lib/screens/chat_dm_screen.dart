import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../data/mock.dart' show HomeAd;
import '../services/app_notifications.dart';
import '../theme/colors.dart';
import '../util/audio_recorder.dart';
import '../util/chat_rich_text.dart';
import '../util/speech_to_text.dart';
import '../util/storage.dart';
import '../util/tts_speaker.dart';
import '../widgets/app_back_button.dart';
import '../widgets/chat_selection_bar.dart';
import '../widgets/message_status_ring.dart';
import '../widgets/verified_badge.dart';
import 'product_promote_screen.dart';
import 'user_profile_screen.dart';
import 'home_feed_screen.dart' show openSponsoredAdDetail;

/// Chat thread — live port of the web `dashboard/chats` message pane.
/// Text send, reply-to, forward, multi-select delete (me / everyone),
/// typing indicator, presence, block, and voice/video call start.
class ChatDmScreen extends StatefulWidget {
  final String name;
  final String username;
  final String avatar;
  final int peerId;

  const ChatDmScreen({
    super.key,
    required this.name,
    this.username = '',
    this.avatar = '',
    required this.peerId,
  });

  @override
  State<ChatDmScreen> createState() => _ChatDmScreenState();
}

class _ChatDmScreenState extends State<ChatDmScreen> {
  static const _chatHeaderBg = Color(0xFF101010);
  static const _chatCanvasBg = Color(0xFF0B0B0B);
  static const _chatPanelBg = Color(0xFF0E1116);
  static const _chatControlBg = Color(0xFF171717);
  static const _chatStroke = Color(0xFF2B2B2B);
  static const _chatMuted = Color(0xFF8C8F98);

  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();

  List<Map<String, dynamic>> _messages = const [];
  bool _loading = true;
  bool _sending = false;
  bool _peerTyping = false;
  bool _peerOnline = false;
  DateTime? _peerLastSeen;
  Timer? _poll;
  Timer? _typingDebounce;

  Map<String, dynamic>? _replyTo;
  final Set<String> _selected = {};
  bool get _selecting => _selected.isNotEmpty;

  // ---- Composer panels (web parity) ----
  bool _stickersOpen = false;
  bool _colorOpen = false;
  bool _recording = false;
  bool _listening = false;
  bool _ttsEnabled = false;
  bool _ttsSettingsOpen = false;
  String _ttsVoiceGender = 'female';
  Map<String, dynamic> _features = const {};
  Timer? _ttsLongPressTimer;
  bool _ttsLongPressFired = false;
  String? _speakingMessageId;
  Duration _recordedFor = Duration.zero;
  Timer? _recordTicker;
  Duration _listenedFor = Duration.zero;
  Timer? _listenTicker;

  /// Outgoing message colour. Only applied once the user hits APPLY, matching
  /// the web where the picker is inert until confirmed.
  Color _messageColor = const Color(0xFFEF4444);
  bool _colorApplied = false;

  /// Sponsored ads injected between messages, and the ones dismissed via
  /// "Not Interested" this session.
  List<HomeAd> _chatAds = const [];
  final Set<String> _hiddenAdIds = {};
  final Map<String, DateTime> _hiddenAdTimes = {};
  final Set<String> _impressedAdIds = {};

  /// The peer's real picture. Seeded from the route, then filled from the
  /// profile endpoint when the conversation row carried none — otherwise the
  /// thread shows a placeholder initial for someone who has an avatar.
  late String _peerAvatar = widget.avatar;
  static const _paletteColors = [
    Color(0xFFEF4444),
    Color(0xFFF97316),
    Color(0xFFEAB308),
    Color(0xFF22C55E),
    Color(0xFF14B8A6),
    Color(0xFF3B82F6),
    Color(0xFF8B5CF6),
    Color(0xFFEC4899),
    Color(0xFFFFFFFF),
    Color(0xFF9CA3AF),
    Color(0xFFF472B6),
    Color(0xFFFB923C),
    Color(0xFFA3E635),
    Color(0xFF34D399),
    Color(0xFF38BDF8),
    Color(0xFFC084FC),
  ];

  /// Call quality, mirroring the web's 240P / 360P switch in the thread header.
  String _quality = '240P';

  static const _stickerCategories = [
    ('trending', '🔥 Trending'),
    ('happy', '😊 Happy'),
    ('love', '❤️ Love'),
    ('funny', '😂 Funny'),
    ('cute', '🐱 Cute'),
  ];
  String _stickerCategory = 'trending';
  List<Map<String, dynamic>> _stickerResults = const [];
  bool _stickersLoading = false;
  String _stickerError = '';

  @override
  void initState() {
    super.initState();
    _load();
    _loadFeatures();
    _restoreHiddenChatAds();
    _loadChatAds();
    _restoreTtsPrefs();
    _loadPeerIdentity();
    Api.updatePresence(activeParticipantId: widget.peerId);
    _poll = Timer.periodic(const Duration(seconds: 5), (_) async {
      await _load(silent: true);
      final typing = await Api.peerTyping(widget.peerId);
      if (mounted && typing != _peerTyping) {
        setState(() => _peerTyping = typing);
      }
      await _loadPeerIdentity(silent: true);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _typingDebounce?.cancel();
    _recordTicker?.cancel();
    _listenTicker?.cancel();
    _ttsLongPressTimer?.cancel();
    BrowserSpeechToText.stop();
    TtsSpeaker.stop();
    _input.dispose();
    _scroll.dispose();
    Api.updatePresence();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    final items = await Api.chatMessages(widget.peerId);
    if (!mounted) return;
    final grew = items.length != _messages.length;
    setState(() {
      _messages = items;
      _loading = false;
    });
    if (grew) _jumpToEnd();
  }

  void _jumpToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  bool _isMine(Map<String, dynamic> m) {
    final me = Api.currentUserId;
    final sender = '${m["sender_id"] ?? m["senderId"] ?? m["from_id"] ?? ""}';
    if (sender.isNotEmpty && me.isNotEmpty) return sender == me;
    return m['mine'] == true || m['is_mine'] == true || m['fromSelf'] == true;
  }

  String _msgId(Map<String, dynamic> m) =>
      '${m["id"] ?? m["message_id"] ?? ""}';

  String _text(Map<String, dynamic> m) =>
      '${m["text"] ?? m["message"] ?? m["content"] ?? m["body"] ?? ""}';

  String _type(Map<String, dynamic> m) =>
      '${m["type"] ?? m["message_type"] ?? "text"}'.toLowerCase();

  String get _ttsEnabledKey => 'googer_chat_tts_enabled_${Api.currentUserId}';
  String get _ttsVoiceKey => 'googer_chat_tts_voice_${Api.currentUserId}';

  bool _featureEnabled(String key, {bool fallback = false}) {
    final value = _features[key];
    if (value == null) return fallback;
    if (value is bool) return value;
    if (value is num) return value != 0;
    final text = '$value'.trim().toLowerCase();
    return text == 'true' || text == '1' || text == 'yes' || text == 'on';
  }

  bool get _canUseChatColors => _featureEnabled('chat_text_colors');
  bool get _canUseStickers => _featureEnabled('chat_stickers');
  bool get _canUseTextToVoice => _featureEnabled('text_to_voice');
  bool get _canUseVoiceToText => _featureEnabled('voice_to_text');
  bool get _canUseVoiceCalls => _featureEnabled('voice_calls', fallback: true);
  bool get _canUseVideoCalls => _featureEnabled('video_calls');

  List<String> get _availableVideoQualities {
    final configured = '${_features['video_call_quality'] ?? '240p'}'
        .toLowerCase();
    return configured.contains('360p')
        ? const ['240P', '360P']
        : const ['240P'];
  }

  Future<void> _loadFeatures() async {
    final features = await Api.myFeatures();
    if (!mounted || features == null) return;
    setState(() {
      _features = features;
      if (!_canUseChatColors) {
        _colorOpen = false;
        _colorApplied = false;
      }
      if (!_canUseTextToVoice) {
        _ttsEnabled = false;
        _ttsSettingsOpen = false;
      }
    });
  }

  void _restoreTtsPrefs() {
    _ttsEnabled = readStorage(_ttsEnabledKey) == '1';
    _ttsVoiceGender = readStorage(_ttsVoiceKey) == 'male' ? 'male' : 'female';
  }

  void _persistTtsPrefs() {
    writeStorage(_ttsEnabledKey, _ttsEnabled ? '1' : '0');
    writeStorage(_ttsVoiceKey, _ttsVoiceGender);
  }

  String _encodeTtsMessage(String text) => '[tts_voice=$_ttsVoiceGender]$text';

  ({String text, String gender}) _decodeTtsMessage(String raw) {
    final match = RegExp(
      r'^\[tts_voice=(male|female)\]([\s\S]*)$',
      caseSensitive: false,
    ).firstMatch(raw);
    return (
      text: match?.group(2) ?? raw,
      gender: match?.group(1)?.toLowerCase() == 'male' ? 'male' : 'female',
    );
  }

  String _image(Map<String, dynamic> m) {
    final raw = '${m["image_url"] ?? m["imageUrl"] ?? m["media_url"] ?? ""}';
    return raw.trim().isEmpty ? '' : Api.resolveMedia(raw);
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    // Colour travels inside the body as `[c=#hex]…[/c]`, not as its own field —
    // that is the contract ChatRichText parses on the web.
    final body = _colorApplied ? ChatRichText.wrap(text, _messageColor) : text;
    final sendAsTts = _ttsEnabled;
    final ok = await Api.sendChatMessage(
      widget.peerId,
      sendAsTts ? _encodeTtsMessage(body) : body,
      type: sendAsTts ? 'voice_tts' : 'text',
      replyToId: _replyTo == null ? null : _msgId(_replyTo!),
    );
    if (!mounted) return;
    _input.clear();
    setState(() {
      _sending = false;
      _replyTo = null;
    });
    if (ok) {
      await _load(silent: true);
      _jumpToEnd();
    } else {
      AppNotifications.error('Message not sent');
    }
  }

  void _onTyping(String _) {
    _typingDebounce?.cancel();
    _typingDebounce = Timer(const Duration(milliseconds: 400), Api.sendTyping);
  }

  Future<void> _deleteSelected(String mode) async {
    final ids = _selected.toList();
    final ok = await Api.deleteChatMessages(ids, mode: mode);
    if (!mounted) return;
    setState(() => _selected.clear());
    if (ok) {
      await _load(silent: true);
    } else {
      AppNotifications.error('Could not delete messages');
    }
  }

  Future<void> _startCall(String type) async {
    if (type == 'voice' && !_canUseVoiceCalls) {
      AppNotifications.error(
        'Voice calls are not enabled on your current plan.',
      );
      return;
    }
    if (type == 'video' && !_canUseVideoCalls) {
      AppNotifications.error('Video calls are available in higher plans.');
      return;
    }
    final result = await Api.startCallDetailed(widget.peerId, type);
    final call = result.call;
    if (!mounted) return;
    if (call == null) {
      AppNotifications.error(result.error ?? 'Could not start the $type call');
      return;
    }
    AppNotifications.info(
      '${type == "video" ? "Video" : "Voice"} call started',
      'Calling ${widget.name}…',
    );
    final callId = call['id'] ?? call['call_id'];
    if (callId != null) {
      // Mobile has no WebRTC transport yet — end the placeholder call so the
      // record doesn't stay open on the backend.
      await Api.completeCall(callId, 'completed');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _chatCanvasBg,
      body: Column(
        children: [
          SafeArea(bottom: false, child: _threadHeader()),
          if (_selecting) _selectionBar(),
          Expanded(
            child: Container(
              color: _chatCanvasBg,
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
                  : _messages.isEmpty
                  ? const Center(
                      child: Text(
                        'Say hello 👋',
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.textGray500,
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(12, 44, 12, 8),
                      itemCount: _messages.length,
                      itemBuilder: (_, i) {
                        final ad = _adForSlot(_adSlotBefore(i));
                        final row = ad == null
                            ? _bubble(_messages[i])
                            : Column(
                                children: [
                                  _bubble(_messages[i]),
                                  _sponsoredCard(ad),
                                ],
                              );
                        final showDate =
                            i == 0 ||
                            _messageDay(_messages[i - 1]) !=
                                _messageDay(_messages[i]);
                        if (showDate) {
                          return Column(
                            children: [
                              _datePill(_dateLabel(_messages[i])),
                              row,
                            ],
                          );
                        }
                        return row;
                      },
                    ),
            ),
          ),
          if (_replyTo != null) _replyBar(),
          if (_stickersOpen) _stickerPanel(),
          if (_colorOpen) _colorPanel(),
          if (_ttsSettingsOpen) _ttsSettingsPanel(),
          if (_listening) _listeningBar(),
          if (_recording) _recordingBar(),
          _composer(),
        ],
      ),
    );
  }

  Widget _datePill(String label) {
    return Container(
      margin: const EdgeInsets.only(bottom: 26),
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF3A393B),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 10.5,
          letterSpacing: 0.5,
          fontWeight: FontWeight.w800,
          color: Color(0xFFB8BBC2),
        ),
      ),
    );
  }

  String _dateLabel(Map<String, dynamic> m) {
    final raw = '${m["created_at"] ?? m["createdAt"] ?? ""}';
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return '9 AUG 2026';
    const months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];
    final local = parsed.toLocal();
    return '${local.day} ${months[local.month - 1]} ${local.year}';
  }

  String _messageDay(Map<String, dynamic> message) {
    final raw = '${message["created_at"] ?? message["createdAt"] ?? ""}';
    final date = DateTime.tryParse(raw)?.toLocal();
    return date == null ? '' : '${date.year}-${date.month}-${date.day}';
  }

  Widget _bubble(Map<String, dynamic> m) {
    final mine = _isMine(m);
    final id = _msgId(m);
    final selected = _selected.contains(id);
    final type = _type(m);
    final image = _image(m);
    final text = _text(m);
    final replyText = '${m["reply_to_text"] ?? m["replyToText"] ?? ""}';

    return GestureDetector(
      onLongPress: () => setState(() {
        if (id.isEmpty) return;
        selected ? _selected.remove(id) : _selected.add(id);
      }),
      onTap: _selecting && id.isNotEmpty
          ? () => setState(() {
              selected ? _selected.remove(id) : _selected.add(id);
            })
          : null,
      onDoubleTap: () => setState(() => _replyTo = m),
      child: Container(
        color: selected ? Colors.white.withOpacity(0.06) : Colors.transparent,
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: mine
              ? MainAxisAlignment.end
              : MainAxisAlignment.start,
          children: [
            Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.52,
              ),
              padding: const EdgeInsets.fromLTRB(14, 13, 12, 10),
              decoration: BoxDecoration(
                // The web uses one neutral bubble for both sides —
                // `bg-black/60 border-white/10` (chats/page.tsx:5474). Sent
                // messages are not red; only the selection ring is.
                color: Colors.black.withOpacity(0.92),
                border: Border.all(
                  color: selected
                      ? AppColors.likeRed.withOpacity(0.5)
                      : AppColors.borderWhite10,
                ),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(20),
                  topRight: const Radius.circular(20),
                  bottomLeft: Radius.circular(mine ? 20 : 6),
                  bottomRight: Radius.circular(mine ? 6 : 20),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (replyText.trim().isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.25),
                        borderRadius: BorderRadius.circular(8),
                        border: const Border(
                          left: BorderSide(color: Colors.white54, width: 2),
                        ),
                      ),
                      child: Text(
                        replyText,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 10.5,
                          color: Colors.white70,
                        ),
                      ),
                    ),
                  if (image.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          image,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const SizedBox(),
                        ),
                      ),
                    ),
                  if (type == 'call_record' || type == 'call')
                    _callRecordBody(m, text)
                  else if (type == 'voice_tts')
                    _ttsVoiceBubble(id, text)
                  else if (type == 'voice')
                    const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Ionicons.mic_outline,
                          size: 14,
                          color: Colors.white,
                        ),
                        SizedBox(width: 6),
                        Text(
                          'Voice message',
                          style: TextStyle(fontSize: 12, color: Colors.white),
                        ),
                      ],
                    )
                  else if (text.isNotEmpty)
                    // Colour arrives as inline `[c=…]…[/c]` tags rather than a
                    // field, so the body has to be parsed, not printed.
                    Text.rich(
                      TextSpan(
                        children: ChatRichText.spans(
                          text,
                          baseStyle: const TextStyle(
                            fontSize: 12,
                            height: 1.35,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 3),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        Api.relativeTime(
                          '${m["created_at"] ?? m["createdAt"] ?? ""}',
                        ),
                        style: TextStyle(
                          fontSize: 8,
                          color: Colors.white.withOpacity(0.55),
                        ),
                      ),
                      // Delivery state is only meaningful for messages I sent.
                      if (mine) ...[
                        const SizedBox(width: 6),
                        MessageStatusRing(status: MessageStatusRing.resolve(m)),
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

  Widget _callRecordBody(Map<String, dynamic> message, String text) {
    final status = '${message['call_status'] ?? ''}'.toLowerCase();
    final callType = '${message['call_type'] ?? message['call_mode'] ?? ''}'
        .toLowerCase();
    final missed = status == 'missed';
    final fallback = missed
        ? 'MISSED ${callType == 'video' ? 'VIDEO' : 'VOICE'} CALL'
        : '${callType == 'video' ? 'VIDEO' : 'VOICE'} CALL';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          callType == 'video'
              ? Ionicons.videocam_outline
              : Ionicons.call_outline,
          size: 14,
          color: missed ? const Color(0xFFFF8B98) : Colors.white70,
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            text.trim().isEmpty ? fallback : text.toUpperCase(),
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 0.7,
              fontWeight: FontWeight.w800,
              color: missed ? const Color(0xFFFF8B98) : Colors.white,
            ),
          ),
        ),
      ],
    );
  }

  Widget _ttsVoiceBubble(String id, String rawText) {
    final decoded = _decodeTtsMessage(rawText);
    final speaking = _speakingMessageId == id;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: () async {
            if (speaking) {
              TtsSpeaker.stop();
              if (mounted) setState(() => _speakingMessageId = null);
              return;
            }
            setState(() => _speakingMessageId = id);
            await TtsSpeaker.speak(decoded.text, gender: decoded.gender);
          },
          child: Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: Colors.black,
              shape: BoxShape.circle,
            ),
            child: Icon(
              speaking ? Ionicons.pause : Ionicons.play,
              size: 16,
              color: AppColors.likeRed,
            ),
          ),
        ),
        const SizedBox(width: 9),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Voice message',
              style: TextStyle(
                fontSize: 11,
                letterSpacing: 1,
                fontWeight: FontWeight.w700,
                color: AppColors.likeRed,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${decoded.gender} voice',
              style: const TextStyle(
                fontSize: 9,
                letterSpacing: 0.9,
                fontWeight: FontWeight.w600,
                color: AppColors.textGray500,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _replyBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
      decoration: const BoxDecoration(
        color: AppColors.bg2,
        border: Border(top: BorderSide(color: AppColors.borderWhite10)),
      ),
      child: Row(
        children: [
          Container(width: 2, height: 30, color: AppColors.accentPurple),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Replying to',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w500,
                    color: AppColors.purpleText,
                  ),
                ),
                Text(
                  _text(_replyTo!),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textGray400,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(
              Ionicons.close_outline,
              size: 18,
              color: AppColors.textGray500,
            ),
            onPressed: () => setState(() => _replyTo = null),
          ),
        ],
      ),
    );
  }

  Future<void> _loadPeerIdentity({bool silent = false}) async {
    final user = await Api.userById(widget.peerId);
    if (!mounted || user == null) return;
    final picture = (Api.rawAvatar(user) ?? '').trim();
    final status = '${user['status'] ?? user['presence_status'] ?? ''}'
        .toLowerCase();
    final lastSeenRaw = '${user['last_seen_at'] ?? user['lastSeenAt'] ?? ''}';
    final lastSeen = DateTime.tryParse(lastSeenRaw)?.toLocal();
    final online = status == 'online';
    if (silent &&
        picture.isEmpty &&
        online == _peerOnline &&
        lastSeen == _peerLastSeen) {
      return;
    }
    setState(() {
      if (picture.isNotEmpty) _peerAvatar = Api.resolveAvatar(picture);
      _peerOnline = online;
      _peerLastSeen = lastSeen;
    });
  }

  // ---- Sponsored ads in the thread ----

  Future<void> _loadChatAds() async {
    final ads = await Api.activeAds(shuffleSeed: 'chat-${widget.peerId}');
    if (!mounted) return;
    setState(() => _chatAds = ads.where((ad) => !ad.isProfilePromote).toList());
  }

  String get _hiddenChatAdsKey =>
      'googer-hidden-chat-ads-${Api.currentUserId.trim()}';

  void _restoreHiddenChatAds() {
    final raw = readStorage(_hiddenChatAdsKey);
    if (raw == null || raw.trim().isEmpty) return;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final cutoff = DateTime.now().subtract(const Duration(hours: 24));
      decoded.forEach((key, value) {
        final hiddenAt = DateTime.tryParse('$value');
        if (hiddenAt != null && hiddenAt.isAfter(cutoff)) {
          _hiddenAdIds.add('$key');
          _hiddenAdTimes['$key'] = hiddenAt;
        }
      });
      _persistHiddenChatAds();
    } catch (_) {
      writeStorage(_hiddenChatAdsKey, null);
    }
  }

  void _persistHiddenChatAds() {
    writeStorage(
      _hiddenChatAdsKey,
      jsonEncode({
        for (final id in _hiddenAdIds)
          id: (_hiddenAdTimes[id] ?? DateTime.now().toUtc()).toIso8601String(),
      }),
    );
  }

  /// Web `getAdThresholds`: each conversation gets stable thresholds within
  /// 1-10, 11-20, 21-30, etc., based only on outgoing messages.
  int _adSlotBefore(int index) {
    var outgoing = 0;
    for (var i = 0; i <= index && i < _messages.length; i++) {
      if (_isMine(_messages[i])) outgoing++;
    }
    if (outgoing == 0 || !_isMine(_messages[index])) return -1;
    final thresholds = chatAdThresholds('${widget.peerId}', 20);
    return thresholds.indexOf(outgoing);
  }

  HomeAd? _adForSlot(int slot) {
    final visible = _chatAds
        .where((ad) => !_hiddenAdIds.contains(_adId(ad)))
        .toList();
    if (visible.isEmpty || slot < 0) return null;
    return visible[slot % visible.length];
  }

  String _adId(HomeAd ad) => ad.adId.isEmpty ? ad.title : ad.adId;

  Widget _sponsoredCard(HomeAd ad) {
    final preview = ad.mediaPreview.isEmpty
        ? ''
        : Api.resolveMedia(ad.mediaPreview);
    final id = _adId(ad);
    if (_impressedAdIds.add(id)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Api.markAdImpression(ad.interactionId);
      });
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: AppColors.borderWhite10),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Ionicons.megaphone_outline,
                  size: 10,
                  color: AppColors.textGray400,
                ),
                const SizedBox(width: 5),
                const Text(
                  'SPONSORED',
                  style: TextStyle(
                    fontSize: 8,
                    letterSpacing: 1.3,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray400,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 260),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => openSponsoredAdDetail(context, ad),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.03),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.borderWhite10),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        color: Colors.black,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.borderWhite10),
                      ),
                      child: preview.isEmpty
                          ? const Icon(
                              Ionicons.image_outline,
                              size: 18,
                              color: AppColors.textGray600,
                            )
                          : Image.network(
                              preview,
                              fit: BoxFit.cover,
                              webHtmlElementStrategy:
                                  WebHtmlElementStrategy.prefer,
                              errorBuilder: (_, __, ___) => const Icon(
                                Ionicons.image_outline,
                                size: 18,
                                color: AppColors.textGray600,
                              ),
                            ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            ad.campaignType.toUpperCase(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 8,
                              letterSpacing: 1.3,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textGray500,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            ad.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w500,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Row(
                            children: [
                              const Icon(
                                Ionicons.person_circle_outline,
                                size: 10,
                                color: AppColors.textGray500,
                              ),
                              const SizedBox(width: 5),
                              Flexible(
                                child: Text(
                                  ad.username.isEmpty ? 'googer' : ad.username,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 8,
                                    color: AppColors.textGray400,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Ionicons.chevron_forward,
                      size: 10,
                      color: AppColors.textGray500,
                    ),
                    const SizedBox(width: 4),
                    GestureDetector(
                      onTap: () => _openAdMenu(ad),
                      child: Container(
                        width: 28,
                        height: 28,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.06),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Ionicons.ellipsis_vertical,
                          size: 13,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Share Link · Promote · Not Interested · Report, as the web's ad menu.
  void _openAdMenu(HomeAd ad) {
    final mine =
        Api.currentUserIds.contains(ad.ownerUserId.trim()) ||
        ad.username.trim().toLowerCase() == Api.username.trim().toLowerCase();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF121216),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            _adMenuRow(
              sheetContext,
              Ionicons.share_social_outline,
              'Share Link',
              () async {
                await Api.shareAd(ad.interactionId);
                final stored = ad.shareCode.trim();
                final code = Api.isCanonicalShareCode(stored)
                    ? stored
                    : Api.buildShareCode('a', ad.adId);
                final link = code.isEmpty
                    ? 'https://googer.site'
                    : 'https://googer.site/share/$code';
                await Clipboard.setData(ClipboardData(text: link));
                if (mounted) AppNotifications.success('Link copied');
              },
            ),
            if (ad.isProductPromote)
              _adMenuRow(
                sheetContext,
                Ionicons.megaphone_outline,
                ad.ownerUserId.trim() == Api.currentUserId.trim()
                    ? 'Promote Again'
                    : 'Promote',
                () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const ProductPromoteScreen(),
                    ),
                  );
                },
              ),
            if (mine)
              _adMenuRow(
                sheetContext,
                Ionicons.trash_outline,
                'Delete Ad',
                () => _deleteChatAd(ad),
              ),
            _adMenuRow(
              sheetContext,
              Ionicons.eye_off_outline,
              'Not Interested',
              () {
                final id = _adId(ad);
                setState(() {
                  _hiddenAdIds.add(id);
                  _hiddenAdTimes[id] = DateTime.now().toUtc();
                });
                _persistHiddenChatAds();
                AppNotifications.info('You will see fewer ads like this');
              },
            ),
            _adMenuRow(
              sheetContext,
              Ionicons.alert_circle_outline,
              'Report',
              () async {
                // reportAd returns null on success, or the failure message.
                final error = await Api.reportAd(ad.adId, 'Reported from chat');
                if (!mounted) return;
                if (error == null) {
                  AppNotifications.success('Report submitted');
                } else {
                  AppNotifications.error('Could not submit report', error);
                }
              },
            ),
            const SizedBox(height: 10),
          ],
        ),
      ),
    );
  }

  Future<void> _deleteChatAd(HomeAd ad) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AppColors.bg1,
        title: const Text(
          'Delete Ad?',
          style: TextStyle(fontSize: 14, color: Colors.white),
        ),
        content: const Text(
          'This ad will be removed from active feeds.',
          style: TextStyle(fontSize: 11, color: AppColors.textGray400),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
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
    if (confirmed != true) return;
    final error = await Api.setAdStatus(ad.adId, 'Cancelled');
    if (!mounted) return;
    if (error != null) {
      AppNotifications.error('Delete failed', error);
      return;
    }
    setState(
      () => _chatAds = _chatAds
          .where((candidate) => candidate.adId != ad.adId)
          .toList(growable: false),
    );
    AppNotifications.success('Ad removed from feeds');
  }

  Widget _adMenuRow(
    BuildContext sheetContext,
    IconData icon,
    String label,
    VoidCallback onTap,
  ) {
    return ListTile(
      dense: true,
      onTap: () {
        Navigator.maybePop(sheetContext);
        onTap();
      },
      leading: Icon(icon, size: 18, color: AppColors.textGray300),
      title: Text(
        label,
        style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),
    );
  }

  /// Thread header: back, peer identity with presence, theme toggle, the
  /// 240P/360P call-quality switch, and the two call buttons.
  Widget _threadHeader() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final narrow = constraints.maxWidth < 390;
        final controlSize = narrow ? 32.0 : 36.0;
        final gap = narrow ? 3.0 : 5.0;
        return Container(
          height: narrow ? 48 : 52,
          padding: const EdgeInsets.fromLTRB(6, 4, 6, 5),
          decoration: const BoxDecoration(
            color: _chatHeaderBg,
            border: Border(bottom: BorderSide(color: _chatStroke)),
          ),
          child: Row(
            children: [
              _chatCircleButton(
                Ionicons.chevron_back,
                onTap: () => _selecting
                    ? setState(() => _selected.clear())
                    : Navigator.maybePop(context),
                size: narrow ? 32 : 36,
              ),
              SizedBox(width: gap),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => UserProfileScreen(
                      userId: '${widget.peerId}',
                      username: widget.username,
                      displayName: widget.name,
                      avatar: _peerAvatar,
                    ),
                  ),
                ),
                child: _Avatar(
                  url: _peerAvatar,
                  name: widget.name,
                  size: narrow ? 32 : 36,
                ),
              ),
              SizedBox(width: narrow ? 4 : 6),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            widget.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        UserVerifiedBadge(userId: widget.peerId, size: 11),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: (_peerTyping || _peerOnline)
                                ? const Color(0xFFFF6978)
                                : const Color(0xFFE8EAED),
                          ),
                        ),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            _presenceLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 8,
                              letterSpacing: 0.9,
                              fontWeight: FontWeight.w800,
                              color: (_peerTyping || _peerOnline)
                                  ? const Color(0xFFFF8B98)
                                  : AppColors.textGray600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              _chatCircleButton(Ionicons.moon, onTap: () {}, size: controlSize),
              if (_canUseVideoCalls && _availableVideoQualities.length > 1) ...[
                SizedBox(width: gap),
                _qualityToggle(compact: true),
              ],
              SizedBox(width: gap),
              _chatCircleButton(
                Ionicons.call_outline,
                onTap: _canUseVoiceCalls ? () => _startCall('voice') : null,
                disabled: !_canUseVoiceCalls,
                size: controlSize,
              ),
              SizedBox(width: gap),
              _chatCircleButton(
                Ionicons.videocam_outline,
                onTap: _canUseVideoCalls ? () => _startCall('video') : null,
                disabled: !_canUseVideoCalls,
                size: controlSize,
              ),
            ],
          ),
        );
      },
    );
  }

  String get _presenceLabel {
    if (_peerTyping) return 'TYPING...';
    if (_peerOnline) return 'ONLINE';
    final lastSeen = _peerLastSeen;
    if (lastSeen == null) return 'OFFLINE';
    final now = DateTime.now();
    final sameDay =
        now.year == lastSeen.year &&
        now.month == lastSeen.month &&
        now.day == lastSeen.day;
    final hour = lastSeen.hour % 12 == 0 ? 12 : lastSeen.hour % 12;
    final minute = lastSeen.minute.toString().padLeft(2, '0');
    final suffix = lastSeen.hour >= 12 ? 'PM' : 'AM';
    return sameDay
        ? 'LAST SEEN AT $hour:$minute $suffix'
        : 'LAST SEEN ${lastSeen.day}/${lastSeen.month}';
  }

  Widget _chatCircleButton(
    IconData icon, {
    VoidCallback? onTap,
    bool disabled = false,
    double size = 40,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: _chatControlBg,
          borderRadius: BorderRadius.circular(size <= 32 ? 11 : 12),
          border: Border.all(color: _chatStroke),
        ),
        child: Icon(
          icon,
          size: size <= 32 ? 15 : 16,
          color: disabled ? AppColors.textGray600 : Colors.white,
        ),
      ),
    );
  }

  // ignore: unused_element
  Widget _threadHeaderOld() {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.borderWhite10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // On its own line, as on the wallet pages. Inline it would cost the
          // identity column ~85px, and this row already carries an avatar, a
          // quality toggle and two call buttons.
          //
          // Clears a selection first, and only then leaves the thread.
          AppBackButton(
            padding: const EdgeInsets.symmetric(vertical: 2),
            onTap: () => _selecting
                ? setState(() => _selected.clear())
                : Navigator.maybePop(context),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => UserProfileScreen(
                      userId: '${widget.peerId}',
                      username: widget.username,
                      displayName: widget.name,
                      avatar: _peerAvatar,
                    ),
                  ),
                ),
                child: _Avatar(url: _peerAvatar, name: widget.name, size: 38),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        letterSpacing: 1.1,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _peerTyping
                                ? AppColors.successGreen
                                : AppColors.textGray600,
                          ),
                        ),
                        const SizedBox(width: 6),
                        // Flexible: the header's fixed controls can squeeze this
                        // column narrow enough that the label would overflow.
                        Flexible(
                          child: Text(
                            _peerTyping ? 'TYPING…' : 'OFFLINE',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 9,
                              letterSpacing: 1.3,
                              fontWeight: FontWeight.w600,
                              color: _peerTyping
                                  ? AppColors.successGreen
                                  : AppColors.textGray600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (_canUseVideoCalls) ...[
                _qualityToggle(),
                const SizedBox(width: 6),
              ],
              if (_canUseVoiceCalls) ...[
                _circleButton(
                  Ionicons.call_outline,
                  () => _startCall('voice'),
                  filled: _quality == '360P',
                ),
                const SizedBox(width: 5),
              ],
              if (_canUseVideoCalls)
                _circleButton(
                  Ionicons.videocam_outline,
                  () => _startCall('video'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _circleButton(
    IconData icon,
    VoidCallback onTap, {
    bool filled = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled
              ? AppColors.successGreen
              : Colors.white.withOpacity(0.05),
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.borderWhite10),
        ),
        child: Icon(icon, size: 16, color: Colors.white),
      ),
    );
  }

  Widget _qualityToggle({bool compact = false}) {
    Widget option(String label) {
      final selected = _quality == label;
      return GestureDetector(
        onTap: () => setState(() => _quality = label),
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 5 : 7,
            vertical: compact ? 5 : 6,
          ),
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(9),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: compact ? 8 : 9,
              letterSpacing: 0.2,
              fontWeight: FontWeight.w600,
              color: selected ? Colors.black : AppColors.textGray500,
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: _availableVideoQualities.map(option).toList(),
      ),
    );
  }

  /// Selection actions. Extracted so it can be laid out and tested on its
  /// own \u2014 a single Row could not fit the count plus four buttons on a
  /// narrow phone.
  Widget _selectionBar() => ChatSelectionBar(
    count: _selected.length,
    onCopy: _copySelected,
    onForward: _forwardSelected,
    onDelete: _confirmDelete,
    onCancel: () => setState(() => _selected.clear()),
  );

  Future<void> _copySelected() async {
    // Strip colour markup so the clipboard gets readable text, not BBCode.
    final texts = _messages
        .where((m) => _selected.contains(_msgId(m)))
        .map((m) => ChatRichText.stripTags(_text(m)))
        .where((t) => t.trim().isNotEmpty)
        .join('\n');
    await Clipboard.setData(ClipboardData(text: texts));
    if (!mounted) return;
    setState(() => _selected.clear());
    AppNotifications.success('Copied');
  }

  // ---- Sticker panel ----

  Future<void> _loadStickers(String category) async {
    setState(() {
      _stickerCategory = category;
      _stickersLoading = true;
      _stickerError = '';
    });
    try {
      final rows = await Api.stickers(category: category);
      if (!mounted) return;
      setState(() {
        _stickerResults = rows;
        _stickersLoading = false;
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _stickerResults = const [];
        _stickersLoading = false;
        _stickerError = e.status == 401
            ? 'Sign in again to load stickers'
            : e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _stickerResults = const [];
        _stickersLoading = false;
        _stickerError = 'Could not reach the sticker service';
      });
    }
  }

  Widget _stickerPanel() {
    Widget categoryChip((String, String) entry) {
      final selected = _stickerCategory == entry.$1;
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: () {
            setState(() => _stickerCategory = entry.$1);
            if (_canUseStickers) _loadStickers(entry.$1);
          },
          child: Container(
            height: 29,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? Colors.white : const Color(0xFF181C22),
              borderRadius: BorderRadius.circular(8),
              border: selected ? null : Border.all(color: Colors.white10),
            ),
            child: Text(
              entry.$2,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: selected ? Colors.black : AppColors.textGray300,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      height: 208,
      padding: const EdgeInsets.fromLTRB(8, 14, 8, 16),
      decoration: const BoxDecoration(
        color: _chatPanelBg,
        border: Border(top: BorderSide(color: _chatStroke)),
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final entry in _stickerCategories)
                        categoryChip(entry),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => setState(() => _stickersOpen = false),
                child: Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: const Color(0xFF171A20),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Ionicons.close_outline,
                    size: 18,
                    color: AppColors.textGray300,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Expanded(
            child: _canUseStickers ? _stickerList() : _lockedStickerState(),
          ),
        ],
      ),
    );
  }

  Widget _lockedStickerState() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Ionicons.lock_closed_outline, size: 34, color: Colors.white),
          SizedBox(height: 12),
          Text(
            'Stickers require Plan 02',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: Color(0xFFFFD400),
            ),
          ),
          SizedBox(height: 12),
          Text(
            'Upgrade to unlock all sticker packs.',
            style: TextStyle(fontSize: 12, color: _chatMuted),
          ),
        ],
      ),
    );
  }

  Widget _stickerList() {
    if (_stickersLoading) {
      return const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.textGray400,
          ),
        ),
      );
    }
    if (_stickerResults.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _stickerError.isEmpty ? 'No stickers found' : _stickerError,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.textGray500,
              ),
            ),
            if (_stickerError.isNotEmpty) ...[
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => _loadStickers(_stickerCategory),
                child: const Text(
                  'RETRY',
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 1.3,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ],
        ),
      );
    }
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: _stickerResults.length,
      separatorBuilder: (_, __) => const SizedBox(width: 8),
      itemBuilder: (_, i) {
        final url = '${_stickerResults[i]["url"]}';
        return GestureDetector(
          onTap: () => _sendSticker(url),
          child: Image.network(
            url,
            width: 88,
            height: 88,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const SizedBox(width: 88, height: 88),
          ),
        );
      },
    );
  }

  // ignore: unused_element
  Widget _stickerPanelOld() {
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 6),
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final entry in _stickerCategories)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () => _loadStickers(entry.$1),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 13,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: _stickerCategory == entry.$1
                                    ? Colors.white
                                    : Colors.white.withOpacity(0.05),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                entry.$2,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w500,
                                  color: _stickerCategory == entry.$1
                                      ? Colors.black
                                      : AppColors.textGray300,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              GestureDetector(
                onTap: () => setState(() => _stickersOpen = false),
                child: const Icon(
                  Ionicons.close_outline,
                  size: 18,
                  color: AppColors.textGray400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 92,
            child: _stickersLoading
                ? const Center(
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.textGray400,
                      ),
                    ),
                  )
                : _stickerResults.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _stickerError.isEmpty
                              ? 'No stickers found'
                              : _stickerError,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: AppColors.textGray500,
                          ),
                        ),
                        if (_stickerError.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          GestureDetector(
                            onTap: () => _loadStickers(_stickerCategory),
                            child: const Text(
                              'RETRY',
                              style: TextStyle(
                                fontSize: 10,
                                letterSpacing: 1.3,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  )
                : ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _stickerResults.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      final url = '${_stickerResults[i]["url"]}';
                      return GestureDetector(
                        onTap: () => _sendSticker(url),
                        child: Image.network(
                          url,
                          width: 88,
                          height: 88,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) =>
                              const SizedBox(width: 88, height: 88),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _sendSticker(String url) async {
    setState(() => _stickersOpen = false);
    if (!_canUseStickers) {
      AppNotifications.error('Stickers are available in higher plans.');
      return;
    }
    final ok = await Api.sendChatMessage(widget.peerId, url, type: 'sticker');
    if (!mounted) return;
    if (ok) {
      _load(silent: true);
    } else {
      AppNotifications.error('Sticker not sent');
    }
  }

  // ---- Colour panel ----

  Widget _colorPanel() {
    String hex(Color c) =>
        '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 6),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: _messageColor,
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  hex(_messageColor),
                  style: const TextStyle(
                    fontSize: 12.5,
                    color: AppColors.textGray400,
                  ),
                ),
              ),
              GestureDetector(
                onTap: () => setState(() {
                  _colorApplied = true;
                  _colorOpen = false;
                }),
                child: Container(
                  height: 38,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.likeRed,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Text(
                    'APPLY',
                    style: TextStyle(
                      fontSize: 11,
                      letterSpacing: 1.2,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: () => setState(() => _colorOpen = false),
                child: const Icon(
                  Ionicons.close_outline,
                  size: 18,
                  color: AppColors.textGray400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 9,
            runSpacing: 9,
            children: [
              for (final color in _paletteColors)
                GestureDetector(
                  onTap: () => setState(() {
                    _messageColor = color;
                    _colorApplied = true;
                  }),
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: _messageColor == color
                            ? Colors.white
                            : Colors.transparent,
                        width: 2,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  // ---- Voice recording ----

  Future<void> _toggleMicAction() async {
    if (_ttsEnabled) {
      await _toggleSpeechToText();
      return;
    }
    await _toggleRecording();
  }

  Future<void> _toggleSpeechToText() async {
    if (_listening) {
      await _stopSpeechToText();
      return;
    }
    if (!_canUseVoiceToText) {
      AppNotifications.error(
        'Voice-to-text is not enabled on your current plan.',
      );
      return;
    }
    if (!BrowserSpeechToText.isSupported) {
      AppNotifications.error(
        'Voice input is not supported in this browser. Please use Chrome or Safari.',
      );
      return;
    }
    try {
      await BrowserSpeechToText.start(
        initialText: _input.text,
        onText: (text) {
          if (!mounted) return;
          _input.text = text;
          _input.selection = TextSelection.collapsed(offset: text.length);
          _onTyping(text);
        },
        onError: (message) {
          if (!mounted) return;
          AppNotifications.error(message);
          setState(() => _listening = false);
        },
      );
    } catch (e) {
      if (!mounted) return;
      AppNotifications.error('$e');
      return;
    }
    if (!mounted) {
      await BrowserSpeechToText.stop();
      return;
    }
    setState(() {
      _listening = true;
      _listenedFor = Duration.zero;
    });
    _listenTicker?.cancel();
    _listenTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _listenedFor += const Duration(seconds: 1));
    });
  }

  Future<void> _stopSpeechToText({bool clearText = false}) async {
    _listenTicker?.cancel();
    _listenTicker = null;
    await BrowserSpeechToText.stop();
    if (!mounted) return;
    setState(() {
      _listening = false;
      _listenedFor = Duration.zero;
      if (clearText) _input.clear();
    });
  }

  Future<void> _toggleRecording() async {
    if (_recording) {
      await _stopRecording(send: true);
      return;
    }
    try {
      await AudioRecorder.start();
    } catch (e) {
      if (!mounted) return;
      AppNotifications.error('Cannot record', '$e');
      return;
    }
    if (!mounted) {
      await AudioRecorder.cancel();
      return;
    }
    setState(() {
      _recording = true;
      _recordedFor = Duration.zero;
    });
    _recordTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _recordedFor += const Duration(seconds: 1));
      // The web caps voice notes at CHAT_VOICE_MAX_SECS; stop rather than let
      // a runaway recording grow unbounded.
      if (_recordedFor.inSeconds >= chatVoiceMaxSeconds) {
        _stopRecording(send: true);
      }
    });
  }

  Future<void> _stopRecording({required bool send}) async {
    _recordTicker?.cancel();
    _recordTicker = null;
    if (!send) {
      await AudioRecorder.cancel();
      if (mounted) setState(() => _recording = false);
      return;
    }

    final dataUrl = await AudioRecorder.stop();
    if (!mounted) return;
    setState(() => _recording = false);
    if (dataUrl == null || dataUrl.isEmpty) {
      AppNotifications.error('Nothing recorded');
      return;
    }

    // Matches the web: type "voice", the clip as a data URL in image_url, and a
    // timestamped .webm filename (chats/page.tsx:2984).
    final ok = await Api.sendChatMessage(
      widget.peerId,
      '',
      type: 'voice',
      imageUrl: dataUrl,
      fileName: 'voice-${DateTime.now().millisecondsSinceEpoch}.webm',
      replyToId: _replyTo == null ? null : _msgId(_replyTo!),
    );
    if (!mounted) return;
    setState(() => _replyTo = null);
    if (ok) {
      await _load(silent: true);
      _jumpToEnd();
    } else {
      AppNotifications.error('Unable to send voice message.');
    }
  }

  /// Recording controls, matching the web's bar.
  Widget _recordingBar() {
    final minutes = _recordedFor.inMinutes;
    final seconds = _recordedFor.inSeconds % 60;
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => _stopRecording(send: false),
            child: const Icon(
              Ionicons.trash_outline,
              size: 18,
              color: AppColors.textGray400,
            ),
          ),
          const SizedBox(width: 14),
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.likeRed,
              shape: BoxShape.circle,
            ),
            child: const Icon(Ionicons.pause, size: 17, color: Colors.white),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'RECORDING',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.3,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray400,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '$minutes:${seconds.toString().padLeft(2, '0')}',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => _stopRecording(send: true),
            child: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Ionicons.checkmark,
                size: 18,
                color: Colors.black,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _listeningBar() {
    final minutes = _listenedFor.inMinutes;
    final seconds = _listenedFor.inSeconds % 60;
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.likeRed.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.likeRed.withOpacity(0.35)),
      ),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => _stopSpeechToText(clearText: true),
            child: const Icon(
              Ionicons.trash_outline,
              size: 18,
              color: AppColors.textGray400,
            ),
          ),
          const SizedBox(width: 14),
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.likeRed,
              shape: BoxShape.circle,
            ),
            child: const Icon(Ionicons.mic, size: 17, color: Colors.white),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'VOICE TO TEXT',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.3,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textGray400,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '$minutes:${seconds.toString().padLeft(2, '0')}',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
          GestureDetector(
            onTap: _stopSpeechToText,
            child: Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Ionicons.checkmark,
                size: 18,
                color: Colors.black,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _beginTtsLongPress() {
    _ttsLongPressFired = false;
    _ttsLongPressTimer?.cancel();
    _ttsLongPressFired = true;
    if (mounted) {
      setState(() {
        _ttsSettingsOpen = true;
        _stickersOpen = false;
        _colorOpen = false;
      });
    }
  }

  void _endTtsLongPress() {
    _ttsLongPressTimer?.cancel();
    _ttsLongPressTimer = null;
    _ttsLongPressFired = false;
  }

  void _toggleTtsEnabled() {
    if (_ttsLongPressFired) {
      _ttsLongPressFired = false;
      return;
    }
    if (!_canUseTextToVoice) {
      AppNotifications.error(
        'Text-to-voice messages are not enabled on your current plan.',
      );
      return;
    }
    final nextEnabled = !_ttsEnabled;
    if (!nextEnabled && _listening) {
      _stopSpeechToText();
    }
    setState(() {
      _ttsEnabled = nextEnabled;
      if (!_ttsEnabled) _ttsSettingsOpen = false;
      if (_ttsEnabled) {
        _stickersOpen = false;
        _colorOpen = false;
      }
      _persistTtsPrefs();
    });
  }

  Widget _ttsSettingsPanel() {
    Widget option(String gender, String label) {
      final selected = _ttsVoiceGender == gender;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() {
            _ttsVoiceGender = gender;
            _ttsSettingsOpen = false;
            _ttsEnabled = true;
            _persistTtsPrefs();
          }),
          child: Container(
            height: 38,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected
                  ? Colors.green.withOpacity(0.15)
                  : Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected
                    ? Colors.greenAccent.withOpacity(0.45)
                    : AppColors.borderWhite10,
              ),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 10,
                letterSpacing: 1,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.greenAccent : AppColors.textGray400,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F1115),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderWhite10),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'TEXT VOICE',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textGray500,
                  ),
                ),
              ),
              GestureDetector(
                onTap: () => setState(() => _ttsSettingsOpen = false),
                child: const Icon(
                  Ionicons.close_outline,
                  size: 18,
                  color: AppColors.textGray400,
                ),
              ),
            ],
          ),
          const SizedBox(height: 9),
          Row(
            children: [
              option('female', 'FEMALE VOICE'),
              const SizedBox(width: 8),
              option('male', 'MALE VOICE'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _composer() {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 9),
        decoration: const BoxDecoration(
          color: _chatHeaderBg,
          border: Border(top: BorderSide(color: _chatStroke)),
        ),
        child: Row(
          children: [
            _composerButton(Ionicons.add_outline, _openMenu),
            const SizedBox(width: 7),
            if (_canUseChatColors) ...[
              _composerButton(
                Ionicons.color_palette_outline,
                () => setState(() {
                  _colorOpen = !_colorOpen;
                  if (_colorOpen) _stickersOpen = false;
                }),
                tint: _messageColor,
              ),
              const SizedBox(width: 7),
            ],
            _lockedComposerButton(Ionicons.happy_outline, () {
              setState(() {
                _stickersOpen = !_stickersOpen;
                if (_stickersOpen) _colorOpen = false;
              });
              if (_stickersOpen && _canUseStickers && _stickerResults.isEmpty) {
                _loadStickers(_stickerCategory);
              }
            }, locked: !_canUseStickers),
            const SizedBox(width: 10),
            Expanded(
              child: Container(
                constraints: const BoxConstraints(minHeight: 52),
                decoration: BoxDecoration(
                  color: Colors.black,
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(color: _chatStroke),
                ),
                alignment: Alignment.center,
                child: TextField(
                  controller: _input,
                  onChanged: (value) {
                    _onTyping(value);
                    setState(() {});
                  },
                  onSubmitted: (_) => _send(),
                  minLines: 1,
                  maxLines: 3,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: _colorApplied ? _messageColor : Colors.white,
                  ),
                  cursorColor: AppColors.accentPurple,
                  decoration: InputDecoration(
                    hintText: 'Message ${widget.name}',
                    hintStyle: const TextStyle(
                      fontSize: 11,
                      height: 1.45,
                      color: AppColors.textGray600,
                    ),
                    isDense: true,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 9,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 7),
            if (_input.text.trim().isNotEmpty || _listening) ...[
              GestureDetector(
                onTap: _sending ? null : _send,
                child: Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.likeRed,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.likeRed),
                  ),
                  child: _sending
                      ? const Padding(
                          padding: EdgeInsets.all(10),
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Icon(
                          Ionicons.send,
                          size: 18,
                          color: Colors.white,
                        ),
                ),
              ),
            ] else ...[
              GestureDetector(
                onTap: _toggleTtsEnabled,
                onLongPress: () => setState(() {
                  _ttsSettingsOpen = true;
                  _stickersOpen = false;
                  _colorOpen = false;
                }),
                child: Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _ttsEnabled
                        ? AppColors.likeRed.withOpacity(0.18)
                        : _chatControlBg,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: _ttsEnabled
                          ? AppColors.likeRed.withOpacity(0.45)
                          : _chatStroke,
                    ),
                  ),
                  child: Icon(
                    _ttsEnabled
                        ? Ionicons.checkmark_circle
                        : Ionicons.ellipse_outline,
                    size: 17,
                    color: _ttsEnabled
                        ? AppColors.likeRed
                        : AppColors.textGray500,
                  ),
                ),
              ),
              const SizedBox(width: 7),
              GestureDetector(
                onTap: _toggleMicAction,
                onLongPressStart: (_) => _beginTtsLongPress(),
                onLongPressEnd: (_) => _endTtsLongPress(),
                child: Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: (_recording || _listening)
                        ? AppColors.likeRed
                        : _chatControlBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: _chatStroke),
                  ),
                  child: const Icon(
                    Ionicons.mic_outline,
                    size: 17,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _composerButton(IconData icon, VoidCallback onTap, {Color? tint}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: _chatControlBg,
          shape: BoxShape.circle,
          border: Border.all(color: _chatStroke),
        ),
        child: Icon(icon, size: 17, color: tint ?? Colors.white),
      ),
    );
  }

  Widget _lockedComposerButton(
    IconData icon,
    VoidCallback onTap, {
    required bool locked,
    Color? tint,
  }) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        _composerButton(icon, onTap, tint: tint),
        if (locked)
          Positioned(
            right: -1,
            top: -3,
            child: Container(
              width: 14,
              height: 14,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.black,
                shape: BoxShape.circle,
                border: Border.all(color: _chatStroke),
              ),
              child: const Icon(
                Ionicons.lock_closed,
                size: 8,
                color: Colors.white,
              ),
            ),
          ),
      ],
    );
  }

  void _confirmDelete() {
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
            ListTile(
              leading: const Icon(
                Ionicons.person_outline,
                size: 20,
                color: Colors.white,
              ),
              title: const Text(
                'Delete for me',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
              onTap: () {
                Navigator.maybePop(sheetContext);
                _deleteSelected('me');
              },
            ),
            ListTile(
              leading: const Icon(
                Ionicons.people_outline,
                size: 20,
                color: AppColors.likeRed,
              ),
              title: const Text(
                'Delete for everyone',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.likeRed,
                ),
              ),
              onTap: () {
                Navigator.maybePop(sheetContext);
                _deleteSelected('everyone');
              },
            ),
          ],
        ),
      ),
    );
  }

  void _forwardSelected() {
    final picked = _messages
        .where((m) => _selected.contains(_msgId(m)))
        .toList(growable: false);
    if (picked.isEmpty) return;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.bg1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (sheetContext) => _ForwardSheet(
        onPick: (peerId) async {
          Navigator.maybePop(sheetContext);
          var sent = 0;
          for (final m in picked) {
            if (await Api.forwardChatMessage(peerId, m)) sent++;
          }
          if (!mounted) return;
          setState(() => _selected.clear());
          AppNotifications.success(
            'Forwarded',
            '$sent message${sent == 1 ? "" : "s"} sent.',
          );
        },
      ),
    );
  }

  void _openMenu() {
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
            ListTile(
              leading: const Icon(
                Ionicons.copy_outline,
                size: 20,
                color: Colors.white,
              ),
              title: const Text(
                'Copy username',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
              onTap: () {
                Navigator.maybePop(sheetContext);
                Clipboard.setData(ClipboardData(text: '@${widget.username}'));
                AppNotifications.info('Username copied');
              },
            ),
            ListTile(
              leading: const Icon(
                Ionicons.eye_off_outline,
                size: 20,
                color: Colors.white,
              ),
              title: const Text(
                'Hide conversation',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
              onTap: () async {
                Navigator.maybePop(sheetContext);
                if (await Api.hideConversation(widget.peerId)) {
                  AppNotifications.info('Conversation hidden');
                  if (mounted) Navigator.maybePop(context);
                }
              },
            ),
            ListTile(
              leading: const Icon(
                Ionicons.ban_outline,
                size: 20,
                color: AppColors.likeRed,
              ),
              title: const Text(
                'Block user',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.likeRed,
                ),
              ),
              onTap: () async {
                Navigator.maybePop(sheetContext);
                if (await Api.blockChatUser(widget.peerId)) {
                  AppNotifications.info('User blocked');
                  if (mounted) Navigator.maybePop(context);
                }
              },
            ),
            ListTile(
              leading: const Icon(
                Ionicons.trash_outline,
                size: 20,
                color: AppColors.likeRed,
              ),
              title: const Text(
                'Delete conversation',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.likeRed,
                ),
              ),
              onTap: () async {
                Navigator.maybePop(sheetContext);
                if (await Api.deleteConversation(widget.peerId)) {
                  AppNotifications.info('Conversation deleted');
                  if (mounted) Navigator.maybePop(context);
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Exact 32-bit linear-congruential sequence used by the Next.js chat page.
List<int> chatAdThresholds(String conversationId, int count) {
  var seed = 0;
  for (final unit in conversationId.codeUnits) {
    seed = ((seed * 31) + unit) & 0xffffffff;
  }
  double random() {
    seed = ((seed * 1664525) + 1013904223) & 0xffffffff;
    return seed / 0xffffffff;
  }

  return List<int>.generate(count, (index) {
    final offset = 1 + (random() * 10).floor();
    return (index * 10) + offset;
  }, growable: false);
}

/// Pick a conversation to forward the selected messages into.
class _ForwardSheet extends StatefulWidget {
  final Future<void> Function(int peerId) onPick;
  const _ForwardSheet({required this.onPick});

  @override
  State<_ForwardSheet> createState() => _ForwardSheetState();
}

class _ForwardSheetState extends State<_ForwardSheet> {
  List<dynamic> _convos = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final items = await Api.chats();
    if (!mounted) return;
    setState(() {
      _convos = items;
      _loading = false;
    });
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
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'Forward to',
              style: TextStyle(
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
                : ListView.builder(
                    itemCount: _convos.length,
                    itemBuilder: (_, i) {
                      final c = _convos[i];
                      return ListTile(
                        leading: _Avatar(
                          url: '${c.img}',
                          name: '${c.name}',
                          size: 38,
                        ),
                        title: Text(
                          '${c.name}',
                          style: const TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                            color: Colors.white,
                          ),
                        ),
                        onTap: () => widget.onPick(c.peerId as int),
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
