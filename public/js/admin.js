/* ============================================
   ADMIN.JS
   ============================================ */

const token = localStorage.getItem('mk_token');
const user = (() => { try { return JSON.parse(localStorage.getItem('mk_user')); } catch { return null; } })();

if (!token || !user || !user.is_admin) {
  window.location.href = '/login?redirect=/admin';
}

function showToast(msg, type = 'info') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-body"><div class="toast-title">${type === 'success' ? '✓' : '✕'}</div><div class="toast-msg">${msg}</div></div>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatDate(str) {
  return str ? new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function badgeHtml(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

/* ---- Mobile Sidebar Toggle ---- */
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.querySelector('.admin-sidebar');
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
  document.addEventListener('click', (e) => {
    if (sidebar && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
      sidebar.classList.remove('mobile-open');
    }
  });
}

/* ---- Logout ---- */
document.querySelectorAll('[data-action="logout"]').forEach(el => {
  el.addEventListener('click', () => { localStorage.removeItem('mk_token'); localStorage.removeItem('mk_user'); window.location.href = '/login'; });
});

/* ---- DASHBOARD STATS ---- */
async function loadStats() {
  const els = { users: 'stat-users', books: 'stat-books', orders: 'stat-orders', pending: 'stat-pending' };
  try {
    const data = await apiFetch('/api/admin/stats');
    if (document.getElementById(els.users)) document.getElementById(els.users).textContent = data.totalUsers;
    if (document.getElementById(els.books)) document.getElementById(els.books).textContent = data.totalBooks;
    if (document.getElementById(els.orders)) document.getElementById(els.orders).textContent = data.totalOrders;
    if (document.getElementById(els.pending)) document.getElementById(els.pending).textContent = data.pendingOrders;
  } catch {}
}

/* ---- ORDERS ---- */
async function loadOrders(status = 'all') {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#888">Loading...</td></tr>';
  try {
    const data = await apiFetch(`/api/admin/orders?status=${status}`);
    if (!data.orders.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#888">No orders found.</td></tr>';
      return;
    }
    tbody.innerHTML = data.orders.map(o => `
      <tr>
        <td><span style="font-family:monospace;font-size:0.78rem">#${o.id}</span></td>
        <td>
          <div style="font-weight:500">${o.user_name}</div>
          <div class="cell-muted">${o.user_email}</div>
          ${o.user_instagram ? `<div class="cell-muted">@${o.user_instagram}</div>` : ''}
        </td>
        <td>${o.book_title}</td>
        <td style="font-weight:600">₹${o.book_price}</td>
        <td>${formatDate(o.created_at)}</td>
        <td>${badgeHtml(o.payment_status)}</td>
        <td>
          ${o.payment_screenshot
            ? `<button class="act-btn act-btn-view" onclick="viewScreenshot('${o.payment_screenshot}')">View</button>`
            : '<span style="color:#bbb;font-size:0.78rem">None</span>'}
        </td>
        <td>
          <div class="action-btns">
            ${o.payment_status !== 'approved' ? `<button class="act-btn act-btn-approve" onclick="approveOrder(${o.id}, this)">Approve</button>` : ''}
            ${o.payment_status !== 'rejected' ? `<button class="act-btn act-btn-reject" onclick="rejectOrder(${o.id}, this)">Reject</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#c62828">${err.message}</td></tr>`;
  }
}

async function approveOrder(id, btn) {
  btn.disabled = true; btn.textContent = '...';
  try {
    await apiFetch(`/api/admin/orders/${id}/approve`, { method: 'PATCH' });
    showToast('Order approved. Access granted.', 'success');
    const status = document.getElementById('status-filter') ? document.getElementById('status-filter').value : 'all';
    loadOrders(status);
  } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Approve'; }
}

async function rejectOrder(id, btn) {
  btn.disabled = true; btn.textContent = '...';
  try {
    await apiFetch(`/api/admin/orders/${id}/reject`, { method: 'PATCH' });
    showToast('Order rejected.', 'success');
    const status = document.getElementById('status-filter') ? document.getElementById('status-filter').value : 'all';
    loadOrders(status);
  } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.textContent = 'Reject'; }
}

