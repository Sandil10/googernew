import 'package:flutter/material.dart';
import 'theme/app_colors.dart';
import 'services/app_session.dart';
import 'services/googer_api.dart';
import 'widgets/bottom_nav.dart';
import 'screens/home_screen.dart';
import 'screens/shop_screen.dart';
import 'screens/wallet_screen.dart';
import 'screens/chats_screen.dart';
import 'screens/ad_campaign_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const GoogerApp());
}

class GoogerApp extends StatelessWidget {
  const GoogerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Googer',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.background,
        fontFamily: 'Inter', // add an Inter font family to pubspec if desired
        colorScheme: const ColorScheme.dark(
          primary: AppColors.accentRed,
          surface: AppColors.surface,
        ),
      ),
      home: const AppGate(),
    );
  }
}

class AppGate extends StatefulWidget {
  const AppGate({super.key});

  @override
  State<AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<AppGate> {
  late final AppSession _session;

  @override
  void initState() {
    super.initState();
    _session = AppSession();
    _session.restore();
  }

  @override
  Widget build(BuildContext context) {
    return SessionScope(
      session: _session,
      child: AnimatedBuilder(
        animation: _session,
        builder: (context, _) {
          if (_session.restoring) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator(color: Colors.white)),
            );
          }
          return _session.isAuthenticated ? const RootShell() : const LoginScreen();
        },
      ),
    );
  }
}

/// Root shell: top app bar + swappable body + bottom nav.
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> {
  int _tab = 0;

  static const _titles = ['Googer', 'Market', 'Wallet', 'Chats'];
  static const _screens = [HomeScreen(), ShopScreen(), WalletScreen(), ChatsScreen()];

  void _openAdManager() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const AdCampaignScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final avatar = resolveMediaUrl(session.user?['profile_picture']?.toString());
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(48),
        child: Container(
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              child: Row(
                children: [
                  Container(
                    width: 26, height: 26,
                    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.play_arrow_rounded, size: 16, color: AppColors.textPrimary),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _titles[_tab],
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
                    ),
                  ),
                  const Icon(Icons.notifications_none_rounded, size: 20, color: Color(0xFFC7C7CD)),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileScreen())),
                    child: Container(
                      width: 24, height: 24,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: avatar.isEmpty ? const LinearGradient(colors: [Color(0xFF3A3A40), Color(0xFF18181B)]) : null,
                        image: avatar.isEmpty ? null : DecorationImage(image: NetworkImage(avatar), fit: BoxFit.cover),
                        border: Border.all(color: Colors.white24, width: 1.5),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: IndexedStack(index: _tab, children: _screens),
      bottomNavigationBar: SafeArea(
        top: false,
        child: GoogerBottomNav(
          currentIndex: _tab,
          onTap: (i) => setState(() => _tab = i),
          onAddTap: _openAdManager,
        ),
      ),
    );
  }
}
