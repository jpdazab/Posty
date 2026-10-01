// Pantalla "Diseños": todas las plantillas (integradas y propias) con su vista previa,
// el tema de marca (colores, tipografías, firma y logo) y la carga de fuentes, imágenes y kits.

import { $, esc, toast } from './ui.js';
import { BUILTIN_TEMPLATES, builtinPost, customPost, customSize } from './templates.js';
import { normalizePost, mountPages, unmountPages, frameHtml, fitVisuals } from './visuals.js';
import { assetUrl, deleteAsset } from './assets-db.js';
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
  exportKit,
  importKit,
  setDraftTemplate,
  DRAFT_ID,
} from './kit.js';
import { startFromTemplate, editTemplate } from './create.js';

const ui = {
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

function renderTemplates() {
  const kit = getKit();
  const groups = [...new Set(BUILTIN_TEMPLATES.map((t) => t.group))];
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
    <h2 class="section-title">Mis plantillas</h2>
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

// ---------- Editor de plantilla propia ----------

function num(label, path, value, { min = 0, max = 4000, step = 1 } = {}) {
  return `<label class="ed-field"><span>${esc(label)}</span><input type="number" data-tpl="${path}" value="${esc(value)}" min="${min}" max="${max}" step="${step}" /></label>`;
}

function fontSelect(path, value) {
  return `<label class="ed-field"><span>Tipografía</span><select data-tpl="${path}">${allFontFamilies()
    .map((f) => `<option ${f === value ? 'selected' : ''}>${esc(f)}</option>`)
    .join('')}</select></label>`;
}

function renderCustomEditor() {
  const t = ui.draft;
  return `
    <article class="post gen-editing">
      <div class="edit-bar">
        <button class="btn ghost small" data-design-action="cancel-custom">← Volver sin guardar</button>
        <strong>${esc(t.name || 'Plantilla')}</strong>
        <button class="btn primary small" data-design-action="save-custom">Guardar plantilla</button>
      </div>
      <div class="edit-layout">
        <div class="editor-panel">
          <fieldset class="ed-group">
            <legend>Plantilla</legend>
            <label class="ed-field"><span>Nombre</span><input type="text" data-tpl="name" value="${esc(t.name)}" /></label>
            <label class="ed-field"><span>Tamaño</span><select data-tpl="size">${Object.entries(CUSTOM_SIZES)
              .map(([k, v]) => `<option value="${k}" ${t.size === k ? 'selected' : ''}>${esc(v.label)}</option>`)
              .join('')}</select></label>
            <label class="ed-field"><span>Color de fondo</span><input type="color" data-tpl="background" value="${esc(t.background)}" /></label>
            <label class="ed-field"><span>Imagen de fondo</span>
              <input type="file" accept="image/*" data-tpl-bg />
              <small class="muted">${t.bgAssetId ? 'Imagen cargada. Se ajusta para cubrir todo el tamaño.' : 'Opcional. PNG o JPG del tamaño elegido.'}</small>
            </label>
            ${t.bgAssetId ? '<button class="btn ghost small" data-design-action="remove-bg">Quitar imagen de fondo</button>' : ''}
          </fieldset>
          ${t.layers
            .map(
              (l, i) => `
            <fieldset class="ed-group">
              <legend>Capa: ${esc(l.name)}</legend>
              <div class="ed-item-head"><span class="muted small">Posición y tamaño en píxeles</span><button class="link danger" data-design-action="remove-layer" data-index="${i}">Quitar capa</button></div>
              <label class="ed-field"><span>Nombre</span><input type="text" data-tpl="layers.${i}.name" value="${esc(l.name)}" /></label>
              <label class="ed-field"><span>Texto de ejemplo</span><textarea data-tpl="layers.${i}.sample" rows="2">${esc(l.sample)}</textarea></label>
              <div class="ed-row">
                ${num('X', `layers.${i}.x`, l.x)}${num('Y', `layers.${i}.y`, l.y)}${num('Ancho', `layers.${i}.w`, l.w, { min: 20 })}
              </div>
              <div class="ed-row">
                ${num('Tamaño', `layers.${i}.size`, l.size, { min: 8, max: 400 })}
                ${num('Interlineado', `layers.${i}.lineHeight`, l.lineHeight, { min: 0.6, max: 3, step: 0.05 })}
                <label class="ed-field"><span>Color</span><input type="color" data-tpl="layers.${i}.color" value="${esc(l.color)}" /></label>
              </div>
              <div class="ed-row">
                ${fontSelect(`layers.${i}.font`, l.font)}
                <label class="ed-field"><span>Peso</span><select data-tpl="layers.${i}.weight">${[400, 500, 600, 700]
                  .map((w) => `<option ${Number(l.weight) === w ? 'selected' : ''}>${w}</option>`)
                  .join('')}</select></label>
                <label class="ed-field"><span>Alineación</span><select data-tpl="layers.${i}.align">${['left', 'center', 'right']
                  .map((a) => `<option value="${a}" ${l.align === a ? 'selected' : ''}>${{ left: 'Izquierda', center: 'Centro', right: 'Derecha' }[a]}</option>`)
                  .join('')}</select></label>
              </div>
            </fieldset>`,
            )
            .join('')}
          <button class="btn ghost small" data-design-action="add-layer">+ Añadir capa de texto</button>
        </div>
        <div class="edit-preview"><div id="tpl-draft-preview"></div></div>
      </div>
    </article>`;
}

// ---------- Marca: colores, tipografía, firma ----------

function renderBrand() {
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
  const draft = root.querySelector('#tpl-draft-preview');
  if (draft && ui.draft) renderDraft(draft);
}

// La plantilla en edición aún no está guardada: se dibuja como borrador temporal.
function renderDraft(container) {
  setDraftTemplate(ui.draft);
  const post = normalizePost({ format: 'custom', templateId: DRAFT_ID, fields: {} });
  container.innerHTML = frameHtml(post);
  mountPages(container, post);
}

export function renderDesigns() {
  const root = $('#designs-root');
  unmountPages(root);
  root.innerHTML = `
    <header class="page-head page-head-row">
      <div>
        <h1>Diseños</h1>
        <p class="muted">Tus plantillas y tu marca: colores, tipografías, firma y logo. Los cambios se aplican a todos los posts.</p>
      </div>
      <div class="actions">
        <button class="btn ghost small" data-design-action="export-kit">⬇ Exportar kit</button>
        <label class="btn ghost small">⬆ Importar kit<input type="file" accept="application/json" data-kit-import hidden /></label>
      </div>
    </header>
    ${
      ui.draft
        ? renderCustomEditor()
        : `<div class="mode-switch" role="tablist">
             <button role="tab" class="chip ${ui.tab === 'plantillas' ? 'active' : ''}" aria-selected="${ui.tab === 'plantillas'}" data-design-action="tab" data-tab="plantillas">Plantillas</button>
             <button role="tab" class="chip ${ui.tab === 'marca' ? 'active' : ''}" aria-selected="${ui.tab === 'marca'}" data-design-action="tab" data-tab="marca">Colores y tipografía</button>
           </div>
           ${ui.tab === 'plantillas' ? renderTemplates() : renderBrand()}`
    }`;
  mountPreviews(root);
}

let previewTimer;
function refreshPreviews() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => mountPreviews($('#designs-root')), 120);
}

