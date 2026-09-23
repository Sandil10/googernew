// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

/// Scheme handlers the browser must hand to a device app rather than a tab.
const _handoffSchemes = {'tel', 'mailto', 'sms', 'whatsapp'};

Future<bool> openLink(String url) async {
  final scheme = url.split(':').first.toLowerCase();
  if (_handoffSchemes.contains(scheme)) {
    // `window.open` on a `tel:` URI either opens a blank tab or is swallowed by
    // the popup blocker on mobile browsers. A synthetic anchor click is what
    // actually raises the phone's dialler (or mail app) with the number filled
    // in, which is what "Call Now" has to do.
    final anchor = html.AnchorElement(href: url)
      ..style.display = 'none'
      ..rel = 'noopener';
    html.document.body?.append(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }
  html.window.open(url, '_blank');
  return true;
}
