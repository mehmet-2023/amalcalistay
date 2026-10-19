// api/qr-bulk.js — tüm kullanıcılar için isim + QR resmi içeren Excel üretir
import QRCode from 'qrcode';
import ExcelJS from 'exceljs';
import { requireAdmin } from './_lib/auth.js';
import { signQrText } from './_lib/qr.js';
import { listUsers } from './_lib/store.js';

export default requireAdmin(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const users = await listUsers();
    if (!users.length) {
      return res.status(400).json({ error: 'Kullanıcı bulunamadı' });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'AMAL Çalıştay';
    wb.created = new Date();
    const ws = wb.addWorksheet('QR Kodları');

    ws.columns = [
      { header: 'Ad Soyad', key: 'name', width: 34 },
      { header: 'Komite', key: 'komite', width: 24 },
      { header: 'QR Kod', key: 'qr', width: 22 }
    ];

    ws.getRow(1).font = { bold: true, size: 12 };
    ws.getRow(1).height = 22;
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF200204' } };
      cell.font = { bold: true, color: { argb: 'FFE8B796' }, size: 12 };
    });

    const ROW_H = 96;
    let r = 2;
    for (const user of users) {
      const text = signQrText(user);
      const dataUrl = await QRCode.toDataURL(text, {
        margin: 1,
        width: 240,
        errorCorrectionLevel: 'M',
        color: { dark: '#200204', light: '#FFFFFF' }
      });
      const imageId = wb.addImage({ base64: dataUrl.split(',')[1], extension: 'png' });

      const row = ws.addRow({ name: user.name || '', komite: user.komite || '' });
      row.height = ROW_H;
      row.getCell('name').alignment = { vertical: 'middle', wrapText: true };
      row.getCell('komite').alignment = { vertical: 'middle', wrapText: true };

      ws.addImage(imageId, {
        tl: { col: 2.15, row: r - 1 + 0.12 },
        ext: { width: 84, height: 84 },
        editAs: 'oneCell'
      });
      r++;
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const arrayBuffer = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({
      ok: true,
      filename: 'amal-qr-kodlari.xlsx',
      dataUrl: 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + base64
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Excel oluşturulamadı' });
  }
});
