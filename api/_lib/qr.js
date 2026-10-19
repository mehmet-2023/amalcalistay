// api/_lib/qr.js — imzalı QR payload üretimi ve doğrulaması
import crypto from 'node:crypto';

const PREFIX = 'AMAL1';
export const MEAL_LABELS = ['Öğle Yemeği 1', 'Öğle Yemeği 2'];

function getSecret() {
  return process.env.QR_SECRET || process.env.JWT_SECRET || 'amalcalistay-default-secret-change-in-prod';
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

/**
 * Kullanıcıdan imzalı QR metni üretir.
 * Format: AMAL1.<base64url(json)>.<hmac>
 */
export function signQrText(user) {
  const payload = {
    v: 1,
    id: user.id,
    n: user.name,
    k: user.komite || '',
    m: (user.meals || []).map((x) => (x ? 1 : 0))
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${PREFIX}.${payloadB64}.${sign(payloadB64)}`;
}

/**
 * QR metnini doğrular ve payload döndürür. Geçersizse null.
 */
export function verifyQrText(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, payloadB64, sig] = parts;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!parsed || parsed.v !== 1 || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeMeals(value) {
  const arr = Array.isArray(value) ? value : [];
  return [Boolean(arr[0]), Boolean(arr[1])];
}
