import { CATEGORIES, CITIES, PAY_UNITS, EXAMPLES } from '../constants.js';
import {
  html, setHTML, bakuToday, addDays, normalizePhone, compressImage,
} from '../utils.js';
import { icon } from '../icons.js';
import { parseOffline } from '../parse.js';
import { parseJobText, createJob, friendlyError } from '../api.js';
import { jobCard } from '../jobs-ui.js';
import { registerActions, registerForms, toast, setLoading } from '../ui.js';

const $ = (id) => document.getElementById(id);

const initial = () => ({
  step: 'text',
  raw: '',
  draft: null,
  photoBlob: null,
  photoUrl: '',
});
let S = initial();

const emptyDraft = () => ({
  title: '', category: 'other', city: 'Bakı', location: '',
  pay_unit: 'negotiable', pay_amount: null,
  work_date: '', time_from: '', time_to: '',
  requirements: '', phone: '',
});

// ---------------------------------------------------------------------
// AI və ehtiyat nəticəsini birləşdir
// ---------------------------------------------------------------------
function mergeDrafts(ai, offline) {
  const d = emptyDraft();
  const pick = (key) => (ai && ai[key] ? ai[key] : offline[key] || '');

  d.title = pick('title');
  d.category = ai?.category && ai.category !== 'other' ? ai.category : offline.category;
  d.city = ai?.city || offline.city || 'Bakı';
  d.location = pick('location');
  if (ai && ai.pay_unit !== 'negotiable' && ai.pay_amount) {
    d.pay_unit = ai.pay_unit;
    d.pay_amount = ai.pay_amount;
  } else {
    d.pay_unit = offline.pay_unit;
    d.pay_amount = offline.pay_amount;
  }
  d.work_date = pick('work_date');
  d.time_from = pick('time_from');
  d.time_to = ai?.time_from ? ai.time_to || '' : offline.time_to || '';
  d.requirements = pick('requirements');
  d.phone = (ai && normalizePhone(ai.phone)) || offline.phone || '';
  return d;
}

// ---------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------
function validate(d) {
  const e = {};
  if (d.title.length < 3 || d.title.length > 80) e.title = 'Vəzifəni 3-80 simvolla yazın.';
  if (d.location.length < 2 || d.location.length > 80) e.location = 'Metro, rayon və ya ünvanı yazın.';
  if (!normalizePhone(d.phone)) e.phone = 'Düzgün mobil nömrə yazın. Məsələn: 050 123 45 67';
  if (d.pay_unit !== 'negotiable') {
    const n = Number(d.pay_amount);
    if (!Number.isInteger(n) || n < 1 || n > 5000) e.pay_amount = 'Məbləği 1-5000 AZN arasında yazın.';
  }
  const today = bakuToday();
  if (d.work_date) {
    if (d.work_date < today) e.work_date = 'Keçmiş tarix seçmək olmaz.';
    else if (d.work_date > addDays(today, 60)) e.work_date = 'Tarix 60 gündən uzaq ola bilməz.';
  }
  if (d.time_to && !d.time_from) e.time_from = 'Əvvəlcə başlama saatını seçin.';
  return e;
}

function showErrors(errors) {
  document.querySelectorAll('#jobForm [data-error]').forEach((el) => {
    const msg = errors[el.dataset.error];
    el.textContent = msg || '';
    el.hidden = !msg;
  });
  document.querySelectorAll('#jobForm [name]').forEach((el) => {
    el.toggleAttribute('aria-invalid', Boolean(errors[el.name]));
  });
  const firstKey = Object.keys(errors)[0];
  if (firstKey) document.querySelector(`#jobForm [name="${firstKey}"]`)?.focus();
}

// ---------------------------------------------------------------------
// Forma ilə qaralama arasında sinxron
// ---------------------------------------------------------------------
function readForm() {
  const f = $('jobForm');
  if (!f) return;
  const g = (n) => f.elements[n]?.value ?? '';
  S.draft = {
    title: g('title').trim(),
    category: g('category'),
    city: g('city'),
    location: g('location').trim(),
    pay_unit: g('pay_unit') || 'negotiable',
    pay_amount: g('pay_amount') ? Number(g('pay_amount')) : null,
    work_date: g('work_date'),
    time_from: g('time_from'),
    time_to: g('time_to'),
    requirements: g('requirements').trim(),
    phone: g('phone').trim(),
  };
}

