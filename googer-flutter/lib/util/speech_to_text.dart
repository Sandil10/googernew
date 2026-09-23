import 'speech_to_text_stub.dart'
    if (dart.library.html) 'speech_to_text_web.dart'
    as impl;

class SpeechToTextUnsupported implements Exception {
  final String message;
  const SpeechToTextUnsupported(this.message);
  @override
  String toString() => message;
}

class BrowserSpeechToText {
  BrowserSpeechToText._();

  static bool get isSupported => impl.isSupported;

  static Future<void> start({
    required String initialText,
    required void Function(String text) onText,
    required void Function(String message) onError,
  }) => impl.start(initialText: initialText, onText: onText, onError: onError);

  static Future<void> stop() => impl.stop();
}
