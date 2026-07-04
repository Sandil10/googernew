function parseVariants(rawVariants) {
    if (!rawVariants) return [];
    if (Array.isArray(rawVariants)) return rawVariants;
    if (typeof rawVariants === 'string') {
        try {
            return JSON.parse(rawVariants);
        } catch {
            return [];
        }
    }
    return [];
}

async function adjustOrderItemStock(client, marketItem, orderLike, direction = 'decrease') {
    const quantity = parseInt(orderLike.quantity || 0, 10);
    if (!quantity) return;

    const delta = direction === 'decrease' ? -quantity : quantity;
    const variants = parseVariants(marketItem.variants);
    const variantIndex = orderLike.variant_index !== undefined && orderLike.variant_index !== null
        ? parseInt(orderLike.variant_index, 10)
        : null;
    const selectedSize = typeof orderLike.size === 'string' ? orderLike.size.trim() : null;
    const normalizedSelectedSize = selectedSize ? selectedSize.toLowerCase() : null;

    let stockAdjusted = false;

    if (variants.length > 0) {
        let targetVariant = null;

        if (variantIndex !== null && !Number.isNaN(variantIndex) && variants[variantIndex]) {
            targetVariant = variants[variantIndex];
        } else if (orderLike.color) {
            targetVariant = variants.find((variant) => variant.color === orderLike.color) || null;
        }

        if (targetVariant?.selections && Array.isArray(targetVariant.selections) && normalizedSelectedSize) {
            const selectionIndex = targetVariant.selections.findIndex((selection) => {
                const selectionValue = typeof selection?.value === 'string' ? selection.value.trim().toLowerCase() : '';
                return selectionValue === normalizedSelectedSize;
            });

            if (selectionIndex !== -1) {
                const currentStock = parseInt(targetVariant.selections[selectionIndex].stock || 0, 10) || 0;
                const nextStock = currentStock + delta;

                if (direction === 'decrease' && nextStock < 0) {
                    throw new Error(`Insufficient stock for ${selectedSize}`);
                }

                targetVariant.selections[selectionIndex].stock = String(Math.max(0, nextStock));
                stockAdjusted = true;
            }
        }

        if (!stockAdjusted && targetVariant) {
            const currentStock = parseInt(targetVariant.stock || targetVariant.quantity || 0, 10) || 0;
            const nextStock = currentStock + delta;

            if (direction === 'decrease' && nextStock < 0) {
                throw new Error('Insufficient stock for this variant');
            }

            targetVariant.stock = String(Math.max(0, nextStock));
            stockAdjusted = true;
        }

        if (!stockAdjusted && normalizedSelectedSize) {
            const legacyVariant = variants.find((variant) => {
                const variantSize = typeof (variant.size || variant.selection) === 'string'
                    ? (variant.size || variant.selection).trim().toLowerCase()
                    : '';
                const sameColor = orderLike.color ? variant.color === orderLike.color : true;

                return variantSize === normalizedSelectedSize && sameColor;
            });

            if (legacyVariant) {
                const currentStock = parseInt(legacyVariant.stock || legacyVariant.quantity || 0, 10) || 0;
                const nextStock = currentStock + delta;

                if (direction === 'decrease' && nextStock < 0) {
                    throw new Error(`Insufficient stock for ${selectedSize}`);
                }

                legacyVariant.stock = String(Math.max(0, nextStock));
                stockAdjusted = true;
            }
        }
    }

    if (variants.length > 0 && stockAdjusted) {
        const totalStock = variants.reduce((sum, variant) => {
            if (Array.isArray(variant?.selections) && variant.selections.length > 0) {
                return sum + variant.selections.reduce((selectionSum, selection) => {
                    return selectionSum + (parseInt(selection?.stock || 0, 10) || 0);
                }, 0);
            }

            return sum + (parseInt(variant?.stock || variant?.quantity || 0, 10) || 0);
        }, 0);

        await client.query(
            'UPDATE market SET variants = $1, stock = $2 WHERE id = $3',
            [JSON.stringify(variants), totalStock, marketItem.id]
        );
        return;
    }

    const currentStock = parseInt(marketItem.stock || 0, 10) || 0;
    const nextStock = currentStock + delta;

    if (direction === 'decrease' && nextStock < 0) {
        throw new Error('Insufficient overall stock');
    }

    await client.query('UPDATE market SET stock = $1 WHERE id = $2', [Math.max(0, nextStock), marketItem.id]);
}

module.exports = {
    adjustOrderItemStock,
    parseVariants,
};
