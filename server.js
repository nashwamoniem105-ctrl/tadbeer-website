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

// ---------- قاعدة البيانات (PostgreSQL) ----------
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        full_name TEXT,
        phone TEXT,
        email TEXT,
        city TEXT,
        message TEXT,
        subject TEXT,
        service TEXT,
        source TEXT DEFAULT 'website',
        status TEXT DEFAULT 'new',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    console.log('Database tables initialized');
  } catch (e) {
    console.warn('DB init warning:', e.message);
  }
}

ensureTables();

// ---------- خدمة الملفات الثابتة ----------
app.use(express.static(path.join(__dirname, 'public')));

// مسار إضافي للتعامل مع طلبات Umbraco API المقلدة
app.get('/api/content/Search/:lang/:page', (req, res) => {
  const { lang, page } = req.params;
  const filePath = path.join(__dirname, 'public', 'api', 'content', 'Search', lang, page);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ---------- API لاستقبال الطلبات ----------
app.post('/api/leads', async (req, res) => {
  const { name, phone, email, city, message, subject, service } = req.body || {};
  
  if (!phone && !email) {
    return res.status(400).json({ error: 'phone or email required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO leads (full_name, phone, email, city, message, subject, service, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'website') RETURNING id`,
      [name || null, phone || null, email || null, city || null, message || null, subject || null, service || null]
    );
    
    res.json({ id: result.rows[0].id, message: 'تم استلام طلبك بنجاح' });
  } catch (e) {
    console.error('DB insert failed:', e.message);
    res.status(503).json({ error: 'database unavailable' });
  }
});

// ---------- Admin API ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'tadbeer-admin-2026';

app.get('/api/admin/auth', (req, res) => {
  res.json({ ok: req.headers.authorization === `Bearer ${ADMIN_PASSWORD}` });
});

app.get('/api/admin/leads', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  try {
    const result = await pool.query(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 500`);
    res.json(result.rows);
  } catch (e) {
    res.status(503).json({ error: 'database unavailable' });
  }
});

app.patch('/api/admin/leads/:id', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  const { status } = req.body || {};
  if (!['new', 'in_progress', 'done', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'bad status' });
  }

  try {
    await pool.query(`UPDATE leads SET status = $1 WHERE id = $2`, [status, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ error: 'database unavailable' });
  }
});

app.delete('/api/admin/leads/:id', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    await pool.query(`DELETE FROM leads WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ error: 'database unavailable' });
  }
});

// ---------- SPA Fallback ----------
app.get('*', (req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', 'home.html'));
  }
  res.status(404).json({ error: 'not found' });
});

// ---------- Start Server ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tadbeer server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
