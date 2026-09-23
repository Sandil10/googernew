// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'dart:ui_web' as ui_web;

import 'package:flutter/widgets.dart';

final Set<String> _registeredImages = <String>{};

Widget buildWebImage(
  String url, {
  BoxFit fit = BoxFit.cover,
  Widget? errorFallback,
  double blurSigma = 0,
}) {
  final src = url.trim();
  if (src.isEmpty) return errorFallback ?? const SizedBox.shrink();
  final viewType =
      'googer-img-${Object.hash(src, fit, blurSigma.toStringAsFixed(1))}';
  if (!_registeredImages.contains(viewType)) {
    ui_web.platformViewRegistry.registerViewFactory(viewType, (int _) {
      final img = html.ImageElement()
        ..src = src
        ..draggable = false
        ..style.width = '100%'
        ..style.height = '100%'
        ..style.objectFit = _cssFit(fit)
        ..style.display = 'block'
        ..style.border = '0'
        ..style.margin = '0'
        ..style.padding = '0'
        ..style.backgroundColor = '#000';
      if (blurSigma > 0) {
        img.style
          ..filter = 'blur(${blurSigma.toStringAsFixed(1)}px)'
          ..transform = 'scale(1.08)';
      }
      return img;
    });
    _registeredImages.add(viewType);
  }
  return HtmlElementView(viewType: viewType);
}

String _cssFit(BoxFit fit) {
  switch (fit) {
    case BoxFit.contain:
      return 'contain';
    case BoxFit.fill:
      return 'fill';
    case BoxFit.fitWidth:
      return 'cover';
    case BoxFit.fitHeight:
      return 'cover';
    case BoxFit.none:
      return 'none';
    case BoxFit.scaleDown:
      return 'scale-down';
    case BoxFit.cover:
      return 'cover';
  }
}
