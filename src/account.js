// Página "Cuenta": sesión, uso de Claude este mes, token para la rutina semanal
// y subida manual de semanas de propuestas (Markdown + imágenes).

import { $, esc, toast, copy } from './ui.js';
import { getBackend, setPassword } from './backend.js';
import { parseWeek } from './parser.js';
import { reloadWeeks } from './main.js';

const ui = { newToken: null, usage: null, tokenDate: undefined, weeks: [], tokenError: null, creating: false };

function ingestUrl() {
  return `${location.origin}/api/proposals`;
}

function routineSnippet(token) {
  return `Antes de preparar la semana, lee mis temas en Posty y úsalos para elegir de qué tratan los posts (y su "pilar"):
  curl -sS "${location.origin}/api/topics" -H "Authorization: Bearer ${token}"
- La respuesta es JSON: "topics" (nombre y enfoque de cada tema), "postsPerWeek", "audience", "notes" y "brief" (las mismas indicaciones en texto). Sigue "brief".

Envía también la tanda a Posty, la plataforma donde reviso y publico los posts:
- Primero el Markdown de la semana (formato PROPUESTAS.md del repositorio jpdazab/Posty), en una sola petición:
  curl -sS -X POST "${ingestUrl()}?week=AAAA-Www" -H "Authorization: Bearer ${token}" -H "Content-Type: text/markdown; charset=utf-8" --data-binary @semana.md
- Después cada imagen o PDF que nombra el Markdown, una petición por archivo (máximo 4 MB cada uno):
  curl -sS -X POST "${ingestUrl()}?week=AAAA-Www&file=lun-carrusel-1.png" -H "Authorization: Bearer ${token}" -H "Content-Type: application/octet-stream" --data-binary @lun-carrusel-1.png
- Cada respuesta es JSON con "ok": true. Si una petición falla, repítela una vez; si sigue fallando, dilo en el resumen final.`;
}

// Dirección del conector de Claude (servidor MCP de Posty) con el token personal.
function connectorUrl(token) {
  return `${location.origin}/api/mcp?token=${encodeURIComponent(token)}`;
}

function renderLocal() {
  return `
    <section class="ed-group account-card">
      <h2>Modo local</h2>
      <p class="muted">Posty está funcionando sin cuenta: todo se guarda en este navegador. Para tener usuarios con login, propuestas semanales por persona y datos en la nube, configura Supabase siguiendo <code>SETUP.md</code>.</p>
    </section>`;
}

