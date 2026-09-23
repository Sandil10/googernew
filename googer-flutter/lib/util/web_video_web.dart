import 'dart:async';

// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:ui_web' as ui_web;
import 'package:flutter/widgets.dart';

final _registered = <String>{};
final _feedBindings = <String, _FeedVideoBinding>{};

class _FeedVideoBinding {
  VoidCallback? onShare;
  VoidCallback? onRepost;
  VoidCallback? onView;
  VoidCallback? onComment;
  VoidCallback? onLike;
  String reposts = '';
  String views = '';
  String comments = '';
  String likes = '';
  bool liked = false;
  final Map<String, html.SpanElement> _labels = {};
  html.ButtonElement? _heartButton;

  void update({
    VoidCallback? share,
    VoidCallback? repost,
    VoidCallback? view,
    VoidCallback? comment,
    VoidCallback? like,
    required String repostCount,
    required String viewCount,
    required String commentCount,
    required String likeCount,
    required bool isLiked,
  }) {
    onShare = share;
    onRepost = repost;
    onView = view;
    onComment = comment;
    onLike = like;
    reposts = repostCount;
    views = viewCount;
    comments = commentCount;
    likes = likeCount;
    liked = isLiked;
    _sync();
  }

  void attachLabel(String kind, html.SpanElement label) {
    _labels[kind] = label;
    _sync();
  }

  void attachHeart(html.ButtonElement button) {
    _heartButton = button;
    _sync();
  }

  void _sync() {
    final values = <String, String>{
      'reposts': reposts,
      'views': views,
      'comments': comments,
      'likes': likes,
    };
    for (final entry in values.entries) {
      final label = _labels[entry.key];
      if (label == null) continue;
      label.text = entry.value;
      label.style.display = entry.value.isEmpty ? 'none' : 'block';
    }
    final heart = _heartButton;
    if (heart != null) {
      _setVideoIcon(heart, liked ? 'heart-filled' : 'heart');
      heart.style.color = liked ? '#ff315f' : '#fff';
    }
  }
}

/// Real <video> element on Flutter web — plays upload-content / ad videos.
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
  final viewType =
      "googer-video-${url.hashCode}-${instanceKey.hashCode}-${interactive ? 'input' : 'pass'}-${autoPlay ? 'play' : 'still'}-${feedControls ? 'feed' : 'plain'}-${trimStartSeconds.hashCode}-${trimEndSeconds.hashCode}-${previewDurationSeconds.hashCode}-${blurSigma.hashCode}-${showSeekControls ? 'seek' : 'noseek'}";
  final feedBinding = _feedBindings.putIfAbsent(viewType, _FeedVideoBinding.new)
    ..update(
      share: onFeedShare,
      repost: onFeedRepost,
      view: onFeedView,
      comment: onFeedComment,
      like: onFeedLike,
      repostCount: feedReposts,
      viewCount: feedViews,
      commentCount: feedComments,
      likeCount: feedLikes,
      isLiked: feedLiked,
    );
  if (!_registered.contains(viewType)) {
    ui_web.platformViewRegistry.registerViewFactory(viewType, (int _) {
      final video = html.VideoElement()
        ..src = url
        ..autoplay = autoPlay
        ..controls = interactive && !feedControls
        ..loop = autoPlay
        ..style.width = "100%"
        ..style.height = "100%"
        ..style.objectFit = "contain"
        ..style.backgroundColor = "black"
        ..style.pointerEvents = interactive ? "auto" : "none"
        ..setAttribute("playsinline", "true");
      if (blurSigma > 0) {
        video.style.filter = "blur(${blurSigma}px)";
        video.style.transform = "scale(1.04)";
      }
      if (poster.isNotEmpty) video.poster = poster;
      var previewFinished = false;
      if (previewDurationSeconds > 0) {
        video.loop = false;
        video.onTimeUpdate.listen((_) {
          if (previewFinished && !loopPreview) return;
          final previewEnd = trimStartSeconds + previewDurationSeconds;
          if (video.currentTime + 0.02 < previewEnd) return;
          if (loopPreview) {
            video.currentTime = trimStartSeconds;
            video.play();
            return;
          }
          previewFinished = true;
          video.pause();
          video.currentTime = previewEnd;
          onPreviewComplete?.call();
        });
      }
      if (!autoPlay) {
        video.onLoadedMetadata.first.then((_) {
          video.currentTime = trimStartSeconds + 0.2;
          video.pause();
        });
      }
      if (feedControls) {
        video.loop = false;
        return _feedVideoSurface(
          video,
          binding: feedBinding,
          trimStartSeconds: trimStartSeconds,
          trimEndSeconds: trimEndSeconds,
          showSeekControls: showSeekControls,
        );
      }
      // Browsers block un-muted autoplay — retry muted so playback always starts.
      if (autoPlay) {
        video.play().catchError((_) {
          video.muted = true;
          video.play();
          return null;
        });
        html.IntersectionObserver(
          (entries, _) {
            if (entries.isEmpty) return;
            final entry = entries.first as html.IntersectionObserverEntry;
            final ratio = entry.intersectionRatio ?? 0;
            if (ratio < 0.35 && !video.paused) {
              video.pause();
              return;
            }
            if (ratio >= 0.6 &&
                video.paused &&
                !(previewDurationSeconds > 0 && previewFinished)) {
              video.play().catchError((_) => null);
            }
          },
          const {
            'threshold': <double>[0, 0.35, 0.6, 0.85],
          },
        ).observe(video);
      }
      return video;
    });
    _registered.add(viewType);
  }
  return HtmlElementView(viewType: viewType);
}

