import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import 'widgets/campaign_editor.dart';

/// dashboard/ad-campaign/photo-video -> CampaignEditor(campaignType: "Photo and Video")
class PhotoVideoAdScreen extends StatelessWidget {
  const PhotoVideoAdScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const CampaignEditor(
      campaignType: 'Photo and Video',
      title: 'Photo & Video Ad',
      subtitle: 'Promote a photo or video across the feed',
      accentIcon: Ionicons.images_outline,
      showDescription: true,
      showCta: true,
    );
  }
}
