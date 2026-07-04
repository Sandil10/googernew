const pool = require('../config/database');
const { success, error } = require('../utils/responseHandler');
const { getUserPlanLimits, getUserSubscriptionFeatures } = require('../utils/planLimits');
const { getGraceDurationSeconds } = require('../utils/subscriptionRenewal');
const chatService = require('../modules/chat/chatService');
const { normalizeRole } = require('../../../../shared/contracts/userRoles');

// Track per-user prune timestamp so we don't hammer the DB on every fetch.
const lastPruneAt = new Map();
const PRUNE_COOLDOWN_MS = 10 * 1000;

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

// Removes chat messages older than the user's plan-defined retention window.
// Per-user — value comes from subscription_plans.extra.chat_auto_delete_days
// (admin editable). null/undefined => no auto-delete.
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

const ACTIVE_SIGNAL_TYPES = new Set(['offer', 'answer', 'ice-candidate']);
const CALL_TYPES = new Set(['voice', 'video']);
const CALL_STATUSES = new Set(['ringing', 'active', 'missed', 'completed', 'rejected']);
const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'sticker', 'voice_tts', 'voice']);
const MESSAGE_STATUSES = new Set(['sending', 'sent', 'delivered', 'read']);
const DAILY_CHAT_MEDIA_LIMIT = 10;
const CHAT_MEDIA_MAX_BYTES = 3 * 1024 * 1024;
const CHAT_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const PRIVILEGED_CHAT_ROLES = new Set(['admin', 'superadmin', 'super_admin', 'employee', 'administrator']);
const ASSIGNMENT_NOTICE_PREFIX = 'Assigned admin:';

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

const getCallEncryptionMetadata = () => ({
    media_encryption: 'webrtc-dtls-srtp',
    end_to_end_encrypted: true,
    signaling: 'server-relayed-sdp',
});

const userCanUseVideoCall = async (userId) => {
    const features = await getUserSubscriptionFeatures(userId);
    return features.video_calls === true;
};

// Any user with at least one active paid subscription can receive calls.
const userHasActiveSubscription = async (userId) => {
    try {
        const res = await pool.query(
            `SELECT 1 FROM user_plan_subscriptions
             WHERE user_id = $1 AND status = 'active'
               AND (expires_at IS NULL OR expires_at + (($2::text || ' seconds')::interval) > NOW())
             LIMIT 1`,
            [userId, getGraceDurationSeconds()]
        );
        return res.rows.length > 0;
    } catch {
        return false;
    }
};

let tablesReadyPromise = null;

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

            // Drop legacy message_type CHECK constraint so new types ('sticker'…) can be inserted.
            // Constraint name is auto-generated by Postgres; we look it up dynamically.
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

