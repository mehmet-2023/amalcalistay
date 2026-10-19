// api/mark.js — kişinin yemek alım durumunu günceller
import { requireAdmin } from './_lib/auth.js';
import { normalizeMeals, normalizeTakenAt, availableMeals, nextLockUntil, MEAL_LABELS } from './_lib/qr.js';
import { getUser, upsertUser, isWriteConfigured } from './_lib/store.js';

export default requireAdmin(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!isWriteConfigured()) {
    return res.status(500).json({ error: 'Yazma yapılandırması eksik (GC_WRITE_TOKEN)' });
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

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const prevTaken = normalizeMeals(user.taken);
    let nextTaken = prevTaken;
    let nextTakenAt = normalizeTakenAt(user.takenAt);

    if (Array.isArray(taken) && taken.length >= 2) {
      nextTaken = normalizeMeals(taken);
      for (let i = 0; i < 2; i++) {
        if (nextTaken[i] && !prevTaken[i]) nextTakenAt[i] = nowIso;
        if (!nextTaken[i]) nextTakenAt[i] = null;
      }
    } else if (typeof index === 'number' && (index === 0 || index === 1)) {
      const val = Boolean(value);
      nextTaken[index] = val;
      nextTakenAt[index] = val ? nowIso : null;
    } else {
      return res.status(400).json({ error: 'Geçersiz işaretleme' });
    }

    // 3 saat kuralı: 2. öğün ancak müsaitse işaretlenebilir
    const makingMeal2 = nextTaken[1] && !prevTaken[1];
    if (makingMeal2 && !availableMeals(user, now).includes(1)) {
      const lockUntil = nextLockUntil(user, now);
      return res.status(409).json({
        error: 'İkinci öğün için henüz erken; 1. öğüden sonra en az 3 saat geçmeli',
        lockUntil
      });
    }

    user.taken = nextTaken;
    user.takenAt = nextTakenAt;
    user.updatedAt = nowIso;
    await upsertUser(user);

    const meals = normalizeMeals(user.meals);
    const available = availableMeals(user, now);
    const lockUntil = nextLockUntil(user, now);
    const pending = available.length > 0;
    const status = pending ? 'pending' : lockUntil ? 'locked' : 'done';

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
      available,
      nextIndex: available.length ? available[0] : -1,
      lockUntil,
      status
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Bir hata oluştu' });
  }
});
