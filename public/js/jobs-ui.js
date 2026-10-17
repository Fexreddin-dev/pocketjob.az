import { html, fmtPay, fmtWhen, fmtPhone, timeAgo, isBoosted } from './utils.js';
import { icon } from './icons.js';
import { catLabel, catShort, REPORT_REASONS } from './constants.js';
import {
  userId, ensureSession, getOrCreateConversation, reportJob, friendlyError,
} from './api.js';
import {
  openModal, closeModal, modalHeader, toast, registerActions, registerForms, setLoading,
} from './ui.js';

// ---------------------------------------------------------------------
// Elan keşi (id → elan), kartlardakı düymələr üçün
// ---------------------------------------------------------------------
const cache = new Map();
export const cacheJobs = (list) => list.forEach((j) => cache.set(j.id, j));
export const getCachedJob = (id) => cache.get(id);

// Yalnız Supabase Storage şəkillərini göstəririk
function safeImage(url) {
  return typeof url === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\//i.test(url) ? url : '';
}

function statusLabel(job) {
  if (job.status === 'hidden') return { text: 'Gizlədilib (şikayətlər)', tone: 'danger' };
  if (job.status === 'closed') return { text: 'Bağlanıb', tone: 'muted' };
  if (new Date(job.expires_at) < new Date()) return { text: 'Müddəti bitib', tone: 'muted' };
  return { text: 'Aktivdir', tone: 'ok' };
}

// ---------------------------------------------------------------------
// Elan kartı ("iş qəbzi")
// ---------------------------------------------------------------------
export function jobCard(job, { mode = 'public', preview = false } = {}) {
  const boosted = isBoosted(job);
  const where = job.location ? `${job.city}, ${job.location}` : job.city;
  const soft = job.pay_unit === 'negotiable';
  const img = preview ? job.image_url || '' : safeImage(job.image_url);
  const title = preview
    ? html`<span class="slip-link">${job.title}</span>`
    : html`<button class="slip-link" type="button" data-action="open-job" data-id="${job.id}">${job.title}</button>`;

  let foot;
  if (mode === 'mine') {
    const st = statusLabel(job);
    const live = job.status === 'active' && new Date(job.expires_at) > new Date();
    foot = html`
      <div class="slip-foot slip-foot-mine">
        <span class="status status-${st.tone}">${st.text}</span>
        <div class="slip-actions">
          ${live ? html`<button class="btn btn-sm btn-amber" type="button" data-action="boost" data-id="${job.id}">${icon('bolt', 16)}<span>İrəli çək</span></button>` : ''}
          ${job.status === 'active' ? html`<button class="btn btn-sm" type="button" data-action="close-job" data-id="${job.id}">Bağla</button>` : ''}
          ${job.status === 'closed' && new Date(job.expires_at) > new Date() ? html`<button class="btn btn-sm" type="button" data-action="reopen-job" data-id="${job.id}">Yenidən aç</button>` : ''}
          <button class="btn btn-sm btn-danger-ghost" type="button" data-action="delete-job" data-id="${job.id}" aria-label="Elanı sil">${icon('trash', 16)}</button>
        </div>
      </div>`;
  } else if (preview) {
    foot = html`
      <div class="slip-foot">
        <span class="btn btn-sm btn-primary is-fake">${icon('phone', 16)}<span>Zəng et</span></span>
        <span class="btn btn-sm is-fake">${icon('chat', 16)}<span>Mesaj yaz</span></span>
      </div>`;
  } else {
    foot = html`
      <div class="slip-foot">
        <a class="btn btn-sm btn-primary" href="tel:${job.phone}">${icon('phone', 16)}<span>Zəng et</span></a>
        <button class="btn btn-sm" type="button" data-action="chat" data-id="${job.id}">${icon('chat', 16)}<span>Mesaj yaz</span></button>
        <span class="slip-ago">${timeAgo(job.bumped_at || job.created_at)}</span>
      </div>`;
  }

  return html`
    <article class="slip ${boosted ? 'is-boosted' : ''} ${mode === 'mine' && job.status !== 'active' ? 'is-muted' : ''}">
      ${img ? html`<img class="slip-img" src="${img}" alt="" loading="lazy" decoding="async">` : ''}
      <div class="slip-top">
        <div class="slip-tags">
          <span class="slip-cat">${catShort(job.category)}</span>
          ${boosted ? html`<span class="slip-hot">${icon('bolt', 13)}Təcili</span>` : ''}
        </div>
        <span class="slip-pay ${soft ? 'is-soft' : ''}">${fmtPay(job)}</span>
      </div>
      <h3 class="slip-heading">${title}</h3>
      <ul class="slip-meta">
        <li>${icon('pin', 16)}<span>${where}</span></li>
        <li>${icon('clock', 16)}<span>${fmtWhen(job)}</span></li>
      </ul>
      <div class="stitch" aria-hidden="true"></div>
      ${foot}
    </article>`;
}

export function skeletonCards(n = 6) {
  return html`${Array.from({ length: n }, () => html`
    <div class="slip skeleton" aria-hidden="true">
      <div class="sk sk-line w40"></div>
      <div class="sk sk-line w80 tall"></div>
      <div class="sk sk-line w60"></div>
      <div class="sk sk-line w50"></div>
    </div>`)}`;
}

