// api/auth/logout.js
import { clearCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  res.setHeader('Set-Cookie', clearCookie());
  return res.status(200).json({ ok: true });
}
