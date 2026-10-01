// Página "Crear post". Tres caminos:
// - Pedir a Claude: describes el post, eliges formato y /api/generate devuelve texto y gráfica.
// - Pegar mi texto: pegas un post ya escrito y Posty reparte el texto en la gráfica (sin IA).
// - Desde cero: eliges formato y rellenas el texto y la gráfica a mano.
// La gráfica se dibuja con el design system jpdazab y se edita con vista previa en vivo.

import { composePost, linkedInShareUrl, LINKEDIN_MAX_CHARS } from './parser.js';
import { $, esc, toast, copy, linkedinIcon } from './ui.js';
import { postFromText, analyzeText, clip } from './autolayout.js';
import { builtinPost, customPost, BUILTIN_TEMPLATES } from './templates.js';
import { getKit, getCustomTemplate, setTemplateContent } from './kit.js';
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

const FORMAT_LABELS = { carousel: 'Carrusel', card: 'Card', slide: 'Card única (carrusel)', custom: 'Plantilla propia' };
const TONE_LABELS = { blue: 'Azul', ink: 'Negro', grey: 'Gris', yellow: 'Amarillo' };
const VISUAL_LABELS = { none: 'Sin gráfico', stats: 'Cifras', bars: 'Barras', venn: 'Venn', image: 'Imagen' };

const MODES = {
  ai: {
    label: 'Pedir a Claude',
    placeholder: 'Cuéntale a Claude de qué quieres hablar: una idea, una anécdota, una charla, un dato…',
    submit: 'Generar con Claude →',
    user: (s) => esc(s.prompt),
  },
  paste: {
    label: 'Pegar mi texto',
    placeholder: 'Pega aquí el texto de tu post. Posty usará la primera línea como titular, las listas y cifras para la gráfica y la pregunta final para cerrar.',
    submit: 'Crear diseño →',
    user: (s) => `<span class="muted small">Texto pegado</span><br>${esc(s.prompt.length > 220 ? `${s.prompt.slice(0, 220)}…` : s.prompt)}`,
  },
  manual: { label: 'Desde cero', submit: 'Elegir formato →', user: () => 'Quiero escribirlo desde cero' },
};

const SUGGESTIONS = [
  'Lo que aprendí liderando un equipo de diseño en una scale-up',
  'Por qué los design systems necesitan un owner con criterio de producto',
  'Mi opinión sobre los diseñadores que programan con IA',
];

const state = {
  step: 'prompt', // prompt → format → loading → result | error
  mode: 'ai', // ai | paste | manual
  prompt: '',
  format: null,
  result: null,
  error: null,
  editing: false,
  snapshot: null, // copia del post al entrar a editar, para "Volver sin guardar"
  isNew: false, // post todavía no guardado (pegado o desde cero)
  templateEdit: null, // id de plantilla integrada cuyo contenido por defecto se está editando
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
    return true;
  } catch {
    return false;
  }
}

let history = readStorage(HISTORY_KEY, []);

function persistHistory() {
  if (!writeStorage(HISTORY_KEY, history)) {
    toast('No hay espacio en el navegador: borra posts antiguos o usa imágenes más ligeras');
  }
}

function saveToHistory(post) {
  history = [post, ...history.filter((p) => p.id !== post.id)].slice(0, MAX_HISTORY);
  persistHistory();
}

function deleteFromHistory(id) {
  history = history.filter((p) => p.id !== id);
  persistHistory();
}

// ---------- Utilidades ----------

const clone = (value) => JSON.parse(JSON.stringify(value));

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

function newMeta(extra = {}) {
  return { id: `post-${Date.now()}`, createdAt: new Date().toISOString(), prompt: '', ...extra };
}

// Post nuevo "desde cero": parte del contenido de la plantilla (editable en Diseños).
const DEFAULT_TEMPLATE = { card: 'card-list', slide: 'slide-text', carousel: 'carousel' };

function blankPost(format, templateId) {
  const sample = format === 'custom' ? customPost(templateId) : builtinPost(DEFAULT_TEMPLATE[format]);
  return normalizePost({ ...sample, ...newMeta(), title: sample.title || 'Nuevo post' });
}

