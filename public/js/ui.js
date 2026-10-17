import { html, setHTML, esc } from './utils.js';
import { icon } from './icons.js';

// ---------------------------------------------------------------------
// data-action əsaslı hadisə idarəsi (inline onclick yoxdur → CSP təhlükəsizdir)
// ---------------------------------------------------------------------
const actions = {};

export function registerActions(map) {
  Object.assign(actions, map);
}

export function initActionDispatcher() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
}

const forms = {};

export function registerForms(map) {
  Object.assign(forms, map);
}

export function initFormDispatcher() {
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fn = forms[form.dataset.form];
    if (fn) fn(form, e);
  });
}

// ---------------------------------------------------------------------
// Bildirişlər (alert əvəzinə)
// ---------------------------------------------------------------------
export function toast(message, type = 'info') {
  const root = document.getElementById('toasts');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  root.appendChild(el);
  const ttl = type === 'error' ? 5200 : 3200;
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  }, ttl);
  while (root.children.length > 3) root.firstChild.remove();
}

// ---------------------------------------------------------------------
// Modal pəncərə
// ---------------------------------------------------------------------
let lastFocus = null;
let closeCallback = null;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal(content, { label = 'Dialoq', onClose = null, wide = false } = {}) {
  closeModal(true);
  lastFocus = document.activeElement;
  closeCallback = onClose;
  const root = document.getElementById('modalRoot');
  setHTML(root, html`
    <div class="backdrop" data-action="backdrop">
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${label}" tabindex="-1">
        ${content}
      </div>
    </div>`);
  document.body.classList.add('modal-open');
  const modal = root.querySelector('.modal');
  const first = modal.querySelector('[data-autofocus]') || modal.querySelector(FOCUSABLE);
  (first || modal).focus({ preventScroll: true });
  return modal;
}

export function closeModal(silent = false) {
  const root = document.getElementById('modalRoot');
  if (!root || !root.firstElementChild) return;
  root.innerHTML = '';
  document.body.classList.remove('modal-open');
  const cb = closeCallback;
  closeCallback = null;
  if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) {
    lastFocus.focus({ preventScroll: true });
  }
  lastFocus = null;
  if (!silent && cb) cb();
}

export const isModalOpen = () => Boolean(document.getElementById('modalRoot')?.firstElementChild);

export function modalHeader(title, subtitle = '') {
  return html`
    <div class="modal-head">
      <div>
        <h2 class="modal-title">${title}</h2>
        ${subtitle ? html`<p class="modal-sub">${subtitle}</p>` : ''}
      </div>
      <button class="btn-icon" type="button" data-action="close-modal" aria-label="Bağla">${icon('x')}</button>
    </div>`;
}

registerActions({
  'close-modal': () => closeModal(),
  backdrop: (el, e) => { if (e.target === el) closeModal(); },
});

document.addEventListener('keydown', (e) => {
  if (!isModalOpen()) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeModal();
    return;
  }
  if (e.key === 'Tab') {
    const modal = document.querySelector('#modalRoot .modal');
    const nodes = [...modal.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// ---------------------------------------------------------------------
// Təsdiq pəncərəsi (confirm əvəzinə)
// ---------------------------------------------------------------------
export function confirmDialog({ title, text, confirmLabel = 'Təsdiq et', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    openModal(html`
      ${modalHeader(title)}
      <p class="modal-text">${text}</p>
      <div class="modal-actions">
        <button class="btn" type="button" data-action="confirm-no">Ləğv et</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-action="confirm-yes" data-autofocus>${confirmLabel}</button>
      </div>`, { label: title, onClose: () => done(false) });

    registerActions({
      'confirm-yes': () => { done(true); closeModal(true); },
      'confirm-no': () => { done(false); closeModal(true); },
    });
  });
}

// ---------------------------------------------------------------------
// Kiçik köməkçilər
// ---------------------------------------------------------------------
export function setLoading(btn, loading, label) {
  if (!btn) return;
  if (loading) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${esc(label || 'Gözləyin…')}</span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

export function emptyState({ title, text = '', action = null }) {
  return html`
    <div class="empty">
      <p class="empty-title">${title}</p>
      ${text ? html`<p class="empty-text">${text}</p>` : ''}
      ${action ? html`<a class="btn btn-primary" href="${action.href}">${action.label}</a>` : ''}
    </div>`;
}
