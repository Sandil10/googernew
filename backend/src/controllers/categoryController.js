const pool = require('../config/database');

let categoriesTableEnsured = false;
let commissionSettingsTableEnsured = false;
let categorySeedPromise = null;
const PUBLIC_CATEGORY_CACHE_TTL_MS = Number(process.env.PUBLIC_CATEGORY_CACHE_TTL_MS || 30000);
const PUBLIC_COMMISSION_CACHE_TTL_MS = Number(process.env.PUBLIC_COMMISSION_CACHE_TTL_MS || 30000);
let managedCategoriesCache = {
    activeOnly: { expiresAt: 0, value: null },
    includeInactive: { expiresAt: 0, value: null },
};
let commissionValueCache = {
    global: { expiresAt: 0, value: null },
    manualEnabled: { expiresAt: 0, value: null },
};

const GLOBAL_CATEGORY_COMMISSION_KEY = 'general_category_commission';
const MANUAL_CATEGORY_COMMISSION_ENABLED_KEY = 'manual_category_commission_enabled';

const DEFAULT_CATEGORY_TREE = [
    {
        name: 'FASHION',
        commission_percentage: 0,
        children: [
            {
                name: "Women's Clothing",
                commission_percentage: 0,
                children: [
                    { name: 'Dresses', commission_percentage: 0 },
                    { name: 'Tops & Blouses', commission_percentage: 0 },
                    { name: 'T-Shirts', commission_percentage: 0 },
                    { name: 'Jeans', commission_percentage: 0 },
                    { name: 'Pants & Trousers', commission_percentage: 0 },
                    { name: 'Skirts', commission_percentage: 0 },
                    { name: 'Shorts', commission_percentage: 0 },
                    { name: 'Jackets & Coats', commission_percentage: 0 },
                    { name: 'Activewear', commission_percentage: 0 },
                    { name: 'Formal Wear', commission_percentage: 0 },
                ],
            },
            {
                name: "Men's Clothing",
                commission_percentage: 0,
                children: [
                    { name: 'T-Shirts', commission_percentage: 0 },
                    { name: 'Shirts', commission_percentage: 0 },
                    { name: 'Jeans', commission_percentage: 0 },
                    { name: 'Trousers', commission_percentage: 0 },
                    { name: 'Shorts', commission_percentage: 0 },
                    { name: 'Jackets', commission_percentage: 0 },
                    { name: 'Suits & Blazers', commission_percentage: 0 },
                    { name: 'Sportswear', commission_percentage: 0 },
                ],
            },
            {
                name: "Kids' Clothing",
                commission_percentage: 0,
                children: [
                    { name: 'Boys Wear', commission_percentage: 0 },
                    { name: 'Girls Wear', commission_percentage: 0 },
                    { name: 'School Wear', commission_percentage: 0 },
                    { name: 'Sleepwear', commission_percentage: 0 },
                    { name: 'Sportswear', commission_percentage: 0 },
                ],
            },
            {
                name: 'Shoes',
                commission_percentage: 0,
                children: [
                    { name: "Men's Shoes", commission_percentage: 0 },
                    { name: "Women's Shoes", commission_percentage: 0 },
                    { name: "Kids' Shoes", commission_percentage: 0 },
                    { name: 'Sneakers', commission_percentage: 0 },
                    { name: 'Sandals', commission_percentage: 0 },
                    { name: 'Boots', commission_percentage: 0 },
                    { name: 'Formal Shoes', commission_percentage: 0 },
                ],
            },
            {
                name: 'Bags & Accessories',
                commission_percentage: 0,
                children: [
                    { name: 'Handbags', commission_percentage: 0 },
                    { name: 'Backpacks', commission_percentage: 0 },
                    { name: 'Wallets', commission_percentage: 0 },
                    { name: 'Luggage', commission_percentage: 0 },
                    { name: 'Sunglasses', commission_percentage: 0 },
                    { name: 'Watches', commission_percentage: 0 },
                    { name: 'Jewelry', commission_percentage: 0 },
                ],
            },
        ],
    },
    {
        name: 'ELECTRONICS',
        commission_percentage: 0,
        children: [
            {
                name: 'Mobile Phones',
                commission_percentage: 0,
                children: [
                    { name: 'Smartphones', commission_percentage: 0 },
                    { name: 'Feature Phones', commission_percentage: 0 },
                    { name: 'Phone Cases', commission_percentage: 0 },
                    { name: 'Chargers', commission_percentage: 0 },
                    { name: 'Power Banks', commission_percentage: 0 },
                    { name: 'Screen Protectors', commission_percentage: 0 },
                ],
            },
            {
                name: 'Computers',
                commission_percentage: 0,
                children: [
                    { name: 'Laptops', commission_percentage: 0 },
                    { name: 'Desktop PCs', commission_percentage: 0 },
                    { name: 'Monitors', commission_percentage: 0 },
                    { name: 'Keyboards', commission_percentage: 0 },
                    { name: 'Mice', commission_percentage: 0 },
                    { name: 'Storage Devices', commission_percentage: 0 },
                ],
            },
            {
                name: 'TV & Entertainment',
                commission_percentage: 0,
                children: [
                    { name: 'Smart TVs', commission_percentage: 0 },
                    { name: 'Speakers', commission_percentage: 0 },
                    { name: 'Home Theatre', commission_percentage: 0 },
                    { name: 'Streaming Devices', commission_percentage: 0 },
                ],
            },
            {
                name: 'Gaming',
                commission_percentage: 0,
                children: [
                    { name: 'Consoles', commission_percentage: 0 },
                    { name: 'Controllers', commission_percentage: 0 },
                    { name: 'Games', commission_percentage: 0 },
                    { name: 'Gaming Accessories', commission_percentage: 0 },
                ],
            },
        ],
    },
    {
        name: 'HOME & LIVING',
        commission_percentage: 0,
        children: [
            {
                name: 'Kitchen & Dining',
                commission_percentage: 0,
                children: [
                    { name: 'Cookware', commission_percentage: 0 },
                    { name: 'Dinner Sets', commission_percentage: 0 },
                    { name: 'Kitchen Tools', commission_percentage: 0 },
                    { name: 'Storage Containers', commission_percentage: 0 },
                ],
            },
            {
                name: 'Home Decor',
                commission_percentage: 0,
                children: [
                    { name: 'Wall Art', commission_percentage: 0 },
                    { name: 'Clocks', commission_percentage: 0 },
                    { name: 'Curtains', commission_percentage: 0 },
                    { name: 'Lighting', commission_percentage: 0 },
                ],
            },
            {
                name: 'Furniture',
                commission_percentage: 0,
                children: [
                    { name: 'Sofas', commission_percentage: 0 },
                    { name: 'Beds', commission_percentage: 0 },
                    { name: 'Tables', commission_percentage: 0 },
                    { name: 'Chairs', commission_percentage: 0 },
                    { name: 'Cabinets', commission_percentage: 0 },
                ],
            },
        ],
    },
    {
        name: 'BEAUTY & PERSONAL CARE',
        commission_percentage: 0,
        children: [
            {
                name: 'Skincare',
                commission_percentage: 0,
                children: [
                    { name: 'Face Creams', commission_percentage: 0 },
                    { name: 'Face Wash', commission_percentage: 0 },
                    { name: 'Serums', commission_percentage: 0 },
                    { name: 'Sunscreen', commission_percentage: 0 },
                ],
            },
            {
                name: 'Makeup',
                commission_percentage: 0,
                children: [
                    { name: 'Foundation', commission_percentage: 0 },
                    { name: 'Lipstick', commission_percentage: 0 },
                    { name: 'Eye Makeup', commission_percentage: 0 },
                    { name: 'Makeup Tools', commission_percentage: 0 },
                ],
            },
            {
                name: 'Haircare',
                commission_percentage: 0,
                children: [
                    { name: 'Shampoo', commission_percentage: 0 },
                    { name: 'Conditioner', commission_percentage: 0 },
                    { name: 'Hair Oil', commission_percentage: 0 },
                    { name: 'Styling Tools', commission_percentage: 0 },
                ],
            },
        ],
    },
    {
        name: 'BABY & KIDS',
        commission_percentage: 0,
        children: [
            {
                name: 'Baby Essentials',
                commission_percentage: 0,
                children: [
                    { name: 'Diapers', commission_percentage: 0 },
                    { name: 'Feeding Bottles', commission_percentage: 0 },
                    { name: 'Baby Clothing', commission_percentage: 0 },
                    { name: 'Strollers', commission_percentage: 0 },
                ],
            },
            {
                name: 'Toys',
                commission_percentage: 0,
                children: [
                    { name: 'Educational Toys', commission_percentage: 0 },
                    { name: 'Dolls', commission_percentage: 0 },
                    { name: 'RC Toys', commission_percentage: 0 },
                    { name: 'Board Games', commission_percentage: 0 },
                ],
            },
        ],
    },
    {
        name: 'AUTOMOTIVE',
        commission_percentage: 0,
        children: [
            {
                name: 'Car Accessories',
                commission_percentage: 0,
                children: [
                    { name: 'Seat Covers', commission_percentage: 0 },
                    { name: 'Floor Mats', commission_percentage: 0 },
                    { name: 'Car Electronics', commission_percentage: 0 },
                    { name: 'Car Care', commission_percentage: 0 },
                ],
            },
        ],
    },
    {
        name: 'GROCERIES',
        commission_percentage: 0,
        children: [
            {
                name: 'Food Items',
                commission_percentage: 0,
                children: [
                    { name: 'Rice', commission_percentage: 0 },
                    { name: 'Spices', commission_percentage: 0 },
                    { name: 'Snacks', commission_percentage: 0 },
                    { name: 'Beverages', commission_percentage: 0 },
                ],
            },
        ],
    },
];

