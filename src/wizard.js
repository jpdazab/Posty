// Asistente de bienvenida: la primera vez que alguien entra define su marca (logo y firma, colores y
// tipografías) antes de crear sus propias plantillas. Los controles de marca se reutilizan en Diseños.

import { $, esc, toast } from './ui.js';
import { assetUrl, cachedAssetUrl } from './assets-db.js';
import {
  getKit,
  updateKit,
  setBrand,
  setLogo,
  addFont,
  allFontFamilies,
  finishSetup,
  importKit,
  BRAND_COLORS,
  BRAND_FONTS,
} from './kit.js';
import { GOOGLE_OPTION } from './google-fonts.js';

const STEPS = [
  { id: 'marca', label: 'Marca' },
  { id: 'colores', label: 'Colores' },
  { id: 'tipografia', label: 'Tipografía' },
  { id: 'listo', label: 'Listo' },
];

const PRESETS = [
  { name: 'Azul profesional', colors: { primary: '#2f5bea', secondary: '#f2a541', background: '#ffffff', text: '#16161d' } },
  { name: 'Noche', colors: { primary: '#8b7cff', secondary: '#3ee0b0', background: '#121218', text: '#f4f4f7' } },
  { name: 'Tierra', colors: { primary: '#c2562d', secondary: '#e9c46a', background: '#f7f1e8', text: '#2b2118' } },
  { name: 'Bosque', colors: { primary: '#1f7a5a', secondary: '#f2c14e', background: '#f3f6f2', text: '#14231c' } },
  { name: 'Minimal', colors: { primary: '#111111', secondary: '#ff4d2e', background: '#f5f5f2', text: '#111111' } },
];

const contrastText = (r) => `Contraste texto/fondo: ${r.toFixed(1)}:1 ${r < 4.5 ? '· poco legible, prueba un texto más oscuro o claro' : '· se lee bien'}`;

const ui = { step: 0, activeColor: 'primary', logoColors: [], onDone: null };

// ---------- Colores ----------

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const toHex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

// Colores más frecuentes del logo (sin transparentes), agrupados para no repetir tonos casi iguales.
export async function paletteFromImage(url) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const key = [0, 1, 2].map((c) => data[i + c] >> 4).join(',');
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n += 1;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
  }
  const colors = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((b) => toHex(Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)));
  const distinct = [];
  for (const c of colors) {
    if (distinct.every((d) => colorDistance(c, d) > 60)) distinct.push(c);
    if (distinct.length === 6) break;
  }
  return distinct;
}

function colorDistance(a, b) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

