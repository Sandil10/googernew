// Display transaction IDs: "G" + 9 mixed letters and digits, derived from the
// wallet_transfers row id so every existing transaction gets one without a
// database change. Neighbouring ids give completely different codes (the old
// recipe embedded the id and changed only a character or two between rows).
//
// The same recipe is implemented in the web app (utils/transactionReceipt.ts)
// and the mobile app (lib/util/wallet_receipt.dart). It uses only 32-bit
// integer maths so JavaScript and Dart (also when compiled to JavaScript)
// produce identical codes — keep the three copies in step.

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 32-bit multiply built from 16-bit halves (same result as Math.imul, and
// exactly reproducible in Dart).
function mul32(a, b) {
    const ah = (a >>> 16) & 0xffff;
    const al = a & 0xffff;
    const bh = (b >>> 16) & 0xffff;
    const bl = b & 0xffff;
    return ((al * bl) + ((((ah * bl) + (al * bh)) & 0xffff) * 65536)) % 4294967296;
}

// FNV-1a over the text, finished with the murmur3 avalanche step.
function hash32(text, seed) {
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
}

function base62Chars(value, count) {
    let out = '';
    let current = value;
    for (let i = 0; i < count; i += 1) {
        out += ALPHABET[current % 62];
        current = Math.floor(current / 62);
    }
    return out;
}

/**
 * "G" + 9 mixed characters for a transfer id. `kind` separates the manual
 * payment hold codes from the general ones.
 */
function mixedTransactionId(id, kind = 'wallet') {
    const seed = `googer-tx:${kind}:${String(id ?? '').trim() || '0'}`;
    const h1 = hash32(seed, 0x9747b28c);
    const h2 = hash32(seed, 0x1b873593);
    const h3 = hash32(seed, 0xcc9e2d51);
    const chars = (base62Chars(h1, 5) + base62Chars(h2, 5)).slice(0, 9).split('');
    // Always both letters and digits, at positions picked by the hash.
    chars[h3 % 9] = String(h3 % 10);
    let letterPos = (h3 >>> 8) % 9;
    if (letterPos === h3 % 9) letterPos = (letterPos + 1) % 9;
    chars[letterPos] = LETTERS[(h3 >>> 16) % 52];
    return `G${chars.join('')}`;
}

module.exports = { mixedTransactionId, hash32, mul32 };
