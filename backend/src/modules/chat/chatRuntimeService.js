const pool = require('../../config/database');
const { getUserPlanLimits, getUserSubscriptionFeatures } = require('../../utils/planLimits');
const { normalizeRole } = require('../../../../../shared/contracts/userRoles');

const lastPruneAt = new Map();
const PRUNE_COOLDOWN_MS = 10 * 1000;
const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'sticker', 'voice_tts', 'voice']);
const DAILY_CHAT_MEDIA_LIMIT = 10;
const CHAT_MEDIA_MAX_BYTES = 3 * 1024 * 1024;
const CHAT_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const PRIVILEGED_CHAT_ROLES = new Set(['admin', 'superadmin', 'super_admin', 'employee', 'administrator']);
const ASSIGNMENT_NOTICE_PREFIX = 'Assigned admin:';

let tablesReadyPromise = null;

const getDataUrlByteSize = (value) => {
    if (typeof value !== 'string') return 0;
    const base64 = value.split(',')[1] || '';
    return Math.ceil((base64.length * 3) / 4);
};

const normalizeProductStatusId = (value) => {
    const normalized = String(value || '').trim();
    return normalized ? normalized.slice(0, 120) : null;
};

const isPrivilegedChatRole = (value) => PRIVILEGED_CHAT_ROLES.has(normalizeRole(value));
const isSuperAdminRole = (value) => {
    const normalized = normalizeRole(value);
    return normalized === 'superadmin' || normalized === 'super_admin';
};

const getUserSummaryById = async (userId) => {
    const numericUserId = Number(userId);
    if (!numericUserId) return null;

    const result = await pool.query(
        `
            SELECT id, username, full_name, profile_picture, user_type
            FROM users
            WHERE id = $1
            LIMIT 1
        `,
        [numericUserId]
    );

    return result.rows[0] || null;
};

const getProductStatusContext = async (productStatusId) => {
    const normalizedProductStatusId = normalizeProductStatusId(productStatusId);
    if (!normalizedProductStatusId) return null;

    const result = await pool.query(
        `
            SELECT
                COALESCE(NULLIF(TRIM(MAX(order_number)), ''), CAST(MIN(id) AS TEXT)) AS product_status_id,
                MIN(id)::int AS order_id,
                MAX(order_number) AS order_number,
                MIN(buyer_id)::int AS buyer_id,
                MIN(seller_id)::int AS seller_id
            FROM orders
            WHERE COALESCE(NULLIF(TRIM(order_number), ''), CAST(id AS TEXT)) = $1
               OR CAST(id AS TEXT) = $1
        `,
        [normalizedProductStatusId]
    );

    return result.rows[0] || null;
};

const getProductStatusAssignment = async (productStatusId) => {
    const normalizedProductStatusId = normalizeProductStatusId(productStatusId);
    if (!normalizedProductStatusId) return null;

    const result = await pool.query(
        `
            SELECT
                a.*,
                admin_user.username AS assigned_admin_username,
                admin_user.full_name AS assigned_admin_full_name,
                admin_user.profile_picture AS assigned_admin_profile_picture,
                admin_user.user_type AS assigned_admin_user_type,
                assigner.username AS assigned_by_username,
                assigner.full_name AS assigned_by_full_name
            FROM product_status_chat_assignments a
            JOIN users admin_user ON admin_user.id = a.assigned_admin_id
            LEFT JOIN users assigner ON assigner.id = a.assigned_by_user_id
            WHERE a.product_status_id = $1
            LIMIT 1
        `,
        [normalizedProductStatusId]
    );

    return result.rows[0] || null;
};

const getTopupRequestContext = async (topupRequestId) => {
    const numericRequestId = Number(topupRequestId);
    if (!numericRequestId) return null;

    const result = await pool.query(
        `
            SELECT id, user_id, payment_method_name, amount, status, created_at
            FROM coin_requests
            WHERE id = $1
            LIMIT 1
        `,
        [numericRequestId]
    );

    return result.rows[0] || null;
};

