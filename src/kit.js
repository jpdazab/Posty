// "Kit de diseño" de Posty: el tema (colores, tipografías, firma, logo), las fuentes subidas,
// el contenido por defecto de cada plantilla y las plantillas propias (fondo + capas de texto).
// Se guarda en la cuenta (Supabase) o en el navegador en modo local; los archivos, con assets-db.js.

import { assetUrl, putAsset, deleteAsset, newAssetId, getAsset, blobToDataUrl, dataUrlToBlob } from './assets-db.js';
import { getBackend } from './backend.js';

// Colores del design system que se pueden cambiar (variable CSS → etiqueta y valor original).
export const THEME_COLORS = [
  { token: 'carousel-accent', label: 'Azul del carrusel', group: 'Carrusel', value: '#0004eb' },
  { token: 'carousel-ink', label: 'Tinta del carrusel', group: 'Carrusel', value: '#050516' },
  { token: 'carousel-highlight', label: 'Amarillo suave', group: 'Carrusel', value: '#ffffb3' },
  { token: 'carousel-card', label: 'Fondo de slide', group: 'Carrusel', value: '#e6e6e6' },
  { token: 'carousel-summary', label: 'Texto de resumen', group: 'Carrusel', value: '#494a51' },
  { token: 'carousel-handle', label: 'Firma', group: 'Carrusel', value: '#919099' },
  { token: 'brand', label: 'Violeta de marca', group: 'Card', value: '#5438dc' },
  { token: 'brand-fill', label: 'Violeta de relleno', group: 'Card', value: '#473bf0' },
  { token: 'accent', label: 'Naranja de acento', group: 'Card', value: '#f29950' },
  { token: 'canvas', label: 'Fondo de card', group: 'Card', value: '#f5f5f5' },
  { token: 'ink', label: 'Texto', group: 'Card', value: '#1a1926' },
];

export const FONT_ROLES = [
  { role: 'sans', label: 'Texto (Switzer)', variable: '--font-sans', fallback: '"Switzer", ui-sans-serif, system-ui, sans-serif' },
  { role: 'blackbird', label: 'Titulares del carrusel (Projekt Blackbird)', variable: '--font-blackbird', fallback: '"Projekt Blackbird", "Switzer", ui-sans-serif, sans-serif' },
  { role: 'mono', label: 'Monoespaciada (Geist Mono)', variable: '--font-mono', fallback: '"Geist Mono", ui-monospace, monospace' },
];

export const BUILTIN_FONTS = ['Switzer', 'Projekt Blackbird', 'Geist Mono'];

export const CUSTOM_SIZES = {
  '1080x1350': { w: 1080, h: 1350, label: 'Vertical 4:5 · 1080 × 1350' },
  '1080x1080': { w: 1080, h: 1080, label: 'Cuadrado · 1080 × 1080' },
  '1231x1731': { w: 1231, h: 1731, label: 'Carrusel · 1231 × 1731' },
  '1200x627': { w: 1200, h: 627, label: 'Horizontal · 1200 × 627' },
};

function defaultKit() {
  return {
    theme: { colors: {}, fonts: {}, handle: '@jpdazab', swipe: 'Swipe', logoAssetId: null },
    fonts: [], // { id, family, assetId, fileName }
    templateContent: {}, // id de plantilla integrada → contenido por defecto editado
    customTemplates: [], // ver newCustomTemplate()
  };
}

let kit = defaultKit();
const listeners = new Set();

function merge(parsed) {
  const base = defaultKit();
  return parsed ? { ...base, ...parsed, theme: { ...base.theme, ...parsed.theme } } : base;
}

// Guardado agrupado: los selectores de color disparan muchos cambios seguidos.
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    getBackend()
      .saveKit(kit)
      .catch((err) => console.error('No se pudo guardar el kit', err));
  }, 400);
  listeners.forEach((fn) => fn(kit));
}

export function getKit() {
  return kit;
}

export function onKitChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function updateKit(mutator) {
  mutator(kit);
  save();
  applyTheme();
}

// ---------- Tema aplicado como CSS ----------

let styleEl;

function cssString(s) {
  return `"${String(s).replace(/["\\]/g, '')}"`;
}

export async function applyTheme() {
  styleEl ??= Object.assign(document.createElement('style'), { id: 'posty-kit-theme' });
  if (!styleEl.isConnected) document.head.appendChild(styleEl);

  const rules = [];
  // @font-face de las fuentes subidas (en CSS, para que la exportación a PNG las incluya).
  for (const f of kit.fonts) {
    const url = await assetUrl(f.assetId);
    if (url) rules.push(`@font-face { font-family: ${cssString(f.family)}; src: url("${url}"); font-display: block; }`);
  }

  const vars = [];
  for (const c of THEME_COLORS) {
    const value = kit.theme.colors[c.token];
    if (value) vars.push(`--${c.token}: ${value};`);
  }
  for (const r of FONT_ROLES) {
    const family = kit.theme.fonts[r.role];
    if (family) vars.push(`${r.variable}: ${cssString(family)}, ${r.fallback};`);
  }
  // Selector doble para ganar a .ds de tokens.css.
  if (vars.length) rules.push(`.ds.ds { ${vars.join(' ')} }`);

  const logo = kit.theme.logoAssetId ? await assetUrl(kit.theme.logoAssetId) : null;
  if (logo) {
    rules.push(`.ds .jd-slide__sign .jd-mark { display: none; }`);
    rules.push(`.ds .jd-slide__sign::before { content: ""; display: block; width: 140px; height: 48px; background: url("${logo}") left center / contain no-repeat; }`);
  }
  styleEl.textContent = rules.join('\n');
  await document.fonts?.ready;
}

