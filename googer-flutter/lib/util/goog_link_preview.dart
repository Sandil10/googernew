class GoogLinkPreviewData {
  const GoogLinkPreviewData({
    required this.href,
    required this.host,
    required this.pathLabel,
    required this.favicon,
    this.videoThumbnail,
    this.videoLabel,
  });

  final String href;
  final String host;
  final String pathLabel;
  final String favicon;
  final String? videoThumbnail;
  final String? videoLabel;

  bool get isVideo => videoLabel != null;
}

final _googUrlPattern = RegExp(
  r'(https?://[^\s]+|www\.[^\s]+)',
  caseSensitive: false,
);

GoogLinkPreviewData? googLinkPreview(String text) {
  if (text.trim().isEmpty) return null;
  final raw = _googUrlPattern.firstMatch(text)?.group(0);
  if (raw == null || raw.isEmpty) return null;

  final normalized = RegExp(r'^https?://', caseSensitive: false).hasMatch(raw)
      ? raw
      : 'https://$raw';
  final uri = Uri.tryParse(normalized);
  if (uri == null || uri.host.isEmpty) return null;

  final host = uri.host.replaceFirst(
    RegExp(r'^www\.', caseSensitive: false),
    '',
  );
  final segments = uri.pathSegments;
  String? videoThumbnail;
  String? videoLabel;

  if (host == 'youtu.be' && segments.isNotEmpty) {
    videoThumbnail =
        'https://img.youtube.com/vi/${segments.first}/hqdefault.jpg';
    videoLabel = 'YouTube';
  } else if (host.endsWith('youtube.com')) {
    final id =
        uri.queryParameters['v'] ??
        ((segments.length > 1 &&
                (segments.first == 'embed' || segments.first == 'shorts'))
            ? segments[1]
            : null);
    if (id != null && id.isNotEmpty) {
      videoThumbnail = 'https://img.youtube.com/vi/$id/hqdefault.jpg';
      videoLabel = 'YouTube';
    }
  } else if (host.endsWith('vimeo.com')) {
    videoLabel = 'Vimeo';
  } else if (host.endsWith('tiktok.com')) {
    videoLabel = 'TikTok';
  } else if (RegExp(
    r'\.(mp4|webm|ogg|mov|m4v)($|\?|#)',
    caseSensitive: false,
  ).hasMatch(uri.path)) {
    videoLabel = 'Video';
  }

  return GoogLinkPreviewData(
    href: normalized,
    host: host,
    pathLabel: uri.path.isEmpty || uri.path == '/' ? '' : uri.path,
    favicon:
        'https://www.google.com/s2/favicons?domain=${Uri.encodeComponent(host)}&sz=64',
    videoThumbnail: videoThumbnail,
    videoLabel: videoLabel,
  );
}
