// Pantalla "Diseños": todas las plantillas (integradas y propias) con su vista previa,
// el tema de marca (colores, tipografías, firma y logo) y la carga de fuentes, imágenes y kits.

import { $, esc, toast } from './ui.js';
import { BUILTIN_TEMPLATES, builtinPost, customPost, customSize } from './templates.js';
import { normalizePost, mountPages, unmountPages, frameHtml, fitVisuals } from './visuals.js';
import { assetUrl, deleteAsset, dataUrlToBlob } from './assets-db.js';
import {
  getKit,
  updateKit,
  THEME_COLORS,
  FONT_ROLES,
  CUSTOM_SIZES,
  allFontFamilies,
  addFont,
  removeFont,
  setLogo,
  storeImage,
  newCustomTemplate,
  saveCustomTemplate,
  removeCustomTemplate,
  resetTemplateContent,
  resetTheme,
  restartSetup,
  exportKit,
  importKit,
  setTempTemplates,
} from './kit.js';
import { startFromTemplate, editTemplate } from './create.js';
import { mountTemplateEditor } from './template-editor.js';
import { contentFromText, contentFromPage, designsFrom } from './layouts.js';

const MAX_PDF_PAGES = 10;
import { getBackend } from './backend.js';
import { brandPreview, logoFields, colorFields, fontFields, brandInput, brandChange, brandClick, loadLogoColors, showWizard, syncBrandFields } from './wizard.js';

// gen: panel "Generar diseños" → { source: 'url' | 'text', url, text, size, siteColors, loading, error, page, results }
const ui = {
  gen: null,
  tab: 'plantillas', // plantillas | marca
  draft: null, // plantilla propia en edición
};

const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------- Plantillas ----------

function templateCard({ key, name, description, badge, actions }) {
  return `
    <article class="tpl-card">
      <div class="tpl-preview" data-preview="${esc(key)}"></div>
      <div class="tpl-body">
        <div class="tpl-title"><strong>${esc(name)}</strong>${badge ? `<span class="badge badge-aprobado">${esc(badge)}</span>` : ''}</div>
        ${description ? `<p class="muted small">${esc(description)}</p>` : ''}
        <div class="tpl-actions">${actions}</div>
      </div>
    </article>`;
}

// ---------- Generar diseños (desde una URL o un texto, sin IA) ----------

// Modal a todo el ancho; se oculta mientras se edita una propuesta y vuelve al salir del editor.
function renderGenModal() {
  const g = ui.gen;
  if (!g || ui.draft) return '';
  const colors = g.page?.colors || [];
  return `
    <div class="modal-backdrop gen-modal" role="dialog" aria-modal="true" aria-labelledby="gen-title">
    <section class="modal-card gen-designs">
      <header class="modal-head">
        <div><h2 id="gen-title">Generar diseños</h2><p class="muted small">Desde una web, un texto o un PDF. Sin IA: Posty reparte el contenido en varias composiciones con tus colores y tipografías.</p></div>
        <button class="icon-btn modal-close" data-design-action="gen-close" aria-label="Cerrar" title="Cerrar (Esc)">×</button>
      </header>
      <div class="modal-body">
      <div class="mode-switch" role="tablist">
        <button role="tab" class="chip ${g.source === 'url' ? 'active' : ''}" aria-selected="${g.source === 'url'}" data-design-action="gen-source" data-source="url">Desde una URL</button>
        <button role="tab" class="chip ${g.source === 'text' ? 'active' : ''}" aria-selected="${g.source === 'text'}" data-design-action="gen-source" data-source="text">Desde un texto</button>
        <button role="tab" class="chip ${g.source === 'pdf' ? 'active' : ''}" aria-selected="${g.source === 'pdf'}" data-design-action="gen-source" data-source="pdf">Desde un PDF</button>
      </div>
      ${g.source === 'pdf' ? renderPdfSource(g) : renderTextUrlSource(g, colors)}
      ${renderGenResults(g)}
      </div>
    </section>
    </div>`;
}