export async function logoUrl() {
  return kit.theme.logoAssetId ? assetUrl(kit.theme.logoAssetId) : null;
}

// ---------- Fuentes ----------

export async function addFont(file, family) {
  const name = (family || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')).trim();
  // Comprobamos que el navegador puede leer la fuente antes de guardarla.
  const face = new FontFace(name, await file.arrayBuffer());
  await face.load();
  const assetId = newAssetId('font');
  await putAsset(assetId, file);
  updateKit((k) => k.fonts.push({ id: assetId, family: name, assetId, fileName: file.name }));
  return name;
}

export async function removeFont(id) {
  const font = kit.fonts.find((f) => f.id === id);
  if (!font) return;
  await deleteAsset(font.assetId).catch(() => {});
  updateKit((k) => {
    k.fonts = k.fonts.filter((f) => f.id !== id);
    for (const r of Object.keys(k.theme.fonts)) if (k.theme.fonts[r] === font.family) delete k.theme.fonts[r];
  });
}

export function allFontFamilies() {
  return [...BUILTIN_FONTS, ...kit.fonts.map((f) => f.family)];
}

// ---------- Archivos de imagen (logo, fondos) ----------

export async function storeImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
  const id = newAssetId('img');
  await putAsset(id, file);
  return id;
}

export async function setLogo(file) {
  const old = kit.theme.logoAssetId;
  const id = file ? await storeImage(file) : null;
  updateKit((k) => (k.theme.logoAssetId = id));
  if (old) deleteAsset(old).catch(() => {});
}

// ---------- Plantillas propias ----------

export function newCustomTemplate() {
  return {
    id: newAssetId('tpl'),
    name: 'Nueva plantilla',
    size: '1080x1350',
    background: '#1a1926',
    bgAssetId: null,
    layers: [
      { id: 'titulo', name: 'Titular', x: 80, y: 120, w: 920, size: 88, color: '#ffffff', font: 'Switzer', weight: 600, align: 'left', lineHeight: 1.05, sample: 'Tu titular aquí' },
      { id: 'texto', name: 'Texto', x: 80, y: 420, w: 860, size: 40, color: '#e6e6e6', font: 'Switzer', weight: 400, align: 'left', lineHeight: 1.35, sample: 'Una frase de apoyo para el post.' },
      { id: 'firma', name: 'Firma', x: 80, y: 1230, w: 600, size: 32, color: '#ffffff', font: 'Geist Mono', weight: 400, align: 'left', lineHeight: 1.2, sample: '/jpdazab' },
    ],
  };
}

export function saveCustomTemplate(tpl) {
  updateKit((k) => {
    const i = k.customTemplates.findIndex((t) => t.id === tpl.id);
    if (i >= 0) k.customTemplates[i] = tpl;
    else k.customTemplates.push(tpl);
  });
}

export async function removeCustomTemplate(id) {
  const tpl = kit.customTemplates.find((t) => t.id === id);
  if (tpl?.bgAssetId) await deleteAsset(tpl.bgAssetId).catch(() => {});
  updateKit((k) => (k.customTemplates = k.customTemplates.filter((t) => t.id !== id)));
}

// Plantilla que se está editando en Diseños (aún sin guardar), para poder dibujar su vista previa.
let draftTemplate = null;
export const DRAFT_ID = '__draft__';

export function setDraftTemplate(tpl) {
  draftTemplate = tpl ? { ...tpl, id: DRAFT_ID } : null;
}

export function getCustomTemplate(id) {
  if (id === DRAFT_ID) return draftTemplate;
  return kit.customTemplates.find((t) => t.id === id) || null;
}

// Carga el kit de la cuenta, sus archivos (fuentes, logo, fondos) y aplica el tema.
export async function initKit() {
  kit = merge(await getBackend().loadKit());
  await Promise.all(assetIds().map((id) => assetUrl(id)));
  await applyTheme();
}

// ---------- Contenido por defecto de las plantillas integradas ----------

export function setTemplateContent(id, content) {
  updateKit((k) => (k.templateContent[id] = content));
}

export function resetTemplateContent(id) {
  updateKit((k) => delete k.templateContent[id]);
}

// ---------- Exportar / importar el kit completo (para llevarlo a otro navegador) ----------

function assetIds() {
  return [
    ...kit.fonts.map((f) => f.assetId),
    kit.theme.logoAssetId,
    ...kit.customTemplates.map((t) => t.bgAssetId),
  ].filter(Boolean);
}

export async function exportKit() {
  const assets = {};
  for (const id of assetIds()) {
    const blob = await getAsset(id);
    if (blob) assets[id] = await blobToDataUrl(blob);
  }
  return JSON.stringify({ app: 'posty-kit', version: 1, exportedAt: new Date().toISOString(), kit, assets });
}

export async function importKit(json) {
  const data = JSON.parse(json);
  if (data?.app !== 'posty-kit' || !data.kit) throw new Error('El archivo no es un kit de diseño de Posty.');
  for (const [id, dataUrl] of Object.entries(data.assets || {})) await putAsset(id, await dataUrlToBlob(dataUrl));
  kit = merge(data.kit);
  save();
  await applyTheme();
}

export function resetTheme() {
  updateKit((k) => (k.theme = { ...defaultKit().theme, logoAssetId: k.theme.logoAssetId }));
}
