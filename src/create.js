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
import { textLayers, postLayers, isText } from './layer-style.js';
import { CHART_TYPES } from './charts.js';
import { generateAiImage, hasOpenAiKey, suggestPrompt } from './ai-image.js';
import { getBackend } from './backend.js';
import { closeCreate } from './main.js';
import { fillCss } from './fills.js';
import {
  normalizePost,
  emptyVisual,
  mountPages,
  unmountPages,
  frameHtml,
  fitVisuals,
  downloadPngs,
  copyPng,
  downloadPdf,
  blackbirdIssues,
  COVER_TONES,
} from './visuals.js';

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
    user: (s) => `<span class="muted small">${s.seedTitle ? `Propuesta del AI Digest · ${esc(s.seedTitle)}` : 'Texto pegado'}</span><br>${esc(s.prompt.length > 220 ? `${s.prompt.slice(0, 220)}…` : s.prompt)}`,
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
  templateId: null, // plantilla propia elegida
  result: null,
  error: null,
  editing: false,
  snapshot: null, // copia del post al entrar a editar, para "Volver sin guardar"
  isNew: false, // post todavía no guardado (pegado o desde cero)
  templateEdit: null, // id de plantilla integrada cuyo contenido por defecto se está editando
  needsCode: false,
  fullscreen: false, // post a la vista: pantalla completa con el texto a la izquierda y el diseño a la derecha
  aiImage: null, // { target: 'layer:<id>' | 'visual:<ruta>', ratio, prompt, quality, loading, error }
  seedTitle: '', // título de la propuesta del AI Digest que se está diseñando
  publishHelp: false, // guía «Terminar en LinkedIn» tras pulsar Publicar
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

// Posts creados: en la cuenta (Supabase) o en el navegador en modo local.
let history = [];

export async function initCreateData() {
  history = (await getBackend().listCreated()) || [];
}

// Al volver a la pestaña (por ejemplo, tras crear un post desde Claude) se recarga la lista.
export async function refreshCreated() {
  history = (await getBackend().listCreated()) || [];
  if (state.step === 'prompt' && !document.querySelector('#create-root')?.hidden) renderCreate();
}

function storageError(err) {
  console.error(err);
  toast(getBackend().mode === 'local' ? 'No hay espacio en el navegador: borra posts antiguos o usa imágenes más ligeras' : 'No se pudo guardar. Revisa tu conexión.');
}

function saveToHistory(post) {
  history = [post, ...history.filter((p) => p.id !== post.id)].slice(0, MAX_HISTORY);
  getBackend().saveCreated(post, history).catch(storageError);
}

function deleteFromHistory(id) {
  history = history.filter((p) => p.id !== id);
  getBackend().deleteCreated(id, history).catch(storageError);
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
  const [first, second] = textLayers(getCustomTemplate(templateId));
  if (first) post.fields[first.id] = clip(a.hook, 90);
  if (second) post.fields[second.id] = clip(a.restSentences.slice(0, 2).join(' '), 200);
  return normalizePost({ ...post, ...newMeta(), text: a.text, hashtags: a.hashtags, title: clip(a.hook, 50) });
}

