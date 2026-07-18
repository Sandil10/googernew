// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:ui_web' as ui_web;
import 'package:flutter/widgets.dart';

final _registered = <String>{};

/// Real <video> element on Flutter web — plays upload-content / ad videos.
Widget buildWebVideo(String url, {String poster = ""}) {
  final viewType = "googer-video-${url.hashCode}";
  if (!_registered.contains(viewType)) {
    ui_web.platformViewRegistry.registerViewFactory(viewType, (int _) {
      final video = html.VideoElement()
        ..src = url
        ..autoplay = true
        ..controls = true
        ..loop = true
        ..style.width = "100%"
        ..style.height = "100%"
        ..style.objectFit = "contain"
        ..style.backgroundColor = "black"
        ..setAttribute("playsinline", "true");
      if (poster.isNotEmpty) video.poster = poster;
      // Browsers block un-muted autoplay — retry muted so playback always starts.
      video.play().catchError((_) {
        video.muted = true;
        video.play();
        return null;
      });
      return video;
    });
    _registered.add(viewType);
  }
  return HtmlElementView(viewType: viewType);
}

/// Iframe embed (YouTube / Instagram / TikTok players) on Flutter web.
Widget buildWebEmbed(String url) {
  final viewType = "googer-embed-${url.hashCode}";
  if (!_registered.contains(viewType)) {
    ui_web.platformViewRegistry.registerViewFactory(viewType, (int _) {
      return html.IFrameElement()
        ..src = url
        ..allow =
            "autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
        ..allowFullscreen = true
        ..style.border = "0"
        ..style.width = "100%"
        ..style.height = "100%"
        ..style.backgroundColor = "black";
    });
    _registered.add(viewType);
  }
  return HtmlElementView(viewType: viewType);
}
