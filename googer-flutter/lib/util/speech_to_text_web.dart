import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:web/web.dart' as web;

import 'speech_to_text.dart';

JSObject? _recognition;
bool _keepListening = false;
String _baseText = '';
void Function(String text)? _onText;
void Function(String message)? _onError;

JSFunction? _recognitionCtor() {
  final win = web.window;
  if (win.has('SpeechRecognition')) {
    return win.getProperty<JSFunction>('SpeechRecognition'.toJS);
  }
  if (win.has('webkitSpeechRecognition')) {
    return win.getProperty<JSFunction>('webkitSpeechRecognition'.toJS);
  }
  return null;
}

bool get isSupported => _recognitionCtor() != null;

Future<void> start({
  required String initialText,
  required void Function(String text) onText,
  required void Function(String message) onError,
}) async {
  final ctor = _recognitionCtor();
  if (ctor == null) {
    throw const SpeechToTextUnsupported(
      'Voice input is not supported in this browser. Please use Chrome or Safari.',
    );
  }

  await stop();
  _baseText = initialText.trim();
  _onText = onText;
  _onError = onError;

  if (web.window.navigator.has('mediaDevices')) {
    try {
      final stream = await web.window.navigator.mediaDevices
          .getUserMedia(web.MediaStreamConstraints(audio: true.toJS))
          .toDart;
      for (final track in stream.getTracks().toDart) {
        track.stop();
      }
    } catch (_) {
      throw const SpeechToTextUnsupported(
        'Microphone access denied. Please allow mic permission in your browser settings.',
      );
    }
  }

  final recognition = ctor.callAsConstructor<JSObject>();
  recognition.setProperty(
    'lang'.toJS,
    (web.window.navigator.language.isEmpty
            ? 'en-US'
            : web.window.navigator.language)
        .toJS,
  );
  recognition.setProperty('continuous'.toJS, true.toJS);
  recognition.setProperty('interimResults'.toJS, true.toJS);
  recognition.setProperty('maxAlternatives'.toJS, 1.toJS);

  recognition.setProperty(
    'onresult'.toJS,
    (JSObject event) {
      _handleResult(event);
    }.toJS,
  );
  recognition.setProperty(
    'onerror'.toJS,
    (JSObject event) {
      final error = event.getProperty<JSString?>('error'.toJS)?.toDart ?? '';
      final fatal =
          error == 'not-allowed' ||
          error == 'permission-denied' ||
          error == 'service-not-allowed';
      if (fatal) {
        _keepListening = false;
        _onError?.call(
          'Microphone access denied. Please allow mic permission.',
        );
      }
    }.toJS,
  );
  recognition.setProperty(
    'onend'.toJS,
    (JSObject _) {
      _recognition = null;
      if (!_keepListening) return;
      Timer(const Duration(milliseconds: 80), () {
        if (!_keepListening) return;
        try {
          recognition.callMethod<JSAny?>('start'.toJS);
          _recognition = recognition;
        } catch (_) {}
      });
    }.toJS,
  );

  _keepListening = true;
  _recognition = recognition;
  try {
    recognition.callMethod<JSAny?>('start'.toJS);
  } catch (_) {
    _keepListening = false;
    _recognition = null;
    throw const SpeechToTextUnsupported('Could not start voice input.');
  }
}

Future<void> stop() async {
  _keepListening = false;
  final recognition = _recognition;
  _recognition = null;
  if (recognition == null) return;
  try {
    recognition.callMethod<JSAny?>('stop'.toJS);
  } catch (_) {}
}

void _handleResult(JSObject event) {
  final resultIndex =
      event.getProperty<JSNumber?>('resultIndex'.toJS)?.toDartInt ?? 0;
  final results = event.getProperty<JSObject?>('results'.toJS);
  if (results == null) return;
  final length = results.getProperty<JSNumber?>('length'.toJS)?.toDartInt ?? 0;

  final finals = <String>[];
  final interims = <String>[];
  for (var i = resultIndex; i < length; i += 1) {
    final result = results.getProperty<JSObject?>(i.toString().toJS);
    if (result == null) continue;
    final alt = result.getProperty<JSObject?>('0'.toJS);
    final transcript =
        alt?.getProperty<JSString?>('transcript'.toJS)?.toDart.trim() ?? '';
    if (transcript.isEmpty) continue;
    final isFinal =
        result.getProperty<JSBoolean?>('isFinal'.toJS)?.toDart ?? false;
    (isFinal ? finals : interims).add(transcript);
  }

  if (finals.isNotEmpty) {
    _baseText = [
      _baseText,
      finals.join(' ').trim(),
    ].where((part) => part.trim().isNotEmpty).join(' ');
    _onText?.call(_baseText);
    return;
  }
  if (interims.isNotEmpty) {
    final preview = [
      _baseText,
      interims.join(' ').trim(),
    ].where((part) => part.trim().isNotEmpty).join(' ');
    _onText?.call(preview);
  }
}
