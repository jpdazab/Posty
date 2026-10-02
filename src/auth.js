// Página de acceso (modo cuentas). Dos formas de entrar:
// - Código por email: el email trae un enlace y un código; se entra con cualquiera de los dos.
// - Contraseña: no depende de que lleguen los emails (se pone en Cuenta o la da quien administra).
// Solo funciona con emails invitados desde Supabase (aquí no se pueden crear cuentas).

import { $, esc } from './ui.js';
import { onSignedIn, sendMagicLink, verifyEmailCode, signInWithPassword } from './backend.js';

const EMAIL_KEY = 'posty:last-email';
const METHOD_KEY = 'posty:login-method';
const RESEND_SECONDS = 60;

// Si el enlace del email caducó o ya se usó, Supabase vuelve con el error en la URL (#error=…).
// Se lee al cargar, antes de que el cliente de Supabase limpie la dirección.
const urlError = (() => {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = params.get('error_code') || params.get('error');
  if (!code) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (/expired/.test(code) || /expired/i.test(params.get('error_description') || '')) {
    return 'El enlace caducó o ya se usó. Pide uno nuevo: llega en unos segundos.';
  }
  return 'No se pudo entrar con ese enlace. Pide uno nuevo.';
})();

const state = { step: 'form', method: readStored(METHOD_KEY) === 'password' ? 'password' : 'code', email: '', error: urlError, sending: false, verifying: false, cooldown: 0 };
let timer;

function readStored(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: no pasa nada, solo no se recuerda.
  }
}

const rememberedEmail = () => readStored(EMAIL_KEY);

function render() {
  const root = $('#login-root');
  if (state.step === 'sent') {
    root.querySelector('.login-panel').innerHTML = `
      <div class="login-sent">
        <span class="login-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        </span>
        <h2>Revisa tu email</h2>
        <p>Te enviamos un email a <strong>${esc(state.email)}</strong>. Abre el enlace o escribe aquí el código que trae. Si no lo ves en unos minutos, mira en spam.</p>
        <form class="login-code" id="login-code" novalidate>
          <label class="field">
            Código
            <input id="login-code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" />
          </label>
          <button class="btn primary" type="submit" ${state.verifying ? 'disabled' : ''}>${state.verifying ? 'Entrando…' : 'Entrar'}</button>
        </form>
        <p class="login-msg error" role="alert">${state.error ? esc(state.error) : ''}</p>
        <div class="login-actions">
          <button class="btn ghost" data-login-action="resend" ${state.cooldown || state.sending ? 'disabled' : ''}>
            ${state.sending ? 'Enviando…' : state.cooldown ? `Reenviar en ${state.cooldown} s` : 'Reenviar el email'}
          </button>
          <button class="link" data-login-action="change">Usar otro email</button>
        </div>
      </div>`;
    $('#login-code-input').focus();
    return;
  }
  const password = state.method === 'password';
  root.querySelector('.login-panel').innerHTML = `
    <form class="login-form" id="login-form" novalidate>
      <h2>Entrar</h2>
      <div class="mode-switch login-methods" role="tablist" aria-label="Cómo quieres entrar">
        <button type="button" role="tab" class="chip ${password ? '' : 'active'}" aria-selected="${!password}" data-login-action="method" data-method="code">Código por email</button>
        <button type="button" role="tab" class="chip ${password ? 'active' : ''}" aria-selected="${password}" data-login-action="method" data-method="password">Contraseña</button>
      </div>
      <p class="muted">${password ? 'Entra con tu email y tu contraseña de Posty.' : 'Te enviamos un email con un enlace y un código para entrar, sin contraseña.'}</p>
      <label class="field">
        Email
        <input type="email" id="login-email" autocomplete="email" inputmode="email" required placeholder="tu@email.com" value="${esc(state.email || rememberedEmail())}" />
      </label>
      ${
        password
          ? `<label class="field">
               Contraseña
               <span class="password-field">
                 <input type="password" id="login-password" autocomplete="current-password" required />
                 <button type="button" class="link" data-login-action="toggle-password" aria-label="Mostrar contraseña">Mostrar</button>
               </span>
             </label>`
          : ''
      }
      <button class="btn primary" type="submit" ${state.sending ? 'disabled' : ''}>${state.sending ? (password ? 'Entrando…' : 'Enviando…') : password ? 'Entrar' : 'Continuar'}</button>
      <p class="login-msg error" id="login-msg" role="alert">${state.error ? esc(state.error) : ''}</p>
      <p class="muted small">${
        password
          ? '¿No tienes contraseña? Entra con el código por email y ponla en Cuenta, o pídesela a quien administra Posty.'
          : '¿No te llega el email? Mira en spam o entra con contraseña. ¿Aún no tienes acceso? Pide una invitación a quien administra Posty.'
      }</p>
    </form>`;
  (password && (state.email || rememberedEmail()) ? $('#login-password') : $('#login-email')).focus();
}