function draftToJob(d) {
  const now = new Date().toISOString();
  return {
    id: 'preview',
    owner_id: '',
    ...d,
    title: d.title || 'Vəzifə adı',
    location: d.location,
    pay_amount: d.pay_unit === 'negotiable' ? null : d.pay_amount,
    work_date: d.work_date || null,
    time_from: d.time_from || null,
    time_to: d.time_to || null,
    image_url: S.photoUrl,
    created_at: now,
    bumped_at: now,
    boosted_at: null,
    status: 'active',
  };
}

function renderPreview() {
  const box = $('jobPreview');
  if (!box || !S.draft) return;
  setHTML(box, jobCard(draftToJob(S.draft), { preview: true }));
}

function renderPhotoBox() {
  const box = $('photoBox');
  if (!box) return;
  setHTML(box, S.photoUrl
    ? html`
      <div class="photo-has">
        <img src="${S.photoUrl}" alt="Seçilmiş şəkil">
        <button class="btn btn-sm" type="button" data-action="remove-photo">${icon('trash', 16)}<span>Şəkli sil</span></button>
      </div>`
    : html`
      <label class="photo-empty" for="photoInput">
        ${icon('image', 22)}
        <span>Şəkil əlavə et (istəyə görə)</span>
      </label>`);
}

function togglePayAmount() {
  const unit = $('jobForm')?.elements['pay_unit']?.value;
  const field = $('payAmountField');
  if (field) field.hidden = unit === 'negotiable';
}

// ---------------------------------------------------------------------
// Səhifə şablonları
// ---------------------------------------------------------------------
function stepText() {
  return html`
    <div class="wrap wrap-narrow">
      <header class="page-head">
        <h1 class="page-title">Elan yarat</h1>
        <p class="page-lead">Lazım olan işi bir-iki cümlə ilə yazın. Qalan sahələri biz doldururuq, siz yoxlayıb paylaşırsınız.</p>
      </header>
      <div class="panel">
        <label class="label" for="rawText">Nə lazımdır?</label>
        <textarea id="rawText" class="textarea" rows="4" maxlength="500"
          placeholder="Məsələn: Sabah 15:00-dan 19:00-a kimi Neftçilər metrosunda yükdaşıyan lazımdır, 30 manat, 055 123 45 67">${S.raw}</textarea>
        <div class="examples">
          <span class="hint">Nümunələr:</span>
          ${EXAMPLES.map((ex, i) => html`<button class="chip chip-sm" type="button" data-action="use-example" data-i="${i}">${ex.slice(0, 34)}…</button>`)}
        </div>
        <div class="actions">
          <button class="btn btn-primary btn-lg" type="button" data-action="generate">${icon('sparkle')}<span>Elanı hazırla</span></button>
          <button class="btn btn-ghost" type="button" data-action="manual">Əl ilə doldur</button>
        </div>
      </div>
    </div>`;
}

function field(label, name, control, { hint = '', optional = false } = {}) {
  return html`
    <div class="field">
      <label class="label" for="f_${name}">${label}${optional ? html` <span class="optional">(istəyə görə)</span>` : ''}</label>
      ${control}
      ${hint ? html`<p class="hint">${hint}</p>` : ''}
      <p class="field-error" data-error="${name}" hidden></p>
    </div>`;
}

