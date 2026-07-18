const uniqueViewerIdentitySql = (alias, ipAddressColumn = 'ip_address') => {
    const parts = [`${alias}.user_id::text`, `NULLIF(${alias}.viewer_key, '')`];
    if (ipAddressColumn) parts.push(`NULLIF(${alias}.${ipAddressColumn}, '')`);
    return `COALESCE(${parts.join(', ')})`;
};

const buildHomeReachMetricsSql = ({
    targetAlias,
    targetIdColumn = 'id',
    viewsTable,
    viewTargetColumn,
    likesTable,
    likeTargetColumn,
    ageDays,
    initialWindowMinutes,
    stageSize = 8,
    requiredLikes = 3,
    viewTimestampColumn,
    likeTimestampColumn = 'created_at',
    startTimestampColumn = 'created_at',
    viewIpAddressColumn = 'ip_address',
    metricsAlias = 'home_reach',
}) => {
    const viewIdentity = uniqueViewerIdentitySql('v', viewIpAddressColumn);
    const viewTimestamp = `v.${viewTimestampColumn}`;
    const targetStartTimestamp = startTimestampColumn && startTimestampColumn !== 'created_at'
        ? `COALESCE(${targetAlias}.${startTimestampColumn}, ${targetAlias}.created_at)`
        : `${targetAlias}.created_at`;
    const windowMinutes = Number.isFinite(Number(initialWindowMinutes))
        ? Math.max(1, Math.floor(Number(initialWindowMinutes)))
        : Math.max(1, Math.floor(Number(ageDays || 1) * 1440));
    const stageReachSize = Math.max(1, Math.floor(Number(stageSize) || 8));
    const stageLikeRequirement = Math.max(1, Math.floor(Number(requiredLikes) || 3));

    return `LEFT JOIN LATERAL (
        WITH unique_views AS (
            SELECT
                ${viewIdentity} AS viewer_identity,
                MIN(${viewTimestamp}) AS first_seen_at
            FROM ${viewsTable} v
            WHERE v.${viewTargetColumn} = ${targetAlias}.${targetIdColumn}
              AND ${viewIdentity} IS NOT NULL
            GROUP BY ${viewIdentity}
        ),
        ranked_views AS (
            SELECT
                viewer_identity,
                first_seen_at,
                ROW_NUMBER() OVER (ORDER BY first_seen_at ASC, viewer_identity ASC) AS reach_rank
            FROM unique_views
        ),
        reach_summary AS (
            SELECT
                COUNT(*)::int AS unique_reach_count,
                FLOOR(COUNT(*)::numeric / ${stageReachSize})::int AS current_stage_index,
                ((FLOOR(COUNT(*)::numeric / ${stageReachSize})::int * ${stageReachSize}) + 1)::int AS current_stage_start_rank,
                (((FLOOR(COUNT(*)::numeric / ${stageReachSize})::int + 1) * ${stageReachSize}))::int AS current_stage_end_rank,
                CASE
                    WHEN FLOOR(COUNT(*)::numeric / ${stageReachSize})::int <= 0 THEN NULL
                    ELSE (((FLOOR(COUNT(*)::numeric / ${stageReachSize})::int - 1) * ${stageReachSize}) + 1)::int
                END AS previous_stage_start_rank,
                CASE
                    WHEN FLOOR(COUNT(*)::numeric / ${stageReachSize})::int <= 0 THEN NULL
                    ELSE (FLOOR(COUNT(*)::numeric / ${stageReachSize})::int * ${stageReachSize})::int
                END AS previous_stage_end_rank
            FROM ranked_views
        ),
        stage_state AS (
            SELECT
                rs.unique_reach_count,
                rs.current_stage_index,
                rs.current_stage_start_rank,
                rs.current_stage_end_rank,
                rs.previous_stage_start_rank,
                rs.previous_stage_end_rank,
                COUNT(rv.viewer_identity) FILTER (
                    WHERE rv.reach_rank BETWEEN rs.current_stage_start_rank AND rs.current_stage_end_rank
                )::int AS current_stage_reach_count,
                MIN(rv.first_seen_at) FILTER (
                    WHERE rv.reach_rank BETWEEN rs.current_stage_start_rank AND rs.current_stage_end_rank
                ) AS current_stage_started_at
            FROM reach_summary rs
            LEFT JOIN ranked_views rv ON TRUE
            GROUP BY
                rs.unique_reach_count,
                rs.current_stage_index,
                rs.current_stage_start_rank,
                rs.current_stage_end_rank,
                rs.previous_stage_start_rank,
                rs.previous_stage_end_rank
        ),
        like_counts AS (
            SELECT
                ss.unique_reach_count,
                ss.current_stage_index,
                ss.current_stage_reach_count,
                ss.current_stage_started_at,
                COUNT(DISTINCT l.user_id) FILTER (
                    WHERE rv_like.reach_rank BETWEEN 1 AND ${stageReachSize}
                ) AS likes_first_stage,
                COUNT(DISTINCT l.user_id) FILTER (
                    WHERE ss.previous_stage_start_rank IS NOT NULL
                      AND rv_like.reach_rank BETWEEN ss.previous_stage_start_rank AND ss.previous_stage_end_rank
                ) AS likes_previous_stage,
                COUNT(DISTINCT l.user_id) FILTER (
                    WHERE rv_like.reach_rank BETWEEN ss.current_stage_start_rank AND ss.current_stage_end_rank
                ) AS likes_current_stage
            FROM stage_state ss
            LEFT JOIN ${likesTable} l ON l.${likeTargetColumn} = ${targetAlias}.${targetIdColumn}
            LEFT JOIN ranked_views rv_like ON rv_like.viewer_identity = l.user_id::text
            GROUP BY
                ss.unique_reach_count,
                ss.current_stage_index,
                ss.current_stage_reach_count,
                ss.current_stage_started_at,
                ss.previous_stage_start_rank,
                ss.previous_stage_end_rank,
                ss.current_stage_start_rank,
                ss.current_stage_end_rank
        )
        SELECT
            COALESCE(lc.unique_reach_count, 0)::int AS unique_reach_count,
            COALESCE(lc.likes_first_stage, 0)::int AS stage_200_likes,
            COALESCE(lc.likes_current_stage, 0)::int AS stage_500_new_likes,
            COALESCE(lc.likes_current_stage, 0)::int AS stage_2000_new_likes,
            COALESCE(lc.likes_current_stage, 0)::int AS stage_10000_new_likes,
            COALESCE(lc.likes_current_stage, 0)::int AS stage_50000_new_likes,
            (COALESCE(lc.current_stage_index, 0) + 1)::int AS home_reach_stage_rank,
            ((COALESCE(lc.current_stage_index, 0) + 1) * ${stageReachSize})::text AS home_reach_stage,
            ((COALESCE(lc.current_stage_index, 0) + 1) * ${stageReachSize})::int AS home_reach_cap,
            ${stageLikeRequirement}::int AS stage_50000_required_likes,
            (
                (COALESCE(lc.unique_reach_count, 0) < ${stageReachSize}
                    AND (${targetStartTimestamp} >= NOW() - INTERVAL '${windowMinutes} minutes'
                         OR COALESCE(lc.likes_first_stage, 0) >= ${stageLikeRequirement}))
                OR (COALESCE(lc.current_stage_index, 0) > 0
                    AND COALESCE(lc.current_stage_reach_count, 0) < ${stageReachSize}
                    AND COALESCE(lc.likes_previous_stage, lc.likes_first_stage, 0) >= ${stageLikeRequirement}
                    AND (
                        lc.current_stage_started_at IS NULL
                        OR lc.current_stage_started_at >= NOW() - INTERVAL '${windowMinutes} minutes'
                        OR COALESCE(lc.likes_current_stage, 0) >= ${stageLikeRequirement}
                    ))
            ) AS home_can_reach
        FROM like_counts lc
    ) ${metricsAlias} ON TRUE`;
};

const buildHomeReachGateSql = (metricsAlias = 'home_reach') => `COALESCE(${metricsAlias}.home_can_reach, false)`;

const buildHomeReachOrderSql = (metricsAlias = 'home_reach') => `
    COALESCE(${metricsAlias}.home_reach_stage_rank, 1) DESC,
    COALESCE(${metricsAlias}.stage_50000_new_likes, 0) DESC,
    COALESCE(${metricsAlias}.stage_10000_new_likes, 0) DESC,
    COALESCE(${metricsAlias}.stage_2000_new_likes, 0) DESC,
    COALESCE(${metricsAlias}.stage_500_new_likes, 0) DESC,
    COALESCE(${metricsAlias}.stage_200_likes, 0) DESC,
    COALESCE(${metricsAlias}.unique_reach_count, 0) DESC
`;

module.exports = {
    buildHomeReachGateSql,
    buildHomeReachMetricsSql,
    buildHomeReachOrderSql,
};
