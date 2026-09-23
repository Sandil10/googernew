import 'package:flutter/material.dart';
import 'widgets/campaign_editor.dart';

/// dashboard/ad-campaign/product-promote -> CampaignEditor(campaignType: "Product Promote")
class ProductPromoteScreen extends StatelessWidget {
  const ProductPromoteScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      CampaignEditor.forType(CampaignTypeTab.productPromote);
}
