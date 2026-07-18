const crypto = require('crypto');
const pool = require('../../config/database');
const {
    buildHomeReachGateSql,
    buildHomeReachMetricsSql,
    buildHomeReachOrderSql,
} = require('../../shared/feed/homeReachAlgorithm');

let schemaReady = false;
let googShareCodesReady = false;
let savedGoogsReady = false;

const SHARE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const UPPERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERS = 'abcdefghijklmnopqrstuvwxyz';
const SHARE_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;
const GOOG_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz';

const GOOG_HOME_SCORE_SQL = `(COALESCE(gp.likes_count, 0) * 3 + COALESCE(gp.comments_count, 0) * 8 + COALESCE(gp.shares_count, 0) * 15)`;

const hash32 = (input, seed = 0x811c9dc5) => {
    let hash = seed >>> 0;
    const value = String(input || '');
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash >>> 0;
};

const positiveModulo = (value, modulus) => {
    const normalized = Number(value) >>> 0;
    return normalized % modulus;
};

const buildShortShareCode = (type, target, length = 8) => {
    const normalizedTarget = String(target || '').trim();
    if (!normalizedTarget) return '';
    const payload = `${type}:${normalizedTarget}`;
    let stateA = hash32(payload, 0x9e3779b9);
    let stateB = hash32(payload, 0x85ebca6b);

    const chars = [];
    for (let index = 0; index < length; index += 1) {
        stateA = (Math.imul(stateA ^ (stateA >>> 15), 2246822519) + stateB + index) >>> 0;
        stateB = (Math.imul(stateB ^ (stateB >>> 13), 3266489917) + stateA + index * 17) >>> 0;
        const nextIndex = positiveModulo(stateA ^ stateB, SHARE_ALPHABET.length);
        chars.push(SHARE_ALPHABET[nextIndex]);
    }

    const codeChars = [...chars];
    const hasDigit = codeChars.some((char) => DIGITS.includes(char));
    const hasUpper = codeChars.some((char) => UPPERS.includes(char));
    const hasLower = codeChars.some((char) => LOWERS.includes(char));

    if (!hasDigit) codeChars[positiveModulo(stateA + 1, length)] = DIGITS[positiveModulo(stateB, DIGITS.length)];
    if (!hasUpper) codeChars[positiveModulo(stateB + 3, length)] = UPPERS[positiveModulo(stateA, UPPERS.length)];
    if (!hasLower) codeChars[positiveModulo(stateA + stateB + 5, length)] = LOWERS[positiveModulo(stateA ^ stateB, LOWERS.length)];

    return codeChars.join('');
};

const generateRandomGoogShareCode = (length = 8) => {
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let index = 0; index < length; index += 1) {
        code += GOOG_CODE_ALPHABET[bytes[index] % GOOG_CODE_ALPHABET.length];
    }
    return code;
};

const pickGoogShareCode = async (postId) => {
    const deterministic = buildShortShareCode('g', postId, 8);
    const deterministicResult = await pool.query(
        'SELECT id FROM goog_posts WHERE LOWER(share_code) = LOWER($1) LIMIT 1',
        [deterministic]
    );
    if (!deterministicResult.rows.length || Number(deterministicResult.rows[0].id) === Number(postId)) {
        return deterministic;
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = generateRandomGoogShareCode(8);
        const existsResult = await pool.query(
            'SELECT id FROM goog_posts WHERE LOWER(share_code) = LOWER($1) LIMIT 1',
            [candidate]
        );
        if (!existsResult.rows.length) return candidate;
    }

    throw new Error('Unable to generate unique Goog share code');
};

