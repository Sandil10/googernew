const pool = require('../../config/database');

let cartSchemaReady = false;
let cartSchemaReadyPromise = null;

const ensureCartSchema = async () => {
    if (cartSchemaReady) return;
    if (cartSchemaReadyPromise) return cartSchemaReadyPromise;

    cartSchemaReadyPromise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cart_items (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                price DECIMAL(15, 2) NOT NULL DEFAULT 0,
                promo_price DECIMAL(15, 2),
                image_url TEXT,
                quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
                size TEXT,
                color TEXT,
                variant_index INTEGER,
                selected BOOLEAN NOT NULL DEFAULT TRUE,
                seller_id TEXT,
                shipping_info JSONB,
                product_discount DECIMAL(10, 2) DEFAULT 0,
                selected_shipping_country TEXT,
                payment_methods JSONB,
                reseller_ref TEXT,
                resell_commission_percentage DECIMAL(10, 2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS reseller_ref TEXT`);
        await pool.query(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS resell_commission_percentage DECIMAL(10, 2) DEFAULT 0`);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_cart_items_user_id
            ON cart_items(user_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_cart_items_user_product
            ON cart_items(user_id, product_id);
        `);

        cartSchemaReady = true;
    })();

    try {
        await cartSchemaReadyPromise;
    } finally {
        cartSchemaReadyPromise = null;
    }
};

module.exports = {
    ensureCartSchema,
};
