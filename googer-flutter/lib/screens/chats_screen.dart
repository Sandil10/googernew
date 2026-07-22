import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import '../models/convo.dart';
import '../services/chat_service.dart';
import 'chat_dm_screen.dart';

/// 1f · Chats
class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key});

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  List<Convo> _convos = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final items = await ChatService.conversations();
      final parsed = <Convo>[];
      for (final item in items) {
        if (item is Map<String, dynamic>) parsed.add(Convo.fromJson(item));
      }
      if (!mounted) return;
      setState(() {
        _convos = parsed;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _convos = demoConvos;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final convos = _convos.isEmpty ? demoConvos : _convos;
    return Column(
      children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 14, 12, 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.bg2,
                borderRadius: BorderRadius.circular(11),
                border: Border.all(color: AppColors.inputBorder),
              ),
              child: const Row(
                children: [
                  Icon(Ionicons.search_outline, size: 15, color: AppColors.textGray600),
                  SizedBox(width: 8),
                  Text('search messages', style: TextStyle(fontSize: 12, color: AppColors.textGray600)),
                ],
              ),
            ),
          ),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator(color: AppColors.accentPurple)))
          else
          Expanded(
            child: RefreshIndicator(
              color: AppColors.accentPurple,
              onRefresh: _load,
              child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: convos.length,
              separatorBuilder: (_, __) => const Divider(height: 1, color: AppColors.borderWhite06),
              itemBuilder: (context, i) {
                final c = convos[i];
                return InkWell(
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatDmScreen(name: c.name, participantId: c.participantId))),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                    child: Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), shape: BoxShape.circle),
                          alignment: Alignment.center,
                          child: Text(c.initial, style: const TextStyle(fontWeight: FontWeight.w600, color: Colors.white, fontSize: 12)),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(c.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.white)),
                              const SizedBox(height: 2),
                              Text(c.last, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: AppColors.textGray500)),
                            ],
                          ),
                        ),
                        if (c.hasUnread) ...[
                          const SizedBox(width: 8),
                          Container(
                            constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                            padding: const EdgeInsets.symmetric(horizontal: 5),
                            decoration: BoxDecoration(color: AppColors.utilityBlue, borderRadius: BorderRadius.circular(9999)),
                            alignment: Alignment.center,
                            child: Text('${c.unread}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 9.5, color: Colors.white)),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
            ),
          ),
        ],
      );
  }
}