const ensureGoogShareCodes = async () => {
    if (googShareCodesReady) return;

    await pool.query(`ALTER TABLE goog_posts ADD COLUMN IF NOT EXISTS share_code VARCHAR(32);`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS goog_share_aliases (
            id SERIAL PRIMARY KEY,
            alias_code VARCHAR(32) UNIQUE NOT NULL,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_goog_share_aliases_alias_code
        ON goog_share_aliases(alias_code);
    `);

    const rememberGoogShareAlias = async (aliasCode, googId) => {
        const normalizedAlias = String(aliasCode || '').trim();
        if (!normalizedAlias || SHARE_CODE_PATTERN.test(normalizedAlias) || !googId) return;

        await pool.query(
            `INSERT INTO goog_share_aliases (alias_code, goog_id)
             VALUES ($1, $2)
             ON CONFLICT (alias_code) DO UPDATE SET goog_id = EXCLUDED.goog_id`,
            [normalizedAlias, googId]
        );
    };

    const invalidResult = await pool.query(`
        SELECT id, share_code
        FROM goog_posts
        WHERE share_code IS NULL
           OR share_code = ''
           OR share_code !~ '^[0-9A-Za-z]{8}$'
    `);

    for (const row of invalidResult.rows || []) {
        await rememberGoogShareAlias(row.share_code, row.id);
        const code = await pickGoogShareCode(row.id);
        await pool.query('UPDATE goog_posts SET share_code = $1 WHERE id = $2', [code, row.id]);
    }

    const duplicateResult = await pool.query(`
        SELECT id
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY LOWER(share_code) ORDER BY id) AS rn
            FROM goog_posts
            WHERE share_code ~ '^[0-9A-Za-z]{8}$'
        ) ranked
        WHERE rn > 1
    `);

    for (const row of duplicateResult.rows || []) {
        const code = await pickGoogShareCode(row.id);
        await pool.query('UPDATE goog_posts SET share_code = $1 WHERE id = $2', [code, row.id]);
    }

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_goog_posts_share_code_unique
        ON goog_posts (LOWER(share_code))
        WHERE share_code IS NOT NULL AND share_code <> ''
    `);

    googShareCodesReady = true;
};

