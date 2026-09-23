import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';

Widget buildWebImage(
  String url, {
  BoxFit fit = BoxFit.cover,
  Widget? errorFallback,
  double blurSigma = 0,
}) {
  final image = Image.network(
    url,
    fit: fit,
    errorBuilder: (_, __, ___) => errorFallback ?? const SizedBox.shrink(),
  );
  if (blurSigma <= 0) return image;
  return ImageFiltered(
    imageFilter: ui.ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
    child: image,
  );
}
