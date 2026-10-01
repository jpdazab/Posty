// Página "Crear post". Dos caminos:
// - Con Claude: describes el post, eliges carrusel o card y /api/generate devuelve texto y gráfica.
// - "Escribirlo yo": eliges formato y rellenas el texto y la gráfica a mano.
// En ambos casos la gráfica se dibuja con el design system jpdazab y se puede editar con vista previa.

import { composePost, linkedInShareUrl, LINKEDIN_MAX_CHARS } from './parser.js';
import { $, esc, toast, copy, linkedinIcon } from './ui.js';
import {
  normalizePost,
  emptyVisual,
  mountPages,
  unmountPages,
  frameHtml,
  fitVisuals,
  downloadPngs,
  downloadPdf,
  blackbirdIssues,
  COVER_TONES,
} from './visuals.js';

const HISTORY_KEY = 'posty:created:v1';
const CODE_KEY = 'posty:access-code';
const MAX_HISTORY = 20;

const FORMAT_LABELS = { carousel: 'Carrusel', card: 'Card' };
const TONE_LABELS = { blue: 'Azul', ink: 'Negro', grey: 'Gris', yellow: 'Amarillo' };
const VISUAL_LABELS = { none: 'Sin gráfico', stats: 'Cifras', bars: 'Barras', venn: 'Venn' };

const SUGGESTIONS = [
  'Lo que aprendí liderando un equipo de diseño en una scale-up',
  'Por qué los design systems necesitan un owner con criterio de producto',
  'Mi opinión sobre los diseñadores que programan con IA',
];

const state = {
  step: 'prompt', // prompt → format → loading → result | error
  mode: 'ai', // ai | manual
  prompt: '',
  format: null,
  result: null,
  error: null,
  editing: false,
  needsCode: false,
};

// ---------- Almacenamiento ----------

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

// ---------- Utilidades ----------

function finalText(post) {
  return composePost(post.text, (post.hashtags || []).join(' '));
}

function slug(text) {
  return (
    String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'post'
  );
}

function blankPost(format) {
  const base = { id: `post-${Date.now()}`, format, title: '', text: '', hashtags: [], createdAt: new Date().toISOString(), prompt: '' };
  if (format === 'card') {
    return normalizePost({
      ...base,
      title: 'Nueva card',
      card: { headline: 'Tu titular con una frase destacada', highlight: 'frase destacada', lead: 'Una línea de apoyo.', items: [{ title: 'Primer punto', description: 'Una idea en una o dos líneas.' }] },
    });
  }
  return normalizePost({
    ...base,
    title: 'Nuevo carrusel',
    cover: { tone: 'blue', tag: 'ux', title: 'Tu titular de portada', underline: 'portada', summary: 'De qué va el carrusel.' },
    slides: [{ tag: 'idea', title: 'Primera idea', titleAccent: 'en dos lineas', summary: 'Explica la idea en una o dos frases.', visual: emptyVisual() }],
  });
}

// Campos editables: ruta dentro del post → valor. Las rutas usan puntos ("slides.0.title").
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

// "48% | Equipos que usan IA" → { display: '48%', value: 48, label: 'Equipos que usan IA' }
function parseVisualLines(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [first, ...rest] = line.split('|').map((x) => x.trim());
      const value = parseFloat(first.replace(',', '.').replace(/[^\d.-]/g, ''));
      return { display: first, value: Number.isFinite(value) ? value : 0, label: rest.join(' | ') };
    });
}

