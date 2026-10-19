// api/users/[id].js — tek kullanıcı: görüntüle / güncelle / sil (yalnızca admin)
import { requireAdmin } from '../_lib/auth.js';
import { normalizeMeals, signQrText, MEAL_LABELS } from '../_lib/qr.js';
import { getUser, upsertUser, removeUser, isWriteConfigured } from '../_lib/store.js';

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
  const id = req.query.id;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği' });
  }

  try {
    if (req.method === 'GET') {
      const user = await getUser(id);
      if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      return res.status(200).json({ ok: true, mealLabels: MEAL_LABELS, user: publicUser(user, true) });
    }

    if (req.method === 'PATCH') {
      if (!isWriteConfigured()) {
        return res.status(500).json({ error: 'Yazma yapılandırması eksik (GC_WRITE_TOKEN)' });
      }
      const user = await getUser(id);
      if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

      const { name, komite, meals, taken } = req.body || {};
      if (typeof name === 'string' && name.trim()) user.name = name.trim();
      if (typeof komite === 'string') user.komite = komite.trim();
      if (Array.isArray(meals)) user.meals = normalizeMeals(meals);
      if (Array.isArray(taken)) user.taken = normalizeMeals(taken);
      user.updatedAt = new Date().toISOString();

      await upsertUser(user);
      return res.status(200).json({ ok: true, user: publicUser(user, true) });
    }

    if (req.method === 'DELETE') {
      if (!isWriteConfigured()) {
        return res.status(500).json({ error: 'Yazma yapılandırması eksik (GC_WRITE_TOKEN)' });
      }
      await removeUser(id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Bir hata oluştu' });
  }
});