const getTopupRequestAssignment = async (topupRequestId) => {
    const numericRequestId = Number(topupRequestId);
    if (!numericRequestId) return null;

    const result = await pool.query(
        `
            SELECT
                a.*,
                admin_user.username AS assigned_admin_username,
                admin_user.full_name AS assigned_admin_full_name,
                admin_user.profile_picture AS assigned_admin_profile_picture,
                admin_user.user_type AS assigned_admin_user_type,
                assigner.username AS assigned_by_username,
                assigner.full_name AS assigned_by_full_name
            FROM topup_request_chat_assignments a
            JOIN users admin_user ON admin_user.id = a.assigned_admin_id
            LEFT JOIN users assigner ON assigner.id = a.assigned_by_user_id
            WHERE a.topup_request_id = $1
            LIMIT 1
        `,
        [numericRequestId]
    );

    return result.rows[0] || null;
};

const resolveProductStatusAccess = async ({ userId, participantId = null, productStatusId }) => {
    const normalizedProductStatusId = normalizeProductStatusId(productStatusId);
    if (!normalizedProductStatusId) return null;

    const [userRow, participantRow, context, assignment] = await Promise.all([
        getUserSummaryById(userId),
        participantId ? getUserSummaryById(participantId) : Promise.resolve(null),
        getProductStatusContext(normalizedProductStatusId),
        getProductStatusAssignment(normalizedProductStatusId),
    ]);

    if (!userRow) {
        const err = new Error('Authentication required.');
        err.statusCode = 401;
        throw err;
    }

    if (!context) {
        const err = new Error('Product status record not found.');
        err.statusCode = 404;
        throw err;
    }

    const numericUserId = Number(userId);
    const numericParticipantId = participantId ? Number(participantId) : null;
    const userRole = normalizeRole(userRow.user_type);
    const participantRole = participantRow ? normalizeRole(participantRow.user_type) : null;
    const isSuperAdmin = isSuperAdminRole(userRole);
    const isPrivileged = isPrivilegedChatRole(userRole);
    const buyerId = Number(context.buyer_id || 0);
    const sellerId = Number(context.seller_id || 0);
    const assignedAdminId = Number(assignment?.assigned_admin_id || 0) || null;
    const participantIds = new Set([buyerId, sellerId, assignedAdminId].filter(Boolean));

    const isBuyer = buyerId === numericUserId;
    const isSeller = sellerId === numericUserId;
    const isAssignedAdmin = assignedAdminId === numericUserId;

    if (!isBuyer && !isSeller && !isAssignedAdmin && !isSuperAdmin) {
        const err = new Error('You are not allowed to access this product-status chat.');
        err.statusCode = 403;
        throw err;
    }

    if (numericParticipantId && !participantRow) {
        const err = new Error('Chat participant not found.');
        err.statusCode = 404;
        throw err;
    }

    if (numericParticipantId) {
        if (assignment) {
            if (isBuyer || isSeller) {
                const participantIsSupportAlias = isSuperAdminRole(participantRole);
                if (numericParticipantId !== assignedAdminId && !participantIsSupportAlias) {
                    const err = new Error('This order chat is handled by the assigned admin.');
                    err.statusCode = 403;
                    throw err;
                }
            } else if (isAssignedAdmin || isSuperAdmin) {
                if (!participantIds.has(numericParticipantId) || numericParticipantId === assignedAdminId) {
                    const err = new Error('Assigned order chats can only target the buyer or seller.');
                    err.statusCode = 403;
                    throw err;
                }
            }
        } else if (!isSuperAdmin && isPrivileged && !isBuyer && !isSeller) {
            if (!participantIds.has(numericParticipantId)) {
                const err = new Error('Invalid participant for this product-status chat.');
                err.statusCode = 403;
                throw err;
            }
        }

        if ((isBuyer || isSeller) && !isSuperAdmin && participantIds.has(numericParticipantId) && numericParticipantId === numericUserId) {
            const err = new Error('Invalid participant selected.');
            err.statusCode = 400;
            throw err;
        }
    }

    return {
        normalizedProductStatusId,
        context,
        assignment,
        user: userRow,
        participant: participantRow,
        buyerId,
        sellerId,
        assignedAdminId,
        isBuyer,
        isSeller,
        isAssignedAdmin,
        isPrivileged,
        isSuperAdmin,
        participantRole,
    };
};

