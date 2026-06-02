/* ============================================
   AUTH.JS — Login, Signup, Forgot Password
   ============================================ */

function getToken() { return localStorage.getItem('mk_token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('mk_user')); } catch { return null; } }
function setAuth(token, user) {
  localStorage.setItem('mk_token', token);
  localStorage.setItem('mk_user', JSON.stringify(user));
}

function showError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}
function clearErrors() {
  document.querySelectorAll('.form-error').forEach(e => { e.textContent = ''; e.classList.remove('show'); });
  document.querySelectorAll('.form-control').forEach(e => e.classList.remove('error'));
}
function showFieldError(inputId, errorId, msg) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) input.classList.add('error');
  if (error) { error.textContent = msg; error.classList.add('show'); }
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) { container = document.createElement('div'); container.className = 'toast-container'; document.body.appendChild(container); }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-body"><div class="toast-title">${type === 'success' ? 'Success' : 'Error'}</div><div class="toast-msg">${message}</div></div><span class="toast-close">×</span>`;
  toast.querySelector('.toast-close').onclick = () => toast.remove();
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner spinner-sm"></span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.textContent;
    btn.disabled = false;
  }
}

/* ---- Signup ---- */
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  // Redirect if already logged in
  if (getToken()) window.location.href = '/dashboard';

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const instagram = document.getElementById('instagram') ? document.getElementById('instagram').value.trim() : '';

    let valid = true;
    if (!name) { showFieldError('name', 'name-error', 'Full name is required'); valid = false; }
    if (!email || !email.includes('@')) { showFieldError('email', 'email-error', 'Valid email is required'); valid = false; }
    if (!password || password.length < 6) { showFieldError('password', 'password-error', 'Password must be at least 6 characters'); valid = false; }
    if (password !== confirmPassword) { showFieldError('confirm-password', 'confirm-error', 'Passwords do not match'); valid = false; }
    if (!valid) return;

    const btn = signupForm.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, instagram })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuth(data.token, data.user);
      showToast('Account created! Redirecting...', 'success');
      setTimeout(() => window.location.href = '/dashboard', 1200);
    } catch (err) {
      showToast(err.message || 'Signup failed', 'error');
      setLoading(btn, false);
    }
  });
}

/* ---- Login ---- */
const loginForm = document.getElementById('login-form');
if (loginForm) {
  if (getToken()) {
    const user = getUser();
    window.location.href = user && user.is_admin ? '/admin' : '/dashboard';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email) { showFieldError('email', 'email-error', 'Email is required'); return; }
    if (!password) { showFieldError('password', 'password-error', 'Password is required'); return; }

    const btn = loginForm.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuth(data.token, data.user);
      showToast('Welcome back!', 'success');
      const redirect = new URLSearchParams(window.location.search).get('redirect') || (data.user.is_admin ? '/admin' : '/dashboard');
      setTimeout(() => window.location.href = redirect, 1000);
    } catch (err) {
      showToast(err.message || 'Login failed', 'error');
      setLoading(btn, false);
    }
  });
}

/* ---- Forgot Password ---- */
const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) { showFieldError('email', 'email-error', 'Email is required'); return; }

    const btn = forgotForm.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      document.getElementById('forgot-form').style.display = 'none';
      document.getElementById('forgot-success').style.display = 'block';
    } catch {
      setLoading(btn, false);
      showToast('Something went wrong. Please try again.', 'error');
    }
  });
}
