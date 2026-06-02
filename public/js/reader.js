/* ============================================
   READER.JS — PDF Reader using PDF.js
   ============================================ */

const pdfjsLib = window['pdfjs-dist/build/pdf'];
if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const token = localStorage.getItem('mk_token');
const params = new URLSearchParams(window.location.search);
const bookId = params.get('book');
const startPage = parseInt(params.get('page')) || 0;

if (!token) { window.location.href = '/login?redirect=' + encodeURIComponent(window.location.href); }
if (!bookId) { window.location.href = '/library'; }

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let zoomLevel = 1.0;
let isRendering = false;
let renderQueue = null;
let darkMode = localStorage.getItem('mk_reader_dark') === 'true';

const canvas = document.getElementById('pdf-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const loadingEl = document.getElementById('reader-loading');
const errorEl = document.getElementById('reader-error');
const mainEl = document.querySelector('.reader-main');

// Controls
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInput = document.getElementById('page-input');
const totalPagesEl = document.getElementById('total-pages');
const zoomDisplay = document.getElementById('zoom-display');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomFitBtn = document.getElementById('zoom-fit');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const darkModeBtn = document.getElementById('dark-mode-btn');
const bookmarkBtn = document.getElementById('bookmark-toggle');
const bookmarkPanel = document.getElementById('bookmark-panel');
const bookmarkList = document.getElementById('bookmark-list');
const addBookmarkBtn = document.getElementById('add-bookmark-btn');
const progressBar = document.getElementById('progress-bar');
const bookTitleEl = document.getElementById('book-title-display');

/* ---- Apply Dark Mode ---- */
function applyDarkMode() {
  document.body.classList.toggle('dark-mode', darkMode);
  if (darkModeBtn) darkModeBtn.classList.toggle('active', darkMode);
  localStorage.setItem('mk_reader_dark', darkMode);
}
applyDarkMode();

/* ---- Load PDF ---- */
async function loadPDF() {
  if (!pdfjsLib) { showError('PDF.js failed to load. Please refresh.'); return; }
  showLoading(true);
  try {
    const url = `/api/books/${bookId}/pdf`;
    const loadingTask = pdfjsLib.getDocument({ url, httpHeaders: { 'Authorization': `Bearer ${token}` } });
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    if (totalPagesEl) totalPagesEl.textContent = totalPages;

    // Determine start page
    let savedPage = startPage;
    if (!savedPage) {
      const progressRes = await fetch(`/api/books/${bookId}/progress`, { headers: { 'Authorization': `Bearer ${token}` } });
      const progressData = await progressRes.json();
      savedPage = progressData.progress ? progressData.progress.current_page : 1;
    }
    currentPage = Math.max(1, Math.min(savedPage, totalPages));

    // Get book title
    try {
      const bookRes = await fetch(`/api/books/${bookId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const bookData = await bookRes.json();
      if (bookTitleEl && bookData.book) bookTitleEl.textContent = bookData.book.title;
    } catch {}

    showLoading(false);
    await renderPage(currentPage);
    loadBookmarks();
    updateProgressBar();
  } catch (err) {
    showLoading(false);
    if (err.message && err.message.includes('403')) {
      showError('Access denied. Please purchase this book to read it.', true);
    } else {
      showError('Could not load this book. Please try again.');
    }
  }
}

/* ---- Render Page ---- */
async function renderPage(num) {
  if (!pdfDoc || isRendering) { renderQueue = num; return; }
  isRendering = true;

  try {
    const page = await pdfDoc.getPage(num);
    const container = mainEl || document.body;
    const availWidth = Math.min(container.clientWidth - 32, 900);

    const viewport = page.getViewport({ scale: 1 });
    const autoScale = availWidth / viewport.width;
    const scale = autoScale * zoomLevel;
    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    currentPage = num;
    if (pageInput) pageInput.value = currentPage;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    updateProgressBar();
    saveProgress();
  } finally {
    isRendering = false;
    if (renderQueue && renderQueue !== currentPage) {
      const next = renderQueue;
      renderQueue = null;
      renderPage(next);
    }
  }
}

/* ---- Navigation ---- */
function goToPage(num) {
  num = Math.max(1, Math.min(num, totalPages));
  renderPage(num);
}

if (prevBtn) prevBtn.addEventListener('click', () => goToPage(currentPage - 1));
if (nextBtn) nextBtn.addEventListener('click', () => goToPage(currentPage + 1));

if (pageInput) {
  pageInput.addEventListener('change', () => {
    const num = parseInt(pageInput.value);
    if (!isNaN(num)) goToPage(num);
  });
  pageInput.addEventListener('keydown', e => { if (e.key === 'Enter') pageInput.blur(); });
}

/* ---- Zoom ---- */
function setZoom(level) {
  zoomLevel = Math.max(0.5, Math.min(3.0, level));
  if (zoomDisplay) zoomDisplay.textContent = Math.round(zoomLevel * 100) + '%';
  renderPage(currentPage);
}

if (zoomInBtn) zoomInBtn.addEventListener('click', () => setZoom(zoomLevel + 0.2));
if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setZoom(zoomLevel - 0.2));
if (zoomFitBtn) zoomFitBtn.addEventListener('click', () => setZoom(1.0));

/* ---- Keyboard Shortcuts ---- */
document.addEventListener('keydown', e => {
  if (document.activeElement === pageInput) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goToPage(currentPage + 1);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goToPage(currentPage - 1);
  if (e.key === '+' || e.key === '=') setZoom(zoomLevel + 0.2);
  if (e.key === '-') setZoom(zoomLevel - 0.2);
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (e.key === 'b' || e.key === 'B') toggleBookmarkPanel();
  if (e.key === 'd' || e.key === 'D') { darkMode = !darkMode; applyDarkMode(); }
});

/* ---- Fullscreen ---- */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    if (fullscreenBtn) fullscreenBtn.classList.add('active');
  } else {
    document.exitFullscreen().catch(() => {});
    if (fullscreenBtn) fullscreenBtn.classList.remove('active');
  }
}
if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

/* ---- Dark Mode ---- */
if (darkModeBtn) darkModeBtn.addEventListener('click', () => { darkMode = !darkMode; applyDarkMode(); });

/* ---- Touch Swipe ---- */
let touchStartX = 0;
document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; });
document.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].screenX - touchStartX;
  if (Math.abs(dx) > 60) {
    if (dx < 0) goToPage(currentPage + 1);
    else goToPage(currentPage - 1);
  }
});

/* ---- Context Menu Prevention ---- */
document.addEventListener('contextmenu', e => e.preventDefault());

/* ---- Progress Bar ---- */
function updateProgressBar() {
  if (progressBar && totalPages > 0) {
    progressBar.style.width = ((currentPage / totalPages) * 100) + '%';
  }
}

/* ---- Save Progress ---- */
let saveTimeout;
function saveProgress() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await fetch(`/api/books/${bookId}/progress`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_page: currentPage, total_pages: totalPages })
      });
    } catch {}
  }, 1000);
}

/* ---- Bookmarks ---- */
function toggleBookmarkPanel() {
  if (bookmarkPanel) bookmarkPanel.classList.toggle('open');
  if (bookmarkBtn) bookmarkBtn.classList.toggle('active', bookmarkPanel && bookmarkPanel.classList.contains('open'));
}
if (bookmarkBtn) bookmarkBtn.addEventListener('click', toggleBookmarkPanel);
document.getElementById('close-bookmark-panel') && document.getElementById('close-bookmark-panel').addEventListener('click', toggleBookmarkPanel);

async function loadBookmarks() {
  if (!bookmarkList) return;
  try {
    const res = await fetch(`/api/books/${bookId}/bookmarks`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    renderBookmarks(data.bookmarks || []);
  } catch {}
}

function renderBookmarks(bookmarks) {
  if (!bookmarkList) return;
  if (!bookmarks.length) {
    bookmarkList.innerHTML = '<p class="bookmark-empty">No bookmarks yet.</p>';
    return;
  }
  bookmarkList.innerHTML = bookmarks.map(b => `
    <div class="bookmark-item" data-page="${b.page_number}">
      <div class="bookmark-item-left">
        <div class="bookmark-page">Page ${b.page_number}</div>
        <div class="bookmark-note">${b.note || 'Bookmarked'}</div>
      </div>
      <button class="bookmark-del" data-id="${b.id}" title="Remove">✕</button>
    </div>
  `).join('');

  bookmarkList.querySelectorAll('.bookmark-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('bookmark-del')) return;
      goToPage(parseInt(item.dataset.page));
      toggleBookmarkPanel();
    });
  });
  bookmarkList.querySelectorAll('.bookmark-del').forEach(btn => {
    btn.addEventListener('click', () => deleteBookmark(btn.dataset.id));
  });
}

if (addBookmarkBtn) {
  addBookmarkBtn.addEventListener('click', async () => {
    try {
      await fetch(`/api/books/${bookId}/bookmarks`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_number: currentPage, note: `Page ${currentPage}` })
      });
      loadBookmarks();
    } catch {}
  });
}

async function deleteBookmark(id) {
  try {
    await fetch(`/api/books/${bookId}/bookmarks/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadBookmarks();
  } catch {}
}

/* ---- Loading / Error States ---- */
function showLoading(show) {
  if (loadingEl) loadingEl.style.display = show ? 'flex' : 'none';
  if (canvas) canvas.style.display = show ? 'none' : 'block';
}
function showError(msg, withBtn = false) {
  if (errorEl) {
    errorEl.style.display = 'flex';
    errorEl.innerHTML = `
      <h3>Could not load book</h3>
      <p>${msg}</p>
      ${withBtn ? '<a href="/library" class="btn btn-primary" style="margin-top:16px">Go to Library</a>' : ''}
    `;
  }
  if (loadingEl) loadingEl.style.display = 'none';
}

/* ---- Window resize ---- */
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => { if (pdfDoc) renderPage(currentPage); }, 300);
});

/* ---- Init ---- */
loadPDF();
