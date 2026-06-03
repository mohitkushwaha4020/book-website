const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const auth = require('../middleware/auth');

// GET /api/books
router.get('/', async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = 'SELECT id, title, author, price, description, pages, category, cover_image, is_active, created_at FROM books WHERE is_active = 1';
    const params = [];
    if (search) { query += ' AND (title LIKE ? OR description LIKE ? OR category LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (category && category !== 'all') { query += ' AND category LIKE ?'; params.push(`%${category}%`); }
    query += ' ORDER BY created_at DESC';
    const books = await db.allAsync(query, params);
    const booksWithRatings = await Promise.all(books.map(async b => {
      const r = await db.getAsync('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE book_id = ?', [b.id]);
      return { ...b, avg_rating: r.avg ? parseFloat(r.avg.toFixed(1)) : 0, review_count: r.count };
    }));
    res.json({ books: booksWithRatings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/books/:id
router.get('/:id', async (req, res) => {
  try {
    const book = await db.getAsync('SELECT id, title, author, price, description, pages, category, cover_image, is_active, created_at FROM books WHERE id = ? AND is_active = 1', [req.params.id]);
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const rating = await db.getAsync('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE book_id = ?', [book.id]);
    const reviews = await db.allAsync('SELECT r.id, r.rating, r.review_text, r.created_at, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.book_id = ? ORDER BY r.created_at DESC LIMIT 10', [book.id]);
    res.json({ book: { ...book, avg_rating: rating.avg ? parseFloat(rating.avg.toFixed(1)) : 0, review_count: rating.count, reviews } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/books/:id/pdf — Protected
router.get('/:id/pdf', auth, async (req, res) => {
  try {
    if (!req.user.is_admin) {
      const order = await db.getAsync("SELECT id FROM orders WHERE user_id = ? AND book_id = ? AND payment_status = 'approved'", [req.user.id, req.params.id]);
      if (!order) return res.status(403).json({ error: 'Access denied. Please purchase this book first.' });
    }
    const book = await db.getAsync('SELECT pdf_file, title FROM books WHERE id = ?', [req.params.id]);
    if (!book || !book.pdf_file) return res.status(404).json({ error: 'PDF not available yet. Please check back later.' });
    const pdfBase = process.env.NODE_ENV === 'production' ? '/opt/render/project/src/database' : path.join(__dirname, '..');
    const pdfPath = path.join(pdfBase, 'pdfs', book.pdf_file);
    if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: 'PDF file not found on server.' });
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
    const p = await db.getAsync('SELECT * FROM reading_progress WHERE user_id = ? AND book_id = ?', [req.user.id, req.params.id]);
    res.json({ progress: p || { current_page: 1, total_pages: 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/books/:id/progress
router.post('/:id/progress', auth, async (req, res) => {
  try {
    const { current_page, total_pages } = req.body;
    await db.runAsync('INSERT INTO reading_progress (user_id, book_id, current_page, total_pages, last_read) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id, book_id) DO UPDATE SET current_page=excluded.current_page, total_pages=excluded.total_pages, last_read=CURRENT_TIMESTAMP', [req.user.id, req.params.id, current_page, total_pages]);
    res.json({ message: 'Progress saved.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/books/:id/bookmarks
router.get('/:id/bookmarks', auth, async (req, res) => {
  try {
    const bookmarks = await db.allAsync('SELECT * FROM bookmarks WHERE user_id = ? AND book_id = ? ORDER BY page_number', [req.user.id, req.params.id]);
    res.json({ bookmarks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/books/:id/bookmarks
router.post('/:id/bookmarks', auth, async (req, res) => {
  try {
    const { page_number, note } = req.body;
    const result = await db.runAsync('INSERT INTO bookmarks (user_id, book_id, page_number, note) VALUES (?,?,?,?)', [req.user.id, req.params.id, page_number, note || null]);
    res.json({ bookmark: { id: result.lastID, page_number, note } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/books/:id/bookmarks/:bookmarkId
router.delete('/:id/bookmarks/:bookmarkId', auth, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM bookmarks WHERE id = ? AND user_id = ?', [req.params.bookmarkId, req.user.id]);
    res.json({ message: 'Bookmark removed.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
