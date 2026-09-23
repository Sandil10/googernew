import 'package:flutter/material.dart';

import '../services/app_session.dart';
import '../services/googer_api.dart';
import '../theme/app_colors.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final user = session.user ?? {};
    final username = (user['username'] ?? 'googer').toString();
    final fullName = (user['full_name'] ?? user['fullName'] ?? username).toString();
    final googerId = (user['user_id'] ?? user['googer_id'] ?? user['id'] ?? '').toString();
    final bio = (user['bio'] ?? '').toString();
    final avatar = resolveMediaUrl(user['profile_picture']?.toString());

    return Scaffold(
      backgroundColor: AppColors.background,
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          Stack(
            children: [
              Container(
                height: 110,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF3A3A40), Color(0xFF141416)]),
                ),
              ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.of(context).maybePop(),
                        child: const Icon(Icons.chevron_left, color: Colors.white, size: 24),
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => _showSettingsMenu(context, session),
                        child: const Icon(Icons.more_vert, size: 20, color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          Transform.translate(
            offset: const Offset(0, -38),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.black, width: 3),
                      image: avatar.isEmpty ? null : DecorationImage(image: NetworkImage(avatar), fit: BoxFit.cover),
                    ),
                    child: avatar.isEmpty ? const Icon(Icons.person, color: Colors.black54) : null,
                  ),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(
                      child: Text(fullName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                    ),
                    const SizedBox(width: 6),
                    const Icon(Icons.verified, size: 18, color: Color(0xFF1A8CD8)),
                  ]),
                  Text('@$username', style: const TextStyle(fontSize: 11.5, color: AppColors.textMuted)),
                  const SizedBox(height: 8),
                  Row(children: [
                    Expanded(
                      child: Text('Googer ID: $googerId', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                    ),
                    const SizedBox(width: 6),
                    const Icon(Icons.copy, size: 12, color: AppColors.textMuted),
                  ]),
                  const SizedBox(height: 10),
                  Text(bio.isEmpty ? 'No bio yet.' : bio, style: const TextStyle(fontSize: 12.5, height: 1.6, color: Color(0xFFD4D4D8))),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: _pill('Mail')),
                    const SizedBox(width: 8),
                    Expanded(child: _pill('Contact')),
                  ]),
                  const SizedBox(height: 12),
                  const Text.rich(TextSpan(children: [
                    TextSpan(text: 'Live ', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.textPrimary)),
                    TextSpan(text: 'Profile', style: TextStyle(color: AppColors.textMuted)),
                  ]), style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                    alignment: Alignment.center,
                    child: const Text('Subscribe', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Colors.black)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _pill(String label) => Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(color: AppColors.surfaceRaised, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(999)),
        alignment: Alignment.center,
        child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
      );

  static void _showSettingsMenu(BuildContext context, AppSession session) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF18181B),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 36, height: 4, margin: const EdgeInsets.symmetric(vertical: 10), decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(99))),
          _row(Icons.settings_outlined, 'Settings'),
          _row(Icons.privacy_tip_outlined, 'Privacy Policy'),
          _row(Icons.help_outline, 'Help & Support'),
          const Divider(color: AppColors.border, height: 12, indent: 20, endIndent: 20),
          ListTile(
            dense: true,
            leading: const Icon(Icons.logout, size: 18, color: AppColors.accentRed),
            title: const Text('Log out', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.accentRed)),
            onTap: () async {
              Navigator.of(context).pop();
              await session.logout();
              if (context.mounted) Navigator.of(context).maybePop();
            },
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }

  static Widget _row(IconData icon, String label, {Color color = AppColors.textPrimary}) => ListTile(
        dense: true,
        leading: Icon(icon, size: 18, color: color),
        title: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
      );
}