const mapParticipantUser = (row, fallbackRoleLabel = 'User') => {
    if (!row) return null;
    const role = normalizeRole(row.user_type);
    return {
        id: Number(row.id),
        name: isSuperAdminRole(role)
            ? 'Googer Support'
            : role === 'admin'
                ? (row.username || row.full_name || 'Admin')
                : (row.full_name || row.username || 'User'),
        username: row.username || null,
        profile_picture: row.profile_picture || null,
        user_type: row.user_type || null,
        roleLabel: isSuperAdminRole(role)
            ? 'Super Admin'
            : role === 'admin'
                ? 'Admin'
                : fallbackRoleLabel,
    };
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

const assertSuperAdmin = async (userId) => {
    const user = await getUserSummaryById(userId);
    if (!user) {
        const err = new Error('Authentication required.');
        err.statusCode = 401;
        throw err;
    }
    if (!isSuperAdminRole(user.user_type)) {
        const err = new Error('Super admin access required.');
        err.statusCode = 403;
        throw err;
    }
    return user;
};

const mapAssignmentRow = (assignment, context = null) => {
    if (!assignment) return null;
    return {
        id: Number(assignment.id),
        product_status_id: assignment.product_status_id,
        order_number: assignment.order_number || context?.order_number || assignment.product_status_id,
        order_id: assignment.order_id == null ? context?.order_id ?? null : Number(assignment.order_id),
        buyer_id: assignment.buyer_id == null ? context?.buyer_id ?? null : Number(assignment.buyer_id),
        seller_id: assignment.seller_id == null ? context?.seller_id ?? null : Number(assignment.seller_id),
        assigned_admin_id: Number(assignment.assigned_admin_id),
        assigned_admin: {
            id: Number(assignment.assigned_admin_id),
            name: assignment.assigned_admin_username || assignment.assigned_admin_full_name || 'Admin',
            username: assignment.assigned_admin_username || null,
            profile_picture: assignment.assigned_admin_profile_picture || null,
            user_type: assignment.assigned_admin_user_type || 'admin',
            roleLabel: 'Admin',
        },
        assigned_by: assignment.assigned_by_user_id
            ? {
                id: Number(assignment.assigned_by_user_id),
                name: assignment.assigned_by_full_name || assignment.assigned_by_username || 'Super Admin',
                username: assignment.assigned_by_username || null,
            }
            : null,
        created_at: assignment.created_at,
        updated_at: assignment.updated_at,
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

const userRoom = (userId) => `user:${userId}`;

const mapMessageStatusRow = (row) => ({
    id: Number(row.id),
    sender_id: Number(row.sender_id),
    receiver_id: Number(row.receiver_id),
    status: row.status,
    delivered_at: row.delivered_at,
    read_at: row.read_at,
    client_message_id: row.client_message_id || null,
});

const emitMessageStatusUpdates = (io, rows = []) => {
    if (!io || !Array.isArray(rows) || rows.length === 0) return;

    rows.forEach((row) => {
        const payload = mapMessageStatusRow(row);
        io.to(userRoom(payload.sender_id)).emit('chat:message_status', payload);
        io.to(userRoom(payload.receiver_id)).emit('chat:message_status', payload);
    });
};

const emitPresenceUpdate = (io, userId, activeParticipantId = null) => {
    if (!io || !userId) return;
    io.emit('chat:presence', {
        user_id: Number(userId),
        active_participant_id: activeParticipantId ? Number(activeParticipantId) : null,
        status: 'online',
        last_seen_at: new Date().toISOString(),
    });
};

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

const getPresenceStatus = (lastSeenAt) => {
    if (!lastSeenAt) {
        return { status: 'offline', last_seen_at: null };
    }

    // Always parse as UTC — PostgreSQL TIMESTAMP columns have no tz info, so
    // appending 'Z' or using toISOString() ensures every client reads the same instant.
    const isoString = new Date(lastSeenAt).toISOString();
    const lastSeenTime = new Date(isoString).getTime();
    const isOnline = Date.now() - lastSeenTime < 20000;

    return {
        status: isOnline ? 'online' : 'offline',
        last_seen_at: isoString,
    };
};

const mapCallRow = (row, userId) => {
    const currentUserId = Number(userId);
    const isCaller = Number(row.caller_id) === currentUserId;
    const participant = {
        id: isCaller ? Number(row.receiver_id) : Number(row.caller_id),
        name: isCaller ? row.receiver_name : row.caller_name,
        username: isCaller ? row.receiver_username : row.caller_username,
        profile_picture: isCaller ? row.receiver_profile_picture : row.caller_profile_picture,
    };

    return {
        id: Number(row.id),
        caller_id: Number(row.caller_id),
        receiver_id: Number(row.receiver_id),
        call_type: row.call_type,
        call_status: row.call_status,
        encryption: row.encryption || getCallEncryptionMetadata(),
        end_to_end_encrypted: true,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
        answered_at: row.answered_at,
        ended_at: row.ended_at,
        participant,
    };
};

const normalizeExpiredCalls = async (userId) => {
    await ensureChatTables();

    const params = [35];
    let userFilter = '';

    if (userId) {
        params.push(Number(userId));
        userFilter = 'AND (caller_id = $2 OR receiver_id = $2)';
    }

    await pool.query(
        `
            UPDATE chat_call_sessions
            SET call_status = 'missed',
                ended_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE call_status = 'ringing'
              AND created_at < CURRENT_TIMESTAMP - ($1::text || ' seconds')::interval
              ${userFilter}
        `,
        params
    );
};

const getCallWithUsers = async (callId) => {
    await ensureChatTables();

    const result = await pool.query(
        `
            SELECT
                s.*,
                CASE
                    WHEN LOWER(COALESCE(caller.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                    WHEN LOWER(COALESCE(caller.user_type, '')) = 'admin' THEN COALESCE(caller.username, caller.full_name)
                    ELSE COALESCE(caller.full_name, caller.username)
                END AS caller_name,
                caller.username AS caller_username,
                caller.profile_picture AS caller_profile_picture,
                CASE
                    WHEN LOWER(COALESCE(receiver.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                    WHEN LOWER(COALESCE(receiver.user_type, '')) = 'admin' THEN COALESCE(receiver.username, receiver.full_name)
                    ELSE COALESCE(receiver.full_name, receiver.username)
                END AS receiver_name,
                receiver.username AS receiver_username,
                receiver.profile_picture AS receiver_profile_picture
            FROM chat_call_sessions s
            JOIN users caller ON caller.id = s.caller_id
            JOIN users receiver ON receiver.id = s.receiver_id
            WHERE s.id = $1
            LIMIT 1
        `,
        [callId]
    );

    return result.rows[0] || null;
};

const getLatestOfferPayload = async (callId) => {
    const signalResult = await pool.query(
        `
            SELECT payload
            FROM chat_call_signals
            WHERE call_id = $1 AND signal_type = 'offer'
            ORDER BY id DESC
            LIMIT 1
        `,
        [callId]
    );

    return signalResult.rows[0]?.payload || null;
};

exports.updatePresence = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const activeParticipantId = req.body.activeParticipantId ? Number(req.body.activeParticipantId) : null;
        const activeProductStatusId = normalizeProductStatusId(req.body.activeProductStatusId);
        const activeTopupRequestId = req.body.activeTopupRequestId ? Number(req.body.activeTopupRequestId) : null;
        const io = req.app.get('io');

        await pool.query(
            `
                INSERT INTO chat_presence (user_id, active_participant_id, last_seen_at, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    active_participant_id = EXCLUDED.active_participant_id,
                    last_seen_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [userId, activeParticipantId || null]
        );

        const deliveredResult = await pool.query(
            `
                UPDATE chat_messages
                SET status = 'delivered',
                    delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
                WHERE receiver_id = $1
                  AND status = 'sent'
                  AND NOT (deleted_for ? ($1::text))
                RETURNING id, sender_id, receiver_id, status, delivered_at, read_at, client_message_id
            `,
            [userId]
        );

        const statusRows = [...deliveredResult.rows];

        if (activeParticipantId) {
            const scopedAccess = activeProductStatusId
                ? await resolveProductStatusAccess({
                    userId,
                    participantId: activeParticipantId,
                    productStatusId: activeProductStatusId,
                })
                : activeTopupRequestId
                    ? await resolveTopupRequestAccess({
                        userId,
                        participantId: activeParticipantId,
                        topupRequestId: activeTopupRequestId,
                    })
                : null;
            const readResult = await pool.query(
                `
                    UPDATE chat_messages
                    SET status = 'read',
                        delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
                        read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                    WHERE receiver_id = $1
                      AND sender_id = $2
                      AND ($3::text IS NULL OR product_status_id = $3)
                      AND ($4::int IS NULL OR topup_request_id = $4)
                      AND status IN ('sent', 'delivered')
                      AND NOT (deleted_for ? ($1::text))
                    RETURNING id, sender_id, receiver_id, status, delivered_at, read_at, client_message_id
                `,
                [
                    userId,
                    activeParticipantId,
                    scopedAccess?.normalizedProductStatusId || activeProductStatusId || null,
                    scopedAccess?.topupRequestId || activeTopupRequestId || null,
                ]
            );
            statusRows.push(...readResult.rows);
        }

        emitPresenceUpdate(io, userId, activeParticipantId);
        emitMessageStatusUpdates(io, statusRows);

        return success(res, { user_id: userId, active_participant_id: activeParticipantId }, 'Presence updated');
    } catch (err) {
        console.error('updatePresence error:', err);
        return error(res, 'Server error updating chat presence', 500);
    }
};

exports.getConversations = async (req, res) => {
    try {
        if (chatService.isRemoteChatServiceEnabled()) {
            const result = await chatService.getConversations(Number(req.user.id));
            return res.status(result.statusCode).json(result.payload);
        }

        await ensureChatTables();

        const userId = Number(req.user.id);
        void pruneExpiredChatsForUser(userId);
        // Load participant IDs hidden by this user (stored in chat_presence)
        const hiddenRes = await pool.query(
            `SELECT hidden_participants FROM chat_presence WHERE user_id = $1`,
            [userId]
        );
        const hiddenIds = Array.isArray(hiddenRes.rows[0]?.hidden_participants)
            ? hiddenRes.rows[0].hidden_participants.map(Number)
            : [];

        const result = await pool.query(
            `
                WITH user_conversations AS (
                    SELECT
                        CASE
                            WHEN cm.sender_id = $1 THEN cm.receiver_id
                            WHEN cm.receiver_id = $1 THEN cm.sender_id
                            WHEN cm.assigned_admin_id = $1
                                 AND LOWER(COALESCE(sender_user.user_type, '')) IN ('superadmin', 'super_admin')
                                THEN cm.receiver_id
                            WHEN cm.assigned_admin_id = $1 THEN cm.sender_id
                            ELSE cm.sender_id
                        END AS participant_id,
                        cm.id,
                        cm.sender_id,
                        cm.receiver_id,
                        cm.assigned_admin_id,
                        cm.product_status_id,
                        cm.topup_request_id,
                        cm.message_type,
                        cm.message_text,
                        cm.image_url,
                        cm.file_name,
                        cm.status,
                        cm.created_at,
                        cm.delivered_at,
                        cm.read_at,
                        cm.deleted_for
                    FROM chat_messages cm
                    LEFT JOIN users sender_user ON sender_user.id = cm.sender_id
                    WHERE (cm.sender_id = $1 OR cm.receiver_id = $1 OR cm.assigned_admin_id = $1)
                      AND cm.deleted_for_everyone = FALSE
                      AND NOT (cm.deleted_for ? ($1::text))
                      AND COALESCE(cm.message_text, '') NOT LIKE $3
                ),
                latest_messages AS (
                    SELECT DISTINCT ON (participant_id, assigned_admin_id)
                        participant_id,
                        id,
                        sender_id,
                        receiver_id,
                        assigned_admin_id,
                        product_status_id,
                        topup_request_id,
                        message_type,
                        message_text,
                        image_url,
                        file_name,
                        status,
                        created_at,
                        delivered_at,
                        read_at,
                        deleted_for
                    FROM user_conversations
                    ORDER BY participant_id, assigned_admin_id, created_at DESC, id DESC
                ),
                unread_counts AS (
                    SELECT
                        CASE
                            WHEN cm.sender_id = $1 THEN cm.receiver_id
                            WHEN cm.receiver_id = $1 THEN cm.sender_id
                            WHEN cm.assigned_admin_id = $1
                                 AND LOWER(COALESCE(sender_user.user_type, '')) IN ('superadmin', 'super_admin')
                                THEN cm.receiver_id
                            WHEN cm.assigned_admin_id = $1 THEN cm.sender_id
                            ELSE cm.sender_id
                        END AS participant_id,
                        COUNT(*)::int AS unread_count
                    FROM chat_messages cm
                    LEFT JOIN users sender_user ON sender_user.id = cm.sender_id
                    WHERE (cm.receiver_id = $1 OR cm.assigned_admin_id = $1)
                      AND cm.status IN ('sent', 'delivered')
                      AND cm.deleted_for_everyone = FALSE
                      AND NOT (cm.deleted_for ? ($1::text))
                      AND COALESCE(cm.message_text, '') NOT LIKE $3
                    GROUP BY participant_id
                )
                SELECT
                    participant.id AS participant_id,
                    participant.full_name AS participant_name,
                    participant.username AS participant_username,
                    participant.profile_picture AS participant_profile_picture,
                    participant.user_type AS participant_role,
                    CASE
                        WHEN LOWER(COALESCE(participant.user_type, '')) IN ('superadmin', 'super_admin')
                             AND assigned_admin.id IS NOT NULL
                            THEN COALESCE(assigned_admin.username, assigned_admin.full_name, 'Admin')
                        WHEN LOWER(COALESCE(participant.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(participant.user_type, '')) = 'admin'
                            THEN COALESCE(participant.username, participant.full_name, 'User')
                        ELSE COALESCE(participant.full_name, participant.username, 'User')
                    END AS participant_display_name,
                    CASE
                        WHEN LOWER(COALESCE(participant.user_type, '')) IN ('superadmin', 'super_admin')
                             AND assigned_admin.id IS NOT NULL
                            THEN assigned_admin.profile_picture
                        ELSE participant.profile_picture
                    END AS participant_display_profile_picture,
                    presence.last_seen_at AS participant_last_seen_at,
                    lm.id,
                    lm.sender_id,
                    lm.receiver_id,
                    lm.assigned_admin_id AS assigned_admin_id,
                    lm.product_status_id,
                    lm.topup_request_id,
                    lm.message_type,
                    lm.message_text,
                    lm.image_url,
                    lm.file_name,
                    lm.status,
                    lm.created_at,
                    lm.delivered_at,
                    lm.read_at,
                    lm.deleted_for,
                    CASE
                        WHEN LOWER(COALESCE(sender.user_type, '')) IN ('superadmin', 'super_admin')
                             AND assigned_admin.id IS NOT NULL
                            THEN COALESCE(assigned_admin.username, assigned_admin.full_name, 'Admin')
                        WHEN LOWER(COALESCE(sender.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(sender.user_type, '')) = 'admin' THEN COALESCE(sender.username, sender.full_name)
                        ELSE COALESCE(sender.full_name, sender.username)
                    END AS sender_name,
                    CASE
                        WHEN LOWER(COALESCE(receiver.user_type, '')) IN ('superadmin', 'super_admin')
                             AND assigned_admin.id IS NOT NULL
                            THEN COALESCE(assigned_admin.username, assigned_admin.full_name, 'Admin')
                        WHEN LOWER(COALESCE(receiver.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(receiver.user_type, '')) = 'admin' THEN COALESCE(receiver.username, receiver.full_name)
                        ELSE COALESCE(receiver.full_name, receiver.username)
                    END AS receiver_name,
                    COALESCE(uc.unread_count, 0) AS unread_count
                FROM latest_messages lm
                JOIN users participant ON participant.id = lm.participant_id
                JOIN users sender ON sender.id = lm.sender_id
                JOIN users receiver ON receiver.id = lm.receiver_id
                LEFT JOIN unread_counts uc ON uc.participant_id = lm.participant_id
                LEFT JOIN chat_presence presence ON presence.user_id = lm.participant_id
                LEFT JOIN users assigned_admin ON assigned_admin.id = lm.assigned_admin_id
                WHERE lm.participant_id <> ALL($2::int[])
                ORDER BY lm.created_at DESC, lm.id DESC
            `,
            [userId, hiddenIds, `${ASSIGNMENT_NOTICE_PREFIX}%`]
        );

        const conversations = result.rows.map((row) => {
            const hasAssignedSupportAlias =
                row.assigned_admin_id != null &&
                ['superadmin', 'super_admin'].includes(String(row.participant_role || '').toLowerCase());
            return {
                participant: {
                    id: Number(row.participant_id),
                    name: row.participant_display_name || row.participant_name || row.participant_username || 'User',
                    username: hasAssignedSupportAlias
                        ? (row.participant_display_name || null)
                        : row.participant_username,
                    user_type: hasAssignedSupportAlias ? 'admin' : row.participant_role,
                    assigned_admin_alias: hasAssignedSupportAlias,
                    assigned_admin_id: row.assigned_admin_id == null ? null : Number(row.assigned_admin_id),
                    product_status_id: row.product_status_id || null,
                    topup_request_id: row.topup_request_id == null ? null : Number(row.topup_request_id),
                    conversation_key: `${Number(row.participant_id)}:${row.assigned_admin_id == null ? 'base' : Number(row.assigned_admin_id)}`,
                    profile_picture: row.participant_display_profile_picture || row.participant_profile_picture,
                    roleLabel: hasAssignedSupportAlias
                        ? 'Admin'
                        : ['superadmin', 'super_admin'].includes(String(row.participant_role || '').toLowerCase())
                            ? 'Support'
                            : row.participant_role === 'seller' ? 'Seller' : 'Buyer',
                    ...getPresenceStatus(row.participant_last_seen_at),
                },
                unread_count: Number(row.unread_count || 0),
                lastMessage: mapMessageRow(row),
            };
        });

        return success(res, conversations, 'Conversations fetched');
    } catch (err) {
        console.error('getConversations error:', err);
        return error(res, 'Server error fetching chat conversations', 500);
    }
};

exports.getMessages = async (req, res) => {
    try {
        if (chatService.isRemoteChatServiceEnabled()) {
            const result = await chatService.getMessages({
                participantId: Number(req.params.participantId),
                query: req.query,
                userId: Number(req.user.id),
            });
            return res.status(result.statusCode).json(result.payload);
        }

        await ensureChatTables();

        const userId = Number(req.user.id);
        const participantId = Number(req.params.participantId);
        const markSeen = String(req.query.markSeen || '') === '1';
        const productStatusId = normalizeProductStatusId(req.query.productStatusId);
        const topupRequestId = req.query.topupRequestId ? Number(req.query.topupRequestId) : null;
        const io = req.app.get('io');

        // Fire-and-forget auto-delete prune for this user's plan retention window.
        void pruneExpiredChatsForUser(userId);

        if (!participantId || participantId === userId) {
            return error(res, 'Invalid participant selected.', 400);
        }

        const scopedAccess = productStatusId
            ? await resolveProductStatusAccess({ userId, participantId, productStatusId })
            : topupRequestId
                ? await resolveTopupRequestAccess({ userId, participantId, topupRequestId })
            : null;
        const scopedProductStatusId = scopedAccess?.normalizedProductStatusId || null;
        const scopedTopupRequestId = scopedAccess?.topupRequestId || null;
        const requestedAssignedAdminId = req.query.assignedAdminId ? Number(req.query.assignedAdminId) : null;
        const scopedAssignedAdminId = scopedAccess?.assignedAdminId || requestedAssignedAdminId || null;
        const canReadAssignedScopedMessages = Boolean(
            scopedAssignedAdminId &&
            (
                (scopedAccess && (scopedAccess.isAssignedAdmin || scopedAccess.isSuperAdmin)) ||
                (!scopedAccess && requestedAssignedAdminId && Number(requestedAssignedAdminId) === userId)
            )
        );

        if (markSeen) {
            const readResult = await pool.query(
                `
                    UPDATE chat_messages
                    SET status = 'read',
                        delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
                        read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                    WHERE (
                        (receiver_id = $1 AND sender_id = $2)
                        OR ($5::boolean = TRUE AND assigned_admin_id = $1 AND sender_id = $2)
                      )
                      AND ($3::text IS NULL OR product_status_id = $3)
                      AND ($4::int IS NULL OR topup_request_id = $4)
                      AND status IN ('sent', 'delivered')
                      AND NOT (deleted_for ? ($1::text))
                    RETURNING id, sender_id, receiver_id, status, delivered_at, read_at, client_message_id
                `,
                [userId, participantId, scopedProductStatusId, scopedTopupRequestId, canReadAssignedScopedMessages && scopedAssignedAdminId === userId]
            );
            emitMessageStatusUpdates(io, readResult.rows);
        } else {
            const deliveredResult = await pool.query(
                `
                    UPDATE chat_messages
                    SET status = 'delivered',
                        delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP)
                    WHERE (
                        (receiver_id = $1 AND sender_id = $2)
                        OR ($5::boolean = TRUE AND assigned_admin_id = $1 AND sender_id = $2)
                      )
                      AND ($3::text IS NULL OR product_status_id = $3)
                      AND ($4::int IS NULL OR topup_request_id = $4)
                      AND status = 'sent'
                      AND NOT (deleted_for ? ($1::text))
                    RETURNING id, sender_id, receiver_id, status, delivered_at, read_at, client_message_id
                `,
                [userId, participantId, scopedProductStatusId, scopedTopupRequestId, canReadAssignedScopedMessages && scopedAssignedAdminId === userId]
            );
            emitMessageStatusUpdates(io, deliveredResult.rows);
        }

        const result = await pool.query(
            `
                SELECT
                    m.*,
                    m.assigned_admin_id AS assigned_admin_id,
                    CASE
                        WHEN LOWER(COALESCE(sender.user_type, '')) IN ('superadmin', 'super_admin')
                             AND assigned_admin.id IS NOT NULL
                            THEN COALESCE(assigned_admin.username, assigned_admin.full_name, 'Admin')
                        WHEN LOWER(COALESCE(sender.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(sender.user_type, '')) = 'admin' THEN COALESCE(sender.username, sender.full_name)
                        ELSE COALESCE(sender.full_name, sender.username)
                    END AS sender_name,
                    CASE
                        WHEN LOWER(COALESCE(receiver.user_type, '')) IN ('superadmin', 'super_admin')
                             AND assigned_admin.id IS NOT NULL
                            THEN COALESCE(assigned_admin.username, assigned_admin.full_name, 'Admin')
                        WHEN LOWER(COALESCE(receiver.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(receiver.user_type, '')) = 'admin' THEN COALESCE(receiver.username, receiver.full_name)
                        ELSE COALESCE(receiver.full_name, receiver.username)
                    END AS receiver_name
                FROM chat_messages m
                JOIN users sender ON sender.id = m.sender_id
                JOIN users receiver ON receiver.id = m.receiver_id
                LEFT JOIN users assigned_admin ON assigned_admin.id = m.assigned_admin_id
                WHERE (
                    ((m.sender_id = $1 AND m.receiver_id = $2)
                        OR (m.sender_id = $2 AND m.receiver_id = $1))
                    OR (
                        $7::boolean = TRUE
                        AND m.assigned_admin_id = $8
                        AND (m.sender_id = $2 OR m.receiver_id = $2)
                    )
                )
                  AND (
                    $3::text IS NULL
                    OR m.product_status_id = $3
                  )
                  AND ($4::int IS NULL OR m.topup_request_id = $4)
                  AND ($5::int IS NULL OR m.assigned_admin_id = $5)
                  AND m.deleted_for_everyone = FALSE
                  AND NOT (m.deleted_for ? ($1::text))
                  AND COALESCE(m.message_text, '') NOT LIKE $6
                ORDER BY m.created_at ASC, m.id ASC
            `,
            [
                userId,
                participantId,
                scopedProductStatusId,
                scopedTopupRequestId,
                requestedAssignedAdminId,
                `${ASSIGNMENT_NOTICE_PREFIX}%`,
                canReadAssignedScopedMessages,
                scopedAssignedAdminId,
            ]
        );

        return success(res, result.rows.map(mapMessageRow), 'Messages fetched');
    } catch (err) {
        console.error('getMessages error:', err);
        return error(res, err.message || 'Server error fetching messages', err.statusCode || 500);
    }
};

const createChatMessage = async (senderId, body = {}) => {
    await ensureChatTables();

    senderId = Number(senderId);

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

    // Reject if the receiver has blocked the sender
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

exports.createChatMessage = createChatMessage;
exports.mapMessageRow = mapMessageRow;
exports.ensureChatTables = ensureChatTables;

exports.sendMessage = async (req, res) => {
    try {
        const mapped = await chatService.createChatMessage(req.user.id, req.body);
        const io = req.app.get('io');
        const senderId = Number(mapped.sender_id);
        const receiverId = Number(mapped.receiver_id);
        const assignedAdminId = mapped.assigned_admin_id == null ? null : Number(mapped.assigned_admin_id);

        if (io) {
            io.to(userRoom(senderId)).emit('chat:message', mapped);
            if (receiverId && receiverId !== senderId) {
                io.to(userRoom(receiverId)).emit('chat:message', mapped);
            }
            if (assignedAdminId && assignedAdminId !== senderId && assignedAdminId !== receiverId) {
                io.to(userRoom(assignedAdminId)).emit('chat:message', mapped);
            }
        }

        return success(res, mapped, 'Message sent');
    } catch (err) {
        console.error('sendMessage error:', err);
        return error(res, err.message || 'Server error sending message', err.statusCode || 500);
    }
};

exports.getProductStatusAssignment = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const productStatusId = normalizeProductStatusId(req.params.productStatusId);

        if (!productStatusId) {
            return error(res, 'Product status id is required.', 400);
        }

        const access = await resolveProductStatusAccess({ userId, productStatusId });
        const assignment = access.assignment ? mapAssignmentRow(access.assignment, access.context) : null;

        return success(res, {
            product_status_id: access.normalizedProductStatusId,
            order_number: access.context.order_number || access.normalizedProductStatusId,
            order_id: Number(access.context.order_id || 0) || null,
            buyer_id: Number(access.context.buyer_id || 0) || null,
            seller_id: Number(access.context.seller_id || 0) || null,
            assignment,
            can_manage_assignment: access.isSuperAdmin,
            can_view_all: access.isSuperAdmin || access.isAssignedAdmin,
        }, 'Product-status assignment fetched');
    } catch (err) {
        console.error('getProductStatusAssignment error:', err);
        return error(res, err.message || 'Server error fetching assignment', err.statusCode || 500);
    }
};

exports.assignProductStatusAdmin = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        await assertSuperAdmin(userId);

        const productStatusId = normalizeProductStatusId(req.params.productStatusId || req.body.productStatusId);
        const rawAssignedAdminId = req.body.assignedAdminId;
        const assignedAdminId = rawAssignedAdminId == null || rawAssignedAdminId === ''
            ? null
            : Number(rawAssignedAdminId);

        if (!productStatusId) {
            return error(res, 'Product status id is required.', 400);
        }

        const [context, assignedAdmin] = await Promise.all([
            getProductStatusContext(productStatusId),
            assignedAdminId ? getUserSummaryById(assignedAdminId) : Promise.resolve(null),
        ]);

        if (!context) {
            return error(res, 'Product status record not found.', 404);
        }

        if (assignedAdminId && (!assignedAdmin || normalizeRole(assignedAdmin.user_type) !== 'admin')) {
            return error(res, 'Selected user must be an admin.', 400);
        }

        if (!assignedAdminId) {
            const normalizedProductStatusId = normalizeProductStatusId(context.product_status_id || productStatusId);
            await pool.query(
                `DELETE FROM product_status_chat_assignments WHERE product_status_id = $1`,
                [normalizedProductStatusId]
            );
            return success(res, {
                product_status_id: normalizedProductStatusId,
                unassigned: true,
            }, 'Assigned admin removed');
        }

        const result = await pool.query(
            `
                INSERT INTO product_status_chat_assignments (
                    product_status_id, order_number, order_id, buyer_id, seller_id,
                    assigned_admin_id, assigned_by_user_id, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                ON CONFLICT (product_status_id)
                DO UPDATE SET
                    order_number = EXCLUDED.order_number,
                    order_id = EXCLUDED.order_id,
                    buyer_id = EXCLUDED.buyer_id,
                    seller_id = EXCLUDED.seller_id,
                    assigned_admin_id = EXCLUDED.assigned_admin_id,
                    assigned_by_user_id = EXCLUDED.assigned_by_user_id,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `,
            [
                normalizeProductStatusId(context.product_status_id || productStatusId),
                context.order_number || context.product_status_id || productStatusId,
                context.order_id || null,
                context.buyer_id || null,
                context.seller_id || null,
                assignedAdminId,
                userId,
            ]
        );

        const hydrated = await getProductStatusAssignment(result.rows[0].product_status_id);
        return success(res, mapAssignmentRow(hydrated, context), 'Assigned admin updated');
    } catch (err) {
        console.error('assignProductStatusAdmin error:', err);
        return error(res, err.message || 'Server error assigning admin', err.statusCode || 500);
    }
};

exports.listAssignedProductStatusChats = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const requester = await getUserSummaryById(userId);
        if (!requester || !isPrivilegedChatRole(requester.user_type)) {
            return error(res, 'Admin access required.', 403);
        }

        const isSuperAdmin = isSuperAdminRole(requester.user_type);
        const params = [];
        const where = [];

        if (!isSuperAdmin) {
            params.push(userId);
            where.push(`a.assigned_admin_id = $${params.length}`);
        }

        if (req.query.assignedAdminId && isSuperAdmin) {
            params.push(Number(req.query.assignedAdminId));
            where.push(`a.assigned_admin_id = $${params.length}`);
        }

        const result = await pool.query(
            `
                SELECT
                    a.*,
                    admin_user.username AS assigned_admin_username,
                    admin_user.full_name AS assigned_admin_full_name,
                    admin_user.profile_picture AS assigned_admin_profile_picture,
                    admin_user.user_type AS assigned_admin_user_type,
                    buyer.username AS buyer_username,
                    buyer.full_name AS buyer_full_name,
                    seller.username AS seller_username,
                    seller.full_name AS seller_full_name,
                    latest.id AS last_message_id,
                    latest.sender_id AS last_message_sender_id,
                    latest.receiver_id AS last_message_receiver_id,
                    latest.message_text AS last_message_text,
                    latest.message_type AS last_message_type,
                    latest.created_at AS last_message_created_at
                FROM product_status_chat_assignments a
                JOIN users admin_user ON admin_user.id = a.assigned_admin_id
                LEFT JOIN users buyer ON buyer.id = a.buyer_id
                LEFT JOIN users seller ON seller.id = a.seller_id
                LEFT JOIN LATERAL (
                    SELECT id, sender_id, receiver_id, message_text, message_type, created_at
                    FROM chat_messages
                    WHERE product_status_id = a.product_status_id
                      AND deleted_for_everyone = FALSE
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ) latest ON TRUE
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY a.updated_at DESC, a.id DESC
            `,
            params
        );

        return success(
            res,
            result.rows.map((row) => ({
                ...mapAssignmentRow(row),
                buyer: {
                    id: row.buyer_id == null ? null : Number(row.buyer_id),
                    name: row.buyer_full_name || row.buyer_username || 'Buyer',
                    username: row.buyer_username || null,
                    roleLabel: 'Buyer',
                },
                seller: {
                    id: row.seller_id == null ? null : Number(row.seller_id),
                    name: row.seller_full_name || row.seller_username || 'Seller',
                    username: row.seller_username || null,
                    roleLabel: 'Seller',
                },
                last_message: row.last_message_id
                    ? {
                        id: Number(row.last_message_id),
                        sender_id: Number(row.last_message_sender_id),
                        receiver_id: Number(row.last_message_receiver_id),
                        text: row.last_message_text || null,
                        type: row.last_message_type || 'text',
                        created_at: row.last_message_created_at,
                    }
                    : null,
            })),
            'Assigned product-status chats fetched'
        );
    } catch (err) {
        console.error('listAssignedProductStatusChats error:', err);
        return error(res, err.message || 'Server error fetching assigned chats', err.statusCode || 500);
    }
};

exports.getTopupRequestAssignment = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const topupRequestId = Number(req.params.topupRequestId);

        if (!topupRequestId) {
            return error(res, 'Top-up request id is required.', 400);
        }

        const access = await resolveTopupRequestAccess({ userId, topupRequestId });
        const assignment = access.assignment ? {
            id: Number(access.assignment.id),
            topup_request_id: Number(access.assignment.topup_request_id),
            request_user_id: access.assignment.request_user_id == null ? null : Number(access.assignment.request_user_id),
            assigned_admin_id: Number(access.assignment.assigned_admin_id),
            assigned_admin: {
                id: Number(access.assignment.assigned_admin_id),
                name: access.assignment.assigned_admin_username || access.assignment.assigned_admin_full_name || 'Admin',
                username: access.assignment.assigned_admin_username || null,
                profile_picture: access.assignment.assigned_admin_profile_picture || null,
            },
            updated_at: access.assignment.updated_at,
        } : null;

        return success(res, {
            topup_request_id: access.topupRequestId,
            request_user_id: Number(access.context.user_id || 0) || null,
            assignment,
            can_manage_assignment: access.isSuperAdmin,
        }, 'Top-up assignment fetched');
    } catch (err) {
        console.error('getTopupRequestAssignment error:', err);
        return error(res, err.message || 'Server error fetching top-up assignment', err.statusCode || 500);
    }
};

exports.assignTopupRequestAdmin = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        await assertSuperAdmin(userId);

        const topupRequestId = Number(req.params.topupRequestId || req.body.topupRequestId);
        const rawAssignedAdminId = req.body.assignedAdminId;
        const assignedAdminId = rawAssignedAdminId == null || rawAssignedAdminId === ''
            ? null
            : Number(rawAssignedAdminId);

        if (!topupRequestId) {
            return error(res, 'Top-up request id is required.', 400);
        }

        const [context, assignedAdmin] = await Promise.all([
            getTopupRequestContext(topupRequestId),
            assignedAdminId ? getUserSummaryById(assignedAdminId) : Promise.resolve(null),
        ]);

        if (!context) {
            return error(res, 'Top-up request not found.', 404);
        }

        if (assignedAdminId && (!assignedAdmin || normalizeRole(assignedAdmin.user_type) !== 'admin')) {
            return error(res, 'Selected user must be an admin.', 400);
        }

        if (!assignedAdminId) {
            await pool.query(
                `DELETE FROM topup_request_chat_assignments WHERE topup_request_id = $1`,
                [topupRequestId]
            );
            return success(res, {
                topup_request_id: topupRequestId,
                unassigned: true,
            }, 'Assigned admin removed for top-up request');
        }

        await pool.query(
            `
                INSERT INTO topup_request_chat_assignments (
                    topup_request_id, request_user_id, assigned_admin_id, assigned_by_user_id, updated_at
                )
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (topup_request_id)
                DO UPDATE SET
                    request_user_id = EXCLUDED.request_user_id,
                    assigned_admin_id = EXCLUDED.assigned_admin_id,
                    assigned_by_user_id = EXCLUDED.assigned_by_user_id,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [topupRequestId, context.user_id || null, assignedAdminId, userId]
        );

        const hydrated = await getTopupRequestAssignment(topupRequestId);
        return success(res, hydrated, 'Assigned admin updated for top-up request');
    } catch (err) {
        console.error('assignTopupRequestAdmin error:', err);
        return error(res, err.message || 'Server error assigning top-up admin', err.statusCode || 500);
    }
};

exports.listAssignedTopupRequestChats = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const requester = await getUserSummaryById(userId);
        if (!requester || !isPrivilegedChatRole(requester.user_type)) {
            return error(res, 'Admin access required.', 403);
        }

        const isSuperAdmin = isSuperAdminRole(requester.user_type);
        const params = [];
        const where = [];

        if (!isSuperAdmin) {
            params.push(userId);
            where.push(`a.assigned_admin_id = $${params.length}`);
        }

        if (req.query.assignedAdminId && isSuperAdmin) {
            params.push(Number(req.query.assignedAdminId));
            where.push(`a.assigned_admin_id = $${params.length}`);
        }

        const result = await pool.query(
            `
                SELECT
                    a.*,
                    requester_user.username AS request_username,
                    requester_user.full_name AS request_full_name,
                    admin_user.username AS assigned_admin_username,
                    admin_user.full_name AS assigned_admin_full_name,
                    latest.id AS last_message_id,
                    latest.message_text AS last_message_text,
                    latest.created_at AS last_message_created_at
                FROM topup_request_chat_assignments a
                JOIN users admin_user ON admin_user.id = a.assigned_admin_id
                LEFT JOIN users requester_user ON requester_user.id = a.request_user_id
                LEFT JOIN LATERAL (
                    SELECT id, message_text, created_at
                    FROM chat_messages
                    WHERE topup_request_id = a.topup_request_id
                      AND deleted_for_everyone = FALSE
                    ORDER BY created_at DESC, id DESC
                    LIMIT 1
                ) latest ON TRUE
                ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                ORDER BY a.updated_at DESC, a.id DESC
            `,
            params
        );

        return success(res, result.rows.map((row) => ({
            topup_request_id: Number(row.topup_request_id),
            request_user_id: row.request_user_id == null ? null : Number(row.request_user_id),
            requester: {
                id: row.request_user_id == null ? null : Number(row.request_user_id),
                name: row.request_full_name || row.request_username || 'User',
                username: row.request_username || null,
            },
            assigned_admin_id: Number(row.assigned_admin_id),
            assigned_admin: {
                id: Number(row.assigned_admin_id),
                name: row.assigned_admin_username || row.assigned_admin_full_name || 'Admin',
                username: row.assigned_admin_username || null,
            },
            updated_at: row.updated_at,
            last_message: row.last_message_id ? {
                id: Number(row.last_message_id),
                text: row.last_message_text || null,
                created_at: row.last_message_created_at,
            } : null,
        })), 'Assigned top-up chats fetched');
    } catch (err) {
        console.error('listAssignedTopupRequestChats error:', err);
        return error(res, err.message || 'Server error fetching top-up assignments', err.statusCode || 500);
    }
};

exports.hideConversation = async (req, res) => {
    try {
        if (chatService.isRemoteChatServiceEnabled()) {
            const result = await chatService.hideConversation({
                participantId: Number(req.body.participantId),
                userId: Number(req.user.id),
            });
            return res.status(result.statusCode).json(result.payload);
        }

        await ensureChatTables();

        const userId = Number(req.user.id);
        const participantId = Number(req.body.participantId);
        if (!participantId || !Number.isInteger(participantId)) {
            return error(res, 'Invalid participantId', 400);
        }

        // Upsert into chat_presence, appending participantId to hidden_participants if not already present
        await pool.query(
            `INSERT INTO chat_presence (user_id, hidden_participants, last_seen_at, updated_at)
             VALUES ($1, $2::jsonb, NOW(), NOW())
             ON CONFLICT (user_id) DO UPDATE
             SET hidden_participants = (
                 CASE
                     WHEN chat_presence.hidden_participants @> $2::jsonb THEN chat_presence.hidden_participants
                     ELSE chat_presence.hidden_participants || $2::jsonb
                 END
             ),
             updated_at = NOW()`,
            [userId, JSON.stringify([participantId])]
        );

        return success(res, { hidden: participantId }, 'Conversation hidden');
    } catch (err) {
        console.error('hideConversation error:', err);
        return error(res, 'Server error hiding conversation', 500);
    }
};

exports.unhideConversation = async (req, res) => {
    try {
        if (chatService.isRemoteChatServiceEnabled()) {
            const result = await chatService.unhideConversation({
                participantId: Number(req.body.participantId),
                userId: Number(req.user.id),
            });
            return res.status(result.statusCode).json(result.payload);
        }

        await ensureChatTables();

        const userId = Number(req.user.id);
        const participantId = Number(req.body.participantId);
        if (!participantId || !Number.isInteger(participantId)) {
            return error(res, 'Invalid participantId', 400);
        }

        await pool.query(
            `UPDATE chat_presence
             SET hidden_participants = (
                 SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
                 FROM jsonb_array_elements(hidden_participants) AS val
                 WHERE val::text <> $2::text
             ),
             updated_at = NOW()
             WHERE user_id = $1`,
            [userId, participantId]
        );

        return success(res, { unhidden: participantId }, 'Conversation restored');
    } catch (err) {
        console.error('unhideConversation error:', err);
        return error(res, 'Server error restoring conversation', 500);
    }
};

exports.deleteConversation = async (req, res) => {
    try {
        if (chatService.isRemoteChatServiceEnabled()) {
            const result = await chatService.deleteConversation({
                participantId: Number(req.params.participantId || req.body.participantId),
                userId: Number(req.user.id),
            });
            return res.status(result.statusCode).json(result.payload);
        }

        await ensureChatTables();

        const userId = Number(req.user.id);
        const participantId = Number(req.params.participantId || req.body.participantId);
        if (!participantId || !Number.isInteger(participantId) || participantId === userId) {
            return error(res, 'Invalid participantId', 400);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Mark all text/media messages as deleted for this user
            await client.query(
                `
                    UPDATE chat_messages
                    SET deleted_for = CASE
                        WHEN deleted_for ? ($1::text) THEN deleted_for
                        ELSE deleted_for || to_jsonb($1::text)
                    END
                    WHERE ((sender_id = $1 AND receiver_id = $2)
                        OR (sender_id = $2 AND receiver_id = $1))
                      AND deleted_for_everyone = FALSE
                `,
                [userId, participantId]
            );

            // Delete all call signals for calls between these two users
            await client.query(
                `DELETE FROM chat_call_signals
                 WHERE call_id IN (
                     SELECT id FROM chat_call_sessions
                     WHERE (caller_id = $1 AND receiver_id = $2)
                        OR (caller_id = $2 AND receiver_id = $1)
                 )`,
                [userId, participantId]
            );

            // Delete all call sessions between these two users
            await client.query(
                `DELETE FROM chat_call_sessions
                 WHERE (caller_id = $1 AND receiver_id = $2)
                    OR (caller_id = $2 AND receiver_id = $1)`,
                [userId, participantId]
            );

            // Hide the conversation so it never comes back from polling
            await client.query(
                `INSERT INTO chat_presence (user_id, hidden_participants, last_seen_at, updated_at)
                 VALUES ($1, $2::jsonb, NOW(), NOW())
                 ON CONFLICT (user_id) DO UPDATE
                 SET hidden_participants = (
                     CASE
                         WHEN chat_presence.hidden_participants @> $2::jsonb THEN chat_presence.hidden_participants
                         ELSE chat_presence.hidden_participants || $2::jsonb
                     END
                 ),
                 updated_at = NOW()`,
                [userId, JSON.stringify([participantId])]
            );

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        return success(res, { deletedConversation: participantId }, 'Conversation deleted');
    } catch (err) {
        console.error('deleteConversation error:', err);
        return error(res, 'Server error deleting conversation', 500);
    }
};

exports.blockUser = async (req, res) => {
    try {
        if (chatService.isRemoteChatServiceEnabled()) {
            const result = await chatService.blockUser({
                blockedUserId: Number(req.body.userId),
                userId: Number(req.user.id),
            });
            return res.status(result.statusCode).json(result.payload);
        }

        const blockerId = Number(req.user.id);
        const blockedId = Number(req.body.userId);
        if (!blockedId || blockedId === blockerId) return error(res, 'Invalid user', 400);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                `INSERT INTO user_blocks (blocker_id, blocked_user_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [blockerId, blockedId]
            );

            // Mark all messages as deleted for the blocker
            await client.query(
                `UPDATE chat_messages
                 SET deleted_for = CASE
                     WHEN deleted_for ? ($1::text) THEN deleted_for
                     ELSE deleted_for || to_jsonb($1::text)
                 END
                 WHERE ((sender_id = $1 AND receiver_id = $2)
                     OR (sender_id = $2 AND receiver_id = $1))
                   AND deleted_for_everyone = FALSE`,
                [blockerId, blockedId]
            );

            // Delete call records between them
            await client.query(
                `DELETE FROM chat_call_signals WHERE call_id IN (
                     SELECT id FROM chat_call_sessions
                     WHERE (caller_id = $1 AND receiver_id = $2) OR (caller_id = $2 AND receiver_id = $1)
                 )`,
                [blockerId, blockedId]
            );
            await client.query(
                `DELETE FROM chat_call_sessions
                 WHERE (caller_id = $1 AND receiver_id = $2) OR (caller_id = $2 AND receiver_id = $1)`,
                [blockerId, blockedId]
            );

            // Hide conversation from blocker's list
            await client.query(
                `INSERT INTO chat_presence (user_id, hidden_participants, last_seen_at, updated_at)
                 VALUES ($1, $2::jsonb, NOW(), NOW())
                 ON CONFLICT (user_id) DO UPDATE
                 SET hidden_participants = CASE
                     WHEN chat_presence.hidden_participants @> $2::jsonb THEN chat_presence.hidden_participants
                     ELSE chat_presence.hidden_participants || $2::jsonb
                 END, updated_at = NOW()`,
                [blockerId, JSON.stringify([blockedId])]
            );

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        return success(res, { blocked: blockedId }, 'User blocked');
    } catch (err) {
        console.error('blockUser error:', err);
        return error(res, 'Server error blocking user', 500);
    }
};

exports.unblockUser = async (req, res) => {
    try {
        if (chatService.isRemoteChatServiceEnabled()) {
            const result = await chatService.unblockUser({
                blockedUserId: Number(req.body.userId),
                userId: Number(req.user.id),
            });
            return res.status(result.statusCode).json(result.payload);
        }

        const blockerId = Number(req.user.id);
        const blockedId = Number(req.body.userId);
        if (!blockedId || blockedId === blockerId) return error(res, 'Invalid user', 400);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_user_id = $2`,
                [blockerId, blockedId]
            );

            // Remove from hidden_participants so conversation can return
            await client.query(
                `UPDATE chat_presence
                 SET hidden_participants = (
                     SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
                     FROM jsonb_array_elements(hidden_participants) AS val
                     WHERE val::text <> $2::text
                 ), updated_at = NOW()
                 WHERE user_id = $1`,
                [blockerId, blockedId]
            );

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        return success(res, { unblocked: blockedId }, 'User unblocked');
    } catch (err) {
        console.error('unblockUser error:', err);
        return error(res, 'Server error unblocking user', 500);
    }
};

exports.getBlockedUsers = async (req, res) => {
    try {
        if (chatService.isRemoteChatServiceEnabled()) {
            const result = await chatService.getBlockedUsers(Number(req.user.id));
            return res.status(result.statusCode).json(result.payload);
        }

        const userId = Number(req.user.id);
        const result = await pool.query(
            `SELECT u.id, u.username, u.full_name, u.profile_picture, u.user_type, ub.created_at AS blocked_at
             FROM user_blocks ub
             JOIN users u ON u.id = ub.blocked_user_id
             WHERE ub.blocker_id = $1
             ORDER BY ub.created_at DESC`,
            [userId]
        );
        return success(res, result.rows, 'Blocked users fetched');
    } catch (err) {
        console.error('getBlockedUsers error:', err);
        return error(res, 'Server error fetching blocked users', 500);
    }
};

exports.deleteMessages = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);
        const messageIds = Array.isArray(req.body.messageIds)
            ? req.body.messageIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
            : [];
        const mode = String(req.body.mode || 'me') === 'everyone' ? 'everyone' : 'me';
        const io = req.app.get('io');

        if (!messageIds.length) {
            return error(res, 'No messages selected.', 400);
        }

        let affectedRows = [];
        if (mode === 'everyone') {
            const result = await pool.query(
                `
                    UPDATE chat_messages
                    SET deleted_for_everyone = TRUE
                    WHERE id = ANY($2::int[])
                      AND sender_id = $1
                      AND deleted_for_everyone = FALSE
                    RETURNING id, sender_id, receiver_id, client_message_id
                `,
                [userId, messageIds]
            );
            affectedRows = result.rows;
        } else {
            const result = await pool.query(
                `
                    UPDATE chat_messages
                    SET deleted_for = CASE
                        WHEN deleted_for ? ($1::text) THEN deleted_for
                        ELSE deleted_for || to_jsonb($1::text)
                    END
                    WHERE id = ANY($2::int[])
                      AND (sender_id = $1 OR receiver_id = $1)
                      AND deleted_for_everyone = FALSE
                    RETURNING id, sender_id, receiver_id, client_message_id
                `,
                [userId, messageIds]
            );
            affectedRows = result.rows;
        }

        if (io && affectedRows.length > 0) {
            affectedRows.forEach((row) => {
                const payload = {
                    id: Number(row.id),
                    sender_id: Number(row.sender_id),
                    receiver_id: Number(row.receiver_id),
                    client_message_id: row.client_message_id || null,
                    mode,
                    deleted_for_user_id: mode === 'me' ? userId : null,
                };
                io.to(userRoom(userId)).emit('chat:message_deleted', payload);
                if (mode === 'everyone') {
                    io.to(userRoom(payload.sender_id)).emit('chat:message_deleted', payload);
                    io.to(userRoom(payload.receiver_id)).emit('chat:message_deleted', payload);
                }
            });
        }

        return success(res, { deleted: messageIds, mode }, 'Messages deleted');
    } catch (err) {
        console.error('deleteMessages error:', err);
        return error(res, 'Server error deleting messages', 500);
    }
};

exports.startCall = async (req, res) => {
    try {
        await ensureChatTables();

        const callerId = Number(req.user.id);
        
        const callType = req.body.callType;
        const receiverId = Number(req.body.receiverId);
        const offer = req.body.offer;

        if (!receiverId || receiverId === callerId) {
            return error(res, 'Invalid receiver selected for this call.', 400);
        }

        if (!CALL_TYPES.has(callType)) {
            return error(res, 'Invalid call type.', 400);
        }

        // Only check the CALLER's plan for outgoing calls.
        // The receiver can always receive calls as long as they have any active subscription.
        const limits = await getUserPlanLimits(callerId);
        if (callType === 'voice' && !limits.voiceCalls) {
            return error(res, 'Voice calls are not allowed on your current plan. Please upgrade.', 403);
        }
        if (callType === 'video') {
            const callerCanVideo = await userCanUseVideoCall(callerId);
            if (!callerCanVideo) {
                return error(res, 'Video calls are not enabled on your current plan. Please upgrade.', 403);
            }
        }
        // Receiver must have an active subscription to receive calls.
        const receiverActive = await userHasActiveSubscription(receiverId);
        if (!receiverActive) {
            return error(res, 'This user does not have an active subscription and cannot receive calls.', 403);
        }

        if (!offer || typeof offer !== 'object') {
            return error(res, 'WebRTC offer is required to start a call.', 400);
        }

            const client = await pool.connect();
            const encryption = getCallEncryptionMetadata();

        try {
            await client.query('BEGIN');

            const callResult = await client.query(
                `
                    INSERT INTO chat_call_sessions (
                        caller_id, receiver_id, call_type, call_status, encryption
                    )
                    VALUES ($1, $2, $3, 'ringing', $4::jsonb)
                    RETURNING *
                `,
                [callerId, receiverId, callType, JSON.stringify(encryption)]
            );

            const call = callResult.rows[0];

            const signalResult = await client.query(
                `
                    INSERT INTO chat_call_signals (
                        call_id, sender_id, receiver_id, signal_type, payload
                    )
                    VALUES ($1, $2, $3, 'offer', $4::jsonb)
                    RETURNING id
                `,
                [call.id, callerId, receiverId, JSON.stringify({ ...offer, encryption })]
            );

            await client.query('COMMIT');

            const detailedCall = await getCallWithUsers(call.id);

            return success(
                res,
                {
                    call: mapCallRow(detailedCall, callerId),
                    offer_signal_id: Number(signalResult.rows[0].id),
                },
                'Call started successfully'
            );
        } catch (transactionError) {
            await client.query('ROLLBACK');
            throw transactionError;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('startCall error:', err);
        return error(res, 'Server error starting call', 500);
    }
};

exports.getIncomingCalls = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        await normalizeExpiredCalls(userId);

        const result = await pool.query(
            `
                SELECT
                    s.*,
                    CASE
                        WHEN LOWER(COALESCE(caller.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(caller.user_type, '')) = 'admin' THEN COALESCE(caller.username, caller.full_name)
                        ELSE COALESCE(caller.full_name, caller.username)
                    END AS caller_name,
                    caller.username AS caller_username,
                    caller.profile_picture AS caller_profile_picture,
                    CASE
                        WHEN LOWER(COALESCE(receiver.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(receiver.user_type, '')) = 'admin' THEN COALESCE(receiver.username, receiver.full_name)
                        ELSE COALESCE(receiver.full_name, receiver.username)
                    END AS receiver_name,
                    receiver.username AS receiver_username,
                    receiver.profile_picture AS receiver_profile_picture
                FROM chat_call_sessions s
                JOIN users caller ON caller.id = s.caller_id
                JOIN users receiver ON receiver.id = s.receiver_id
                WHERE s.receiver_id = $1
                  AND s.call_status = 'ringing'
                ORDER BY s.created_at DESC
            `,
            [userId]
        );

        const calls = await Promise.all(result.rows.map(async (row) => ({
            ...mapCallRow(row, userId),
            offer: await getLatestOfferPayload(row.id),
        })));

        return success(res, calls, 'Incoming calls fetched');
    } catch (err) {
        console.error('getIncomingCalls error:', err);
        return error(res, 'Server error fetching incoming calls', 500);
    }
};

