import 'package:flutter/material.dart';
import 'terms_policies_screen.dart';

/// terms · alias that redirects to the Terms and Policies screen.
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Web `/terms` simply redirects to `/terms-and-policies`.
    return const TermsPoliciesScreen();
  }
}
