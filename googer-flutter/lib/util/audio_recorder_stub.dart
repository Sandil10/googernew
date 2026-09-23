import 'audio_recorder.dart';

/// Native builds have no MediaRecorder; the chat falls back to telling the user
/// rather than pretending to record.
bool get isSupported => false;

Future<void> start() async => throw const AudioRecorderUnsupported(
  'Voice notes need a browser microphone.',
);

Future<String?> stop() async => null;

Future<void> cancel() async {}
