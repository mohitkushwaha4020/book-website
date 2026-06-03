const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const adminAuth = require('../middleware/admin');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const IS_PROD = process.env.NODE_ENV === 'production';
const PERSISTENT_BASE = IS_PROD ? '/opt/render/project/src/database' : path.join(__dirname, '..');
const coversDir = path.join(PERSISTENT_BASE, 'uploads', 'covers');
const pdfsDir = path.join(PERSISTENT_BASE, 'pdfs');
[coversDir, pdfsDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const mixedUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, file.fieldname === 'cover' ? coversDir : pdfsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname === 'cover' ? `cover_${Date.now()}${ext}` : `book_${Date.now()}.pdf`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }
});

const q = (sql, params = []) => pool.query(sql, params);

// GET /api/admin/stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = parseInt((await q('SELECT COUNT(*) as c FROM users WHERE is_admin = 0')).rows[0].c);
    const totalBooks = parseInt((await q('SELECT COUNT(*) as c FROM books WHERE is_active = 1')).rows[0].c);
    const totalOrders = parseInt((await q('SELECT COUNT(*) as c FROM orders')).rows[0].c);
    const pendingOrders = parseInt((await q("SELECT COUNT(*) as c FROM orders WHERE payment_status = 'pending'")).rows[0].c);
    const approvedOrders = parseInt((await q("SELECT COUNT(*) as c FROM orders WHERE payment_status = 'approved'")).rows[0].c);
    res.json({ totalUsers, totalBooks, totalOrders, pendingOrders, approvedOrders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/orders
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT o.id, o.payment_status, o.payment_screenshot, o.created_at, u.name as user_name, u.email as user_email, u.instagram as user_instagram, b.title as book_title, b.price as book_price FROM orders o JOIN users u ON o.user_id = u.id JOIN books b ON o.book_id = b.id';
    const params = [];
    if (status && status !== 'all') { sql += ' WHERE o.payment_status = $1'; params.push(status); }
    sql += ' ORDER BY o.created_at DESC';
    const result = await q(sql, params);
    res.json({ orders: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH approve/reject
router.patch('/orders/:id/approve', adminAuth, async (req, res) => {
  try { await q("UPDATE orders SET payment_status = 'approved' WHERE id = $1", [req.params.id]); res.json({ message: 'Order approved.' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch('/orders/:id/reject', adminAuth, async (req, res) => {
  try { await q("UPDATE orders SET payment_status = 'rejected' WHERE id = $1", [req.params.id]); res.json({ message: 'Order rejected.' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/books
router.get('/books', adminAuth, async (req, res) => {
  try {
    const result = await q('SELECT * FROM books ORDER BY created_at DESC');
    res.json({ books: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/books
router.post('/books', adminAuth, mixedUpload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, author, price, description, pages, category } = req.body;
    if (!title || !price) return res.status(400).json({ error: 'Title and price are required.' });
    const coverFile = req.files && req.files['cover'] ? `/uploads/covers/${req.files['cover'][0].filename}` : null;
    const pdfFile = req.files && req.files['pdf'] ? req.files['pdf'][0].filename : null;
    const result = await q(
      'INSERT INTO books (title, author, price, description, pages, category, cover_image, pdf_file) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [title, author || 'Mohit Kushwaha', parseFloat(price), description || null, parseInt(pages) || null, category || null, coverFile, pdfFile]
    );
    res.json({ message: 'Book added.', book_id: result.rows[0].id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/books/:id
router.put('/books/:id', adminAuth, mixedUpload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  try {
    const bookRes = await q('SELECT * FROM books WHERE id = $1', [req.params.id]);
    const book = bookRes.rows[0];
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const { title, author, price, description, pages, category, is_active } = req.body;
    const coverFile = req.files && req.files['cover'] ? `/uploads/covers/${req.files['cover'][0].filename}` : book.cover_image;
    const pdfFile = req.files && req.files['pdf'] ? req.files['pdf'][0].filename : book.pdf_file;
    await q(
      'UPDATE books SET title=$1, author=$2, price=$3, description=$4, pages=$5, category=$6, cover_image=$7, pdf_file=$8, is_active=$9 WHERE id=$10',
      [title||book.title, author||book.author, price?parseFloat(price):book.price, description!==undefined?description:book.description, pages?parseInt(pages):book.pages, category||book.category, coverFile, pdfFile, is_active!==undefined?parseInt(is_active):book.is_active, req.params.id]
    );
    res.json({ message: 'Book updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/books/:id
router.delete('/books/:id', adminAuth, async (req, res) => {
  try { await q('UPDATE books SET is_active = 0 WHERE id = $1', [req.params.id]); res.json({ message: 'Book deactivated.' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/users
router.get('/users', adminAuth, async (req, res) => {
  try {
    const result = await q(`
      SELECT u.id, u.name, u.email, u.instagram, u.is_admin, u.created_at,
             COUNT(DISTINCT o.id) as books_owned
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id AND o.payment_status = 'approved'
      GROUP BY u.id ORDER BY u.created_at DESC
    `);
    res.json({ users: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Grant/Remove access
router.patch('/users/:id/grant-access/:bookId', adminAuth, async (req, res) => {
  try {
    const { id: userId, bookId } = req.params;
    const existing = await q("SELECT id FROM orders WHERE user_id = $1 AND book_id = $2 AND payment_status = 'approved'", [userId, bookId]);
    if (existing.rows.length > 0) return res.json({ message: 'User already has access.' });
    await q("INSERT INTO orders (user_id, book_id, payment_status) VALUES ($1,$2,'approved')", [userId, bookId]);
    res.json({ message: 'Access granted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/users/:id/remove-access/:bookId', adminAuth, async (req, res) => {
  try {
    await q("UPDATE orders SET payment_status = 'rejected' WHERE user_id = $1 AND book_id = $2 AND payment_status = 'approved'", [req.params.id, req.params.bookId]);
    res.json({ message: 'Access removed.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
