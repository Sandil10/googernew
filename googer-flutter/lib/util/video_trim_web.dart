import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:web/web.dart' as web;

import 'video_trim.dart';

/// Web trimming, ported from the web builder's `trimVideoClip`.
///
/// There is no frame-accurate cutter in the browser, so this uses the same
/// trick the web app does: seek to the start, play the window, and re-record it
/// through `MediaRecorder`. Trimming therefore takes about as long as the clip.
///
/// Built on `dart:js_interop` rather than `dart:js_util` — the latter no longer
/// resolves when the analyzer targets the VM, which breaks `flutter analyze`
/// for the whole project.
bool get canTrimVideo => web.window.has('MediaRecorder');

String _mimeForName(String name) {
  switch (name.split('.').last.toLowerCase()) {
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    default:
      return 'video/mp4';
  }
}

String _objectUrl(JSAny blob) {
  final url = web.window.getProperty<JSObject>('URL'.toJS);
  return url.callMethod<JSString>('createObjectURL'.toJS, blob).toDart;
}

Future<PendingVideoTrim?> inspectVideo(Uint8List bytes, String fileName) async {
  final blob = web.Blob(
    <JSUint8Array>[bytes.toJS].toJS,
    web.BlobPropertyBag(type: _mimeForName(fileName)),
  );
  final url = _objectUrl(blob);

  final video = web.HTMLVideoElement()
    ..src = url
    ..muted = true
    ..preload = 'metadata';
  video.setAttribute('playsinline', 'true');

  final completer = Completer<PendingVideoTrim?>();
  void fail() {
    if (completer.isCompleted) return;
    releaseVideoUrl(url);
    completer.complete(null);
  }

  video.onloadedmetadata = (web.Event _) {
    if (completer.isCompleted) return;
    final duration = video.duration;
    completer.complete(
      PendingVideoTrim(
        sourceUrl: url,
        fileName: fileName,
        // A stream with no known length reports Infinity — report 0 so the
        // caller rejects it rather than showing a broken range.
        duration: duration.isFinite ? duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      ),
    );
  }.toJS;
  // `onerror` takes an OnErrorEventHandler, not a plain listener — go through
  // addEventListener so the signature matches.
  video.addEventListener(
    'error',
    (web.Event _) {
      fail();
    }.toJS,
  );

  return completer.future.timeout(
    const Duration(seconds: 20),
    onTimeout: () {
      releaseVideoUrl(url);
      return null;
    },
  );
}

Future<Uint8List?> captureVideoThumbnail(String sourceUrl) async {
  if (sourceUrl.isEmpty) return null;
  final video = web.HTMLVideoElement()
    ..src = sourceUrl
    ..muted = true
    ..preload = 'auto';
  video.setAttribute('playsinline', 'true');

  final completer = Completer<Uint8List?>();
  void complete(Uint8List? bytes) {
    if (!completer.isCompleted) completer.complete(bytes);
  }

  void drawFrame() {
    try {
      final width = video.videoWidth;
      final height = video.videoHeight;
      if (width <= 0 || height <= 0) {
        complete(null);
        return;
      }
      final canvas = web.HTMLCanvasElement()
        ..width = width
        ..height = height;
      final context = canvas.getContext('2d') as web.CanvasRenderingContext2D?;
      if (context == null) {
        complete(null);
        return;
      }
      context.drawImage(video, 0, 0, width.toDouble(), height.toDouble());
      final dataUrl = (canvas as JSObject)
          .callMethod<JSString>('toDataURL'.toJS, 'image/jpeg'.toJS, 0.82.toJS)
          .toDart;
      final comma = dataUrl.indexOf(',');
      complete(comma < 0 ? null : base64Decode(dataUrl.substring(comma + 1)));
    } catch (_) {
      complete(null);
    }
  }

  video.onloadeddata = (web.Event _) {
    final seekTo = video.duration.isFinite && video.duration > 0.1 ? 0.1 : 0.0;
    if (seekTo == 0) {
      drawFrame();
      return;
    }
    video.onseeked = (web.Event _) {
      drawFrame();
    }.toJS;
    video.currentTime = seekTo;
  }.toJS;
  video.addEventListener(
    'error',
    (web.Event _) {
      complete(null);
    }.toJS,
  );

  return completer.future.timeout(
    const Duration(seconds: 10),
    onTimeout: () => null,
  );
}

/// `captureStream` is not on every element in every engine, and Firefox still
/// uses the `moz` prefix — probe rather than assume.
JSObject? _captureStream(JSObject element, [int? frameRate]) {
  for (final name in const ['captureStream', 'mozCaptureStream']) {
    if (!element.has(name)) continue;
    try {
      final stream = frameRate == null
          ? element.callMethod<JSObject?>(name.toJS)
          : element.callMethod<JSObject?>(name.toJS, frameRate.toJS);
      if (stream != null) return stream;
    } catch (_) {
      // Try the next candidate.
    }
  }
  return null;
}

