const express = require('express');
const router = express.Router();
const db = require('../database/db');
const auth = require('../middleware/auth');

router.get('/:bookId', async (req, res) => {
  try {
    const reviews = await db.allAsync('SELECT r.id, r.rating, r.review_text, r.created_at, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.book_id = ? ORDER BY r.created_at DESC', [req.params.bookId]);
    const stats = await db.getAsync('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE book_id = ?', [req.params.bookId]);
    res.json({ reviews, avg_rating: stats && stats.avg ? parseFloat(parseFloat(stats.avg).toFixed(1)) : 0, total_reviews: stats ? parseInt(stats.count) : 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:bookId', auth, async (req, res) => {
  try {
    const { rating, review_text } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5.' });
    const order = await db.getAsync("SELECT id FROM orders WHERE user_id = ? AND book_id = ? AND payment_status = 'approved'", [req.user.id, req.params.bookId]);
    if (!order) return res.status(403).json({ error: 'You can only review books you have purchased.' });
    await db.runAsync(`
      INSERT INTO reviews (user_id, book_id, rating, review_text) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET rating=excluded.rating, review_text=excluded.review_text
    `, [req.user.id, req.params.bookId, parseInt(rating), review_text || null]);
    res.json({ message: 'Review submitted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
