const TRANSACTION_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const hashString = (value: string) => {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash);
};

const encodeBase62 = (value: number) => {
    if (!value) return "0";

    let current = value;
    let encoded = "";

    while (current > 0) {
        encoded = TRANSACTION_ID_ALPHABET[current % TRANSACTION_ID_ALPHABET.length] + encoded;
        current = Math.floor(current / TRANSACTION_ID_ALPHABET.length);
    }

    return encoded;
};

export const getRawTransactionId = (transaction: any) => {
    if (transaction?.transaction_id) return transaction.transaction_id;
    if (transaction?.order_id) return transaction.order_id;
    if (transaction?.id !== undefined && transaction?.id !== null) {
        return String(transaction.id);
    }
    return "";
};

const isManualPaymentTransaction = (transaction: any) => {
    const type = String(transaction?.type || "").toLowerCase();
    const note = String(transaction?.note || "");
    return type === "order_hold" && /manual payment/i.test(note);
};

// Shared "G" + 9 mixed letters/digits recipe — identical to the backend
// (shared/utils/transactionDisplayId.js) and the mobile app, so a fallback
// computed here matches the ID the server shows.
const TX_LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const mul32 = (a: number, b: number) => {
    const ah = (a >>> 16) & 0xffff;
    const al = a & 0xffff;
    const bh = (b >>> 16) & 0xffff;
    const bl = b & 0xffff;
    return ((al * bl) + ((((ah * bl) + (al * bh)) & 0xffff) * 65536)) % 4294967296;
};

const hash32 = (text: string, seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i += 1) {
        h = (h ^ text.charCodeAt(i)) >>> 0;
        h = mul32(h, 0x01000193);
    }
    h = (h ^ (h >>> 16)) >>> 0;
    h = mul32(h, 0x85ebca6b);
    h = (h ^ (h >>> 13)) >>> 0;
    h = mul32(h, 0xc2b2ae35);
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
};

const base62Chars = (value: number, count: number) => {
    let out = "";
    let current = value;
    for (let i = 0; i < count; i += 1) {
        out += TRANSACTION_ID_ALPHABET[current % 62];
        current = Math.floor(current / 62);
    }
    return out;
};

export const mixedTransactionId = (id: string | number, kind: string = "wallet") => {
    const seed = `googer-tx:${kind}:${String(id ?? "").trim() || "0"}`;
    const h1 = hash32(seed, 0x9747b28c);
    const h2 = hash32(seed, 0x1b873593);
    const h3 = hash32(seed, 0xcc9e2d51);
    const chars = (base62Chars(h1, 5) + base62Chars(h2, 5)).slice(0, 9).split("");
    chars[h3 % 9] = String(h3 % 10);
    let letterPos = (h3 >>> 8) % 9;
    if (letterPos === h3 % 9) letterPos = (letterPos + 1) % 9;
    chars[letterPos] = TX_LETTERS[(h3 >>> 16) % 52];
    return `G${chars.join("")}`;
};

// Manual payment IDs keep their original 10-digit format (only the other
// payment IDs use the mixed "G" codes).
const formatManualPaymentDisplayTransactionId = (value: string | number | undefined) => {
    const normalized = String(value ?? "").replace(/\D/g, "").trim() || "0";
    const digitsOnly = `${hashString(`manual:${normalized}`)}${normalized}${hashString(`manual:receipt:${normalized}`)}`.replace(/\D/g, "");
    return digitsOnly.slice(0, 10).padEnd(10, "0");
};

export const formatDisplayTransactionId = (value: string | number | undefined, transaction?: any) => {
    if (isManualPaymentTransaction(transaction)) {
        if (transaction?.transaction_id) {
            return String(transaction.transaction_id);
        }
        return formatManualPaymentDisplayTransactionId(value);
    }

    const normalized = String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").trim();

    if (!normalized) return "G35hfSj5g7";

    // A plain row id gets the shared mixed code.
    if (/^\d+$/.test(normalized)) return mixedTransactionId(normalized);

    const body = normalized.replace(/^[gG]/, "");

    if (body && /[A-Za-z]/.test(body) && /\d/.test(body)) {
        return `G${body}`;
    }

    const seed = body || "0";
    const hashedPrefix = encodeBase62(hashString(`googer:${seed}`));
    const hashedSuffix = encodeBase62(hashString(`wallet:${seed}`));
    let mixedBody = `${hashedPrefix}${seed}${hashedSuffix}`.replace(/[^a-zA-Z0-9]/g, "");

    if (!/[A-Za-z]/.test(mixedBody)) mixedBody += "hfSj";
    if (!/\d/.test(mixedBody)) mixedBody += "357";

    mixedBody = mixedBody.slice(0, 9).padEnd(9, "7");

    return `G${mixedBody}`;
};
