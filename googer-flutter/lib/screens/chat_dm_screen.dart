import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../services/chat_service.dart';

/// 1k · Chat DM
class ChatDmScreen extends StatefulWidget {
  final String name;
  final String? participantId;
  const ChatDmScreen({super.key, this.name = 'Mira K.', this.participantId});

  @override
  State<ChatDmScreen> createState() => _ChatDmScreenState();
}

class _ChatDmScreenState extends State<ChatDmScreen> {
  final _input = TextEditingController();
  List<_Msg> _messages = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final pid = widget.participantId;
    if (pid == null) {
      // No backend participant — show the demo thread.
      setState(() {
        _messages = _demoThread;
        _loading = false;
      });
      return;
    }
    try {
      final items = await ChatService.messages(pid);
      final parsed = <_Msg>[];
      for (final item in items) {
        if (item is Map<String, dynamic>) {
          final text = (item['text'] ?? item['content'] ?? item['body'] ?? '').toString();
          final mine = item['mine'] == true || item['is_mine'] == true || item['fromSelf'] == true;
          if (text.isNotEmpty) parsed.add(_Msg(text, mine));
        }
      }
      if (!mounted) return;
      setState(() {
        _messages = parsed.isEmpty ? _demoThread : parsed;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _messages = _demoThread;
        _loading = false;
      });
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages = [..._messages, _Msg(text, true)];
      _input.clear();
    });
    final pid = widget.participantId;
    if (pid != null) {
      try {
        await ChatService.send({'toUserId': pid, 'text': text});
      } catch (_) {
        // Keep the optimistic message; a full impl would flag send failure.
      }
    }
  }

  static const List<_Msg> _demoThread = [
    _Msg('hey! saw your goog about the topbar bell 😂', false),
    _Msg("right?? it's been bugging me for weeks", true),
    _Msg('sent you a goog · check it', false),
    _Msg('on it', true),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        toolbarHeight: 52,
        leadingWidth: 40,
        leading: IconButton(
          icon: const Icon(Ionicons.arrow_back_outline, size: 15, color: Colors.white),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: Row(
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: const BoxDecoration(color: Color(0xFF4C1D95), shape: BoxShape.circle),
              alignment: Alignment.center,
              child: Text(widget.name.isNotEmpty ? widget.name[0].toUpperCase() : '?',
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 11, color: Colors.white)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
                  const Text('Online', style: TextStyle(fontSize: 10, color: AppColors.successGreen)),
                ],
              ),
            ),
          ],
        ),
        titleSpacing: 0,
        actions: [
          IconButton(icon: const Icon(Ionicons.call_outline, size: 14, color: Colors.white), onPressed: () {}),
          IconButton(icon: const Icon(Ionicons.videocam_outline, size: 14, color: Colors.white), onPressed: () {}),
        ],
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.accentPurple))
                : ListView.separated(
                    padding: const EdgeInsets.all(14),
                    itemCount: _messages.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _bubble(_messages[i].text, mine: _messages[i].mine),
                  ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border1))),
            child: Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.06), shape: BoxShape.circle),
                  child: const Icon(Ionicons.add_outline, size: 16, color: Colors.white),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
                    decoration: BoxDecoration(color: AppColors.bg2, borderRadius: BorderRadius.circular(9999), border: Border.all(color: AppColors.inputBorder)),
                    child: TextField(
                      controller: _input,
                      style: const TextStyle(fontSize: 12, color: Colors.white),
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: const InputDecoration(
                        border: InputBorder.none,
                        isDense: true,
                        hintText: 'Message...',
                        hintStyle: TextStyle(fontSize: 12, color: AppColors.textGray500),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _send,
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: const BoxDecoration(color: AppColors.chatBubble, shape: BoxShape.circle),
                    child: const Icon(Ionicons.send, size: 14, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static Widget _bubble(String text, {required bool mine}) {
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: mine ? AppColors.chatBubble : AppColors.chatIncoming,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(text, style: const TextStyle(fontSize: 12.5, color: Colors.white)),
      ),
    );
  }
}

class _Msg {
  final String text;
  final bool mine;
  const _Msg(this.text, this.mine);
}
