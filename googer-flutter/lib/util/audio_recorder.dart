import 'audio_recorder_stub.dart'
    if (dart.library.html) 'audio_recorder_web.dart' as impl;

/// Longest voice note the chat accepts, matching the web's
/// `CHAT_VOICE_MAX_SECS`.
const int chatVoiceMaxSeconds = 120;

class AudioRecorderUnsupported implements Exception {
  final String message;
  const AudioRecorderUnsupported(this.message);
  @override
  String toString() => message;
}

/// Microphone capture for chat voice notes.
///
/// The web app records with `MediaRecorder` and posts the clip as a **data
/// URL** in `image_url` with `type: "voice"` (chats/page.tsx:2984), so [stop]
/// returns a ready-to-send data URL rather than raw bytes.
class AudioRecorder {
  AudioRecorder._();

  static bool get isSupported => impl.isSupported;

  /// Requests mic permission and begins capture. Throws
  /// [AudioRecorderUnsupported] if permission is refused or the platform has no
  /// recorder.
  static Future<void> start() => impl.start();

  /// Stops capture and returns the clip as a `data:audio/...;base64,...` URL,
  /// or null when nothing was captured.
  static Future<String?> stop() => impl.stop();

  /// Aborts capture and releases the microphone without producing a clip.
  static Future<void> cancel() => impl.cancel();
}
