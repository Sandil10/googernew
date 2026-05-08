const pool = require('./src/config/database');

const safeJsonParse = (value, fallback = {}) => {
    if (!value) return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const normalizeId = (value) => {
    const raw = String(value ?? '').trim().replace(/^ad-/i, '');
    if (!raw || !/^\d+$/.test(raw)) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeCode = (value) => {
    const raw = String(value ?? '').trim();
    return raw ? raw : null;
};

const extractTargetFromLink = (link) => {
    const raw = String(link || '').trim();
    if (!raw) return { id: null, code: null };

    try {
        const url = new URL(raw.startsWith('http') ? raw : `https://googer.local${raw.startsWith('/') ? raw : `/${raw}`}`);
        const parts = url.pathname.split('/').filter(Boolean);
        const index = parts.findIndex((part) => ['product', 'share', 'shop'].includes(part.toLowerCase()));
        const value = index >= 0 ? parts[index + 1] : '';
        if (!value) return { id: null, code: null };
        const decoded = decodeURIComponent(value);
        return /^\d+$/.test(decoded) ? { id: Number(decoded), code: null } : { id: null, code: decoded };
    } catch {
        return { id: null, code: null };
    }
};

const resolveTarget = async (client, row) => {
    const draft = safeJsonParse(row.edit_draft, {}) || {};
    let productId =
        normalizeId(row.linked_product_id) ||
        normalizeId(draft.linkedProductId) ||
        normalizeId(draft.linked_product_id) ||
        normalizeId(draft.product_id) ||
        normalizeId(draft.productId);

    let productCode =
        normalizeCode(row.linked_product_share_code) ||
        normalizeCode(draft.linkedProductShareCode) ||
        normalizeCode(draft.linked_product_share_code) ||
        normalizeCode(draft.linkedProductCode) ||
        normalizeCode(draft.linked_product_code);

    if (!productId && !productCode) {
        const fallbackTarget = extractTargetFromLink(draft.activeLink || draft.active_link);
        productId = fallbackTarget.id || null;
        productCode = fallbackTarget.code || null;
    }

    if (productId && !productCode) {
        const result = await client.query(
            'SELECT product_code FROM market WHERE id = $1 LIMIT 1',
            [productId]
        );
        productCode = normalizeCode(result.rows[0]?.product_code);
    }

    if (!productId && productCode) {
        const result = await client.query(
            'SELECT id, product_code FROM market WHERE LOWER(product_code) = LOWER($1) LIMIT 1',
            [productCode]
        );
        productId = normalizeId(result.rows[0]?.id);
        productCode = normalizeCode(result.rows[0]?.product_code || productCode);
    }

    if (!productId && !productCode) {
        return null;
    }

    const productResult = productId
        ? await client.query(
            'SELECT id, product_code FROM market WHERE id = $1 LIMIT 1',
            [productId]
        )
        : await client.query(
            'SELECT id, product_code FROM market WHERE LOWER(product_code) = LOWER($1) LIMIT 1',
            [productCode]
        );

    const product = productResult.rows[0];
    if (product) {
        return {
            productId: normalizeId(product.id),
            productCode: normalizeCode(product.product_code || productCode),
        };
    }

    if (productCode) {
        const aliasResult = await client.query(
            `SELECT m.id, m.product_code
             FROM product_share_aliases psa
             JOIN market m ON m.id = psa.product_id
             WHERE LOWER(psa.alias_code) = LOWER($1)
             LIMIT 1`,
            [productCode]
        );
        const aliasProduct = aliasResult.rows[0];
        if (aliasProduct) {
            return {
                productId: normalizeId(aliasProduct.id),
                productCode: normalizeCode(aliasProduct.product_code || productCode),
            };
        }
    }

    return null;
};

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting Product Promote identity backfill...');
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE ads
            ADD COLUMN IF NOT EXISTS linked_product_id INTEGER,
            ADD COLUMN IF NOT EXISTS linked_product_share_code VARCHAR(32);
        `);

        const result = await client.query(
            `SELECT ad_id, campaign_type, edit_draft, linked_product_id, linked_product_share_code
             FROM ads
             WHERE campaign_type = 'Product Promote'
             ORDER BY created_at ASC`
        );

        let updated = 0;
        let skipped = 0;

        for (const row of result.rows) {
            const target = await resolveTarget(client, row);
            if (!target) {
                skipped += 1;
                console.warn('Skipping unresolved Product Promote ad during backfill', {
                    adId: row.ad_id,
                    linkedProductId: row.linked_product_id ?? null,
                    linkedProductShareCode: row.linked_product_share_code ?? null,
                });
                continue;
            }

            const draft = safeJsonParse(row.edit_draft, {}) || {};
            const nextDraft = {
                ...draft,
                linkedProductId: target.productId,
                linkedProductShareCode: target.productCode,
            };

            await client.query(
                `UPDATE ads
                 SET linked_product_id = $1,
                     linked_product_share_code = $2,
                     edit_draft = $3,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE ad_id = $4`,
                [target.productId, target.productCode, JSON.stringify(nextDraft), row.ad_id]
            );
            updated += 1;
        }

        await client.query('COMMIT');
        console.log(`Product Promote identity backfill complete. Updated: ${updated}, skipped: ${skipped}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Product Promote identity backfill failed:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
