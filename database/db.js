/**
 * Database module — Dual mode:
 * - Production (NODE_ENV=production): PostgreSQL via Supabase
 * - Development (local): SQLite
 */

const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const IS_PROD = process.env.NODE_ENV === 'production';

let db;

if (IS_PROD && process.env.DATABASE_URL) {
  // ============ POSTGRESQL (Supabase) ============
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const q = (sql, params = []) => pool.query(sql, params);

  db = {
    getAsync: async (sql, params = []) => {
      const { rows } = await pool.query(toPg(sql, params));
      return rows[0] || null;
    },
    allAsync: async (sql, params = []) => {
      const { rows } = await pool.query(toPg(sql, params));
      return rows;
    },
    runAsync: async (sql, params = []) => {
      const isInsert = /^\s*INSERT/i.test(sql);
      let pgq = toPg(sql, params);
      if (isInsert) pgq.text = pgq.text.replace(/;?\s*$/, ' RETURNING id');
      const res = await pool.query(pgq);
      return { lastID: res.rows[0]?.id || null, changes: res.rowCount };
    },
    execAsync: async (sql) => { await pool.query(sql); }
  };

  function toPg(sql, params = []) {
    let i = 0;
    const text = sql
      .replace(/\?/g, () => `$${++i}`)
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
      .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMPTZ DEFAULT NOW()')
      .replace(/DATETIME/gi, 'TIMESTAMPTZ')
      .replace(/NULLS LAST/gi, 'NULLS LAST');
    return { text, values: params };
  }

  // Init PostgreSQL tables
  (async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
          instagram TEXT, password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS books (
          id SERIAL PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL DEFAULT 'Mohit Kushwaha',
          price REAL NOT NULL, description TEXT, pages INTEGER, category TEXT,
          cover_image TEXT, pdf_file TEXT, is_active INTEGER DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
          book_id INTEGER NOT NULL REFERENCES books(id), payment_screenshot TEXT,
          payment_status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS reading_progress (
          id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
          book_id INTEGER NOT NULL REFERENCES books(id), current_page INTEGER DEFAULT 1,
          total_pages INTEGER DEFAULT 0, last_read TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(user_id, book_id)
        );
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
          book_id INTEGER NOT NULL REFERENCES books(id), rating INTEGER NOT NULL,
          review_text TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id, book_id)
        );
        CREATE TABLE IF NOT EXISTS bookmarks (
          id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
          book_id INTEGER NOT NULL REFERENCES books(id), page_number INTEGER NOT NULL,
          note TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Seed books
      const bc = await pool.query('SELECT COUNT(*) as c FROM books');
      if (parseInt(bc.rows[0].c) === 0) {
        const books = [
          ['1000 Miles of Love','Mohit Kushwaha',199,'A breathtaking journey of love that transcends distance and time. Two souls separated by a thousand miles discover that true love knows no boundaries.',280,'Romance','/uploads/covers/1000-miles-of-love.jpg'],
          ['When Trust Breaks','Mohit Kushwaha',179,'A powerful exploration of betrayal, healing, and the fragile nature of human trust. When the foundation of a relationship shatters, what remains?',240,'Drama','/uploads/covers/when-trust-breaks.jpg'],
          ['Someone I Love','Mohit Kushwaha',189,'An intimate portrait of love in all its forms — romantic, familial, and self-love. A story about the someone who changes everything.',260,'Romance / Fiction','/uploads/covers/someone-i-love.jpg'],
          ['The Art of Loneliness: Healing and Becoming','Mohit Kushwaha',219,'In a world more connected than ever, why do so many of us feel profoundly alone? A companion for the solitary journey toward wholeness.',320,'Self-Help','/uploads/covers/art-of-loneliness.jpg'],
        ];
        for (const b of books) {
          await pool.query('INSERT INTO books (title,author,price,description,pages,category,cover_image) VALUES ($1,$2,$3,$4,$5,$6,$7)', b);
        }
        console.log('✅ Books seeded (PG)');
      }

      // Seed admin
      const ac = await pool.query('SELECT COUNT(*) as c FROM users WHERE is_admin=1');
      if (parseInt(ac.rows[0].c) === 0) {
        const hash = bcrypt.hashSync('Admin@123', 10);
        await pool.query('INSERT INTO users (name,email,instagram,password_hash,is_admin) VALUES ($1,$2,$3,$4,1)', ['Mohit Kushwaha','admin@mohitkushwaha.com','mohitkushwaha',hash]);
        console.log('✅ Admin seeded (PG)');
      }
      console.log('✅ PostgreSQL ready');
    } catch (e) { console.error('❌ PG init error:', e.message); }
  })();

} else {
  // ============ SQLITE (Local Development) ============
  const sqlite3 = require('sqlite3').verbose();
  const DB_PATH = path.join(__dirname, 'bookstore.db');
  const sqliteDb = new sqlite3.Database(DB_PATH, err => {
    if (err) console.error('SQLite error:', err.message);
    else console.log('✅ SQLite connected (development)');
  });

  sqliteDb.run('PRAGMA foreign_keys = ON');
  sqliteDb.run('PRAGMA journal_mode = WAL');

  db = {
    getAsync: (sql, params = []) => new Promise((res, rej) =>
      sqliteDb.get(sql, params, (e, row) => e ? rej(e) : res(row || null))),
    allAsync: (sql, params = []) => new Promise((res, rej) =>
      sqliteDb.all(sql, params, (e, rows) => e ? rej(e) : res(rows))),
    runAsync: (sql, params = []) => new Promise((res, rej) =>
      sqliteDb.run(sql, params, function(e) { e ? rej(e) : res({ lastID: this.lastID, changes: this.changes }); })),
    execAsync: (sql) => new Promise((res, rej) =>
      sqliteDb.exec(sql, e => e ? rej(e) : res()))
  };

  // Init SQLite tables
  db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      instagram TEXT, password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Mohit Kushwaha', price REAL NOT NULL,
      description TEXT, pages INTEGER, category TEXT, cover_image TEXT, pdf_file TEXT,
      is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
      payment_screenshot TEXT, payment_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (book_id) REFERENCES books(id)
    );
    CREATE TABLE IF NOT EXISTS reading_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
      current_page INTEGER DEFAULT 1, total_pages INTEGER DEFAULT 0,
      last_read DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, book_id),
      FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (book_id) REFERENCES books(id)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
      rating INTEGER NOT NULL, review_text TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, book_id),
      FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (book_id) REFERENCES books(id)
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, book_id INTEGER NOT NULL,
      page_number INTEGER NOT NULL, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (book_id) REFERENCES books(id)
    );
  `).then(async () => {
    // Seed books
    const bc = await db.getAsync('SELECT COUNT(*) as count FROM books');
    if (bc.count === 0) {
      const books = [
        ['1000 Miles of Love','Mohit Kushwaha',199,'A breathtaking journey of love that transcends distance and time. Two souls separated by a thousand miles discover that true love knows no boundaries.',280,'Romance','/uploads/covers/1000-miles-of-love.jpg'],
        ['When Trust Breaks','Mohit Kushwaha',179,'A powerful exploration of betrayal, healing, and the fragile nature of human trust. When the foundation of a relationship shatters, what remains?',240,'Drama','/uploads/covers/when-trust-breaks.jpg'],
        ['Someone I Love','Mohit Kushwaha',189,'An intimate portrait of love in all its forms — romantic, familial, and self-love. A story about the someone who changes everything.',260,'Romance / Fiction','/uploads/covers/someone-i-love.jpg'],
        ['The Art of Loneliness: Healing and Becoming','Mohit Kushwaha',219,'In a world more connected than ever, why do so many of us feel profoundly alone? A companion for the solitary journey toward wholeness.',320,'Self-Help','/uploads/covers/art-of-loneliness.jpg'],
      ];
      for (const b of books) {
        await db.runAsync('INSERT INTO books (title,author,price,description,pages,category,cover_image) VALUES (?,?,?,?,?,?,?)', b);
      }
      console.log('✅ Books seeded (SQLite)');
    }
    // Seed admin
    const ac = await db.getAsync('SELECT COUNT(*) as count FROM users WHERE is_admin=1');
    if (ac.count === 0) {
      const hash = bcrypt.hashSync('Admin@123', 10);
      await db.runAsync('INSERT INTO users (name,email,instagram,password_hash,is_admin) VALUES (?,?,?,?,1)', ['Mohit Kushwaha','admin@mohitkushwaha.com','mohitkushwaha',hash]);
      console.log('✅ Admin seeded (SQLite)');
    }
    console.log('✅ SQLite ready');
  }).catch(e => console.error('SQLite init error:', e.message));
}

module.exports = db;
