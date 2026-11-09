export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
const MOD = ALPHABET.length;

function indexOf(ch) {
    const i = ALPHABET.indexOf(ch);
    if (i === -1) {
        throw new Error(`Teken niet in het alfabet: "${ch}"`);
    }
    return i;
}

export function normalize(text) {
    const result = String(text)
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
        .toUpperCase()
        .replace(/\r\n|\s/g, '_');

    const rejected = [];
    for (const ch of result) {
        if (!ALPHABET.includes(ch)) {
            const code = 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
            const label = `${ch} (${code})`;
            if (!rejected.includes(label)) {
                rejected.push(label);
            }
        }
    }
    return { result, rejected };
}

export function parseKeyLine(input) {
    const match = String(input).trim().match(/^(\d+)\s+([A-Z0-9_]+)$/);
    if (!match) {
        throw new Error('Plak de volledige lijn uit het codeboek: het nummer en daarna de sleutel.');
    }
    const line = Number(match[1]);
    if (line < 1) {
        throw new Error('Het lijnnummer moet 1 of hoger zijn.');
    }
    return { line, key: match[2] };
}

export function encrypt(plain, key) {
    if (plain.length > key.length) {
        throw new Error(`Het bericht (${plain.length} tekens) is langer dan de sleutel (${key.length} tekens).`);
    }
    let out = '';
    for (let i = 0; i < plain.length; i++) {
        out += ALPHABET[(indexOf(plain[i]) + indexOf(key[i])) % MOD];
    }
    return out;
}

export function decrypt(cipher, key) {
    if (cipher.length > key.length) {
        throw new Error(`De ciphertext (${cipher.length} tekens) is langer dan de sleutel (${key.length} tekens).`);
    }
    let out = '';
    for (let i = 0; i < cipher.length; i++) {
        out += ALPHABET[(indexOf(cipher[i]) - indexOf(key[i]) + MOD) % MOD];
    }
    return out;
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
}

function macInput(line, cipher) {
    return new TextEncoder().encode(`${line}:${cipher}`);
}

async function importHmacKey(hexKey) {
    if (!globalThis.crypto || !crypto.subtle) {
        throw new Error('Web Crypto is niet beschikbaar. Open de app via HTTPS of via localhost.');
    }
    const clean = String(hexKey).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(clean)) {
        throw new Error('De HMAC-sleutel moet uit precies 64 hex-tekens (0-9, a-f) bestaan.');
    }
    return crypto.subtle.importKey('raw', hexToBytes(clean), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmacSign(hexKey, line, cipher) {
    const key = await importHmacKey(hexKey);
    const tag = await crypto.subtle.sign('HMAC', key, macInput(line, cipher));
    return bytesToHex(tag);
}

export async function hmacVerify(hexKey, line, cipher, tagHex) {
    const key = await importHmacKey(hexKey);
    const tag = String(tagHex).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(tag)) {
        return false;
    }
    return crypto.subtle.verify('HMAC', key, hexToBytes(tag), macInput(line, cipher));
}
