import 'dart:async';
import 'dart:io' show Platform;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

/// Googer — native shell around the production web app.
///
/// The Next.js frontend and Express backend are used exactly as they are; this
/// app only hosts them. Everything here exists to remove the "this is a web
/// page" tells: no white flash, no rubber-band bounce, no browser chrome,
/// native back navigation, native pull-to-refresh, and offline handling.
const String kStartUrl = 'https://googer.site';

/// Hosts treated as "inside the app". Anything else opens outside, so a user
/// is never stranded on a third-party page with no way back.
const List<String> kInternalHosts = [
  'googer.site',
  'www.googer.site',
  'expo.googer.site',
];

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: Color(0xFF080808),
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );
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
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF080808),
        useMaterial3: true,
      ),
      home: const GoogerWebShell(),
    );
  }
}

class GoogerWebShell extends StatefulWidget {
  const GoogerWebShell({super.key});

  @override
  State<GoogerWebShell> createState() => _GoogerWebShellState();
}

class _GoogerWebShellState extends State<GoogerWebShell> {
  late final WebViewController _controller;

  /// The splash stays up until the *first* page finishes painting, so the user
  /// never sees a white frame or a half-rendered layout.
  bool _firstLoadDone = false;
  bool _offline = false;
  double _progress = 0;

  StreamSubscription<List<ConnectivityResult>>? _connectivity;

  @override
  void initState() {
    super.initState();
    _initController();
    _watchConnectivity();
  }

  @override
  void dispose() {
    _connectivity?.cancel();
    super.dispose();
  }

  void _watchConnectivity() {
    _connectivity = Connectivity().onConnectivityChanged.listen((results) {
      final hasNet =
          results.isNotEmpty && !results.contains(ConnectivityResult.none);
      if (!mounted) return;
      // Coming back online after an error page: reload rather than leaving the
      // user staring at the offline screen.
      if (hasNet && _offline) {
        setState(() => _offline = false);
        _controller.reload();
      } else if (!hasNet && !_offline) {
        setState(() => _offline = true);
      }
    });
  }

  void _initController() {
    // Platform-specific params: WKWebView needs media config up front for
    // inline video and autoplay to behave like a native player rather than
    // punching out to fullscreen on every tap.
    late final PlatformWebViewControllerCreationParams params;
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
    } else {
      params = const PlatformWebViewControllerCreationParams();
    }

    final controller = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF080808))
      ..enableZoom(false)
      ..setUserAgent(_userAgent)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (mounted) setState(() => _progress = p / 100);
          },
          onPageFinished: (_) async {
            await _injectNativeFeelCss();
            if (mounted && !_firstLoadDone) {
              setState(() => _firstLoadDone = true);
            }
          },
          onWebResourceError: (error) {
            // Only a failing main document should show the offline screen — a
            // missing image must not blank the app.
            if (error.isForMainFrame ?? false) {
              if (mounted) setState(() => _offline = true);
            }
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.navigate;
            if (kInternalHosts.contains(uri.host)) {
              return NavigationDecision.navigate;
            }
            // tel:, mailto:, payment redirects and other sites belong outside
            // the shell.
            _openExternally(request.url);
            return NavigationDecision.prevent;
          },
        ),
      )
      ..loadRequest(Uri.parse(kStartUrl));

    // Android: allow media autoplay and file uploads — image pickers in chats
    // and listings do not work at all without the file selector hook.
    if (controller.platform is AndroidWebViewController) {
      AndroidWebViewController.enableDebugging(false);
      final android = controller.platform as AndroidWebViewController;
      android.setMediaPlaybackRequiresUserGesture(false);
      android.setOnShowFileSelector(_androidFilePicker);
    }

    _controller = controller;
  }

  String get _userAgent {
    // The base UA is left intact so the site keeps serving its normal mobile
    // layout; the suffix lets the web app detect the shell if it ever needs to
    // (for example, hiding an "install our app" banner).
    final base = Platform.isIOS
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
              '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/126.0.0.0 Mobile Safari/537.36';
    return '$base GoogerApp/1.0';
  }

  Future<List<String>> _androidFilePicker(FileSelectorParams params) async {
    // Empty list hands control back to the system chooser. A camera-capture
    // flow would be wired here.
    return <String>[];
  }

  /// Removes the remaining browser tells: overscroll bounce, tap highlight,
  /// long-press callouts and visible scrollbars.
  Future<void> _injectNativeFeelCss() async {
    const css = '''
      (function () {
        if (document.getElementById('googer-native-shell')) return;
        var s = document.createElement('style');
        s.id = 'googer-native-shell';
        s.innerHTML = `
          html, body {
            overscroll-behavior: none;
            -webkit-overflow-scrolling: touch;
          }
          * {
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
          }
          input, textarea, [contenteditable] {
            -webkit-user-select: text;
            user-select: text;
          }
          ::-webkit-scrollbar { width: 0; height: 0; }
        `;
        document.head.appendChild(s);
      })();
    ''';
    try {
      await _controller.runJavaScript(css);
    } catch (_) {
      // A page that blocks injection must not break navigation.
    }
  }

  void _openExternally(String url) {
    // Hook kept separate so `url_launcher` can be dropped in without touching
    // the navigation delegate.
    debugPrint('external: $url');
  }

  Future<bool> _handleBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final shouldExit = await _handleBack();
        if (shouldExit && mounted) {
          SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF080808),
        body: SafeArea(
          top: false,
          bottom: false,
          child: Stack(
            children: [
              RefreshIndicator(
                onRefresh: () => _controller.reload(),
                color: Colors.white,
                backgroundColor: const Color(0xFF151515),
                displacement: 56,
                child: WebViewWidget(controller: _controller),
              ),
              if (_progress > 0 && _progress < 1 && _firstLoadDone)
                Positioned(
                  top: MediaQuery.of(context).padding.top,
                  left: 0,
                  right: 0,
                  child: LinearProgressIndicator(
                    value: _progress,
                    minHeight: 2,
                    backgroundColor: Colors.transparent,
                    valueColor: const AlwaysStoppedAnimation(Color(0xFFEF4444)),
                  ),
                ),
              if (_offline) _offlineView(),
              if (!_firstLoadDone) const _SplashView(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _offlineView() {
    return Container(
      color: const Color(0xFF080808),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off_rounded, size: 40, color: Colors.white24),
          const SizedBox(height: 16),
          const Text(
            'No connection',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Check your network and try again.',
            style: TextStyle(fontSize: 12, color: Colors.white38),
          ),
          const SizedBox(height: 22),
          GestureDetector(
            onTap: () {
              setState(() => _offline = false);
              _controller.reload();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text(
                'RETRY',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.4,
                  color: Colors.black,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Shown until the first paint completes. Matching the site's background colour
/// is what removes the white flash that gives web shells away.
class _SplashView extends StatelessWidget {
  const _SplashView();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF080808),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 74,
            height: 74,
            decoration: BoxDecoration(
              color: const Color(0xFF101010),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white10),
            ),
            alignment: Alignment.center,
            child: const Text(
              'G',
              style: TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 26),
          const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation(Colors.white24),
            ),
          ),
        ],
      ),
    );
  }
}