html.Element _feedVideoSurface(
  html.VideoElement video, {
  required _FeedVideoBinding binding,
  required double trimStartSeconds,
  required double trimEndSeconds,
  required bool showSeekControls,
}) {
  final root = html.DivElement()
    ..style.cssText =
        'position:relative;width:100%;height:100%;overflow:hidden;background:#000;pointer-events:auto';
  video.style.pointerEvents = 'auto';

  final top = html.DivElement()
    ..style.cssText =
        'position:absolute;right:12px;top:12px;z-index:5;display:flex;align-items:center;gap:8px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.50);box-shadow:0 4px 12px rgba(0,0,0,.28);backdrop-filter:blur(4px)';
  final sound = html.ButtonElement()
    ..title = 'Mute or unmute'
    ..style.cssText =
        'width:24px;height:24px;min-width:24px;border:0;border-radius:999px;background:transparent;color:white;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;';
  _setVideoIcon(sound, 'volume');
  final volume = html.InputElement(type: 'range')
    ..min = '0'
    ..max = '1'
    ..step = '.05'
    ..value = '1'
    ..title = 'Volume'
    ..style.cssText = 'width:48px;height:4px;accent-color:#f43f5e';
  final speed = html.ButtonElement()
    ..text = '1x'
    ..title = 'Playback speed'
    ..style.cssText =
        'min-width:30px;border:0;border-radius:999px;background:rgba(255,255,255,.15);color:white;font:900 11px Arial;line-height:1;padding:2px 6px;cursor:pointer;';
  top.children.addAll([sound, volume, speed]);

  final center = html.DivElement()
    ..style.cssText =
        'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;display:flex;align-items:center;gap:12px';
  html.ButtonElement seekButton(String iconName, String title) {
    final button = html.ButtonElement()
      ..title = title
      ..style.cssText =
          '${_feedButtonCss('28px')}flex-direction:column;gap:0;line-height:1;';
    final icon = html.SpanElement();
    _setVideoIcon(icon, iconName, size: 11);
    button.children.addAll([
      icon..style.height = '10px',
      html.SpanElement()
        ..text = '5s'
        ..style.cssText = 'font-size:6px;line-height:7px',
    ]);
    return button;
  }

  final back = seekButton('chevron-back', 'Skip back 5 seconds');
  final play = html.ButtonElement()
    ..title = 'Pause video'
    ..style.cssText = '${_feedButtonCss('36px')}position:relative;';
  final logo = html.ImageElement(src: 'assets/assets/images/googer.png')
    ..alt = 'Googer video control'
    ..style.cssText =
        'width:22px;height:22px;object-fit:contain;pointer-events:none';
  play.children.add(logo);
  final forward = seekButton('chevron-forward', 'Skip forward 5 seconds');
  center.children.addAll(showSeekControls ? [back, play, forward] : [play]);

  final bottom = html.DivElement()
    ..style.cssText =
        'position:absolute;left:12px;right:12px;bottom:12px;z-index:5;display:flex;align-items:center;gap:8px';
  final currentLabel = html.SpanElement()..text = '0:00';
  final progress = html.InputElement(type: 'range')
    ..min = '0'
    ..step = '.1'
    ..value = '0'
    ..title = 'Video progress'
    ..style.cssText = 'flex:1;height:6px;accent-color:#e11d48';
  final durationLabel = html.SpanElement()..text = '0:00';
  for (final label in [currentLabel, durationLabel]) {
    label.style.cssText =
        'font-size:11px;font-weight:900;color:white;text-shadow:0 1px 4px black';
  }
  bottom.children.addAll([currentLabel, progress, durationLabel]);
  final rail = html.DivElement()
    ..style.cssText =
        'position:absolute;right:12px;bottom:64px;z-index:6;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:auto';
  html.Element railAction(
    String icon,
    String kind,
    String title,
    VoidCallback? Function() callback, {
    bool heart = false,
  }) {
    final wrap = html.DivElement()
      ..style.cssText =
          'display:flex;flex-direction:column;align-items:center;gap:2px';
    final button = html.ButtonElement()
      ..title = title
      ..style.cssText =
          'width:32px;height:32px;min-width:32px;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(63,63,70,.35);color:#fff;font:400 17px Arial;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;text-shadow:0 1px 4px #000;backdrop-filter:blur(4px);';
    _setVideoIcon(button, icon, size: 17);
    button.onClick.listen((event) {
      event.stopPropagation();
      callback()?.call();
    });
    wrap.children.add(button);
    final label = html.SpanElement()
      ..style.cssText =
          'display:none;font:700 8px Arial;color:white;text-shadow:0 1px 3px black';
    wrap.children.add(label);
    binding.attachLabel(kind, label);
    if (heart) binding.attachHeart(button);
    return wrap;
  }

  rail.children.addAll([
    railAction('share', 'share', 'Share', () => binding.onShare),
    railAction('repeat', 'reposts', 'Repost', () => binding.onRepost),
    railAction('eye', 'views', 'Views', () => binding.onView),
    railAction('comment', 'comments', 'Comments', () => binding.onComment),
    railAction(
      binding.liked ? 'heart-filled' : 'heart',
      'likes',
      'Like',
      () => binding.onLike,
      heart: true,
    ),
  ]);
  root.children.addAll([video, top, center, bottom, rail]);

  final start = trimStartSeconds < 0 ? 0.0 : trimStartSeconds;
  var end = trimEndSeconds;
  var muted = false;
  const speeds = <double>[0.5, 1, 1.5, 2];
  var speedIndex = 1;
  var controlsVisible = true;
  Timer? hideControlsTimer;

  final transientControls = <html.Element>[top, center, bottom];
  void setControlsVisible(bool visible) {
    controlsVisible = visible;
    for (final element in transientControls) {
      element.style.opacity = visible ? '1' : '0';
      element.style.pointerEvents = visible ? 'auto' : 'none';
    }
  }

  void cancelHideTimer() {
    hideControlsTimer?.cancel();
    hideControlsTimer = null;
  }

  void scheduleHideControls() {
    cancelHideTimer();
    if (video.paused) {
      setControlsVisible(true);
      return;
    }
    hideControlsTimer = Timer(const Duration(milliseconds: 1400), () {
      if (!video.paused) setControlsVisible(false);
    });
  }

  void revealControls() {
    setControlsVisible(true);
    scheduleHideControls();
  }

  String format(double value) {
    final seconds = value.isFinite ? value.floor().clamp(0, 359999) : 0;
    return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
  }

  double effectiveEnd() => end > start
      ? end
      : (video.duration.isFinite ? video.duration.toDouble() : start);

  void sync() {
    final duration = (effectiveEnd() - start).clamp(0.1, 359999.0);
    final relative = (video.currentTime - start).clamp(0.0, duration);
    progress.max = '$duration';
    progress.value = '$relative';
    currentLabel.text = format(relative);
    durationLabel.text = format(duration);
    play.title = video.paused ? 'Play video' : 'Pause video';
  }

  void seek(double seconds) {
    video.currentTime = (video.currentTime + seconds)
        .clamp(start, effectiveEnd())
        .toDouble();
    sync();
  }

  video.onLoadedMetadata.listen((_) {
    if (end <= start || end > video.duration) {
      end = video.duration.toDouble();
    }
    video.currentTime = start;
    video.muted = false;
    video.volume = 1;
    muted = false;
    _setVideoIcon(sound, 'volume');
    sync();
  });
  video.onTimeUpdate.listen((_) {
    if (video.currentTime >= effectiveEnd()) {
      video.pause();
      video.currentTime = start;
    }
    sync();
  });
  video.onPlay.listen((_) {
    sync();
    scheduleHideControls();
  });
  video.onPause.listen((_) {
    sync();
    cancelHideTimer();
    setControlsVisible(true);
  });
  back.onClick.listen((event) {
    event.stopPropagation();
    seek(-5);
  });
  forward.onClick.listen((event) {
    event.stopPropagation();
    seek(5);
  });
  play.onClick.listen((event) {
    event.stopPropagation();
    if (video.paused) {
      video.muted = false;
      video.volume = 1;
      muted = false;
      _setVideoIcon(sound, 'volume');
      if (video.currentTime < start || video.currentTime >= effectiveEnd()) {
        video.currentTime = start;
      }
      video.play();
    } else {
      video.pause();
    }
  });
  sound.onClick.listen((event) {
    event.stopPropagation();
    muted = !muted;
    video.muted = muted;
    _setVideoIcon(sound, muted ? 'muted' : 'volume');
  });
  volume.onInput.listen((_) {
    video.volume = double.tryParse(volume.value ?? '')?.clamp(0, 1) ?? 1;
    video.muted = video.volume == 0;
    muted = video.muted;
    _setVideoIcon(sound, muted ? 'muted' : 'volume');
  });
  speed.onClick.listen((event) {
    event.stopPropagation();
    speedIndex = (speedIndex + 1) % speeds.length;
    video.playbackRate = speeds[speedIndex];
    speed.text = '${speeds[speedIndex]}x'.replaceFirst('.0x', 'x');
  });
  progress.onInput.listen((_) {
    video.currentTime = start + (double.tryParse(progress.value ?? '') ?? 0);
    sync();
  });
  root.onMouseMove.listen((_) => revealControls());
  root.onTouchStart.listen((_) => revealControls());
  root.onClick.listen((event) {
    if (event.target != video) return;
    final bounds = root.getBoundingClientRect();
    seek(event.client.x - bounds.left < bounds.width / 2 ? -5 : 5);
    revealControls();
  });
  html.IntersectionObserver(
    (entries, _) {
      if (entries.isEmpty) return;
      final entry = entries.first as html.IntersectionObserverEntry;
      if ((entry.intersectionRatio ?? 0) < 0.35 && !video.paused) {
        video.pause();
      }
    },
    const {
      'threshold': <double>[0, 0.35, 0.7],
    },
  ).observe(root);
  video.muted = false;
  video.volume = 1;
  _setVideoIcon(sound, 'volume');
  video.play().catchError((_) {
    video.muted = true;
    muted = true;
    _setVideoIcon(sound, 'muted');
    video.play();
    return null;
  });
  if (!controlsVisible) setControlsVisible(true);
  return root;
}

