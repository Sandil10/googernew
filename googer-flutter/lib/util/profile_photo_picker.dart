import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:ionicons/ionicons.dart';

import '../api/api.dart';
import '../theme/colors.dart';
import 'profile_photo_picker_platform.dart';
import 'upload_picker.dart';

String? _mimeForName(String name) {
  final ext = name.split('.').last.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return null;
  }
}

Future<ApiUploadFile?> showProfilePhotoPickerSheet(BuildContext context) async {
  var picking = false;
  final result = await showModalBottomSheet<_PhotoPickResult>(
    context: context,
    backgroundColor: const Color(0xFF121216),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (sheetContext) => StatefulBuilder(
      builder: (sheetContext, setSheetState) {
        Future<void> pick(Future<ApiUploadFile?> Function() openPicker) async {
          if (picking) return;
          setSheetState(() => picking = true);
          try {
            // Start the platform picker inside the original tap callback.
            // Mobile Safari blocks dialogs started after the sheet closes.
            final file = await openPicker();
            if (sheetContext.mounted) {
              Navigator.pop(sheetContext, _PhotoPickResult(file: file));
            }
          } catch (error) {
            if (sheetContext.mounted) {
              Navigator.pop(
                sheetContext,
                _PhotoPickResult(error: error.toString()),
              );
            }
          }
        }

        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 14),
              const Text(
                'Profile picture',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 6),
              _sourceRow(
                Ionicons.images_outline,
                'Photo library',
                picking,
                () => pick(() => _pickImage(ImageSource.gallery)),
              ),
              _sourceRow(
                Ionicons.camera_outline,
                'Take photo',
                picking,
                () => pick(() => _pickImage(ImageSource.camera)),
              ),
              _sourceRow(
                Ionicons.folder_open_outline,
                'Choose file',
                picking,
                () => pick(_pickFile),
              ),
              const SizedBox(height: 10),
            ],
          ),
        );
      },
    ),
  );
  if (result?.error != null) throw Exception(result!.error);
  return result?.file;
}

Widget _sourceRow(
  IconData icon,
  String label,
  bool disabled,
  VoidCallback onTap,
) {
  return ListTile(
    dense: true,
    enabled: !disabled,
    leading: Icon(
      icon,
      size: 18,
      color: disabled ? AppColors.textGray600 : AppColors.textGray300,
    ),
    title: Text(
      label,
      style: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w600,
        color: disabled ? AppColors.textGray600 : Colors.white,
      ),
    ),
    trailing: disabled
        ? const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 1.5),
          )
        : null,
    onTap: disabled ? null : onTap,
  );
}

Future<ApiUploadFile?> _pickImage(ImageSource source) async {
  if (kIsWeb) {
    final file = await pickWebProfilePhoto(
      camera: source == ImageSource.camera,
      filesOnly: false,
    );
    if (file == null || file.bytes.isEmpty) return null;
    return ApiUploadFile(
      field: 'profile_picture_file',
      filename: file.name,
      bytes: file.bytes,
      contentType: file.mimeType ?? _mimeForName(file.name),
    );
  }
  final file = await ImagePicker().pickImage(
    source: source,
    imageQuality: 92,
    maxWidth: 1600,
  );
  if (file == null) return null;
  final bytes = await file.readAsBytes();
  if (bytes.isEmpty) return null;
  return ApiUploadFile(
    field: 'profile_picture_file',
    filename: file.name.isEmpty
        ? 'profile-${DateTime.now().millisecondsSinceEpoch}.jpg'
        : file.name,
    bytes: Uint8List.fromList(bytes),
    contentType: file.mimeType ?? _mimeForName(file.name),
  );
}

Future<ApiUploadFile?> _pickFile() async {
  if (kIsWeb) {
    final file = await pickWebProfilePhoto(camera: false, filesOnly: true);
    if (file == null || file.bytes.isEmpty) return null;
    return ApiUploadFile(
      field: 'profile_picture_file',
      filename: file.name,
      bytes: file.bytes,
      contentType: file.mimeType ?? _mimeForName(file.name),
    );
  }
  final files = await pickUploadFiles(
    field: 'profile_picture_file',
    type: FileType.custom,
    allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  );
  return files.isEmpty ? null : files.first;
}

class _PhotoPickResult {
  final ApiUploadFile? file;
  final String? error;

  const _PhotoPickResult({this.file, this.error});
}
