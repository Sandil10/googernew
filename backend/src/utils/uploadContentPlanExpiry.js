const parseExtra = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return {};
    }
};

const getPlanExpiryPolicy = (plan) => {
    const extra = parseExtra(plan?.extra);
    const rawUnit = String(extra.content_expiry_unit || 'unlimited').toLowerCase();
    const allowedUnits = new Set(['minutes', 'hours', 'days', 'months', 'unlimited']);
    const unit = allowedUnits.has(rawUnit) ? rawUnit : 'unlimited';
    const rawValue = Number(extra.content_expiry_value ?? 1);
    const value = Number.isFinite(rawValue) ? Math.max(1, Math.floor(rawValue)) : 1;
    return { unit, value };
};

const findBasicPlan = async (queryable) => {
    const result = await queryable.query(
        `SELECT id, slug, name, price, is_free, extra
         FROM subscription_plans
         WHERE slug = 'basic'
         ORDER BY is_default DESC, id ASC
         LIMIT 1`
    );
    return result.rows[0] || null;
};

const syncUserApprovedUploadsToPlan = async (queryable, userId, plan) => {
    if (!userId || !plan?.id) return 0;
    const { unit, value } = getPlanExpiryPolicy(plan);
    const isPaid = Number(plan.price || 0) > 0 && plan.is_free !== true;
    const result = await queryable.query(
        `UPDATE upload_contents
         SET approval_plan_id = $2,
             approval_plan_slug = $3,
             approval_plan_is_paid = $4,
             approval_expiry_value = CASE WHEN $5 = 'unlimited' THEN NULL ELSE $6::int END,
             approval_expiry_unit = $5,
             basic_fallback_owner_only = CASE
                 WHEN $4 = FALSE AND COALESCE(approval_plan_is_paid, FALSE) = TRUE THEN TRUE
                 WHEN $4 = TRUE THEN FALSE
                 ELSE COALESCE(basic_fallback_owner_only, FALSE)
             END,
             expires_at = CASE
                 WHEN $5 = 'unlimited' THEN NULL
                 WHEN $4 = FALSE AND COALESCE(approval_plan_is_paid, FALSE) = TRUE THEN
                     CASE $5
                         WHEN 'minutes' THEN CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 minute')
                         WHEN 'hours' THEN CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 hour')
                         WHEN 'days' THEN CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 day')
                         WHEN 'months' THEN CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 month')
                     END
                 ELSE
                     CASE $5
                         WHEN 'minutes' THEN approved_at + ($6::int * INTERVAL '1 minute')
                         WHEN 'hours' THEN approved_at + ($6::int * INTERVAL '1 hour')
                         WHEN 'days' THEN approved_at + ($6::int * INTERVAL '1 day')
                         WHEN 'months' THEN approved_at + ($6::int * INTERVAL '1 month')
                     END
             END,
             updated_at = NOW()
         WHERE user_id = $1
           AND status = 'Approved'
           AND approved_at IS NOT NULL`,
        [Number(userId), Number(plan.id), String(plan.slug || ''), isPaid, unit, value]
    );
    return result.rowCount || 0;
};

const syncUserApprovedUploadsToBasic = async (queryable, userId) => {
    const basicPlan = await findBasicPlan(queryable);
    if (!basicPlan) return 0;
    return syncUserApprovedUploadsToPlan(queryable, userId, basicPlan);
};

const syncUsersWithoutActivePaidPlanToBasic = async (queryable, userId = null, graceSeconds = 0) => {
    const normalizedGraceSeconds = Math.max(0, Math.floor(Number(graceSeconds) || 0));
    const params = [normalizedGraceSeconds];
    const userFilter = userId ? `AND uc.user_id = $2` : '';
    if (userId) params.push(Number(userId));
    const result = await queryable.query(
        `SELECT DISTINCT uc.user_id
         FROM upload_contents uc
         WHERE uc.status = 'Approved'
           AND COALESCE(uc.approval_plan_is_paid, FALSE) = TRUE
           ${userFilter}
           AND NOT EXISTS (
               SELECT 1
               FROM user_plan_subscriptions ups
               INNER JOIN subscription_plans sp ON sp.id = ups.plan_id
               WHERE ups.user_id = uc.user_id
                 AND ups.status = 'active'
                 AND COALESCE(sp.price, 0) > 0
                 AND (
                    ups.expires_at IS NULL
                    OR ups.expires_at + (
                        COALESCE(NULLIF(sp.extra->>'grace_period_value', '')::numeric, $1) *
                        CASE LOWER(COALESCE(sp.extra->>'grace_period_unit', 'days'))
                            WHEN 'minutes' THEN INTERVAL '1 minute'
                            WHEN 'hours' THEN INTERVAL '1 hour'
                            WHEN 'days' THEN INTERVAL '1 day'
                            ELSE INTERVAL '1 second'
                        END
                    ) > NOW()
                 )
           )`,
        params
    );

    let updated = 0;
    for (const row of result.rows) {
        updated += await syncUserApprovedUploadsToBasic(queryable, row.user_id);
    }
    return updated;
};

// Permanently remove content as soon as its effective expiry is reached.
// Until this runs, expiry queries hide the row from every feed.
const deleteExpiredUploadContents = async (queryable, fallbackGraceSeconds = 0) => {
    const graceSeconds = Math.max(0, Math.floor(Number(fallbackGraceSeconds) || 0));
    const result = await queryable.query(
        `DELETE FROM upload_contents uc
         WHERE LOWER(COALESCE(uc.status, '')) = 'approved'
           AND uc.expires_at IS NOT NULL
           AND uc.expires_at <= NOW()
           AND NOT EXISTS (
               SELECT 1
               FROM user_plan_subscriptions grace_sub
               INNER JOIN subscription_plans grace_plan ON grace_plan.id = grace_sub.plan_id
               WHERE grace_sub.user_id = uc.user_id
                 AND grace_sub.status = 'active'
                 AND COALESCE(grace_plan.price, 0) > 0
                 AND grace_sub.expires_at IS NOT NULL
                 AND grace_sub.expires_at <= NOW()
                 AND grace_sub.expires_at + (
                     COALESCE(NULLIF(grace_plan.extra->>'grace_period_value', '')::numeric, $1) *
                     CASE LOWER(COALESCE(grace_plan.extra->>'grace_period_unit', 'seconds'))
                         WHEN 'minutes' THEN INTERVAL '1 minute'
                         WHEN 'hours' THEN INTERVAL '1 hour'
                         WHEN 'days' THEN INTERVAL '1 day'
                         ELSE INTERVAL '1 second'
                     END
                 ) > NOW()
           )
         RETURNING uc.id`,
        [graceSeconds]
    );
    return result.rowCount || 0;
};

module.exports = {
    getPlanExpiryPolicy,
    syncUserApprovedUploadsToBasic,
    syncUserApprovedUploadsToPlan,
    syncUsersWithoutActivePaidPlanToBasic,
    deleteExpiredUploadContents,
};
