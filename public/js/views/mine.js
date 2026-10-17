import { html, setHTML } from '../utils.js';
import { icon } from '../icons.js';
import {
  fetchMyJobs, setJobStatus, deleteJob, boostJob, friendlyError, userId, isAnonymous,
} from '../api.js';
import { jobCard, skeletonCards, cacheJobs, getCachedJob } from '../jobs-ui.js';
import { registerActions, toast, confirmDialog, emptyState, setLoading } from '../ui.js';
import { openAccountModal } from '../account.js';

const $ = (id) => document.getElementById(id);

export async function loadMine() {
  const grid = $('mineGrid');
  const note = $('mineNote');

  if (!userId()) {
    note.hidden = true;
    setHTML(grid, html`<div class="grid-full">${emptyState({
      title: 'Hələ elanınız yoxdur',
      text: 'Paylaşdığınız elanlar burada görünəcək. Elanları idarə etmək, irəli çəkmək və bağlamaq buradan edilir.',
      action: { href: '#/new', label: 'İlk elanı yarat' },
    })}</div>`);
    return;
  }

  setHTML(grid, skeletonCards(3));
  try {
    const jobs = await fetchMyJobs();
    cacheJobs(jobs);

    if (isAnonymous()) {
      setHTML(note, html`
        <div class="notice">
          <span class="notice-ic">${icon('lock', 18)}</span>
          <p>Elanlarınız bu cihazla bağlıdır. Brauzer məlumatı silinsə, onlara çıxışı itirərsiniz.</p>
          <button class="btn btn-sm" type="button" data-action="open-account">Hesabı qoru</button>
        </div>`);
      note.hidden = false;
    } else {
      note.hidden = true;
    }

    if (jobs.length === 0) {
      setHTML(grid, html`<div class="grid-full">${emptyState({
        title: 'Hələ elanınız yoxdur',
        text: 'İlk elanı bir cümlə ilə yarada bilərsiniz.',
        action: { href: '#/new', label: 'Elan yarat' },
      })}</div>`);
      return;
    }
    setHTML(grid, html`${jobs.map((j) => jobCard(j, { mode: 'mine' }))}`);
  } catch (err) {
    console.error(err);
    setHTML(grid, html`<div class="grid-full">${emptyState({
      title: 'Elanlar yüklənmədi',
      text: friendlyError(err),
    })}</div>`);
  }
}

export function initMine() {
  registerActions({
    'open-account': () => openAccountModal(),

    boost: async (el) => {
      const ok = await confirmDialog({
        title: 'Elanı irəli çək',
        text: 'Elan siyahının başına qalxacaq və Telegram kanalına göndəriləcək. Bunu 6 saatda bir dəfə etmək olar.',
        confirmLabel: 'İrəli çək',
      });
      if (!ok) return;
      setLoading(el, true, 'Göndərilir…');
      try {
        const res = await boostJob(el.dataset.id);
        toast(res.telegram ? 'Elan irəli çəkildi və Telegram kanalına göndərildi' : 'Elan irəli çəkildi', 'success');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
      loadMine();
    },

    'close-job': async (el) => {
      const ok = await confirmDialog({
        title: 'Elanı bağla',
        text: 'Elan siyahıdan çıxacaq. İstəsəniz sonra yenidən aça bilərsiniz.',
        confirmLabel: 'Bağla',
      });
      if (!ok) return;
      try {
        await setJobStatus(el.dataset.id, 'closed');
        toast('Elan bağlandı', 'success');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
      loadMine();
    },

    'reopen-job': async (el) => {
      try {
        await setJobStatus(el.dataset.id, 'active');
        toast('Elan yenidən açıldı', 'success');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
      loadMine();
    },

    'delete-job': async (el) => {
      const job = getCachedJob(el.dataset.id);
      if (!job) return;
      const ok = await confirmDialog({
        title: 'Elanı sil',
        text: 'Elan və ona aid şəkil həmişəlik silinəcək. Bu əməliyyat geri qaytarılmır.',
        confirmLabel: 'Sil',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteJob(job);
        toast('Elan silindi', 'success');
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
      loadMine();
    },
  });
}
