function roundMoney(value) {
    return Number(Number(value || 0).toFixed(2));
}

function roundPercent(value) {
    return Number(Number(value || 0).toFixed(4));
}

function calculatePercentageAmount(baseAmount, percentage) {
    return roundMoney((Number(baseAmount || 0) * Number(percentage || 0)) / 100);
}

function splitDiscountPool({
    discountAmount,
    discountPercentage,
    baseAmount,
    googerPercentage = 20,
    referralPercentages = [],
}) {
    const pool = discountAmount != null
        ? roundMoney(discountAmount)
        : calculatePercentageAmount(baseAmount, discountPercentage);

    const googerShare = calculatePercentageAmount(pool, googerPercentage);
    const referralShares = referralPercentages.map((percentage, index) => ({
        level: index + 1,
        percentage: roundPercent(percentage),
        amount: calculatePercentageAmount(pool, percentage),
    }));

    const referralTotal = roundMoney(
        referralShares.reduce((sum, share) => sum + share.amount, 0)
    );

    const leftover = roundMoney(Math.max(0, pool - googerShare - referralTotal));

    return {
        pool,
        googerPercentage: roundPercent(googerPercentage),
        googerShare,
        referralShares,
        referralTotal,
        leftover,
    };
}

function splitResellCommission({
    productPrice,
    resellPercentage,
    resellAmount,
    googerPercentage,
}) {
    const pool = resellAmount != null
        ? roundMoney(resellAmount)
        : calculatePercentageAmount(productPrice, resellPercentage);

    const googerShare = calculatePercentageAmount(pool, googerPercentage);
    const resellerShare = roundMoney(Math.max(0, pool - googerShare));

    return {
        pool,
        googerPercentage: roundPercent(googerPercentage),
        googerShare,
        resellerShare,
    };
}

module.exports = {
    calculatePercentageAmount,
    splitDiscountPool,
    splitResellCommission,
};
