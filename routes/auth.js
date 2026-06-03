const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const auth = require('../middleware/auth');

// Use pg pool directly for clean queries
const pool = new (require('pg').Pool)({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const q = async (sql, params = []) => {
  const res = await pool.query(sql, params);
  return res;
};

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, instagram } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const existing = await q('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Email already registered.' });

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await q(
      'INSERT INTO users (name, email, instagram, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
      [name, email, instagram || null, passwordHash]
    );
    const userId = result.rows[0].id;
    const token = jwt.sign({ id: userId, email, name, is_admin: false }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ message: 'Account created.', token, user: { id: userId, name, email, instagram, is_admin: false } });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const result = await q('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin === 1 },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({
      message: 'Login successful.', token,
      user: { id: user.id, name: user.name, email: user.email, instagram: user.instagram, is_admin: user.is_admin === 1 }
    });
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
    const result = await q('SELECT id, name, email, instagram, is_admin, created_at FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: { ...user, is_admin: user.is_admin === 1 } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