function renderPdfSource(g) {
  return `
    <div class="gen-form">
      <label class="pdf-drop ${g.loading ? 'busy' : ''}">
        <input type="file" accept="application/pdf,.pdf" data-gen-pdf hidden ${g.loading ? 'disabled' : ''} />
        <strong>${g.loading ? esc(g.progress || 'Leyendo el PDF…') : 'Elige un PDF'}</strong>
        <span class="muted small">Cada página (hasta ${MAX_PDF_PAGES}) se convierte en una plantilla: el diseño queda de fondo y los textos pasan a ser capas editables, con su tamaño, color y posición.</span>
      </label>
      ${g.missingFonts?.length ? `<p class="warn-text small">El PDF usa ${g.missingFonts.map((f) => `<strong>${esc(f)}</strong>`).join(', ')}, que no ${g.missingFonts.length === 1 ? 'está' : 'están'} en Posty: se ha usado tu tipografía. Súbela en <a href="#/disenos" data-design-action="tab" data-tab="marca">Colores y tipografía</a> y vuelve a importar el PDF para que quede igual.</p>` : ''}
      ${g.pdfInfo ? `<p class="muted small">${esc(g.pdfInfo)}</p>` : ''}
      ${g.error ? `<p class="error-text">${esc(g.error)}</p>` : ''}
    </div>`;
}

