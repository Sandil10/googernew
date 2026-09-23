// ignore_for_file: deprecated_member_use

import 'dart:async';
import 'dart:html' as html;
import 'dart:typed_data';

import 'profile_photo_picker_data.dart';

Future<PickedProfilePhoto?> pickWebProfilePhoto({
  required bool camera,
  required bool filesOnly,
}) {
  final result = Completer<PickedProfilePhoto?>();
  final input = html.FileUploadInputElement()
    ..multiple = false
    ..accept = filesOnly
        ? '.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif'
        : 'image/*';
  if (camera) input.setAttribute('capture', 'environment');

  input.style
    ..position = 'fixed'
    ..left = '-10000px'
    ..top = '0'
    ..width = '1px'
    ..height = '1px'
    ..opacity = '0';
  html.document.body?.append(input);

  StreamSubscription<html.Event>? changeSubscription;
  StreamSubscription<html.Event>? cancelSubscription;
  StreamSubscription<html.Event>? focusSubscription;
  Timer? cancelTimer;

  void dispose() {
    cancelTimer?.cancel();
    changeSubscription?.cancel();
    cancelSubscription?.cancel();
    focusSubscription?.cancel();
    input.remove();
  }

  void complete(PickedProfilePhoto? photo) {
    if (result.isCompleted) return;
    result.complete(photo);
    dispose();
  }

  changeSubscription = input.onChange.listen((_) async {
    final selected = input.files;
    if (selected == null || selected.isEmpty) {
      complete(null);
      return;
    }
    final file = selected.first;
    try {
      final reader = html.FileReader();
      reader.readAsArrayBuffer(file);
      await reader.onLoad.first;
      final raw = reader.result;
      final bytes = raw is ByteBuffer
          ? raw.asUint8List()
          : raw is Uint8List
          ? raw
          : Uint8List(0);
      complete(
        bytes.isEmpty
            ? null
            : PickedProfilePhoto(
                name: file.name,
                mimeType: file.type.isEmpty ? null : file.type,
                bytes: bytes,
              ),
      );
    } catch (error, stackTrace) {
      if (!result.isCompleted) result.completeError(error, stackTrace);
      dispose();
    }
  });

  // Safari supports the input cancel event on current versions. The focus
  // fallback also covers older iPhones without leaving this picker stuck.
  cancelSubscription = input.onAbort.listen((_) => complete(null));
  focusSubscription = html.window.onFocus.listen((_) {
    cancelTimer?.cancel();
    cancelTimer = Timer(const Duration(milliseconds: 900), () {
      if ((input.files?.isEmpty ?? true) && !result.isCompleted) complete(null);
    });
  });

  // This remains in the same synchronous call stack as the Flutter tap, which
  // is required for Safari to allow Photos, Camera, or Files to open.
  input.click();
  return result.future;
}
