const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const auth = require('../middleware/auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const IS_PROD = process.env.NODE_ENV === 'production';
const PERSISTENT_BASE = IS_PROD ? '/opt/render/project/src/database' : path.join(__dirname, '..');
const screenshotsDir = path.join(PERSISTENT_BASE, 'uploads', 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: screenshotsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `screenshot_${Date.now()}_${Math.random().toString(36).substr(2,6)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only images allowed.')) });

const q = (sql, params = []) => pool.query(sql, params);

// POST /api/orders
router.post('/', auth, upload.single('payment_screenshot'), async (req, res) => {
  try {
    const { book_id } = req.body;
    if (!book_id) return res.status(400).json({ error: 'Book ID is required.' });
    if (!req.file) return res.status(400).json({ error: 'Payment screenshot is required.' });

    const bookRes = await q('SELECT id, title, price FROM books WHERE id = $1 AND is_active = 1', [book_id]);
    if (!bookRes.rows[0]) return res.status(404).json({ error: 'Book not found.' });

    const approved = await q("SELECT id FROM orders WHERE user_id = $1 AND book_id = $2 AND payment_status = 'approved'", [req.user.id, book_id]);
    if (approved.rows.length > 0) return res.status(409).json({ error: 'You already have access to this book.' });

    const pending = await q("SELECT id FROM orders WHERE user_id = $1 AND book_id = $2 AND payment_status = 'pending'", [req.user.id, book_id]);
    if (pending.rows.length > 0) return res.status(409).json({ error: 'A payment is already under review for this book.' });

    const result = await q("INSERT INTO orders (user_id, book_id, payment_screenshot, payment_status) VALUES ($1,$2,$3,'pending') RETURNING id", [req.user.id, book_id, req.file.filename]);
    res.json({ message: 'Order submitted. Payment is under verification.', order_id: result.rows[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/orders/my-orders
router.get('/my-orders', auth, async (req, res) => {
  try {
    const result = await q('SELECT o.id, o.payment_status, o.created_at, b.title, b.author, b.price, b.cover_image FROM orders o JOIN books b ON o.book_id = b.id WHERE o.user_id = $1 ORDER BY o.created_at DESC', [req.user.id]);
    res.json({ orders: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/orders/my-library
router.get('/my-library', auth, async (req, res) => {
  try {
    const result = await q(`
      SELECT b.id, b.title, b.author, b.cover_image, b.pages, b.category,
             rp.current_page, rp.total_pages, rp.last_read
      FROM orders o
      JOIN books b ON o.book_id = b.id
      LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = o.user_id
      WHERE o.user_id = $1 AND o.payment_status = 'approved'
      ORDER BY rp.last_read DESC NULLS LAST, o.created_at DESC
    `, [req.user.id]);
    res.json({ books: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
