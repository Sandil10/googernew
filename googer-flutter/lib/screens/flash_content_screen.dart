import 'package:flutter/material.dart';
import 'upload_content_studio.dart';

/// dashboard/ad-campaign/flash-content -> the Vault Content Studio in Flash
/// mode. This used to route through `CampaignEditor`, which put budget,
/// targeting and ad-preview sections on a content upload — none of which the
/// web flow has.
class FlashContentScreen extends StatelessWidget {
  const FlashContentScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const UploadContentStudio(initialMode: 'flash');
}