// Post de Claude (formato card) → capas de una plantilla propia: titular y lead (o el texto).
function customFromGenerated(data, templateId, prompt) {
  const post = customPost(templateId);
  const a = analyzeText(data.text || '');
  const [first, second] = textLayers(getCustomTemplate(templateId));
  if (first) post.fields[first.id] = data.card?.headline || clip(a.hook, 90);
  if (second) post.fields[second.id] = data.card?.lead || clip(a.restSentences.slice(0, 2).join(' '), 200);
  return normalizePost({ ...post, ...newMeta({ prompt }), text: data.text || '', hashtags: data.hashtags || [], title: data.title || clip(a.hook, 50) });
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

function formatLabel() {
  if (state.format === 'custom') return getCustomTemplate(state.templateId)?.name || FORMAT_LABELS.custom;
  return FORMAT_LABELS[state.format];
}

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
  const kit = getKit();
  if (!kit.builtins && !kit.customTemplates.length) {
    return bubble(
      'assistant',
      `<p>Aún no tienes plantillas. Crea la primera en Templates con tus colores y tipografías y vuelve aquí para usarla.</p>
       <div class="actions start"><button class="btn primary" data-create-action="go-designs">Crear una plantilla</button></div>`,
    );
  }
  return bubble(
    'assistant',
    `<p>¿${kit.builtins ? 'Cómo quieres que sea el post' : 'Con qué plantilla'}?</p>
     <div class="format-options">
       ${kit.builtins ? `<button class="format-option" data-create-action="format" data-format="carousel">
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
       </button>` : ''}
       ${getKit()
         .customTemplates.map(
           (t) => `<button class="format-option" data-create-action="format" data-format="custom" data-template="${esc(t.id)}">
             <span class="format-thumb thumb-custom" aria-hidden="true"><i style="${esc(fillCss(t.background, t.fill, 0.1))}"></i></span>
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
           <div class="ed-field">${aiImageControls(`visual:${prefix}`, (991 / 637).toFixed(3))}</div>
           ${field('Descripción de la imagen', `${prefix}.visual.alt`, { hint: 'Texto alternativo, para accesibilidad.' })}`
        : ''
    }`;
}

// Botón y panel "Generar con ChatGPT" de un hueco de imagen (ratio = ancho / alto del hueco).
function aiImageControls(target, ratio) {
  const ai = state.aiImage;
  if (ai?.target !== target) {
    return `<button class="btn ghost small" data-create-action="ai-image-open" data-target="${esc(target)}" data-ratio="${ratio}">✨ Generar con ChatGPT</button>`;
  }
  if (!hasOpenAiKey()) {
    return `<div class="ai-panel"><p class="small">Para generar imágenes con ChatGPT, añade tu clave de API de OpenAI en <a href="#/cuenta">Cuenta → Imágenes con ChatGPT</a>.</p>
      <div class="actions start"><button class="btn ghost small" data-create-action="ai-image-cancel">Cerrar</button></div></div>`;
  }
  return `<div class="ai-panel">
    <label class="ed-field"><span>Qué imagen quieres</span><textarea data-ai-prompt rows="4" ${ai.loading ? 'disabled' : ''}>${esc(ai.prompt)}</textarea></label>
    <div class="ai-row">
      <label class="ed-field"><span>Calidad</span><select data-ai-quality ${ai.loading ? 'disabled' : ''}>
        ${[['low', 'Rápida'], ['medium', 'Normal'], ['high', 'Alta (más lenta)']].map(([v, l]) => `<option value="${v}" ${ai.quality === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <button class="btn primary small" data-create-action="ai-image-run" ${ai.loading ? 'disabled' : ''}>${ai.loading ? 'Generando… (hasta 1 min)' : 'Generar imagen'}</button>
      ${ai.loading ? '' : '<button class="btn ghost small" data-create-action="ai-image-cancel">Cancelar</button>'}
    </div>
    ${ai.error ? `<p class="error-text">${esc(ai.error)}</p>` : '<p class="muted small">Se cobra en tu cuenta de OpenAI. La imagen se recorta para llenar el hueco.</p>'}
  </div>`;
}

function renderGraphicEditor(post) {
  if (post.format === 'custom') {
    const tpl = getCustomTemplate(post.templateId);
    if (!tpl) return '<p class="error-text">La plantilla de este post se borró en Templates.</p>';
    return `
      <fieldset class="ed-group">
        <legend>${esc(tpl.name)}</legend>
        ${postLayers(tpl)
          .map((l) => {
            if (isText(l)) return `<label class="ed-field"><span>${esc(l.name)}</span><textarea data-field="fields.${esc(l.id)}" rows="2">${esc(post.fields[l.id] ?? '')}</textarea></label>`;
            if (l.kind === 'image') {
              const chosen = Boolean(post.images?.[l.id]);
              return `<div class="ed-field"><span>${esc(l.name || 'Imagen')}</span>
                <div class="actions start">
                  <label class="btn ghost small">${chosen || l.assetId ? 'Cambiar imagen' : 'Elegir imagen'}<input type="file" accept="image/*" data-post-image="${esc(l.id)}" hidden /></label>
                  ${state.aiImage?.target === `layer:${l.id}` ? '' : aiImageControls(`layer:${l.id}`, (l.w / (l.h || l.w)).toFixed(3))}
                  ${chosen ? `<button class="link danger" data-create-action="clear-image" data-layer="${esc(l.id)}">${l.assetId ? 'Volver a la de la plantilla' : 'Quitar'}</button>` : ''}
                </div>
                ${state.aiImage?.target === `layer:${l.id}` ? aiImageControls(`layer:${l.id}`, l.w / (l.h || l.w)) : ''}
                <small class="muted">${chosen ? 'Imagen elegida para este post.' : l.assetId ? 'Ahora se usa la imagen de la plantilla.' : 'Sin imagen: el hueco no sale en el PNG.'}</small></div>`;
            }
            return `<label class="ed-field"><span>${esc(l.name || 'Gráfica')} <em class="bb">${esc(CHART_TYPES[l.chart] || 'Gráfica')}</em></span>
              <textarea data-field="charts.${esc(l.id)}" rows="4" placeholder="48% | Research">${esc(post.charts?.[l.id] ?? l.data ?? '')}</textarea>
              <small class="muted">Una línea por dato: valor | etiqueta (por ejemplo, "48% | Research").</small></label>`;
          })
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
          ${post.format === 'carousel' ? '' : '<button class="btn ghost" data-create-action="copy-image">Copiar imagen</button>'}
          <button class="btn ghost" data-create-action="png">⬇ ${post.format === 'carousel' ? 'PNGs' : 'PNG'}</button>
          ${post.format === 'carousel' ? '<button class="btn ghost" data-create-action="pdf">⬇ PDF</button>' : ''}
          <button class="btn ghost danger" data-create-action="delete" data-id="${esc(post.id)}">Borrar</button>
        </div>
      </div>
    </article>
    <div class="gen-next">
      ${canRegenerate ? '<button class="btn ghost" data-create-action="regenerate">↻ Generar otra versión</button>' : ''}
      ${(getKit().builtins ? ['carousel', 'card', 'slide'] : [])
        .filter((f) => f !== post.format)
        .map((f) => `<button class="btn ghost" data-create-action="switch-format" data-format="${f}">Probar como ${FORMAT_LABELS[f].toLowerCase()}</button>`)
        .join('')}
      <button class="btn ghost" data-create-action="new">+ Nuevo post</button>
    </div>`;
}

// Post ya creado a pantalla completa: texto a la izquierda y diseño a la derecha.
// "Editar" cambia la columna izquierda por el editor; la derecha sigue siendo la vista previa en vivo.
function publishHelp(post) {
  const carousel = post.format === 'carousel';
  return `<div class="publish-help" role="status">
    <button class="link publish-help-close" data-create-action="close-help" aria-label="Cerrar">✕</button>
    <strong>Terminar en LinkedIn</strong>
    <ol>
      <li>El texto ya está en LinkedIn (si no aparece, pégalo: está copiado).</li>
      ${
        carousel
          ? '<li>Descarga el <button class="link" data-create-action="pdf">PDF del carrusel</button> y en LinkedIn súbelo con <em>Añadir documento</em>.</li>'
          : '<li><button class="btn primary small" data-create-action="copy-image">Copiar imagen</button> y pégala en el mismo post con <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>.</li>'
      }
    </ol>
  </div>`;
}

function renderFullscreen(post) {
  const text = finalText(post);
  const over = text.length > LINKEDIN_MAX_CHARS;
  const editing = state.editing;
  const created = post.createdAt ? new Date(post.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const template = Boolean(state.templateEdit);
  const title = template ? `Plantilla: ${BUILTIN_TEMPLATES.find((t) => t.id === state.templateEdit)?.name || ''}` : post.title || (state.isNew ? 'Nuevo post' : 'Sin título');
  const canRegenerate = state.mode === 'ai' && state.prompt;
  const switches = getKit().builtins ? ['carousel', 'card', 'slide'].filter((f) => f !== post.format && post.format !== 'custom') : [];
  return `
    <div class="post-modal" role="dialog" aria-modal="true" aria-label="${esc(post.title || 'Post')}">
      <header class="pm-bar">
        <button class="btn ghost small" data-create-action="${editing ? 'cancel-edit' : 'close-full'}">← ${editing ? 'Volver sin guardar' : 'Volver'}</button>
        <div class="pm-title"><strong>${esc(title)}</strong><span class="badge badge-aprobado">${esc(FORMAT_LABELS[post.format] || '')}</span>${state.isNew && !template ? '<span class="badge badge-pendiente">Sin guardar</span>' : ''}</div>
        <div class="actions">
          ${
            editing
              ? `<button class="btn primary small" data-create-action="done-edit">${template ? 'Guardar plantilla' : 'Guardar'}</button>`
              : `<button class="btn primary small" data-create-action="publish">${linkedinIcon()} Publicar</button>
                 <button class="btn ghost small" data-create-action="copy">Copiar texto</button>
                 <button class="btn ghost small" data-create-action="edit">Editar</button>
                 ${post.format === 'carousel' ? '' : '<button class="btn ghost small" data-create-action="copy-image" title="Para pegarla en LinkedIn con Ctrl/⌘+V">Copiar imagen</button>'}
                 <button class="btn ghost small" data-create-action="png">⬇ ${post.format === 'carousel' ? 'PNGs' : 'PNG'}</button>
                 ${post.format === 'carousel' ? '<button class="btn ghost small" data-create-action="pdf">⬇ PDF</button>' : ''}
                 <button class="btn ghost small danger" data-create-action="delete" data-id="${esc(post.id)}">Borrar</button>`
          }
        </div>
      </header>
      <div class="pm-body">
        <section class="pm-text">
          ${state.publishHelp && !editing ? publishHelp(post) : ''}
          ${
            editing
              ? `${template ? '<p class="muted small">Este es el contenido con el que empieza la plantilla al usarla en Crear post o al empezar desde cero.</p>' : ''}${renderEditor(post, { template })}`
              : `<p class="muted small">Texto para LinkedIn${created ? ` · creado el ${esc(created)}` : ''}</p>
                 <div class="pm-post-text">${esc(post.text) || '<span class="muted">Sin texto todavía. Pulsa Editar para escribirlo.</span>'}</div>
                 ${post.hashtags.length ? `<p class="hashtags">${esc(post.hashtags.join(' '))}</p>` : ''}
                 <p class="count ${over ? 'over' : ''}">${text.length.toLocaleString('es')} / ${LINKEDIN_MAX_CHARS.toLocaleString('es')} caracteres${over ? ' · supera el límite de LinkedIn' : ''}</p>
                 <div class="pm-more">
                   ${canRegenerate ? '<button class="btn ghost small" data-create-action="regenerate">↻ Generar otra versión</button>' : ''}
                   ${switches.map((f) => `<button class="btn ghost small" data-create-action="switch-format" data-format="${f}">Probar como ${FORMAT_LABELS[f].toLowerCase()}</button>`).join('')}
                   <button class="btn ghost small" data-create-action="new">+ Nuevo post</button>
                 </div>`
          }
        </section>
        <section class="pm-design"><div class="gen-preview" id="gen-preview">${renderPreview(post)}</div></section>
      </div>
    </div>`;
}

// Cada gráfica del lado derecho ocupa todo el alto disponible sin salirse del ancho.
function fitFullscreenFrames() {
  const panel = document.querySelector('#create-root .pm-design');
  if (!panel) return;
  const pad = 40;
  const carousel = panel.querySelector('.gen-gallery');
  for (const frame of panel.querySelectorAll('.visual-frame')) {
    const [w, h] = String(frame.style.aspectRatio || '1 / 1').split('/').map((n) => parseFloat(n));
    const ratio = w && h ? w / h : 1;
    const maxH = panel.clientHeight - pad - (carousel ? 16 : 0);
    const maxW = carousel ? panel.clientWidth * 0.85 : panel.clientWidth - pad;
    frame.style.width = `${Math.max(120, Math.min(maxW, maxH * ratio))}px`;
  }
  fitVisuals(panel);
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
  parts.push(bubble('user', `<p>${esc(formatLabel())}</p>`));

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
  const full = state.fullscreen && state.result;
  root.innerHTML = `
    <header class="page-head create-head">
      <button class="btn ghost small create-close" data-create-action="close-page" aria-label="Cerrar Crear post">✕ Cerrar</button>
      <h1>Crear post</h1>
      <p class="muted">Pide un post a Claude, pega tu texto o empieza desde cero. La gráfica sale con tus plantillas, lista para LinkedIn.</p>
    </header>
    <section class="conversation" aria-live="polite">${full ? renderComposer() : renderConversation()}</section>
    ${state.step === 'prompt' || full ? renderHistory() : ''}
    ${full ? renderFullscreen(state.result) : ''}`;
  if (full) fitFullscreenFrames();
  mountPreview();
  if (full) fitFullscreenFrames();
  if (state.step === 'prompt' && !full) $('#create-prompt')?.focus();
}

let previewTimer;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(mountPreview, 120);
}

// ---------- Acciones ----------

// Todos los posts (nuevos o abiertos de la lista) se muestran a pantalla completa.
function showResult(post, { editing = false, isNew = false, fullscreen = true } = {}) {
  state.publishHelp = false;
  state.fullscreen = fullscreen;
  state.result = post;
  state.aiImage = null;
  state.format = post.format;
  state.templateId = post.templateId || null;
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
  state.fullscreen = false; // mientras Claude escribe se ve la conversación; el resultado se abre a pantalla completa
  renderCreate();
  try {
    const backend = getBackend();
    const auth = backend.mode === 'cloud' ? { Authorization: `Bearer ${await backend.accessToken()}` } : { 'x-posty-code': readStorage(CODE_KEY, '') };
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      // Con una plantilla propia, Claude escribe una card y su titular y texto van a las capas.
      body: JSON.stringify({ prompt: state.prompt, format: state.format === 'custom' ? 'card' : state.format }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      state.needsCode = res.status === 401;
      throw new Error(
        data.error ||
          (res.status === 404 ? 'El generador con Claude solo funciona con la web desplegada en Vercel y una API key configurada.' : 'No se pudo generar el post.'),
      );
    }
    const post =
      state.format === 'custom'
        ? customFromGenerated(data, state.templateId, state.prompt)
        : normalizePost({ ...data, ...newMeta({ prompt: state.prompt }) });
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
  // Propuesta del AI Digest: se conserva su título interno.
  const title = state.seedTitle;
  state.seedTitle = '';
  const show = (post, opts) => showResult(title ? { ...post, title } : post, opts);
  if (format === 'custom') {
    const post = state.mode === 'paste' ? customFromText(state.prompt, templateId) : blankPost('custom', templateId);
    show(post, { editing: true, isNew: true });
  } else if (state.mode === 'paste') {
    show(normalizePost({ ...postFromText(state.prompt, format), ...newMeta() }), { editing: true, isNew: true });
  } else {
    show(blankPost(format), { editing: true, isNew: true });
  }
}

// Desde el AI Digest: el texto de una propuesta pasa a Crear post y se elige la plantilla.
export function startFromDigest({ title, text }) {
  Object.assign(state, { mode: 'paste', prompt: text, format: null, result: null, error: null, editing: false, isNew: false, templateEdit: null, fullscreen: false, aiImage: null, seedTitle: title || '', step: 'format' });
  renderCreate();
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
  Object.assign(state, { step: 'prompt', prompt: '', format: null, result: null, editing: false, snapshot: null, isNew: false, fullscreen: false, aiImage: null, seedTitle: '', publishHelp: false });
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
      createLocal(state.format, state.templateId);
      break;
    case 'format':
      state.templateId = btn.dataset.template || null;
      if (state.mode === 'ai') {
        state.format = btn.dataset.format;
        generate();
      } else {
        createLocal(btn.dataset.format, btn.dataset.template);
      }
      break;
    case 'go-designs':
      location.hash = '#/disenos';
      break;
    case 'back':
      state.step = 'prompt';
      state.seedTitle = '';
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
    case 'close-page':
      closeCreate();
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
      // Guía para añadir la imagen: copiarla aquí y pegarla en el mismo post de LinkedIn.
      state.publishHelp = true;
      if (state.fullscreen) renderCreate();
      toast(post.format === 'carousel' ? 'Texto copiado. Sube el PDF en LinkedIn.' : 'Texto copiado. Ahora copia la imagen y pégala en LinkedIn.');
      break;
    case 'copy-image':
      btn.disabled = true;
      try {
        await copyPng($('#gen-preview'));
        toast('Imagen copiada ✓ Pégala en LinkedIn con Ctrl/⌘+V');
      } catch (err) {
        console.error(err);
        toast(err.message?.startsWith('Tu navegador') ? err.message : 'No se pudo copiar la imagen. Descarga el PNG.');
      }
      btn.disabled = false;
      break;
    case 'close-help':
      state.publishHelp = false;
      renderCreate();
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
        state.fullscreen = false;
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
    case 'close-full':
      resetToStart();
      break;
    case 'ai-image-open':
      state.aiImage = { target: btn.dataset.target, ratio: Number(btn.dataset.ratio) || 1, prompt: suggestPrompt(post), quality: 'medium', loading: false, error: null };
      renderCreate();
      document.querySelector('[data-ai-prompt]')?.focus();
      break;
    case 'ai-image-cancel':
      state.aiImage = null;
      renderCreate();
      break;
    case 'ai-image-run': {
      const ai = state.aiImage;
      if (!ai || ai.loading) return;
      if (!ai.prompt.trim()) {
        ai.error = 'Describe la imagen que quieres.';
        renderCreate();
        return;
      }
      ai.loading = true;
      ai.error = null;
      renderCreate();
      try {
        const image = await generateAiImage({ prompt: ai.prompt, ratio: ai.ratio, quality: ai.quality });
        // El post puede haber cambiado mientras se generaba: se aplica al post actual.
        const current = state.result;
        const [kind, ...rest] = ai.target.split(':');
        const where = rest.join(':');
        if (kind === 'layer') current.images = { ...(current.images || {}), [where]: image };
        else getPath(current, where).visual.src = image;
        state.aiImage = null;
        toast('Imagen generada ✓');
      } catch (err) {
        ai.loading = false;
        ai.error = err.message;
      }
      renderCreate();
      break;
    }
    case 'clear-image':
      delete post.images[btn.dataset.layer];
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
  if (state.aiImage && el.dataset.aiPrompt !== undefined) {
    state.aiImage.prompt = el.value;
    return;
  }
  if (state.aiImage && el.dataset.aiQuality !== undefined) {
    state.aiImage.quality = el.value;
    return;
  }
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
  if (el.type === 'file' && el.dataset.postImage && el.files[0] && state.result) {
    try {
      state.result.images = { ...(state.result.images || {}), [el.dataset.postImage]: await readImage(el.files[0]) };
      renderCreate();
    } catch (err) {
      toast(err.message);
    }
    return;
  }
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
  window.addEventListener('resize', () => {
    fitVisuals(root);
    if (state.fullscreen) fitFullscreenFrames();
  });
  // Esc cierra el post a pantalla completa o Crear post (si no se está editando ni escribiendo).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || root.hidden || state.editing || e.defaultPrevented) return;
    if (e.target.closest?.('input, textarea, select') || document.querySelector('.modal-backdrop')) return;
    // Primero se cierra el post abierto; con la pantalla de inicio a la vista, se cierra Crear post.
    if (state.fullscreen) resetToStart();
    else if (state.step === 'prompt') closeCreate();
  });
}