function renderTextUrlSource(g, colors) {
  return `
      <form id="gen-form" class="gen-form" novalidate>
        ${
          g.source === 'url'
            ? `<input type="url" data-gen-field="url" value="${esc(g.url)}" placeholder="https://… (un artículo, una noticia, tu web)" inputmode="url" />`
            : `<textarea data-gen-field="text" rows="6" placeholder="Pega tu post, un párrafo o una lista de ideas. La primera línea será el titular.">${esc(g.text)}</textarea>`
        }
        <div class="gen-options">
          <label class="ed-field"><span>Tamaño</span><select data-gen-field="size">${Object.entries(CUSTOM_SIZES)
            .map(([key, v]) => `<option value="${key}" ${g.size === key ? 'selected' : ''}>${esc(v.label)}</option>`)
            .join('')}</select></label>
          ${
            g.source === 'url' && colors.length
              ? `<label class="check"><input type="checkbox" data-gen-field="siteColors" ${g.siteColors ? 'checked' : ''} /> Usar los colores de la web
                   <span class="swatch-mini">${colors.map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</span></label>`
              : ''
          }
          <button class="btn primary" type="submit" ${g.loading ? 'disabled' : ''}>${g.loading ? 'Leyendo la web…' : 'Generar diseños'}</button>
        </div>
        ${g.error ? `<p class="error-text">${esc(g.error)}</p>` : ''}
      </form>`;
}

function renderGenResults(g) {
  if (!g.results?.length) return '';
  const unsaved = g.results.filter((t) => !g.savedIds?.[t.id]).length;
  return `
      ${g.results.length > 1 && unsaved ? `<div class="actions start"><button class="btn ghost small" data-design-action="gen-save-all">Guardar las ${unsaved}</button></div>` : ''}
      ${
        `<div class="tpl-grid">${g.results
              .map((t) =>
                templateCard({
                  key: `custom:${t.id}`,
                  name: t.name,
                  description: customSize(t).label,
                  actions: `
                    <button class="btn primary small" data-design-action="gen-use" data-id="${t.id}">Usar en un post</button>
                    ${g.savedIds?.[t.id] ? '<button class="btn ghost small" disabled>Guardada ✓</button>' : `<button class="btn ghost small" data-design-action="gen-save" data-id="${t.id}">Guardar</button>`}
                    <button class="btn ghost small" data-design-action="gen-edit" data-id="${t.id}">Editar</button>`,
                }),
              )
              .join('')}</div>`
      }`;
}

function renderTemplates() {
  return renderTemplateList(getKit());
}

function renderTemplateList(kit) {
  // Las plantillas de ejemplo (design system jpdazab) solo existen en kits anteriores al asistente.
  const groups = kit.builtins ? [...new Set(BUILTIN_TEMPLATES.map((t) => t.group))] : [];
  if (!kit.builtins && !kit.customTemplates.length) {
    return `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">+</span>
        <h2>Crea tu primera plantilla</h2>
        <p class="muted">Genera diseños desde un texto, una web o un PDF, empieza con tus colores y tipografías, o sube como fondo un diseño exportado de Figma o Canva.</p>
        <div class="actions center">
          <button class="btn primary" data-design-action="gen-open">✳ Generar diseños</button>
          <button class="btn ghost" data-design-action="new-custom">Nueva plantilla</button>
        </div>
      </div>`;
  }
  return `
    ${groups
      .map(
        (g) => `
      <h2 class="section-title">${esc(g)}</h2>
      <div class="tpl-grid">
        ${BUILTIN_TEMPLATES.filter((t) => t.group === g)
          .map((t) =>
            templateCard({
              key: `builtin:${t.id}`,
              name: t.name,
              description: t.description,
              badge: kit.templateContent[t.id] ? 'Editada' : '',
              actions: `
                <button class="btn primary small" data-design-action="use" data-id="${t.id}">Usar</button>
                <button class="btn ghost small" data-design-action="edit-builtin" data-id="${t.id}">Editar</button>
                ${kit.templateContent[t.id] ? `<button class="btn ghost small" data-design-action="reset-builtin" data-id="${t.id}">Restablecer</button>` : ''}`,
            }),
          )
          .join('')}
      </div>`,
      )
      .join('')}
    ${groups.length ? '<h2 class="section-title">Mis plantillas</h2>' : ''}
    <p class="muted small">Sube un fondo (por ejemplo, un diseño exportado de Figma) y coloca encima las capas de texto.</p>
    <div class="tpl-grid">
      ${kit.customTemplates
        .map((t) =>
          templateCard({
            key: `custom:${t.id}`,
            name: t.name,
            description: customSize(t).label,
            actions: `
              <button class="btn primary small" data-design-action="use-custom" data-id="${t.id}">Usar</button>
              <button class="btn ghost small" data-design-action="edit-custom" data-id="${t.id}">Editar</button>
              <button class="btn ghost small" data-design-action="duplicate-custom" data-id="${t.id}">Duplicar</button>
              <button class="btn ghost small danger" data-design-action="delete-custom" data-id="${t.id}">Borrar</button>`,
          }),
        )
        .join('')}
      <button class="tpl-new" data-design-action="new-custom">
        <span aria-hidden="true">+</span>
        <strong>Nueva plantilla</strong>
        <span class="muted small">Fondo de color o imagen y capas de texto</span>
      </button>
    </div>`;
}

// ---------- Editor de plantilla propia (visual, ver template-editor.js) ----------

let editor = null;

function mountEditor(root) {
  editor?.destroy();
  editor = null;
  const host = root.querySelector('#tpl-editor-root');
  if (!host || !ui.draft) return;
  editor = mountTemplateEditor(host, ui.draft, {
    onSave: (tpl) => saveDraft(tpl),
    onCancel: () => {
      ui.draft = null;
      renderDesigns();
    },
  });
}

async function saveDraft(tpl) {
  ui.draft = null;
  if (tpl.id.startsWith('__gen_')) {
    // Propuesta de Generar diseños: se guarda con id propio.
    ui.gen.results = ui.gen.results.map((t) => (t.id === tpl.id ? tpl : t));
    setTempTemplates(ui.gen.results);
    await persistGenerated(tpl.id);
  } else {
    saveCustomTemplate(tpl);
  }
  toast('Plantilla guardada');
  renderDesigns();
}

// ---------- Marca: colores, tipografía, firma ----------

// Marca definida con el asistente: cuatro colores, dos tipografías, firma y logo.
function renderSimpleBrand() {
  const { fonts } = getKit();
  return `
    <div class="brand-layout">
      <div class="editor-panel">
        <fieldset class="ed-group"><legend>Firma y logo</legend>${logoFields()}</fieldset>
        <fieldset class="ed-group"><legend>Colores</legend>${colorFields()}</fieldset>
        <fieldset class="ed-group"><legend>Tipografías</legend>${fontFields()}
          ${
            fonts.length
              ? `<ul class="font-list">${fonts
                  .map(
                    (f) => `<li><span style="font-family:'${esc(f.family)}'">${esc(f.family)}</span><small class="muted">${esc(f.fileName)}</small>
                      <button class="link danger" data-design-action="remove-font" data-id="${esc(f.id)}">Quitar</button></li>`,
                  )
                  .join('')}</ul>`
              : ''
          }
        </fieldset>
        <p class="muted small">Los colores y tipografías son los que aparecen al crear una plantilla nueva; las plantillas ya creadas no cambian.</p>
        <div class="actions start"><button class="btn ghost" data-design-action="rerun-wizard">Repetir el asistente</button></div>
      </div>
      <div class="edit-preview">
        <p class="muted small">Vista previa</p>
        <div class="brand-previews" id="brand-preview">${brandPreview()}</div>
      </div>
    </div>`;
}

function renderBrand() {
  if (!getKit().builtins) return renderSimpleBrand();
  const { theme, fonts } = getKit();
  const groups = [...new Set(THEME_COLORS.map((c) => c.group))];
  return `
    <div class="brand-layout">
      <div class="editor-panel">
        ${groups
          .map(
            (g) => `
          <fieldset class="ed-group">
            <legend>Colores · ${esc(g)}</legend>
            <div class="color-grid">
              ${THEME_COLORS.filter((c) => c.group === g)
                .map((c) => {
                  const value = theme.colors[c.token] || c.value;
                  return `
                    <label class="color-field">
                      <input type="color" data-color="${c.token}" value="${esc(value)}" />
                      <span><strong>${esc(c.label)}</strong><small class="muted">${esc(value)}${theme.colors[c.token] ? ' · cambiado' : ''}</small></span>
                    </label>`;
                })
                .join('')}
            </div>
          </fieldset>`,
          )
          .join('')}
        <fieldset class="ed-group">
          <legend>Tipografías</legend>
          ${FONT_ROLES.map(
            (r) => `
            <label class="ed-field"><span>${esc(r.label)}</span>
              <select data-font-role="${r.role}">
                <option value="">Original</option>
                ${allFontFamilies()
                  .map((f) => `<option ${theme.fonts[r.role] === f ? 'selected' : ''}>${esc(f)}</option>`)
                  .join('')}
              </select>
            </label>`,
          ).join('')}
          <label class="ed-field"><span>Subir tipografía</span>
            <input type="file" accept=".woff2,.woff,.ttf,.otf,font/*" data-font-upload />
            <small class="muted">WOFF2, WOFF, TTF u OTF. Una variante por archivo (por ejemplo, Regular y Bold por separado).</small>
          </label>
          ${
            fonts.length
              ? `<ul class="font-list">${fonts
                  .map(
                    (f) => `<li><span style="font-family:'${esc(f.family)}'">${esc(f.family)}</span><small class="muted">${esc(f.fileName)}</small>
                      <button class="link danger" data-design-action="remove-font" data-id="${esc(f.id)}">Quitar</button></li>`,
                  )
                  .join('')}</ul>`
              : ''
          }
        </fieldset>
        <fieldset class="ed-group">
          <legend>Firma y logo</legend>
          <label class="ed-field"><span>Firma del carrusel</span><input type="text" data-theme-text="handle" value="${esc(theme.handle)}" /></label>
          <label class="ed-field"><span>Texto para deslizar</span><input type="text" data-theme-text="swipe" value="${esc(theme.swipe)}" placeholder="Swipe" /></label>
          <label class="ed-field"><span>Logo</span>
            <input type="file" accept="image/*" data-logo-upload />
            <small class="muted">${theme.logoAssetId ? 'Logo propio cargado: sustituye al JD en carruseles y cards.' : 'PNG o SVG con fondo transparente. Sustituye al JD en carruseles y cards.'}</small>
          </label>
          ${theme.logoAssetId ? '<button class="btn ghost small" data-design-action="remove-logo">Volver al logo JD</button>' : ''}
        </fieldset>
        <div class="actions start"><button class="btn ghost danger" data-design-action="reset-theme">Restablecer colores, tipografías y firma</button></div>
      </div>
      <div class="edit-preview">
        <p class="muted small">Vista previa</p>
        <div class="brand-previews">
          <div data-preview="builtin:card-list"></div>
          <div data-preview="builtin:cover-blue"></div>
          <div data-preview="builtin:slide-stats"></div>
        </div>
      </div>
    </div>`;
}

// ---------- Render ----------

function previewPost(key) {
  if (key === 'draft') return null;
  const [kind, id] = key.split(':');
  return normalizePost(kind === 'builtin' ? builtinPost(id) : customPost(id));
}

function mountPreviews(root) {
  for (const el of root.querySelectorAll('[data-preview]')) {
    const post = previewPost(el.dataset.preview);
    if (!post) continue;
    el.innerHTML = frameHtml(post);
    mountPages(el, post);
  }
}

export function renderDesigns() {
  const root = $('#designs-root');
  unmountPages(root);
  root.innerHTML = `
    <header class="page-head page-head-row">
      <div>
        <h1>Templates</h1>
        <p class="muted">Tus plantillas y tu marca: colores, tipografías, firma y logo.</p>
      </div>
      <div class="actions">
        <button class="btn primary small" data-design-action="gen-open">✳ Generar diseños</button>
        <button class="btn ghost small" data-design-action="new-custom">+ Nueva plantilla</button>
        <button class="btn ghost small" data-design-action="export-kit">⬇ Exportar kit</button>
        <label class="btn ghost small">⬆ Importar kit<input type="file" accept="application/json" data-kit-import hidden /></label>
      </div>
    </header>
    <div class="mode-switch" role="tablist">
      <button role="tab" class="chip ${ui.tab === 'plantillas' ? 'active' : ''}" aria-selected="${ui.tab === 'plantillas'}" data-design-action="tab" data-tab="plantillas">Plantillas</button>
      <button role="tab" class="chip ${ui.tab === 'marca' ? 'active' : ''}" aria-selected="${ui.tab === 'marca'}" data-design-action="tab" data-tab="marca">Colores y tipografía</button>
    </div>
    ${ui.draft ? '' : ui.tab === 'plantillas' ? renderTemplates() : renderBrand()}
    ${renderGenModal()}
    ${ui.draft ? '<div class="editor-modal" role="dialog" aria-modal="true" aria-label="Editor de plantilla"><div id="tpl-editor-root"></div></div>' : ''}`;
  // El editor de plantillas se abre a pantalla completa por encima de Diseños.
  if (ui.draft) mountEditor(root);
  else {
    editor?.destroy();
    editor = null;
    mountPreviews(root);
  }
}

let previewTimer;
function refreshPreviews() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => mountPreviews($('#designs-root')), 120);
}

