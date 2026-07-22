import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import 'widgets/campaign_editor.dart';

/// dashboard/ad-campaign/upload-content -> CampaignEditor(campaignType: "Vault Content")
class UploadContentScreen extends StatelessWidget {
  const UploadContentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const CampaignEditor(
      campaignType: 'Vault Content',
      title: 'Upload Content',
      subtitle: 'Sell premium vault content with previews',
      accentIcon: Ionicons.lock_closed_outline,
      showDescription: true,
      showContentAccess: true,
      showSubscription: true,
    );
  }
}