String _feedButtonCss(String size) =>
    'width:$size;height:$size;min-width:$size;border:0;border-radius:999px;background:rgba(0,0,0,.38);color:white;font:700 8px Arial;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;box-shadow:0 8px 20px rgba(0,0,0,.26);backdrop-filter:blur(4px);';

void _setVideoIcon(html.Element element, String name, {int size = 16}) {
  _ensureIoniconsFont();
  final codePoint = switch (name) {
    'volume' => 0xef10,
    'muted' => 0xef19,
    'share' => 0xee6e,
    'repeat' => 0xee2a,
    'eye' => 0xebe4,
    'comment' => 0xeb15,
    'heart-filled' => 0xec73,
    'chevron-back' => 0xeb2f,
    'chevron-forward' => 0xeb3b,
    _ => 0xec71,
  };
  element.children.clear();
  element.children.add(
    html.SpanElement()
      ..text = String.fromCharCode(codePoint)
      ..setAttribute('aria-hidden', 'true')
      ..style.cssText =
          "display:block;width:${size}px;height:${size}px;font-family:'Googer Ionicons';font-size:${size}px;font-style:normal;font-weight:normal;line-height:${size}px;text-align:center;speak:none;",
  );
}

void _ensureIoniconsFont() {
  const styleId = 'googer-ionicons-font';
  if (html.document.getElementById(styleId) != null) return;
  final style = html.StyleElement()
    ..id = styleId
    ..text = '''
@font-face {
  font-family: 'Googer Ionicons';
  src: url('assets/packages/ionicons/assets/fonts/Ionicons.ttf') format('truetype');
  font-style: normal;
  font-weight: normal;
  font-display: block;
}
''';
  html.document.head?.children.add(style);
}