// ---------- Acciones ----------

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

async function handle(btn) {
  const { designAction: action, id } = btn.dataset;
  switch (action) {
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
    case 'cancel-custom':
      ui.draft = null;
      setDraftTemplate(null);
      renderDesigns();
      break;
    case 'save-custom': {
      const draft = ui.draft;
      ui.draft = null;
      setDraftTemplate(null);
      saveCustomTemplate(draft);
      toast('Plantilla guardada');
      renderDesigns();
      break;
    }
    case 'add-layer':
      {
        // La capa nueva va debajo de la última, sin salirse del lienzo.
        const { h: height } = customSize(ui.draft);
        const lastY = Math.max(0, ...ui.draft.layers.map((l) => l.y + l.size * (l.lineHeight || 1.2) * 2));
        ui.draft.layers.push({ ...newCustomTemplate().layers[1], id: `capa-${Date.now().toString(36)}`, name: `Capa ${ui.draft.layers.length + 1}`, y: Math.min(Math.round(lastY + 40), height - 120) });
      }
      renderDesigns();
      break;
    case 'remove-layer':
      ui.draft.layers.splice(Number(btn.dataset.index), 1);
      renderDesigns();
      break;
    case 'remove-bg':
      ui.draft.bgAssetId = null;
      renderDesigns();
      break;
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

async function handleChange(e) {
  const el = e.target;
  try {
    if (el.dataset.fontUpload !== undefined && el.files[0]) {
      const family = await addFont(el.files[0]);
      toast(`Tipografía "${family}" añadida`);
      renderDesigns();
    } else if (el.dataset.logoUpload !== undefined && el.files[0]) {
      await setLogo(el.files[0]);
      await assetUrl(getKit().theme.logoAssetId);
      toast('Logo actualizado');
      renderDesigns();
    } else if (el.dataset.tplBg !== undefined && el.files[0]) {
      const old = ui.draft.bgAssetId;
      ui.draft.bgAssetId = await storeImage(el.files[0]);
      await assetUrl(ui.draft.bgAssetId);
      // Ajusta el tamaño al de la imagen si coincide con uno de los formatos.
      const img = await createImageBitmap(el.files[0]).catch(() => null);
      const match = img && Object.entries(CUSTOM_SIZES).find(([, s]) => Math.abs(s.w / s.h - img.width / img.height) < 0.02);
      if (match) ui.draft.size = match[0];
      if (old && !getKit().customTemplates.some((t) => t.bgAssetId === old)) deleteAsset(old).catch(() => {});
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
    } else if (el.tagName === 'SELECT' && el.dataset.tpl) {
      setPath(ui.draft, el.dataset.tpl, el.value);
      renderDesigns();
    }
  } catch (err) {
    console.error(err);
    toast(err.message || 'No se pudo cargar el archivo');
  }
}

function handleInput(e) {
  const el = e.target;
  if (el.dataset.color) {
    updateKit((k) => (k.theme.colors[el.dataset.color] = el.value));
    const small = el.parentElement.querySelector('small');
    if (small) small.textContent = `${el.value} · cambiado`;
  } else if (el.dataset.themeText) {
    updateKit((k) => (k.theme[el.dataset.themeText] = el.value));
    refreshPreviews();
  } else if (el.dataset.tpl && el.tagName !== 'SELECT' && el.type !== 'file') {
    const numeric = el.type === 'number';
    setPath(ui.draft, el.dataset.tpl, numeric ? Number(el.value) : el.value);
    if (el.dataset.tpl === 'name') $('#designs-root .edit-bar strong').textContent = el.value || 'Plantilla';
    const container = $('#tpl-draft-preview');
    if (container) {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => renderDraft(container), 80);
    }
  }
}

export function initDesignsPage() {
  const root = $('#designs-root');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-design-action]');
    if (!btn) return;
    e.preventDefault();
    handle(btn);
  });
  root.addEventListener('input', handleInput);
  root.addEventListener('change', handleChange);
  window.addEventListener('resize', () => fitVisuals(root));
}

