const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const q = (sql, params = []) => pool.query(sql, params);

// GET /api/reviews/:bookId
router.get('/:bookId', async (req, res) => {
  try {
    const reviews = await q('SELECT r.id, r.rating, r.review_text, r.created_at, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.book_id = $1 ORDER BY r.created_at DESC', [req.params.bookId]);
    const stats = await q('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE book_id = $1', [req.params.bookId]);
    res.json({ reviews: reviews.rows, avg_rating: stats.rows[0].avg ? parseFloat(parseFloat(stats.rows[0].avg).toFixed(1)) : 0, total_reviews: parseInt(stats.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/reviews/:bookId
router.post('/:bookId', auth, async (req, res) => {
  try {
    const { rating, review_text } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5.' });
    const order = await q("SELECT id FROM orders WHERE user_id = $1 AND book_id = $2 AND payment_status = 'approved'", [req.user.id, req.params.bookId]);
    if (order.rows.length === 0) return res.status(403).json({ error: 'You can only review books you have purchased.' });
    await q(`
      INSERT INTO reviews (user_id, book_id, rating, review_text)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id, book_id)
      DO UPDATE SET rating=$3, review_text=$4
    `, [req.user.id, req.params.bookId, parseInt(rating), review_text || null]);
    res.json({ message: 'Review submitted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