const resolveTopupRequestAccess = async ({ userId, participantId = null, topupRequestId }) => {
    const numericRequestId = Number(topupRequestId);
    if (!numericRequestId) return null;

    const [userRow, participantRow, context, assignment] = await Promise.all([
        getUserSummaryById(userId),
        participantId ? getUserSummaryById(participantId) : Promise.resolve(null),
        getTopupRequestContext(numericRequestId),
        getTopupRequestAssignment(numericRequestId),
    ]);

    if (!userRow) {
        const err = new Error('Authentication required.');
        err.statusCode = 401;
        throw err;
    }

    if (!context) {
        const err = new Error('Top-up request not found.');
        err.statusCode = 404;
        throw err;
    }

    const numericUserId = Number(userId);
    const numericParticipantId = participantId ? Number(participantId) : null;
    const userRole = normalizeRole(userRow.user_type);
    const isSuperAdmin = isSuperAdminRole(userRole);
    const isPrivileged = isPrivilegedChatRole(userRole);
    const requestUserId = Number(context.user_id || 0);
    const assignedAdminId = Number(assignment?.assigned_admin_id || 0) || null;

    const isRequestUser = requestUserId === numericUserId;
    const isAssignedAdmin = assignedAdminId === numericUserId;

    if (!isRequestUser && !isAssignedAdmin && !isSuperAdmin) {
        const err = new Error('You are not allowed to access this top-up chat.');
        err.statusCode = 403;
        throw err;
    }

    if (numericParticipantId && !participantRow) {
        const err = new Error('Chat participant not found.');
        err.statusCode = 404;
        throw err;
    }

    if (numericParticipantId) {
        if (assignment) {
            if (isRequestUser) {
                if (numericParticipantId !== assignedAdminId) {
                    const err = new Error('This top-up chat is handled by the assigned admin.');
                    err.statusCode = 403;
                    throw err;
                }
            } else if (isAssignedAdmin || isSuperAdmin) {
                if (numericParticipantId !== requestUserId) {
                    const err = new Error('Assigned top-up chats can only target the requesting user.');
                    err.statusCode = 403;
                    throw err;
                }
            }
        } else if (!isSuperAdmin && isPrivileged && !isRequestUser) {
            if (numericParticipantId !== requestUserId) {
                const err = new Error('Invalid participant for this top-up chat.');
                err.statusCode = 403;
                throw err;
            }
        }
    }

    return {
        topupRequestId: numericRequestId,
        context,
        assignment,
        user: userRow,
        participant: participantRow,
        requestUserId,
        assignedAdminId,
        isRequestUser,
        isAssignedAdmin,
        isPrivileged,
        isSuperAdmin,
    };
};

const mapMessageRow = (row) => ({
    id: Number(row.id),
    sender_id: Number(row.sender_id),
    receiver_id: Number(row.receiver_id),
    type: row.message_type,
    text: row.message_text,
    image_url: row.image_url,
    file_name: row.file_name,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    delivered_at: row.delivered_at,
    read_at: row.read_at,
    deleted_for_everyone: row.deleted_for_everyone === true,
    deleted_for: Array.isArray(row.deleted_for) ? row.deleted_for : [],
    reply_to_id: row.reply_to_id == null ? null : Number(row.reply_to_id),
    client_message_id: row.client_message_id || null,
    product_status_id: row.product_status_id || null,
    topup_request_id: row.topup_request_id == null ? null : Number(row.topup_request_id),
    assigned_admin_id: row.assigned_admin_id == null ? null : Number(row.assigned_admin_id),
    sender_name: row.sender_name || null,
    receiver_name: row.receiver_name || null,
});