function saturation(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

// Con los colores del logo: los dos más vivos como principal y secundario.
function brandFromLogo(colors) {
  const vivid = [...colors].sort((a, b) => saturation(b) - saturation(a)).filter((c) => saturation(c) > 0.25);
  const next = {};
  if (vivid[0]) next.primary = vivid[0];
  if (vivid[1]) next.secondary = vivid[1];
  return next;
}

async function refreshLogoColors() {
  const url = await logoUrl();
  ui.logoColors = url ? await paletteFromImage(url).catch(() => []) : [];
}

async function logoUrl() {
  const id = getKit().theme.logoAssetId;
  return id ? assetUrl(id) : null;
}

// ---------- Piezas reutilizables (asistente y Diseños) ----------

const fontStack = (family) => `'${String(family).replace(/'/g, '')}', sans-serif`;

export function brandPreview() {
  const { brand, theme } = getKit();
  const { colors: c, fonts: f } = brand;
  const logo = cachedAssetUrl(theme.logoAssetId);
  return `
    <div class="bp" style="background:${esc(c.background)};color:${esc(c.text)}">
      <span class="bp-tag" style="color:${esc(c.primary)};font-family:${esc(fontStack(f.body))}">TU TEMA</span>
      <h3 style="font-family:${esc(fontStack(f.heading))}">Así se verán tus <span style="box-shadow:inset 0 -0.35em ${esc(c.secondary)}">posts</span> en LinkedIn</h3>
      <p style="font-family:${esc(fontStack(f.body))}">Un texto de apoyo con tu tipografía y tus colores, listo para tus plantillas.</p>
      <div class="bp-foot">
        ${logo ? `<img src="${esc(logo)}" alt="Logo" />` : '<span></span>'}
        <span style="color:${esc(c.primary)};font-family:${esc(fontStack(f.body))}">${esc(theme.handle || '@tu-nombre')}</span>
      </div>
    </div>`;
}

export function logoFields() {
  const { theme } = getKit();
  const logo = cachedAssetUrl(theme.logoAssetId);
  return `
    <label class="ed-field"><span>Firma</span>
      <input type="text" data-brand-handle value="${esc(theme.handle)}" placeholder="@tu-nombre" maxlength="60" />
      <small class="muted">Tu nombre o usuario: aparece en las plantillas.</small>
    </label>
    <div class="ed-field"><span>Logo</span>
      <div class="logo-drop">
        ${logo ? `<img src="${esc(logo)}" alt="Tu logo" />` : '<span class="muted small">Sin logo</span>'}
        <label class="btn ghost small">${logo ? 'Cambiar' : 'Subir logo'}<input type="file" accept="image/*" data-brand-logo hidden /></label>
        ${logo ? '<button class="link danger" type="button" data-brand-action="remove-logo">Quitar</button>' : ''}
      </div>
      <small class="muted">Opcional. PNG o SVG, mejor con fondo transparente. Sacaremos de él colores sugeridos.</small>
    </div>`;
}

export function colorFields() {
  const { colors } = getKit().brand;
  const ratio = contrast(colors.text, colors.background);
  return `
    <div class="brand-colors">
      ${BRAND_COLORS.map(
        (c) => `
        <div class="brand-color ${ui.activeColor === c.key ? 'active' : ''}" data-brand-action="pick-role" data-role="${c.key}">
          <input type="color" data-brand-color="${c.key}" value="${esc(colors[c.key])}" aria-label="${esc(c.label)}" />
          <span><strong>${esc(c.label)}</strong><small class="muted">${esc(c.hint)}</small></span>
          <input type="text" class="hex" data-brand-hex="${c.key}" value="${esc(colors[c.key])}" maxlength="7" aria-label="${esc(c.label)} en hexadecimal" />
        </div>`,
      ).join('')}
    </div>
    <p class="contrast ${ratio < 4.5 ? 'warn' : ''}">${contrastText(ratio)}</p>
    ${
      ui.logoColors.length
        ? `<div class="swatch-row"><span class="muted small">De tu logo (clic para usarlo en <strong data-active-label>${esc(BRAND_COLORS.find((c) => c.key === ui.activeColor).label)}</strong>):</span>
             ${ui.logoColors.map((c) => `<button type="button" class="swatch" style="background:${esc(c)}" data-brand-action="swatch" data-color="${esc(c)}" title="${esc(c)}"></button>`).join('')}
             <button type="button" class="btn ghost small" data-brand-action="from-logo">Usar colores del logo</button>
           </div>`
        : ''
    }
    <div class="swatch-row"><span class="muted small">Paletas:</span>
      ${PRESETS.map(
        (p, i) => `<button type="button" class="preset" data-brand-action="preset" data-index="${i}" title="${esc(p.name)}">
          ${['primary', 'secondary', 'background', 'text'].map((k) => `<i style="background:${esc(p.colors[k])}"></i>`).join('')}
          <span>${esc(p.name)}</span></button>`,
      ).join('')}
    </div>`;
}

export function fontFields() {
  const { fonts } = getKit().brand;
  return BRAND_FONTS.map(
    (f) => `
    <div class="ed-field"><span>${esc(f.label)}</span>
      <div class="font-pick">
        <select data-brand-font="${f.key}" style="font-family:${esc(fontStack(fonts[f.key]))}">
          ${allFontFamilies()
            .map((fam) => `<option ${fonts[f.key] === fam ? 'selected' : ''} style="font-family:${esc(fontStack(fam))}">${esc(fam)}</option>`)
            .join('')}
          ${GOOGLE_OPTION}
        </select>
        <label class="btn ghost small">Subir fuente<input type="file" accept=".woff2,.woff,.ttf,.otf,font/*" data-brand-font-upload="${f.key}" hidden /></label>
      </div>
    </div>`,
  ).join('')
    .concat('<small class="muted">WOFF2, WOFF, TTF u OTF. Una variante por archivo; para negrita, sube también el archivo Bold.</small>');
}

// Actualiza vista previa, contraste y campos de color sin redibujar (se está escribiendo en uno).
export function syncBrandFields(root, previewEl) {
  if (previewEl) previewEl.innerHTML = brandPreview();
  const { colors } = getKit().brand;
  const ratioEl = root.querySelector('.contrast');
  if (ratioEl) {
    const r = contrast(colors.text, colors.background);
    ratioEl.classList.toggle('warn', r < 4.5);
    ratioEl.textContent = contrastText(r);
  }
  for (const c of BRAND_COLORS) {
    const picker = root.querySelector(`[data-brand-color="${c.key}"]`);
    const hex = root.querySelector(`[data-brand-hex="${c.key}"]`);
    if (picker && document.activeElement !== picker) picker.value = colors[c.key];
    if (hex && document.activeElement !== hex) hex.value = colors[c.key];
  }
}

// Eventos de los controles de marca. Devuelven true si el evento era suyo; `rerender` redibuja la vista.
export function brandInput(el, rerender) {
  if (el.dataset.brandColor) {
    setBrand((b) => (b.colors[el.dataset.brandColor] = el.value));
    rerender({ soft: true });
    return true;
  }
  if (el.dataset.brandHex) {
    const v = el.value.trim().startsWith('#') ? el.value.trim() : `#${el.value.trim()}`;
    if (HEX.test(v)) {
      setBrand((b) => (b.colors[el.dataset.brandHex] = v.toLowerCase()));
      rerender({ soft: true });
    }
    return true;
  }
  if (el.dataset.brandHandle !== undefined) {
    updateKit((k) => (k.theme.handle = el.value));
    rerender({ soft: true });
    return true;
  }
  return false;
}

export async function brandChange(el, rerender) {
  try {
    if (el.dataset.brandLogo !== undefined && el.files[0]) {
      await setLogo(el.files[0]);
      await refreshLogoColors();
      // En el asistente se proponen los colores del logo; en Diseños solo se sugieren (no se pisan los elegidos).
      const suggested = brandFromLogo(ui.logoColors);
      if (!getKit().setupDone && Object.keys(suggested).length) setBrand((b) => Object.assign(b.colors, suggested));
      toast('Logo cargado');
      rerender();
      return true;
    }
    if (el.dataset.brandFontUpload && el.files[0]) {
      const family = await addFont(el.files[0]);
      setBrand((b) => (b.fonts[el.dataset.brandFontUpload] = family));
      toast(`Tipografía "${family}" añadida`);
      rerender();
      return true;
    }
    if (el.dataset.brandFont) {
      setBrand((b) => (b.fonts[el.dataset.brandFont] = el.value));
      rerender();
      return true;
    }
  } catch (err) {
    console.error(err);
    toast(el.dataset.brandFontUpload ? 'No se pudo leer la fuente. Prueba con un archivo WOFF2, TTF u OTF.' : err.message || 'No se pudo cargar el archivo');
    return true;
  }
  return false;
}

export async function brandClick(btn, rerender) {
  switch (btn.dataset.brandAction) {
    case 'pick-role': {
      // Sin redibujar: el selector de color nativo se cerraría.
      ui.activeColor = btn.dataset.role;
      const scope = btn.closest('.brand-colors')?.parentElement || document;
      scope.querySelectorAll('.brand-color').forEach((el) => el.classList.toggle('active', el === btn));
      const label = scope.querySelector('[data-active-label]');
      if (label) label.textContent = BRAND_COLORS.find((c) => c.key === ui.activeColor).label;
      return true;
    }
    case 'swatch':
      setBrand((b) => (b.colors[ui.activeColor] = btn.dataset.color));
      rerender();
      return true;
    case 'from-logo':
      setBrand((b) => Object.assign(b.colors, brandFromLogo(ui.logoColors)));
      rerender();
      return true;
    case 'preset':
      setBrand((b) => Object.assign(b.colors, PRESETS[Number(btn.dataset.index)].colors));
      rerender();
      return true;
    case 'remove-logo':
      await setLogo(null);
      ui.logoColors = [];
      rerender();
      return true;
  }
  return false;
}

// Al abrir Diseños: colores sugeridos del logo ya guardado.
export async function loadLogoColors() {
  await refreshLogoColors();
}

// ---------- Asistente ----------

function stepBody() {
  switch (STEPS[ui.step].id) {
    case 'marca':
      return `
        <h2>Empecemos por tu marca</h2>
        <p class="muted">Posty empieza en blanco: tus plantillas usarán tu logo, tus colores y tus tipografías. Puedes cambiar todo después en Templates.</p>
        ${logoFields()}`;
    case 'colores':
      return `
        <h2>Tus colores</h2>
        <p class="muted">Elige los cuatro colores de tus piezas. Toca un color para seleccionarlo y ajústalo, escribe su código o parte de una paleta.</p>
        ${colorFields()}`;
    case 'tipografia':
      return `
        <h2>Tus tipografías</h2>
        <p class="muted">Una para titulares y otra para el texto (pueden ser la misma). Sube las de tu marca o usa una de la lista.</p>
        ${fontFields()}`;
    default:
      return `
        <h2>¡Tu marca está lista!</h2>
        <p class="muted">Ahora crea tu primera plantilla: un fondo (color o una imagen exportada de Figma, Canva…) con capas de texto.
        Al crear un post, Posty rellena el titular y el texto de la plantilla.</p>`;
  }
}

function render({ soft = false } = {}) {
  const root = $('#wizard-root');
  if (!root) return;
  // Mientras se escribe en un campo solo se actualiza la vista previa, para no perder el foco.
  if (soft) {
    syncBrandFields(root, root.querySelector('.wizard-preview'));
    return;
  }
  const last = ui.step === STEPS.length - 1;
  root.innerHTML = `
    <div class="wizard-card">
      <header class="wizard-head">
        <div class="login-brand"><span class="logo" aria-hidden="true">P</span><strong>Posty</strong></div>
        <ol class="wizard-steps">
          ${STEPS.map((s, i) => `<li class="${i === ui.step ? 'current' : i < ui.step ? 'done' : ''}"><span>${i + 1}</span>${esc(s.label)}</li>`).join('')}
        </ol>
      </header>
      <div class="wizard-body">
        <form class="wizard-form editor-panel" novalidate>${stepBody()}</form>
        <aside class="wizard-side"><p class="muted small">Vista previa</p><div class="wizard-preview">${brandPreview()}</div></aside>
      </div>
      <footer class="wizard-foot">
        ${
          ui.step === 0
            ? `<label class="link">Importar un kit<input type="file" accept="application/json" data-wizard-import hidden /></label>`
            : '<button class="btn ghost" data-wizard="back">← Atrás</button>'
        }
        <span class="spacer"></span>
        ${last ? '<button class="btn ghost" data-wizard="finish">Ir a Posty</button>' : '<button class="link" data-wizard="skip">Configurar más tarde</button>'}
        <button class="btn primary" data-wizard="${last ? 'first-template' : 'next'}">${last ? 'Crear mi primera plantilla →' : 'Siguiente →'}</button>
      </footer>
    </div>`;
}

function close(next) {
  finishSetup();
  $('#wizard-root')?.remove();
  document.body.classList.remove('wizard-open');
  ui.onDone?.(next);
}

// onDone(next): next = 'template' si quiere crear su primera plantilla.
export async function showWizard(onDone) {
  ui.step = 0;
  ui.onDone = onDone;
  await refreshLogoColors();
  $('#wizard-root')?.remove();
  const root = document.createElement('div');
  root.id = 'wizard-root';
  root.className = 'wizard';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Configura tu marca');
  document.body.appendChild(root);
  document.body.classList.add('wizard-open');

  root.addEventListener('click', async (e) => {
    const brandBtn = e.target.closest('[data-brand-action]');
    if (brandBtn && (await brandClick(brandBtn, render))) return;
    const btn = e.target.closest('[data-wizard]');
    if (!btn) return;
    e.preventDefault();
    const action = btn.dataset.wizard;
    if (action === 'next') ui.step = Math.min(ui.step + 1, STEPS.length - 1);
    if (action === 'back') ui.step = Math.max(ui.step - 1, 0);
    if (action === 'skip' || action === 'finish') return close();
    if (action === 'first-template') return close('template');
    render();
    root.querySelector('.wizard-card')?.scrollTo?.(0, 0);
  });
  root.addEventListener('input', (e) => brandInput(e.target, render));
  root.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.wizardImport !== undefined && el.files[0]) {
      try {
        await importKit(await el.files[0].text());
        toast('Kit importado');
        close();
      } catch (err) {
        toast(err.message);
      }
      return;
    }
    await brandChange(el, render);
  });
  root.addEventListener('submit', (e) => e.preventDefault());
  render();
}
