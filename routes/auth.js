const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const auth = require('../middleware/auth');

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, instagram } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const existing = await db.getAsync('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await db.runAsync('INSERT INTO users (name, email, instagram, password_hash) VALUES (?,?,?,?)', [name, email, instagram || null, passwordHash]);

    const token = jwt.sign({ id: result.lastID, email, name, is_admin: false }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ message: 'Account created.', token, user: { id: result.lastID, name, email, instagram, is_admin: false } });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, is_admin: user.is_admin === 1 }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ message: 'Login successful.', token, user: { id: user.id, name: user.name, email: user.email, instagram: user.instagram, is_admin: user.is_admin === 1 } });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  res.json({ message: 'If this email is registered, instructions have been sent. Contact @mohitkushwaha on Instagram for immediate help.' });
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const user = await db.getAsync('SELECT id, name, email, instagram, is_admin, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: { ...user, is_admin: user.is_admin === 1 } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
