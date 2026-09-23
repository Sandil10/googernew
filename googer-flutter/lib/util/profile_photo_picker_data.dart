import 'dart:typed_data';

class PickedProfilePhoto {
  final String name;
  final String? mimeType;
  final Uint8List bytes;

  const PickedProfilePhoto({
    required this.name,
    required this.mimeType,
    required this.bytes,
  });
}
