const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const auth = require('../middleware/auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const q = (sql, params = []) => pool.query(sql, params);

// GET /api/books
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;
    let sql = 'SELECT id, title, author, price, description, pages, category, cover_image, is_active, created_at FROM books WHERE is_active = 1';
    const params = [];
    let i = 1;
    if (search) {
      sql += ` AND (title ILIKE $${i} OR description ILIKE $${i+1} OR category ILIKE $${i+2})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`); i += 3;
    }
    if (category && category !== 'all') {
      sql += ` AND category ILIKE $${i}`;
      params.push(`%${category}%`);
    }
    sql += ' ORDER BY created_at DESC';
    const result = await q(sql, params);
    const books = await Promise.all(result.rows.map(async b => {
      const r = await q('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE book_id = $1', [b.id]);
      return { ...b, avg_rating: r.rows[0].avg ? parseFloat(parseFloat(r.rows[0].avg).toFixed(1)) : 0, review_count: parseInt(r.rows[0].count) };
    }));
    res.json({ books });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/books/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await q('SELECT id, title, author, price, description, pages, category, cover_image, is_active, created_at FROM books WHERE id = $1 AND is_active = 1', [req.params.id]);
    const book = result.rows[0];
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const ratingRes = await q('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE book_id = $1', [book.id]);
    const reviewsRes = await q('SELECT r.id, r.rating, r.review_text, r.created_at, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.book_id = $1 ORDER BY r.created_at DESC LIMIT 10', [book.id]);
    res.json({
      book: {
        ...book,
        avg_rating: ratingRes.rows[0].avg ? parseFloat(parseFloat(ratingRes.rows[0].avg).toFixed(1)) : 0,
        review_count: parseInt(ratingRes.rows[0].count),
        reviews: reviewsRes.rows
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/books/:id/pdf — Protected
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      const orderRes = await q("SELECT id FROM orders WHERE user_id = $1 AND book_id = $2 AND payment_status = 'approved'", [req.user.id, req.params.id]);
      if (orderRes.rows.length === 0)
        return res.status(403).json({ error: 'Access denied. Please purchase this book first.' });
    }
    const bookRes = await q('SELECT pdf_file, title FROM books WHERE id = $1', [req.params.id]);
    const book = bookRes.rows[0];
    if (!book || !book.pdf_file)
      return res.status(404).json({ error: 'PDF not available yet. Please check back later.' });

    const IS_PROD = process.env.NODE_ENV === 'production';
    const pdfBase = IS_PROD ? '/opt/render/project/src/database' : path.join(__dirname, '..');
    const pdfPath = path.join(pdfBase, 'pdfs', book.pdf_file);

    if (!fs.existsSync(pdfPath))
      return res.status(404).json({ error: 'PDF file not found on server.' });

    const stat = fs.statSync(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/books/:id/progress
router.get('/:id/progress', auth, async (req, res) => {
  try {
    const result = await q('SELECT * FROM reading_progress WHERE user_id = $1 AND book_id = $2', [req.user.id, req.params.id]);
    res.json({ progress: result.rows[0] || { current_page: 1, total_pages: 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/books/:id/progress
router.post('/:id/progress', auth, async (req, res) => {
  try {
    const { current_page, total_pages } = req.body;
    await q(`
      INSERT INTO reading_progress (user_id, book_id, current_page, total_pages, last_read)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (user_id, book_id)
      DO UPDATE SET current_page=$3, total_pages=$4, last_read=NOW()
    `, [req.user.id, req.params.id, current_page, total_pages]);
    res.json({ message: 'Progress saved.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/books/:id/bookmarks
router.get('/:id/bookmarks', auth, async (req, res) => {
  try {
    const result = await q('SELECT * FROM bookmarks WHERE user_id = $1 AND book_id = $2 ORDER BY page_number', [req.user.id, req.params.id]);
    res.json({ bookmarks: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/books/:id/bookmarks
router.post('/:id/bookmarks', auth, async (req, res) => {
  try {
    const { page_number, note } = req.body;
    const result = await q('INSERT INTO bookmarks (user_id, book_id, page_number, note) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.id, req.params.id, page_number, note || null]);
    res.json({ bookmark: { id: result.rows[0].id, page_number, note } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/books/:id/bookmarks/:bookmarkId
router.delete('/:id/bookmarks/:bookmarkId', auth, async (req, res) => {
  try {
    await q('DELETE FROM bookmarks WHERE id = $1 AND user_id = $2', [req.params.bookmarkId, req.user.id]);
    res.json({ message: 'Bookmark removed.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
