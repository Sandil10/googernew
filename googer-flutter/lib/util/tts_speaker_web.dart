// ignore_for_file: deprecated_member_use

import 'dart:html' as html;

Future<void> speak(String text, {required String gender}) async {
  final speech = html.window.speechSynthesis;
  speech?.cancel();
  final clean = text
      .replaceAll(RegExp(r'\[c=[^\]]+\]', caseSensitive: false), '')
      .replaceAll(RegExp(r'\[/c\]', caseSensitive: false), '');
  if (clean.trim().isEmpty) return;

  final utterance = html.SpeechSynthesisUtterance(clean)
    ..lang = 'en-US'
    ..rate = 1
    ..pitch = gender == 'male' ? 0.85 : 1.12;

  final voices = speech?.getVoices() ?? const <html.SpeechSynthesisVoice>[];
  final pattern = gender == 'male'
      ? RegExp(r'male|david|mark|george|daniel|alex|fred|tom|aaron')
      : RegExp(r'female|zira|samantha|victoria|susan|karen|moira|tessa|sara');
  html.SpeechSynthesisVoice? preferred;
  for (final voice in voices) {
    final name = '${voice.name} ${voice.voiceUri}'.toLowerCase();
    if (pattern.hasMatch(name)) {
      preferred = voice;
      break;
    }
  }
  if (preferred == null) {
    for (final voice in voices) {
      if (RegExp(r'en[-_]', caseSensitive: false).hasMatch(voice.lang ?? '')) {
        preferred = voice;
        break;
      }
    }
  }
  if (preferred != null) utterance.voice = preferred;
  speech?.speak(utterance);
}

void stop() => html.window.speechSynthesis?.cancel();
