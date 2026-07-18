import 'package:flutter/widgets.dart';
import 'web_video_stub.dart' if (dart.library.html) 'web_video_web.dart'
    as impl;

/// Cross-platform video surface (real <video> tag on web).
Widget webVideo(String url, {String poster = ""}) =>
    impl.buildWebVideo(url, poster: poster);

/// Cross-platform iframe embed (YouTube/Instagram/TikTok on web).
Widget webEmbed(String url) => impl.buildWebEmbed(url);