// ---------- Generar diseños: lógica ----------

function authHeaders(backend) {
  if (backend.mode === 'cloud') return backend.accessToken().then((t) => ({ Authorization: `Bearer ${t}` }));
  let code = '';
  try {
    code = JSON.parse(localStorage.getItem('posty:access-code') || '""');
  } catch {
    // sin código
  }
  return Promise.resolve({ 'x-posty-code': code });
}

// Las imágenes descargadas (web) o dibujadas (PDF) solo se conservan si alguna plantilla guardada las usa.
function dropGenImage() {
  const g = ui.gen;
  if (!g) return;
  const ids = [g.imageAssetId, ...(g.pdfAssets || [])].filter(Boolean);
  for (const id of ids) if (!getKit().customTemplates.some((t) => t.bgAssetId === id)) deleteAsset(id).catch(() => {});
  g.imageAssetId = null;
  g.pdfAssets = [];
}

async function importPdf(file) {
  const g = ui.gen;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) {
    g.error = 'El archivo no es un PDF.';
    renderDesigns();
    return;
  }
  g.error = null;
  g.loading = true;
  g.progress = 'Cargando el lector de PDF…';
  renderDesigns();
  try {
    const { templatesFromPdf } = await import('./pdf-import.js');
    const result = await templatesFromPdf(file, {
      onProgress: (n, total) => {
        g.progress = `Convirtiendo la página ${n} de ${total}…`;
        const strong = $('#designs-root .pdf-drop strong');
        if (strong) strong.textContent = g.progress;
      },
    });
    dropGenImage();
    g.results = result.templates;
    g.pdfAssets = result.templates.map((t) => t.bgAssetId);
    g.savedIds = {};
    g.missingFonts = result.missingFonts;
    g.pdfInfo = result.totalPages > MAX_PDF_PAGES ? `El PDF tiene ${result.totalPages} páginas: se han convertido las ${MAX_PDF_PAGES} primeras.` : '';
    g.pdfName = file.name;
    setTempTemplates(g.results);
    if (!g.results.some((t) => t.layers.length)) g.pdfInfo = `${g.pdfInfo} No se encontró texto editable (puede que el PDF sea una imagen): las plantillas tienen solo el fondo; añade capas de texto con Editar.`.trim();
  } catch (err) {
    console.error(err);
    g.error = err.message || 'No se pudo leer el PDF.';
  }
  g.loading = false;
  renderDesigns();
}

