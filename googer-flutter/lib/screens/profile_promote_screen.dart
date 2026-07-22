import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import 'widgets/campaign_editor.dart';

/// dashboard/ad-campaign/profile-promote -> CampaignEditor(campaignType: "Profile Promote")
class ProfilePromoteScreen extends StatelessWidget {
  const ProfilePromoteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const CampaignEditor(
      campaignType: 'Profile Promote',
      title: 'Profile Promote',
      subtitle: 'Grow your reach and gain new followers',
      accentIcon: Ionicons.person_circle_outline,
      showLink: true,
      linkLabel: 'Share Profile Link',
      linkHint: 'https://app.googer.com/username',
      alwaysFree: true,
    );
  }
}