const ensureGoogSchema = async () => {
    if (schemaReady) return;

    await pool.query(`CREATE TABLE IF NOT EXISTS goog_posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        text_color VARCHAR(20) DEFAULT '#FFFFFF',
        share_code VARCHAR(32),
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0,
        shares_count INTEGER DEFAULT 0,
        reports INTEGER DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`).catch(() => {});

    await pool.query(`ALTER TABLE goog_posts ALTER COLUMN text TYPE TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE goog_posts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`).catch(() => {});
    await pool.query(`ALTER TABLE goog_posts ADD COLUMN IF NOT EXISTS reports INTEGER DEFAULT 0`).catch(() => {});

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id SERIAL PRIMARY KEY,
            subscriber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subscribed_to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (subscriber_id, subscribed_to_id)
        )
    `).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS goog_likes (
        id SERIAL PRIMARY KEY,
        goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (goog_id, user_id)
    )`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS goog_comments (
        id SERIAL PRIMARY KEY,
        goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        comment TEXT NOT NULL,
        parent_id INTEGER REFERENCES goog_comments(id) ON DELETE CASCADE,
        likes INTEGER DEFAULT 0,
        dislikes INTEGER DEFAULT 0,
        reports INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS goog_shares (
        id SERIAL PRIMARY KEY,
        goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip_address VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS goog_views (
        id SERIAL PRIMARY KEY,
        goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        viewer_key TEXT,
        ip_address VARCHAR(255),
        last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS goog_subscribes (
        id SERIAL NOT NULL PRIMARY KEY,
        goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (goog_id, user_id)
    )`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS goog_share_logs (
        id SERIAL NOT NULL PRIMARY KEY,
        goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip_address VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (goog_id, user_id)
    )`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS goog_reports (
        id SERIAL NOT NULL PRIMARY KEY,
        goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reason VARCHAR(200) NOT NULL,
        custom_reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (goog_id, user_id)
    )`).catch(() => {});

    await pool.query(`ALTER TABLE goog_reports ALTER COLUMN reason TYPE VARCHAR(200)`).catch(() => {});
    await pool.query(`ALTER TABLE goog_views ADD COLUMN IF NOT EXISTS viewer_key TEXT`).catch(() => {});

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_posts_created_at ON goog_posts(created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_posts_user_id ON goog_posts(user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscriber_id ON user_subscriptions(subscriber_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscribed_to_id ON user_subscriptions(subscribed_to_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_likes_post_user ON goog_likes(goog_id, user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_comments_post ON goog_comments(goog_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_shares_post ON goog_shares(goog_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_views_post_user ON goog_views(goog_id, user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_views_post_viewer_key ON goog_views(goog_id, viewer_key)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_views_post_ip ON goog_views(goog_id, ip_address)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_subscribes_post_user ON goog_subscribes(goog_id, user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_goog_reports_post ON goog_reports(goog_id)`).catch(() => {});

    await ensureGoogShareCodes();
    schemaReady = true;
};

const ensureSavedGoogsSchema = async () => {
    if (savedGoogsReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS saved_googs (
            id       SERIAL PRIMARY KEY,
            user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            goog_id  INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, goog_id)
        );
        CREATE INDEX IF NOT EXISTS idx_saved_googs_user ON saved_googs(user_id, saved_at DESC);
    `);
    savedGoogsReady = true;
};

const googHomeReachMetricsSql = buildHomeReachMetricsSql({
    targetAlias: 'gp',
    viewsTable: 'goog_views',
    viewTargetColumn: 'goog_id',
    likesTable: 'goog_likes',
    likeTargetColumn: 'goog_id',
    ageDays: 3,
    initialWindowMinutes: 5,
    stageSize: 8,
    requiredLikes: 3,
    viewTimestampColumn: 'last_viewed_at',
});

const selectPostsSql = `
    SELECT
        gp.*,
        u.username,
        u.full_name,
        u.user_type,
        u.profile_picture,
        COALESCE(home_reach.unique_reach_count, 0)::int AS home_unique_reach_count,
        COALESCE(home_reach.stage_200_likes, 0)::int AS home_stage_200_likes,
        COALESCE(home_reach.stage_500_new_likes, 0)::int AS home_stage_500_new_likes,
        COALESCE(home_reach.stage_2000_new_likes, 0)::int AS home_stage_2000_new_likes,
        COALESCE(home_reach.stage_10000_new_likes, 0)::int AS home_stage_10000_new_likes,
        COALESCE(home_reach.stage_50000_new_likes, 0)::int AS home_stage_50000_new_likes,
        home_reach.home_reach_stage,
        home_reach.home_reach_cap,
        COALESCE(home_reach.home_can_reach, false) AS home_can_reach,
        CASE WHEN $1::INTEGER IS NULL THEN FALSE
             ELSE EXISTS (
                SELECT 1 FROM goog_likes gl
                WHERE gl.goog_id = gp.id AND gl.user_id = $1
             )
        END AS user_liked
    FROM goog_posts gp
    JOIN users u ON u.id = gp.user_id
    ${googHomeReachMetricsSql}
    WHERE gp.is_active = true
      AND COALESCE(u.is_deactivated, false) = false
      AND COALESCE(u.status, 'Active') <> 'Deactivated'
`;

const fetchPosts = async (userId) => pool.query(
    `${selectPostsSql}
      AND ${buildHomeReachGateSql('home_reach')}
     ORDER BY
        ${buildHomeReachOrderSql('home_reach')},
        gp.likes_count DESC,
        gp.comments_count DESC,
        gp.shares_count DESC,
        gp.created_at DESC
     LIMIT 100`,
    [userId]
);

const fetchPostById = async (userId, id) => pool.query(`${selectPostsSql} AND gp.id = $2`, [userId, id]);

const fetchUserPosts = async (userId, targetUserId) => pool.query(
    `${selectPostsSql} AND gp.user_id = $2 ORDER BY gp.created_at DESC`,
    [userId, targetUserId]
);

const fetchSavedGoogs = async (userId) => pool.query(
    `SELECT gp.*, u.username, u.full_name, u.user_type, u.profile_picture, sg.saved_at,
            EXISTS(SELECT 1 FROM goog_likes gl WHERE gl.goog_id = gp.id AND gl.user_id = $1) AS user_liked
     FROM saved_googs sg
     JOIN goog_posts gp ON gp.id = sg.goog_id
     JOIN users u ON u.id = gp.user_id
     WHERE sg.user_id = $1
      AND COALESCE(gp.is_active, true) = true
      AND COALESCE(u.is_deactivated, false) = false
      AND COALESCE(u.status, 'Active') <> 'Deactivated'
     ORDER BY sg.saved_at DESC`,
    [userId]
);

const fetchSavedStatus = async (userId) => pool.query(
    'SELECT goog_id FROM saved_googs WHERE user_id = $1',
    [userId]
);

module.exports = {
    GOOG_HOME_SCORE_SQL,
    SHARE_CODE_PATTERN,
    buildShortShareCode,
    ensureGoogShareCodes,
    ensureGoogSchema,
    ensureSavedGoogsSchema,
    fetchPostById,
    fetchPosts,
    fetchSavedGoogs,
    fetchSavedStatus,
    fetchUserPosts,
    pickGoogShareCode,
};