// Texto pegado → capas de una plantilla propia: la primera capa recibe el gancho y la segunda el resto.
function customFromText(text, templateId) {
  const post = customPost(templateId);
  const a = analyzeText(text);
  const [first, second] = getCustomTemplate(templateId).layers;
  if (first) post.fields[first.id] = clip(a.hook, 90);
  if (second) post.fields[second.id] = clip(a.restSentences.slice(0, 2).join(' '), 200);
  return normalizePost({ ...post, ...newMeta(), text: a.text, hashtags: a.hashtags, title: clip(a.hook, 50) });
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

// Reduce la imagen (máx. 1400 px de ancho) y la guarda como JPEG para no llenar el navegador.
function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1400 / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

// ---------- Render ----------

function bubble(role, content) {
  return `<div class="msg msg-${role}">${role === 'assistant' ? '<span class="msg-avatar" aria-hidden="true">✳</span>' : ''}<div class="msg-content">${content}</div></div>`;
}

function renderComposer() {
  const mode = MODES[state.mode];
  return `
    <div class="mode-switch" role="tablist" aria-label="Cómo quieres crear el post">
      ${Object.entries(MODES)
        .map(([key, m]) => `<button role="tab" class="chip ${state.mode === key ? 'active' : ''}" aria-selected="${state.mode === key}" data-create-action="mode" data-mode="${key}">${m.label}</button>`)
        .join('')}
    </div>
    <form class="composer" id="create-form">
      ${
        state.mode === 'manual'
          ? '<p class="composer-note">Elige el formato y rellena el texto y la gráfica en el editor, con vista previa en vivo.</p>'
          : `<label for="create-prompt" class="sr-only">${esc(mode.label)}</label>
             <textarea id="create-prompt" rows="${state.mode === 'paste' ? 9 : 4}" placeholder="${esc(mode.placeholder)}">${esc(state.prompt)}</textarea>`
      }
      <div class="composer-foot">
        <span class="muted small">${state.mode === 'ai' ? 'Enter para enviar · Shift+Enter para salto de línea' : state.mode === 'paste' ? 'Sin IA: después puedes ajustar todo en el editor.' : ''}</span>
        <button class="btn primary" type="submit">${mode.submit}</button>
      </div>
    </form>
    ${
      state.mode === 'ai'
        ? `<div class="suggestions">${SUGGESTIONS.map((s) => `<button class="chip" type="button" data-create-action="suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>`
        : ''
    }`;
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
       <button class="format-option" data-create-action="format" data-format="slide">
         <span class="format-thumb thumb-slide" aria-hidden="true"><i></i></span>
         <strong>Card única</strong>
         <span>Una sola slide del carrusel: portada, cifras o imagen</span>
       </button>
       <button class="format-option" data-create-action="format" data-format="card">
         <span class="format-thumb thumb-card" aria-hidden="true"><i></i></span>
         <strong>Card con lista</strong>
         <span>Titular y lista numerada</span>
       </button>
       ${getKit()
         .customTemplates.map(
           (t) => `<button class="format-option" data-create-action="format" data-format="custom" data-template="${esc(t.id)}">
             <span class="format-thumb thumb-custom" aria-hidden="true"><i style="background:${esc(t.background)}"></i></span>
             <strong>${esc(t.name)}</strong>
             <span>Plantilla propia</span>
           </button>`,
         )
         .join('')}
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

function select(label, path, options) {
  const value = getPath(state.result, path);
  return `
    <label class="ed-field"><span>${esc(label)}</span>
      <select data-field="${path}">${Object.entries(options)
        .map(([k, l]) => `<option value="${k}" ${value === k ? 'selected' : ''}>${esc(l)}</option>`)
        .join('')}</select>
    </label>`;
}

function coverFields(prefix) {
  const cover = getPath(state.result, prefix);
  return `
    ${select('Color', `${prefix}.tone`, Object.fromEntries(COVER_TONES.map((t) => [t, TONE_LABELS[t]])))}
    ${field('Etiqueta', `${prefix}.tag`, { blackbird: true })}
    ${field('Titular', `${prefix}.title`, { blackbird: true, multiline: true, hint: 'Máximo tres líneas.' })}
    ${field('Palabra subrayada', `${prefix}.underline`, { hint: 'Opcional: una palabra del titular.' })}
    ${cover.tone === 'yellow' ? '' : field('Resumen', `${prefix}.summary`, { multiline: true })}`;
}

function slideFields(prefix, dataIndex) {
  const slide = getPath(state.result, prefix);
  const v = slide.visual;
  return `
    ${field('Etiqueta', `${prefix}.tag`, { blackbird: true })}
    ${field('Título, línea 1', `${prefix}.title`, { blackbird: true })}
    ${field('Título, línea 2 (azul)', `${prefix}.titleAccent`, { blackbird: true })}
    ${field('Resumen', `${prefix}.summary`, { multiline: true, hint: 'Máximo tres líneas.' })}
    ${select('Gráfico', `${prefix}.visual.kind`, VISUAL_LABELS)}
    ${
      v.kind === 'stats' || v.kind === 'bars'
        ? `<label class="ed-field"><span>${v.kind === 'stats' ? 'Cifras' : 'Barras'} <em class="bb">una por línea</em></span>
             <textarea data-visual-lines="${prefix}" rows="3" placeholder="${v.kind === 'stats' ? '48% | equipos con IA' : '72 | Research'}">${esc(visualLines(v.items))}</textarea>
             <small class="muted">${v.kind === 'stats' ? 'Valor | etiqueta (la etiqueta va en Blackbird).' : 'Valor de 0 a 100 | etiqueta.'}</small>
           </label>`
        : ''
    }
    ${
      v.kind === 'venn'
        ? `${field('Círculo izquierdo', `${prefix}.visual.left`, { blackbird: true })}${field('Cruce', `${prefix}.visual.overlap`, { blackbird: true })}${field('Círculo derecho', `${prefix}.visual.right`, { blackbird: true })}`
        : ''
    }
    ${
      v.kind === 'image'
        ? `<label class="ed-field"><span>Imagen</span>
             <input type="file" accept="image/*" data-image="${prefix}" data-index="${dataIndex ?? ''}" />
             <small class="muted">${v.src ? 'Imagen cargada. Elige otra para reemplazarla.' : 'Se recorta para llenar el hueco de 991 × 637.'}</small>
           </label>
           ${field('Descripción de la imagen', `${prefix}.visual.alt`, { hint: 'Texto alternativo, para accesibilidad.' })}`
        : ''
    }`;
}

function renderGraphicEditor(post) {
  if (post.format === 'custom') {
    const tpl = getCustomTemplate(post.templateId);
    if (!tpl) return '<p class="error-text">La plantilla de este post se borró en Diseños.</p>';
    return `
      <fieldset class="ed-group">
        <legend>${esc(tpl.name)}</legend>
        ${tpl.layers
          .map(
            (l) => `<label class="ed-field"><span>${esc(l.name)}</span><textarea data-field="fields.${esc(l.id)}" rows="2">${esc(post.fields[l.id] ?? '')}</textarea></label>`,
          )
          .join('')}
      </fieldset>`;
  }
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

  if (post.format === 'slide') {
    return `
      <fieldset class="ed-group">
        <legend>Card única</legend>
        ${select('Estilo', 'style', { slide: 'Slide (título, resumen y gráfico o imagen)', cover: 'Portada (titular grande a color)' })}
        ${post.style === 'cover' ? coverFields('cover') : slideFields('slide')}
      </fieldset>`;
  }

  return `
    <fieldset class="ed-group">
      <legend>Portada</legend>
      ${coverFields('cover')}
    </fieldset>
    ${post.slides
      .map(
        (_, i) => `
      <fieldset class="ed-group">
        <legend>Slide ${i + 2}</legend>
        <div class="ed-item-head"><span></span><button class="link danger" data-create-action="remove-slide" data-index="${i}">Quitar slide</button></div>
        ${slideFields(`slides.${i}`, i)}
      </fieldset>`,
      )
      .join('')}
    ${post.slides.length < 8 ? '<button class="btn ghost small" data-create-action="add-slide">+ Añadir slide</button>' : ''}`;
}

function renderEditor(post, { template = false } = {}) {
  // Al editar una plantilla solo importa la gráfica; el texto del post se escribe al usarla.
  const textGroup = template
    ? ''
    : `<fieldset class="ed-group">
        <legend>Texto del post</legend>
        ${field('Título interno', 'title')}
        <label class="ed-field"><span>Texto para LinkedIn</span><textarea data-field="text" rows="8">${esc(post.text)}</textarea></label>
        <label class="ed-field"><span>Hashtags</span><input type="text" data-hashtags value="${esc(post.hashtags.join(' '))}" placeholder="#ProductDesign #UX" /></label>
      </fieldset>`;
  return `<div class="editor-panel">${textGroup}${renderGraphicEditor(post)}</div>`;
}

function renderPreview(post) {
  const count = post.format === 'carousel' ? 1 + post.slides.length : 1;
  const frames = Array.from({ length: count }, () => frameHtml(post));
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
        <div class="edit-bar">
          <button class="btn ghost small" data-create-action="cancel-edit">← Volver sin guardar</button>
          <strong>${state.templateEdit ? `Plantilla: ${esc(BUILTIN_TEMPLATES.find((t) => t.id === state.templateEdit)?.name || '')}` : `Editar ${FORMAT_LABELS[post.format].toLowerCase()}`}</strong>
          <button class="btn primary small" data-create-action="done-edit">${state.templateEdit ? 'Guardar plantilla' : 'Guardar'}</button>
        </div>
        ${state.templateEdit ? '<p class="muted small template-note">Este es el contenido con el que empieza la plantilla al usarla en Crear post o al empezar desde cero.</p>' : ''}
        <div class="edit-layout">${renderEditor(post, { template: Boolean(state.templateEdit) })}<div class="edit-preview">${preview}</div></div>
      </article>`;
  }

  const canRegenerate = state.mode === 'ai' && state.prompt;
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
          <button class="btn ghost danger" data-create-action="delete" data-id="${esc(post.id)}">Borrar</button>
        </div>
      </div>
    </article>
    <div class="gen-next">
      ${canRegenerate ? '<button class="btn ghost" data-create-action="regenerate">↻ Generar otra versión</button>' : ''}
      ${['carousel', 'card', 'slide']
        .filter((f) => f !== post.format)
        .map((f) => `<button class="btn ghost" data-create-action="switch-format" data-format="${f}">Probar como ${FORMAT_LABELS[f].toLowerCase()}</button>`)
        .join('')}
      <button class="btn ghost" data-create-action="new">+ Nuevo post</button>
    </div>`;
}

function renderConversation() {
  if (state.step === 'prompt') return renderComposer();
  const parts = [bubble('user', `<p>${MODES[state.mode].user(state)}</p>`)];

  if (state.step === 'format') {
    parts.push(renderFormatQuestion());
    parts.push(`<div class="gen-next"><button class="btn ghost" data-create-action="back">← Volver</button></div>`);
    return parts.join('');
  }

  parts.push(bubble('assistant', `<p>¿Cómo quieres que sea el post?</p>`));
  parts.push(bubble('user', `<p>${FORMAT_LABELS[state.format]}</p>`));

  if (state.step === 'loading') {
    parts.push(bubble('assistant', `<p class="typing"><span></span><span></span><span></span> Escribiendo tu post… suele tardar entre 20 y 60 segundos.</p>`));
  } else if (state.step === 'error') {
    parts.push(
      bubble(
        'assistant',
        `<p class="error-text">${esc(state.error)}</p>
         ${state.needsCode ? renderCodeForm() : ''}
         <div class="actions start">
           <button class="btn primary" data-create-action="retry">Reintentar</button>
           <button class="btn ghost" data-create-action="paste-from-error">Usar mi texto sin IA</button>
           <button class="btn ghost" data-create-action="back">Cambiar la petición</button>
         </div>`,
      ),
    );
  } else if (state.step === 'result') {
    const intro = {
      ai: 'Aquí lo tienes. Puedes editar el texto y la gráfica, descargarla y publicarlo.',
      paste: 'He repartido tu texto en la gráfica. Revisa los campos: la vista previa se actualiza mientras escribes.',
      manual: 'Rellena el texto y la gráfica. La vista previa se actualiza mientras escribes.',
    }[state.mode];
    parts.push(bubble('assistant', `<p>${intro}</p>`));
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
        <li class="history-row">
          <button class="history-item" data-create-action="open" data-id="${esc(p.id)}">
            <span class="badge badge-pendiente">${FORMAT_LABELS[p.format] || p.format}</span>
            <span class="history-title">${esc(p.title || 'Sin título')}</span>
            <span class="muted small">${esc(new Date(p.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }))}</span>
          </button>
          <button class="icon-btn" data-create-action="delete" data-id="${esc(p.id)}" aria-label="Borrar ${esc(p.title || 'post')}" title="Borrar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
      <p class="muted">Pide un post a Claude, pega tu texto o empieza desde cero. La gráfica sale con tu design system, lista para LinkedIn.</p>
    </header>
    <section class="conversation" aria-live="polite">${renderConversation()}</section>
    ${state.step === 'prompt' ? renderHistory() : ''}`;
  mountPreview();
  if (state.step === 'prompt') $('#create-prompt')?.focus();
}

let previewTimer;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(mountPreview, 120);
}