function startCooldown() {
  state.cooldown = RESEND_SECONDS;
  clearInterval(timer);
  timer = setInterval(() => {
    state.cooldown -= 1;
    if (state.cooldown <= 0) clearInterval(timer);
    if (state.step === 'sent') render();
  }, 1000);
}

async function send(email) {
  state.sending = true;
  state.error = null;
  state.email = email;
  render();
  try {
    await sendMagicLink(email);
    store(EMAIL_KEY, email);
    store(METHOD_KEY, 'code');
    state.step = 'sent';
    startCooldown();
  } catch (err) {
    state.error = err.message;
  }
  state.sending = false;
  render();
}

async function passwordSignIn(email, password) {
  state.sending = true;
  state.error = null;
  state.email = email;
  render();
  try {
    await signInWithPassword(email, password);
    store(EMAIL_KEY, email);
    store(METHOD_KEY, 'password');
    location.reload();
    return;
  } catch (err) {
    state.error = err.message;
  }
  state.sending = false;
  render();
}

async function verify(code) {
  state.verifying = true;
  state.error = null;
  render();
  try {
    await verifyEmailCode(state.email, code);
    location.reload();
    return;
  } catch (err) {
    state.error = err.message;
  }
  state.verifying = false;
  render();
}

export function showLogin() {
  document.body.classList.remove('loading');
  document.body.classList.add('logged-out');
  document.title = 'Entrar · Posty';
  const root = document.createElement('main');
  root.className = 'login';
  root.id = 'login-root';
  root.innerHTML = `
    <section class="login-hero">
      <div class="login-brand"><span class="logo" aria-hidden="true">P</span><strong>Posty</strong></div>
      <h1>Tus posts de LinkedIn, listos para publicar.</h1>
      <ul class="login-points">
        <li><strong>AI Digest</strong><span>Las propuestas de tu rutina semanal, para revisar y publicar.</span></li>
        <li><strong>Crear post</strong><span>Pide a Claude, pega tu texto o empieza desde cero.</span></li>
        <li><strong>Diseños</strong><span>Carruseles y cards con tu marca, en PNG y PDF.</span></li>
      </ul>
    </section>
    <section class="login-panel" aria-live="polite"></section>`;
  document.body.appendChild(root);

  // Si el enlace se abre en otra pestaña de este navegador, esta pestaña entra sola.
  onSignedIn(() => location.reload());

  root.addEventListener('submit', (e) => {
    if (e.target.id === 'login-code') {
      e.preventDefault();
      const code = $('#login-code-input').value.replace(/\s/g, '');
      if (!/^\d{6,10}$/.test(code)) {
        state.error = 'Escribe el código de números que llegó en el email.';
        render();
        return;
      }
      verify(code);
      return;
    }
    if (e.target.id !== 'login-form') return;
    e.preventDefault();
    const email = $('#login-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      state.error = 'Escribe un email válido.';
      state.email = email;
      render();
      return;
    }
    if (state.method === 'password') {
      const password = $('#login-password').value;
      if (!password) {
        state.error = 'Escribe tu contraseña.';
        state.email = email;
        render();
        return;
      }
      passwordSignIn(email, password);
      return;
    }
    send(email);
  });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-login-action]');
    if (!btn) return;
    if (btn.dataset.loginAction === 'resend') send(state.email);
    if (btn.dataset.loginAction === 'method') {
      state.email = $('#login-email')?.value.trim() || state.email;
      state.method = btn.dataset.method;
      state.error = null;
      render();
    }
    if (btn.dataset.loginAction === 'toggle-password') {
      const input = $('#login-password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Ocultar' : 'Mostrar';
      btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      input.focus();
    }
    if (btn.dataset.loginAction === 'change') {
      state.step = 'form';
      state.error = null;
      render();
    }
  });
  render();
}
