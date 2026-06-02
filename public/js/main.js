/* ============================================
   MAIN.JS — Mohit Kushwaha Bookstore
   ============================================ */

const API = '';

/* ---- Auth State ---- */
function getToken() { return localStorage.getItem('mk_token'); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('mk_user')); } catch { return null; }
}
function isLoggedIn() { return !!getToken(); }

/* ---- Toast System ---- */
function showToast(message, type = 'info', title = '') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <div class="toast-body">
      <div class="toast-title">${title || titles[type]}</div>
      <div class="toast-msg">${message}</div>
    </div>
    <span class="toast-close">×</span>
  `;
  toast.querySelector('.toast-close').onclick = () => removeToast(toast);
  container.appendChild(toast);
  setTimeout(() => removeToast(toast), 4500);
}
function removeToast(toast) {
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 300);
}

/* ---- Navigation ---- */
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll);
  onScroll();

  // Hamburger
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => mobileNav.classList.toggle('open'));
  }
  document.addEventListener('click', e => {
    if (mobileNav && !mobileNav.contains(e.target) && !hamburger.contains(e.target)) {
      mobileNav.classList.remove('open');
    }
  });

  // User dropdown
  const avatar = document.querySelector('.nav-avatar');
  const dropdown = document.querySelector('.nav-dropdown');
  if (avatar && dropdown) {
    avatar.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('open'); });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }

  updateNavAuth();
}

function updateNavAuth() {
  const user = getUser();
  const loginBtn = document.querySelector('.nav-login-btn');
  const signupBtn = document.querySelector('.nav-signup-btn');
  const userMenu = document.querySelector('.nav-user-menu');
  const navAvatar = document.querySelector('.nav-avatar');
  const navUserName = document.querySelector('.nav-user-name');
  const mobileAuthLinks = document.querySelector('.mobile-auth-links');
  const mobileUserLinks = document.querySelector('.mobile-user-links');

  if (user) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (userMenu) userMenu.style.display = 'block';
    if (navAvatar) navAvatar.textContent = user.name.charAt(0).toUpperCase();
    if (navUserName) navUserName.textContent = user.name;
    if (mobileAuthLinks) mobileAuthLinks.style.display = 'none';
    if (mobileUserLinks) mobileUserLinks.style.display = 'block';
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (signupBtn) signupBtn.style.display = '';
    if (userMenu) userMenu.style.display = 'none';
    if (mobileAuthLinks) mobileAuthLinks.style.display = 'block';
    if (mobileUserLinks) mobileUserLinks.style.display = 'none';
  }
}

function logout() {
  localStorage.removeItem('mk_token');
  localStorage.removeItem('mk_user');
  window.location.href = '/';
}

/* ---- Fetch helper ---- */
async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body instanceof FormData) delete headers['Content-Type'];
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---- Book Card HTML ---- */
function renderBookCard(book) {
  const stars = renderStars(book.avg_rating || 0);
  return `
    <div class="book-card fade-in" data-id="${book.id}">
      <div class="book-card-cover">
        <img src="${book.cover_image || '/images/placeholder.svg'}" alt="${book.title}" loading="lazy" onerror="this.src='/images/placeholder.svg'">
        <span class="book-card-badge">New</span>
      </div>
      <div class="book-card-body">
        <div class="book-card-category">${book.category || 'Fiction'}</div>
        <h3 class="book-card-title">${book.title}</h3>
        <p class="book-card-desc">${book.description || ''}</p>
        <div class="star-rating">${stars}<span class="rating-count">(${book.review_count || 0})</span></div>
        <div class="book-card-footer">
          <div>
            <span class="book-price">₹${book.price}</span>
          </div>
        </div>
        <div class="book-card-actions">
          <a href="/book/${book.id}" class="btn btn-outline btn-sm">Details</a>
          <a href="/payment?book=${book.id}" class="btn btn-primary btn-sm">Buy Now</a>
        </div>
      </div>
    </div>
  `;
}

function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star ${i <= Math.round(rating) ? 'filled' : ''}">★</span>`;
  }
  return html;
}

