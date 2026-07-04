const productReadRepository = require('./productReadRepository');

const getMarketItemById = async (id) => {
    const numericId = Number.parseInt(id, 10);
    let result = null;

    await productReadRepository.ensureMarketProductCodeColumn();

    if (!Number.isNaN(numericId)) {
        result = await productReadRepository.getMarketItemByNumericId(numericId);
    }

    if (!result || result.rows.length === 0) {
        result = await productReadRepository.getMarketItemByProductCode(id);
    }

    if (!result || result.rows.length === 0) {
        const adId = productReadRepository.isSponsoredFeedItemId(id)
            ? productReadRepository.normalizeSponsoredAdId(id)
            : id;
        const adResult = await productReadRepository.getPublicAdById(adId);
        if (adResult.rows.length > 0) {
            return {
                success: true,
                data: await productReadRepository.mapSponsoredAdWithCurrentReward(adResult.rows[0]),
            };
        }

        const error = new Error('Not found');
        error.statusCode = 404;
        throw error;
    }

    return {
        success: true,
        data: productReadRepository.attachCurrentUser(result.rows[0]),
    };
};

const getMarketItemByCode = async (code) => {
    if (!code) {
        const error = new Error('Code is required');
        error.statusCode = 400;
        throw error;
    }

    await productReadRepository.ensureMarketProductCodeColumn();

    const result = await productReadRepository.getMarketItemByProductCode(code);
    if (result.rows.length > 0) {
        return {
            success: true,
            data: productReadRepository.attachCurrentUser(result.rows[0]),
        };
    }

    const adId = productReadRepository.isSponsoredFeedItemId(code)
        ? productReadRepository.normalizeSponsoredAdId(code)
        : code;
    const adResult = await productReadRepository.getPublicAdById(adId);
    if (adResult.rows.length > 0) {
        return {
            success: true,
            data: await productReadRepository.mapSponsoredAdWithCurrentReward(adResult.rows[0]),
        };
    }

    const error = new Error('Not found');
    error.statusCode = 404;
    throw error;
};

const getAdPublic = async (id) => {
    const result = await productReadRepository.getPublicAdById(id);
    if (result.rows.length === 0) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }

    return {
        success: true,
        ad: await productReadRepository.mapSponsoredAdWithCurrentReward(result.rows[0]),
    };
};

const getProductByCodePublic = async (shareCode) => {
    await productReadRepository.ensureMarketProductCodeColumn();

    const normalizedShareCode = decodeURIComponent(String(shareCode || '')).trim();
    let resolvedCode = normalizedShareCode;

    if (/^[0-9A-Za-z]{8}$/.test(normalizedShareCode)) {
        const candidateResult = await productReadRepository.getProductCodeCandidates();
        const matched = (candidateResult.rows || []).find((row) => {
            const codeByProductCode = productReadRepository.buildShortShareCode('p', row.product_code || '');
            const codeById = productReadRepository.buildShortShareCode('p', row.id);
            return codeByProductCode === normalizedShareCode || codeById === normalizedShareCode;
        });

        if (matched?.product_code) {
            resolvedCode = String(matched.product_code);
        }
    }

    let productRow = (await productReadRepository.getPublicProductByResolvedCode(resolvedCode)).rows[0] || null;

    if (!productRow) {
        productRow = (await productReadRepository.getPublicProductByAliasCode(normalizedShareCode)).rows[0] || null;
    }

    if (!productRow) {
        productRow = (await productReadRepository.getLinkedProductFromAdsByShareCode(normalizedShareCode)).rows[0] || null;
    }

    if (!productRow) {
        productRow = (await productReadRepository.getLinkedProductFromAdsDraft(normalizedShareCode)).rows[0] || null;
    }

    if (!productRow) {
        const error = new Error('Product not found');
        error.statusCode = 404;
        throw error;
    }

    productRow = await productReadRepository.ensureProductRowHasCanonicalShareCode(productRow);
    const mappedProduct = productReadRepository.attachCurrentUser(productRow);
    const canonicalShareCode = productReadRepository.getCanonicalProductShareCode(productRow);
    const canonicalSharePath = canonicalShareCode ? `/product/${canonicalShareCode}` : '';

    return {
        success: true,
        product: {
            ...mappedProduct,
            canonical_share_code: canonicalShareCode,
            canonical_share_path: canonicalSharePath,
        },
    };
};

module.exports = {
    getAdPublic,
    getMarketItemByCode,
    getMarketItemById,
    getProductByCodePublic,
};