const ensureManagedCategoriesTable = async (client = pool) => {
    if (categoriesTableEnsured) return;

    await client.query(`
        CREATE TABLE IF NOT EXISTS managed_categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            parent_id INTEGER REFERENCES managed_categories(id) ON DELETE CASCADE,
            level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
            commission_percentage NUMERIC(8,2) NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await client.query(`ALTER TABLE managed_categories ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(8,2) NOT NULL DEFAULT 0;`);
    await client.query(`ALTER TABLE managed_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;`);
    await client.query(`ALTER TABLE managed_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`);
    await client.query(`ALTER TABLE managed_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_managed_categories_parent_id ON managed_categories(parent_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_managed_categories_level ON managed_categories(level);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_managed_categories_active ON managed_categories(is_active);`);

    categoriesTableEnsured = true;
};

const ensureCommissionSettingsTable = async (client = pool) => {
    if (commissionSettingsTableEnsured) return;

    await client.query(`
        CREATE TABLE IF NOT EXISTS commission_settings (
            setting_key VARCHAR(255) PRIMARY KEY,
            setting_value NUMERIC(8,2) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await client.query(`ALTER TABLE commission_settings ADD COLUMN IF NOT EXISTS setting_value NUMERIC(8,2) NOT NULL DEFAULT 0;`);
    await client.query(`ALTER TABLE commission_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_commission_settings_key ON commission_settings(setting_key);`);

    commissionSettingsTableEnsured = true;
};

const normalizeCommission = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const invalidateCategoryCaches = () => {
    managedCategoriesCache = {
        activeOnly: { expiresAt: 0, value: null },
        includeInactive: { expiresAt: 0, value: null },
    };
};

const invalidateCommissionCaches = () => {
    commissionValueCache = {
        global: { expiresAt: 0, value: null },
        manualEnabled: { expiresAt: 0, value: null },
    };
};

const seedCategoryNode = async (client, node, parentId = null, level = 1, sortOrder = 0) => {
    const inserted = await client.query(
        `INSERT INTO managed_categories (name, parent_id, level, commission_percentage, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id`,
        [node.name, parentId, level, normalizeCommission(node.commission_percentage), sortOrder]
    );

    const nextId = inserted.rows[0].id;
    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = 0; index < children.length; index += 1) {
        await seedCategoryNode(client, children[index], nextId, level + 1, index);
    }
};

const findCategoryByNameAndParent = async (client, name, parentId = null) => {
    const result = await client.query(
        `SELECT id, name, parent_id, level, commission_percentage, sort_order, is_active
         FROM managed_categories
         WHERE name = $1
           AND parent_id IS NOT DISTINCT FROM $2::int
         ORDER BY id ASC
         LIMIT 1`,
        [name, parentId]
    );
    return result.rows[0] || null;
};

const upsertCategoryNode = async (client, node, parentId = null, level = 1, sortOrder = 0) => {
    const existing = await findCategoryByNameAndParent(client, node.name, parentId);
    let categoryId = existing?.id || null;

    if (existing) {
        await client.query(
            `UPDATE managed_categories
             SET level = $1,
                 commission_percentage = $2,
                 sort_order = $3,
                 is_active = TRUE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [level, normalizeCommission(node.commission_percentage), sortOrder, existing.id]
        );
    } else {
        const inserted = await client.query(
            `INSERT INTO managed_categories (name, parent_id, level, commission_percentage, sort_order, is_active)
             VALUES ($1, $2, $3, $4, $5, TRUE)
             RETURNING id`,
            [node.name, parentId, level, normalizeCommission(node.commission_percentage), sortOrder]
        );
        categoryId = inserted.rows[0].id;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = 0; index < children.length; index += 1) {
        await upsertCategoryNode(client, children[index], categoryId, level + 1, index);
    }
};

const syncDefaultCategories = async (client = pool) => {
    if (categorySeedPromise) return categorySeedPromise;

    categorySeedPromise = (async () => {
        await client.query('BEGIN');
        try {
            const countResult = await client.query('SELECT COUNT(*)::int AS count FROM managed_categories');
            if ((countResult.rows[0]?.count || 0) === 0) {
                for (let index = 0; index < DEFAULT_CATEGORY_TREE.length; index += 1) {
                    await seedCategoryNode(client, DEFAULT_CATEGORY_TREE[index], null, 1, index);
                }
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    })();

    try {
        return await categorySeedPromise;
    } finally {
        categorySeedPromise = null;
    }
};

const buildCategoryTree = (rows) => {
    const byId = new Map();
    rows.forEach((row) => {
        byId.set(Number(row.id), {
            id: Number(row.id),
            name: row.name,
            parent_id: row.parent_id ? Number(row.parent_id) : null,
            level: Number(row.level || 1),
            commission_percentage: Number(row.commission_percentage || 0),
            sort_order: Number(row.sort_order || 0),
            is_active: row.is_active !== false,
            children: [],
        });
    });

    const roots = [];
    byId.forEach((node) => {
        if (node.parent_id && byId.has(node.parent_id)) {
            byId.get(node.parent_id).children.push(node);
            return;
        }
        roots.push(node);
    });

    const sortNodes = (nodes) => nodes
        .sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name))
        .map((node) => ({
            ...node,
            children: sortNodes(node.children || []),
        }));

    return sortNodes(roots);
};

const getManagedCategories = async (includeInactive = false) => {
    const cacheBucket = includeInactive ? managedCategoriesCache.includeInactive : managedCategoriesCache.activeOnly;
    if (cacheBucket.value && cacheBucket.expiresAt > Date.now()) {
        return cacheBucket.value;
    }

    const client = await pool.connect();
    try {
        await ensureManagedCategoriesTable(client);
        await syncDefaultCategories(client);

        const result = await client.query(
            `SELECT id, name, parent_id, level, commission_percentage, sort_order, is_active
             FROM managed_categories
             ${includeInactive ? '' : 'WHERE is_active = TRUE'}
             ORDER BY level ASC, sort_order ASC, name ASC`
        );

        const tree = buildCategoryTree(result.rows);
        if (PUBLIC_CATEGORY_CACHE_TTL_MS > 0) {
            const nextCache = {
                expiresAt: Date.now() + PUBLIC_CATEGORY_CACHE_TTL_MS,
                value: tree,
            };
            if (includeInactive) {
                managedCategoriesCache.includeInactive = nextCache;
            } else {
                managedCategoriesCache.activeOnly = nextCache;
            }
        }

        return tree;
    } finally {
        client.release();
    }
};

const findCategoryById = async (client, id) => {
    const result = await client.query(
        `SELECT id, name, parent_id, level, commission_percentage, sort_order, is_active
         FROM managed_categories
         WHERE id = $1
         LIMIT 1`,
        [id]
    );
    return result.rows[0] || null;
};

const assertAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type === 'admin';
};

const updateRelatedProductCategories = async (client, level, oldName, nextName) => {
    const column = level === 1 ? 'category' : level === 2 ? 'sub_category' : 'level3_category';
    await client.query(`UPDATE market SET ${column} = $1 WHERE ${column} = $2`, [nextName, oldName]);
};

const getGlobalCategoryCommissionValue = async (client = pool) => {
    if (client === pool && commissionValueCache.global.value !== null && commissionValueCache.global.expiresAt > Date.now()) {
        return commissionValueCache.global.value;
    }
    await ensureCommissionSettingsTable(client);

    const result = await client.query(
        `SELECT setting_value
         FROM commission_settings
         WHERE setting_key = $1
         LIMIT 1`,
        [GLOBAL_CATEGORY_COMMISSION_KEY]
    );

    if (result.rows.length === 0) {
        await client.query(
            `INSERT INTO commission_settings (setting_key, setting_value)
             VALUES ($1, 0)
             ON CONFLICT (setting_key) DO NOTHING`,
            [GLOBAL_CATEGORY_COMMISSION_KEY]
        );
        if (client === pool && PUBLIC_COMMISSION_CACHE_TTL_MS > 0) {
            commissionValueCache.global = { value: 0, expiresAt: Date.now() + PUBLIC_COMMISSION_CACHE_TTL_MS };
        }
        return 0;
    }

    const value = Number(result.rows[0]?.setting_value || 0);
    if (client === pool && PUBLIC_COMMISSION_CACHE_TTL_MS > 0) {
        commissionValueCache.global = { value, expiresAt: Date.now() + PUBLIC_COMMISSION_CACHE_TTL_MS };
    }
    return value;
};

const getManualCategoryCommissionEnabledValue = async (client = pool) => {
    if (client === pool && commissionValueCache.manualEnabled.value !== null && commissionValueCache.manualEnabled.expiresAt > Date.now()) {
        return commissionValueCache.manualEnabled.value;
    }
    await ensureCommissionSettingsTable(client);

    const result = await client.query(
        `SELECT setting_value
         FROM commission_settings
         WHERE setting_key = $1
         LIMIT 1`,
        [MANUAL_CATEGORY_COMMISSION_ENABLED_KEY]
    );

    if (result.rows.length === 0) {
        await client.query(
            `INSERT INTO commission_settings (setting_key, setting_value)
             VALUES ($1, 0)
             ON CONFLICT (setting_key) DO NOTHING`,
            [MANUAL_CATEGORY_COMMISSION_ENABLED_KEY]
        );
        if (client === pool && PUBLIC_COMMISSION_CACHE_TTL_MS > 0) {
            commissionValueCache.manualEnabled = { value: false, expiresAt: Date.now() + PUBLIC_COMMISSION_CACHE_TTL_MS };
        }
        return false;
    }

    const value = Number(result.rows[0]?.setting_value || 0) > 0;
    if (client === pool && PUBLIC_COMMISSION_CACHE_TTL_MS > 0) {
        commissionValueCache.manualEnabled = { value, expiresAt: Date.now() + PUBLIC_COMMISSION_CACHE_TTL_MS };
    }
    return value;
};

exports.getCategoryTree = async (req, res) => {
    try {
        const includeInactive = String(req.query.includeInactive || '').toLowerCase() === '1' || String(req.query.includeInactive || '').toLowerCase() === 'true';
        const categories = await getManagedCategories(includeInactive);
        res.status(200).json({ success: true, categories });
    } catch (error) {
        console.error('getCategoryTree error:', error);
        res.status(500).json({ success: false, message: 'Failed to load categories' });
    }
};

exports.getAdminCategoryTree = async (req, res) => {
    try {
        const isAdmin = await assertAdmin(req.user?.id);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const categories = await getManagedCategories(true);
        res.status(200).json({ success: true, categories });
    } catch (error) {
        console.error('getAdminCategoryTree error:', error);
        res.status(500).json({ success: false, message: 'Failed to load admin categories' });
    }
};

exports.getGlobalCategoryCommission = async (req, res) => {
    try {
        const commissionPercentage = await getGlobalCategoryCommissionValue(pool);
        res.status(200).json({
            success: true,
            settingKey: GLOBAL_CATEGORY_COMMISSION_KEY,
            commissionPercentage,
        });
    } catch (error) {
        console.error('getGlobalCategoryCommission error:', error);
        res.status(500).json({ success: false, message: 'Failed to load global category commission' });
    }
};

exports.getManualCategoryCommissionEnabled = async (req, res) => {
    try {
        const enabled = await getManualCategoryCommissionEnabledValue(pool);
        res.status(200).json({
            success: true,
            settingKey: MANUAL_CATEGORY_COMMISSION_ENABLED_KEY,
            enabled,
        });
    } catch (error) {
        console.error('getManualCategoryCommissionEnabled error:', error);
        res.status(500).json({ success: false, message: 'Failed to load manual category commission setting' });
    }
};

exports.setGlobalCategoryCommission = async (req, res) => {
    const client = await pool.connect();
    try {
        const isAdmin = await assertAdmin(req.user?.id);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const commissionPercentage = normalizeCommission(
            req.body?.commissionPercentage ?? req.body?.setting_value ?? req.body?.value
        );

        await client.query('BEGIN');
        await ensureCommissionSettingsTable(client);
        await client.query(
            `INSERT INTO commission_settings (setting_key, setting_value, updated_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (setting_key)
             DO UPDATE SET
                 setting_value = EXCLUDED.setting_value,
                 updated_at = CURRENT_TIMESTAMP`,
            [GLOBAL_CATEGORY_COMMISSION_KEY, commissionPercentage]
        );
        await client.query('COMMIT');
        invalidateCommissionCaches();

        res.status(200).json({
            success: true,
            settingKey: GLOBAL_CATEGORY_COMMISSION_KEY,
            commissionPercentage,
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('setGlobalCategoryCommission error:', error);
        res.status(500).json({ success: false, message: 'Failed to save global category commission' });
    } finally {
        client.release();
    }
};

exports.setManualCategoryCommissionEnabled = async (req, res) => {
    const client = await pool.connect();
    try {
        const isAdmin = await assertAdmin(req.user?.id);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const enabledInput = req.body?.enabled ?? req.body?.setting_value ?? req.body?.value;
        const normalized = String(enabledInput ?? '').toLowerCase();
        const isEnabled = normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';

        await client.query('BEGIN');
        await ensureCommissionSettingsTable(client);
        await client.query(
            `INSERT INTO commission_settings (setting_key, setting_value, updated_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (setting_key)
             DO UPDATE SET
                 setting_value = EXCLUDED.setting_value,
                 updated_at = CURRENT_TIMESTAMP`,
            [MANUAL_CATEGORY_COMMISSION_ENABLED_KEY, isEnabled ? 1 : 0]
        );
        await client.query('COMMIT');
        invalidateCommissionCaches();

        res.status(200).json({
            success: true,
            settingKey: MANUAL_CATEGORY_COMMISSION_ENABLED_KEY,
            enabled: isEnabled,
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('setManualCategoryCommissionEnabled error:', error);
        res.status(500).json({ success: false, message: 'Failed to save manual category commission setting' });
    } finally {
        client.release();
    }
};

exports.createCategory = async (req, res) => {
    const client = await pool.connect();
    try {
        const isAdmin = await assertAdmin(req.user?.id);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const name = String(req.body?.name || '').trim();
        const parentIdRaw = req.body?.parentId ?? null;
        const commissionPercentage = normalizeCommission(req.body?.commissionPercentage);
        const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
        const isActive = req.body?.isActive === undefined ? true : String(req.body.isActive).toLowerCase() !== 'false';

        if (!name) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        await client.query('BEGIN');
        await ensureManagedCategoriesTable(client);

        let parentId = null;
        let level = 1;
        if (parentIdRaw !== null && parentIdRaw !== '' && parentIdRaw !== undefined) {
            parentId = Number(parentIdRaw);
            const parent = await findCategoryById(client, parentId);
            if (!parent) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Parent category not found' });
            }
            level = Number(parent.level) + 1;
            if (level > 3) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Categories support only up to level 3' });
            }
        }

        const result = await client.query(
            `INSERT INTO managed_categories (name, parent_id, level, commission_percentage, sort_order, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, parent_id, level, commission_percentage, sort_order, is_active`,
            [name, parentId, level, commissionPercentage, sortOrder, isActive]
        );

        await client.query('COMMIT');
        invalidateCategoryCaches();
        const categories = await getManagedCategories(true);
        res.status(201).json({ success: true, category: result.rows[0], categories });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('createCategory error:', error);
        res.status(500).json({ success: false, message: 'Failed to create category' });
    } finally {
        client.release();
    }
};

exports.updateCategory = async (req, res) => {
    const client = await pool.connect();
    try {
        const isAdmin = await assertAdmin(req.user?.id);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const categoryId = Number(req.params.id);
        const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
        const commissionPercentage = req.body?.commissionPercentage !== undefined ? normalizeCommission(req.body.commissionPercentage) : undefined;
        const sortOrder = req.body?.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined;
        const isActive = req.body?.isActive !== undefined ? String(req.body.isActive).toLowerCase() !== 'false' : undefined;

        const existing = await findCategoryById(client, categoryId);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        await client.query('BEGIN');
        await ensureManagedCategoriesTable(client);

        const nextName = name ?? existing.name;
        const nextCommission = commissionPercentage !== undefined ? commissionPercentage : normalizeCommission(existing.commission_percentage);
        const nextSortOrder = sortOrder !== undefined ? sortOrder : Number(existing.sort_order || 0);
        const nextActive = isActive !== undefined ? isActive : existing.is_active;

        await client.query(
            `UPDATE managed_categories
             SET name = $1,
                 commission_percentage = $2,
                 sort_order = $3,
                 is_active = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5`,
            [nextName, nextCommission, nextSortOrder, nextActive, categoryId]
        );

        if (name !== undefined && nextName !== existing.name) {
            await updateRelatedProductCategories(client, Number(existing.level), existing.name, nextName);
        }

        await client.query('COMMIT');
        invalidateCategoryCaches();
        const categories = await getManagedCategories(true);
        res.status(200).json({ success: true, categories });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('updateCategory error:', error);
        res.status(500).json({ success: false, message: 'Failed to update category' });
    } finally {
        client.release();
    }
};

exports.deleteCategory = async (req, res) => {
    const client = await pool.connect();
    try {
        const isAdmin = await assertAdmin(req.user?.id);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const categoryId = Number(req.params.id);
        const existing = await findCategoryById(client, categoryId);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }

        await client.query('BEGIN');
        await ensureManagedCategoriesTable(client);

        const descendants = await client.query(
            `WITH RECURSIVE tree AS (
                SELECT id FROM managed_categories WHERE id = $1
                UNION ALL
                SELECT c.id FROM managed_categories c
                INNER JOIN tree t ON c.parent_id = t.id
            )
            SELECT id FROM tree`,
            [categoryId]
        );
        const ids = descendants.rows.map((row) => Number(row.id));
        await client.query(
            `UPDATE managed_categories
             SET is_active = FALSE,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ANY($1::int[])`,
            [ids]
        );

        await client.query('COMMIT');
        invalidateCategoryCaches();
        const categories = await getManagedCategories(true);
        res.status(200).json({ success: true, categories });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('deleteCategory error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete category' });
    } finally {
        client.release();
    }
};
