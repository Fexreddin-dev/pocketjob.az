// ---------------------------------------------------------------------
// Təhlükəsiz HTML şablonu: html`...` içindəki hər ${dəyər} avtomatik escape olunur.
// Bu, XSS (zərərli kod yeridilməsi) riskini tamamilə aradan qaldırır.
// ---------------------------------------------------------------------
class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Safe(String(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function render(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === false || v === true || v == null) return '';
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Safe(out);
}

export function setHTML(el, safe) {
  el.innerHTML = safe instanceof Safe ? safe.s : esc(safe);
}

// ---------------------------------------------------------------------
// Azərbaycan hərflərini sadələşdirmə (axtarış və mətn analizi üçün)
// ---------------------------------------------------------------------
const AZ_FROM = 'əƏıİöÖüÜşŞçÇğĞ';
const AZ_TO = 'eeiioouussccgg';

export function fold(str = '') {
  let out = '';
  for (const ch of String(str)) {
    const i = AZ_FROM.indexOf(ch);
    out += i >= 0 ? AZ_TO[i] : ch;
  }
  return out.toLowerCase();
}

// ---------------------------------------------------------------------
// Tarix və vaxt (Bakı vaxtı ilə)
// ---------------------------------------------------------------------
const TZ = 'Asia/Baku';
const MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
  'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];
export const MONTH_KEYS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr',
];

export function bakuToday(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  const today = bakuToday();
  if (iso === today) return 'Bu gün';
  if (iso === addDays(today, 1)) return 'Sabah';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

export function fmtWhen(job) {
  const date = job.work_date ? fmtDate(job.work_date) : 'Dərhal';
  const from = hhmm(job.time_from);
  const to = hhmm(job.time_to);
  let time = '';
  if (from && to) time = `${from}–${to}`;
  else if (from) time = `${from}-dan`;
  return time ? `${date}, ${time}` : date;
}

export function fmtPay(job) {
  if (job.pay_unit === 'total' && job.pay_amount) return `${job.pay_amount} AZN`;
  if (job.pay_unit === 'hour' && job.pay_amount) return `${job.pay_amount} AZN/saat`;
  return 'Razılaşma ilə';
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'indicə';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq əvvəl`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat əvvəl`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} gün əvvəl`;
  return new Date(iso).toLocaleDateString('az-AZ');
}

export function fmtClock(iso) {
  return new Date(iso).toLocaleTimeString('az-AZ', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  });
}

export function isBoosted(job) {
  return Boolean(job.boosted_at) && Date.now() - new Date(job.boosted_at).getTime() < 24 * 3600 * 1000;
}

// ---------------------------------------------------------------------
// Telefon nömrəsi (Azərbaycan mobil operatorları)
// ---------------------------------------------------------------------
const PHONE_RE = /^\+994(10|50|51|55|60|70|77|99)\d{7}$/;

/** "050 123 45 67", "0501234567", "+994501234567" → "+994501234567" (və ya null) */
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('994') && d.length === 12) d = d.slice(3);
  else if (d.startsWith('0') && d.length === 10) d = d.slice(1);
  if (d.length !== 9) return null;
  const p = `+994${d}`;
  return PHONE_RE.test(p) ? p : null;
}

export function fmtPhone(p) {
  const m = String(p).match(/^\+994(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : String(p);
}

// ---------------------------------------------------------------------
// Digər
// ---------------------------------------------------------------------
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Şəkli kiçildir (maks 1280px, JPEG) — yükləmə sürətli və ucuz olsun. */
export async function compressImage(file, maxSide = 1280, quality = 0.82) {
  if (!file || !file.type.startsWith('image/')) throw new Error('not_image');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('compress_failed');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
