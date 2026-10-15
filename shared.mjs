// Netlify funksiyaları üçün ortaq köməkçilər

export const CATEGORIES = [
  'logistics', 'retail', 'food', 'delivery', 'cleaning',
  'security', 'events', 'office', 'other',
];
export const CITIES = ['Bakı', 'Sumqayıt', 'Xırdalan', 'Gəncə', 'Digər'];
export const PAY_UNITS = ['negotiable', 'total', 'hour'];

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function bearerToken(req) {
  const header = req.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/** Supabase JWT-ni yoxlayır; etibarlıdırsa istifadəçini qaytarır. */
export async function verifyUser(token) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('server_not_configured');

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? user : null;
}

// Sadə yaddaşdaxili sürət limiti (hər server nüsxəsi üçün ayrıca işləyir).
const hits = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return true;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function bakuToday(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baku',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
  'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];

export function formatPay(job) {
  if (job.pay_unit === 'total' && job.pay_amount) return `${job.pay_amount} AZN`;
  if (job.pay_unit === 'hour' && job.pay_amount) return `${job.pay_amount} AZN / saat`;
  return 'Razılaşma ilə';
}

export function formatWhen(job) {
  let date = 'Dərhal';
  if (job.work_date) {
    const [, m, d] = String(job.work_date).split('-').map(Number);
    date = `${d} ${MONTHS[m - 1]}`;
  }
  const from = job.time_from ? String(job.time_from).slice(0, 5) : '';
  const to = job.time_to ? String(job.time_to).slice(0, 5) : '';
  let time = '';
  if (from && to) time = `${from}–${to}`;
  else if (from) time = `${from}-dan`;
  return time ? `${date}, ${time}` : date;
}

export function formatPhone(phone) {
  const m = String(phone).match(/^\+994(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : String(phone);
}
