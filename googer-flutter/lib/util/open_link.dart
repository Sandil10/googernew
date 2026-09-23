import 'open_link_stub.dart' if (dart.library.html) 'open_link_web.dart'
    as impl;

/// Open an external URL (ad CTA links, share targets).
/// Web build: opens a new browser tab. Native: copies to clipboard.
/// Returns true when the link was opened, false when it was only copied.
Future<bool> openExternalLink(String url) => impl.openLink(url);
