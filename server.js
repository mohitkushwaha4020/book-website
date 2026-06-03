require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// On Render: use persistent disk path for uploads and pdfs
// Disk is mounted at /opt/render/project/src/database
// We store uploads + pdfs inside that persistent disk
const IS_PROD = process.env.NODE_ENV === 'production';
const PERSISTENT_BASE = IS_PROD ? '/opt/render/project/src/database' : __dirname;

// Ensure required directories exist
const dirs = [
  path.join(__dirname, 'public'),
  path.join(PERSISTENT_BASE, 'uploads/covers'),
  path.join(PERSISTENT_BASE, 'uploads/screenshots'),
  path.join(PERSISTENT_BASE, 'pdfs'),
];
dirs.forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

// Export paths for routes
app.locals.PERSISTENT_BASE = PERSISTENT_BASE;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(PERSISTENT_BASE, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/books', require('./routes/books'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/reviews', require('./routes/reviews'));

// Serve HTML pages
const viewsDir = path.join(__dirname, 'views');

const pages = [
  { path: '/', file: 'index.html' },
  { path: '/books', file: 'books.html' },
  { path: '/book/:id', file: 'book-details.html' },
  { path: '/payment', file: 'payment.html' },
  { path: '/payment-success', file: 'payment-success.html' },
  { path: '/login', file: 'login.html' },
  { path: '/signup', file: 'signup.html' },
  { path: '/forgot-password', file: 'forgot-password.html' },
  { path: '/dashboard', file: 'dashboard.html' },
  { path: '/library', file: 'library.html' },
  { path: '/reader', file: 'reader.html' },
  { path: '/contact', file: 'contact.html' },
  { path: '/admin', file: 'admin/index.html' },
  { path: '/admin/orders', file: 'admin/orders.html' },
  { path: '/admin/books', file: 'admin/books.html' },
  { path: '/admin/users', file: 'admin/users.html' },
];

pages.forEach(({ path: routePath, file }) => {
  app.get(routePath, (req, res) => {
    res.sendFile(path.join(viewsDir, file));
  });
});

// 404 Handler
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Route not found.' });
  }
  res.sendFile(path.join(viewsDir, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n📚 Mohit Kushwaha Bookstore running at http://localhost:${PORT}`);
  console.log(`👤 Admin: admin@mohitkushwaha.com / Admin@123\n`);
});
