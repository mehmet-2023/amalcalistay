// api/auth/login.js
import { compare } from 'bcryptjs';
import { get } from '@vercel/global-config';
import { createSessionToken, sessionCookie } from '../_lib/auth.js';

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000; // 15 dakika
const attempts = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (now > entry.resetTime) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip, success) {
  const now = Date.now();
  if (success) {
    attempts.delete(ip);
    return;
  }
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetTime) {
    attempts.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ip = getIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.' });
  }

  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      recordAttempt(ip, false);
      return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    const [adminUser, adminPassHash] = await Promise.all([
      get('ADMIN_USER', { consistentRead: true }),
      get('ADMIN_PASS_HASH', { consistentRead: true })
    ]);

    if (!adminUser || !adminPassHash) {
      console.error('Global config eksik: ADMIN_USER/ADMIN_PASS_HASH');
      recordAttempt(ip, false);
      return res.status(500).json({ error: 'Sistem yapılandırması hatası' });
    }

    const userMatch = String(adminUser).trim() === String(username).trim();
    const passMatch = await compare(String(password), String(adminPassHash));

    if (!userMatch || !passMatch) {
      recordAttempt(ip, false);
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
    }

    recordAttempt(ip, true);

    const token = await createSessionToken(String(adminUser).trim());
    res.setHeader('Set-Cookie', sessionCookie(token));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    recordAttempt(ip, false);
    return res.status(500).json({ error: 'Bir hata oluştu' });
  }
}
