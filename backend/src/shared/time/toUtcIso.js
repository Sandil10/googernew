const toUtcIso = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)
        ? `${raw.replace(' ', 'T')}Z`
        : raw;
    const date = new Date(normalized);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

module.exports = {
    toUtcIso,
};
