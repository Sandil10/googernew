// Verifies the reach maths under dart2js/JS number semantics, which is the
// only place the web build differs from `flutter test` (Dart VM ints are
// 64-bit; on web they are JS doubles with 32-bit bitwise ops).
//
// Run: dart compile js -o <out>.js tool/reach_web_probe.dart && node <out>.js
import 'package:googer_app/util/reach_calc.dart';

const _liveTier = {
  "id": 5,
  "ad_type": "photo_video_ad",
  "budget_from": "300.00",
  "budget_to": "500.00",
  "min_days": 1,
  "max_days": 1,
  "min_multiplier": "3.0000",
  "max_multiplier": "5.0000",
  "max_reach_multiplier": "0.3000",
};

void main() {
  final tiers = [ReachTier.fromJson(_liveTier)];
  try {
    final estimate = calcReach(tiers, 300);
    print(
      'OK min=${estimate!.minReach} max=${estimate.maxReach} '
      'cap=${estimate.reachCap}',
    );
  } catch (e) {
    print('THREW: $e');
  }
}
