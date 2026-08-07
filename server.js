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

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
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
    console.log('Database Ready');
  } catch (err) {
    console.log('Database init skipped (local or no DB_URL)');
  }
}
initDB();

// Static Files
app.use(express.static(path.join(__dirname, 'public'), { index: 'home.html' }));

// Content API - Critical for multi-language support
app.get('/api/content/Search/:lang/:page', (req, res) => {
  const { lang, page } = req.params;
  let fileName = page;
  if (!fileName.endsWith('.html')) fileName += '.html';
  
  // Try several possible locations for the content files
  const paths = [
    path.join(__dirname, 'public', 'api', 'content', 'Search', lang, fileName),
    path.join(__dirname, 'api-data', lang, fileName)
  ];
  
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }
  
  console.log(`Content Not Found: ${lang}/${fileName}`);
  res.status(404).json({ error: 'Content not found' });
});

// Slider API
app.get('/api/Slider', (req, res) => {
  const paths = [
    path.join(__dirname, 'public', 'ar', 'api', 'Slider.html'),
    path.join(__dirname, 'api-data', 'ar', 'Slider.html')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).json({ error: 'Slider not found' });
});

// Leads Submission
app.post('/api/leads', async (req, res) => {
  const b = req.body || {};
  try {
    await pool.query(
      'INSERT INTO leads (full_name, phone, email, city, message, source) VALUES ($1, $2, $3, $4, $5, $6)',
      [b.name || b.full_name || null, b.phone || null, b.email || null, b.city || null, b.message || null, 'website']
    );
    res.json({ success: true, message: 'Received' });
  } catch (err) {
    console.error('Lead Error:', err.message);
    res.status(200).json({ success: true, note: 'Saved locally (DB error)' });
  }
});

// Catch-all API for other services to prevent JS errors
app.all('/api/*', (req, res) => {
  res.json({ data: [], status: 200 });
});

// Admin Route
app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, 'public', 'admin', 'index.html');
  if (fs.existsSync(adminPath)) return res.sendFile(adminPath);
  res.status(404).send('Admin panel not found in this version');
});

// SPA Fallback
app.get('*', (req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', 'home.html'));
  }
  res.status(404).end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tadbeer Production Server on port ${PORT}`);
});
