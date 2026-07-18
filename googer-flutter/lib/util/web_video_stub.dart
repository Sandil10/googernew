import 'package:flutter/widgets.dart';

/// Native builds don't bundle a video plugin yet — show the poster frame.
Widget buildWebVideo(String url, {String poster = ""}) {
  if (poster.isEmpty) return const ColoredBox(color: Color(0xFF000000));
  return Image.network(poster, fit: BoxFit.contain);
}

Widget buildWebEmbed(String url) => const ColoredBox(color: Color(0xFF000000));