exports.getCall = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        await normalizeExpiredCalls(userId);

        const call = await getCallWithUsers(Number(req.params.callId));

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.caller_id) !== userId && Number(call.receiver_id) !== userId) {
            return error(res, 'Not authorized to view this call', 403);
        }

        return success(res, mapCallRow(call, userId), 'Call fetched');
    } catch (err) {
        console.error('getCall error:', err);
        return error(res, 'Server error fetching call', 500);
    }
};

exports.acceptCall = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const userId = Number(req.user.id);
        const answer = req.body.answer;

        if (!answer || typeof answer !== 'object') {
            return error(res, 'WebRTC answer is required to accept a call.', 400);
        }

        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== userId) {
            return error(res, 'Only the receiver can accept this call.', 403);
        }

        if (call.call_status !== 'ringing') {
            return error(res, `This call is already ${call.call_status}.`, 400);
        }

        // Any active subscriber can receive/accept both voice and video calls.
        const canReceive = await userHasActiveSubscription(userId);
        if (!canReceive) {
            return error(res, 'You need an active subscription to receive calls.', 403);
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            await client.query(
                `
                    UPDATE chat_call_sessions
                    SET call_status = 'active',
                        answered_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `,
                [callId]
            );

            await client.query(
                `
                    INSERT INTO chat_call_signals (
                        call_id, sender_id, receiver_id, signal_type, payload
                    )
                    VALUES ($1, $2, $3, 'answer', $4::jsonb)
                `,
                [callId, userId, call.caller_id, JSON.stringify({ ...answer, encryption: call.encryption || getCallEncryptionMetadata() })]
            );

            await client.query('COMMIT');

            const updatedCall = await getCallWithUsers(callId);
            return success(res, mapCallRow(updatedCall, userId), 'Call accepted');
        } catch (transactionError) {
            await client.query('ROLLBACK');
            throw transactionError;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('acceptCall error:', err);
        return error(res, 'Server error accepting call', 500);
    }
};