function visualLines(items) {
  return (items || []).map((it) => `${it.display || it.value}${it.label ? ` | ${it.label}` : ''}`).join('\n');
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
        <button class="btn ghost" type="button" data-create-action="manual">✎ Escribirlo yo</button>
        <button class="btn primary" type="submit">Generar con Claude →</button>
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
         <span>Portada y slides para subir como PDF</span>
       </button>
       <button class="format-option" data-create-action="format" data-format="card">
         <span class="format-thumb thumb-card" aria-hidden="true"><i></i></span>
         <strong>Card</strong>
         <span>Una imagen con titular y lista numerada</span>
       </button>
     </div>`,
  );
}

function field(label, path, { multiline = false, blackbird = false, hint = '' } = {}) {
  const value = getPath(state.result, path) ?? '';
  const warn = blackbird && blackbirdIssues(value);
  const input = multiline
    ? `<textarea data-field="${path}" rows="2">${esc(value)}</textarea>`
    : `<input type="text" data-field="${path}" value="${esc(value)}" />`;
  return `
    <label class="ed-field">
      <span>${esc(label)}${blackbird ? ' <em class="bb">Blackbird</em>' : ''}</span>
      ${input}
      <small class="ed-warn" data-warn="${path}" ${warn ? '' : 'hidden'}>Esta fuente no tiene tildes, ñ ni ¿¡: cambia esas letras o esas palabras.</small>
      ${hint ? `<small class="muted">${esc(hint)}</small>` : ''}
    </label>`;
}

function renderGraphicEditor(post) {
  if (post.format === 'card') {
    return `
      <fieldset class="ed-group">
        <legend>Card</legend>
        ${field('Titular', 'card.headline', { hint: 'Máximo dos líneas.' })}
        ${field('Frase destacada (en naranja)', 'card.highlight', { hint: 'Copia una parte exacta del titular.' })}
        ${field('Lead', 'card.lead')}
        ${post.card.items
          .map(
            (_, i) => `
          <div class="ed-item">
            <div class="ed-item-head"><strong>Punto ${i + 1}</strong><button class="link danger" data-create-action="remove-item" data-index="${i}">Quitar</button></div>
            ${field('Título', `card.items.${i}.title`)}
            ${field('Descripción', `card.items.${i}.description`, { multiline: true })}
          </div>`,
          )
          .join('')}
        ${post.card.items.length < 5 ? '<button class="btn ghost small" data-create-action="add-item">+ Añadir punto</button>' : ''}
      </fieldset>`;
  }

  return `
    <fieldset class="ed-group">
      <legend>Portada</legend>
      <label class="ed-field"><span>Color</span>
        <select data-field="cover.tone">${COVER_TONES.map((t) => `<option value="${t}" ${post.cover.tone === t ? 'selected' : ''}>${TONE_LABELS[t]}</option>`).join('')}</select>
      </label>
      ${field('Etiqueta', 'cover.tag', { blackbird: true })}
      ${field('Titular', 'cover.title', { blackbird: true, multiline: true, hint: 'Máximo tres líneas.' })}
      ${field('Palabra subrayada', 'cover.underline', { hint: 'Opcional: una palabra del titular.' })}
      ${post.cover.tone === 'yellow' ? '' : field('Resumen', 'cover.summary', { multiline: true })}
    </fieldset>
    ${post.slides
      .map(
        (s, i) => `
      <fieldset class="ed-group">
        <legend>Slide ${i + 2}</legend>
        <div class="ed-item-head"><span></span><button class="link danger" data-create-action="remove-slide" data-index="${i}">Quitar slide</button></div>
        ${field('Etiqueta', `slides.${i}.tag`, { blackbird: true })}
        ${field('Título, línea 1', `slides.${i}.title`, { blackbird: true })}
        ${field('Título, línea 2 (azul)', `slides.${i}.titleAccent`, { blackbird: true })}
        ${field('Resumen', `slides.${i}.summary`, { multiline: true, hint: 'Máximo tres líneas.' })}
        <label class="ed-field"><span>Gráfico</span>
          <select data-field="slides.${i}.visual.kind">${Object.entries(VISUAL_LABELS)
            .map(([k, label]) => `<option value="${k}" ${s.visual.kind === k ? 'selected' : ''}>${label}</option>`)
            .join('')}</select>
        </label>
        ${
          s.visual.kind === 'stats' || s.visual.kind === 'bars'
            ? `<label class="ed-field"><span>${s.visual.kind === 'stats' ? 'Cifras' : 'Barras'} <em class="bb">una por línea</em></span>
                 <textarea data-visual-lines="${i}" rows="3" placeholder="${s.visual.kind === 'stats' ? '48% | equipos con IA' : '72 | Research'}">${esc(visualLines(s.visual.items))}</textarea>
                 <small class="muted">${s.visual.kind === 'stats' ? 'Valor | etiqueta (la etiqueta va en Blackbird).' : 'Valor de 0 a 100 | etiqueta.'}</small>
               </label>`
            : ''
        }
        ${
          s.visual.kind === 'venn'
            ? `${field('Círculo izquierdo', `slides.${i}.visual.left`, { blackbird: true })}${field('Cruce', `slides.${i}.visual.overlap`, { blackbird: true })}${field('Círculo derecho', `slides.${i}.visual.right`, { blackbird: true })}`
            : ''
        }
      </fieldset>`,
      )
      .join('')}
    ${post.slides.length < 8 ? '<button class="btn ghost small" data-create-action="add-slide">+ Añadir slide</button>' : ''}`;
}

function renderEditor(post) {
  return `
    <div class="editor-panel">
      <fieldset class="ed-group">
        <legend>Texto del post</legend>
        ${field('Título interno', 'title')}
        <label class="ed-field"><span>Texto para LinkedIn</span><textarea data-field="text" rows="8">${esc(post.text)}</textarea></label>
        <label class="ed-field"><span>Hashtags</span><input type="text" data-hashtags value="${esc(post.hashtags.join(' '))}" placeholder="#ProductDesign #UX" /></label>
      </fieldset>
      ${renderGraphicEditor(post)}
      <div class="actions start"><button class="btn primary" data-create-action="done-edit">Listo</button></div>
    </div>`;
}

function renderPreview(post) {
  const count = post.format === 'card' ? 1 : 1 + post.slides.length;
  const frames = Array.from({ length: count }, () => frameHtml(post.format));
  return post.format === 'carousel'
    ? `<div class="gen-gallery">${frames.map((f) => `<div class="gen-slide">${f}</div>`).join('')}</div>`
    : `<div class="gen-single">${frames[0]}</div>`;
}

function renderResult(post) {
  const text = finalText(post);
  const over = text.length > LINKEDIN_MAX_CHARS;
  const preview = `<div class="gen-preview" id="gen-preview">${renderPreview(post)}</div>`;

  if (state.editing) {
    return `
      <article class="post gen-post gen-editing status-aprobado">
        <div class="post-head"><h3>Editar ${FORMAT_LABELS[post.format].toLowerCase()}</h3><span class="badge badge-aprobado">Vista previa en vivo</span></div>
        <div class="edit-layout">${renderEditor(post)}<div class="edit-preview">${preview}</div></div>
      </article>`;
  }

  return `
    <article class="post gen-post status-aprobado">
      <div class="post-head">
        <h3>${esc(post.title || 'Sin título')}</h3>
        <span class="badge badge-aprobado">${FORMAT_LABELS[post.format]}</span>
      </div>
      <div class="post-text">${esc(post.text) || '<span class="muted">Sin texto todavía.</span>'}</div>
      <p class="hashtags">${esc(post.hashtags.join(' '))}</p>
      ${preview}
      <div class="post-foot">
        <span class="count ${over ? 'over' : ''}">${text.length.toLocaleString('es')} / ${LINKEDIN_MAX_CHARS.toLocaleString('es')}</span>
        <div class="actions">
          <button class="btn primary" data-create-action="publish">${linkedinIcon()} Publicar</button>
          <button class="btn ghost" data-create-action="copy">Copiar texto</button>
          <button class="btn ghost" data-create-action="edit">Editar</button>
          <button class="btn ghost" data-create-action="png">⬇ ${post.format === 'carousel' ? 'PNGs' : 'PNG'}</button>
          ${post.format === 'carousel' ? '<button class="btn ghost" data-create-action="pdf">⬇ PDF</button>' : ''}
        </div>
      </div>
    </article>
    <div class="gen-next">
      ${state.mode === 'ai' && state.prompt ? '<button class="btn ghost" data-create-action="regenerate">↻ Generar otra versión</button>' : ''}
      ${state.mode === 'ai' && state.prompt ? `<button class="btn ghost" data-create-action="switch-format">Probar como ${post.format === 'carousel' ? 'card' : 'carrusel'}</button>` : ''}
      <button class="btn ghost" data-create-action="new">+ Nuevo post</button>
    </div>`;
}

function renderConversation() {
  if (state.step === 'prompt') return renderComposer();
  const parts = [];

  parts.push(bubble('user', `<p>${state.mode === 'manual' ? 'Quiero escribirlo yo' : esc(state.prompt)}</p>`));
  if (state.step === 'format') {
    parts.push(renderFormatQuestion());
    parts.push(`<div class="gen-next"><button class="btn ghost" data-create-action="back">← Volver</button></div>`);
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
         <div class="actions start">
           <button class="btn primary" data-create-action="retry">Reintentar</button>
           <button class="btn ghost" data-create-action="manual-from-error">Escribirlo yo</button>
           <button class="btn ghost" data-create-action="back">Cambiar la petición</button>
         </div>`,
      ),
    );
  } else if (state.step === 'result') {
    parts.push(
      bubble(
        'assistant',
        `<p>${state.mode === 'manual' ? 'Rellena el texto y la gráfica. La vista previa se actualiza mientras escribes.' : 'Aquí lo tienes. Puedes editar el texto y la gráfica, descargarla y publicarlo.'}</p>`,
      ),
    );
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
            <span class="history-title">${esc(p.title || 'Sin título')}</span>
            <span class="muted small">${esc(new Date(p.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }))}</span>
          </button>
        </li>`,
        )
        .join('')}
    </ul>`;
}

