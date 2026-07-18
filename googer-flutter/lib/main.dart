import 'package:flutter/material.dart';
import 'api/api.dart';
import 'screens/auth_screens.dart';
import 'screens/campaign_screens.dart';
import 'screens/market_screens.dart';
import 'screens/misc_screens.dart';
import 'screens/profile_screens.dart';
import 'screens/settings_screens.dart';
import 'screens/shell.dart';
import 'screens/social_screens.dart';
import 'screens/wallet_screens.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Restore the saved session (token + profile) before the first frame,
  // so a page refresh keeps the user logged in like the web app does.
  await Api.init();
  runApp(const GoogerApp());
}

class GoogerApp extends StatelessWidget {
  const GoogerApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "Googer",
      debugShowCheckedModeBanner: false,
      theme: googerTheme(),
      // straight to the app when a saved session exists
      initialRoute: Api.loggedIn ? "/home" : "/login",
      routes: {
        // auth
        "/login": (_) => const LoginScreen(),
        "/forgot-password": (_) => const ForgotPasswordScreen(),
        "/register": (_) => const RegisterScreen(),
        "/suspended": (_) => const SuspendedScreen(),
        // tab shell (home / shop / wallet / chats)
        "/home": (_) => const ShellScreen(),
        // social
        "/chat": (_) => const ChatConversationScreen(),
        "/reel": (_) => const ReelViewerScreen(),
        "/write-goog": (_) => const WriteGoogScreen(),
        "/search": (_) => const SearchScreen(),
        "/notifications": (_) => const NotificationsScreen(),
        // profile
        "/profile": (_) => const MyProfileScreen(),
        "/profile/user": (_) => const PublicProfileScreen(),
        "/profile/edit": (_) => const EditProfileScreen(),
        // market
        "/product": (_) => const ProductDetailScreen(),
        "/add-product": (_) => const AddProductScreen(),
        "/cart": (_) => const CartScreen(),
        "/categories": (_) => const CategoriesScreen(),
        // wallet
        "/wallet/my-wallet": (_) => const MyWalletScreen(),
        "/wallet/topup": (_) => const TopupScreen(),
        "/wallet/bank-transfer": (_) => const BankTransferScreen(),
        "/wallet/withdrawal": (_) => const WithdrawalScreen(),
        "/wallet/transactions": (_) => const TransactionsScreen(),
        "/wallet/subscription": (_) => const SubscriptionScreen(),
        "/wallet/verification": (_) => const VerificationScreen(),
        "/wallet/pay": (_) => const WalletPayScreen(),
        "/wallet/ad-center": (_) => const AdCenterScreen(),
        "/wallet/coins": (_) => const CoinsManagementScreen(),
        "/wallet/sell": (_) => const SellCoinsScreen(),
        "/wallet/request": (_) => const CoinRequestScreen(),
        // ad campaigns
        "/ads": (_) => const AdCampaignHubScreen(),
        "/ads/photo-video": (_) => const PhotoVideoCampaignScreen(),
        "/ads/product-promote": (_) => const ProductPromoteCampaignScreen(),
        "/ads/profile-promote": (_) => const ProfilePromoteCampaignScreen(),
        "/ads/upload-content": (_) => const UploadContentCampaignScreen(),
        "/ads/flash-content": (_) => const FlashContentCampaignScreen(),
        // settings
        "/settings": (_) => const SettingsScreen(),
        "/settings/reset-password": (_) => const ResetPasswordScreen(),
        "/settings/change-email": (_) => const ChangeLoginEmailScreen(),
        "/settings/two-factor": (_) => const TwoFactorScreen(),
        "/settings/passkeys": (_) => const PasskeysScreen(),
        "/settings/trusted-devices": (_) => const TrustedDevicesScreen(),
        "/settings/security-alerts": (_) => const SecurityAlertsScreen(),
        // support / legal
        "/help-support": (_) => const HelpSupportScreen(),
        "/terms": (_) => const TermsScreen(),
        "/privacy-policy": (_) => const PrivacyPolicyScreen(),
      },
    );
  }
}
