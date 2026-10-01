// Página "Crear post": el usuario describe el post, elige carrusel o card,
// y Claude (vía /api/generate) devuelve el texto y el contenido de la gráfica.

import { composePost, linkedInShareUrl, LINKEDIN_MAX_CHARS } from './parser.js';
import { $, esc, toast, copy, linkedinIcon } from './ui.js';
import { cardHtml, slideHtml, framed, fitVisuals, downloadPngs, downloadPdf } from './visuals.js';

const HISTORY_KEY = 'posty:created:v1';
const CODE_KEY = 'posty:access-code';
const MAX_HISTORY = 20;

const FORMAT_LABELS = { carousel: 'Carrusel', card: 'Card' };

const SUGGESTIONS = [
  'Lo que aprendí liderando un equipo de diseño en una scale-up',
  'Por qué los design systems necesitan un owner con criterio de producto',
  'Mi opinión sobre los diseñadores que programan con IA',
];

const state = {
  step: 'prompt', // prompt → format → loading → result | error
  prompt: '',
  format: null,
  result: null,
  error: null,
  editing: false,
};

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento disponible: el historial vive solo en esta pestaña.
  }
}

let history = readStorage(HISTORY_KEY, []);

function saveToHistory(post) {
  history = [post, ...history.filter((p) => p.id !== post.id)].slice(0, MAX_HISTORY);
  writeStorage(HISTORY_KEY, history);
}

function finalText(post) {
  return composePost(post.text, (post.hashtags || []).join(' '));
}

function slug(text) {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'post'
  );
}

// ---------- Render ----------

function bubble(role, content) {
  return `<div class="msg msg-${role}">${role === 'assistant' ? '<span class="msg-avatar" aria-hidden="true">✳</span>' : ''}<div class="msg-content">${content}</div></div>`;
}

function renderComposer() {
  return `
    <form class="composer" id="create-form">
      <label for="create-prompt" class="sr-only">¿Sobre qué quieres publicar?</label>
      <textarea id="create-prompt" rows="4" placeholder="Cuéntale a Claude de qué quieres hablar: una idea, una anécdota, una charla, un dato…">${esc(state.prompt)}</textarea>
      <div class="composer-foot">
        <span class="muted small">Enter para enviar · Shift+Enter para salto de línea</span>
        <button class="btn primary" type="submit">Continuar →</button>
      </div>
    </form>
    <div class="suggestions">
      ${SUGGESTIONS.map((s) => `<button class="chip" type="button" data-create-action="suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>`;
}

function renderFormatQuestion() {
  return bubble(
    'assistant',
    `<p>¿Cómo quieres que sea el post?</p>
     <div class="format-options">
       <button class="format-option" data-create-action="format" data-format="carousel">
         <span class="format-thumb thumb-carousel" aria-hidden="true"><i></i><i></i><i></i></span>
         <strong>Carrusel</strong>
         <span>5 slides para subir como PDF</span>
       </button>
       <button class="format-option" data-create-action="format" data-format="card">
         <span class="format-thumb thumb-card" aria-hidden="true"><i></i></span>
         <strong>Card</strong>
         <span>Una imagen con titular y lista</span>
       </button>
     </div>`,
  );
}

