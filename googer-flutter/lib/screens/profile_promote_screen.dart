import 'package:flutter/material.dart';
import 'widgets/campaign_editor.dart';

/// dashboard/ad-campaign/profile-promote -> CampaignEditor(campaignType: "Profile Promote")
class ProfilePromoteScreen extends StatelessWidget {
  const ProfilePromoteScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      CampaignEditor.forType(CampaignTypeTab.profilePromote);
}
