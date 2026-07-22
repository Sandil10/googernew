import 'package:flutter/material.dart';
import 'theme/colors.dart';
import 'api/api.dart';
import 'services/token_store.dart';
import 'screens/login_screen.dart';
import 'screens/home_feed_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Warm the token cache so the first frame can decide login vs. home.
  await TokenStore.get();
  Api.token = TokenStore.cached;
  if (Api.loggedIn) {
    await Api.refreshProfile();
  }
  runApp(const GoogerApp());
}

class GoogerApp extends StatelessWidget {
  const GoogerApp({super.key});

  @override
  Widget build(BuildContext context) {
    final loggedIn = TokenStore.cached != null;
    return MaterialApp(
      title: 'Googer',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.bg0,
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(seedColor: AppColors.accentPurple, brightness: Brightness.dark),
      ),
      // Clamp text scaling so tight fixed-size layouts stay healthy across all
      // iPhone sizes and large accessibility font settings.
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        return MediaQuery(
          data: mq.copyWith(
            textScaler: mq.textScaler.clamp(minScaleFactor: 0.9, maxScaleFactor: 1.15),
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: loggedIn ? const HomeFeedScreen() : const LoginScreen(),
    );
  }
}