function renderCloud() {
  const backend = getBackend();
  return `
    <section class="ed-group account-card">
      <h2>Tu cuenta</h2>
      <p><strong>${esc(backend.user.email)}</strong></p>
      <div class="actions start"><button class="btn ghost" data-account-action="sign-out">Cerrar sesión</button></div>
    </section>

    <section class="ed-group account-card">
      <h2>Contraseña</h2>
      <p class="muted">Con una contraseña puedes entrar sin esperar el código por email.</p>
      <form class="password-form" id="password-form" novalidate>
        <label class="field">Nueva contraseña<input type="password" id="new-password" autocomplete="new-password" minlength="8" required /></label>
        <label class="field">Repítela<input type="password" id="new-password-2" autocomplete="new-password" minlength="8" required /></label>
        <div class="actions start"><button class="btn primary" type="submit">Guardar contraseña</button></div>
      </form>
    </section>

    <section class="ed-group account-card">
      <h2>Generación con Claude</h2>
      <p>${ui.usage === null ? 'Cargando…' : `Este mes has generado <strong>${ui.usage}</strong> ${ui.usage === 1 ? 'post' : 'posts'} con "Pedir a Claude".`}</p>
      <p class="muted small">Hay un límite mensual por persona. "Pegar mi texto" y "Desde cero" no cuentan.</p>
    </section>

    <section class="ed-group account-card">
      <h2>Conectar con Claude</h2>
      <p class="muted">Usa tu propio Claude (cualquier plan, también el gratuito, que admite un conector personalizado; sin API) para crear posts y propuestas en Posty desde el chat de Claude. Funciona con un token personal, el mismo que usa tu rutina semanal; si creas uno nuevo, el anterior deja de funcionar en los dos sitios.</p>
      <p>${ui.tokenDate === undefined ? 'Cargando…' : ui.tokenDate ? `Tienes un token creado el ${esc(new Date(ui.tokenDate).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }))}.` : 'Todavía no has creado un token.'}</p>
      ${
        ui.newToken
          ? `<div class="token-box">
               <p><strong>Cópialo ahora:</strong> no se volverá a mostrar. La dirección del conector lleva el token dentro: no la compartas.</p>
               <p class="small"><strong>Conector de Claude</strong></p>
               <code class="token">${esc(connectorUrl(ui.newToken))}</code>
               <div class="actions start">
                 <button class="btn primary small" data-account-action="copy-connector">Copiar dirección del conector</button>
               </div>
               <ol class="steps small">
                 <li>En Claude, abre <strong>Ajustes → Conectores</strong> y pulsa <strong>Añadir conector personalizado</strong>.</li>
                 <li>Nombre: <strong>Posty</strong>. URL: pega la dirección. Guarda.</li>
                 <li>En un chat, activa Posty en el menú de herramientas y pídele, por ejemplo: <em>"Prepara mis propuestas de la semana que viene con mis temas de Posty"</em> o <em>"Crea un post con mi plantilla Dato del día sobre…"</em>.</li>
               </ol>
               <p class="small"><strong>Rutina semanal</strong></p>
               <code class="token">${esc(ui.newToken)}</code>
               <div class="actions start">
                 <button class="btn ghost small" data-account-action="copy-token">Copiar token</button>
                 <button class="btn ghost small" data-account-action="copy-snippet">Copiar instrucciones para la rutina</button>
               </div>
             </div>`
          : `<div class="actions start"><button class="btn primary" data-account-action="create-token" ${ui.creating ? 'disabled' : ''}>${ui.creating ? 'Creando…' : ui.tokenDate ? 'Crear token nuevo' : 'Crear token'}</button></div>`
      }
      ${ui.tokenError ? `<p class="error-text" role="alert">${esc(ui.tokenError)}</p>` : ''}
    </section>

    <section class="ed-group account-card">
      <h2>Subir una semana a mano</h2>
      <p class="muted">Elige el archivo <code>.md</code> de la semana (formato de <code>PROPUESTAS.md</code>) junto con sus imágenes y PDF. Si la semana ya existe, se reemplaza.</p>
      <label class="btn ghost">Elegir archivos<input type="file" multiple accept=".md,text/markdown,image/*,application/pdf" data-week-upload hidden /></label>
      ${
        ui.weeks.length
          ? `<ul class="font-list">${ui.weeks
              .map((w) => `<li><span>${esc(w.week)}</span><small class="muted">${Object.keys(w.files).length} archivos</small><button class="link danger" data-account-action="delete-week" data-week="${esc(w.week)}">Borrar</button></li>`)
              .join('')}</ul>`
          : ''
      }
    </section>`;
}

export function renderAccount() {
  const backend = getBackend();
  $('#account-root').innerHTML = `
    <header class="page-head">
      <h1>Cuenta</h1>
      <p class="muted">Tu sesión, tu rutina semanal y tus semanas de propuestas.</p>
    </header>
    <div class="account-grid">${backend.mode === 'cloud' ? renderCloud() : renderLocal()}</div>`;
  if (backend.mode === 'cloud' && ui.usage === null) loadInfo();
}

