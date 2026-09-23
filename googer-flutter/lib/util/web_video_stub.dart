import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import 'package:video_player/video_player.dart';

Widget buildWebVideo(
  String url, {
  String poster = "",
  bool interactive = true,
  bool autoPlay = true,
  bool feedControls = false,
  String instanceKey = '',
  double trimStartSeconds = 0,
  double trimEndSeconds = 0,
  double previewDurationSeconds = 0,
  bool loopPreview = false,
  double blurSigma = 0,
  bool showSeekControls = true,
  VoidCallback? onPreviewComplete,
  VoidCallback? onFeedShare,
  VoidCallback? onFeedRepost,
  VoidCallback? onFeedView,
  VoidCallback? onFeedComment,
  VoidCallback? onFeedLike,
  String feedReposts = '',
  String feedViews = '',
  String feedComments = '',
  String feedLikes = '',
  bool feedLiked = false,
}) {
  return IgnorePointer(
    ignoring: !interactive,
    child: _NativeVideoPlayer(
      url: url,
      poster: poster,
      autoPlay: autoPlay,
      feedControls: feedControls,
      trimStartSeconds: trimStartSeconds,
      trimEndSeconds: trimEndSeconds,
      previewDurationSeconds: previewDurationSeconds,
      loopPreview: loopPreview,
      onPreviewComplete: onPreviewComplete,
      onShare: onFeedShare,
      onRepost: onFeedRepost,
      onView: onFeedView,
      onComment: onFeedComment,
      onLike: onFeedLike,
      reposts: feedReposts,
      views: feedViews,
      comments: feedComments,
      likes: feedLikes,
      liked: feedLiked,
    ),
  );
}

Widget buildWebEmbed(
  String url, {
  bool interactive = true,
  bool feedControls = false,
  String instanceKey = '',
  VoidCallback? onFeedShare,
  VoidCallback? onFeedRepost,
  VoidCallback? onFeedView,
  VoidCallback? onFeedComment,
  VoidCallback? onFeedLike,
  String feedReposts = '',
  String feedViews = '',
  String feedComments = '',
  String feedLikes = '',
  bool feedLiked = false,
}) => IgnorePointer(
  ignoring: !interactive,
  child: const ColoredBox(color: Color(0xFF000000)),
);

class _NativeVideoPlayer extends StatefulWidget {
  final String url;
  final String poster;
  final bool autoPlay;
  final bool feedControls;
  final double trimStartSeconds;
  final double trimEndSeconds;
  final double previewDurationSeconds;
  final bool loopPreview;
  final VoidCallback? onPreviewComplete;
  final VoidCallback? onShare;
  final VoidCallback? onRepost;
  final VoidCallback? onView;
  final VoidCallback? onComment;
  final VoidCallback? onLike;
  final String reposts;
  final String views;
  final String comments;
  final String likes;
  final bool liked;
  const _NativeVideoPlayer({
    required this.url,
    required this.poster,
    required this.autoPlay,
    required this.feedControls,
    required this.trimStartSeconds,
    required this.trimEndSeconds,
    required this.previewDurationSeconds,
    required this.loopPreview,
    this.onPreviewComplete,
    this.onShare,
    this.onRepost,
    this.onView,
    this.onComment,
    this.onLike,
    this.reposts = '',
    this.views = '',
    this.comments = '',
    this.likes = '',
    this.liked = false,
  });

  @override
  State<_NativeVideoPlayer> createState() => _NativeVideoPlayerState();
}

