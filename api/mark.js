// api/mark.js — kişinin yemek alım durumunu günceller
import { requireAdmin } from './_lib/auth.js';
import { normalizeMeals, MEAL_LABELS } from './_lib/qr.js';
import { getUser, upsertUser, isWriteConfigured } from './_lib/store.js';

export default requireAdmin(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!isWriteConfigured()) {
    return res.status(500).json({ error: 'Yazma yapılandırması eksik (VERCEL_TOKEN)' });
  }

  const { id, taken, index, value } = req.body || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Geçersiz kullanıcı' });
  }

  try {
    const user = await getUser(id);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    let nextTaken = normalizeMeals(user.taken);

    if (Array.isArray(taken) && taken.length >= 2) {
      nextTaken = normalizeMeals(taken);
    } else if (typeof index === 'number' && (index === 0 || index === 1)) {
      nextTaken[index] = Boolean(value);
    } else {
      return res.status(400).json({ error: 'Geçersiz işaretleme' });
    }

    user.taken = nextTaken;
    user.updatedAt = new Date().toISOString();
    await upsertUser(user);

    const meals = normalizeMeals(user.meals);
    const pending = meals.some((entitled, i) => entitled && !nextTaken[i]);

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        komite: user.komite || '',
        meals,
        taken: nextTaken
      },
      mealLabels: MEAL_LABELS,
      status: pending ? 'pending' : 'done'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Bir hata oluştu' });
  }
});