exports.rejectCall = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const userId = Number(req.user.id);
        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== userId && Number(call.caller_id) !== userId) {
            return error(res, 'Not authorized to reject this call', 403);
        }

        if (!['ringing', 'active'].includes(call.call_status)) {
            return success(res, mapCallRow(call, userId), 'Call already closed');
        }

        await pool.query(
            `
                UPDATE chat_call_sessions
                SET call_status = 'rejected',
                    ended_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `,
            [callId]
        );

        const updatedCall = await getCallWithUsers(callId);
        return success(res, mapCallRow(updatedCall, userId), 'Call rejected');
    } catch (err) {
        console.error('rejectCall error:', err);
        return error(res, 'Server error rejecting call', 500);
    }
};

exports.completeCall = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const userId = Number(req.user.id);
        const requestedStatus = req.body.status;
        const finalStatus = CALL_STATUSES.has(requestedStatus) ? requestedStatus : 'completed';

        if (!['completed', 'missed', 'rejected'].includes(finalStatus)) {
            return error(res, 'Invalid final call status.', 400);
        }

        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== userId && Number(call.caller_id) !== userId) {
            return error(res, 'Not authorized to end this call', 403);
        }

        await pool.query(
            `
                UPDATE chat_call_sessions
                SET call_status = $2,
                    ended_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `,
            [callId, finalStatus]
        );

        const updatedCall = await getCallWithUsers(callId);
        return success(res, mapCallRow(updatedCall, userId), 'Call updated');
    } catch (err) {
        console.error('completeCall error:', err);
        return error(res, 'Server error updating call', 500);
    }
};

