import 'package:flutter/material.dart';
import 'widgets/campaign_editor.dart';

/// dashboard/ad-campaign/photo-video -> CampaignEditor(campaignType: "Photo and Video")
class PhotoVideoAdScreen extends StatelessWidget {
  const PhotoVideoAdScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      CampaignEditor.forType(CampaignTypeTab.photoVideo);
}
