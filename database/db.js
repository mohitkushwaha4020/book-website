const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Render pe persistent disk ka path: /opt/render/project/src/database
// Local pe: ./database/bookstore.db
const DB_DIR = process.env.NODE_ENV === 'production'
  ? path.join('/opt/render/project/src/database')
  : path.join(__dirname);

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'bookstore.db');
console.log('DB Path:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) console.error('DB open error:', err.message);
  else console.log('Database connected:', DB_PATH);
});

db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');

// Promisified helpers (synchronous-style interface for the rest of the code)
db.getAsync = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));
db.allAsync = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
db.runAsync = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res({ lastID: this.lastID, changes: this.changes }); }));
db.execAsync = (sql) => new Promise((res, rej) => db.exec(sql, e => e ? rej(e) : res()));

async function init() {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      instagram TEXT,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Mohit Kushwaha',
      price REAL NOT NULL,
      description TEXT,
      pages INTEGER,
      category TEXT,
      cover_image TEXT,
      pdf_file TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      payment_screenshot TEXT,
      payment_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );
    CREATE TABLE IF NOT EXISTS reading_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      current_page INTEGER DEFAULT 1,
      total_pages INTEGER DEFAULT 0,
      last_read DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, book_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      review_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, book_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      page_number INTEGER NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );
  `);

  // Seed books
  const bookCount = await db.getAsync('SELECT COUNT(*) as count FROM books');
  if (bookCount.count === 0) {
    const books = [
      ['1000 Miles of Love', 'Mohit Kushwaha', 199, 'A breathtaking journey of love that transcends distance and time. Two souls separated by a thousand miles discover that true love knows no boundaries. This heartfelt story explores the depths of longing, the beauty of connection, and the courage it takes to follow your heart across the world.', 280, 'Romance', '/uploads/covers/1000-miles-of-love.jpg'],
      ['When Trust Breaks', 'Mohit Kushwaha', 179, 'A powerful exploration of betrayal, healing, and the fragile nature of human trust. When the foundation of a relationship shatters, what remains? This deeply moving story follows a journey of rebuilding — not just relationships, but the self. A must-read for anyone who has loved and lost.', 240, 'Drama', '/uploads/covers/when-trust-breaks.jpg'],
      ['Someone I Love', 'Mohit Kushwaha', 189, 'An intimate portrait of love in all its forms — romantic, familial, and self-love. Through beautifully crafted prose, this novel takes you on an emotional odyssey that will make you see the people in your life with new eyes. A story about the someone who changes everything.', 260, 'Romance / Fiction', '/uploads/covers/someone-i-love.jpg'],
      ['The Art of Loneliness: Healing and Becoming', 'Mohit Kushwaha', 219, 'In a world more connected than ever, why do so many of us feel profoundly alone? This transformative guide invites you to sit with your loneliness, understand it, and ultimately transform it into your greatest strength. Part memoir, part self-help, this book is a companion for the solitary journey toward wholeness.', 320, 'Self-Help', '/uploads/covers/art-of-loneliness.jpg'],
    ];
    for (const b of books) {
      await db.runAsync('INSERT INTO books (title, author, price, description, pages, category, cover_image) VALUES (?,?,?,?,?,?,?)', b);
    }
    console.log('Books seeded.');
  }

  // Seed admin
  const adminCount = await db.getAsync('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');
  if (adminCount.count === 0) {
    const hash = bcrypt.hashSync('Admin@123', 10);
    await db.runAsync('INSERT INTO users (name, email, instagram, password_hash, is_admin) VALUES (?,?,?,?,1)', ['Mohit Kushwaha', 'admin@mohitkushwaha.com', 'mohitkushwaha', hash]);
    console.log('Admin user seeded.');
  }
}

init().catch(console.error);

module.exports = db;