function renderResult(post) {
  const text = finalText(post);
  const over = text.length > LINKEDIN_MAX_CHARS;
  const visuals =
    post.format === 'carousel'
      ? `<div class="gen-gallery">${post.slides.map((s, i) => `<div class="gen-slide">${framed(slideHtml(s, i, post.slides.length))}</div>`).join('')}</div>`
      : `<div class="gen-single">${framed(cardHtml(post.card))}</div>`;

  return `
    <article class="post gen-post status-aprobado">
      <div class="post-head">
        <h3>${esc(post.title)}</h3>
        <span class="badge badge-aprobado">${FORMAT_LABELS[post.format]}</span>
      </div>
      ${
        state.editing
          ? `<textarea class="editor" id="gen-editor" rows="12">${esc(post.text)}</textarea>`
          : `<div class="post-text">${esc(post.text)}</div>`
      }
      <p class="hashtags">${esc((post.hashtags || []).join(' '))}</p>
      ${visuals}
      <div class="post-foot">
        <span class="count ${over ? 'over' : ''}" id="gen-count">${text.length.toLocaleString('es')} / ${LINKEDIN_MAX_CHARS.toLocaleString('es')}</span>
        <div class="actions">
          ${
            state.editing
              ? `<button class="btn primary" data-create-action="save-edit">Guardar</button>
                 <button class="btn ghost" data-create-action="cancel-edit">Cancelar</button>`
              : `<button class="btn primary" data-create-action="publish">${linkedinIcon()} Publicar</button>
                 <button class="btn ghost" data-create-action="copy">Copiar texto</button>
                 <button class="btn ghost" data-create-action="edit">Editar</button>
                 <button class="btn ghost" data-create-action="png">⬇ ${post.format === 'carousel' ? 'PNGs' : 'PNG'}</button>
                 ${post.format === 'carousel' ? '<button class="btn ghost" data-create-action="pdf">⬇ PDF</button>' : ''}`
          }
        </div>
      </div>
    </article>
    <div class="gen-next">
      <button class="btn ghost" data-create-action="regenerate">↻ Generar otra versión</button>
      <button class="btn ghost" data-create-action="switch-format">Probar como ${post.format === 'carousel' ? 'card' : 'carrusel'}</button>
      <button class="btn ghost" data-create-action="new">+ Nuevo post</button>
    </div>`;
}

function renderConversation() {
  const parts = [];
  if (state.step === 'prompt') return renderComposer();

  parts.push(bubble('user', `<p>${esc(state.prompt)}</p>`));
  if (state.step === 'format') {
    parts.push(renderFormatQuestion());
    parts.push(`<div class="gen-next"><button class="btn ghost" data-create-action="back">← Cambiar la petición</button></div>`);
    return parts.join('');
  }

  parts.push(bubble('assistant', `<p>¿Cómo quieres que sea el post?</p>`));
  parts.push(bubble('user', `<p>${FORMAT_LABELS[state.format]}</p>`));

  if (state.step === 'loading') {
    parts.push(
      bubble(
        'assistant',
        `<p class="typing"><span></span><span></span><span></span> Escribiendo tu ${state.format === 'carousel' ? 'carrusel' : 'card'}… suele tardar entre 20 y 60 segundos.</p>`,
      ),
    );
  } else if (state.step === 'error') {
    parts.push(
      bubble(
        'assistant',
        `<p class="error-text">${esc(state.error)}</p>
         ${state.needsCode ? renderCodeForm() : ''}
         <div class="actions start"><button class="btn primary" data-create-action="retry">Reintentar</button><button class="btn ghost" data-create-action="back">Cambiar la petición</button></div>`,
      ),
    );
  } else if (state.step === 'result') {
    parts.push(bubble('assistant', `<p>Aquí lo tienes. Puedes editar el texto, descargar la gráfica y publicarlo.</p>`));
    parts.push(renderResult(state.result));
  }
  return parts.join('');
}

function renderCodeForm() {
  return `
    <label class="field code-field">
      Código de acceso de Posty
      <input type="password" id="access-code" autocomplete="current-password" value="${esc(readStorage(CODE_KEY, ''))}" />
    </label>`;
}

function renderHistory() {
  if (!history.length) return '';
  return `
    <h2 class="section-title">Creados recientemente</h2>
    <ul class="history">
      ${history
        .map(
          (p) => `
        <li>
          <button class="history-item" data-create-action="open" data-id="${esc(p.id)}">
            <span class="badge badge-pendiente">${FORMAT_LABELS[p.format]}</span>
            <span class="history-title">${esc(p.title)}</span>
            <span class="muted small">${esc(new Date(p.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }))}</span>
          </button>
        </li>`,
        )
        .join('')}
    </ul>`;
}

export function renderCreate() {
  const root = $('#create-root');
  root.innerHTML = `
    <header class="page-head">
      <h1>Crear post</h1>
      <p class="muted">Describe lo que quieres contar y Claude lo convierte en un post de LinkedIn con su carrusel o card.</p>
    </header>
    <section class="conversation" aria-live="polite">${renderConversation()}</section>
    ${state.step === 'prompt' ? renderHistory() : ''}`;
  fitVisuals(root);
  if (state.step === 'prompt') $('#create-prompt')?.focus();
}

