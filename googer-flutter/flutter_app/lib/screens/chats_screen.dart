import 'package:flutter/material.dart';

import '../services/app_session.dart';
import '../theme/app_colors.dart';

class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key});

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future = SessionScope.of(context).api.getConversations();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: Colors.white,
      backgroundColor: AppColors.surface,
      onRefresh: () async => setState(() => _future = SessionScope.of(context).api.getConversations()),
      child: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snapshot) {
          final conversations = snapshot.data ?? const <Map<String, dynamic>>[];
          return ListView(
            padding: const EdgeInsets.all(14),
            children: [
              if (snapshot.connectionState == ConnectionState.waiting)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator(color: Colors.white)),
                )
              else if (snapshot.hasError)
                _StateMessage(text: snapshot.error.toString().replaceFirst('Exception: ', ''))
              else if (conversations.isEmpty)
                const _StateMessage(text: 'No real conversations yet.')
              else
                ...conversations.map((conversation) {
                  final name = (conversation['username'] ?? conversation['other_username'] ?? conversation['name'] ?? 'User').toString();
                  final last = (conversation['last_message'] ?? conversation['message'] ?? '').toString();
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: AppColors.surface, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(16)),
                    child: Row(
                      children: [
                        const CircleAvatar(backgroundColor: AppColors.surfaceRaised, child: Icon(Icons.person, color: Colors.white70)),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('@$name', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white)),
                              const SizedBox(height: 3),
                              Text(last.isEmpty ? 'Conversation' : last, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }),
            ],
          );
        },
      ),
    );
  }
}

class _StateMessage extends StatelessWidget {
  const _StateMessage({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 80, horizontal: 24),
        child: Text(text, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
      ),
    );
  }
}