exports.sendSignal = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const senderId = Number(req.user.id);
        const receiverId = Number(req.body.receiverId);
        const signalType = req.body.signalType;
        const payload = req.body.payload;

        if (!receiverId) {
            return error(res, 'Signal receiver is required.', 400);
        }

        if (!ACTIVE_SIGNAL_TYPES.has(signalType)) {
            return error(res, 'Unsupported signal type.', 400);
        }

        if (!payload || typeof payload !== 'object') {
            return error(res, 'Signal payload is required.', 400);
        }

        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== senderId && Number(call.caller_id) !== senderId) {
            return error(res, 'Not authorized to signal this call', 403);
        }

        const signalResult = await pool.query(
            `
                INSERT INTO chat_call_signals (
                    call_id, sender_id, receiver_id, signal_type, payload
                )
                VALUES ($1, $2, $3, $4, $5::jsonb)
                RETURNING id, created_at
            `,
            [callId, senderId, receiverId, signalType, JSON.stringify({ ...payload, encryption: call.encryption || getCallEncryptionMetadata() })]
        );

        return success(res, signalResult.rows[0], 'Signal sent');
    } catch (err) {
        console.error('sendSignal error:', err);
        return error(res, 'Server error sending call signal', 500);
    }
};

exports.getSignals = async (req, res) => {
    try {
        await ensureChatTables();

        const callId = Number(req.params.callId);
        const userId = Number(req.user.id);
        const since = Number(req.query.since || 0);
        const call = await getCallWithUsers(callId);

        if (!call) {
            return error(res, 'Call not found', 404);
        }

        if (Number(call.receiver_id) !== userId && Number(call.caller_id) !== userId) {
            return error(res, 'Not authorized to view this call', 403);
        }

        const result = await pool.query(
            `
                SELECT id, sender_id, receiver_id, signal_type, payload, created_at
                FROM chat_call_signals
                WHERE call_id = $1
                  AND receiver_id = $2
                  AND id > $3
                ORDER BY id ASC
            `,
            [callId, userId, since]
        );

        return success(
            res,
            result.rows.map((row) => ({
                id: Number(row.id),
                sender_id: Number(row.sender_id),
                receiver_id: Number(row.receiver_id),
                signal_type: row.signal_type,
                payload: row.payload,
                createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
                created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
            })),
            'Signals fetched'
        );
    } catch (err) {
        console.error('getSignals error:', err);
        return error(res, 'Server error fetching call signals', 500);
    }
};

