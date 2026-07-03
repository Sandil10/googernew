const ADMIN_ROLE_ALIASES = Object.freeze([
    'admin',
    'super_admin',
    'superadmin',
    'employee',
    'administrator',
]);

function normalizeRole(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
}

function isAdminRole(value) {
    return ADMIN_ROLE_ALIASES.includes(normalizeRole(value));
}

module.exports = {
    ADMIN_ROLE_ALIASES,
    normalizeRole,
    isAdminRole,
};
