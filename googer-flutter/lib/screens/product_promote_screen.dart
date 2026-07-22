import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import 'widgets/campaign_editor.dart';

/// dashboard/ad-campaign/product-promote -> CampaignEditor(campaignType: "Product Promote")
class ProductPromoteScreen extends StatelessWidget {
  const ProductPromoteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const CampaignEditor(
      campaignType: 'Product Promote',
      title: 'Product Promote',
      subtitle: 'Boost a product listing to more buyers',
      accentIcon: Ionicons.pricetags_outline,
      showLink: true,
      linkLabel: 'Product Share Link',
      linkHint: 'https://app.googer.com/product/...',
    );
  }
}
