const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const adminAuth = require('../middleware/admin');

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

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = (await db.getAsync('SELECT COUNT(*) as c FROM users WHERE is_admin = 0')).c;
    const totalBooks = (await db.getAsync('SELECT COUNT(*) as c FROM books WHERE is_active = 1')).c;
    const totalOrders = (await db.getAsync('SELECT COUNT(*) as c FROM orders')).c;
    const pendingOrders = (await db.getAsync("SELECT COUNT(*) as c FROM orders WHERE payment_status = 'pending'")).c;
    const approvedOrders = (await db.getAsync("SELECT COUNT(*) as c FROM orders WHERE payment_status = 'approved'")).c;
    res.json({ totalUsers: parseInt(totalUsers), totalBooks: parseInt(totalBooks), totalOrders: parseInt(totalOrders), pendingOrders: parseInt(pendingOrders), approvedOrders: parseInt(approvedOrders) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT o.id, o.payment_status, o.payment_screenshot, o.created_at, u.name as user_name, u.email as user_email, u.instagram as user_instagram, b.title as book_title, b.price as book_price FROM orders o JOIN users u ON o.user_id = u.id JOIN books b ON o.book_id = b.id';
    const params = [];
    if (status && status !== 'all') { sql += ' WHERE o.payment_status = ?'; params.push(status); }
    sql += ' ORDER BY o.created_at DESC';
    const orders = await db.allAsync(sql, params);
    res.json({ orders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/orders/:id/approve', adminAuth, async (req, res) => {
  try { await db.runAsync("UPDATE orders SET payment_status = 'approved' WHERE id = ?", [req.params.id]); res.json({ message: 'Order approved.' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/orders/:id/reject', adminAuth, async (req, res) => {
  try { await db.runAsync("UPDATE orders SET payment_status = 'rejected' WHERE id = ?", [req.params.id]); res.json({ message: 'Order rejected.' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/books', adminAuth, async (req, res) => {
  try {
    const books = await db.allAsync('SELECT * FROM books ORDER BY created_at DESC');
    res.json({ books });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/books', adminAuth, mixedUpload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, author, price, description, pages, category } = req.body;
    if (!title || !price) return res.status(400).json({ error: 'Title and price required.' });
    const coverFile = req.files && req.files['cover'] ? `/uploads/covers/${req.files['cover'][0].filename}` : null;
    const pdfFile = req.files && req.files['pdf'] ? req.files['pdf'][0].filename : null;
    const result = await db.runAsync('INSERT INTO books (title, author, price, description, pages, category, cover_image, pdf_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [title, author || 'Mohit Kushwaha', parseFloat(price), description || null, parseInt(pages) || null, category || null, coverFile, pdfFile]);
    res.json({ message: 'Book added.', book_id: result.lastID });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/books/:id', adminAuth, mixedUpload.fields([{ name: 'cover', maxCount: 1 }, { name: 'pdf', maxCount: 1 }]), async (req, res) => {
  try {
    const book = await db.getAsync('SELECT * FROM books WHERE id = ?', [req.params.id]);
    if (!book) return res.status(404).json({ error: 'Book not found.' });
    const { title, author, price, description, pages, category, is_active } = req.body;
    const coverFile = req.files && req.files['cover'] ? `/uploads/covers/${req.files['cover'][0].filename}` : book.cover_image;
    const pdfFile = req.files && req.files['pdf'] ? req.files['pdf'][0].filename : book.pdf_file;
    await db.runAsync('UPDATE books SET title=?, author=?, price=?, description=?, pages=?, category=?, cover_image=?, pdf_file=?, is_active=? WHERE id=?', [title||book.title, author||book.author, price?parseFloat(price):book.price, description!==undefined?description:book.description, pages?parseInt(pages):book.pages, category||book.category, coverFile, pdfFile, is_active!==undefined?parseInt(is_active):book.is_active, req.params.id]);
    res.json({ message: 'Book updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/books/:id', adminAuth, async (req, res) => {
  try { await db.runAsync('UPDATE books SET is_active = 0 WHERE id = ?', [req.params.id]); res.json({ message: 'Book deactivated.' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await db.allAsync("SELECT u.id, u.name, u.email, u.instagram, u.is_admin, u.created_at, COUNT(DISTINCT o.id) as books_owned FROM users u LEFT JOIN orders o ON o.user_id = u.id AND o.payment_status = 'approved' GROUP BY u.id ORDER BY u.created_at DESC");
    res.json({ users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/users/:id/grant-access/:bookId', adminAuth, async (req, res) => {
  try {
    const existing = await db.getAsync("SELECT id FROM orders WHERE user_id = ? AND book_id = ? AND payment_status = 'approved'", [req.params.id, req.params.bookId]);
    if (existing) return res.json({ message: 'Already has access.' });
    await db.runAsync("INSERT INTO orders (user_id, book_id, payment_status) VALUES (?, ?, 'approved')", [req.params.id, req.params.bookId]);
    res.json({ message: 'Access granted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/users/:id/remove-access/:bookId', adminAuth, async (req, res) => {
  try {
    await db.runAsync("UPDATE orders SET payment_status = 'rejected' WHERE user_id = ? AND book_id = ? AND payment_status = 'approved'", [req.params.id, req.params.bookId]);
    res.json({ message: 'Access removed.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
