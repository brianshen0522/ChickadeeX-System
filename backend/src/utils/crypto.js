const crypto = require('crypto');

const ENCRYPTION_VERSION = 'v1';
const IV_LENGTH = 12;

const getKey = () => {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
        throw new Error('ENCRYPTION_KEY is required for encryption at rest');
    }
    return crypto.createHash('sha256').update(raw).digest();
};

const encryptSecret = (plainText) => {
    if (plainText === null || plainText === undefined || plainText === '') {
        return null;
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
        ENCRYPTION_VERSION,
        iv.toString('base64'),
        tag.toString('base64'),
        encrypted.toString('base64')
    ].join(':');
};

const decryptSecret = (cipherText) => {
    if (!cipherText) return null;
    if (!cipherText.startsWith(`${ENCRYPTION_VERSION}:`)) {
        return cipherText;
    }
    const parts = cipherText.split(':');
    if (parts.length !== 4) {
        throw new Error('Invalid encrypted payload');
    }
    const [, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
};

module.exports = {
    encryptSecret,
    decryptSecret
};