const unhideConversationPair = async (userA, userB) => {
    const a = Number(userA);
    const b = Number(userB);
    if (!a || !b || a === b) return;

    await pool.query(
        `
            UPDATE chat_presence AS cp
            SET hidden_participants = COALESCE((
                SELECT jsonb_agg(val)
                FROM jsonb_array_elements(COALESCE(cp.hidden_participants, '[]'::jsonb)) AS val
                WHERE val::text <> CASE
                    WHEN cp.user_id = $1 THEN $2::text
                    WHEN cp.user_id = $2 THEN $1::text
                    ELSE val::text
                END
            ), '[]'::jsonb),
            updated_at = NOW()
            WHERE cp.user_id IN ($1, $2)
        `,
        [a, b]
    );
};

const backfillAssignedProductStatusMessages = async () => {
    await pool.query(`
        UPDATE chat_messages m
        SET product_status_id = (
            SELECT x.product_status_id
            FROM chat_messages x
            WHERE x.assigned_admin_id = m.assigned_admin_id
              AND x.product_status_id IS NOT NULL
              AND x.deleted_for_everyone = FALSE
              AND COALESCE(x.message_text, '') NOT LIKE $1
              AND (
                (x.sender_id = m.sender_id AND x.receiver_id = m.receiver_id)
                OR (x.sender_id = m.receiver_id AND x.receiver_id = m.sender_id)
              )
              AND (x.created_at < m.created_at OR (x.created_at = m.created_at AND x.id < m.id))
            ORDER BY x.created_at DESC, x.id DESC
            LIMIT 1
        )
        WHERE m.product_status_id IS NULL
          AND m.assigned_admin_id IS NOT NULL
          AND m.deleted_for_everyone = FALSE
          AND COALESCE(m.message_text, '') NOT LIKE $1
          AND EXISTS (
            SELECT 1
            FROM chat_messages x
            WHERE x.assigned_admin_id = m.assigned_admin_id
              AND x.product_status_id IS NOT NULL
              AND x.deleted_for_everyone = FALSE
              AND COALESCE(x.message_text, '') NOT LIKE $1
              AND (
                (x.sender_id = m.sender_id AND x.receiver_id = m.receiver_id)
                OR (x.sender_id = m.receiver_id AND x.receiver_id = m.sender_id)
              )
              AND (x.created_at < m.created_at OR (x.created_at = m.created_at AND x.id < m.id))
          )
    `, [`${ASSIGNMENT_NOTICE_PREFIX}%`]);
};

