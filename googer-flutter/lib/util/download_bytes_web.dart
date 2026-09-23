import 'dart:html' as html;
import 'dart:typed_data';

Future<bool> downloadBytes(
  Uint8List bytes,
  String filename,
  String mimeType,
) async {
  final blob = html.Blob([bytes], mimeType);
  final url = html.Url.createObjectUrlFromBlob(blob);
  try {
    html.AnchorElement(href: url)
      ..download = filename
      ..style.display = 'none'
      ..click();
    return true;
  } finally {
    html.Url.revokeObjectUrl(url);
  }
}