function stepForm() {
  const d = S.draft;
  const today = bakuToday();
  return html`
    <div class="wrap">
      <header class="page-head">
        <button class="btn btn-ghost btn-sm back-link" type="button" data-action="back-to-text">${icon('back', 16)}<span>Mətnə qayıt</span></button>
        <h1 class="page-title">Elanı yoxlayın</h1>
        <p class="page-lead">Məlumatları düzəldə bilərsiniz. Sağdakı kart elanın necə görünəcəyini göstərir.</p>
      </header>

      <div class="create-grid">
        <aside class="preview-col" aria-label="Elanın önizləməsi">
          <p class="preview-label">Elan belə görünəcək</p>
          <div id="jobPreview"></div>
        </aside>

        <form id="jobForm" class="panel form" data-form="job" novalidate>
          ${field('Vəzifə', 'title', html`<input id="f_title" name="title" class="input" type="text" maxlength="80" autocomplete="off" value="${d.title}" placeholder="Məsələn: Kassir">`)}

          <div class="row-2">
            ${field('Sahə', 'category', html`<select id="f_category" name="category" class="input">${CATEGORIES.map((c) => html`<option value="${c.id}" ${d.category === c.id ? 'selected' : ''}>${c.label}</option>`)}</select>`)}
            ${field('Şəhər', 'city', html`<select id="f_city" name="city" class="input">${CITIES.map((c) => html`<option value="${c}" ${d.city === c ? 'selected' : ''}>${c}</option>`)}</select>`)}
          </div>

          ${field('Məkan', 'location', html`<input id="f_location" name="location" class="input" type="text" maxlength="80" autocomplete="off" value="${d.location}" placeholder="Metro, rayon və ya ünvan">`)}

          <fieldset class="field fieldset">
            <legend class="label">Ödəniş</legend>
            <div class="seg" role="radiogroup">
              ${PAY_UNITS.map((u) => html`
                <label class="seg-item">
                  <input type="radio" name="pay_unit" value="${u.id}" ${d.pay_unit === u.id ? 'checked' : ''}>
                  <span>${u.label}</span>
                </label>`)}
            </div>
            <div id="payAmountField" class="pay-amount" ${d.pay_unit === 'negotiable' ? 'hidden' : ''}>
              <input id="f_pay_amount" name="pay_amount" class="input" type="number" inputmode="numeric" min="1" max="5000" step="1" value="${d.pay_amount ?? ''}" placeholder="Məbləğ" aria-label="Məbləğ (AZN)">
              <span class="suffix">AZN</span>
            </div>
            <p class="field-error" data-error="pay_amount" hidden></p>
          </fieldset>

          <div class="row-3">
            ${field('Tarix', 'work_date', html`<input id="f_work_date" name="work_date" class="input" type="date" min="${today}" max="${addDays(today, 60)}" value="${d.work_date}">`, { optional: true })}
            ${field('Başlama', 'time_from', html`<input id="f_time_from" name="time_from" class="input" type="time" value="${d.time_from}">`, { optional: true })}
            ${field('Bitmə', 'time_to', html`<input id="f_time_to" name="time_to" class="input" type="time" value="${d.time_to}">`, { optional: true })}
          </div>
          <div class="quick-dates">
            <button class="chip chip-sm" type="button" data-action="set-date" data-offset="0">Bu gün</button>
            <button class="chip chip-sm" type="button" data-action="set-date" data-offset="1">Sabah</button>
            <button class="chip chip-sm" type="button" data-action="set-date" data-offset="">Tarixi sil</button>
          </div>

          ${field('Əlaqə nömrəsi', 'phone', html`<input id="f_phone" name="phone" class="input" type="tel" inputmode="tel" autocomplete="tel" value="${d.phone}" placeholder="050 123 45 67">`, { hint: 'Nömrə elanda hamıya görünəcək.' })}

          ${field('Əlavə qeyd', 'requirements', html`<textarea id="f_requirements" name="requirements" class="textarea" rows="2" maxlength="300" placeholder="Məsələn: Geyim forması verilir">${d.requirements}</textarea>`, { optional: true })}

          <div class="field">
            <span class="label">Şəkil <span class="optional">(istəyə görə)</span></span>
            <div id="photoBox"></div>
            <input id="photoInput" class="sr-only" type="file" accept="image/*">
          </div>

          <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('check')}<span>Elanı paylaş</span></button>
        </form>
      </div>
    </div>`;
}

export function renderCreate() {
  const root = $('viewNew');
  setHTML(root, S.step === 'text' ? stepText() : stepForm());
  if (S.step === 'form') {
    renderPhotoBox();
    renderPreview();
  }
}

