import 'package:flutter/widgets.dart';
import 'web_image_stub.dart'
    if (dart.library.html) 'web_image_web.dart'
    as impl;

Widget webImage(
  String url, {
  BoxFit fit = BoxFit.cover,
  Widget? errorFallback,
  double blurSigma = 0,
}) => impl.buildWebImage(
  url,
  fit: fit,
  errorFallback: errorFallback,
  blurSigma: blurSigma,
);
