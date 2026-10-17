import { CONFIG } from './config.js';

export const isConfigured = () =>
  Boolean(CONFIG.SUPABASE_URL) &&
  Boolean(CONFIG.SUPABASE_ANON_KEY) &&
  !CONFIG.SUPABASE_URL.includes('YOUR-') &&
  !CONFIG.SUPABASE_ANON_KEY.includes('YOUR-') &&
  typeof window.supabase?.createClient === 'function';

export const sb = isConfigured()
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const BUCKET = 'job-images';

// ---------------------------------------------------------------------
// Xəta mesajları (istifadəçi üçün aydın dildə)
// ---------------------------------------------------------------------
export function friendlyError(err) {
  const msg = String(err?.message || err?.error || err || '');
  const code = String(err?.code || '');
  if (msg.includes('rate_limit')) return 'Çox tez-tez əməliyyat edirsiniz. Bir az gözləyin.';
  if (msg.includes('past_date')) return 'Keçmiş tarix seçmək olmaz.';
  if (msg.includes('date_too_far')) return 'Tarix 60 gündən uzaq ola bilməz.';
  if (msg.includes('boost_cooldown')) return 'Elanı 6 saatda bir dəfə irəli çəkmək olar.';
  if (msg.includes('job_not_found')) return 'Elan tapılmadı və ya artıq aktiv deyil.';
  if (msg.includes('too_many_requests')) return 'Çox sorğu göndərdiniz. Bir dəqiqə sonra yenidən yoxlayın.';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    return 'İnternet bağlantısını yoxlayın.';
  }
  if (msg.toLowerCase().includes('anonymous sign-ins are disabled')) {
    return 'Giriş sistemi hələ qoşulmayıb (Supabase-də Anonymous sign-ins aktiv edilməlidir).';
  }
  if (code === '23505') return 'Bu əməliyyat artıq edilib.';
  if (code === '23514') return 'Məlumatlar düzgün deyil. Sahələri yoxlayın.';
  if (code === '42501') return 'Bu əməliyyat üçün icazəniz yoxdur.';
  return 'Xəta baş verdi. Bir az sonra yenidən yoxlayın.';
}

// ---------------------------------------------------------------------
// Giriş (sessiya)
// ---------------------------------------------------------------------
export const auth = { session: null };

export async function initAuth(onChange) {
  const { data } = await sb.auth.getSession();
  auth.session = data.session;
  sb.auth.onAuthStateChange((event, session) => {
    auth.session = session;
    // Callback daxilində birbaşa Supabase çağırışı etməmək üçün gecikdiririk
    setTimeout(() => onChange(event, session), 0);
  });
}

export const userId = () => auth.session?.user?.id ?? null;
export const isAnonymous = () => Boolean(auth.session?.user?.is_anonymous);

let pendingSignIn = null;
/** Əməliyyat üçün sessiya lazımdırsa, avtomatik anonim hesab yaradır. */
export async function ensureSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    auth.session = data.session;
    return data.session;
  }
  if (!pendingSignIn) {
    pendingSignIn = sb.auth.signInAnonymously()
      .then(({ data: d, error }) => {
        if (error) throw error;
        auth.session = d.session;
        return d.session;
      })
      .finally(() => { pendingSignIn = null; });
  }
  return pendingSignIn;
}

export async function linkEmail(email) {
  const { error } = await sb.auth.updateUser(
    { email },
    { emailRedirectTo: window.location.origin },
  );
  if (error) throw error;
}

export async function sendLoginLink(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  await sb.auth.signOut();
}

