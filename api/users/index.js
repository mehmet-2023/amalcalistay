// api/users/index.js — kullanıcı listeleme ve oluşturma (yalnızca admin)
import crypto from 'node:crypto';
import { requireAdmin } from '../_lib/auth.js';
import { normalizeMeals, signQrText, MEAL_LABELS } from '../_lib/qr.js';
import { listUsers, upsertUser, isWriteConfigured } from '../_lib/store.js';

function publicUser(user, includeQr) {
  const out = {
    id: user.id,
    name: user.name,
    komite: user.komite || '',
    meals: normalizeMeals(user.meals),
    taken: normalizeMeals(user.taken),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null
  };
  if (includeQr) out.qr = signQrText(user);
  return out;
}

export default requireAdmin(async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const users = await listUsers();
      return res.status(200).json({
        ok: true,
        mealLabels: MEAL_LABELS,
        writeConfigured: isWriteConfigured(),
        users: users.map((u) => publicUser(u, false))
      });
    }

    if (req.method === 'POST') {
      if (!isWriteConfigured()) {
        return res.status(500).json({ error: 'Yazma yapılandırması eksik (VERCEL_TOKEN)' });
      }
      const { name, komite, meals } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'İsim zorunlu' });
      }
      const id = 'u_' + crypto.randomBytes(4).toString('hex');
      const now = new Date().toISOString();
      const user = {
        id,
        name: String(name).trim(),
        komite: String(komite || '').trim(),
        meals: normalizeMeals(meals),
        taken: [false, false],
        createdAt: now,
        updatedAt: now
      };
      await upsertUser(user);
      return res.status(201).json({ ok: true, user: publicUser(user, true) });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Bir hata oluştu' });
  }
});
