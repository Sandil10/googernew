import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import 'widgets/campaign_editor.dart';

/// dashboard/ad-campaign/flash-content -> CampaignEditor(campaignType: "Flash Content")
class FlashContentScreen extends StatelessWidget {
  const FlashContentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const CampaignEditor(
      campaignType: 'Flash Content',
      title: 'Flash Content',
      subtitle: 'Publish a short flash video promo',
      accentIcon: Ionicons.flash_outline,
      videoOnly: true,
      showContentAccess: true,
    );
  }
}
