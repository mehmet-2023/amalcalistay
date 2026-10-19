// api/_lib/auth.js — paylaşımlı oturum yardımcıları
import { jwtVerify, SignJWT } from 'jose';

export const COOKIE_NAME = 'amal_admin_token';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 gün ("beni hatırla")

function getSecret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || 'amalcalistay-default-secret-change-in-prod'
  );
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(function (part) {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

export async function getAdmin(req) {
  try {
    const cookies = parseCookies(req);
    const token = cookies[COOKIE_NAME];
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSessionToken(username) {
  return new SignJWT({ sub: String(username), role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());
}

export function isProd() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

export function sessionCookie(token) {
  const secure = isProd() ? 'Secure; ' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; ${secure}SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearCookie() {
  const secure = isProd() ? 'Secure; ' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; ${secure}SameSite=Strict; Max-Age=0`;
}

export function requireAdmin(handler) {
  return async function (req, res) {
    const admin = await getAdmin(req);
    if (!admin) {
      return res.status(401).json({ error: 'Yetkisiz' });
    }
    req.admin = admin;
    return handler(req, res);
  };
}
