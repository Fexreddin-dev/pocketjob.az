import { CONFIG } from '../config.js';
import { CATEGORIES, CITIES } from '../constants.js';
import { html, setHTML, debounce } from '../utils.js';
import { fetchJobs, subscribeJobs, removeChannel, friendlyError, userId } from '../api.js';
import { jobCard, skeletonCards, cacheJobs } from '../jobs-ui.js';
import { registerActions, toast, emptyState } from '../ui.js';

const state = {
  q: '',
  category: '',
  city: '',
  jobs: [],
  total: 0,
  loading: false,
  pending: 0,
  channel: null,
  requestId: 0,
  totalActive: null,
};

const $ = (id) => document.getElementById(id);

function renderChips() {
  const all = [{ id: '', short: 'Hamısı' }, ...CATEGORIES];
  setHTML($('chips'), html`${all.map((c) => html`
    <button class="chip" type="button" data-action="set-category" data-id="${c.id}" aria-pressed="${state.category === c.id}">${c.short}</button>`)}`);
}

function renderLive() {
  const el = $('liveText');
  if (state.totalActive == null) return;
  const n = state.totalActive;
  el.textContent = n === 0 ? 'Hələ aktiv elan yoxdur' : `Hazırda ${n} aktiv elan`;
}

function renderBanner() {
  const el = $('newBanner');
  if (state.pending > 0) {
    setHTML(el, html`<button class="banner-btn" type="button" data-action="show-new">${state.pending} yeni elan var. Göstər</button>`);
    el.hidden = false;
  } else {
    el.hidden = true;
    el.innerHTML = '';
  }
}

function renderGrid() {
  const grid = $('jobsGrid');
  if (state.loading && state.jobs.length === 0) {
    setHTML(grid, skeletonCards(6));
  } else if (state.jobs.length === 0) {
    const filtered = state.q || state.category || state.city;
    setHTML(grid, html`<div class="grid-full">${emptyState(filtered
      ? { title: 'Uyğun elan tapılmadı', text: 'Axtarışı dəyişin və ya filtrləri təmizləyin.' }
      : { title: 'Hələ aktiv elan yoxdur', text: 'İlk elanı siz paylaşın. Bu, bir cümlə yazmaq qədər asandır.', action: { href: '#/new', label: 'Elan yarat' } })}
    </div>`);
    if (filtered) {
      grid.querySelector('.empty')?.insertAdjacentHTML(
        'beforeend',
        '<button class="btn" type="button" data-action="clear-filters">Filtrləri təmizlə</button>',
      );
    }
  } else {
    setHTML(grid, html`${state.jobs.map((j) => jobCard(j))}`);
  }
  $('loadMore').hidden = state.jobs.length >= state.total || state.loading;
}

export async function loadBoard({ append = false } = {}) {
  const myRequest = ++state.requestId;
  state.loading = true;
  if (!append) {
    state.jobs = [];
    state.pending = 0;
    renderBanner();
  }
  renderGrid();

  try {
    const from = append ? state.jobs.length : 0;
    const { jobs, count } = await fetchJobs({
      q: state.q,
      category: state.category,
      city: state.city,
      from,
      to: from + CONFIG.PAGE_SIZE - 1,
    });
    if (myRequest !== state.requestId) return;
    cacheJobs(jobs);
    state.jobs = append ? [...state.jobs, ...jobs] : jobs;
    state.total = count;
    if (!state.q && !state.category && !state.city) {
      state.totalActive = count;
      renderLive();
    }
  } catch (err) {
    if (myRequest !== state.requestId) return;
    console.error(err);
    toast(friendlyError(err), 'error');
    state.total = state.jobs.length;
  } finally {
    if (myRequest === state.requestId) {
      state.loading = false;
      renderGrid();
    }
  }
}

function onRealtime(payload) {
  const { eventType, new: row, old } = payload;
  if (eventType === 'INSERT') {
    if (row.status === 'active' && row.owner_id !== userId()) {
      state.pending += 1;
      if (state.totalActive != null) {
        state.totalActive += 1;
        renderLive();
      }
      renderBanner();
    }
    return;
  }
  if (eventType === 'DELETE') {
    const before = state.jobs.length;
    state.jobs = state.jobs.filter((j) => j.id !== old.id);
    if (state.jobs.length !== before) {
      state.total = Math.max(0, state.total - 1);
      renderGrid();
    }
    return;
  }
  if (eventType === 'UPDATE') {
    const idx = state.jobs.findIndex((j) => j.id === row.id);
    if (idx === -1) return;
    if (row.status !== 'active') {
      state.jobs.splice(idx, 1);
      state.total = Math.max(0, state.total - 1);
    } else {
      state.jobs[idx] = row;
      cacheJobs([row]);
    }
    renderGrid();
  }
}

export function initBoard() {
  setHTML($('citySelect'), html`
    <option value="">Bütün şəhərlər</option>
    ${CITIES.map((c) => html`<option value="${c}">${c}</option>`)}`);
  renderChips();

  const onSearch = debounce(() => {
    state.q = $('searchInput').value.trim();
    loadBoard();
  }, 300);
  $('searchInput').addEventListener('input', onSearch);
  $('citySelect').addEventListener('change', () => {
    state.city = $('citySelect').value;
    loadBoard();
  });

  registerActions({
    'set-category': (el) => {
      state.category = el.dataset.id;
      renderChips();
      loadBoard();
    },
    'clear-filters': () => {
      state.q = '';
      state.category = '';
      state.city = '';
      $('searchInput').value = '';
      $('citySelect').value = '';
      renderChips();
      loadBoard();
    },
    'load-more': () => loadBoard({ append: true }),
    'show-new': () => {
      state.pending = 0;
      renderBanner();
      loadBoard();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
  });

  state.channel = subscribeJobs(onRealtime);
}

export function stopBoard() {
  removeChannel(state.channel);
  state.channel = null;
}

export const boardState = state;
