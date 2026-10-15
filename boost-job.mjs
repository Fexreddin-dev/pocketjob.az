// POST /api/boost-job  { job_id: "uuid" }
// 1) Sahibliyi və gözləmə müddətini bazada yoxlayır (boost_job funksiyası)
// 2) Elanı Telegram kanalına göndərir (bot tokeni yalnız burada saxlanılır)

import {
  json, bearerToken, verifyUser, rateLimit,
  escapeHtml, formatPay, formatWhen, formatPhone,
} from '../lib/shared.mjs';

export const config = { path: '/api/boost-job' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sendToTelegram(job) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || '@pocketjob_elanlar';
  if (!botToken) return false;

  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  const lines = [
    '🚨 <b>TƏCİLİ ELAN</b>',
    '',
    `📌 <b>${escapeHtml(job.title)}</b>`,
    `💰 ${escapeHtml(formatPay(job))}`,
    `📍 ${escapeHtml(job.city)}, ${escapeHtml(job.location)}`,
    `⏰ ${escapeHtml(formatWhen(job))}`,
    `📞 ${escapeHtml(formatPhone(job.phone))}`,
  ];
  if (job.requirements) lines.push(`📝 ${escapeHtml(job.requirements)}`);
  if (site) lines.push('', `👉 <a href="${escapeHtml(site)}/?job=${job.id}">Elanı saytda aç</a>`);

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) console.error('telegram error:', data.description);
    return Boolean(data.ok);
  } catch (err) {
    console.error('telegram fetch failed:', err?.message || err);
    return false;
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const token = bearerToken(req);
  if (!token) return json(401, { ok: false, error: 'unauthorized' });

  let user;
  try {
    user = await verifyUser(token);
  } catch {
    return json(500, { ok: false, error: 'server_not_configured' });
  }
  if (!user) return json(401, { ok: false, error: 'unauthorized' });

  if (!rateLimit(`boost:${user.id}`, 5, 60_000)) {
    return json(429, { ok: false, error: 'too_many_requests' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: 'bad_request' });
  }
  const jobId = String(body?.job_id || '');
  if (!UUID_RE.test(jobId)) return json(400, { ok: false, error: 'bad_request' });

  // Bazada irəli çək (RLS və gözləmə qaydası orada yoxlanılır)
  const rpc = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/boost_job`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ p_job_id: jobId }),
  });
  const result = await rpc.json().catch(() => ({}));

  if (!rpc.ok) {
    const msg = String(result?.message || '');
    if (msg.includes('boost_cooldown')) return json(409, { ok: false, error: 'boost_cooldown' });
    if (msg.includes('job_not_found')) return json(404, { ok: false, error: 'job_not_found' });
    console.error('boost rpc failed:', rpc.status, msg);
    return json(500, { ok: false, error: 'boost_failed' });
  }

  const telegram = await sendToTelegram(result);
  return json(200, { ok: true, telegram });
};
