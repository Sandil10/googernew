import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

import '../api/api.dart';

String? _mimeForName(String name) {
  final ext = name.split('.').last.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'jfif':
    case 'jpe':
    case 'pjpeg':
    case 'pjp':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'm4v':
      return 'video/x-m4v';
    case 'avi':
      return 'video/x-msvideo';
    case 'mkv':
      return 'video/x-matroska';
    default:
      return null;
  }
}

Future<List<ApiUploadFile>> pickUploadFiles({
  required String field,
  bool allowMultiple = false,
  FileType type = FileType.media,
  List<String>? allowedExtensions,
}) async {
  final result = await FilePicker.platform.pickFiles(
    allowMultiple: allowMultiple,
    type: type,
    allowedExtensions: allowedExtensions,
    withData: true,
    withReadStream: true,
  );
  if (result == null) return const [];
  final files = <ApiUploadFile>[];
  for (final file in result.files) {
    Uint8List? bytes = file.bytes;
    final stream = file.readStream;
    if ((bytes == null || bytes.isEmpty) && stream != null) {
      final builder = BytesBuilder(copy: false);
      await for (final chunk in stream) {
        builder.add(chunk);
      }
      bytes = builder.takeBytes();
    }
    if (bytes == null || bytes.isEmpty) continue;
    files.add(
      ApiUploadFile(
        field: field,
        filename: file.name,
        bytes: bytes,
        contentType: _mimeForName(file.name),
      ),
    );
  }
  return files;
}
