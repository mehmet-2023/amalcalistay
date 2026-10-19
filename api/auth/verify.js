// api/auth/verify.js
import { getAdmin } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  const admin = await getAdmin(req);
  if (!admin) {
    return res.status(401).json({ ok: false });
  }
  return res.status(200).json({ ok: true, user: admin.sub });
}