// ---------- Acciones ----------

function showResult(post, { editing = false, isNew = false } = {}) {
  state.result = post;
  state.format = post.format;
  state.step = 'result';
  state.editing = editing;
  state.isNew = isNew;
  state.snapshot = editing ? clone(post) : null;
  renderCreate();
}

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
        data.error ||
          (res.status === 404 ? 'El generador con Claude solo funciona con la web desplegada en Vercel y una API key configurada.' : 'No se pudo generar el post.'),
      );
    }
    const post = normalizePost({ ...data, ...newMeta({ prompt: state.prompt }) });
    saveToHistory(post);
    showResult(post);
  } catch (err) {
    state.error = err.message === 'Failed to fetch' ? 'No hay conexión con el servidor.' : err.message;
    state.step = 'error';
    renderCreate();
  }
}

// Crea el post del formato elegido según el modo (pegar texto o desde cero).
function createLocal(format, templateId) {
  state.format = format;
  if (format === 'custom') {
    const post = state.mode === 'paste' ? customFromText(state.prompt, templateId) : blankPost('custom', templateId);
    showResult(post, { editing: true, isNew: true });
  } else if (state.mode === 'paste') {
    showResult(normalizePost({ ...postFromText(state.prompt, format), ...newMeta() }), { editing: true, isNew: true });
  } else {
    showResult(blankPost(format), { editing: true, isNew: true });
  }
}

