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

const formatManualPaymentDisplayTransactionId = (value: string | number | undefined) => {
    const normalized = String(value ?? "").replace(/\D/g, "").trim() || "0";
    const digitsOnly = `${hashString(`manual:${normalized}`)}${normalized}${hashString(`manual:receipt:${normalized}`)}`.replace(/\D/g, "");
    return digitsOnly.slice(0, 10).padEnd(10, "0");
};

export const formatDisplayTransactionId = (value: string | number | undefined, transaction?: any) => {
    if (isManualPaymentTransaction(transaction)) {
        return formatManualPaymentDisplayTransactionId(value);
    }

    const normalized = String(value ?? "").replace(/[^a-zA-Z0-9]/g, "").trim();

    if (!normalized) return "G35hfSj5g7";

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