export function resetCreate() {
  if (S.photoUrl) URL.revokeObjectURL(S.photoUrl);
  S = initial();
  $('viewNew').innerHTML = '';
}

// ---------------------------------------------------------------------
// Əməliyyatlar
// ---------------------------------------------------------------------
async function generate(btn) {
  const area = $('rawText');
  const text = area.value.trim();
  S.raw = text;
  if (text.length < 10) {
    toast('Elanı bir-iki cümlə ilə yazın.', 'error');
    area.focus();
    return;
  }
  setLoading(btn, true, 'Hazırlanır…');
  const offline = parseOffline(text);
  let ai = null;
  try {
    ai = await parseJobText(text);
  } catch (err) {
    console.warn('AI analizi alınmadı, ehtiyat üsul işlədi:', err?.message || err);
  }
  S.draft = mergeDrafts(ai, offline);
  S.step = 'form';
  renderCreate();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (!ai) toast('AI cavab vermədi, mətn avtomatik analiz olundu. Məlumatları yoxlayın.');
}

async function publish(form) {
  readForm();
  const d = S.draft;
  const errors = validate(d);
  showErrors(errors);
  if (Object.keys(errors).length) return;

  const btn = form.querySelector('[type="submit"]');
  setLoading(btn, true, 'Paylaşılır…');
  try {
    await createJob({
      title: d.title,
      category: d.category,
      city: d.city,
      location: d.location,
      pay_unit: d.pay_unit,
      pay_amount: d.pay_unit === 'negotiable' ? null : d.pay_amount,
      work_date: d.work_date || null,
      time_from: d.time_from || null,
      time_to: d.time_to || null,
      requirements: d.requirements || null,
      phone: normalizePhone(d.phone),
    }, S.photoBlob);
    toast('Elan paylaşıldı', 'success');
    resetCreate();
    location.hash = '#/mine';
  } catch (err) {
    console.error(err);
    setLoading(btn, false);
    toast(friendlyError(err), 'error');
  }
}

export function initCreate() {
  const root = $('viewNew');

  root.addEventListener('input', (e) => {
    if (!e.target.closest('#jobForm')) return;
    readForm();
    togglePayAmount();
    renderPreview();
    const err = document.querySelector(`#jobForm [data-error="${e.target.name}"]`);
    if (err) { err.hidden = true; err.textContent = ''; }
  });

  root.addEventListener('change', async (e) => {
    if (e.target.id !== 'photoInput') return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const blob = await compressImage(file);
      if (S.photoUrl) URL.revokeObjectURL(S.photoUrl);
      S.photoBlob = blob;
      S.photoUrl = URL.createObjectURL(blob);
      renderPhotoBox();
      renderPreview();
    } catch {
      toast('Şəkli oxumaq alınmadı. Başqa şəkil seçin.', 'error');
    }
  });

  root.addEventListener('blur', (e) => {
    if (e.target.name === 'phone') {
      const p = normalizePhone(e.target.value);
      if (p) {
        e.target.value = `0${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9, 11)} ${p.slice(11, 13)}`;
        readForm();
      }
    }
  }, true);

  registerActions({
    generate: (el) => generate(el),
    manual: () => {
      S.raw = $('rawText')?.value.trim() || '';
      S.draft = emptyDraft();
      S.step = 'form';
      renderCreate();
      window.scrollTo({ top: 0 });
    },
    'back-to-text': () => {
      readForm();
      S.step = 'text';
      renderCreate();
    },
    'use-example': (el) => {
      const area = $('rawText');
      area.value = EXAMPLES[Number(el.dataset.i)] || '';
      area.focus();
    },
    'set-date': (el) => {
      const off = el.dataset.offset;
      $('f_work_date').value = off === '' ? '' : addDays(bakuToday(), Number(off));
      readForm();
      renderPreview();
    },
    'remove-photo': () => {
      if (S.photoUrl) URL.revokeObjectURL(S.photoUrl);
      S.photoBlob = null;
      S.photoUrl = '';
      renderPhotoBox();
      renderPreview();
    },
  });

  registerForms({ job: publish });
}