// Desde Diseños: crear un post a partir de una plantilla.
export function startFromTemplate(post) {
  Object.assign(state, { mode: 'manual', prompt: '', templateEdit: null });
  showResult(normalizePost({ ...post, ...newMeta() }), { editing: true, isNew: true });
}

// Desde Diseños: editar el contenido por defecto de una plantilla integrada.
export function editTemplate(id) {
  Object.assign(state, { mode: 'manual', prompt: '', templateEdit: id });
  showResult(normalizePost(builtinPost(id)), { editing: true, isNew: false });
}

function resetToStart() {
  Object.assign(state, { step: 'prompt', prompt: '', format: null, result: null, editing: false, snapshot: null, isNew: false });
  renderCreate();
}

async function handle(btn) {
  const action = btn.dataset.createAction;
  const post = state.result;
  switch (action) {
    case 'mode':
      state.mode = btn.dataset.mode;
      renderCreate();
      break;
    case 'suggest':
      $('#create-prompt').value = btn.dataset.text;
      $('#create-prompt').focus();
      break;
    case 'paste-from-error':
      state.mode = 'paste';
      createLocal(state.format);
      break;
    case 'format':
      if (state.mode === 'ai' && btn.dataset.format !== 'custom') {
        state.format = btn.dataset.format;
        generate();
      } else {
        // Las plantillas propias no pasan por Claude: con un pedido a Claude se usa como texto pegado.
        if (state.mode === 'ai') state.mode = 'paste';
        createLocal(btn.dataset.format, btn.dataset.template);
      }
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
    case 'switch-format': {
      const format = btn.dataset.format;
      if (state.mode === 'ai' && state.prompt) {
        state.format = format;
        generate();
      } else {
        // Sin IA: rehace la gráfica a partir del texto del post en el nuevo formato.
        const next = normalizePost({ ...postFromText(post.text + (post.hashtags.length ? `\n\n${post.hashtags.join(' ')}` : ''), format), ...newMeta(), title: post.title });
        state.mode = 'paste';
        state.prompt = post.text;
        showResult(next, { editing: true, isNew: true });
      }
      break;
    }
    case 'new':
      resetToStart();
      break;
    case 'open': {
      const found = history.find((p) => p.id === btn.dataset.id);
      if (!found) return;
      const result = normalizePost(found);
      state.mode = result.prompt ? 'ai' : 'manual';
      state.prompt = result.prompt || '';
      showResult(result);
      break;
    }
    case 'delete': {
      const target = history.find((p) => p.id === btn.dataset.id);
      if (!target || !window.confirm(`¿Borrar "${target.title || 'este post'}"? No se puede deshacer.`)) return;
      deleteFromHistory(target.id);
      toast('Post borrado');
      if (state.result?.id === target.id) resetToStart();
      else renderCreate();
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
      state.snapshot = clone(post);
      renderCreate();
      break;
    case 'cancel-edit':
      if (state.templateEdit) {
        state.templateEdit = null;
        resetToStart();
        location.hash = '#/disenos';
      } else if (state.isNew) {
        // Nunca se guardó: volver al inicio sin dejar rastro.
        state.step = 'prompt';
        state.result = null;
        state.editing = false;
        renderCreate();
      } else {
        state.result = state.snapshot;
        state.editing = false;
        renderCreate();
        toast('Cambios descartados');
      }
      break;
    case 'done-edit':
      if (state.templateEdit) {
        const { id, createdAt, prompt, templateId, ...content } = post;
        setTemplateContent(state.templateEdit, content);
        toast('Plantilla guardada');
        state.templateEdit = null;
        resetToStart();
        location.hash = '#/disenos';
        break;
      }
      state.editing = false;
      state.isNew = false;
      saveToHistory(post);
      toast('Cambios guardados');
      renderCreate();
      break;
    case 'add-item':
      post.card.items.push({ title: '', description: '' });
      renderCreate();
      break;
    case 'remove-item':
      post.card.items.splice(Number(btn.dataset.index), 1);
      renderCreate();
      break;
    case 'add-slide':
      post.slides.push({ tag: '', title: '', titleAccent: '', summary: '', visual: emptyVisual() });
      renderCreate();
      break;
    case 'remove-slide':
      post.slides.splice(Number(btn.dataset.index), 1);
      renderCreate();
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
  if (!post || el.type === 'file') return;
  if (el.dataset.field) {
    setPath(post, el.dataset.field, el.value);
    const warn = document.querySelector(`[data-warn="${CSS.escape(el.dataset.field)}"]`);
    if (warn) warn.hidden = !blackbirdIssues(el.value);
    // Cambiar un selector (estilo, color, tipo de gráfico) cambia los campos del formulario.
    if (el.tagName === 'SELECT') {
      renderCreate();
      return;
    }
  } else if (el.dataset.hashtags !== undefined) {
    post.hashtags = el.value.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`));
  } else if (el.dataset.visualLines !== undefined) {
    getPath(post, el.dataset.visualLines).visual.items = parseVisualLines(el.value);
  } else {
    return;
  }
  schedulePreview();
}

async function handleImage(e) {
  const el = e.target;
  if (el.type !== 'file' || !el.dataset.image || !el.files[0]) return;
  try {
    getPath(state.result, el.dataset.image).visual.src = await readImage(el.files[0]);
    renderCreate();
  } catch (err) {
    toast(err.message);
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
    if (state.mode !== 'manual') {
      const text = $('#create-prompt').value.trim();
      if (!text) {
        toast(state.mode === 'paste' ? 'Pega primero el texto de tu post' : 'Escribe primero de qué quieres hablar');
        return;
      }
      state.prompt = text;
    }
    state.step = 'format';
    renderCreate();
  });
  root.addEventListener('keydown', (e) => {
    if (state.mode === 'ai' && e.target.id === 'create-prompt' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  });
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleImage);
  window.addEventListener('resize', () => fitVisuals(root));
}