/// Iframe embed (YouTube / Instagram / TikTok players) on Flutter web.
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
}) {
  final viewType =
      "googer-embed-${url.hashCode}-${instanceKey.hashCode}-${interactive ? 'input' : 'pass'}-${feedControls ? 'feed' : 'plain'}";
  final feedBinding = _feedBindings.putIfAbsent(viewType, _FeedVideoBinding.new)
    ..update(
      share: onFeedShare,
      repost: onFeedRepost,
      view: onFeedView,
      comment: onFeedComment,
      like: onFeedLike,
      repostCount: feedReposts,
      viewCount: feedViews,
      commentCount: feedComments,
      likeCount: feedLikes,
      isLiked: feedLiked,
    );
  if (!_registered.contains(viewType)) {
    ui_web.platformViewRegistry.registerViewFactory(viewType, (int _) {
      final frame = html.IFrameElement()
        ..src = url
        ..allow =
            "autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
        ..allowFullscreen = true
        ..style.border = "0"
        ..style.width = "100%"
        ..style.height = "100%"
        ..style.backgroundColor = "black"
        ..style.pointerEvents = interactive ? "auto" : "none";
      if (!feedControls) return frame;
      final root = html.DivElement()
        ..style.cssText =
            'position:relative;width:100%;height:100%;overflow:hidden;background:#000;pointer-events:auto';
      final rail = html.DivElement()
        ..style.cssText =
            'position:absolute;right:12px;bottom:64px;z-index:6;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:auto';
      html.Element action(
        String icon,
        String kind,
        String title,
        VoidCallback? Function() callback, {
        bool heart = false,
      }) {
        final wrap = html.DivElement()
          ..style.cssText =
              'display:flex;flex-direction:column;align-items:center;gap:2px';
        final button = html.ButtonElement()
          ..title = title
          ..style.cssText =
              'width:32px;height:32px;min-width:32px;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(63,63,70,.35);color:#fff;font:400 17px Arial;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;text-shadow:0 1px 4px #000;backdrop-filter:blur(4px);';
        _setVideoIcon(button, icon, size: 17);
        button.onClick.listen((event) {
          event.stopPropagation();
          callback()?.call();
        });
        wrap.children.add(button);
        final label = html.SpanElement()
          ..style.cssText =
              'font:700 8px Arial;color:white;text-shadow:0 1px 3px black';
        wrap.children.add(label);
        feedBinding.attachLabel(kind, label);
        if (heart) feedBinding.attachHeart(button);
        return wrap;
      }

      rail.children.addAll([
        action('share', 'share', 'Share', () => feedBinding.onShare),
        action('repeat', 'reposts', 'Repost', () => feedBinding.onRepost),
        action('eye', 'views', 'Views', () => feedBinding.onView),
        action('comment', 'comments', 'Comments', () => feedBinding.onComment),
        action(
          feedBinding.liked ? 'heart-filled' : 'heart',
          'likes',
          'Like',
          () => feedBinding.onLike,
          heart: true,
        ),
      ]);
      root.children.addAll([frame, rail]);
      return root;
    });
    _registered.add(viewType);
  }
  return HtmlElementView(viewType: viewType);
}
