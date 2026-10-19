// middleware.js — platform seviyesinde yönlendirme
// - /ticketkontroladminamal/* ve var olmayan yollar:
//     yetkili  -> /ticketkontroladminamal/panel
//     yetkisiz -> /ticketkontroladminamal/amalbest
// - /api/* middleware'e girmez (kendi auth'unu yönetir)
import { jwtVerify } from 'jose';

export const config = {
  // HTML sayfaları + kendi 404 sayfamız için çalışır.
  matcher: ['/', '/404.html', '/ticketkontroladminamal/:path*']
};

const LOGIN_PATH = '/ticketkontroladminamal/amalbest';
const PANEL_PATH = '/ticketkontroladminamal/panel';
const COOKIE_NAME = 'amal_admin_token';

const PASSTHROUGH = [
  '/ticketkontroladminamal/js/',
  LOGIN_PATH,
  PANEL_PATH
];

function secret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || 'amalcalistay-default-secret-change-in-prod'
  );
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

async function isAdmin(req) {
  try {
    const token = parseCookies(req.headers.get('cookie'))[COOKIE_NAME];
    if (!token) return false;
    const { payload } = await jwtVerify(token, secret());
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export default async function middleware(req) {
  const { pathname } = new URL(req.url);

  // Statik varlıklar ve login/panel sayfaları dokunulmadan geçsin
  for (const p of PASSTHROUGH) {
    if (pathname.startsWith(p)) return;
  }

  const authorized = await isAdmin(req);
  const target = authorized ? PANEL_PATH : LOGIN_PATH;

  // Zaten hedefteyse döngüye girme
  if (pathname === target) return;

  const url = req.nextUrl.clone();
  url.pathname = target;
  return Response.redirect(url, 307);
}
