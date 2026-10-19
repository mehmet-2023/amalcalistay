// api/_lib/store.js — Global Config okuma (SDK) ve yazma (Vercel REST API)
import { getAll } from '@vercel/global-config';

const GC_ID = process.env.GLOBAL_CONFIG_ID || process.env.VERCEL_GLOBAL_CONFIG_ID || 'ecfg_xqpj4vvklqjususnu3wkr2af11pv';
const TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;

const USER_PREFIX = 'user_';

export function userKey(id) {
  return USER_PREFIX + id;
}

/**
 * Global Config'teki tüm anahtarları taze (consistent) şekilde okur.
 */
export async function readAll() {
  const all = await getAll(undefined, { consistentRead: true });
  return all && typeof all === 'object' ? all : {};
}

export async function getValue(key) {
  const all = await readAll();
  return all[key];
}

export async function listUsers() {
  const all = await readAll();
  return Object.keys(all)
    .filter((k) => k.startsWith(USER_PREFIX))
    .map((k) => all[k])
    .filter((u) => u && typeof u === 'object' && typeof u.id === 'string')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'));
}

export async function getUser(id) {
  const all = await readAll();
  const user = all[userKey(id)];
  return user && typeof user === 'object' ? user : null;
}

/**
 * Vercel REST API üzerinden Global Config'e toplu yazma.
 * items: [{ operation: 'upsert' | 'delete', key, value? }]
 */
export async function writeItems(items) {
  if (!TOKEN) {
    throw new Error('VERCEL_TOKEN tanımlı değil; Global Config yazma yapılamıyor');
  }
  const qs = TEAM_ID ? `?teamId=${encodeURIComponent(TEAM_ID)}` : '';
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${encodeURIComponent(GC_ID)}/items${qs}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Global Config yazma hatası (${res.status}): ${text.slice(0, 300)}`);
  }
  return true;
}

export async function upsertUser(user) {
  return writeItems([{ operation: 'upsert', key: userKey(user.id), value: user }]);
}

export async function removeUser(id) {
  return writeItems([{ operation: 'delete', key: userKey(id) }]);
}

export function isWriteConfigured() {
  return Boolean(TOKEN);
}