/* ---- Load Books on Home ---- */
async function loadFeaturedBooks() {
  const container = document.getElementById('featured-books-grid');
  if (!container) return;
  container.innerHTML = '<div class="spinner"></div>';
  try {
    const { books } = await apiFetch('/api/books');
    if (!books.length) { container.innerHTML = '<p class="text-center text-muted">No books available yet.</p>'; return; }
    container.innerHTML = books.slice(0, 4).map(renderBookCard).join('');
  } catch {
    container.innerHTML = '<p class="text-center text-muted">Could not load books.</p>';
  }
}

/* ---- Load Books Page ---- */
async function loadBooksPage() {
  const container = document.getElementById('books-grid');
  const searchInput = document.getElementById('book-search');
  const filterBtns = document.querySelectorAll('.filter-btn');
  if (!container) return;

  let currentCategory = 'all';
  let searchTimeout;

  const load = async (search = '', category = '') => {
    container.innerHTML = '<div class="spinner"></div>';
    try {
      let url = '/api/books?';
      if (search) url += `search=${encodeURIComponent(search)}&`;
      if (category && category !== 'all') url += `category=${encodeURIComponent(category)}`;
      const { books } = await apiFetch(url);
      if (!books.length) {
        container.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <h3>No books found</h3>
            <p>Try a different search or category</p>
          </div>`;
        return;
      }
      container.innerHTML = books.map(renderBookCard).join('');
    } catch {
      container.innerHTML = '<p class="text-center text-muted" style="grid-column:1/-1">Could not load books.</p>';
    }
  };

  if (searchInput) {
    searchInput.addEventListener('input', e => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => load(e.target.value, currentCategory), 400);
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category || 'all';
      load(searchInput ? searchInput.value : '', currentCategory);
    });
  });

  await load();
}

/* ---- Load Book Detail ---- */
async function loadBookDetail() {
  const container = document.getElementById('book-detail-content');
  if (!container) return;

  const bookId = window.location.pathname.split('/').pop();
  try {
    const { book } = await apiFetch(`/api/books/${bookId}`);
    document.title = `${book.title} — Mohit Kushwaha`;

    document.getElementById('book-cover').src = book.cover_image || '/images/placeholder.svg';
    document.getElementById('book-cover').alt = book.title;
    document.getElementById('book-title').textContent = book.title;
    document.getElementById('book-author').textContent = book.author;
    document.getElementById('book-price').textContent = `₹${book.price}`;
    document.getElementById('book-description').textContent = book.description || '';
    document.getElementById('book-pages').textContent = book.pages ? `${book.pages} pages` : 'N/A';
    document.getElementById('book-category').textContent = book.category || 'Fiction';
    document.getElementById('book-rating').innerHTML = renderStars(book.avg_rating) + ` <span style="margin-left:6px;color:#888;font-size:0.85rem">${book.avg_rating}/5 (${book.review_count} reviews)</span>`;

    const buyBtn = document.getElementById('buy-now-btn');
    if (buyBtn) buyBtn.href = `/payment?book=${book.id}`;

    // Reviews
    const reviewsContainer = document.getElementById('reviews-list');
    if (reviewsContainer) {
      if (book.reviews && book.reviews.length) {
        reviewsContainer.innerHTML = book.reviews.map(r => `
          <div class="review-item">
            <div class="review-header">
              <div class="review-avatar">${r.user_name.charAt(0).toUpperCase()}</div>
              <div>
                <div class="review-name">${r.user_name}</div>
                <div class="star-rating">${renderStars(r.rating)}</div>
              </div>
            </div>
            <p class="review-text">${r.review_text || ''}</p>
          </div>
        `).join('');
      } else {
        reviewsContainer.innerHTML = '<p class="text-muted" style="font-size:0.9rem">No reviews yet. Be the first to review!</p>';
      }
    }
  } catch (e) {
    container.innerHTML = '<p class="text-center text-muted">Book not found.</p>';
  }
}

/* ---- Intersection Observer Animations ---- */
function initAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
}

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initAnimations();
  loadFeaturedBooks();
  loadBooksPage();
  loadBookDetail();

  // Logout listeners
  document.querySelectorAll('[data-action="logout"]').forEach(el => {
    el.addEventListener('click', logout);
  });
});
