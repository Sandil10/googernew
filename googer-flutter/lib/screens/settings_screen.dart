import 'package:flutter/material.dart';
import 'package:ionicons/ionicons.dart';
import '../theme/colors.dart';
import 'profile_screen.dart';
import 'help_support_screen.dart';
import 'terms_policies_screen.dart';
import 'ad_campaign_screen.dart';
import 'subscription_screen.dart';
import 'wallet_verification_screen.dart';

/// 1o · Settings
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool notificationsEnabled = true;
  bool darkModeEnabled = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg0,
      appBar: AppBar(
        backgroundColor: AppColors.bg0,
        elevation: 0,
        title: const Text('Settings', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: Colors.white)),
        bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: AppColors.border1)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _sectionTitle('Account'),
          _settingsTile('Profile', 'Edit your profile information', Ionicons.person_circle_outline,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()))),
          _settingsTile('Privacy', 'Control who sees your content', Ionicons.lock_closed_outline, onTap: () {}),
          _settingsTile('Blocked Users', 'Manage blocked accounts', Ionicons.ban_outline, onTap: () {}),
          const SizedBox(height: 16),
          _sectionTitle('Preferences'),
          _switchTile('Notifications', 'Receive notifications', notificationsEnabled, (value) {
            setState(() => notificationsEnabled = value);
          }),
          _switchTile('Dark Mode', 'Always enabled', darkModeEnabled, (value) {
            setState(() => darkModeEnabled = value);
          }),
          const SizedBox(height: 16),
          _sectionTitle('Creator'),
          _settingsTile('Ad Campaigns', 'Create and manage your ads', Ionicons.megaphone_outline,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdCampaignScreen()))),
          _settingsTile('Subscription', 'Manage your subscription plan', Ionicons.star_outline,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SubscriptionScreen()))),
          _settingsTile('Verification', 'Verify your account', Ionicons.shield_checkmark_outline,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const WalletVerificationScreen()))),
          const SizedBox(height: 16),
          _sectionTitle('Support'),
          _settingsTile('Help Center', 'Browse help articles', Ionicons.help_circle_outline,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HelpSupportScreen()))),
          _settingsTile('Report Bug', 'Help us improve the app', Ionicons.bug_outline,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HelpSupportScreen()))),
          _settingsTile('Terms & Policies', 'Read our terms and privacy policy', Ionicons.document_text_outline,
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TermsPoliciesScreen()))),
          const SizedBox(height: 16),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 4),
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {},
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.likeRed,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9999)),
              ),
              child: const Text('Logout', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textGray500, letterSpacing: 0.5)),
    );
  }

  Widget _settingsTile(String title, String subtitle, IconData icon, {required VoidCallback onTap}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: Icon(icon, size: 20, color: AppColors.accentPurple),
        title: Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 11, color: AppColors.textGray500)),
        trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.textGray600),
        onTap: onTap,
      ),
    );
  }

  Widget _switchTile(String title, String subtitle, bool value, ValueChanged<bool> onChanged) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.bg2,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.inputBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
              Text(subtitle, style: const TextStyle(fontSize: 11, color: AppColors.textGray500)),
            ],
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.accentPurple,
          ),
        ],
      ),
    );
  }
}
