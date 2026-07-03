const walletRepository = require('./walletRepository');

const TRANSACTION_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
}

function encodeBase62(value) {
    if (!value) return '0';
    let current = value;
    let encoded = '';
    while (current > 0) {
        encoded = TRANSACTION_ID_ALPHABET[current % TRANSACTION_ID_ALPHABET.length] + encoded;
        current = Math.floor(current / TRANSACTION_ID_ALPHABET.length);
    }
    return encoded;
}

function formatManualPaymentDisplayTransactionId(value) {
    const normalized = String(value ?? '').replace(/\D/g, '').trim() || '0';
    const digitsOnly = `${hashString(`manual:${normalized}`)}${normalized}${hashString(`manual:receipt:${normalized}`)}`.replace(/\D/g, '');
    return digitsOnly.slice(0, 10).padEnd(10, '0');
}

function formatGenericDisplayTransactionId(value) {
    const normalized = String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').trim();
    if (!normalized) return 'G35hfSj5g7';

    const body = normalized.replace(/^[gG]/, '');
    if (body && /[A-Za-z]/.test(body) && /\d/.test(body)) {
        return `G${body}`;
    }

    const seed = body || '0';
    const hashedPrefix = encodeBase62(hashString(`googer:${seed}`));
    const hashedSuffix = encodeBase62(hashString(`wallet:${seed}`));
    let mixedBody = `${hashedPrefix}${seed}${hashedSuffix}`.replace(/[^a-zA-Z0-9]/g, '');

    if (!/[A-Za-z]/.test(mixedBody)) mixedBody += 'hfSj';
    if (!/\d/.test(mixedBody)) mixedBody += '357';

    mixedBody = mixedBody.slice(0, 9).padEnd(9, '7');
    return `G${mixedBody}`;
}

function toUtcIso(value) {
    if (!value) return null;
    const normalized = String(value).trim();
    return new Date(normalized.includes('T') || normalized.endsWith('Z') ? normalized : `${normalized.replace(' ', 'T')}Z`).toISOString();
}

function mapWalletTransferRow(row) {
    if (!row) return row;

    const mapped = {
        ...row,
        created_at: toUtcIso(row.created_at),
        updated_at: toUtcIso(row.updated_at),
        transaction_timestamp: toUtcIso(row.created_at),
    };

    if (String(mapped.type || '').toLowerCase() === 'order_hold' && /manual payment/i.test(String(mapped.note || ''))) {
        mapped.transaction_id = formatManualPaymentDisplayTransactionId(mapped.id);
        return mapped;
    }

    if (!mapped.transaction_id && mapped.id) {
        mapped.transaction_id = formatGenericDisplayTransactionId(mapped.id);
    }

    return mapped;
}

const searchUsers = async ({ query, viewerUserId, includeSelf }) => {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
        const error = new Error('Query too short');
        error.statusCode = 400;
        throw error;
    }

    const result = await walletRepository.searchUsers({
        includeSelf,
        query: normalizedQuery,
        viewerUserId,
    });

    return {
        success: true,
        users: result.rows,
    };
};

const getTransactionHistory = async (userId) => {
    const result = await walletRepository.getTransactionHistory(userId);
    return {
        success: true,
        transactions: result.rows.map(mapWalletTransferRow),
    };
};

const getPendingRequests = async (userId) => {
    const result = await walletRepository.getPendingRequests(userId);
    return {
        success: true,
        requests: result.rows,
    };
};

const getAllTransactionsAdmin = async () => {
    const result = await walletRepository.getAllTransactionsAdmin();
    return {
        success: true,
        transactions: result.rows.map(mapWalletTransferRow),
    };
};

module.exports = {
    getAllTransactionsAdmin,
    getPendingRequests,
    getTransactionHistory,
    mapWalletTransferRow,
    searchUsers,
};
