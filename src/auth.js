// Página de acceso (modo cuentas): el usuario escribe su email y recibe un enlace para entrar.
// Solo funciona con emails invitados desde Supabase (aquí no se pueden crear cuentas).

import { $, esc } from './ui.js';
import { sendMagicLink } from './backend.js';

const EMAIL_KEY = 'posty:last-email';
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

const state = { step: 'form', email: '', error: urlError, sending: false, cooldown: 0 };
let timer;

function rememberedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

function render() {
  const root = $('#login-root');
  if (state.step === 'sent') {
    root.querySelector('.login-panel').innerHTML = `
      <div class="login-sent">
        <span class="login-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        </span>
        <h2>Revisa tu email</h2>
        <p>Te enviamos un enlace a <strong>${esc(state.email)}</strong>. Ábrelo para entrar en Posty. Si no lo ves en unos minutos, mira en spam.</p>
        <div class="login-actions">
          <button class="btn ghost" data-login-action="resend" ${state.cooldown || state.sending ? 'disabled' : ''}>
            ${state.sending ? 'Enviando…' : state.cooldown ? `Reenviar en ${state.cooldown} s` : 'Reenviar el enlace'}
          </button>
          <button class="link" data-login-action="change">Usar otro email</button>
        </div>
        <p class="login-msg error" role="alert">${state.error ? esc(state.error) : ''}</p>
      </div>`;
    return;
  }
  root.querySelector('.login-panel').innerHTML = `
    <form class="login-form" id="login-form" novalidate>
      <h2>Entrar</h2>
      <p class="muted">Te enviamos un enlace por email para entrar, sin contraseña.</p>
      <label class="field">
        Email
        <input type="email" id="login-email" autocomplete="email" inputmode="email" required placeholder="tu@email.com" value="${esc(state.email || rememberedEmail())}" />
      </label>
      <button class="btn primary" type="submit" ${state.sending ? 'disabled' : ''}>${state.sending ? 'Enviando…' : 'Enviarme el enlace'}</button>
      <p class="login-msg error" id="login-msg" role="alert">${state.error ? esc(state.error) : ''}</p>
      <p class="muted small">¿Aún no tienes acceso? Pide una invitación a quien administra Posty.</p>
    </form>`;
  $('#login-email').focus();
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
    try {
      localStorage.setItem(EMAIL_KEY, email);
    } catch {
      // Sin almacenamiento: no pasa nada, solo no se recuerda el email.
    }
    state.step = 'sent';
    startCooldown();
  } catch (err) {
    state.error = err.message;
  }
  state.sending = false;
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

  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'login-form') return;
    e.preventDefault();
    const email = $('#login-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      state.error = 'Escribe un email válido.';
      state.email = email;
      render();
      return;
    }
    send(email);
  });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-login-action]');
    if (!btn) return;
    if (btn.dataset.loginAction === 'resend') send(state.email);
    if (btn.dataset.loginAction === 'change') {
      state.step = 'form';
      state.error = null;
      render();
    }
  });
  render();
}
