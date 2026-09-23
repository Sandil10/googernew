import 'package:flutter/material.dart';

import 'coins_management_screen.dart';

/// Compatibility route for older wallet entry points. The canonical Request
/// implementation is [CoinsManagementScreen], so every entry point now uses
/// the same backend-connected Pending/Verified/Rejected flow.
class RequestScreen extends StatelessWidget {
  const RequestScreen({super.key});

  @override
  Widget build(BuildContext context) => const CoinsManagementScreen();
}
