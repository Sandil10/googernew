import 'speech_to_text.dart';

bool get isSupported => false;

Future<void> start({
  required String initialText,
  required void Function(String text) onText,
  required void Function(String message) onError,
}) async {
  throw const SpeechToTextUnsupported(
    'Voice input is not supported on this platform.',
  );
}

Future<void> stop() async {}