function buildDesigns() {
  const g = ui.gen;
  const { brand, theme } = getKit();
  const palette = { ...brand.colors };
  const colors = g.page?.colors || [];
  if (g.source === 'url' && g.siteColors && colors.length) {
    palette.primary = colors[0];
    if (colors[1]) palette.secondary = colors[1];
  }
  g.results = designsFrom(g.content, { palette, fonts: brand.fonts, handle: theme.handle, hasLogo: Boolean(theme.logoAssetId), size: g.size });
  g.savedIds = {};
  setTempTemplates(g.results);
}

async function runGenerator() {
  const g = ui.gen;
  g.error = null;
  if (g.source === 'text') {
    if (!g.text.trim()) {
      g.error = 'Pega primero un texto.';
      renderDesigns();
      return;
    }
    g.content = contentFromText(g.text);
    buildDesigns();
    renderDesigns();
    return;
  }
  if (!g.url.trim()) {
    g.error = 'Escribe la dirección de una web.';
    renderDesigns();
    return;
  }
  g.loading = true;
  renderDesigns();
  try {
    const backend = getBackend();
    const res = await fetch('/api/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders(backend)) },
      body: JSON.stringify({ url: g.url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || (res.status === 404 ? 'Leer webs solo funciona con Posty desplegado en Vercel.' : 'No se pudo leer esa web.'));
    dropGenImage();
    g.page = data;
    g.siteColors = Boolean(data.colors?.length);
    g.content = contentFromPage(data);
    if (data.image) {
      g.imageAssetId = await storeImage(await dataUrlToBlob(data.image)).catch(() => null);
      if (g.imageAssetId) await assetUrl(g.imageAssetId);
      g.content.image = g.imageAssetId;
    }
    buildDesigns();
  } catch (err) {
    g.error = err.message === 'Failed to fetch' ? 'No hay conexión con el servidor.' : err.message;
  }
  g.loading = false;
  renderDesigns();
}

// Guarda una propuesta como plantilla propia (una vez) y devuelve su id.
async function persistGenerated(genId) {
  const g = ui.gen;
  if (g.savedIds[genId]) return g.savedIds[genId];
  const tpl = clone(g.results.find((t) => t.id === genId));
  tpl.id = newCustomTemplate().id;
  // Cada plantilla con su propia copia de la imagen: borrar una no rompe las otras.
  if (tpl.bgAssetId && getKit().customTemplates.some((t) => t.bgAssetId === tpl.bgAssetId)) {
    const url = await assetUrl(tpl.bgAssetId);
    tpl.bgAssetId = url ? await storeImage(await (await fetch(url)).blob()) : null;
    if (tpl.bgAssetId) await assetUrl(tpl.bgAssetId);
  }
  saveCustomTemplate(tpl);
  g.savedIds[genId] = tpl.id;
  return tpl.id;
}

function postTextFromSource() {
  const g = ui.gen;
  if (g.source === 'text') return g.text.trim();
  if (g.source === 'pdf') return '';
  const p = g.page || {};
  return [p.title, p.description, p.url].filter(Boolean).join('\n\n');
}

// ---------- Acciones ----------


async function handle(btn) {
  const { designAction: action, id } = btn.dataset;
  switch (action) {
    case 'gen-open':
      ui.gen = { source: 'url', url: '', text: '', size: '1080x1350', siteColors: true, loading: false, error: null, page: null, content: null, results: [], savedIds: {} };
      renderDesigns();
      $('#designs-root .gen-modal [data-gen-field="url"]')?.focus();
      break;
    case 'gen-close':
      dropGenImage();
      setTempTemplates([]);
      ui.gen = null;
      renderDesigns();
      break;
    case 'gen-source':
      ui.gen.source = btn.dataset.source;
      ui.gen.error = null;
      renderDesigns();
      break;
    case 'gen-save-all':
      for (const t of ui.gen.results) await persistGenerated(t.id);
      toast('Plantillas guardadas en Mis plantillas');
      renderDesigns();
      break;
    case 'gen-save':
      await persistGenerated(id);
      toast('Plantilla guardada en Mis plantillas');
      renderDesigns();
      break;
    case 'gen-use': {
      const savedId = await persistGenerated(id);
      const text = postTextFromSource();
      // Se cierra el modal: la plantilla ya está guardada y el post se abre en Crear post.
      dropGenImage();
      setTempTemplates([]);
      ui.gen = null;
      renderDesigns();
      startFromTemplate({ ...customPost(savedId), text });
      location.hash = '#/crear';
      break;
    }
    case 'gen-edit':
      ui.draft = clone(ui.gen.results.find((t) => t.id === id));
      renderDesigns();
      window.scrollTo(0, 0);
      break;
    case 'rerun-wizard':
      restartSetup();
      showWizard(afterWizard);
      break;
    case 'tab':
      ui.tab = btn.dataset.tab;
      renderDesigns();
      break;
    case 'use':
      startFromTemplate(builtinPost(id));
      location.hash = '#/crear';
      break;
    case 'use-custom':
      startFromTemplate(customPost(id));
      location.hash = '#/crear';
      break;
    case 'edit-builtin':
      editTemplate(id);
      location.hash = '#/crear';
      break;
    case 'reset-builtin':
      resetTemplateContent(id);
      toast('Plantilla restablecida');
      renderDesigns();
      break;
    case 'new-custom':
      ui.draft = newCustomTemplate();
      renderDesigns();
      break;
    case 'edit-custom':
      ui.draft = clone(getKit().customTemplates.find((t) => t.id === id));
      renderDesigns();
      break;
    case 'duplicate-custom': {
      const copy = { ...clone(getKit().customTemplates.find((t) => t.id === id)), id: newCustomTemplate().id };
      copy.name = `${copy.name} (copia)`;
      // La copia comparte la imagen de fondo: se guarda otra vez para que borrar una no afecte a la otra.
      if (copy.bgAssetId) {
        const url = await assetUrl(copy.bgAssetId);
        copy.bgAssetId = url ? await storeImage(await (await fetch(url)).blob()) : null;
      }
      saveCustomTemplate(copy);
      renderDesigns();
      break;
    }
    case 'delete-custom': {
      const t = getKit().customTemplates.find((x) => x.id === id);
      if (!t || !window.confirm(`¿Borrar la plantilla "${t.name}"? Los posts que la usan dejarán de verse.`)) return;
      await removeCustomTemplate(id);
      toast('Plantilla borrada');
      renderDesigns();
      break;
    }
    case 'remove-font':
      await removeFont(id);
      renderDesigns();
      break;
    case 'remove-logo':
      await setLogo(null);
      renderDesigns();
      break;
    case 'reset-theme':
      if (!window.confirm('¿Volver a los colores, tipografías y firma originales del design system?')) return;
      resetTheme();
      renderDesigns();
      break;
    case 'export-kit': {
      const blob = new Blob([await exportKit()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `posty-kit-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      break;
    }
  }
}

// Redibuja la pestaña de marca; con soft solo la vista previa (para no perder el foco al escribir).
function rerenderBrand({ soft = false } = {}) {
  const preview = $('#brand-preview');
  if (soft && preview) {
    syncBrandFields($('#designs-root'), preview);
    return;
  }
  renderDesigns();
}

async function handleChange(e) {
  const el = e.target;
  if (await brandChange(el, rerenderBrand)) return;
  try {
    if (el.dataset.genPdf !== undefined && el.files[0] && ui.gen) {
      await importPdf(el.files[0]);
      return;
    }
    if (el.dataset.genField && ui.gen) {
      const key = el.dataset.genField;
      ui.gen[key] = el.type === 'checkbox' ? el.checked : el.value;
      // Cambiar tamaño o colores rehace las propuestas sin volver a leer la web.
      if ((key === 'size' || key === 'siteColors') && ui.gen.content) buildDesigns();
      if (key === 'size' || key === 'siteColors') renderDesigns();
      return;
    }
    if (el.dataset.fontUpload !== undefined && el.files[0]) {
      const family = await addFont(el.files[0]);
      toast(`Tipografía "${family}" añadida`);
      renderDesigns();
    } else if (el.dataset.logoUpload !== undefined && el.files[0]) {
      await setLogo(el.files[0]);
      await assetUrl(getKit().theme.logoAssetId);
      toast('Logo actualizado');
      renderDesigns();
    } else if (el.dataset.kitImport !== undefined && el.files[0]) {
      await importKit(await el.files[0].text());
      toast('Kit importado');
      renderDesigns();
    } else if (el.dataset.fontRole) {
      updateKit((k) => {
        if (el.value) k.theme.fonts[el.dataset.fontRole] = el.value;
        else delete k.theme.fonts[el.dataset.fontRole];
      });
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'No se pudo cargar el archivo');
  }
}

function handleInput(e) {
  const el = e.target;
  if (el.dataset.genField && ui.gen && el.type !== 'checkbox' && el.tagName !== 'SELECT') {
    ui.gen[el.dataset.genField] = el.value;
    return;
  }
  if (brandInput(el, rerenderBrand)) return;
  if (el.dataset.color) {
    updateKit((k) => (k.theme.colors[el.dataset.color] = el.value));
    const small = el.parentElement.querySelector('small');
    if (small) small.textContent = `${el.value} · cambiado`;
  } else if (el.dataset.themeText) {
    updateKit((k) => (k.theme[el.dataset.themeText] = el.value));
    refreshPreviews();
  }
}

export function initDesignsPage() {
  const root = $('#designs-root');
  // Esc cierra el modal de Generar diseños (si está a la vista y no se está escribiendo en el editor).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !ui.gen || ui.draft || root.hidden || ui.gen.loading) return;
    const btn = root.querySelector('.gen-modal [data-design-action="gen-close"]');
    if (btn) handle(btn);
  });
  root.addEventListener('click', async (e) => {
    const brandBtn = e.target.closest('[data-brand-action]');
    if (brandBtn && (await brandClick(brandBtn, rerenderBrand))) return;
    const btn = e.target.closest('[data-design-action]');
    if (!btn) return;
    e.preventDefault();
    handle(btn);
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'gen-form') return;
    e.preventDefault();
    runGenerator();
  });
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleChange);
  window.addEventListener('resize', () => fitVisuals(root));
}


// Al terminar el asistente: abre Diseños y, si lo pidió, el editor de su primera plantilla.
export function afterWizard(next) {
  if (next === 'template') {
    ui.tab = 'plantillas';
    ui.draft = newCustomTemplate();
  }
  if (location.hash === '#/disenos') renderDesigns();
  else location.hash = '#/disenos';
}

export async function prepareDesigns() {
  await loadLogoColors();
}
