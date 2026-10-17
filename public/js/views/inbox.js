import { html, setHTML, timeAgo, fmtClock, debounce } from '../utils.js';
import { icon } from '../icons.js';
import {
  userId, listConversations, listMessages, sendMessage, markRead, unreadMap,
  subscribeMessages, removeChannel, fetchJob, friendlyError,
} from '../api.js';
import { openJobModal, cacheJobs } from '../jobs-ui.js';
import { registerActions, registerForms, toast, emptyState } from '../ui.js';

const $ = (id) => document.getElementById(id);

const S = {
  convs: [],
  unread: {},
  activeId: null,
  messages: [],
  channel: null,
  channelUid: null,
};

const BASE_TITLE = document.title;
const visible = () => !$('viewInbox').hidden;
const roleOf = (c) => (c.employer_id === userId() ? 'Namizəd' : 'Elan sahibi');
const totalUnread = () => Object.values(S.unread).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------
// Oxunmamış mesaj göstəriciləri
// ---------------------------------------------------------------------
function updateBadges() {
  const n = totalUnread();
  document.querySelectorAll('[data-unread]').forEach((el) => {
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  });
  document.title = n > 0 ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
}

export async function refreshUnread() {
  if (!userId()) {
    S.unread = {};
    updateBadges();
    return;
  }
  try {
    S.unread = await unreadMap();
  } catch (err) {
    console.warn('unread failed', err);
  }
  updateBadges();
}

// ---------------------------------------------------------------------
// Şablonlar
// ---------------------------------------------------------------------
function renderList() {
  const box = $('convList');
  if (S.convs.length === 0) {
    setHTML(box, emptyState({
      title: 'Hələ söhbət yoxdur',
      text: 'Elana "Mesaj yaz" düyməsi ilə yazanda söhbət burada görünəcək.',
      action: { href: '#/', label: 'Elanlara bax' },
    }));
    return;
  }
  setHTML(box, html`
    <ul class="conv-list">
      ${S.convs.map((c) => {
        const n = S.unread[c.id] || 0;
        const mine = c.last_sender_id === userId();
        return html`
          <li>
            <button class="conv ${c.id === S.activeId ? 'is-active' : ''}" type="button" data-action="open-conv" data-id="${c.id}">
              <span class="conv-top">
                <span class="conv-title">${c.job_title || 'Silinmiş elan'}</span>
                <span class="conv-time">${timeAgo(c.last_message_at)}</span>
              </span>
              <span class="conv-role">${roleOf(c)}</span>
              <span class="conv-bottom">
                <span class="conv-preview">${c.last_message_preview ? `${mine ? 'Siz: ' : ''}${c.last_message_preview}` : 'Söhbəti başlayın'}</span>
                ${n > 0 ? html`<span class="badge">${n}</span>` : ''}
              </span>
            </button>
          </li>`;
      })}
    </ul>`);
}

function messagesHtml() {
  if (S.messages.length === 0) {
    return html`<p class="thread-empty">Hələ mesaj yoxdur. İlk mesajı siz yazın.</p>`;
  }
  const me = userId();
  return html`${S.messages.map((m) => html`
    <div class="msg ${m.sender_id === me ? 'is-mine' : ''}">
      <p class="msg-body">${m.body}</p>
      <time class="msg-time" datetime="${m.created_at}">${fmtClock(m.created_at)}</time>
    </div>`)}`;
}

function renderThread() {
  const box = $('thread');
  const conv = S.convs.find((c) => c.id === S.activeId);
  $('viewInbox').classList.toggle('is-thread', Boolean(conv));

  if (!conv) {
    setHTML(box, html`<div class="thread-placeholder">${icon('chat', 28)}<p>Söhbət seçin</p></div>`);
    return;
  }
  setHTML(box, html`
    <header class="thread-head">
      <button class="btn-icon thread-back" type="button" data-action="conv-back" aria-label="Siyahıya qayıt">${icon('back')}</button>
      <div class="thread-id">
        <h2 class="thread-title">${conv.job_title || 'Silinmiş elan'}</h2>
        <p class="thread-role">${roleOf(conv)}</p>
      </div>
      ${conv.job_id ? html`<button class="btn btn-sm" type="button" data-action="conv-job" data-id="${conv.job_id}">Elana bax</button>` : ''}
    </header>
    <div id="msgList" class="msg-list" aria-live="polite">${messagesHtml()}</div>
    <form class="composer" data-form="message">
      <textarea id="msgInput" name="body" class="textarea" rows="1" maxlength="1000" placeholder="Mesaj yazın…" aria-label="Mesaj"></textarea>
      <button class="btn btn-primary btn-icon-lg" type="submit" aria-label="Göndər">${icon('send')}</button>
    </form>`);
  scrollToEnd();
}

