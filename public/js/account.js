import { html } from './utils.js';
import {
  auth, userId, isAnonymous, linkEmail, sendLoginLink, signOut, friendlyError,
} from './api.js';
import {
  openModal, closeModal, modalHeader, toast, registerForms, registerActions, setLoading,
} from './ui.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function openAccountModal() {
  const user = auth.session?.user;
  const signedIn = Boolean(userId());
  const anon = isAnonymous();

  if (signedIn && !anon) {
    openModal(html`
      ${modalHeader('Hesabınız', 'Elanlarınız və mesajlarınız bu hesaba bağlıdır.')}
      <p class="modal-text">Daxil olmusunuz: <strong>${user.email || 'e-poçt göstərilməyib'}</strong></p>
      <div class="modal-actions">
        <button class="btn" type="button" data-action="close-modal">Bağla</button>
        <button class="btn btn-danger" type="button" data-action="sign-out">Çıxış</button>
      </div>`, { label: 'Hesab' });
    return;
  }

  openModal(html`
    ${modalHeader('Hesab', signedIn
      ? 'Hazırda anonim istifadə edirsiniz. Hesab bu cihazla bağlıdır.'
      : 'Elan yaradanda və ya mesaj yazanda hesab avtomatik yaranır.')}

    ${signedIn && anon ? html`
      <form data-form="link-email" class="form-block" novalidate>
        <h3 class="block-title">Elanlarınızı qoruyun</h3>
        <p class="hint">E-poçt əlavə edin. Brauzer məlumatı silinsə belə, elanlarınıza və mesajlarınıza qayıda bilərsiniz.</p>
        <label class="label" for="linkEmail">E-poçt</label>
        <input id="linkEmail" name="email" class="input" type="email" autocomplete="email" placeholder="ad@numune.az" required>
        <p class="field-error" data-error="email" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Təsdiq linki göndər</button>
      </form>
      <div class="divider"></div>` : ''}

    <form data-form="login-link" class="form-block" novalidate>
      <h3 class="block-title">Artıq hesabınız var?</h3>
      <p class="hint">E-poçtunuza birdəfəlik giriş linki göndərəcəyik.</p>
      <label class="label" for="loginEmail">E-poçt</label>
      <input id="loginEmail" name="email" class="input" type="email" autocomplete="email" placeholder="ad@numune.az" required>
      <p class="field-error" data-error="email" hidden></p>
      <button class="btn btn-block" type="submit">Giriş linki göndər</button>
    </form>`, { label: 'Hesab' });
}

function readEmail(form) {
  const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
  const err = form.querySelector('[data-error="email"]');
  if (!EMAIL_RE.test(email)) {
    err.textContent = 'Düzgün e-poçt ünvanı yazın.';
    err.hidden = false;
    form.querySelector('input').focus();
    return null;
  }
  err.hidden = true;
  return email;
}

export function initAccount() {
  registerForms({
    'link-email': async (form) => {
      const email = readEmail(form);
      if (!email) return;
      const btn = form.querySelector('[type="submit"]');
      setLoading(btn, true, 'Göndərilir…');
      try {
        await linkEmail(email);
        closeModal(true);
        toast('Təsdiq linki e-poçtunuza göndərildi. Linkə klikləyin.', 'success');
      } catch (err) {
        setLoading(btn, false);
        const msg = String(err?.message || '');
        toast(
          msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')
            ? 'Bu e-poçt artıq başqa hesaba bağlıdır. "Artıq hesabınız var?" bölməsindən daxil olun.'
            : friendlyError(err),
          'error',
        );
      }
    },

    'login-link': async (form) => {
      const email = readEmail(form);
      if (!email) return;
      const btn = form.querySelector('[type="submit"]');
      setLoading(btn, true, 'Göndərilir…');
      try {
        await sendLoginLink(email);
        closeModal(true);
        toast('Giriş linki göndərildi. E-poçtunuzu yoxlayın.', 'success');
      } catch (err) {
        setLoading(btn, false);
        toast(
          String(err?.message || '').toLowerCase().includes('signups not allowed')
            ? 'Bu e-poçtla hesab tapılmadı.'
            : friendlyError(err),
          'error',
        );
      }
    },
  });

  registerActions({
    'sign-out': async () => {
      await signOut();
      closeModal(true);
      toast('Hesabdan çıxdınız');
      setTimeout(() => { location.hash = '#/'; location.reload(); }, 400);
    },
  });
}
