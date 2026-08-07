import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---------- قاعدة البيانات (PostgreSQL على Railway) ----------
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      full_name TEXT,
      phone TEXT,
      email TEXT,
      city TEXT,
      message TEXT,
      source TEXT DEFAULT 'website',
      status TEXT DEFAULT 'new',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      name TEXT,
      phone TEXT,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}
ensureTables().catch((e) => console.warn('DB init warning:', e.message));

// ---------- خدمة الملفات الثابتة (الموقع المنظف) ----------
app.use(express.static(path.join(__dirname, 'public'), { index: 'home.html' }));

// ---------- API المحتوى المحلي (بديل API tadbeerco.com الخارجي) ----------
const AR_DATA = path.join(__dirname, 'api-data', 'ar');

function sendJsonFile(res, filename) {
  const p = path.join(AR_DATA, filename);
  if (!fs.existsSync(p)) return res.status(404).json({ status: 404, message: 'not found' });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.sendFile(p);
}

app.get('/api/content/Search/:lang/:page', (req, res) => sendJsonFile(res, req.params.page + '.html'));

// Slider endpoint (الصفحة الرئيسية تستخدمه عبر apiUrl + "Slider")
app.get('/api/Slider', (req, res) => sendJsonFile(res, 'Slider.html'));

// لوحة الأدمن (يجب أن تسبق الـ catch-all)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'tadbeer-admin-2026';
app.get('/api/admin/auth', (req, res) => {
  res.json({ ok: req.headers.authorization === `Bearer ${ADMIN_PASSWORD}` });
});
app.get('/api/admin/leads', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${ADMIN_PASSWORD}`) return res.status(401).json({ error: 'unauthorized' });
  try {
    const r = await pool.query(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 500`);
    res.json(r.rows);
  } catch (e) { res.status(503).json({ error: 'database unavailable' }); }
});
app.patch('/api/admin/leads/:id', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${ADMIN_PASSWORD}`) return res.status(401).json({ error: 'unauthorized' });
  const { status } = req.body || {};
  if (!['new', 'in_progress', 'done', 'rejected'].includes(status)) return res.status(400).json({ error: 'bad status' });
  await pool.query(`UPDATE leads SET status = $1 WHERE id = $2`, [status, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/admin/leads/:id', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${ADMIN_PASSWORD}`) return res.status(401).json({ error: 'unauthorized' });
  await pool.query(`DELETE FROM leads WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
});

// endpoints مساندة لإبقائها تعمل دون أخطاء في الواجهة
app.get('/api/*', (req, res) => {
  const r = (req.params[0] || '').replace(/^\/ar\//, '').replace(/^\/en\//, '');
  if (r === 'HourlyContract/IsHourlySectorAvailable' || r.includes('IsHourlySectorAvailable')) {
    return res.json(JSON.parse(fs.readFileSync(path.join(AR_DATA, 'IsHourlySectorAvailable.html'), 'utf-8')));
  }
  // باقي endpoints تُرجع بيانات فارغة لتفادي أخطاء JS
  res.json({ data: [], status: 200 });
});

app.post('/api/*', (req, res) => {
  const r = (req.params[0] || '').replace(/^\/ar\//, '').replace(/^\/en\//, '');
  if (r === 'lead/CreateHourly' || r.startsWith('lead')) {
    // حفظ طلب الموقع في قاعدة البيانات
    const b = req.body || {};
    pool.query(
      `INSERT INTO leads (full_name, phone, email, city, message, source)
       VALUES ($1, $2, $3, $4, $5, 'hourly')`,
      [b.name || b.fullName || b.contactName || null, b.phone || b.contactPhone || b.phoneNumber || null,
       b.email || null, b.city || null, JSON.stringify(b), 'hourly']
    ).catch((e) => console.warn('lead insert failed:', e.message));
    return res.json({ data: true, status: 200, message: 'تم استلام طلبك وسنتواصل معك' });
  }
  if (r.startsWith('Account')) {
    return res.status(400).json({ data: null, status: 400, message: 'تسجيل الدخول غير متاح في هذه النسخة التجريبية' });
  }
  res.json({ data: null, status: 200 });
});

// ---------- واجهات وهمية للخدمات الخارجية (تجنباً لأي اتصال خارجي) ----------
app.get('/api/payment/production.js', (req, res) => res.type('js').send('/* payment gateway disabled in self-hosted version */'));
app.get('/api/payment/test.js', (req, res) => res.type('js').send('/* payment gateway disabled in self-hosted version */'));
app.get('/api/pdfjs/pdf.worker.js', (req, res) => res.type('js').send('/* pdf worker disabled */'));
app.get('/api/pdfjs/cmaps/:f', (req, res) => res.status(204).end());
app.get('/api/pdfviewer', (req, res) => res.json([]));
app.get('/api/maps/geocode', (req, res) => res.json({ status: 'OK', results: [] }));
app.get('/maps-placeholder', (req, res) => res.status(204).end());
app.get('/whatsapp/:rest', (req, res) => res.status(204).end());

// ---------- API استقبال الطلبات (يجب أن يسبق الـ catch-all العام) ----------
app.post('/api/leads', async (req, res) => {
  const { name, phone, email, city, message } = req.body || {};
  if (!phone && !email) return res.status(400).json({ error: 'phone or email required' });
  try {
    const r = await pool.query(
      `INSERT INTO leads (full_name, phone, email, city, message, source)
       VALUES ($1, $2, $3, $4, $5, 'website') RETURNING id`,
      [name || null, phone || null, email || null, city || null, message || null]
    );
    res.json({ id: r.rows[0].id });
  } catch (e) {
    console.warn('db insert failed:', e.message);
    res.status(503).json({ error: 'database unavailable' });
  }
});

// صفحة الأدمن (HTML)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// SPA fallback: أي مسار غير معروف يعيد home.html
app.get('*', (req, res) => {
  if (req.accepts('html')) return res.sendFile(path.join(__dirname, 'public', 'home.html'));
  res.status(404).json({ error: 'not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tadbeer server running on port ${PORT}`);
});
