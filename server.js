require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required directories exist
['uploads/covers', 'uploads/screenshots', 'pdfs'].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
