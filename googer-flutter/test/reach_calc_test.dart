import 'package:flutter_test/flutter_test.dart';
import 'package:googer_app/util/reach_calc.dart';

/// The real photo_video_ad tier the default R300 budget lands in. Its
/// `max_reach_multiplier` is set, which is the branch that computes a cap.
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
  test('computes reach for the live default budget', () {
    final tiers = [ReachTier.fromJson(_liveTier)];

    final estimate = calcReach(tiers, 300);

    expect(estimate, isNotNull);
    expect(estimate!.minReach, 900); // 300 * 3
    expect(estimate.maxReach, 1500); // 300 * 5
    expect(estimate.reachCap, 90); // 300 * 0.3
  });

  test('a tier with no max_reach_multiplier yields no cap', () {
    final tiers = [
      ReachTier.fromJson({..._liveTier, "max_reach_multiplier": null}),
    ];

    expect(calcReach(tiers, 300)!.reachCap, isNull);
  });

  test('a promo cap overrides the tier cap', () {
    final tiers = [ReachTier.fromJson(_liveTier)];

    expect(calcReach(tiers, 300, promoReachCap: 25)!.reachCap, 25);
  });

  test('a budget outside every tier has no estimate', () {
    final tiers = [ReachTier.fromJson(_liveTier)];

    expect(calcReach(tiers, 900), isNull);
  });
}
