import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

/// Full-screen TikTok-style vertical reel player.
class ReelPlayerScreen extends StatefulWidget {
  const ReelPlayerScreen({super.key});

  @override
  State<ReelPlayerScreen> createState() => _ReelPlayerScreenState();
}

class _ReelPlayerScreenState extends State<ReelPlayerScreen> {
  bool _playing = true;

  Widget _railButton(IconData icon, {String? count, Color color = Colors.white}) {
    return Column(
      children: [
        Container(
          width: 38, height: 38,
          decoration: const BoxDecoration(color: Color(0xB3141416), shape: BoxShape.circle),
          child: Icon(icon, size: 16, color: color),
        ),
        if (count != null) ...[
          const SizedBox(height: 3),
          Text(count, style: TextStyle(fontSize: 9, color: color)),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            // Header: back + search
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.of(context).maybePop(),
                    child: Container(
                      width: 30, height: 30,
                      decoration: const BoxDecoration(color: AppColors.surfaceRaised, shape: BoxShape.circle),
                      child: const Icon(Icons.chevron_left, size: 18, color: AppColors.textPrimary),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
                      decoration: BoxDecoration(color: AppColors.surfaceRaised, borderRadius: BorderRadius.circular(999)),
                      child: const Row(children: [
                        Icon(Icons.search, size: 13, color: AppColors.textSecondary),
                        SizedBox(width: 6),
                        Text('Search Googs', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                      ]),
                    ),
                  ),
                ],
              ),
            ),
            // Poster row
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
              child: Row(
                children: [
                  Container(
                    width: 30, height: 30,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(colors: [Color(0xFFFF8A3D), Color(0xFFD8482A)]),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('googer', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                        Text('1 D', style: TextStyle(fontSize: 9.5, color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                  const Icon(Icons.more_vert, size: 18, color: AppColors.textMuted),
                ],
              ),
            ),
            // Video area
            Expanded(
              child: Stack(
                children: [
                  // Replace with a video player (e.g. video_player / chewie).
                  Container(
                    width: double.infinity,
                    color: const Color(0xFF0A0A0B),
                    alignment: Alignment.center,
                    child: const Text('VIDEO', style: TextStyle(fontSize: 10, letterSpacing: 2, color: Color(0xFF3A3A40), fontFamily: 'monospace')),
                  ),
                  // Center controls
                  Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _railButton(Icons.replay_5),
                        const SizedBox(width: 22),
                        GestureDetector(
                          onTap: () => setState(() => _playing = !_playing),
                          child: Container(
                            width: 56, height: 56,
                            decoration: const BoxDecoration(color: Color(0xBF141416), shape: BoxShape.circle),
                            child: Icon(_playing ? Icons.pause : Icons.play_arrow, size: 24, color: Colors.white),
                          ),
                        ),
                        const SizedBox(width: 22),
                        _railButton(Icons.forward_5),
                      ],
                    ),
                  ),
                  // Right action rail
                  Positioned(
                    right: 10, bottom: 70,
                    child: Column(
                      children: [
                        _railButton(Icons.share_outlined, count: '0%'),
                        const SizedBox(height: 16),
                        _railButton(Icons.repeat),
                        const SizedBox(height: 16),
                        _railButton(Icons.remove_red_eye_outlined, count: '1'),
                        const SizedBox(height: 16),
                        _railButton(Icons.chat_bubble_outline),
                        const SizedBox(height: 16),
                        _railButton(Icons.favorite, count: '1', color: AppColors.accentRed),
                      ],
                    ),
                  ),
                  // Bottom scrubber
                  Positioned(
                    left: 12, right: 12, bottom: 14,
                    child: Row(
                      children: [
                        const Text('0:20', style: TextStyle(fontSize: 9, color: Colors.white)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: SliderTheme(
                            data: const SliderThemeData(
                              trackHeight: 3,
                              thumbShape: RoundSliderThumbShape(enabledThumbRadius: 5),
                              activeTrackColor: AppColors.accentRed,
                              thumbColor: AppColors.accentRed,
                              inactiveTrackColor: Colors.white24,
                            ),
                            child: Slider(value: 0.6, onChanged: (_) {}),
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text('0:33', style: TextStyle(fontSize: 9, color: Colors.white)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
