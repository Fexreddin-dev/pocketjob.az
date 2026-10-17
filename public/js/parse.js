// Ehtiyat analizator: AI cavab verməyəndə mətni qaydalarla təhlil edir.
import { fold, bakuToday, addDays, normalizePhone, MONTH_KEYS } from './utils.js';

const TITLE_RULES = [
  { keys: ['kuryer', 'kurier', 'catdirilma'], title: 'Kuryer', category: 'delivery' },
  { keys: ['yukdasiyan', 'yuk dasi', 'fehle', 'yukleme', 'anbar'], title: 'Yükdaşıyan / fəhlə', category: 'logistics' },
  { keys: ['kassir'], title: 'Kassir', category: 'retail' },
  { keys: ['satici', 'satis mesl'], title: 'Satıcı-məsləhətçi', category: 'retail' },
  { keys: ['ofisiant', 'ofisant'], title: 'Ofisiant', category: 'food' },
  { keys: ['qabyuyan'], title: 'Qabyuyan', category: 'food' },
  { keys: ['barista'], title: 'Barista', category: 'food' },
  { keys: ['aspaz', 'pisirici'], title: 'Aşpaz köməkçisi', category: 'food' },
  { keys: ['muhafize'], title: 'Mühafizəçi', category: 'security' },
  { keys: ['temizlik', 'xadime'], title: 'Xadimə / təmizlikçi', category: 'cleaning' },
  { keys: ['promouter', 'animator'], title: 'Promouter', category: 'events' },
  { keys: ['tedbir'], title: 'Tədbir köməkçisi', category: 'events' },
  { keys: ['sekreter', 'operator', 'ofis'], title: 'Ofis köməkçisi', category: 'office' },
];

const METROS = [
  ['neftciler', 'Neftçilər'], ['qara qarayev', 'Qara Qarayev'], ['28 may', '28 May'],
  ['genclik', 'Gənclik'], ['nerimanov', 'Nərimanov'], ['nizami', 'Nizami'],
  ['elmler', 'Elmlər Akademiyası'], ['insaatcilar', 'İnşaatçılar'], ['20 yanvar', '20 Yanvar'],
  ['ecemi', 'Memar Əcəmi'], ['xetai', 'Xətai'], ['korogl', 'Koroğlu'], ['ehmedli', 'Əhmədli'],
  ['hezi aslanov', 'Həzi Aslanov'], ['sahil', 'Sahil'], ['icerisheher', 'İçərişəhər'],
  ['icerisehar', 'İçərişəhər'], ['icheri', 'İçərişəhər'], ['cefer cabbarli', 'Cəfər Cabbarlı'],
  ['bakmil', 'Bakmil'], ['avtovagzal', 'Avtovağzal'], ['dernegul', 'Dərnəgül'],
  ['azadliq', 'Azadlıq prospekti'], ['ulduz', 'Ulduz'], ['xalqlar dostlugu', 'Xalqlar Dostluğu'],
];
const DISTRICTS = [
  ['yasamal', 'Yasamal'], ['binegedi', 'Binəqədi'], ['sebail', 'Səbail'], ['sabuncu', 'Sabunçu'],
  ['suraxani', 'Suraxanı'], ['masazir', 'Masazır'], ['bilgeh', 'Bilgəh'], ['ehmedli', 'Əhmədli'],
];
const CITY_KEYS = [
  ['sumqayit', 'Sumqayıt'], ['xirdalan', 'Xırdalan'], ['gence', 'Gəncə'], ['baki', 'Bakı'],
];

function detectPhone(text) {
  const re = /(?:\+?994|0)?[\s\-().]*(10|50|51|55|60|70|77|99)[\s\-().]*(\d{3})[\s\-().]*(\d{2})[\s\-().]*(\d{2})/;
  const m = text.match(re);
  if (!m) return { phone: '', rest: text };
  const phone = normalizePhone(`0${m[1]}${m[2]}${m[3]}${m[4]}`) || '';
  return { phone, rest: text.replace(m[0], ' ') };
}

