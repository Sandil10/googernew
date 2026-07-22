// ignore: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:html' as html;

String? readStorage(String key) =>
    html.window.sessionStorage[key] ?? html.window.localStorage[key];

void writeStorage(String key, String? value) {
  if (value == null) {
    html.window.sessionStorage.remove(key);
    html.window.localStorage.remove(key);
  } else {
    html.window.sessionStorage[key] = value;
    html.window.localStorage[key] = value;
  }
}
