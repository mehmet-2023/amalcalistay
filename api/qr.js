// api/qr.js — kullanıcının imzalı QR kodunu PNG olarak döndürür
import QRCode from 'qrcode';
import { requireAdmin } from './_lib/auth.js';
import { signQrText } from './_lib/qr.js';
import { getUser } from './_lib/store.js';

export default requireAdmin(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const id = req.query.id;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Geçersiz kullanıcı kimliği' });
  }

  try {
    const user = await getUser(id);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    const text = signQrText(user);
    const buffer = await QRCode.toBuffer(text, {
      type: 'png',
      width: 360,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#200204', light: '#fef5ef' }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'QR üretilemedi' });
  }
});