const ensureChatTables = async () => {
    if (!tablesReadyPromise) {
        tablesReadyPromise = (async () => {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id SERIAL PRIMARY KEY,
                    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
                    message_text TEXT,
                    image_url TEXT,
                    file_name TEXT,
                    status VARCHAR(20) NOT NULL DEFAULT 'sent',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    delivered_at TIMESTAMP,
                    read_at TIMESTAMP,
                    deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
                    deleted_for JSONB NOT NULL DEFAULT '[]'::jsonb,
                    reply_to_id INTEGER,
                    CHECK (message_type IN ('text', 'image', 'video')),
                    CHECK (status IN ('sending', 'sent', 'delivered', 'read'))
                );
            `);

            await pool.query(`
                ALTER TABLE chat_messages
                    ADD COLUMN IF NOT EXISTS deleted_for JSONB NOT NULL DEFAULT '[]'::jsonb;
            `);
            await pool.query(`
                ALTER TABLE chat_messages
                    ADD COLUMN IF NOT EXISTS reply_to_id INTEGER;
            `);
            await pool.query(`
                ALTER TABLE chat_messages
                    ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(80);
            `);
            await pool.query(`
                ALTER TABLE chat_messages
                    ADD COLUMN IF NOT EXISTS product_status_id VARCHAR(120);
            `);
            await pool.query(`
                ALTER TABLE chat_messages
                    ADD COLUMN IF NOT EXISTS assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            `);
            await pool.query(`
                ALTER TABLE chat_messages
                    ADD COLUMN IF NOT EXISTS topup_request_id INTEGER;
            `);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_presence (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    active_participant_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS product_status_chat_assignments (
                    id SERIAL PRIMARY KEY,
                    product_status_id VARCHAR(120) NOT NULL UNIQUE,
                    order_number VARCHAR(120),
                    order_id INTEGER,
                    buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    assigned_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS topup_request_chat_assignments (
                    id SERIAL PRIMARY KEY,
                    topup_request_id INTEGER NOT NULL UNIQUE,
                    request_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    assigned_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await pool.query(`
                ALTER TABLE product_status_chat_assignments
                    ADD COLUMN IF NOT EXISTS order_number VARCHAR(120);
            `);
            await pool.query(`
                ALTER TABLE product_status_chat_assignments
                    ADD COLUMN IF NOT EXISTS order_id INTEGER;
            `);
            await pool.query(`
                ALTER TABLE product_status_chat_assignments
                    ADD COLUMN IF NOT EXISTS buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            `);
            await pool.query(`
                ALTER TABLE product_status_chat_assignments
                    ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            `);
            await pool.query(`
                ALTER TABLE product_status_chat_assignments
                    ADD COLUMN IF NOT EXISTS assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            `);
            await pool.query(`
                ALTER TABLE product_status_chat_assignments
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            `);
            await pool.query(`
                ALTER TABLE topup_request_chat_assignments
                    ADD COLUMN IF NOT EXISTS request_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            `);
            await pool.query(`
                ALTER TABLE topup_request_chat_assignments
                    ADD COLUMN IF NOT EXISTS assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            `);
            await pool.query(`
                ALTER TABLE topup_request_chat_assignments
                    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            `);
            await pool.query(`
                ALTER TABLE chat_presence
                    ADD COLUMN IF NOT EXISTS typing_until TIMESTAMP;
            `);
            await pool.query(`
                ALTER TABLE chat_presence
                    ADD COLUMN IF NOT EXISTS hidden_participants JSONB DEFAULT '[]'::jsonb;
            `);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_call_sessions (
                    id SERIAL PRIMARY KEY,
                    caller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    call_type VARCHAR(10) NOT NULL,
                    call_status VARCHAR(20) NOT NULL DEFAULT 'ringing',
                    encryption JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    answered_at TIMESTAMP,
                    ended_at TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CHECK (call_type IN ('voice', 'video')),
                    CHECK (call_status IN ('ringing', 'active', 'missed', 'completed', 'rejected'))
                );
            `);
            await pool.query(`
                ALTER TABLE chat_call_sessions
                    ADD COLUMN IF NOT EXISTS encryption JSONB NOT NULL DEFAULT '{}'::jsonb;
            `);
            await pool.query(`
                CREATE TABLE IF NOT EXISTS chat_call_signals (
                    id SERIAL PRIMARY KEY,
                    call_id INTEGER NOT NULL REFERENCES chat_call_sessions(id) ON DELETE CASCADE,
                    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    signal_type VARCHAR(30) NOT NULL,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await pool.query(`
                DO $$
                DECLARE
                    c RECORD;
                BEGIN
                    FOR c IN
                        SELECT con.conname
                        FROM pg_constraint con
                        JOIN pg_class rel ON rel.oid = con.conrelid
                        WHERE rel.relname = 'chat_messages'
                          AND con.contype = 'c'
                          AND pg_get_constraintdef(con.oid) LIKE '%message_type%'
                    LOOP
                        EXECUTE format('ALTER TABLE chat_messages DROP CONSTRAINT %I', c.conname);
                    END LOOP;
                END $$;
            `).catch(() => {});
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_messages_pair_created
                ON chat_messages(sender_id, receiver_id, created_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_status
                ON chat_messages(receiver_id, status, created_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_messages_product_status_pair
                ON chat_messages(product_status_id, sender_id, receiver_id, created_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_messages_assigned_admin
                ON chat_messages(assigned_admin_id, product_status_id, created_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_messages_topup_request_pair
                ON chat_messages(topup_request_id, sender_id, receiver_id, created_at DESC);
            `);
            await pool.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_sender_client_message
                ON chat_messages(sender_id, client_message_id)
                WHERE client_message_id IS NOT NULL;
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_presence_last_seen
                ON chat_presence(last_seen_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_product_status_chat_assignments_admin
                ON product_status_chat_assignments(assigned_admin_id, updated_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_product_status_chat_assignments_buyer_seller
                ON product_status_chat_assignments(buyer_id, seller_id);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_topup_request_chat_assignments_admin
                ON topup_request_chat_assignments(assigned_admin_id, updated_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_caller
                ON chat_call_sessions(caller_id, created_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_call_sessions_receiver
                ON chat_call_sessions(receiver_id, created_at DESC);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_chat_call_signals_call_receiver
                ON chat_call_signals(call_id, receiver_id, id ASC);
            `);

            await backfillAssignedProductStatusMessages();
        })().catch((tableError) => {
            tablesReadyPromise = null;
            throw tableError;
        });
    }

    return tablesReadyPromise;
};

const getChatRetentionMs = (extra = {}) => {
    const unit = String(extra.chat_auto_delete_unit || '').trim().toLowerCase();
    if (
        unit === 'lifetime' ||
        unit === 'life_time' ||
        extra.chat_auto_delete_lifetime === true ||
        extra.chat_auto_delete_lifetime === 'true'
    ) {
        return null;
    }

    let value = extra.chat_auto_delete_value;
    let resolvedUnit = unit || 'days';

    if (value === undefined || value === null || value === '') {
        if (extra.chat_auto_delete_days !== undefined && extra.chat_auto_delete_days !== null && extra.chat_auto_delete_days !== '') {
            value = extra.chat_auto_delete_days;
            resolvedUnit = 'days';
        } else if (extra.chat_auto_delete_24h === true || extra.chat_auto_delete_24h === 'true') {
            value = 1;
            resolvedUnit = 'days';
        }
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
    if (resolvedUnit === 'minutes' || resolvedUnit === 'minute' || resolvedUnit === 'mins' || resolvedUnit === 'min') {
        return Math.round(numericValue * 60 * 1000);
    }
    if (resolvedUnit === 'hours' || resolvedUnit === 'hour' || resolvedUnit === 'hrs' || resolvedUnit === 'hr') {
        return Math.round(numericValue * 60 * 60 * 1000);
    }
    if (resolvedUnit === 'days' || resolvedUnit === 'day') {
        return Math.round(numericValue * 24 * 60 * 60 * 1000);
    }
    return null;
};

const pruneExpiredChatsForUser = async (userId) => {
    try {
        if (!userId) return;
        const last = lastPruneAt.get(userId) || 0;
        if (Date.now() - last < PRUNE_COOLDOWN_MS) return;
        lastPruneAt.set(userId, Date.now());

        const features = await getUserSubscriptionFeatures(userId);
        const retentionMs = getChatRetentionMs(features.extra || {});
        if (!retentionMs) return;

        await pool.query(
            `UPDATE chat_messages
             SET deleted_for = CASE
                 WHEN deleted_for ? ($1::text) THEN deleted_for
                 ELSE deleted_for || to_jsonb($1::text)
             END
             WHERE (sender_id = $1 OR receiver_id = $1)
               AND deleted_for_everyone = FALSE
               AND NOT (deleted_for ? ($1::text))
               AND created_at < NOW() - ($2::text || ' milliseconds')::interval`,
            [userId, retentionMs]
        );
    } catch (err) {
        console.error('[chat] pruneExpiredChatsForUser error:', err.message);
    }
};

const createChatMessage = async (senderId, body = {}) => {
    await ensureChatTables();

    senderId = Number(senderId);
    await pruneExpiredChatsForUser(senderId);

    const limits = await getUserPlanLimits(senderId);
    if (!limits.textMessaging) {
        const err = new Error('Text messaging is not allowed on your current plan. Please upgrade.');
        err.statusCode = 403;
        throw err;
    }

    const receiverId = Number(body.receiverId);
    const requestedAssignedAdminId = Number(body.assignedAdminId || 0) || null;
    let productStatusId = normalizeProductStatusId(body.productStatusId);
    const topupRequestId = body.topupRequestId ? Number(body.topupRequestId) : null;

    if (!productStatusId && requestedAssignedAdminId) {
        const inferredProductResult = await pool.query(
            `
                SELECT product_status_id
                FROM chat_messages
                WHERE assigned_admin_id = $3
                  AND product_status_id IS NOT NULL
                  AND (
                    (sender_id = $1 AND receiver_id = $2)
                    OR (sender_id = $2 AND receiver_id = $1)
                  )
                  AND deleted_for_everyone = FALSE
                ORDER BY created_at DESC, id DESC
                LIMIT 1
            `,
            [senderId, receiverId, requestedAssignedAdminId]
        );
        productStatusId = normalizeProductStatusId(inferredProductResult.rows[0]?.product_status_id);
    }

    const scopedAccess = productStatusId
        ? await resolveProductStatusAccess({ userId: senderId, participantId: receiverId, productStatusId })
        : topupRequestId
            ? await resolveTopupRequestAccess({ userId: senderId, participantId: receiverId, topupRequestId })
            : null;
    const assignedAdminId = scopedAccess?.assignedAdminId || requestedAssignedAdminId || null;

    const blockCheck = await pool.query(
        `SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_user_id = $2 LIMIT 1`,
        [receiverId, senderId]
    );
    if (blockCheck.rows.length > 0) {
        const err = new Error('You cannot send messages to this user.');
        err.statusCode = 403;
        throw err;
    }

    const rawType = String(body.type || 'text');
    const type = rawType === 'image'
        ? 'image'
        : rawType === 'video'
            ? 'video'
            : rawType === 'sticker'
                ? 'sticker'
                : rawType === 'voice_tts'
                    ? 'voice_tts'
                    : rawType === 'voice'
                        ? 'voice'
                        : 'text';

    if (type === 'sticker' || type === 'voice_tts') {
        const features = await getUserSubscriptionFeatures(senderId);
        if (type === 'sticker' && !features.chat_stickers) {
            const err = new Error('Stickers are available in higher plans. Please upgrade.');
            err.statusCode = 403;
            throw err;
        }
        if (type === 'voice_tts' && !features.text_to_voice) {
            const err = new Error('Text-to-voice messages are not enabled on your current plan. Please upgrade.');
            err.statusCode = 403;
            throw err;
        }
    }

    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const imageUrl = typeof body.image_url === 'string' ? body.image_url : null;
    const fileName = typeof body.file_name === 'string' ? body.file_name : null;
    const rawReplyToId = body.reply_to_id ? Number(body.reply_to_id) : null;
    const replyToId = Number.isInteger(rawReplyToId) && rawReplyToId > 0 ? rawReplyToId : null;
    const rawClientMessageId = typeof body.client_message_id === 'string' ? body.client_message_id.trim() : '';
    const clientMessageId = rawClientMessageId ? rawClientMessageId.slice(0, 80) : null;

    if (!receiverId || receiverId === senderId) {
        const err = new Error('Invalid receiver selected.');
        err.statusCode = 400;
        throw err;
    }

    if (!MESSAGE_TYPES.has(type)) {
        const err = new Error('Invalid message type.');
        err.statusCode = 400;
        throw err;
    }

    if ((type === 'text' || type === 'voice_tts') && !text) {
        const err = new Error('Message text is required.');
        err.statusCode = 400;
        throw err;
    }

    if ((type === 'image' || type === 'video' || type === 'voice') && !imageUrl) {
        const err = new Error(type === 'voice' ? 'Voice message data is required.' : 'Media message data is required.');
        err.statusCode = 400;
        throw err;
    }

    const mediaMaxBytes = type === 'video' ? CHAT_VIDEO_MAX_BYTES : CHAT_MEDIA_MAX_BYTES;
    if ((type === 'image' || type === 'video') && imageUrl?.startsWith('data:') && getDataUrlByteSize(imageUrl) > mediaMaxBytes) {
        const err = new Error('Media could not be compressed for chat. Please choose a smaller file.');
        err.statusCode = 413;
        throw err;
    }

    if (type === 'sticker' && !text) {
        const err = new Error('Sticker payload is required.');
        err.statusCode = 400;
        throw err;
    }

    if (type === 'image' || type === 'video') {
        const mediaCountResult = await pool.query(
            `
                SELECT COUNT(*)::int AS count
                FROM chat_messages
                WHERE sender_id = $1
                  AND message_type IN ('image', 'video')
                  AND created_at >= NOW() - INTERVAL '24 hours'
                  AND deleted_for_everyone = FALSE
            `,
            [senderId]
        );
        const sentInWindow = Number(mediaCountResult.rows[0]?.count || 0);
        if (sentInWindow >= DAILY_CHAT_MEDIA_LIMIT) {
            const err = new Error('Daily media limit reached. You can send 10 images or videos every 24 hours.');
            err.statusCode = 429;
            throw err;
        }
    }

    const presenceResult = await pool.query(
        `
            SELECT last_seen_at
            FROM chat_presence
            WHERE user_id = $1
            LIMIT 1
        `,
        [receiverId]
    );

    const receiverPresence = presenceResult.rows[0];
    const isReceiverOnline = receiverPresence?.last_seen_at
        ? Date.now() - new Date(receiverPresence.last_seen_at).getTime() < 20000
        : false;

    const initialStatus = isReceiverOnline ? 'delivered' : 'sent';

    const result = await pool.query(
        `
            INSERT INTO chat_messages (
                sender_id, receiver_id, message_type, message_text,
                image_url, file_name, status, delivered_at, reply_to_id, client_message_id,
                product_status_id, topup_request_id, assigned_admin_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (sender_id, client_message_id) WHERE client_message_id IS NOT NULL
            DO UPDATE SET client_message_id = EXCLUDED.client_message_id
            RETURNING *
        `,
        [
            senderId,
            receiverId,
            type,
            (type === 'text' || type === 'sticker' || type === 'voice_tts' || type === 'image' || type === 'video') ? text : null,
            imageUrl,
            fileName,
            initialStatus,
            initialStatus === 'delivered' ? new Date() : null,
            replyToId,
            clientMessageId,
            scopedAccess?.normalizedProductStatusId || null,
            scopedAccess?.topupRequestId || null,
            assignedAdminId,
        ]
    );

    await unhideConversationPair(senderId, receiverId);

    const senderNameResult = await pool.query(
        `
            SELECT
                sender.username,
                sender.full_name,
                sender.user_type,
                assigned_admin.username AS assigned_admin_username,
                assigned_admin.full_name AS assigned_admin_full_name
            FROM users sender
            LEFT JOIN users assigned_admin ON assigned_admin.id = $2
            WHERE sender.id = $1
            LIMIT 1
        `,
        [senderId, assignedAdminId]
    );
    const sender = senderNameResult.rows[0] || {};
    const senderName = ['superadmin', 'super_admin'].includes(String(sender.user_type || '').toLowerCase()) && assignedAdminId
        ? (sender.assigned_admin_username || sender.assigned_admin_full_name || 'Admin')
        : ['superadmin', 'super_admin'].includes(String(sender.user_type || '').toLowerCase())
            ? 'Googer Support'
            : String(sender.user_type || '').toLowerCase() === 'admin'
                ? (sender.username || sender.full_name || null)
                : (sender.full_name || sender.username || null);

    return mapMessageRow({
        ...result.rows[0],
        sender_name: senderName,
    });
};

module.exports = {
    createChatMessage,
    ensureChatTables,
};
