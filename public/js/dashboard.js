/* ============================================
   DASHBOARD.JS
   ============================================ */

const token = localStorage.getItem('mk_token');
const user = (() => { try { return JSON.parse(localStorage.getItem('mk_user')); } catch { return null; } })();

if (!token) window.location.href = '/login?redirect=/dashboard';

function showToast(msg, type = 'info') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-body"><div class="toast-title">${type === 'success' ? 'Success' : 'Notice'}</div><div class="toast-msg">${msg}</div></div><span class="toast-close">×</span>`;
  t.querySelector('.toast-close').onclick = () => t.remove();
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

async function apiFetch(url) {
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return; }
  return res.json();
}

function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) html += `<span class="star ${i <= Math.round(rating) ? 'filled' : ''}">★</span>`;
  return html;
}

/* ---- User Profile ---- */
function loadUserProfile() {
  if (!user) return;
  const nameEl = document.getElementById('user-name');
  const emailEl = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  const welcomeEl = document.getElementById('welcome-name');

  if (nameEl) nameEl.textContent = user.name;
  if (emailEl) emailEl.textContent = user.email;
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
  if (welcomeEl) welcomeEl.textContent = user.name.split(' ')[0];
}

/* ---- Library ---- */
async function loadLibrary() {
  const container = document.getElementById('library-grid');
  const emptyEl = document.getElementById('library-empty');
  const countEl = document.getElementById('books-count');
  if (!container) return;

  try {
    const data = await apiFetch('/api/orders/my-library');
    if (!data) return;
    const books = data.books || [];

    if (countEl) countEl.textContent = books.length;

    if (!books.length) {
      container.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    container.style.display = '';

    container.innerHTML = books.map(book => {
      const progress = book.total_pages > 0 ? Math.round((book.current_page / book.total_pages) * 100) : 0;
      const readPage = book.current_page || 1;
      const readLabel = book.current_page > 1 ? 'Continue Reading' : 'Start Reading';
      return `
        <div class="library-book-card">
          <div class="library-book-cover">
            <img src="${book.cover_image || '/images/placeholder.svg'}" alt="${book.title}" onerror="this.src='/images/placeholder.svg'">
          </div>
          <div class="library-book-body">
            <div class="library-book-title">${book.title}</div>
            ${book.total_pages > 0 ? `<div class="reading-progress"><div class="reading-progress-fill" style="width:${progress}%"></div></div><div class="reading-progress-text">${progress}% complete</div>` : ''}
            <a href="/reader?book=${book.id}&page=${readPage}" class="btn btn-primary btn-sm btn-full">${readLabel}</a>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    if (container) container.innerHTML = '<p class="text-muted" style="font-size:0.9rem">Could not load library.</p>';
  }
}

/* ---- Orders ---- */
async function loadOrders() {
  const container = document.getElementById('orders-list');
  if (!container) return;

  try {
    const data = await apiFetch('/api/orders/my-orders');
    if (!data) return;
    const orders = data.orders || [];

    if (!orders.length) {
      container.innerHTML = '<p style="font-size:0.88rem;color:#888">No orders yet.</p>';
      return;
    }

    container.innerHTML = orders.map(o => `
      <div class="order-item" style="display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid #f0f0f0">
        <img src="${o.cover_image || '/images/placeholder.svg'}" alt="" style="width:40px;height:60px;object-fit:cover;border-radius:4px;background:#f0f0f0" onerror="this.src='/images/placeholder.svg'">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.title}</div>
          <div style="font-size:0.78rem;color:#888;margin-top:2px">${new Date(o.created_at).toLocaleDateString('en-IN')}</div>
        </div>
        <span class="badge badge-${o.payment_status}">${o.payment_status}</span>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p style="font-size:0.88rem;color:#888">Could not load orders.</p>';
  }
}

/* ---- Logout ---- */
document.querySelectorAll('[data-action="logout"]').forEach(el => {
  el.addEventListener('click', () => {
    localStorage.removeItem('mk_token');
    localStorage.removeItem('mk_user');
    window.location.href = '/';
  });
});

/* ---- Nav ---- */
function updateNav() {
  const avatarEl = document.querySelector('.nav-avatar');
  const navUserName = document.querySelector('.nav-user-name');
  if (user) {
    if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
    if (navUserName) navUserName.textContent = user.name;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadUserProfile();
  loadLibrary();
  loadOrders();
  updateNav();

  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 20));
  }
  const avatar = document.querySelector('.nav-avatar');
  const dropdown = document.querySelector('.nav-dropdown');
  if (avatar && dropdown) {
    avatar.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('open'); });
    document.addEventListener('click', () => dropdown.classList.remove('open'));
  }
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');
  if (hamburger && mobileNav) hamburger.addEventListener('click', () => mobileNav.classList.toggle('open'));
});