exports.getCallHistory = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        const participantId = Number(req.params.participantId);

        await normalizeExpiredCalls(userId);

        const result = await pool.query(
            `
                SELECT
                    s.*,
                    CASE
                        WHEN LOWER(COALESCE(caller.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(caller.user_type, '')) = 'admin' THEN COALESCE(caller.username, caller.full_name)
                        ELSE COALESCE(caller.full_name, caller.username)
                    END AS caller_name,
                    caller.username AS caller_username,
                    caller.profile_picture AS caller_profile_picture,
                    CASE
                        WHEN LOWER(COALESCE(receiver.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(receiver.user_type, '')) = 'admin' THEN COALESCE(receiver.username, receiver.full_name)
                        ELSE COALESCE(receiver.full_name, receiver.username)
                    END AS receiver_name,
                    receiver.username AS receiver_username,
                    receiver.profile_picture AS receiver_profile_picture
                FROM chat_call_sessions s
                JOIN users caller ON caller.id = s.caller_id
                JOIN users receiver ON receiver.id = s.receiver_id
                WHERE (s.caller_id = $1 AND s.receiver_id = $2)
                   OR (s.caller_id = $2 AND s.receiver_id = $1)
                ORDER BY s.created_at ASC, s.id ASC
            `,
            [userId, participantId]
        );

        return success(
            res,
            result.rows.map((row) => mapCallRow(row, userId)),
            'Call history fetched'
        );
    } catch (err) {
        console.error('getCallHistory error:', err);
        return error(res, 'Server error fetching call history', 500);
    }
};