// ---------------------------------------------------------------------
// Netlify funksiyaları
// ---------------------------------------------------------------------
async function callFunction(path, body) {
  const session = await ensureSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function parseJobText(text) {
  const data = await callFunction('/api/ai-parse', { text });
  return data.data;
}

export async function boostJob(jobId) {
  return callFunction('/api/boost-job', { job_id: jobId });
}

// ---------------------------------------------------------------------
// Elanlar
// ---------------------------------------------------------------------
export const foldQuery = (q) => {
  const from = 'əƏıİöÖüÜşŞçÇğĞ';
  const to = 'eeiioouussccgg';
  let out = '';
  for (const ch of q) {
    const i = from.indexOf(ch);
    out += i >= 0 ? to[i] : ch;
  }
  return out.toLowerCase().replace(/[,()%*\\"'_]/g, ' ').replace(/\s+/g, ' ').trim();
};

export async function fetchJobs({ q = '', category = '', city = '', from = 0, to = 11 }) {
  let query = sb
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('bumped_at', { ascending: false })
    .range(from, to);
  if (category) query = query.eq('category', category);
  if (city) query = query.eq('city', city);
  const fq = foldQuery(q);
  if (fq) query = query.ilike('search_text', `%${fq}%`);
  const { data, error, count } = await query;
  if (error) throw error;
  return { jobs: data || [], count: count ?? 0 };
}

export async function fetchJob(id) {
  const { data, error } = await sb.from('jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchMyJobs() {
  const uid = userId();
  if (!uid) return [];
  const { data, error } = await sb
    .from('jobs')
    .select('*')
    .eq('owner_id', uid)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

async function uploadImage(blob, uid) {
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  });
  if (error) throw error;
  return { path, url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

export async function createJob(fields, imageBlob) {
  const session = await ensureSession();
  let uploaded = null;
  if (imageBlob) uploaded = await uploadImage(imageBlob, session.user.id);

  const { data, error } = await sb
    .from('jobs')
    .insert({ ...fields, image_url: uploaded?.url ?? null })
    .select()
    .single();

  if (error) {
    if (uploaded) await sb.storage.from(BUCKET).remove([uploaded.path]).catch(() => {});
    throw error;
  }
  return data;
}

export async function setJobStatus(id, status) {
  const { error } = await sb.from('jobs').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteJob(job) {
  const { error } = await sb.from('jobs').delete().eq('id', job.id);
  if (error) throw error;
  if (job.image_url) {
    const marker = `/${BUCKET}/`;
    const idx = job.image_url.indexOf(marker);
    if (idx >= 0) {
      const path = job.image_url.slice(idx + marker.length);
      await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    }
  }
}

export async function reportJob(jobId, reason) {
  await ensureSession();
  const { error } = await sb.from('reports').insert({ job_id: jobId, reason });
  if (error) throw error;
}

export function subscribeJobs(onChange) {
  return sb
    .channel('jobs-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, onChange)
    .subscribe();
}

// ---------------------------------------------------------------------
// Söhbətlər
// ---------------------------------------------------------------------
export async function getOrCreateConversation(job) {
  const session = await ensureSession();
  const me = session.user.id;

  const existing = await sb
    .from('conversations')
    .select('*')
    .eq('job_id', job.id)
    .eq('seeker_id', me)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const created = await sb
    .from('conversations')
    .insert({ job_id: job.id, employer_id: job.owner_id })
    .select()
    .single();

  if (created.error) {
    if (created.error.code === '23505') {
      const again = await sb
        .from('conversations').select('*').eq('job_id', job.id).eq('seeker_id', me).single();
      if (again.error) throw again.error;
      return again.data;
    }
    throw created.error;
  }
  return created.data;
}

export async function listConversations() {
  if (!userId()) return [];
  const { data, error } = await sb
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function listMessages(conversationId) {
  const { data, error } = await sb
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data || [];
}

export async function sendMessage(conversationId, body) {
  await ensureSession();
  const { data, error } = await sb
    .from('messages')
    .insert({ conversation_id: conversationId, body })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markRead(conversationId) {
  const { error } = await sb.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  if (error) throw error;
}

/** { conversationId: oxunmamış sayı } */
export async function unreadMap() {
  const uid = userId();
  if (!uid) return {};
  const { data, error } = await sb
    .from('messages')
    .select('conversation_id')
    .is('read_at', null)
    .neq('sender_id', uid)
    .limit(1000);
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.conversation_id] = (map[row.conversation_id] || 0) + 1;
  return map;
}

export function subscribeMessages(onInsert) {
  const uid = userId();
  if (!uid) return null;
  return sb
    .channel(`messages-${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => onInsert(p.new))
    .subscribe();
}

export function removeChannel(channel) {
  if (channel) sb.removeChannel(channel);
}
