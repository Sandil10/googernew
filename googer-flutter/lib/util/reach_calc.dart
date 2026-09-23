/// Port of the web `utils/reachCalc.ts`. The campaign builder must not invent
/// its own reach formula — the admin-tunable tiers behind
/// `GET /admin/customization/reach-tiers/public` are the single source of
/// truth, and the ESTIMATED REACH tile has to agree with what the web shows
/// for the same budget.
library;

import 'dart:math';

class ReachTier {
  final int id;
  final String adType;
  final double budgetFrom;
  final double budgetTo;
  final int minDays;
  final int maxDays;
  final double minMultiplier;
  final double maxMultiplier;

  /// Null when the tier sets no cap, in which case only a promo cap can apply.
  final double? maxReachMultiplier;

  const ReachTier({
    required this.id,
    required this.adType,
    required this.budgetFrom,
    required this.budgetTo,
    required this.minDays,
    required this.maxDays,
    required this.minMultiplier,
    required this.maxMultiplier,
    this.maxReachMultiplier,
  });

  /// The backend sends numerics as strings (`"300.00"`), so every field goes
  /// through a tolerant parse rather than a cast.
  factory ReachTier.fromJson(Map<dynamic, dynamic> json) {
    double num$(dynamic value, [double fallback = 0]) =>
        double.tryParse("${value ?? ''}") ?? fallback;
    int int$(dynamic value, [int fallback = 0]) =>
        int.tryParse("${value ?? ''}") ?? num$(value, fallback.toDouble()).round();

    return ReachTier(
      id: int$(json["id"]),
      adType: "${json["ad_type"] ?? ''}",
      budgetFrom: num$(json["budget_from"]),
      budgetTo: num$(json["budget_to"]),
      minDays: int$(json["min_days"], 1),
      maxDays: int$(json["max_days"], 1),
      minMultiplier: num$(json["min_multiplier"]),
      maxMultiplier: num$(json["max_multiplier"]),
      maxReachMultiplier: json["max_reach_multiplier"] == null
          ? null
          : num$(json["max_reach_multiplier"]),
    );
  }
}

class ReachEstimate {
  final int minReach;
  final int maxReach;

  /// Sent to the backend as `maxReachCap`; never shown in the UI.
  final int? reachCap;

  const ReachEstimate(this.minReach, this.maxReach, this.reachCap);
}

ReachTier? findTier(List<ReachTier> tiers, double budget) {
  for (final tier in tiers) {
    if (budget >= tier.budgetFrom && budget <= tier.budgetTo) return tier;
  }
  return null;
}

/// Returns null when the budget falls outside every configured tier — the web
/// treats that as "no estimate available" rather than extrapolating.
ReachEstimate? calcReach(
  List<ReachTier> tiers,
  double budget, {
  int minPromoBonus = 0,
  int maxPromoBonus = 0,
  int? promoReachCap,
}) {
  final tier = findTier(tiers, budget);
  if (tier == null) return null;

  final minReach = (budget * tier.minMultiplier).round() + minPromoBonus;
  final maxReach = (budget * tier.maxMultiplier).round() + maxPromoBonus;

  // Floor of 1, no ceiling — mirrors the web's `Math.max(1, Math.round(...))`.
  // An upper bound here has no source in the web maths, and expressing one as
  // `1 << 62` is broken on web anyway: Dart ints are JS doubles there and
  // bitwise shifts are 32-bit, so the bound collapses and `clamp` throws.
  final tierCap = tier.maxReachMultiplier == null
      ? null
      : max(1, (budget * tier.maxReachMultiplier!).round());

  // A promo's own cap wins over the tier cap.
  return ReachEstimate(minReach, maxReach, promoReachCap ?? tierCap);
}
