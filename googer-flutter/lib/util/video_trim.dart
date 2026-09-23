import 'dart:typed_data';

import 'video_trim_stub.dart'
    if (dart.library.html) 'video_trim_web.dart'
    as impl;

/// Longest video the product form accepts before a trim is required, matching
/// the web's `VIDEO_MAX_DURATION_SECONDS`.
const int videoMaxDurationSeconds = 60;

/// A video the user picked that is too long to upload as-is.
class PendingVideoTrim {
  /// Object URL for the source file — feeds both the preview and the trimmer.
  final String sourceUrl;
  final String fileName;
  final double duration;
  final int width;
  final int height;

  const PendingVideoTrim({
    required this.sourceUrl,
    required this.fileName,
    required this.duration,
    required this.width,
    required this.height,
  });
}

class VideoTrimUnsupported implements Exception {
  final String message;
  const VideoTrimUnsupported(this.message);
  @override
  String toString() => message;
}

/// True when the current platform can trim in-process. Only Flutter web can —
/// the implementation re-records the selected window with `MediaRecorder`,
/// which has no native equivalent here.
bool get canTrimVideo => impl.canTrimVideo;

/// Reads a picked video's metadata so the caller can decide whether a trim is
/// needed. Returns null when the file cannot be read as video.
Future<PendingVideoTrim?> inspectVideo(Uint8List bytes, String fileName) =>
    impl.inspectVideo(bytes, fileName);

/// Captures one still frame for selected-media rows. The returned bytes are an
/// image only; rendering them cannot start or continue video playback.
Future<Uint8List?> captureVideoThumbnail(String sourceUrl) =>
    impl.captureVideoThumbnail(sourceUrl);

/// Re-encodes `[startSeconds, endSeconds)` of the source into a new clip.
///
/// This plays the window in real time while recording it, so it takes about as
/// long as the segment itself — callers must show progress.
Future<Uint8List> trimVideoClip(
  String sourceUrl, {
  required double startSeconds,
  required double endSeconds,
}) => impl.trimVideoClip(
  sourceUrl,
  startSeconds: startSeconds,
  endSeconds: endSeconds,
);

/// Frees an object URL created by [inspectVideo].
void releaseVideoUrl(String url) => impl.releaseVideoUrl(url);