// ---------------------------------------------------------------------
// Elan detalı (açılan pəncərə)
// ---------------------------------------------------------------------
function dismissJobUrl() {
  const u = new URL(location.href);
  if (u.searchParams.has('job') || history.state?.modal) {
    u.searchParams.delete('job');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
}

export function openJobModal(job) {
  cacheJobs([job]);
  const mine = job.owner_id === userId();
  const img = safeImage(job.image_url);
  const boosted = isBoosted(job);

  const u = new URL(location.href);
  if (u.searchParams.get('job') !== job.id) {
    u.searchParams.set('job', job.id);
    history.pushState({ modal: 'job' }, '', u.pathname + u.search + u.hash);
  }

  openModal(html`
    ${img ? html`<img class="detail-img" src="${img}" alt="${job.title} üçün şəkil" loading="lazy">` : ''}
    <div class="detail">
      <div class="detail-head">
        <div class="slip-tags">
          <span class="slip-cat">${catLabel(job.category)}</span>
          ${boosted ? html`<span class="slip-hot">${icon('bolt', 13)}Təcili</span>` : ''}
        </div>
        <button class="btn-icon" type="button" data-action="close-modal" aria-label="Bağla">${icon('x')}</button>
      </div>
      <h2 class="detail-title">${job.title}</h2>
      <p class="detail-pay">${fmtPay(job)}</p>

      <dl class="detail-list">
        <div><dt>${icon('pin', 18)}<span>Məkan</span></dt><dd>${job.location ? `${job.city}, ${job.location}` : job.city}</dd></div>
        <div><dt>${icon('clock', 18)}<span>Tarix və saat</span></dt><dd>${fmtWhen(job)}</dd></div>
        <div><dt>${icon('phone', 18)}<span>Əlaqə</span></dt><dd><a class="phone-link" href="tel:${job.phone}">${fmtPhone(job.phone)}</a></dd></div>
      </dl>

      ${job.requirements ? html`<p class="detail-note">${job.requirements}</p>` : ''}
      <p class="detail-ago">Paylaşıldı: ${timeAgo(job.created_at)}</p>

      <div class="detail-actions">
        <a class="btn btn-primary btn-lg" href="tel:${job.phone}">${icon('phone')}<span>Zəng et</span></a>
        ${mine ? '' : html`<button class="btn btn-lg" type="button" data-action="chat" data-id="${job.id}">${icon('chat')}<span>Mesaj yaz</span></button>`}
      </div>
      <div class="detail-sub">
        <button class="btn btn-ghost btn-sm" type="button" data-action="share" data-id="${job.id}">${icon('share', 16)}<span>Paylaş</span></button>
        ${mine ? '' : html`<button class="btn btn-ghost btn-sm" type="button" data-action="report" data-id="${job.id}">${icon('flag', 16)}<span>Şikayət et</span></button>`}
      </div>
    </div>`, {
    label: job.title,
    onClose: () => {
      if (history.state?.modal) history.back();
      else dismissJobUrl();
    },
  });
}

// ---------------------------------------------------------------------
// Əməliyyatlar: söhbət, paylaşma, şikayət
// ---------------------------------------------------------------------
export async function startChat(job) {
  try {
    const session = await ensureSession();
    if (job.owner_id === session.user.id) {
      toast('Bu sizin öz elanınızdır.');
      return;
    }
    const conv = await getOrCreateConversation(job);
    closeModal(true);
    dismissJobUrl();
    location.hash = `#/inbox/${conv.id}`;
  } catch (err) {
    console.error(err);
    toast(friendlyError(err), 'error');
  }
}

export async function shareJob(job) {
  const url = `${location.origin}/?job=${job.id}`;
  const text = `${job.title} — ${fmtPay(job)}, ${job.city}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'PocketJob', text, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopyalandı');
  } catch {
    toast(url);
  }
}

export function openReport(job) {
  openModal(html`
    ${modalHeader('Elanı şikayət et', 'Səbəbi seçin. Bir neçə şikayətdən sonra elan avtomatik gizlədilir.')}
    <form data-form="report" data-id="${job.id}">
      <div class="radio-list">
        ${REPORT_REASONS.map((r, i) => html`
          <label class="radio">
            <input type="radio" name="reason" value="${r.id}" ${i === 0 ? 'checked' : ''}>
            <span>${r.label}</span>
          </label>`)}
      </div>
      <div class="modal-actions">
        <button class="btn" type="button" data-action="close-modal">Ləğv et</button>
        <button class="btn btn-primary" type="submit">Şikayət göndər</button>
      </div>
    </form>`, { label: 'Şikayət' });
}

registerActions({
  'open-job': (el) => {
    const job = getCachedJob(el.dataset.id);
    if (job) openJobModal(job);
  },
  chat: (el) => {
    const job = getCachedJob(el.dataset.id);
    if (job) startChat(job);
  },
  share: (el) => {
    const job = getCachedJob(el.dataset.id);
    if (job) shareJob(job);
  },
  report: (el) => {
    const job = getCachedJob(el.dataset.id);
    if (job) openReport(job);
  },
});

registerForms({
  report: async (form) => {
    const btn = form.querySelector('[type="submit"]');
    const reason = new FormData(form).get('reason');
    setLoading(btn, true, 'Göndərilir…');
    try {
      await reportJob(form.dataset.id, reason);
      closeModal(true);
      toast('Şikayət göndərildi. Təşəkkür edirik.', 'success');
    } catch (err) {
      setLoading(btn, false);
      toast(err?.code === '23505' ? 'Bu elanı artıq şikayət etmisiniz.' : friendlyError(err), 'error');
    }
  },
});