exports.getCallSummaries = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        await normalizeExpiredCalls(userId);

        const result = await pool.query(
            `
                WITH conversation_calls AS (
                    SELECT
                        s.*,
                        CASE
                            WHEN s.caller_id = $1 THEN s.receiver_id
                            ELSE s.caller_id
                        END AS participant_id
                    FROM chat_call_sessions s
                    WHERE s.caller_id = $1 OR s.receiver_id = $1
                )
                SELECT DISTINCT ON (cc.participant_id)
                    cc.*,
                    CASE
                        WHEN LOWER(COALESCE(caller.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(caller.user_type, '')) = 'admin' THEN COALESCE(caller.username, caller.full_name)
                        ELSE COALESCE(caller.full_name, caller.username)
                    END AS caller_name,
                    caller.username AS caller_username,
                    caller.profile_picture AS caller_profile_picture,
                    CASE
                        WHEN LOWER(COALESCE(receiver.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(receiver.user_type, '')) = 'admin' THEN COALESCE(receiver.username, receiver.full_name)
                        ELSE COALESCE(receiver.full_name, receiver.username)
                    END AS receiver_name,
                    receiver.username AS receiver_username,
                    receiver.profile_picture AS receiver_profile_picture,
                    CASE
                        WHEN LOWER(COALESCE(participant.user_type, '')) IN ('superadmin', 'super_admin') THEN 'Googer Support'
                        WHEN LOWER(COALESCE(participant.user_type, '')) = 'admin' THEN COALESCE(participant.username, participant.full_name)
                        ELSE COALESCE(participant.full_name, participant.username)
                    END AS participant_name,
                    participant.username AS participant_username,
                    participant.profile_picture AS participant_profile_picture
                FROM conversation_calls cc
                JOIN users caller ON caller.id = cc.caller_id
                JOIN users receiver ON receiver.id = cc.receiver_id
                JOIN users participant ON participant.id = cc.participant_id
                ORDER BY cc.participant_id, cc.created_at DESC, cc.id DESC
            `,
            [userId]
        );

        const summaries = result.rows.map((row) => ({
            participant: {
                id: Number(row.participant_id),
                name: row.participant_name,
                username: row.participant_username,
                profile_picture: row.participant_profile_picture,
            },
            last_call: mapCallRow(row, userId),
        }));

        return success(res, summaries, 'Call summaries fetched');
    } catch (err) {
        console.error('getCallSummaries error:', err);
        return error(res, 'Server error fetching call summaries', 500);
    }
};