// ---------- Acciones ----------

async function generate() {
  state.step = 'loading';
  state.error = null;
  state.editing = false;
  renderCreate();
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-posty-code': readStorage(CODE_KEY, '') },
      body: JSON.stringify({ prompt: state.prompt, format: state.format }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      state.needsCode = res.status === 401;
      throw new Error(
        data.error || (res.status === 404 ? 'El generador solo funciona con la web desplegada en Vercel.' : 'No se pudo generar el post.'),
      );
    }
    state.result = { ...data, id: `gen-${Date.now()}`, prompt: state.prompt, createdAt: new Date().toISOString() };
    saveToHistory(state.result);
    state.step = 'result';
  } catch (err) {
    state.error = err.message === 'Failed to fetch' ? 'No hay conexión con el servidor.' : err.message;
    state.step = 'error';
  }
  renderCreate();
}

function visualNodes() {
  return [...document.querySelectorAll('#create-root .visual')];
}

async function handle(btn) {
  const action = btn.dataset.createAction;
  const post = state.result;
  switch (action) {
    case 'suggest':
      $('#create-prompt').value = btn.dataset.text;
      $('#create-prompt').focus();
      break;
    case 'format':
      state.format = btn.dataset.format;
      generate();
      break;
    case 'back':
      state.step = 'prompt';
      renderCreate();
      break;
    case 'retry': {
      const code = $('#access-code')?.value;
      if (code !== undefined) writeStorage(CODE_KEY, code);
      generate();
      break;
    }
    case 'regenerate':
      generate();
      break;
    case 'switch-format':
      state.format = post.format === 'carousel' ? 'card' : 'carousel';
      generate();
      break;
    case 'new':
      Object.assign(state, { step: 'prompt', prompt: '', format: null, result: null, editing: false });
      renderCreate();
      break;
    case 'open': {
      const found = history.find((p) => p.id === btn.dataset.id);
      if (!found) return;
      Object.assign(state, { step: 'result', prompt: found.prompt, format: found.format, result: found, editing: false });
      renderCreate();
      break;
    }
    case 'copy':
      toast((await copy(finalText(post))) ? 'Texto copiado ✓' : 'No se pudo copiar');
      break;
    case 'publish':
      window.open(linkedInShareUrl(finalText(post)), '_blank', 'noopener');
      await copy(finalText(post));
      toast('Texto copiado. Adjunta la gráfica en LinkedIn.');
      break;
    case 'edit':
      state.editing = true;
      renderCreate();
      $('#gen-editor')?.focus();
      break;
    case 'cancel-edit':
      state.editing = false;
      renderCreate();
      break;
    case 'save-edit':
      post.text = $('#gen-editor').value.replace(/\s+$/, '');
      saveToHistory(post);
      state.editing = false;
      toast('Cambios guardados');
      renderCreate();
      break;
    case 'png':
    case 'pdf': {
      btn.disabled = true;
      try {
        const name = slug(post.title);
        if (action === 'png') await downloadPngs(visualNodes(), name);
        else await downloadPdf(visualNodes(), name);
      } catch (err) {
        console.error(err);
        toast('No se pudo exportar la gráfica');
      }
      btn.disabled = false;
      break;
    }
  }
}

export function initCreatePage() {
  const root = $('#create-root');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-create-action]');
    if (!btn) return;
    e.preventDefault();
    handle(btn);
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'create-form') return;
    e.preventDefault();
    const text = $('#create-prompt').value.trim();
    if (!text) {
      toast('Escribe primero de qué quieres hablar');
      return;
    }
    state.prompt = text;
    state.step = 'format';
    renderCreate();
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'create-prompt' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'gen-editor') return;
    const len = composePost(e.target.value, (state.result.hashtags || []).join(' ')).length;
    const counter = $('#gen-count');
    counter.textContent = `${len.toLocaleString('es')} / ${LINKEDIN_MAX_CHARS.toLocaleString('es')}`;
    counter.classList.toggle('over', len > LINKEDIN_MAX_CHARS);
  });
  window.addEventListener('resize', () => fitVisuals(root));
}
