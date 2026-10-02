// Editor visual de plantillas propias, estilo constructor de newsletters:
// - Bloques: se arrastran al lienzo (o se pulsan) para añadir títulos, textos, botones, formas o imágenes.
// - Lienzo: cada elemento se selecciona, se mueve arrastrando (con guías de alineación),
//   se redimensiona con los tiradores y el texto se escribe con doble clic.
// - Capas: el orden se cambia arrastrando (arriba = delante).
// - Propiedades: las del elemento seleccionado, o las del lienzo si no hay nada seleccionado.
// Atajos: Supr borra, flechas mueven (Mayús ×10), ⌘/Ctrl+Z deshace, ⌘/Ctrl+Mayús+Z rehace, ⌘/Ctrl+D duplica.

import { esc, toast } from './ui.js';
import { assetUrl, cachedAssetUrl, deleteAsset } from './assets-db.js';
import { getKit, allFontFamilies, storeImage, setLogo, CUSTOM_SIZES } from './kit.js';
import { customSize } from './templates.js';
import { layerCss, isText } from './layer-style.js';
import { contrast } from './layouts.js';
import { chartSvg, CHART_TYPES, SAMPLE_DATA, categoricalPalette, mix } from './charts.js';
import { fillCss, fillBase, fillThemes, readableText, GRADIENT_KINDS, PATTERNS } from './fills.js';

const LOGO = '__logo';
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

const ICONS = {
  titulo: '<b>T</b>',
  subtitulo: '<b style="font-size:.8em">T</b>',
  parrafo: '¶',
  lista: '☰',
  cita: '❝',
  etiqueta: '#',
  boton: '▭',
  cifra: '%',
  firma: '@',
  separador: '—',
  bloque: '■',
  circulo: '●',
  imagen: '🖼',
  logo: '◎',
  'g-bar': '▮▮',
  'g-hbar': '☰',
  'g-line': '⟋',
  'g-donut': '◐',
  'g-stats': '12',
};

const BLOCKS = [
  { group: 'Texto', items: [['titulo', 'Título'], ['subtitulo', 'Subtítulo'], ['parrafo', 'Párrafo'], ['lista', 'Lista'], ['cita', 'Cita'], ['etiqueta', 'Etiqueta'], ['cifra', 'Cifra'], ['firma', 'Firma']] },
  { group: 'Elementos', items: [['boton', 'Botón'], ['separador', 'Separador'], ['bloque', 'Bloque de color'], ['circulo', 'Círculo'], ['imagen', 'Imagen'], ['logo', 'Logo']] },
  { group: 'Gráficas', items: [['g-bar', 'Columnas'], ['g-hbar', 'Barras'], ['g-line', 'Línea'], ['g-donut', 'Donut'], ['g-stats', 'Cifras']] },
];
const BLOCK_LABEL = Object.fromEntries(BLOCKS.flatMap((g) => g.items));

const readable = (bg, ...c) => [...c, '#ffffff', '#111111'].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clone = (v) => JSON.parse(JSON.stringify(v));
const round = (n) => Math.round(n);

// Capa nueva de cada bloque, con la marca y a escala del lienzo.
function blockLayer(type, tpl) {
  const { w: W } = customSize(tpl);
  const k = W / 1080;
  const { brand, theme } = getKit();
  const c = brand.colors;
  const f = brand.fonts;
  const ink = readable(tpl.background || '#ffffff', c.text, c.background);
  const accent = contrast(c.primary, tpl.background || '#ffffff') >= 3 ? c.primary : ink;
  const m = round(80 * k);
  const text = (props) => ({ kind: 'text', x: m, y: 0, w: W - 2 * m, color: ink, font: f.body, weight: 400, align: 'left', lineHeight: 1.2, ...props });
  const shape = (props) => ({ kind: 'shape', x: m, y: 0, color: c.primary, radius: 0, ...props });
  const make = {
    titulo: () => text({ size: round(88 * k), weight: 700, font: f.heading, lineHeight: 1.05, sample: 'Tu titular aquí' }),
    subtitulo: () => text({ size: round(52 * k), weight: 600, font: f.heading, lineHeight: 1.15, sample: 'Un subtítulo que lo explica' }),
    parrafo: () => text({ size: round(36 * k), w: round(W * 0.75), lineHeight: 1.4, sample: 'Escribe aquí el texto de apoyo de tu post.' }),
    lista: () => text({ size: round(36 * k), w: round(W * 0.75), lineHeight: 1.5, sample: '1. Primer punto\n2. Segundo punto\n3. Tercer punto' }),
    cita: () => text({ size: round(56 * k), weight: 600, font: f.heading, italic: true, sample: '“Una frase que inspire a tu audiencia.”' }),
    etiqueta: () => text({ size: round(26 * k), w: round(420 * k), weight: 700, uppercase: true, letterSpacing: 0.12, color: accent, sample: 'Tema' }),
    cifra: () => text({ size: round(220 * k), w: round(640 * k), weight: 700, font: f.heading, lineHeight: 1, color: accent, sample: '48%' }),
    firma: () => text({ size: round(30 * k), w: round(420 * k), weight: 600, color: accent, sample: theme.handle || '@tu-nombre' }),
    boton: () => text({ size: round(30 * k), w: round(360 * k), weight: 700, align: 'center', bg: c.primary, color: readable(c.primary, c.background, c.text), padX: round(36 * k), padY: round(18 * k), radius: 999, sample: 'Leer más →' }),
    separador: () => shape({ w: round(160 * k), h: round(8 * k), color: c.secondary, radius: round(4 * k) }),
    bloque: () => shape({ w: round(480 * k), h: round(320 * k), radius: round(24 * k) }),
    circulo: () => shape({ w: round(320 * k), h: round(320 * k), color: c.secondary, radius: 9999 }),
    imagen: () => ({ kind: 'image', x: m, y: 0, w: round(600 * k), h: round(400 * k), radius: round(16 * k), assetId: null }),
  };
  if (type.startsWith('g-')) {
    // Gráfica: color principal para las marcas, color de texto para etiquetas y valores.
    const chart = type.slice(2);
    const surface = tpl.background || c.background;
    const color = contrast(c.primary, surface) >= 2 ? c.primary : ink;
    return {
      id: uid('grafica'),
      name: `Gráfica: ${CHART_TYPES[chart].toLowerCase()}`,
      kind: 'chart',
      chart,
      x: m,
      y: 0,
      w: W - 2 * m,
      h: round((chart === 'stats' ? 220 : chart === 'hbar' ? 420 : 480) * k),
      data: SAMPLE_DATA[chart],
      color,
      track: mix(color, surface, 0.82),
      text: ink,
      surface,
      palette: categoricalPalette(c.primary, c.secondary, surface),
      font: f.body,
      headingFont: f.heading,
      labelSize: round(28 * k),
    };
  }
  return { id: uid(type), name: BLOCK_LABEL[type], ...make[type]() };
}

