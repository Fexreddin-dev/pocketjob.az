import { CONFIG } from './config.js';
import { html, setHTML } from './utils.js';
import { icon } from './icons.js';
import * as api from './api.js';
import {
  initActionDispatcher, initFormDispatcher, registerActions, toast, closeModal, isModalOpen,
} from './ui.js';
import { openJobModal, cacheJobs } from './jobs-ui.js';
import { initBoard, loadBoard } from './views/board.js';
import { initCreate, renderCreate } from './views/create.js';
import { initMine, loadMine } from './views/mine.js';
import {
  initInbox, showInbox, startMessaging, stopMessaging, refreshUnread,
} from './views/inbox.js';
import { initAccount, openAccountModal } from './account.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { board: 'viewBoard', new: 'viewNew', mine: 'viewMine', inbox: 'viewInbox' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let boardLoaded = false;
let currentView = null;
let lastUid = null;

// ---------------------------------------------------------------------
// Mövzu (açıq / tünd)
// ---------------------------------------------------------------------
function currentTheme() {
  return document.documentElement.dataset.theme
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  if (persist) {
    try { localStorage.setItem('pj-theme', theme); } catch { /* ignore */ }
  }
  document.querySelectorAll('[data-theme-icon]').forEach((el) => {
    setHTML(el, icon(theme === 'dark' ? 'sun' : 'moon'));
  });
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#08111D' : '#F1F5F9');
}

// ---------------------------------------------------------------------
// Marşrut
// ---------------------------------------------------------------------
function parseRoute() {
  const m = (location.hash || '').match(/^#\/(new|mine|inbox)(?:\/([0-9a-f-]{36}))?$/i);
  if (!m) return { name: 'board', id: null };
  return { name: m[1].toLowerCase(), id: m[2] || null };
}

async function route() {
  const r = parseRoute();
  const changed = r.name !== currentView;
  currentView = r.name;

  if (isModalOpen()) closeModal(true);

  Object.entries(VIEWS).forEach(([key, id]) => { $(id).hidden = key !== r.name; });
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === r.name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (changed) window.scrollTo(0, 0);

  if (r.name === 'board' && !boardLoaded) {
    boardLoaded = true;
    await loadBoard();
  } else if (r.name === 'new') {
    if (!$('viewNew').firstElementChild) renderCreate();
  } else if (r.name === 'mine') {
    await loadMine();
  } else if (r.name === 'inbox') {
    await showInbox(r.id);
  }
}

// ---------------------------------------------------------------------
// Giriş vəziyyəti dəyişəndə
// ---------------------------------------------------------------------
function onAuthChange(event, session) {
  const uid = session?.user?.id ?? null;
  if (uid) startMessaging();
  else stopMessaging();

  if (event === 'USER_UPDATED') toast('E-poçt təsdiqləndi. Hesabınız qorunur.', 'success');
  if (event === 'SIGNED_IN' && uid && uid !== lastUid && lastUid !== null) {
    toast('Hesaba daxil oldunuz', 'success');
  }
  if (uid !== lastUid) {
    lastUid = uid;
    if (currentView === 'mine' || currentView === 'inbox') route();
    else refreshUnread();
  }
}

// ---------------------------------------------------------------------
// Qurulmamış layihə üçün bildiriş
// ---------------------------------------------------------------------
function showSetupNotice() {
  setHTML($('main'), html`
    <div class="wrap wrap-narrow">
      <div class="panel setup">
        <h1 class="page-title">Quraşdırma tamamlanmayıb</h1>
        <p class="page-lead"><code>public/js/config.js</code> faylına Supabase ünvanını və ictimai açarı yazın. Ətraflı addımlar README.md faylındadır.</p>
      </div>
    </div>`);
  $('tabbar').hidden = true;
}

// ---------------------------------------------------------------------
// Başlanğıc
// ---------------------------------------------------------------------
async function openDeepLink() {
  const id = new URL(location.href).searchParams.get('job');
  if (!id || !UUID_RE.test(id)) return;
  try {
    const job = await api.fetchJob(id);
    if (job) {
      cacheJobs([job]);
      openJobModal(job);
    } else {
      toast('Elan tapılmadı və ya müddəti bitib.');
    }
  } catch (err) {
    console.warn(err);
  }
}

function initChrome() {
  applyTheme(currentTheme());

  document.querySelectorAll('[data-telegram]').forEach((a) => { a.href = CONFIG.TELEGRAM_CHANNEL_URL; });
  if (CONFIG.CONTACT_EMAIL) {
    const el = $('footContact');
    el.href = `mailto:${CONFIG.CONTACT_EMAIL}`;
    el.textContent = CONFIG.CONTACT_EMAIL;
    el.hidden = false;
  }
  $('year').textContent = String(new Date().getFullYear());

  registerActions({
    'toggle-theme': () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true),
    'open-account': () => openAccountModal(),
  });

  const bar = $('offlineBar');
  const sync = () => { bar.hidden = navigator.onLine; };
  window.addEventListener('online', () => { sync(); toast('Bağlantı bərpa olundu', 'success'); });
  window.addEventListener('offline', sync);
  sync();
}

async function init() {
  initActionDispatcher();
  initFormDispatcher();
  initChrome();

  if (!api.isConfigured()) {
    showSetupNotice();
    return;
  }

  initBoard();
  initCreate();
  initMine();
  initInbox();
  initAccount();

  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', () => { if (isModalOpen()) closeModal(true); });

  await api.initAuth(onAuthChange);
  lastUid = api.userId();
  if (lastUid) startMessaging();

  await route();
  openDeepLink();
}

init().catch((err) => {
  console.error(err);
  toast('Səhifə yüklənərkən xəta baş verdi. Yeniləyin.', 'error');
});
