# Googer — Native Shell (Flutter WebView)

A Flutter app that hosts the existing Googer web app inside a native shell for
iOS and Android.

**The Next.js frontend and the Express backend are used exactly as they are.
Nothing in `googernew-main` is modified by this project.**

---

## Why a shell

The web app is already complete and maintained. This wraps it so it can ship to
the App Store and Play Store, updates instantly (a web deploy updates the app —
no store review), and can never drift out of sync with the website.

The trade-off is honest: it is a web app in a native container. Everything
below is about removing the tells.

## What makes it feel native

| Tell | Handling |
|---|---|
| White flash on launch | Splash held until first paint, painted in the site's own `#080808` |
| Rubber-band overscroll | `overscroll-behavior: none` injected on every page load |
| Blue tap highlight | `-webkit-tap-highlight-color: transparent` |
| Long-press callout menus | `-webkit-touch-callout: none`; text selection kept in inputs only |
| Visible scrollbars | Hidden via `::-webkit-scrollbar` |
| Pinch zoom | Disabled |
| Browser back behaviour | Hardware/edge back walks web history, exits only at the first page |
| Reload gesture | Native `RefreshIndicator` pull-to-refresh |
| Video punching to fullscreen | `allowsInlineMediaPlayback` on iOS; autoplay allowed on both |
| Dead app when offline | Connectivity watched; offline screen with retry, auto-reloads when the network returns |
| Leaving the site with no way back | Only `googer.site` hosts stay in the shell; everything else opens externally |

Loading progress is a thin 2px red bar rather than browser chrome.

## Running

```bash
flutter pub get

# Android
flutter run
flutter build apk --release

# iOS (requires macOS + Xcode)
cd ios && pod install && cd ..
flutter build ios --release
```

### Environment for Android builds on this machine

```powershell
$env:ANDROID_HOME = "d:\googer-recovery-code\tools\android-build\android-sdk"
$env:JAVA_HOME    = "d:\googer-recovery-code\tools\android-build\jdk17\jdk-17.0.19+10"
```

## Configuration

In `lib/main.dart`:

- `kStartUrl` — the URL the shell opens
- `kInternalHosts` — hosts that stay inside the app

## Permissions

Declared for the features the web app actually uses. iOS strings live in
`ios/Runner/Info.plist`, Android in `AndroidManifest.xml`.

- Camera — photos for posts, listings, chats
- Microphone — voice and video calls
- Photo library — uploads

App Transport Security is left **on** (`NSAllowsArbitraryLoads = false`); the
site is HTTPS.

## Known limitations

Stated plainly so they are not discovered late:

1. **iOS cannot be built or tested from Windows.** The iOS project and its
   configuration are complete, but producing an `.ipa` needs macOS with Xcode.
2. **Android file uploads** hand off to the system chooser. Capturing straight
   from the camera into a web file input needs a custom picker.
3. **External links** are intercepted and prevented from loading in-shell;
   adding `url_launcher` will open them in the system browser.
4. **Push notifications** are not included. A shell cannot receive them without
   adding FCM/APNs.
5. **App Store review risk.** Apple's guideline 4.2 rejects apps that are only
   a repackaged website. Camera, calls and payments help the case, but this is
   a real risk worth planning for before submission.
