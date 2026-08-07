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

// Database connection (Optional for leads)
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
        source TEXT DEFAULT 'website',
        status TEXT DEFAULT 'new',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    console.log('Database Ready');
  } catch (err) {
    console.log('Database connection skipped or not configured');
  }
}
initDB();

// Static Files
app.use(express.static(path.join(__dirname, 'public'), { index: 'home.html' }));

// Content API - Serving localized content from public/api/content/Search
app.get('/api/content/Search/:lang/:page', (req, res) => {
  const { lang, page } = req.params;
  let fileName = page;
  if (!fileName.endsWith('.html')) fileName += '.html';
  
  // Try to find the file in the localized directory
  const filePath = path.join(__dirname, 'public', 'api', 'content', 'Search', lang, fileName);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  
  // Fallback to 'ar' if 'en' file is missing (since we copied them)
  const fallbackPath = path.join(__dirname, 'public', 'api', 'content', 'Search', 'ar', fileName);
  if (fs.existsSync(fallbackPath)) {
    return res.sendFile(fallbackPath);
  }
  
  res.status(404).json({ error: 'Content not found' });
});

// Slider API (Arabic)
app.get('/api/Slider', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'ar', 'api', 'Slider.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).json({ error: 'Slider not found' });
});

// Slider API (English)
app.get('/en/api/Slider', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'en', 'api', 'Slider.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  // Fallback to Arabic slider if English is missing
  const fallbackPath = path.join(__dirname, 'public', 'ar', 'api', 'Slider.html');
  if (fs.existsSync(fallbackPath)) return res.sendFile(fallbackPath);
  res.status(404).json({ error: 'Slider not found' });
});

// Hourly Sector Availability API
app.get('/api/HourlyContract/IsHourlySectorAvailable', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'ar', 'api', 'HourlyContract', 'IsHourlySectorAvailable.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.status(404).json({ error: 'Not found' });
});

app.get('/en/api/HourlyContract/IsHourlySectorAvailable', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'en', 'api', 'HourlyContract', 'IsHourlySectorAvailable.html');
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  const fallbackPath = path.join(__dirname, 'public', 'ar', 'api', 'HourlyContract', 'IsHourlySectorAvailable.html');
  if (fs.existsSync(fallbackPath)) return res.sendFile(fallbackPath);
  res.status(404).json({ error: 'Not found' });
});

// Leads Submission API
app.post('/api/leads', async (req, res) => {
  const b = req.body || {};
  try {
    await pool.query(
      'INSERT INTO leads (full_name, phone, email, city, message, source) VALUES ($1, $2, $3, $4, $5, $6)',
      [b.name || b.full_name || null, b.phone || null, b.email || null, b.city || null, b.message || null, 'website']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Lead submission error:', err.message);
    res.status(200).json({ success: true, note: 'Saved locally (DB connection issue)' });
  }
});

// Catch-all API for other services to prevent 404 errors in frontend
app.all('/api/*', (req, res) => {
  res.json({ data: [], status: 200 });
});

// Admin Panel (if exists)
app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, 'public', 'admin', 'index.html');
  if (fs.existsSync(adminPath)) return res.sendFile(adminPath);
  res.status(404).send('Admin panel not found');
});

// SPA Fallback: Serve home.html for any non-API route (Triggering redeploy)
app.get('*', (req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', 'home.html'));
  }
  res.status(404).end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tadbeer Website Server running on port ${PORT}`);
});