function renderMessages() {
  const list = $('msgList');
  if (!list) return;
  setHTML(list, messagesHtml());
  scrollToEnd();
}

function scrollToEnd() {
  const list = $('msgList');
  if (list) list.scrollTop = list.scrollHeight;
}

// ---------------------------------------------------------------------
// Yükləmə və açma
// ---------------------------------------------------------------------
async function reloadList() {
  try {
    S.convs = await listConversations();
    renderList();
  } catch (err) {
    console.warn('list failed', err);
  }
}

async function openConversation(id) {
  S.activeId = id;
  S.messages = [];
  renderList();
  renderThread();
  try {
    S.messages = await listMessages(id);
    if (S.activeId !== id) return;
    renderMessages();
    if ((S.unread[id] || 0) > 0) {
      await markRead(id);
      delete S.unread[id];
      updateBadges();
      renderList();
    }
  } catch (err) {
    console.error(err);
    toast(friendlyError(err), 'error');
  }
}

export async function showInbox(convId = null) {
  if (!userId()) {
    S.convs = [];
    S.activeId = null;
    renderList();
    renderThread();
    return;
  }
  const listBox = $('convList');
  if (S.convs.length === 0) setHTML(listBox, html`<div class="sk-list"><div class="sk sk-line w80 tall"></div><div class="sk sk-line w60"></div></div>`);
  await Promise.all([reloadList(), refreshUnread()]);
  if (convId && S.convs.some((c) => c.id === convId)) {
    await openConversation(convId);
  } else {
    S.activeId = null;
    renderList();
    renderThread();
    if (convId) toast('Söhbət tapılmadı.', 'error');
  }
}

// ---------------------------------------------------------------------
// Canlı mesajlar
// ---------------------------------------------------------------------
const reloadListSoon = debounce(reloadList, 400);

function onIncoming(msg) {
  const me = userId();
  const fromOther = msg.sender_id !== me;

  if (msg.conversation_id === S.activeId && visible()) {
    if (!S.messages.some((m) => m.id === msg.id)) {
      S.messages.push(msg);
      renderMessages();
    }
    if (fromOther) markRead(msg.conversation_id).catch(() => {});
    reloadListSoon();
    return;
  }

  if (fromOther) {
    S.unread[msg.conversation_id] = (S.unread[msg.conversation_id] || 0) + 1;
    updateBadges();
    toast('Yeni mesajınız var');
  }
  reloadListSoon();
}

export function startMessaging() {
  const uid = userId();
  if (!uid || S.channelUid === uid) return;
  stopMessaging();
  S.channel = subscribeMessages(onIncoming);
  S.channelUid = uid;
  refreshUnread();
}

export function stopMessaging() {
  removeChannel(S.channel);
  S.channel = null;
  S.channelUid = null;
}

// ---------------------------------------------------------------------
// Əməliyyatlar
// ---------------------------------------------------------------------
export function initInbox() {
  registerActions({
    'open-conv': (el) => { location.hash = `#/inbox/${el.dataset.id}`; },
    'conv-back': () => { location.hash = '#/inbox'; },
    'conv-job': async (el) => {
      try {
        const job = await fetchJob(el.dataset.id);
        if (!job) {
          toast('Elan artıq mövcud deyil və ya müddəti bitib.');
          return;
        }
        cacheJobs([job]);
        openJobModal(job);
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    },
  });

  registerForms({
    message: async (form) => {
      const input = form.elements.body;
      const body = input.value.trim();
      if (!body || !S.activeId) return;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        const msg = await sendMessage(S.activeId, body);
        input.value = '';
        input.style.height = '';
        if (!S.messages.some((m) => m.id === msg.id)) S.messages.push(msg);
        renderMessages();
        reloadListSoon();
      } catch (err) {
        toast(friendlyError(err), 'error');
      } finally {
        btn.disabled = false;
        input.focus();
      }
    },
  });

  // Enter göndərir, Shift+Enter yeni sətir; sahə məzmuna görə böyüyür
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'msgInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'msgInput') {
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
    }
  });
}