function detectDate(f, today) {
  if (/\bsabah\b/.test(f)) return addDays(today, 1);
  if (/\b(birisi gun|biri gun|iki gun sonra)\b/.test(f)) return addDays(today, 2);
  const nDays = f.match(/\b(\d{1,2}) gun sonra\b/);
  if (nDays) return addDays(today, Number(nDays[1]));
  if (/\b(bu gun|bugun|bu axsam|indi)\b/.test(f)) return today;

  const [ty, tm, td] = today.split('-').map(Number);

  const monthRe = new RegExp(`\\b(\\d{1,2})\\s*-?\\s*(?:i|u|e|a|si|ci|cu|ji|inci)?\\s*(${MONTH_KEYS.join('|')})\\b`);
  const named = f.match(monthRe);
  if (named) {
    const day = Number(named[1]);
    const month = MONTH_KEYS.indexOf(named[2]) + 1;
    let year = ty;
    if (month < tm || (month === tm && day < td)) year += 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const ayin = f.match(/\bayin (\d{1,2})/);
  if (ayin) {
    const day = Number(ayin[1]);
    let year = ty;
    let month = tm;
    if (day < td) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

function toHHMM(h, m = '00', night = false) {
  let hour = Number(h);
  if (hour > 24) return null;
  if (!night && hour >= 1 && hour <= 7) hour += 12;
  if (hour === 24) hour = 0;
  return `${String(hour).padStart(2, '0')}:${m}`;
}

function detectTimes(f, night) {
  const range = f.match(
    /(\d{1,2})(?::(\d{2}))?(?:\s*-\s*|\s*-?(?:den|dan)\s*-?\s*)(\d{1,2})(?::(\d{2}))?/,
  );
  if (range) {
    const from = toHHMM(range[1], range[2] || '00', night);
    const to = toHHMM(range[3], range[4] || '00', night);
    if (from && to) return { time_from: from, time_to: to };
  }
  const single = f.match(/saat\s*(\d{1,2})(?::(\d{2}))?/);
  if (single) {
    const from = toHHMM(single[1], single[2] || '00', night);
    if (from) return { time_from: from, time_to: '' };
  }
  return { time_from: '', time_to: '' };
}

function detectPay(f) {
  const hourFirst = f.match(/saat(?:i|liq)\s*(?:odenis\s*)?(\d{1,4})\s*(?:manat|azn|man)\b/);
  if (hourFirst) return { pay_unit: 'hour', pay_amount: Number(hourFirst[1]) };
  const m = f.match(/(\d{1,4})\s*(?:manat|azn|man)\b(\s*(?:\/\s*saat|saati|saatliq))?/);
  if (m) return { pay_unit: m[2] ? 'hour' : 'total', pay_amount: Number(m[1]) };
  return { pay_unit: 'negotiable', pay_amount: null };
}

/** Mətni elan sahələrinə çevirir. */
export function parseOffline(text, now = new Date()) {
  const { phone, rest } = detectPhone(String(text || ''));
  const f = fold(rest);
  const today = bakuToday(now);

  let title = 'Təcili köməkçi';
  let category = 'other';
  for (const rule of TITLE_RULES) {
    if (rule.keys.some((k) => f.includes(k))) {
      title = rule.title;
      category = rule.category;
      break;
    }
  }

  let city = 'Bakı';
  let location = '';
  const metro = METROS.find(([k]) => f.includes(k));
  const district = DISTRICTS.find(([k]) => f.includes(k));
  const cityHit = CITY_KEYS.find(([k]) => f.includes(k));
  if (cityHit) city = cityHit[1];
  if (metro) location = `${metro[1]} m.`;
  else if (district) location = district[1];

  // "28 May" və "20 Yanvar" metro adlarını tarixlə qarışdırmamaq üçün çıxarırıq
  let fd = f;
  for (const [k] of METROS) fd = fd.split(k).join(' ');

  const night = /\bgece\b/.test(f);
  const times = detectTimes(fd, night);

  return {
    title,
    category,
    city,
    location,
    ...detectPay(f),
    work_date: detectDate(fd, today),
    ...times,
    requirements: night ? 'Gecə növbəsi' : '',
    phone,
  };
}