// ---------- Editor ----------

export function mountTemplateEditor(container, initial, { onSave, onCancel }) {
  const ed = { tpl: clone(initial), sel: null, hist: [], fut: [], pending: null, scale: 1, editing: null, drag: null };
  const q = (sel) => container.querySelector(sel);
  const layerById = (id) => ed.tpl.layers.find((l) => l.id === id);
  const size = () => customSize(ed.tpl);

  // ---------- Historial ----------
  const begin = () => {
    ed.pending ??= JSON.stringify(ed.tpl);
  };
  const commit = () => {
    if (ed.pending && ed.pending !== JSON.stringify(ed.tpl)) {
      ed.hist.push(ed.pending);
      if (ed.hist.length > 80) ed.hist.shift();
      ed.fut = [];
    }
    ed.pending = null;
    updateBar();
  };
  const change = (fn) => {
    begin();
    fn();
    commit();
  };
  function undo(redo = false) {
    const from = redo ? ed.fut : ed.hist;
    const to = redo ? ed.hist : ed.fut;
    if (!from.length) return;
    to.push(JSON.stringify(ed.tpl));
    ed.tpl = JSON.parse(from.pop());
    if (ed.sel && ed.sel !== LOGO && !layerById(ed.sel)) ed.sel = null;
    renderAll();
  }

  // ---------- Render ----------
  function shell() {
    container.innerHTML = `
      <div class="te" tabindex="-1">
        <div class="te-bar">
          <button class="btn ghost small" data-te="cancel">← Volver sin guardar</button>
          <input class="te-name" data-te-tpl="name" value="${esc(ed.tpl.name)}" aria-label="Nombre de la plantilla" maxlength="80" />
          <div class="te-history">
            <button class="icon-btn" data-te="undo" title="Deshacer (⌘/Ctrl+Z)" aria-label="Deshacer">↶</button>
            <button class="icon-btn" data-te="redo" title="Rehacer (⌘/Ctrl+Mayús+Z)" aria-label="Rehacer">↷</button>
          </div>
          <button class="btn primary small" data-te="save">Guardar plantilla</button>
        </div>
        <div class="te-body">
          <aside class="te-left">
            ${BLOCKS.map(
              (g) => `<h3>${esc(g.group)}</h3><div class="te-blocks">${g.items
                .map(([type, label]) => `<button class="te-block" draggable="true" data-block="${type}" title="Arrastra al lienzo o pulsa para añadir"><span>${ICONS[type]}</span>${esc(label)}</button>`)
                .join('')}</div>`,
            ).join('')}
            <h3>Capas <small class="muted">arriba = delante</small></h3>
            <ol class="te-layers"></ol>
          </aside>
          <main class="te-center">
            <div class="te-stage-wrap"><div class="te-stage"></div></div>
            <p class="muted small te-hint">Arrastra bloques al lienzo · doble clic para escribir · Supr borra · ⌘/Ctrl+Z deshace · flechas para mover</p>
          </main>
          <aside class="te-right"><div class="te-props"></div></aside>
        </div>
      </div>`;
  }

  function fitScale() {
    const wrap = q('.te-stage-wrap');
    if (!wrap) return;
    const { w, h } = size();
    const avail = wrap.parentElement.clientWidth - 2;
    // A pantalla completa: el alto del área central (menos la nota de atajos); si no, el de la ventana.
    const center = wrap.parentElement;
    const fixedHeight = getComputedStyle(center).overflowY === 'auto' ? center.clientHeight - 56 : 0;
    const maxH = Math.max(320, fixedHeight > 200 ? fixedHeight : window.innerHeight - 190);
    ed.scale = Math.min(avail / w, maxH / h, 1);
    const stage = q('.te-stage');
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.transform = `scale(${ed.scale})`;
    wrap.style.width = `${w * ed.scale}px`;
    wrap.style.height = `${h * ed.scale}px`;
    stage.style.setProperty('--inv', 1 / ed.scale);
  }

  function elementHtml(l) {
    const sel = ed.sel === l.id ? ' is-selected' : '';
    if (l.kind === 'shape') return `<div class="te-el${sel}" data-id="${l.id}" style="${esc(layerCss(l))}"></div>`;
    if (l.kind === 'chart') return `<div class="te-el te-chart${sel}" data-id="${l.id}" style="${esc(layerCss(l))}">${chartSvg(l)}</div>`;
    if (l.kind === 'image') {
      const src = cachedAssetUrl(l.assetId);
      return src
        ? `<img class="te-el${sel}" data-id="${l.id}" src="${esc(src)}" alt="" draggable="false" style="${esc(layerCss(l))}" />`
        : `<div class="te-el te-ph${sel}" data-id="${l.id}" style="${esc(`${layerCss(l)};display:grid`)}"><span>Imagen<br><small>Súbela aquí o elígela al crear el post</small></span></div>`;
    }
    return `<div class="te-el te-text${sel}" data-id="${l.id}" style="${esc(layerCss(l))}">${esc(l.sample ?? '')}</div>`;
  }

  function renderStage() {
    const t = ed.tpl;
    const bg = cachedAssetUrl(t.bgAssetId);
    const logo = t.logo?.show ? cachedAssetUrl(getKit().theme.logoAssetId) : null;
    q('.te-stage').innerHTML = `
      <div class="te-bg" style="${esc(bg ? `background-color:${t.background || '#ffffff'};background-image:url('${bg}')` : fillCss(t.background, t.fill))}"></div>
      ${t.overlay ? `<div class="te-bg" style="background:${esc(t.overlay.color)};opacity:${Number(t.overlay.opacity) || 0}"></div>` : ''}
      ${logo ? `<img class="te-el${ed.sel === LOGO ? ' is-selected' : ''}" data-id="${LOGO}" src="${esc(logo)}" alt="Logo" draggable="false" style="position:absolute;left:${t.logo.x}px;top:${t.logo.y}px;height:${t.logo.h}px;width:auto" />` : ''}
      ${t.layers.map(elementHtml).join('')}
      <div class="te-guides"></div>
      <div class="te-selbox" hidden></div>`;
    fitScale();
    placeSelection();
  }

  function selectedEl() {
    return ed.sel ? q(`.te-stage [data-id="${CSS.escape(ed.sel)}"]`) : null;
  }

  // Marco y tiradores del elemento seleccionado (en coordenadas del lienzo).
  function placeSelection() {
    const box = q('.te-selbox');
    const el = selectedEl();
    if (!box) return;
    if (!el || ed.editing) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.style.left = `${el.offsetLeft}px`;
    box.style.top = `${el.offsetTop}px`;
    box.style.width = `${el.offsetWidth}px`;
    box.style.height = `${el.offsetHeight}px`;
    const l = layerById(ed.sel);
    const handles = ed.sel === LOGO ? ['se'] : isText(l || {}) ? ['w', 'e', 'se'] : ['e', 's', 'se'];
    box.innerHTML = handles.map((h) => `<span class="te-handle te-h-${h}" data-handle="${h}"></span>`).join('');
  }

  function renderLayers() {
    const list = q('.te-layers');
    const texts = ed.tpl.layers.filter(isText);
    const roles = { [texts[0]?.id]: 'Titular', [texts[1]?.id]: 'Texto' };
    const icon = (l) => (l.kind === 'chart' ? ICONS[`g-${l.chart}`] : l.kind === 'shape' ? (l.radius >= 999 ? ICONS.circulo : ICONS.bloque) : l.kind === 'image' ? ICONS.imagen : l.bg ? ICONS.boton : 'T');
    const rows = [...ed.tpl.layers]
      .reverse()
      .map(
        (l) => `<li class="te-layer${ed.sel === l.id ? ' is-selected' : ''}" draggable="true" data-layer="${l.id}">
          <span class="te-layer-icon">${icon(l)}</span>
          <span class="te-layer-name">${esc(l.name || 'Capa')}${isText(l) && l.sample ? `<small>${esc(String(l.sample).slice(0, 40))}</small>` : ''}</span>
          ${roles[l.id] ? `<span class="badge badge-aprobado" title="Al crear un post, aquí va el ${roles[l.id].toLowerCase()}">${roles[l.id]}</span>` : ''}
        </li>`,
      );
    if (ed.tpl.logo?.show && getKit().theme.logoAssetId) rows.unshift(`<li class="te-layer${ed.sel === LOGO ? ' is-selected' : ''}" data-layer="${LOGO}"><span class="te-layer-icon">${ICONS.logo}</span><span class="te-layer-name">Logo</span></li>`);
    list.innerHTML = rows.join('') || '<li class="muted small te-empty">Arrastra un bloque al lienzo para empezar.</li>';
  }

  // ---------- Propiedades ----------
  const field = (label, html, cls = '') => `<label class="ed-field ${cls}"><span>${esc(label)}</span>${html}</label>`;
  const num = (label, prop, value, { min = 0, max = 5000, step = 1 } = {}) =>
    field(label, `<input type="number" data-te-prop="${prop}" value="${esc(value ?? '')}" min="${min}" max="${max}" step="${step}" />`);
  // Selector de color con los colores de la marca a un clic.
  const swatches = () => {
    const { primary, secondary, background, text } = getKit().brand.colors;
    return [...new Set([primary, secondary, background, text, '#ffffff', '#000000'].filter(Boolean).map((c) => c.toLowerCase()))];
  };
  const picker = (label, attr, path, value) => `
    <div class="ed-field te-color"><span>${esc(label)}</span>
      <input type="color" ${attr}="${path}" value="${esc(value || '#000000')}" aria-label="${esc(label)}" />
      <span class="te-swatches">${swatches().map((c) => `<button type="button" class="te-swatch${c === String(value).toLowerCase() ? ' active' : ''}" data-te="swatch" data-color="${c}" style="background:${c}" title="${c}" aria-label="Usar ${c}"></button>`).join('')}</span>
    </div>`;
  const color = (label, prop, value) => picker(label, 'data-te-prop', prop, value);
  const tplColor = (label, path, value) => picker(label, 'data-te-tpl', path, value);
  const range = (label, attr, path, value, min, max, step = 1) => field(label, `<input type="range" ${attr}="${path}" min="${min}" max="${max}" step="${step}" value="${esc(value)}" />`);
  const check = (label, prop, on) => `<label class="check"><input type="checkbox" data-te-prop="${prop}" ${on ? 'checked' : ''} /> ${esc(label)}</label>`;

  function canvasProps() {
    const t = ed.tpl;
    const hasLogo = Boolean(getKit().theme.logoAssetId);
    return `
      <h3>Lienzo</h3>
      ${field('Tamaño', `<select data-te-tpl="size">${t.size === 'custom' ? `<option value="custom" selected>${esc(customSize(t).label)}</option>` : ''}${Object.entries(CUSTOM_SIZES)
        .map(([k, v]) => `<option value="${k}" ${t.size === k ? 'selected' : ''}>${esc(v.label)}</option>`)
        .join('')}</select>`)}
      ${t.bgAssetId ? '' : backgroundProps(t)}
      <div class="ed-field"><span>Imagen de fondo</span>
        <label class="btn ghost small">${t.bgAssetId ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/*" data-te-file="bg" hidden /></label>
        ${t.bgAssetId ? '<button class="link danger" data-te="remove-bg">Quitar imagen</button>' : '<small class="muted">Por ejemplo, un diseño exportado de Figma o Canva.</small>'}
      </div>
      ${
        t.bgAssetId
          ? `<label class="check"><input type="checkbox" data-te-tpl="overlay" ${t.overlay ? 'checked' : ''} /> Oscurecer o teñir la imagen</label>
             ${t.overlay ? `<div class="ed-row">${field('Color', `<input type="color" data-te-tpl="overlay.color" value="${esc(t.overlay.color)}" />`)}${field('Opacidad', `<input type="range" min="0" max="0.9" step="0.05" data-te-tpl="overlay.opacity" value="${esc(t.overlay.opacity)}" />`)}</div>` : ''}`
          : ''
      }
      ${hasLogo ? `<label class="check"><input type="checkbox" data-te-tpl="logo.show" ${t.logo?.show ? 'checked' : ''} /> Mostrar mi logo</label>` : '<button class="btn ghost small" data-te="upload-logo">Subir mi logo</button>'}
      <p class="muted small">Selecciona un elemento del lienzo para cambiarlo. Al crear un post, el primer texto recibe el titular y el segundo el texto (mira las etiquetas en Capas).</p>`;
  }

  function backgroundProps(t) {
    const mode = !t.fill?.kind ? 'solid' : t.fill.kind === 'pattern' ? 'pattern' : 'gradient';
    const f = t.fill || {};
    const themes = fillThemes(getKit().brand.colors);
    return `
      <div class="ed-field"><span>Temas</span>
        <div class="te-themes">${themes.map((th, i) => `<button type="button" class="te-theme" data-te="theme" data-index="${i}" title="${esc(th.name)}" aria-label="Tema ${esc(th.name)}" style="${esc(fillCss(th.background, th.fill, 0.18))}"></button>`).join('')}</div>
        <small class="muted">Hechos con tus colores de marca. Si el texto deja de leerse, se ajusta su color.</small>
      </div>
      <div class="ed-field"><span>Fondo</span>
        <div class="te-align" role="group" aria-label="Tipo de fondo">${Object.entries({ solid: 'Color', gradient: 'Degradado', pattern: 'Textura' })
          .map(([k, v]) => `<button type="button" class="chip ${mode === k ? 'active' : ''}" data-te="fill-mode" data-value="${k}">${v}</button>`)
          .join('')}</div>
      </div>
      ${
        mode === 'solid'
          ? tplColor('Color de fondo', 'background', t.background || '#ffffff')
          : mode === 'gradient'
            ? `${field('Estilo', `<select data-te-tpl="fill.kind">${Object.entries(GRADIENT_KINDS).map(([k, v]) => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
               ${tplColor('Color 1', 'fill.from', f.from)}
               ${tplColor('Color 2', 'fill.to', f.to)}
               ${f.kind === 'aurora' ? tplColor('Color de base', 'background', t.background) : ''}
               ${f.kind === 'linear' ? range('Ángulo', 'data-te-tpl', 'fill.angle', f.angle ?? 135, 0, 360, 5) : ''}`
            : `${field('Textura', `<select data-te-tpl="fill.pattern">${Object.entries(PATTERNS).map(([k, v]) => `<option value="${k}" ${f.pattern === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
               ${tplColor('Color de base', 'background', t.background)}
               ${tplColor('Color de la textura', 'fill.color', f.color)}
               ${range('Tamaño', 'data-te-tpl', 'fill.size', f.size ?? 48, 12, 240, 4)}`
      }`;
  }

  // Al elegir un tema, los textos que dejarían de leerse toman un color legible de la marca.
  function applyTheme(th) {
    const brand = getKit().brand.colors;
    const base = fillBase(th.background, th.fill);
    change(() => {
      ed.tpl.background = th.background;
      ed.tpl.fill = th.fill ? { ...th.fill } : null;
      for (const l of ed.tpl.layers) {
        if (isText(l) && !l.bg) l.color = readableText(l.color, base, brand);
        if (l.kind === 'chart') l.text = readableText(l.text, base, brand);
      }
    });
  }

  function setFillMode(mode) {
    const t = ed.tpl;
    const { primary, secondary } = getKit().brand.colors;
    const bg = t.background || '#ffffff';
    change(() => {
      if (mode === 'solid') t.fill = null;
      else if (mode === 'gradient') t.fill = { kind: 'linear', angle: 135, from: t.fill?.from || primary, to: t.fill?.to || secondary };
      else t.fill = { kind: 'pattern', pattern: 'dots', color: mix(bg, primary, 0.3), size: 48 };
    });
  }

  function layerActions() {
    return `<div class="te-actions">
      <button class="btn ghost small" data-te="front" title="Traer al frente">Al frente</button>
      <button class="btn ghost small" data-te="back" title="Enviar al fondo">Al fondo</button>
      <button class="btn ghost small" data-te="duplicate" title="⌘/Ctrl+D">Duplicar</button>
      <button class="btn ghost small danger" data-te="delete" title="Supr">Borrar</button>
    </div>`;
  }

  function position(l, withHeight) {
    return `<div class="ed-row">${num('X', 'x', l.x, { min: -2000 })}${num('Y', 'y', l.y, { min: -2000 })}${num('Ancho', 'w', l.w, { min: 10 })}${withHeight ? num('Alto', 'h', l.h, { min: 2 }) : ''}</div>`;
  }

  function textProps(l) {
    const fonts = allFontFamilies();
    if (l.font && !fonts.includes(l.font)) fonts.unshift(l.font);
    return `
      ${field('Nombre', `<input type="text" data-te-prop="name" value="${esc(l.name || '')}" maxlength="40" />`)}
      ${field('Texto', `<textarea data-te-prop="sample" rows="3">${esc(l.sample || '')}</textarea>`)}
      ${field('Tipografía', `<select data-te-prop="font">${fonts.map((f) => `<option ${f === l.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>`)}
      <div class="ed-row">
        ${num('Tamaño', 'size', l.size, { min: 6, max: 600 })}
        ${field('Peso', `<select data-te-prop="weight">${WEIGHTS.map((w) => `<option ${Number(l.weight) === w ? 'selected' : ''}>${w}</option>`).join('')}</select>`)}
        ${color('Color', 'color', l.color)}
      </div>
      <div class="te-align" role="group" aria-label="Alineación">
        ${['left', 'center', 'right'].map((a) => `<button class="chip ${l.align === a ? 'active' : ''}" data-te="align" data-value="${a}">${{ left: 'Izquierda', center: 'Centro', right: 'Derecha' }[a]}</button>`).join('')}
      </div>
      <div class="ed-row">
        ${num('Interlineado', 'lineHeight', l.lineHeight ?? 1.2, { min: 0.6, max: 3, step: 0.05 })}
        ${num('Espaciado', 'letterSpacing', l.letterSpacing ?? 0, { min: -0.1, max: 1, step: 0.01 })}
      </div>
      <div class="te-checks">${check('Mayúsculas', 'uppercase', l.uppercase)}${check('Cursiva', 'italic', l.italic)}${check('Fondo (botón)', 'bg', Boolean(l.bg))}</div>
      ${l.bg ? `<div class="ed-row">${color('Fondo', 'bg', l.bg)}${num('Relleno X', 'padX', l.padX ?? 28)}${num('Relleno Y', 'padY', l.padY ?? 16)}${num('Redondeo', 'radius', l.radius ?? 0, { max: 999 })}</div>` : ''}
      ${position(l, false)}
      ${field('Opacidad', `<input type="range" min="0.1" max="1" step="0.05" data-te-prop="opacity" value="${esc(l.opacity ?? 1)}" />`)}`;
  }

  function shapeProps(l) {
    return `
      ${field('Nombre', `<input type="text" data-te-prop="name" value="${esc(l.name || '')}" maxlength="40" />`)}
      <div class="ed-field"><span>Relleno</span>
        <div class="te-align" role="group" aria-label="Relleno">
          <button type="button" class="chip ${l.gradient ? '' : 'active'}" data-te="shape-fill" data-value="solid">Color</button>
          <button type="button" class="chip ${l.gradient ? 'active' : ''}" data-te="shape-fill" data-value="gradient">Degradado</button>
        </div>
      </div>
      ${
        l.gradient
          ? `${color('Color 1', 'gradient.from', l.gradient.from)}${color('Color 2', 'gradient.to', l.gradient.to)}${range('Ángulo', 'data-te-prop', 'gradient.angle', l.gradient.angle ?? 135, 0, 360, 5)}`
          : color('Color', 'color', l.color)
      }
      ${num('Redondeo', 'radius', l.radius ?? 0, { max: 9999 })}
      ${position(l, true)}
      ${field('Opacidad', `<input type="range" min="0.05" max="1" step="0.05" data-te-prop="opacity" value="${esc(l.opacity ?? 1)}" />`)}`;
  }

  function chartProps(l) {
    return `
      ${field('Nombre', `<input type="text" data-te-prop="name" value="${esc(l.name || '')}" maxlength="40" />`)}
      ${field('Tipo', `<select data-te-prop="chart">${Object.entries(CHART_TYPES).map(([k, v]) => `<option value="${k}" ${l.chart === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`)}
      ${field('Datos de ejemplo', `<textarea data-te-prop="data" rows="5">${esc(l.data || '')}</textarea>`)}
      <small class="muted">Una línea por dato: valor | etiqueta (por ejemplo, "48% | Research"). En cada post se pueden cambiar.</small>
      <div class="ed-row">${color('Color', 'color', l.color)}${color('Texto', 'text', l.text)}${num('Tamaño texto', 'labelSize', l.labelSize, { min: 10, max: 120 })}</div>
      ${l.chart === 'hbar' ? `<div class="ed-row">${color('Pista', 'track', l.track)}</div>` : ''}
      ${l.chart === 'donut' ? `<div class="ed-row">${(l.palette || []).map((c, i) => color(`Color ${i + 1}`, `palette.${i}`, c)).join('')}</div>` : ''}
      ${position(l, true)}
      ${field('Opacidad', `<input type="range" min="0.1" max="1" step="0.05" data-te-prop="opacity" value="${esc(l.opacity ?? 1)}" />`)}`;
  }

  function imageProps(l) {
    return `
      ${field('Nombre', `<input type="text" data-te-prop="name" value="${esc(l.name || '')}" maxlength="40" />`)}
      <div class="ed-field"><span>Imagen</span><label class="btn ghost small">${l.assetId ? 'Cambiar imagen' : 'Subir imagen'}<input type="file" accept="image/*" data-te-file="image" hidden /></label></div>
      ${num('Redondeo', 'radius', l.radius ?? 0, { max: 9999 })}
      ${position(l, true)}
      ${field('Opacidad', `<input type="range" min="0.05" max="1" step="0.05" data-te-prop="opacity" value="${esc(l.opacity ?? 1)}" />`)}`;
  }

  function renderProps() {
    const panel = q('.te-props');
    if (!panel) return;
    if (ed.sel === LOGO) {
      const lg = ed.tpl.logo;
      panel.innerHTML = `<h3>Logo</h3>
        <div class="ed-row">${num('X', 'logo.x', lg.x, { min: -2000 })}${num('Y', 'logo.y', lg.y, { min: -2000 })}${num('Alto', 'logo.h', lg.h, { min: 10 })}</div>
        <div class="te-actions"><button class="btn ghost small danger" data-te="delete">Quitar logo</button></div>`;
      return;
    }
    const l = layerById(ed.sel);
    if (!l) {
      panel.innerHTML = canvasProps();
      return;
    }
    const title = l.kind === 'chart' ? 'Gráfica' : l.kind === 'shape' ? 'Forma' : l.kind === 'image' ? 'Imagen' : 'Texto';
    panel.innerHTML = `<div class="te-props-head"><h3>${title}</h3><button class="link" data-te="deselect">Lienzo</button></div>
      ${l.kind === 'chart' ? chartProps(l) : l.kind === 'shape' ? shapeProps(l) : l.kind === 'image' ? imageProps(l) : textProps(l)}
      ${layerActions()}`;
  }

  function updateBar() {
    const undoBtn = q('[data-te="undo"]');
    const redoBtn = q('[data-te="redo"]');
    if (undoBtn) undoBtn.disabled = !ed.hist.length;
    if (redoBtn) redoBtn.disabled = !ed.fut.length;
  }

  function renderAll() {
    renderStage();
    renderLayers();
    renderProps();
    updateBar();
  }

  function select(id) {
    if (ed.sel === id) return;
    ed.sel = id;
    container.querySelectorAll('.te-stage .is-selected').forEach((el) => el.classList.remove('is-selected'));
    selectedEl()?.classList.add('is-selected');
    placeSelection();
    renderLayers();
    renderProps();
  }

  // Cambio de una capa sin redibujar todo (mientras se arrastra o se escribe).
  function refreshElement(id) {
    const el = q(`.te-stage [data-id="${CSS.escape(id)}"]`);
    if (!el) return renderStage();
    if (id === LOGO) {
      const lg = ed.tpl.logo;
      Object.assign(el.style, { left: `${lg.x}px`, top: `${lg.y}px`, height: `${lg.h}px` });
    } else {
      const l = layerById(id);
      el.setAttribute('style', layerCss(l));
      if (l.kind === 'chart') el.innerHTML = chartSvg(l);
      if (isText(l) && ed.editing !== id && el.textContent !== (l.sample ?? '')) el.textContent = l.sample ?? '';
    }
    placeSelection();
  }

  function syncPositionFields() {
    const l = ed.sel === LOGO ? ed.tpl.logo : layerById(ed.sel);
    if (!l) return;
    const prefix = ed.sel === LOGO ? 'logo.' : '';
    for (const key of ['x', 'y', 'w', 'h', 'size']) {
      const input = q(`[data-te-prop="${prefix}${key}"]`);
      if (input && document.activeElement !== input && l[key] !== undefined) input.value = round(l[key]);
    }
  }

  // ---------- Altas, bajas y orden ----------
  function pickLogo(at) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      toast('Subiendo tu logo…');
      try {
        await setLogo(file);
        await assetUrl(getKit().theme.logoAssetId);
      } catch (err) {
        toast(err.message || 'No se pudo subir el logo');
        return;
      }
      if (!container.isConnected) return;
      addBlock('logo', at);
      toast('Logo añadido ✓ (queda guardado en Colores y tipografía)');
    });
    input.click();
  }

  function addBlock(type, at) {
    if (type === 'logo') {
      if (!getKit().theme.logoAssetId) {
        // Sin logo todavía: se sube aquí mismo y queda guardado también en Colores y tipografía.
        pickLogo(at);
        return;
      }
      change(() => {
        const { w, h } = size();
        const lg = { x: 80, y: h - 160, h: round(80 * (w / 1080)), ...ed.tpl.logo, show: true };
        if (at) Object.assign(lg, { x: round(at.x - lg.h), y: round(at.y - lg.h / 2) });
        ed.tpl.logo = lg;
      });
      ed.sel = LOGO;
      renderAll();
      return;
    }
    const layer = blockLayer(type, ed.tpl);
    const { w: W, h: H } = size();
    const approxH = layer.h ?? layer.size * (layer.lineHeight || 1.2) * (String(layer.sample || '').split('\n').length || 1);
    if (at) {
      layer.x = round(Math.min(Math.max(0, at.x - layer.w / 2), W - Math.min(layer.w, W)));
      layer.y = round(Math.min(Math.max(0, at.y - approxH / 2), H - approxH));
    } else {
      // Debajo del último elemento, o centrado si no cabe.
      const bottom = Math.max(0, ...[...container.querySelectorAll('.te-stage .te-el')].map((el) => el.offsetTop + el.offsetHeight));
      layer.y = round(bottom + 40 <= H - approxH ? bottom + 40 : (H - approxH) / 2);
      if (type === 'cifra' || type === 'boton' || type === 'circulo') layer.x = round((W - layer.w) / 2);
    }
    change(() => ed.tpl.layers.push(layer));
    ed.sel = layer.id;
    renderAll();
  }

  function removeSelected() {
    if (!ed.sel) return;
    change(() => {
      if (ed.sel === LOGO) ed.tpl.logo = { ...ed.tpl.logo, show: false };
      else ed.tpl.layers = ed.tpl.layers.filter((l) => l.id !== ed.sel);
    });
    ed.sel = null;
    renderAll();
  }

  function duplicateSelected() {
    const l = layerById(ed.sel);
    if (!l) return;
    const copy = { ...clone(l), id: uid('capa'), name: `${l.name || 'Capa'} (copia)`, x: l.x + 24, y: l.y + 24 };
    change(() => ed.tpl.layers.splice(ed.tpl.layers.indexOf(l) + 1, 0, copy));
    ed.sel = copy.id;
    renderAll();
  }

  function moveLayer(id, toIndex) {
    const from = ed.tpl.layers.findIndex((l) => l.id === id);
    if (from < 0) return;
    change(() => {
      const [l] = ed.tpl.layers.splice(from, 1);
      ed.tpl.layers.splice(Math.max(0, Math.min(toIndex, ed.tpl.layers.length)), 0, l);
    });
    renderAll();
  }

  // ---------- Arrastrar en el lienzo ----------
  function stagePoint(e) {
    const r = q('.te-stage').getBoundingClientRect();
    return { x: (e.clientX - r.left) / ed.scale, y: (e.clientY - r.top) / ed.scale };
  }

  // Imán: bordes y centro del lienzo, márgenes y bordes/centros de los demás elementos.
  function snapTargets(excludeId) {
    const { w: W, h: H } = size();
    const m = round(80 * (W / 1080));
    const xs = [0, m, W / 2, W - m, W];
    const ys = [0, m, H / 2, H - m, H];
    for (const el of container.querySelectorAll('.te-stage .te-el')) {
      if (el.dataset.id === excludeId) continue;
      xs.push(el.offsetLeft, el.offsetLeft + el.offsetWidth / 2, el.offsetLeft + el.offsetWidth);
      ys.push(el.offsetTop, el.offsetTop + el.offsetHeight / 2, el.offsetTop + el.offsetHeight);
    }
    return { xs, ys };
  }

  function snapAxis(edges, targets) {
    const threshold = 6 / ed.scale;
    let best = null;
    for (const [i, e] of edges.entries()) {
      for (const t of targets) {
        const d = t - e;
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: t, i };
      }
    }
    return best;
  }

  function drawGuides(lines) {
    const g = q('.te-guides');
    if (!g) return;
    const { w: W, h: H } = size();
    g.innerHTML = lines
      .map((l) => (l.axis === 'x' ? `<i style="left:${l.at}px;top:0;height:${H}px;width:calc(1px * var(--inv))"></i>` : `<i style="top:${l.at}px;left:0;width:${W}px;height:calc(1px * var(--inv))"></i>`))
      .join('');
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const handle = e.target.closest('.te-handle');
    const el = e.target.closest('.te-stage .te-el');
    if (!handle && !el) {
      if (e.target.closest('.te-stage')) {
        if (ed.editing) q(`.te-stage [data-id="${CSS.escape(ed.editing)}"]`)?.blur();
        select(null);
      }
      return;
    }
    const id = handle ? ed.sel : el.dataset.id;
    if (ed.editing === id) return; // escribiendo: el ratón selecciona texto
    e.preventDefault();
    select(id);
    const target = id === LOGO ? ed.tpl.logo : layerById(id);
    const domEl = selectedEl();
    begin();
    ed.drag = {
      id,
      mode: handle ? handle.dataset.handle : 'move',
      start: stagePoint(e),
      orig: { ...target },
      box: { w: domEl.offsetWidth, h: domEl.offsetHeight },
      targets: snapTargets(id),
    };
    q('.te-stage').setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const d = ed.drag;
    if (!d) return;
    const p = stagePoint(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const target = d.id === LOGO ? ed.tpl.logo : layerById(d.id);
    const guides = [];
    if (d.mode === 'move') {
      let x = d.orig.x + dx;
      let y = d.orig.y + dy;
      if (!e.altKey) {
        const sx = snapAxis([x, x + d.box.w / 2, x + d.box.w], d.targets.xs);
        const sy = snapAxis([y, y + d.box.h / 2, y + d.box.h], d.targets.ys);
        if (sx) {
          x += sx.d;
          guides.push({ axis: 'x', at: sx.line });
        }
        if (sy) {
          y += sy.d;
          guides.push({ axis: 'y', at: sy.line });
        }
      }
      target.x = round(x);
      target.y = round(y);
    } else if (d.id === LOGO) {
      target.h = round(Math.max(10, d.orig.h + dy));
    } else {
      const l = target;
      const minW = 20;
      if (d.mode === 'e') l.w = round(Math.max(minW, d.orig.w + dx));
      if (d.mode === 'w') {
        const w = Math.max(minW, d.orig.w - dx);
        l.x = round(d.orig.x + d.orig.w - w);
        l.w = round(w);
      }
      if (d.mode === 's') l.h = round(Math.max(2, d.orig.h + dy));
      if (d.mode === 'se') {
        if (isText(l)) {
          // En textos, la esquina escala el tamaño de letra con el ancho.
          const ratio = Math.max(0.1, (d.orig.w + dx) / d.orig.w);
          l.w = round(d.orig.w * ratio);
          l.size = Math.max(6, round(d.orig.size * ratio));
        } else {
          l.w = round(Math.max(minW, d.orig.w + dx));
          l.h = round(e.shiftKey ? (l.w * d.orig.h) / d.orig.w : Math.max(2, d.orig.h + dy));
        }
      }
    }
    drawGuides(guides);
    refreshElement(d.id);
    syncPositionFields();
  }

  function onPointerUp() {
    if (!ed.drag) return;
    ed.drag = null;
    drawGuides([]);
    commit();
    syncPositionFields();
  }

  // ---------- Escribir en el lienzo ----------
  function startEditing(el) {
    const l = layerById(el.dataset.id);
    if (!l || !isText(l)) return;
    ed.editing = l.id;
    begin();
    try {
      el.contentEditable = 'plaintext-only';
    } catch {
      el.contentEditable = 'true'; // navegadores sin "plaintext-only"
    }
    el.classList.add('is-editing');
    placeSelection();
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    el.addEventListener('input', () => {
      l.sample = el.innerText.replace(/\n$/, '');
      placeSelection();
      const ta = q('[data-te-prop="sample"]');
      if (ta) ta.value = l.sample;
    });
    el.addEventListener(
      'blur',
      () => {
        el.contentEditable = 'false';
        el.classList.remove('is-editing');
        ed.editing = null;
        commit();
        placeSelection();
        renderLayers();
      },
      { once: true },
    );
  }

  // ---------- Eventos ----------
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value;
  }

  function valueOf(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number' || input.type === 'range') return input.value === '' ? 0 : Number(input.value);
    return input.value;
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.teProp) {
      const path = el.dataset.teProp;
      begin();
      if (path.startsWith('logo.')) setPath(ed.tpl, path, valueOf(el));
      else {
        const l = layerById(ed.sel);
        if (!l) return;
        let v = valueOf(el);
        if (path === 'weight') v = Number(v);
        if (path === 'bg' && el.type === 'checkbox') v = v ? getKit().brand.colors.primary : null;
        if (path.startsWith('palette.')) {
          l.palette = [...(l.palette || [])];
          l.palette[Number(path.split('.')[1])] = v;
        } else if (path.includes('.')) setPath(l, path, v);
        else l[path] = v;
      }
      refreshElement(ed.sel);
      if (path === 'name' || path === 'sample') renderLayers();
      // Al cambiar el tipo de gráfica se proponen sus datos de ejemplo si no se habían tocado.
      if (path === 'chart') {
        const l = layerById(ed.sel);
        if (Object.values(SAMPLE_DATA).includes(l.data)) l.data = SAMPLE_DATA[l.chart];
        l.name = `Gráfica: ${CHART_TYPES[l.chart].toLowerCase()}`;
        refreshElement(l.id);
        renderLayers();
      }
      // Las casillas y desplegables cambian qué campos se ven.
      if (el.type === 'checkbox' || el.tagName === 'SELECT') {
        commit();
        renderProps();
      }
    } else if (el.dataset.teTpl) {
      const path = el.dataset.teTpl;
      begin();
      if (path === 'overlay') ed.tpl.overlay = el.checked ? { color: '#000000', opacity: 0.45 } : null;
      else if (path === 'logo.show') ed.tpl.logo = { x: 80, y: size().h - 160, h: 80, ...ed.tpl.logo, show: el.checked };
      else setPath(ed.tpl, path, valueOf(el));
      if (path === 'name') return;
      renderStage();
      if (el.type === 'checkbox' || el.tagName === 'SELECT') {
        commit();
        renderLayers();
        renderProps();
      }
    }
  }

  async function onChange(e) {
    const el = e.target;
    if ((el.dataset.teProp || el.dataset.teTpl) && el.type !== 'checkbox' && el.tagName !== 'SELECT') commit();
    if (!el.dataset.teFile || !el.files[0]) return;
    try {
      const file = el.files[0];
      const id = await storeImage(file);
      await assetUrl(id);
      const inUse = (asset) => asset && getKit().customTemplates.some((t) => t.bgAssetId === asset || t.layers?.some((l) => l.assetId === asset));
      if (el.dataset.teFile === 'bg') {
        const old = ed.tpl.bgAssetId;
        // Si la imagen tiene las proporciones de uno de los tamaños, se usa ese tamaño.
        const img = await createImageBitmap(file).catch(() => null);
        const match = img && Object.entries(CUSTOM_SIZES).find(([, s]) => Math.abs(s.w / s.h - img.width / img.height) < 0.02);
        change(() => {
          ed.tpl.bgAssetId = id;
          if (match) ed.tpl.size = match[0];
        });
        if (old && old !== initial.bgAssetId && !inUse(old)) deleteAsset(old).catch(() => {});
      } else {
        const l = layerById(ed.sel);
        if (!l) return;
        const old = l.assetId;
        const img = await createImageBitmap(file).catch(() => null);
        change(() => {
          l.assetId = id;
          if (img && !old) l.h = round((l.w * img.height) / img.width); // primera imagen: sus proporciones
        });
        if (old && !initial.layers?.some((x) => x.assetId === old) && !inUse(old)) deleteAsset(old).catch(() => {});
      }
      renderAll();
    } catch (err) {
      toast(err.message || 'No se pudo subir la imagen');
    }
  }

  function onClick(e) {
    const block = e.target.closest('[data-block]');
    if (block) return addBlock(block.dataset.block);
    const row = e.target.closest('[data-layer]');
    if (row) return select(row.dataset.layer);
    const btn = e.target.closest('[data-te]');
    if (!btn) return;
    e.preventDefault();
    const l = layerById(ed.sel);
    switch (btn.dataset.te) {
      case 'cancel':
        return onCancel();
      case 'save':
        ed.tpl.name = ed.tpl.name?.trim() || 'Plantilla';
        return onSave(ed.tpl);
      case 'undo':
        return undo();
      case 'redo':
        return undo(true);
      case 'deselect':
        return select(null);
      case 'delete':
        return removeSelected();
      case 'duplicate':
        return duplicateSelected();
      case 'front':
        return l && moveLayer(l.id, ed.tpl.layers.length);
      case 'back':
        return l && moveLayer(l.id, 0);
      case 'align':
        if (l) {
          change(() => (l.align = btn.dataset.value));
          refreshElement(l.id);
          renderProps();
        }
        return;
      case 'upload-logo':
        return pickLogo();
      case 'swatch': {
        // Igual que elegirlo en el selector: así pasa por el mismo camino (deshacer incluido).
        const input = btn.closest('.te-color')?.querySelector('input[type=color]');
        if (!input) return;
        input.value = btn.dataset.color;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return renderProps();
      }
      case 'theme':
        applyTheme(fillThemes(getKit().brand.colors)[Number(btn.dataset.index)]);
        return renderAll();
      case 'fill-mode':
        setFillMode(btn.dataset.value);
        return renderAll();
      case 'shape-fill': {
        const l = layerById(ed.sel);
        if (!l) return;
        const { secondary } = getKit().brand.colors;
        change(() => (l.gradient = btn.dataset.value === 'gradient' ? { from: l.color, to: l.color?.toLowerCase() === secondary?.toLowerCase() ? mix(l.color, '#ffffff', 0.4) : secondary, angle: 135 } : undefined));
        refreshElement(l.id);
        return renderProps();
      }
      case 'remove-bg':
        change(() => {
          ed.tpl.bgAssetId = null;
          ed.tpl.overlay = null;
        });
        return renderAll();
    }
  }

  function onDblClick(e) {
    const el = e.target.closest('.te-stage .te-text');
    if (el) startEditing(el);
  }

  // Bloques y capas con arrastrar y soltar (HTML5).
  function onDragStart(e) {
    const block = e.target.closest('[data-block]');
    const row = e.target.closest('[data-layer]');
    if (block) e.dataTransfer.setData('text/plain', `posty-block:${block.dataset.block}`);
    else if (row && row.dataset.layer !== LOGO) e.dataTransfer.setData('text/plain', `posty-layer:${row.dataset.layer}`);
    else return;
    e.dataTransfer.effectAllowed = 'copyMove';
    container.classList.add('te-dragging');
  }

  function onDragOver(e) {
    if (e.target.closest('.te-stage-wrap') || e.target.closest('[data-layer]')) {
      e.preventDefault();
      container.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
      e.target.closest('[data-layer]')?.classList.add('drop-before');
      q('.te-stage-wrap').classList.toggle('drop-target', Boolean(e.target.closest('.te-stage-wrap')));
    }
  }

  function onDrop(e) {
    const data = e.dataTransfer.getData('text/plain');
    container.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
    q('.te-stage-wrap')?.classList.remove('drop-target');
    container.classList.remove('te-dragging');
    if (!data.startsWith('posty-')) return;
    e.preventDefault();
    const [kind, value] = data.split(':');
    if (kind === 'posty-block' && e.target.closest('.te-stage-wrap')) addBlock(value, stagePoint(e));
    const row = e.target.closest('[data-layer]');
    if (kind === 'posty-layer' && row && row.dataset.layer !== value && row.dataset.layer !== LOGO) {
      // La lista va de delante (arriba) a detrás: soltar encima de una fila = quedar justo delante de ella.
      const to = ed.tpl.layers.findIndex((l) => l.id === row.dataset.layer);
      const from = ed.tpl.layers.findIndex((l) => l.id === value);
      moveLayer(value, from < to ? to : to + 1);
    }
  }

  function onDragEnd() {
    container.classList.remove('te-dragging');
    q('.te-stage-wrap')?.classList.remove('drop-target');
    container.querySelectorAll('.drop-before').forEach((x) => x.classList.remove('drop-before'));
  }

  function onKey(e) {
    if (!container.isConnected) return;
    const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      return undo(e.shiftKey);
    }
    if (mod && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      return undo(true);
    }
    if (typing || !ed.sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelected();
    } else if (e.key === 'Escape') {
      select(null);
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const t = ed.sel === LOGO ? ed.tpl.logo : layerById(ed.sel);
      const step = e.shiftKey ? 10 : 1;
      change(() => {
        if (e.key === 'ArrowLeft') t.x -= step;
        if (e.key === 'ArrowRight') t.x += step;
        if (e.key === 'ArrowUp') t.y -= step;
        if (e.key === 'ArrowDown') t.y += step;
      });
      refreshElement(ed.sel);
      syncPositionFields();
    } else if (e.key === 'Enter' && isText(layerById(ed.sel) || {})) {
      e.preventDefault();
      startEditing(selectedEl());
    }
  }

  // ---------- Montaje ----------
  shell();
  renderAll();
  // Las fuentes pueden tardar: al cargar, se recolocan los marcos.
  document.fonts?.ready.then(() => placeSelection());
  const onResize = () => {
    fitScale();
    placeSelection();
  };
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerUp);
  container.addEventListener('click', onClick);
  container.addEventListener('dblclick', onDblClick);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
  container.addEventListener('focusin', (e) => {
    if (e.target.dataset?.teProp || e.target.dataset?.teTpl) begin();
  });
  container.addEventListener('dragstart', onDragStart);
  container.addEventListener('dragover', onDragOver);
  container.addEventListener('drop', onDrop);
  container.addEventListener('dragend', onDragEnd);
  // Las imágenes (logo, capas) cambian de tamaño al cargar: se recoloca el marco de selección.
  container.addEventListener('load', () => placeSelection(), true);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  return {
    getTemplate: () => ed.tpl,
    destroy() {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      container.innerHTML = '';
    },
  };
}
