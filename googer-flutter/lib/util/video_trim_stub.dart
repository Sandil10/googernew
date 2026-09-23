import 'dart:typed_data';

import 'video_trim.dart';

/// Native builds have no `MediaRecorder`, so trimming is unavailable and the
/// form falls back to rejecting over-length videos.
bool get canTrimVideo => false;

Future<PendingVideoTrim?> inspectVideo(
  Uint8List bytes,
  String fileName,
) async => null;

Future<Uint8List?> captureVideoThumbnail(String sourceUrl) async => null;

Future<Uint8List> trimVideoClip(
  String sourceUrl, {
  required double startSeconds,
  required double endSeconds,
}) async => throw const VideoTrimUnsupported(
  'Video trimming is only available in the browser.',
);

void releaseVideoUrl(String url) {}
