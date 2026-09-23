import 'package:flutter/material.dart';
import 'upload_content_studio.dart';

/// dashboard/ad-campaign/upload-content -> the Vault Content Studio in Vault
/// mode. The Flash ⇄ Vault swap in the header moves between the two.
class UploadContentScreen extends StatelessWidget {
  const UploadContentScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const UploadContentStudio(initialMode: 'vault');
}