Future<Uint8List> trimVideoClip(
  String sourceUrl, {
  required double startSeconds,
  required double endSeconds,
}) async {
  if (!canTrimVideo) {
    throw const VideoTrimUnsupported(
      'Video trimming is unavailable in this browser. Please try Chrome or Edge.',
    );
  }

  final video = web.HTMLVideoElement()
    ..src = sourceUrl
    ..muted = true
    ..preload = 'auto';
  video.setAttribute('playsinline', 'true');

  final metadata = Completer<void>();
  video.onloadedmetadata = (web.Event _) {
    if (!metadata.isCompleted) metadata.complete();
  }.toJS;
  await metadata.future.timeout(
    const Duration(seconds: 20),
    onTimeout: () => throw const VideoTrimUnsupported(
      'This video cannot be read for trimming.',
    ),
  );

  final recorderCtor = web.window.getProperty<JSFunction>('MediaRecorder'.toJS);
  final recorderObj = recorderCtor as JSObject;
  final mimeType =
      <String>[
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ].firstWhere((candidate) {
        try {
          return recorderObj
                  .callMethod<JSBoolean>('isTypeSupported'.toJS, candidate.toJS)
                  .toDart ==
              true;
        } catch (_) {
          return false;
        }
      }, orElse: () => '');

  // Prefer the element's own stream: it carries audio. The canvas fallback is
  // video-only, which is why it is second choice rather than the default.
  var stream = _captureStream(video as JSObject);
  Timer? renderTimer;

  if (stream == null) {
    final width = video.videoWidth == 0 ? 1280 : video.videoWidth;
    final height = video.videoHeight == 0 ? 720 : video.videoHeight;
    final canvas = web.HTMLCanvasElement()
      ..width = width
      ..height = height;
    final context = canvas.getContext('2d') as web.CanvasRenderingContext2D?;
    stream = _captureStream(canvas as JSObject, 30);
    if (stream == null || context == null) {
      throw const VideoTrimUnsupported(
        'Video trimming is unavailable in this browser. Please try Chrome or Edge.',
      );
    }
    renderTimer = Timer.periodic(const Duration(milliseconds: 33), (_) {
      context.drawImage(video, 0, 0, width.toDouble(), height.toDouble());
    });
  }

  final recorder = mimeType.isEmpty
      ? recorderCtor.callAsConstructor<JSObject>(stream)
      : recorderCtor.callAsConstructor<JSObject>(
          stream,
          {'mimeType': mimeType}.jsify(),
        );

  final chunks = <JSAny>[];
  recorder.setProperty(
    'ondataavailable'.toJS,
    (JSObject event) {
      final data = event.getProperty<JSAny?>('data'.toJS);
      if (data == null) return;
      final size = (data as JSObject).getProperty<JSNumber?>('size'.toJS);
      if (size != null && size.toDartDouble > 0) chunks.add(data);
    }.toJS,
  );

  final stopped = Completer<void>();
  recorder.setProperty(
    'onstop'.toJS,
    (JSObject _) {
      if (!stopped.isCompleted) stopped.complete();
    }.toJS,
  );

  Timer? watchdog;
  void stopRecorder() {
    try {
      recorder.callMethod<JSAny?>('stop'.toJS);
    } catch (_) {}
  }

  try {
    final seeked = Completer<void>();
    video.onseeked = (web.Event _) {
      if (!seeked.isCompleted) seeked.complete();
    }.toJS;
    video.currentTime = startSeconds;
    await seeked.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () => throw const VideoTrimUnsupported(
        'This video could not be seeked for trimming.',
      ),
    );

    recorder.callMethod<JSAny?>('start'.toJS);
    await video.play().toDart;

    // Recording is real time, so poll for the end of the window rather than
    // scheduling one timer a stalled video would outlive.
    watchdog = Timer.periodic(const Duration(milliseconds: 100), (timer) {
      if (video.currentTime >= endSeconds || video.ended) {
        timer.cancel();
        video.pause();
        stopRecorder();
      }
    });

    await stopped.future.timeout(
      Duration(seconds: (endSeconds - startSeconds).ceil() + 30),
      onTimeout: () {
        stopRecorder();
        throw const VideoTrimUnsupported(
          'Trimming timed out. Try a shorter clip.',
        );
      },
    );
  } finally {
    renderTimer?.cancel();
    watchdog?.cancel();
    video.pause();
  }

  if (chunks.isEmpty) {
    throw const VideoTrimUnsupported('Trimming produced an empty clip.');
  }

  final blob = web.Blob(
    chunks.toJS,
    web.BlobPropertyBag(type: mimeType.isEmpty ? 'video/webm' : mimeType),
  );
  final buffer = await blob.arrayBuffer().toDart;
  return buffer.toDart.asUint8List();
}

void releaseVideoUrl(String url) {
  try {
    web.window
        .getProperty<JSObject>('URL'.toJS)
        .callMethod<JSAny?>('revokeObjectURL'.toJS, url.toJS);
  } catch (_) {}
}
