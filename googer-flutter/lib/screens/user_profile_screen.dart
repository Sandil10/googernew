import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../api/api.dart';
import '../theme/colors.dart';
import '../widgets/verified_badge.dart';

class UserProfileScreen extends StatelessWidget {
  final String userId;
  final String username;
  final String displayName;
  final String avatar;

  const UserProfileScreen({
    super.key,
    this.userId = "",
    required this.username,
    required this.displayName,
    this.avatar = "",
  });

  @override
  Widget build(BuildContext context) {
    final handle = username.trim().isEmpty ? "googer" : username.trim();
    final name = displayName.trim().isEmpty ? handle : displayName.trim();
    final resolvedAvatar = Api.resolveMedia(avatar);

    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(
            Ionicons.arrow_back_outline,
            size: 18,
            color: Colors.white,
          ),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: Text(
          '@$handle',
          style: const TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(
              Ionicons.share_social_outline,
              size: 18,
              color: Colors.white,
            ),
            onPressed: () {},
          ),
        ],
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.border1),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
        children: [
          Row(
            children: [
              Container(
                width: 64,
                height: 64,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: AppColors.avatarSlate,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.borderWhite10, width: 2),
                ),
                alignment: Alignment.center,
                child: resolvedAvatar.isNotEmpty
                    ? Image.network(
                        resolvedAvatar,
                        width: 64,
                        height: 64,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => _Initials(name: name),
                      )
                    : _Initials(name: name),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        const SizedBox(width: 5),
                        UserVerifiedBadge(userId: userId, size: 12),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '@$handle',
                      style: const TextStyle(
                        color: AppColors.textGray400,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _stat('0', 'Googers'),
              const SizedBox(width: 16),
              _stat('0', 'Following'),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            '$name on Googer.',
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: AppColors.textGray200,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(
                Ionicons.link_outline,
                size: 14,
                color: AppColors.linkBlue,
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  'googer.app/$handle',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.linkBlue,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: ElevatedButton(
                  onPressed: () {},
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.likeRed,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: const Text(
                    'Follow',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton(
                  onPressed: () {},
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppColors.borderWhite10),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                  child: const Text(
                    'Message',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
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

  Widget _stat(String value, String label) {
    return RichText(
      text: TextSpan(
        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
        children: [
          TextSpan(
            text: value,
            style: const TextStyle(color: Colors.white),
          ),
          TextSpan(
            text: ' $label',
            style: const TextStyle(color: AppColors.textGray500),
          ),
        ],
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  final String name;
  const _Initials({required this.name});

  @override
  Widget build(BuildContext context) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    final initials = parts.isEmpty
        ? '?'
        : parts.take(2).map((part) => part[0].toUpperCase()).join();
    return Text(
      initials,
      style: const TextStyle(
        fontWeight: FontWeight.w900,
        fontSize: 14,
        color: Colors.white,
      ),
    );
  }
}
