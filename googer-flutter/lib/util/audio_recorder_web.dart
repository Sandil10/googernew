import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

import 'audio_recorder.dart';

/// Web microphone capture, mirroring the web chat's recorder: getUserMedia →
/// MediaRecorder → Blob → data URL.
///
/// Built on `dart:js_interop` (not `dart:js_util`, which no longer resolves
/// under the default analysis target).
JSObject? _recorder;
web.MediaStream? _stream;
final List<JSAny> _chunks = [];
Completer<void>? _stopped;

bool get isSupported =>
    web.window.has('MediaRecorder') &&
    web.window.navigator.has('mediaDevices');

Future<void> start() async {
  if (!isSupported) {
    throw const AudioRecorderUnsupported(
      'Voice notes are unavailable in this browser.',
    );
  }
  await cancel();

  final web.MediaStream stream;
  try {
    stream = await web.window.navigator.mediaDevices
        .getUserMedia(web.MediaStreamConstraints(audio: true.toJS))
        .toDart;
  } catch (_) {
    throw const AudioRecorderUnsupported(
      'Microphone permission is needed to record a voice note.',
    );
  }
  _stream = stream;

  final ctor = web.window.getProperty<JSFunction>('MediaRecorder'.toJS);
  final ctorObj = ctor as JSObject;
  final mimeType = <String>[
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ].firstWhere((candidate) {
    try {
      return ctorObj
              .callMethod<JSBoolean>('isTypeSupported'.toJS, candidate.toJS)
              .toDart ==
          true;
    } catch (_) {
      return false;
    }
  }, orElse: () => '');

  final recorder = mimeType.isEmpty
      ? ctor.callAsConstructor<JSObject>(stream)
      : ctor.callAsConstructor<JSObject>(
          stream,
          {'mimeType': mimeType}.jsify(),
        );

  _chunks.clear();
  recorder.setProperty(
    'ondataavailable'.toJS,
    (JSObject event) {
      final data = event.getProperty<JSAny?>('data'.toJS);
      if (data == null) return;
      final size = (data as JSObject).getProperty<JSNumber?>('size'.toJS);
      if (size != null && size.toDartDouble > 0) _chunks.add(data);
    }.toJS,
  );

  final stopped = Completer<void>();
  _stopped = stopped;
  recorder.setProperty(
    'onstop'.toJS,
    (JSObject _) {
      if (!stopped.isCompleted) stopped.complete();
    }.toJS,
  );

  recorder.callMethod<JSAny?>('start'.toJS);
  _recorder = recorder;
}

Future<String?> stop() async {
  final recorder = _recorder;
  final stopped = _stopped;
  if (recorder == null || stopped == null) return null;

  try {
    recorder.callMethod<JSAny?>('stop'.toJS);
    await stopped.future.timeout(const Duration(seconds: 10));
  } catch (_) {
    // Fall through and use whatever chunks arrived.
  }
  _releaseStream();
  _recorder = null;
  _stopped = null;

  if (_chunks.isEmpty) return null;
  final mime =
      recorder.getProperty<JSString?>('mimeType'.toJS)?.toDart ?? 'audio/webm';
  final blob = web.Blob(
    _chunks.toJS,
    web.BlobPropertyBag(type: mime.isEmpty ? 'audio/webm' : mime),
  );
  _chunks.clear();
  return _blobToDataUrl(blob);
}

Future<void> cancel() async {
  final recorder = _recorder;
  if (recorder != null) {
    try {
      recorder.callMethod<JSAny?>('stop'.toJS);
    } catch (_) {}
  }
  _recorder = null;
  _stopped = null;
  _chunks.clear();
  _releaseStream();
}

void _releaseStream() {
  final stream = _stream;
  if (stream == null) return;
  try {
    final tracks = stream.getTracks().toDart;
    for (final track in tracks) {
      track.stop();
    }
  } catch (_) {}
  _stream = null;
}

Future<String?> _blobToDataUrl(web.Blob blob) {
  final reader = web.FileReader();
  final completer = Completer<String?>();
  reader.onloadend = (web.Event _) {
    final result = reader.result;
    completer.complete(result.isA<JSString>() ? (result as JSString).toDart : null);
  }.toJS;
  reader.addEventListener(
    'error',
    (web.Event _) {
      if (!completer.isCompleted) completer.complete(null);
    }.toJS,
  );
  reader.readAsDataURL(blob);
  return completer.future;
}
