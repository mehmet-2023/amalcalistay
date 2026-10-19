// api/scan.js — QR kodunu çözer, kişiyi ve yemek durumunu döndürür
import { requireAdmin } from './_lib/auth.js';
import { verifyQrText, normalizeMeals, availableMeals, nextLockUntil, MEAL_LABELS } from './_lib/qr.js';
import { getUser, upsertUser, isWriteConfigured } from './_lib/store.js';

export default requireAdmin(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { code } = req.body || {};
  const payload = verifyQrText(code);
  if (!payload) {
    return res.status(400).json({ error: 'Geçersiz veya sahte QR kod' });
  }

  try {
    let user = await getUser(payload.id);

    if (!user) {
      // İmzalı ama kayıtlı olmayan QR: otomatik kayıt oluştur
      user = {
        id: payload.id,
        name: payload.n || 'Bilinmeyen',
        komite: payload.k || '',
        meals: normalizeMeals(payload.m),
        taken: [false, false],
        takenAt: [null, null],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (isWriteConfigured()) {
        await upsertUser(user);
      }
    }

    const now = Date.now();
    const taken = normalizeMeals(user.taken);
    const meals = normalizeMeals(user.meals);
    const available = availableMeals(user, now);
    const lockUntil = nextLockUntil(user, now);
    const anyEntitled = meals.some(Boolean);
    const pending = available.length > 0;
    const status = pending ? 'pending' : lockUntil ? 'locked' : 'done';

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        komite: user.komite || '',
        meals,
        taken
      },
      mealLabels: MEAL_LABELS,
      available,
      nextIndex: available.length ? available[0] : -1,
      lockUntil,
      anyEntitled,
      status
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Bir hata oluştu' });
  }
});
