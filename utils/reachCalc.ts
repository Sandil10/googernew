export type ReachTier = {
    id: number;
    ad_type: string;
    budget_from: string | number;
    budget_to: string | number;
    min_days: number;
    max_days: number;
    min_multiplier: string | number;
    max_multiplier: string | number;
    max_reach_multiplier: string | number | null;
};

export function findTier(tiers: ReachTier[], budget: number): ReachTier | null {
    return tiers.find(
        (t) => budget >= Number(t.budget_from) && budget <= Number(t.budget_to)
    ) ?? null;
}

export function calcReach(
    tiers: ReachTier[],
    budget: number,
    minPromoBonus = 0,
    maxPromoBonus = 0,
    promoReachCap: number | null = null,
) {
    const tier = findTier(tiers, budget);
    if (!tier) return null;

    const minReach = Math.round(budget * Number(tier.min_multiplier)) + minPromoBonus;
    const maxReach = Math.round(budget * Number(tier.max_multiplier)) + maxPromoBonus;

    const tierCap = tier.max_reach_multiplier != null
        ? Math.max(1, Math.round(budget * Number(tier.max_reach_multiplier)))
        : null;

    // Promo reach cap takes priority over tier cap — never display, send to backend only
    const reachCap = promoReachCap ?? tierCap;

    return { minReach, maxReach, reachCap };
}
