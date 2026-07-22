import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

Widget buildWebVideo(String url, {String poster = ""}) {
  return _NativeVideoPlayer(url: url, poster: poster);
}

Widget buildWebEmbed(String url) => const ColoredBox(color: Color(0xFF000000));

class _NativeVideoPlayer extends StatefulWidget {
  final String url;
  final String poster;
  const _NativeVideoPlayer({required this.url, required this.poster});

  @override
  State<_NativeVideoPlayer> createState() => _NativeVideoPlayerState();
}

class _NativeVideoPlayerState extends State<_NativeVideoPlayer> {
  late final VideoPlayerController _controller;
  bool _ready = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url))
      ..setLooping(true)
      ..setVolume(1);
    _controller.initialize().then((_) {
      if (!mounted) return;
      setState(() => _ready = true);
      _controller.play();
    }).catchError((err) {
      if (mounted) setState(() => _error = err);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return _PosterOrBlack(poster: widget.poster);
    }
    if (!_ready) {
      return Stack(fit: StackFit.expand, children: [
        _PosterOrBlack(poster: widget.poster),
        const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)),
      ]);
    }
    return GestureDetector(
      onTap: () {
        setState(() {
          _controller.value.isPlaying ? _controller.pause() : _controller.play();
        });
      },
      child: FittedBox(
        fit: BoxFit.contain,
        child: SizedBox(
          width: _controller.value.size.width,
          height: _controller.value.size.height,
          child: VideoPlayer(_controller),
        ),
      ),
    );
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