class _NativeVideoPlayerState extends State<_NativeVideoPlayer> {
  late final VideoPlayerController _controller;
  bool _ready = false;
  Object? _error;
  bool _showControls = true;
  bool _muted = false;
  double _volume = 1;
  double _speed = 1;
  Timer? _controlsTimer;
  bool _previewFinished = false;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url))
      ..setLooping(widget.autoPlay && !widget.feedControls)
      ..setVolume(1);
    _controller.addListener(_stopAtPreviewEnd);
    _controller
        .initialize()
        .then((_) {
          if (!mounted) return;
          if (widget.trimStartSeconds > 0) {
            _controller.seekTo(
              Duration(milliseconds: (widget.trimStartSeconds * 1000).round()),
            );
          }
          setState(() => _ready = true);
          if (widget.autoPlay) {
            _controller.play().then((_) => _scheduleControlsHide());
          }
        })
        .catchError((err) {
          if (mounted) setState(() => _error = err);
        });
  }

  @override
  void dispose() {
    _controlsTimer?.cancel();
    _controller.removeListener(_stopAtPreviewEnd);
    _controller.dispose();
    super.dispose();
  }

  void _stopAtPreviewEnd() {
    if ((_previewFinished && !widget.loopPreview) ||
        widget.previewDurationSeconds <= 0 ||
        !_ready) {
      return;
    }
    final current = _controller.value.position.inMilliseconds / 1000;
    final end = widget.trimStartSeconds + widget.previewDurationSeconds;
    if (current + 0.02 < end) return;
    if (widget.loopPreview) {
      _controller.seekTo(
        Duration(milliseconds: (widget.trimStartSeconds * 1000).round()),
      );
      _controller.play();
      return;
    }
    _previewFinished = true;
    _controller.pause();
    _controller.seekTo(Duration(milliseconds: (end * 1000).round()));
    widget.onPreviewComplete?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return _PosterOrBlack(poster: widget.poster);
    }
    if (!_ready) {
      return Stack(
        fit: StackFit.expand,
        children: [
          _PosterOrBlack(poster: widget.poster),
          const Center(
            child: CircularProgressIndicator(
              color: Colors.white,
              strokeWidth: 2,
            ),
          ),
        ],
      );
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        GestureDetector(
          onTapDown: widget.feedControls ? _handleFrameTap : null,
          onTap: widget.feedControls ? _revealControls : _togglePlayback,
          child: FittedBox(
            fit: BoxFit.contain,
            child: SizedBox(
              width: _controller.value.size.width,
              height: _controller.value.size.height,
              child: VideoPlayer(_controller),
            ),
          ),
        ),
        if (widget.feedControls) _nativeFeedControls(),
      ],
    );
  }

  void _togglePlayback() {
    setState(() {
      _controller.value.isPlaying ? _controller.pause() : _controller.play();
    });
    _revealControls();
  }

  void _handleFrameTap(TapDownDetails details) {
    final width = context.size?.width ?? 0;
    _seek(details.localPosition.dx < width / 2 ? -5 : 5);
    _revealControls();
  }

  void _revealControls() {
    if (mounted && !_showControls) setState(() => _showControls = true);
    _scheduleControlsHide();
  }

  void _scheduleControlsHide() {
    _controlsTimer?.cancel();
    if (!_controller.value.isPlaying) return;
    _controlsTimer = Timer(const Duration(milliseconds: 1400), () {
      if (mounted && _controller.value.isPlaying) {
        setState(() => _showControls = false);
      }
    });
  }

  Widget _nativeFeedControls() {
    return AnimatedBuilder(
      animation: _controller,
      builder: (_, __) {
        final start = widget.trimStartSeconds;
        final nativeDuration = _controller.value.duration.inMilliseconds / 1000;
        final end = widget.trimEndSeconds > start
            ? widget.trimEndSeconds
            : nativeDuration;
        final current = _controller.value.position.inMilliseconds / 1000;
        final relative = (current - start).clamp(
          0.0,
          (end - start).clamp(0.1, double.infinity),
        );
        final duration = (end - start).clamp(0.1, double.infinity);
        if (current >= end && _controller.value.isPlaying) {
          WidgetsBinding.instance.addPostFrameCallback((_) async {
            await _controller.pause();
            await _controller.seekTo(
              Duration(milliseconds: (start * 1000).round()),
            );
          });
        }
        return Stack(
          children: [
            IgnorePointer(
              ignoring: !_showControls,
              child: AnimatedOpacity(
                opacity: _showControls ? 1 : 0,
                duration: const Duration(milliseconds: 180),
                child: Stack(
                  children: [
                    Positioned(top: 12, right: 12, child: _topControls()),
                    Center(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _seekButton(-5),
                          const SizedBox(width: 12),
                          _googerPlaybackButton(),
                          const SizedBox(width: 12),
                          _seekButton(5),
                        ],
                      ),
                    ),
                    Positioned(
                      left: 12,
                      right: 12,
                      bottom: 12,
                      child: Row(
                        children: [
                          Text(
                            _formatVideoTime(relative),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          Expanded(
                            child: SliderTheme(
                              data: SliderTheme.of(context).copyWith(
                                trackHeight: 6,
                                thumbShape: const RoundSliderThumbShape(
                                  enabledThumbRadius: 5,
                                ),
                                overlayShape: SliderComponentShape.noOverlay,
                              ),
                              child: Slider(
                                min: 0,
                                max: duration,
                                value: relative.clamp(0.0, duration),
                                activeColor: const Color(0xFFE11D48),
                                inactiveColor: Colors.white30,
                                onChanged: (value) => _controller.seekTo(
                                  Duration(
                                    milliseconds: ((start + value) * 1000)
                                        .round(),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          Text(
                            _formatVideoTime(duration),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(right: 12, bottom: 64, child: _actionRail()),
          ],
        );
      },
    );
  }

  Widget _seekButton(int seconds) => GestureDetector(
    onTap: () => _seek(seconds),
    child: Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: Color(0x88000000),
        shape: BoxShape.circle,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            seconds < 0 ? Ionicons.chevron_back : Ionicons.chevron_forward,
            size: 10,
            color: Colors.white,
          ),
          Text(
            '${seconds.abs()}s',
            style: const TextStyle(color: Colors.white, fontSize: 6),
          ),
        ],
      ),
    ),
  );

  void _seek(int seconds) {
    final start = widget.trimStartSeconds;
    final nativeEnd = _controller.value.duration.inMilliseconds / 1000;
    final end = widget.trimEndSeconds > start
        ? widget.trimEndSeconds
        : nativeEnd;
    final current = _controller.value.position.inMilliseconds / 1000;
    final next = (current + seconds).clamp(start, end);
    _controller.seekTo(Duration(milliseconds: (next * 1000).round()));
  }

  Widget _googerPlaybackButton() => GestureDetector(
    onTap: _togglePlayback,
    child: Container(
      width: 36,
      height: 36,
      decoration: const BoxDecoration(
        color: Color(0x99000000),
        shape: BoxShape.circle,
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Image.asset('assets/images/googer.png', width: 22, height: 22),
          Positioned(
            right: 5,
            bottom: 5,
            child: Icon(
              _controller.value.isPlaying
                  ? Icons.pause_rounded
                  : Icons.play_arrow_rounded,
              size: 9,
              color: Colors.white,
            ),
          ),
        ],
      ),
    ),
  );

  Widget _topControls() => Container(
    height: 32,
    padding: const EdgeInsets.symmetric(horizontal: 10),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: 0.55),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: () {
            setState(() => _muted = !_muted);
            _controller.setVolume(_muted ? 0 : _volume);
          },
          child: Icon(
            _muted || _volume == 0
                ? Ionicons.volume_mute
                : Ionicons.volume_high,
            size: 15,
            color: Colors.white,
          ),
        ),
        SizedBox(
          width: 48,
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 2,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 5),
              overlayShape: SliderComponentShape.noOverlay,
            ),
            child: Slider(
              min: 0,
              max: 1,
              value: _muted ? 0 : _volume,
              activeColor: const Color(0xFFFF2F67),
              inactiveColor: Colors.white30,
              onChanged: (value) {
                setState(() {
                  _volume = value;
                  _muted = value == 0;
                });
                _controller.setVolume(value);
              },
            ),
          ),
        ),
        GestureDetector(
          onTap: () {
            const speeds = <double>[0.5, 1, 1.5, 2];
            final index = speeds.indexOf(_speed);
            setState(() => _speed = speeds[(index + 1) % speeds.length]);
            _controller.setPlaybackSpeed(_speed);
          },
          child: Container(
            constraints: const BoxConstraints(minWidth: 30),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              '${_speed}x'.replaceFirst('.0x', 'x'),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
      ],
    ),
  );

  Widget _actionRail() => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      _railAction(Ionicons.share_social_outline, '', widget.onShare),
      _railAction(Ionicons.repeat_outline, widget.reposts, widget.onRepost),
      _railAction(Ionicons.eye_outline, widget.views, widget.onView),
      _railAction(
        Ionicons.chatbubble_outline,
        widget.comments,
        widget.onComment,
      ),
      _railAction(
        widget.liked ? Ionicons.heart : Ionicons.heart_outline,
        widget.likes,
        widget.onLike,
        color: widget.liked ? const Color(0xFFFF315F) : Colors.white,
      ),
    ],
  );

  Widget _railAction(
    IconData icon,
    String label,
    VoidCallback? onTap, {
    Color color = Colors.white,
  }) => GestureDetector(
    onTap: onTap,
    behavior: HitTestBehavior.opaque,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Column(
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: const Color(0x593F3F46),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
            ),
            child: Icon(icon, size: 17, color: color),
          ),
          if (label.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 7,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
        ],
      ),
    ),
  );

  String _formatVideoTime(double seconds) {
    final safe = seconds.isFinite ? seconds.floor().clamp(0, 359999) : 0;
    return '${safe ~/ 60}:${(safe % 60).toString().padLeft(2, '0')}';
  }
}

class _PosterOrBlack extends StatelessWidget {
  final String poster;
  const _PosterOrBlack({required this.poster});

  @override
  Widget build(BuildContext context) {
    if (poster.isEmpty) return const ColoredBox(color: Colors.black);
    return Image.network(
      poster,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => const ColoredBox(color: Colors.black),
    );
  }
}
