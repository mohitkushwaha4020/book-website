const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Supabase / PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Promise-based query helpers (same interface used across routes)
const db = {
  // Single row
  getAsync: async (sql, params = []) => {
    const pgSql = toPostgres(sql);
    const res = await pool.query(pgSql, params);
    return res.rows[0] || null;
  },
  // Multiple rows
  allAsync: async (sql, params = []) => {
    const pgSql = toPostgres(sql);
    const res = await pool.query(pgSql, params);
    return res.rows;
  },
  // Insert/Update/Delete — returns { lastID, changes }
  runAsync: async (sql, params = []) => {
    const pgSql = toPostgres(sql);
    // For INSERT ... RETURNING id
    const isInsert = /^\s*INSERT/i.test(sql);
    const query = isInsert ? pgSql.replace(/;?\s*$/, ' RETURNING id') : pgSql;
    const res = await pool.query(query, params);
    return {
      lastID: res.rows[0] ? res.rows[0].id : null,
      changes: res.rowCount
    };
  },
  // Raw exec (for CREATE TABLE etc.)
  execAsync: async (sql) => {
    await pool.query(sql);
  }
};

// Convert SQLite syntax → PostgreSQL syntax
function toPostgres(sql) {
  return sql
    // ? → $1, $2, $3 ...
    .replace(/\?/g, () => {
      toPostgres._counter = (toPostgres._counter || 0) + 1;
      return `$${toPostgres._counter}`;
    })
    // AUTOINCREMENT → SERIAL (handled in CREATE TABLE)
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    // DATETIME DEFAULT CURRENT_TIMESTAMP → TIMESTAMPTZ DEFAULT NOW()
    .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMPTZ DEFAULT NOW()')
    .replace(/DATETIME/gi, 'TIMESTAMPTZ')
    // ON CONFLICT ... DO UPDATE (SQLite UPSERT — Postgres same syntax mostly)
    .replace(/NULLS LAST/gi, 'NULLS LAST')
    // BOOLEAN fields
    .replace(/INTEGER DEFAULT 0/gi, 'INTEGER DEFAULT 0');
}

// Reset counter before each query (patch toPostgres to use closure)
const _origGet = db.getAsync;
const _origAll = db.allAsync;
const _origRun = db.runAsync;

db.getAsync = async (sql, params = []) => {
  toPostgres._counter = 0;
  return _origGet(sql, params);
};
db.allAsync = async (sql, params = []) => {
  toPostgres._counter = 0;
  return _origAll(sql, params);
};
db.runAsync = async (sql, params = []) => {
  toPostgres._counter = 0;
  return _origRun(sql, params);
};
db.execAsync = async (sql) => {
  await pool.query(sql);
};

// Initialize tables and seed data
async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        instagram TEXT,
        password_hash TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS books (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'Mohit Kushwaha',
        price REAL NOT NULL,
        description TEXT,
        pages INTEGER,
        category TEXT,
        cover_image TEXT,
        pdf_file TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        book_id INTEGER NOT NULL REFERENCES books(id),
        payment_screenshot TEXT,
        payment_status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reading_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        book_id INTEGER NOT NULL REFERENCES books(id),
        current_page INTEGER DEFAULT 1,
        total_pages INTEGER DEFAULT 0,
        last_read TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, book_id)
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        book_id INTEGER NOT NULL REFERENCES books(id),
        rating INTEGER NOT NULL,
        review_text TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, book_id)
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        book_id INTEGER NOT NULL REFERENCES books(id),
        page_number INTEGER NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ Tables ready.');

    // Seed books
    const bookCount = await pool.query('SELECT COUNT(*) as count FROM books');
    if (parseInt(bookCount.rows[0].count) === 0) {
      const books = [
        ['1000 Miles of Love', 'Mohit Kushwaha', 199, 'A breathtaking journey of love that transcends distance and time. Two souls separated by a thousand miles discover that true love knows no boundaries. This heartfelt story explores the depths of longing, the beauty of connection, and the courage it takes to follow your heart across the world.', 280, 'Romance', '/uploads/covers/1000-miles-of-love.jpg'],
        ['When Trust Breaks', 'Mohit Kushwaha', 179, 'A powerful exploration of betrayal, healing, and the fragile nature of human trust. When the foundation of a relationship shatters, what remains? This deeply moving story follows a journey of rebuilding — not just relationships, but the self. A must-read for anyone who has loved and lost.', 240, 'Drama', '/uploads/covers/when-trust-breaks.jpg'],
        ['Someone I Love', 'Mohit Kushwaha', 189, 'An intimate portrait of love in all its forms — romantic, familial, and self-love. Through beautifully crafted prose, this novel takes you on an emotional odyssey that will make you see the people in your life with new eyes. A story about the someone who changes everything.', 260, 'Romance / Fiction', '/uploads/covers/someone-i-love.jpg'],
        ['The Art of Loneliness: Healing and Becoming', 'Mohit Kushwaha', 219, 'In a world more connected than ever, why do so many of us feel profoundly alone? This transformative guide invites you to sit with your loneliness, understand it, and ultimately transform it into your greatest strength. Part memoir, part self-help, this book is a companion for the solitary journey toward wholeness.', 320, 'Self-Help', '/uploads/covers/art-of-loneliness.jpg'],
      ];
      for (const b of books) {
        await pool.query(
          'INSERT INTO books (title, author, price, description, pages, category, cover_image) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          b
        );
      }
      console.log('✅ Books seeded.');
    }

    // Seed admin
    const adminCount = await pool.query('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');
    if (parseInt(adminCount.rows[0].count) === 0) {
      const hash = bcrypt.hashSync('Admin@123', 10);
      await pool.query(
        'INSERT INTO users (name, email, instagram, password_hash, is_admin) VALUES ($1,$2,$3,$4,1)',
        ['Mohit Kushwaha', 'admin@mohitkushwaha.com', 'mohitkushwaha', hash]
      );
      console.log('✅ Admin seeded.');
    }

    console.log('✅ Database initialized successfully.');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}

init();

module.exports = db;