function mountPreview() {
  const preview = $('#gen-preview');
  if (preview && state.result) mountPages(preview, state.result);
}

export function renderCreate() {
  const root = $('#create-root');
  unmountPages(root);
  root.innerHTML = `
    <header class="page-head">
      <h1>Crear post</h1>
      <p class="muted">Pide a Claude un post o escríbelo tú. La gráfica sale con tu design system, lista para LinkedIn.</p>
    </header>
    <section class="conversation" aria-live="polite">${renderConversation()}</section>
    ${state.step === 'prompt' ? renderHistory() : ''}`;
  mountPreview();
  if (state.step === 'prompt') $('#create-prompt')?.focus();
}

// Vuelve a dibujar solo el editor + vista previa (p. ej. al añadir un punto) sin perder el resto.
function rerenderResult() {
  renderCreate();
}

let previewTimer;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    mountPreview();
    saveToHistory(state.result);
  }, 120);
}

// ---------- Acciones ----------

async function generate() {
  state.mode = 'ai';
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
        data.error ||
          (res.status === 404 ? 'El generador con Claude solo funciona con la web desplegada en Vercel.' : 'No se pudo generar el post.'),
      );
    }
    state.result = normalizePost({ ...data, id: `gen-${Date.now()}`, prompt: state.prompt, createdAt: new Date().toISOString() });
    saveToHistory(state.result);
    state.step = 'result';
  } catch (err) {
    state.error = err.message === 'Failed to fetch' ? 'No hay conexión con el servidor.' : err.message;
    state.step = 'error';
  }
  renderCreate();
}