function viewScreenshot(filename) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="max-width:600px;text-align:center">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      <h3 class="modal-title" style="margin-bottom:16px">Payment Screenshot</h3>
      <div class="screenshot-preview">
        <img src="/uploads/screenshots/${filename}" alt="Payment Screenshot" onerror="this.alt='Image not found'">
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* ---- BOOKS ---- */
async function loadBooks() {
  const tbody = document.getElementById('books-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#888">Loading...</td></tr>';
  try {
    const data = await apiFetch('/api/admin/books');
    if (!data.books.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:#888">No books yet.</td></tr>'; return; }
    tbody.innerHTML = data.books.map(b => `
      <tr>
        <td>
          <div class="book-thumb">
            <img src="${b.cover_image || '/images/placeholder.svg'}" alt="" onerror="this.src='/images/placeholder.svg'">
            <span class="book-thumb-title">${b.title}</span>
          </div>
        </td>
        <td>${b.author}</td>
        <td style="font-weight:600">₹${b.price}</td>
        <td>${b.category || '—'}</td>
        <td>${b.pages || '—'}</td>
        <td><span class="badge ${b.pdf_file ? 'badge-approved' : 'badge-pending'}">${b.pdf_file ? 'Uploaded' : 'No PDF'}</span></td>
        <td>
          <div class="action-btns">
            <button class="act-btn act-btn-edit" onclick="openEditBook(${JSON.stringify(b).replace(/"/g, '&quot;')})">Edit</button>
            <button class="act-btn act-btn-delete" onclick="deleteBook(${b.id}, this)">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) { tbody.innerHTML = `<tr><td colspan="7" style="color:#c62828;padding:30px;text-align:center">${err.message}</td></tr>`; }
}

function openAddBook() {
  document.getElementById('book-form-title').textContent = 'Add New Book';
  document.getElementById('book-form').reset();
  document.getElementById('book-id').value = '';
  document.getElementById('book-modal').style.display = 'flex';
}

function openEditBook(book) {
  document.getElementById('book-form-title').textContent = 'Edit Book';
  document.getElementById('book-id').value = book.id;
  document.getElementById('book-title-input').value = book.title;
  document.getElementById('book-author-input').value = book.author;
  document.getElementById('book-price-input').value = book.price;
  document.getElementById('book-desc-input').value = book.description || '';
  document.getElementById('book-pages-input').value = book.pages || '';
  document.getElementById('book-category-input').value = book.category || '';
  document.getElementById('book-active-input').value = book.is_active;
  document.getElementById('book-modal').style.display = 'flex';
}

function closeBookModal() { document.getElementById('book-modal').style.display = 'none'; }

const bookForm = document.getElementById('book-form');
if (bookForm) {
  bookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('book-id').value;
    const formData = new FormData(bookForm);
    const btn = bookForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      if (id) {
        await fetch(`/api/admin/books/${id}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      } else {
        await fetch('/api/admin/books', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      }
      showToast(id ? 'Book updated.' : 'Book added.', 'success');
      closeBookModal();
      loadBooks();
    } catch (err) { showToast(err.message, 'error'); }
    btn.disabled = false; btn.textContent = 'Save Book';
  });
}

async function deleteBook(id, btn) {
  if (!confirm('Deactivate this book?')) return;
  btn.disabled = true;
  try {
    await apiFetch(`/api/admin/books/${id}`, { method: 'DELETE' });
    showToast('Book deactivated.', 'success');
    loadBooks();
  } catch (err) { showToast(err.message, 'error'); btn.disabled = false; }
}

/* ---- USERS ---- */
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">Loading...</td></tr>';
  try {
    const data = await apiFetch('/api/admin/users');
    if (!data.users.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:#888">No users.</td></tr>'; return; }
    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td>
          <div style="font-weight:500">${u.name}</div>
          ${u.is_admin ? '<span class="badge badge-approved" style="font-size:0.65rem">Admin</span>' : ''}
        </td>
        <td>${u.email}</td>
        <td>${u.instagram ? '@' + u.instagram : '—'}</td>
        <td>${formatDate(u.created_at)}</td>
        <td><strong>${u.books_owned}</strong></td>
        <td>
          ${!u.is_admin ? `<button class="act-btn act-btn-edit" onclick="openGrantAccess(${u.id}, '${u.name}')">Grant Access</button>` : '—'}
        </td>
      </tr>
    `).join('');
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" style="color:#c62828;padding:30px;text-align:center">${err.message}</td></tr>`; }
}

async function openGrantAccess(userId, userName) {
  const books = await apiFetch('/api/admin/books');
  const select = document.getElementById('grant-book-select');
  if (!select) return;
  select.innerHTML = books.books.map(b => `<option value="${b.id}">₹${b.price} — ${b.title}</option>`).join('');
  document.getElementById('grant-user-id').value = userId;
  document.getElementById('grant-user-name').textContent = userName;
  document.getElementById('grant-modal').style.display = 'flex';
}

function closeGrantModal() { document.getElementById('grant-modal').style.display = 'none'; }

const grantForm = document.getElementById('grant-form');
if (grantForm) {
  grantForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('grant-user-id').value;
    const bookId = document.getElementById('grant-book-select').value;
    try {
      await apiFetch(`/api/admin/users/${userId}/grant-access/${bookId}`, { method: 'PATCH' });
      showToast('Access granted.', 'success');
      closeGrantModal();
      loadUsers();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

/* ---- Status Filter ---- */
const statusFilter = document.getElementById('status-filter');
if (statusFilter) {
  statusFilter.addEventListener('change', () => loadOrders(statusFilter.value));
}

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  // Update sidebar user info
  if (user) {
    const sidebarName = document.querySelector('.sidebar-user-name');
    const sidebarAvatar = document.querySelector('.sidebar-avatar');
    if (sidebarName) sidebarName.textContent = user.name;
    if (sidebarAvatar) sidebarAvatar.textContent = user.name.charAt(0).toUpperCase();
  }
  loadStats();
  loadOrders();
  loadBooks();
  loadUsers();
});