async function loadInfo() {
  const backend = getBackend();
  try {
    [ui.usage, ui.tokenDate, ui.weeks] = await Promise.all([backend.usageThisMonth(), backend.hasIngestToken(), backend.listWeeks()]);
  } catch (err) {
    console.error(err);
    toast('No se pudo cargar la información de la cuenta');
    ui.usage = 0;
    ui.tokenDate = null;
  }
  if (location.hash === '#/cuenta') renderAccount();
}

async function uploadWeek(files) {
  const md = files.find((f) => /\.md$/i.test(f.name));
  if (!md) throw new Error('Falta el archivo .md de la semana');
  const source = await md.text();
  const week = parseWeek(source, md.name.replace(/\.md$/i, ''));
  if (!/^\d{4}-W\d{2}$/.test(week.id)) throw new Error(`La semana "${week.id}" no tiene el formato AAAA-Www (por ejemplo 2026-W42)`);
  const others = files.filter((f) => f !== md);
  await getBackend().saveWeek(week.id, source, others);
  return week;
}

async function handle(btn) {
  const backend = getBackend();
  switch (btn.dataset.accountAction) {
    case 'sign-out':
      await backend.signOut();
      break;
    case 'create-token':
      if (ui.tokenDate && !window.confirm('El token anterior dejará de funcionar y tendrás que actualizar el conector de Claude y la rutina. ¿Seguir?')) return;
      ui.creating = true;
      ui.tokenError = null;
      renderAccount();
      try {
        const token = await backend.createIngestToken();
        if (typeof token !== 'string' || !token.startsWith('posty_')) throw new Error('Supabase no devolvió un token. Vuelve a ejecutar supabase/schema.sql completo en el SQL Editor (ver SETUP.md).');
        ui.newToken = token;
        ui.tokenDate = new Date().toISOString();
      } catch (err) {
        console.error(err);
        // El error se queda a la vista (no solo en un aviso que desaparece).
        ui.tokenError = err.message || 'No se pudo crear el token.';
      }
      ui.creating = false;
      renderAccount();
      break;
    case 'copy-token':
      toast((await copy(ui.newToken)) ? 'Token copiado ✓' : 'No se pudo copiar');
      break;
    case 'copy-connector':
      toast((await copy(connectorUrl(ui.newToken))) ? 'Dirección del conector copiada ✓' : 'No se pudo copiar');
      break;
    case 'copy-snippet':
      toast((await copy(routineSnippet(ui.newToken))) ? 'Instrucciones copiadas ✓' : 'No se pudo copiar');
      break;
    case 'delete-week': {
      const week = btn.dataset.week;
      if (!window.confirm(`¿Borrar la semana ${week} y sus imágenes?`)) return;
      await backend.deleteWeek(week);
      ui.weeks = ui.weeks.filter((w) => w.week !== week);
      await reloadWeeks();
      toast('Semana borrada');
      renderAccount();
      break;
    }
  }
}

export function initAccountPage() {
  const root = $('#account-root');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-account-action]');
    if (!btn) return;
    e.preventDefault();
    handle(btn);
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'password-form') return;
    e.preventDefault();
    const a = $('#new-password').value;
    const b = $('#new-password-2').value;
    if (a.length < 8) return toast('Usa al menos 8 caracteres.');
    if (a !== b) return toast('Las dos contraseñas no coinciden.');
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await setPassword(a);
      e.target.reset();
      toast('Contraseña guardada. Ya puedes entrar con ella ✓');
    } catch (err) {
      toast(err.message);
    }
    btn.disabled = false;
  });
  root.addEventListener('change', async (e) => {
    if (e.target.dataset.weekUpload === undefined || !e.target.files.length) return;
    try {
      toast('Subiendo…');
      const week = await uploadWeek([...e.target.files]);
      ui.weeks = await getBackend().listWeeks();
      await reloadWeeks();
      toast(`Semana ${week.id} subida con ${week.posts.length} posts ✓`);
      renderAccount();
    } catch (err) {
      console.error(err);
      toast(err.message || 'No se pudo subir la semana');
    }
    e.target.value = '';
  });
}