function startManual(format) {
  state.mode = 'manual';
  state.format = format;
  state.result = blankPost(format);
  state.editing = true;
  state.step = 'result';
  saveToHistory(state.result);
  renderCreate();
}

async function handle(btn) {
  const action = btn.dataset.createAction;
  const post = state.result;
  switch (action) {
    case 'suggest':
      $('#create-prompt').value = btn.dataset.text;
      $('#create-prompt').focus();
      break;
    case 'manual':
      state.mode = 'manual';
      state.step = 'format';
      renderCreate();
      break;
    case 'manual-from-error':
      startManual(state.format);
      break;
    case 'format':
      if (state.mode === 'manual') startManual(btn.dataset.format);
      else {
        state.format = btn.dataset.format;
        generate();
      }
      break;
    case 'back':
      state.step = 'prompt';
      state.mode = 'ai';
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
      Object.assign(state, { step: 'prompt', mode: 'ai', prompt: '', format: null, result: null, editing: false });
      renderCreate();
      break;
    case 'open': {
      const found = history.find((p) => p.id === btn.dataset.id);
      if (!found) return;
      const result = normalizePost(found);
      Object.assign(state, {
        step: 'result',
        mode: result.prompt ? 'ai' : 'manual',
        prompt: result.prompt || '',
        format: result.format,
        result,
        editing: false,
      });
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
      rerenderResult();
      break;
    case 'done-edit':
      state.editing = false;
      saveToHistory(post);
      toast('Cambios guardados');
      rerenderResult();
      break;
    case 'add-item':
      post.card.items.push({ title: '', description: '' });
      rerenderResult();
      break;
    case 'remove-item':
      post.card.items.splice(Number(btn.dataset.index), 1);
      rerenderResult();
      break;
    case 'add-slide':
      post.slides.push({ tag: '', title: '', titleAccent: '', summary: '', visual: emptyVisual() });
      rerenderResult();
      break;
    case 'remove-slide':
      post.slides.splice(Number(btn.dataset.index), 1);
      rerenderResult();
      break;
    case 'png':
    case 'pdf': {
      btn.disabled = true;
      try {
        const name = slug(post.title);
        const preview = $('#gen-preview');
        if (action === 'png') await downloadPngs(preview, name);
        else await downloadPdf(preview, name);
      } catch (err) {
        console.error(err);
        toast('No se pudo exportar la gráfica');
      }
      btn.disabled = false;
      break;
    }
  }
}

function handleInput(e) {
  const el = e.target;
  const post = state.result;
  if (!post) return;
  if (el.dataset.field) {
    setPath(post, el.dataset.field, el.value);
    const warn = document.querySelector(`[data-warn="${CSS.escape(el.dataset.field)}"]`);
    if (warn) warn.hidden = !blackbirdIssues(el.value);
    // Cambiar el tipo de gráfico o el color de portada cambia los campos del formulario.
    if (el.tagName === 'SELECT') {
      rerenderResult();
      return;
    }
  } else if (el.dataset.hashtags !== undefined) {
    post.hashtags = el.value.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`));
  } else if (el.dataset.visualLines !== undefined) {
    post.slides[Number(el.dataset.visualLines)].visual.items = parseVisualLines(el.value);
  } else {
    return;
  }
  schedulePreview();
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
    state.mode = 'ai';
    state.step = 'format';
    renderCreate();
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'create-prompt' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  root.addEventListener('input', handleInput);
  window.addEventListener('resize', () => fitVisuals(root));
}
