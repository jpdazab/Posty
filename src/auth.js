// Pantalla de acceso (modo cloud): el usuario escribe su email y recibe un enlace para entrar.
// Solo funciona con emails invitados desde Supabase (no se pueden crear cuentas desde aquí).

import { $, esc } from './ui.js';
import { sendMagicLink } from './backend.js';

export function showLogin() {
  document.body.classList.remove('loading');
  document.body.classList.add('logged-out');
  const root = document.createElement('main');
  root.className = 'login';
  root.innerHTML = `
    <form class="login-card" id="login-form">
      <span class="logo" aria-hidden="true">P</span>
      <h1>Entrar a Posty</h1>
      <p class="muted">Escribe tu email y te enviamos un enlace para entrar, sin contraseña.</p>
      <label class="field">
        Email
        <input type="email" id="login-email" autocomplete="email" required placeholder="tu@email.com" />
      </label>
      <button class="btn primary" type="submit">Enviarme el enlace</button>
      <p class="login-msg" id="login-msg" role="status" aria-live="polite"></p>
    </form>`;
  document.body.appendChild(root);
  const form = $('#login-form');
  const msg = $('#login-msg');
  $('#login-email').focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const button = form.querySelector('button');
    button.disabled = true;
    msg.className = 'login-msg';
    msg.textContent = 'Enviando…';
    try {
      await sendMagicLink(email);
      msg.classList.add('ok');
      msg.innerHTML = `Listo. Revisa <strong>${esc(email)}</strong> y abre el enlace que te enviamos.`;
    } catch (err) {
      msg.classList.add('error');
      msg.textContent = err.message;
    }
    button.disabled = false;
  });
}