exports.updateTyping = async (req, res) => {
    try {
        await ensureChatTables();

        const userId = Number(req.user.id);

        await pool.query(
            `
                INSERT INTO chat_presence (user_id, last_seen_at, updated_at, typing_until)
                VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '4 seconds')
                ON CONFLICT (user_id)
                DO UPDATE SET
                    typing_until = CURRENT_TIMESTAMP + INTERVAL '4 seconds',
                    updated_at = CURRENT_TIMESTAMP
            `,
            [userId]
        );

        return success(res, { ok: true }, 'Typing updated');
    } catch (err) {
        console.error('updateTyping error:', err);
        return error(res, 'Server error updating typing', 500);
    }
};

exports.getTyping = async (req, res) => {
    try {
        await ensureChatTables();

        const participantId = Number(req.params.participantId);

        const result = await pool.query(
            `
                SELECT typing_until
                FROM chat_presence
                WHERE user_id = $1
                LIMIT 1
            `,
            [participantId]
        );

        const typingUntil = result.rows[0]?.typing_until;
        const isTyping = typingUntil && new Date(typingUntil).getTime() > Date.now();

        return success(res, { is_typing: !!isTyping }, 'Typing status fetched');
    } catch (err) {
        console.error('getTyping error:', err);
        return error(res, 'Server error fetching typing', 500);
    }
};
