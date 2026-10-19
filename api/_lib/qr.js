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

export function normalizeTakenAt(value) {
  const arr = Array.isArray(value) ? value : [];
  return [arr[0] || null, arr[1] || null];
}

/** 1. öğün alındıktan sonra 2. öğün için geçmesi gereken süre (3 saat). */
export const MEAL2_MIN_DELAY_MS = 3 * 60 * 60 * 1000;

/**
 * Şu an işaretlenebilir öğünlerin indeksleri (3 saat kuralı dâhil).
 * 2. öğün, yalnızca 1. öğün alındıktan ve 3 saat geçtikten sonra açılır.
 */
export function availableMeals(user, now = Date.now()) {
  const meals = normalizeMeals(user.meals);
  const taken = normalizeMeals(user.taken);
  const takenAt = normalizeTakenAt(user.takenAt);
  const out = [];
  for (let i = 0; i < meals.length; i++) {
    if (!meals[i] || taken[i]) continue;
    if (i === 1 && meals[0]) {
      if (!taken[0]) continue; // önce 1. öğün alınmalı
      const t = Date.parse(takenAt[0] || '');
      // Zaman damgası yoksa (eski veri) kilidi uygulama; varsa 3 saati bekle
      if (Number.isFinite(t) && now - t < MEAL2_MIN_DELAY_MS) continue;
    }
    out.push(i);
  }
  return out;
}

/**
 * Sıradaki öğün zamansal kilitliyse açılma anını (ISO) döndürür, değilse null.
 */
export function nextLockUntil(user, now = Date.now()) {
  const meals = normalizeMeals(user.meals);
  const taken = normalizeMeals(user.taken);
  const takenAt = normalizeTakenAt(user.takenAt);
  if (!meals[1] || taken[1]) return null;
  if (!meals[0]) return null;   // 1. öğün yoksa kilit yok
  if (!taken[0]) return null;   // sıra henüz 1. öğünde
  const t = Date.parse(takenAt[0] || '');
  if (!Number.isFinite(t)) return null;
  const unlock = t + MEAL2_MIN_DELAY_MS;
  return now < unlock ? new Date(unlock).toISOString() : null;
}
