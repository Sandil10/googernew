import 'tts_speaker_stub.dart'
    if (dart.library.html) 'tts_speaker_web.dart'
    as impl;

class TtsSpeaker {
  TtsSpeaker._();

  static Future<void> speak(String text, {required String gender}) =>
      impl.speak(text, gender: gender);

  static void stop() => impl.stop();
}
