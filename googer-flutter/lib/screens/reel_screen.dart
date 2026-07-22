import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';

/// reel/[shareCode] · full-screen vertical reel viewer
class ReelScreen extends StatefulWidget {
  const ReelScreen({super.key});

  @override
  State<ReelScreen> createState() => _ReelScreenState();
}

class _ReelScreenState extends State<ReelScreen> {
  bool _liked = false;
  int _likes = 1284;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      body: SafeArea(
        child: Stack(
          children: [
            // Media surface
            Positioned.fill(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [const Color(0xFF4C1D95), const Color(0xFF0A0A0A)],
                  ),
                ),
                alignment: Alignment.center,
                child: Container(
                  width: 78,
                  height: 78,
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.35),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withOpacity(0.25)),
                  ),
                  child: const Icon(Ionicons.play, size: 34, color: Colors.white),
                ),
              ),
            ),
            // Top bar: creator + copy link
            Positioned(
              top: 8,
              left: 12,
              right: 12,
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Ionicons.arrow_back_outline, size: 20, color: Colors.white),
                    onPressed: () => Navigator.maybePop(context),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text('Mira K.',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white)),
                        SizedBox(height: 2),
                        Text('Reel',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0x73FFFFFF))),
                      ],
                    ),
                  ),
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.10),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Ionicons.link_outline, size: 20, color: Colors.white),
                  ),
                ],
              ),
            ),
            // Right action rail
            Positioned(
              right: 10,
              bottom: 90,
              child: Column(
                children: [
                  _railButton(Ionicons.share_social_outline, '10%'),
                  const SizedBox(height: 14),
                  _railButton(Ionicons.repeat_outline, '32'),
                  const SizedBox(height: 14),
                  _railButton(Ionicons.eye_outline, '18.2K'),
                  const SizedBox(height: 14),
                  _railButton(Ionicons.chatbubble_outline, '96'),
                  const SizedBox(height: 14),
                  _railButton(
                    _liked ? Ionicons.heart : Ionicons.heart_outline,
                    '$_likes',
                    color: _liked ? AppColors.likeRed : Colors.white,
                    onTap: () => setState(() {
                      _liked = !_liked;
                      _likes += _liked ? 1 : -1;
                    }),
                  ),
                ],
              ),
            ),
            // Bottom caption
            Positioned(
              left: 16,
              right: 72,
              bottom: 24,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text('Small-batch ginger candy drop',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
                  SizedBox(height: 6),
                  Text('#googer #snacks',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.linkBlue)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _railButton(IconData icon, String count, {Color color = Colors.white, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap ?? () {},
      child: Column(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFF3F3F46).withOpacity(0.35),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withOpacity(0.25)),
            ),
            child: Icon(icon, size: 19, color: color),
          ),
          const SizedBox(height: 3),
          Text(count, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Colors.white)),
        ],
      ),
    );
  }
}
