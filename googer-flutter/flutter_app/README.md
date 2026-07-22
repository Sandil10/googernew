# Googer — Flutter UI

Flutter/Dart recreation of the Home, Shop, Wallet, and Chats screens from the HTML prototype.
This is a UI-only scaffold (no backend wiring) — screens use static/sample data and TODO markers
for the pieces you'll want to hook up (Ad Manager flow, real product images, API calls).

## Run it

1. Install the Flutter SDK: https://docs.flutter.dev/get-started/install
2. From this folder:
   ```
   flutter pub get
   flutter run
   ```

## Structure

- `lib/main.dart` — app entrypoint, root shell (top bar + bottom nav + tab switching)
- `lib/theme/app_colors.dart` — shared color tokens (matches the black/red palette)
- `lib/widgets/` — reusable pieces (bottom nav, section card, pill chip)
- `lib/screens/` — one file per tab: `home_screen.dart`, `shop_screen.dart`,
  `wallet_screen.dart`, `chats_screen.dart`, plus `ad_campaign_screen.dart`
  (5 ad categories, 2-step Setup → Preview & Publish flow, opened by the
  center "+" nav button) and `reel_player_screen.dart` (full-screen TikTok-style
  vertical player — push it when a feed video is tapped)

## Notes / next steps

- Product photos in `shop_screen.dart` and the referral banner in `wallet_screen.dart` are
  placeholders — swap in `Image.asset(...)` or `Image.network(...)` with real images.
- The center "Add" nav button currently shows a snackbar — wire it to your Ad Manager screen.
- No state management / API layer is included; add `provider`/`riverpod` and your backend
  service calls as needed.
