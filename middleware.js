// middleware.js — platform seviyesinde yönlendirme
// - /ticketkontroladminamal/* ve var olmayan yollar:
//     yetkili  -> /ticketkontroladminamal/panel
//     yetkisiz -> /ticketkontroladminamal/amalbest
import { jwtVerify } from 'jose';

export const config = {
  matcher: ['/', '/404.html', '/ticketkontroladminamal/:path*']
};

const LOGIN_PATH = '/ticketkontroladminamal/amalbest';
const PANEL_PATH = '/ticketkontroladminamal/panel';
const COOKIE_NAME = 'amal_admin_token';
const FALLBACK_SECRET = 'amalcalistay-default-secret-change-in-prod';

function readCookie(header, name) {
  const parts = String(header || '').split(';');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      const raw = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch (e) {
        return raw;
      }
    }
  }
  return null;
}

async function isAdmin(req) {
  const token = readCookie(req.headers.get('cookie'), COOKIE_NAME);
  if (!token) return false;
  try {
    const key = new TextEncoder().encode(process.env.JWT_SECRET || FALLBACK_SECRET);
    const result = await jwtVerify(token, key);
    return result.payload && result.payload.role === 'admin';
  } catch (e) {
    return false;
  }
}

export default async function middleware(req) {
  const pathname = new URL(req.url).pathname;

  // Giriş sayfası: dokunma
  if (pathname === LOGIN_PATH) {
    return new Response(null, { status: 200, headers: { 'x-middleware-next': '1' } });
  }

  let authorized = false;
  try {
    authorized = await isAdmin(req);
  } catch (e) {
    authorized = false;
  }

  const target = authorized ? PANEL_PATH : LOGIN_PATH;

  // Zaten hedefte: dokunma
  if (pathname === target) {
    return new Response(null, { status: 200, headers: { 'x-middleware-next': '1' } });
  }

  const dest = new URL(target, req.url).toString();
  return new Response(null, { status: 307, headers: { Location: dest } });
}
