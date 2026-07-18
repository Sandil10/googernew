import 'package:flutter/services.dart';

Future<bool> openLink(String url) async {
  // Native builds don't bundle url_launcher yet — copy so the user can paste.
  await Clipboard.setData(ClipboardData(text: url));
  return false;
}
