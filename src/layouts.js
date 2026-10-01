// Propuestas de diseño sin IA: a partir de un texto o de una web, varias plantillas propias
// (fondo + capas de texto) con los colores y tipografías de la marca. El texto se ajusta para caber.
// Orden de capas: la 1.ª es el titular y la 2.ª el texto, porque Crear post las rellena así.

import { analyzeText, clip } from './autolayout.js';
import { CUSTOM_SIZES } from './sizes.js';

// ---------- Contenido ----------

const sentencesOf = (t) => (String(t || '').replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || []).map((s) => s.trim()).filter(Boolean);
const noBullet = (s) => s.replace(/^\s*(?:[-•*·→▪►✓✔]|\d+[.)]|[0-9]️?⃣)\s*/u, '').trim();
const noEmoji = (s) => s.replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim();

// Frase "citable": entre 40 y 140 caracteres, la más cercana a 90 (ni telegráfica ni larga).
function quoteFrom(list) {
  const options = list.filter((s) => s.length >= 40 && s.length <= 140).sort((a, b) => Math.abs(a.length - 90) - Math.abs(b.length - 90));
  return options[0] || '';
}

// Primera cifra con su contexto: "48% de los equipos…" → { value: '48%', label: 'de los equipos…' }
export function findStat(text) {
  const m = String(text || '').match(/(\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?\s?(?:x|veces|millones|mil|k)\b|\b\d{2,}(?:[.,]\d{3})*\b)\s+([^.!?\n]{6,60})/iu);
  if (!m) return null;
  return { value: m[1].replace(/\s/g, ''), label: clip(m[2].trim(), 48) };
}

export function contentFromText(raw) {
  const a = analyzeText(raw);
  const hook = noEmoji(a.hook);
  const firstSentence = sentencesOf(hook)[0] || hook;
  const rest = a.restSentences.map(noEmoji);
  const items = a.listItems.map((s) => clip(noEmoji(s), 70)).filter(Boolean);
  return {
    kicker: a.hashtags[0] ? a.hashtags[0].slice(1) : '',
    title: clip(firstSentence.replace(/[.…]+$/, ''), 90),
    body: clip(rest.slice(0, 2).join(' '), 200),
    items: items.length >= 2 ? items : rest.filter((s) => s.length <= 90).slice(1, 5).map((s) => clip(s, 70)),
    // Mejor una frase del desarrollo que repetir el titular.
    quote: quoteFrom(rest.filter((s) => !/\?\s*$/.test(s))) || quoteFrom(sentencesOf(hook)),
    stat: findStat(a.text),
    source: '',
    image: null,
  };
}

export function contentFromPage(info) {
  const text = [info.description, ...(info.paragraphs || [])].join(' ');
  const listed = (info.items?.length >= 2 ? info.items : info.headings || []).map((s) => clip(noBullet(s), 70));
  return {
    kicker: info.siteName || info.domain || '',
    title: clip(info.title || '', 90),
    body: clip(info.description || info.paragraphs?.[0] || '', 200),
    items: listed.slice(0, 4),
    quote: quoteFrom(sentencesOf(text)),
    stat: findStat(text),
    source: info.siteName || info.domain || '',
    image: null, // id del archivo guardado, lo pone quien llama
  };
}

// ---------- Ajuste de texto ----------

// Estimación de líneas: ancho medio de carácter ≈ 0,5 del tamaño (0,55 en titulares en negrita).
function lines(text, size, width, charWidth) {
  const perLine = Math.max(4, Math.floor(width / (size * charWidth)));
  return String(text)
    .split('\n')
    .reduce((n, para) => {
      let count = 1;
      let len = 0;
      for (const word of para.split(/\s+/)) {
        if (len && len + 1 + word.length > perLine) {
          count += 1;
          len = word.length;
        } else len += (len ? 1 : 0) + word.length;
      }
      return n + count;
    }, 0);
}

// El mayor tamaño (entre min y max) con el que el texto cabe en width × maxHeight.
export function fit(text, { width, maxHeight, max, min, lineHeight = 1.15, charWidth = 0.52 }) {
  for (let size = max; size >= min; size -= 2) {
    const height = lines(text, size, width, charWidth) * size * lineHeight;
    if (height <= maxHeight) return { size, height };
  }
  return { size: min, height: lines(text, min, width, charWidth) * min * lineHeight };
}

// ---------- Colores ----------

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

// El color más legible sobre `bg` entre los candidatos.
const readableOn = (bg, ...candidates) => [...candidates, '#ffffff', '#111111'].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
// Un acento sobre `bg` si se lee (≥ 3:1); si no, el texto.
const accentOn = (bg, accent, fallback) => (contrast(accent, bg) >= 3 ? accent : fallback);

// ---------- Plantillas ----------

let seq = 0;
const layerId = (name) => `${name}-${(seq++).toString(36)}`;

function layer(name, props) {
  return { id: layerId(name.toLowerCase()), name, align: 'left', weight: 400, lineHeight: 1.2, ...props };
}

// Capas comunes al pie: firma a la derecha y logo a la izquierda.
function footer(t, { W, H, m }, color, fonts, handle) {
  if (handle) t.layers.push(layer('Firma', { x: W / 2, y: H - m - 34, w: W / 2 - m, size: Math.round(W * 0.028), color, font: fonts.body, weight: 600, align: 'right', sample: handle }));
  return t;
}

function base(name, size, background, opts) {
  return { id: `__gen_${seq++}`, name, size, background, bgAssetId: null, overlay: null, logo: { show: opts.hasLogo, x: opts.m, y: opts.H - opts.m - 66, h: 66 }, layers: [] };
}

const upper = (s) => String(s || '').toUpperCase();

export function designsFrom(content, { palette, fonts, handle = '', hasLogo = false, size = '1080x1350' }) {
  const { w: W, h: H } = CUSTOM_SIZES[size] || CUSTOM_SIZES['1080x1350'];
  // Escala de tamaños y márgenes: manda la dimensión más corta (en horizontal, la altura).
  const k = Math.min(W / 1080, H / 1000);
  const m = Math.round(Math.max(48, Math.min(W, H) * 0.074));
  const inner = W - 2 * m;
  const opts = { W, H, m, hasLogo };
  const title = content.title || content.quote || 'Tu titular';
  const out = [];

  // 1. Editorial: etiqueta, titular grande y texto sobre el fondo.
  {
    const t = base('Editorial', size, palette.background, opts);
    const ink = readableOn(palette.background, palette.text);
    const top = m + 60 * k;
    const head = fit(title, { width: inner, maxHeight: H * 0.4, max: Math.round(104 * k), min: Math.round(48 * k), lineHeight: 1.05, charWidth: 0.55 });
    t.layers.push(layer('Titular', { x: m, y: top + 50 * k, w: inner, size: head.size, color: ink, font: fonts.heading, weight: 700, lineHeight: 1.05, sample: title }));
    if (content.body) {
      const body = fit(content.body, { width: inner * 0.9, maxHeight: H * 0.25, max: Math.round(42 * k), min: Math.round(28 * k), lineHeight: 1.35, charWidth: 0.5 });
      t.layers.push(layer('Texto', { x: m, y: top + 50 * k + head.height + 48 * k, w: inner * 0.9, size: body.size, color: ink, font: fonts.body, lineHeight: 1.35, sample: content.body }));
    }
    if (content.kicker) t.layers.push(layer('Etiqueta', { x: m, y: top, w: inner, size: Math.round(28 * k), color: accentOn(palette.background, palette.primary, ink), font: fonts.body, weight: 700, sample: upper(content.kicker) }));
    out.push(footer(t, opts, accentOn(palette.background, palette.primary, ink), fonts, handle));
  }

  // 2. Bloque de color: fondo principal y titular centrado verticalmente.
  {
    const t = base('Bloque de color', size, palette.primary, opts);
    const ink = readableOn(palette.primary, palette.background, palette.text);
    const head = fit(title, { width: inner, maxHeight: H * 0.45, max: Math.round(112 * k), min: Math.round(52 * k), lineHeight: 1.04, charWidth: 0.55 });
    const y = Math.max(m + 80 * k, (H - head.height) / 2 - 60 * k);
    t.layers.push(layer('Titular', { x: m, y, w: inner, size: head.size, color: ink, font: fonts.heading, weight: 700, lineHeight: 1.04, sample: title }));
    if (content.body) {
      const body = fit(content.body, { width: inner, maxHeight: H * 0.18, max: Math.round(38 * k), min: Math.round(26 * k), lineHeight: 1.35, charWidth: 0.5 });
      t.layers.push(layer('Texto', { x: m, y: y + head.height + 44 * k, w: inner, size: body.size, color: ink, font: fonts.body, lineHeight: 1.35, sample: content.body }));
    }
    t.layers.push(layer('Línea', { x: m, y: Math.max(m, y - 70 * k), w: 160 * k, size: Math.round(40 * k), color: accentOn(palette.primary, palette.secondary, ink), font: fonts.heading, weight: 700, sample: '———' }));
    out.push(footer(t, opts, ink, fonts, handle));
  }

  // 3. Cita: comillas grandes en el color secundario.
  const quote = content.quote || content.title;
  if (quote) {
    const t = base('Cita', size, palette.background, opts);
    const ink = readableOn(palette.background, palette.text);
    const top = m + 220 * k;
    const q = fit(`${quote}`, { width: inner, maxHeight: H * 0.42, max: Math.round(76 * k), min: Math.round(40 * k), lineHeight: 1.2, charWidth: 0.53 });
    t.layers.push(layer('Cita', { x: m, y: top, w: inner, size: q.size, color: ink, font: fonts.heading, weight: 600, lineHeight: 1.2, sample: quote }));
    t.layers.push(layer('Autor', { x: m, y: top + q.height + 50 * k, w: inner, size: Math.round(30 * k), color: accentOn(palette.background, palette.primary, ink), font: fonts.body, weight: 600, sample: `— ${content.source || handle || 'Tu nombre'}` }));
    t.layers.push(layer('Comillas', { x: m - 8 * k, y: m, w: 300 * k, size: Math.round(260 * k), color: accentOn(palette.background, palette.secondary, palette.primary), font: 'Georgia', weight: 700, lineHeight: 1, sample: '“' }));
    out.push(footer(t, opts, accentOn(palette.background, palette.primary, ink), fonts, handle));
  }

  // 4. Lista: titular y puntos numerados.
  if (content.items.length >= 2) {
    const t = base('Lista', size, palette.background, opts);
    const ink = readableOn(palette.background, palette.text);
    const accent = accentOn(palette.background, palette.primary, ink);
    const head = fit(title, { width: inner, maxHeight: H * 0.24, max: Math.round(80 * k), min: Math.round(44 * k), lineHeight: 1.05, charWidth: 0.55 });
    t.layers.push(layer('Titular', { x: m, y: m + 40 * k, w: inner, size: head.size, color: ink, font: fonts.heading, weight: 700, lineHeight: 1.05, sample: title }));
    const items = content.items.slice(0, 4);
    const space = H - (m + 40 * k + head.height + 60 * k) - (m + 110 * k);
    const each = space / items.length;
    items.forEach((text, i) => {
      const y = m + 40 * k + head.height + 60 * k + i * each;
      const f = fit(text, { width: inner - 110 * k, maxHeight: each - 30 * k, max: Math.round(40 * k), min: Math.round(26 * k), lineHeight: 1.3, charWidth: 0.5 });
      t.layers.push(layer(`Punto ${i + 1}`, { x: m + 110 * k, y, w: inner - 110 * k, size: f.size, color: ink, font: fonts.body, lineHeight: 1.3, sample: text }));
      t.layers.push(layer(`Número ${i + 1}`, { x: m, y: y - 6 * k, w: 100 * k, size: Math.round(48 * k), color: accent, font: fonts.heading, weight: 700, lineHeight: 1, sample: String(i + 1).padStart(2, '0') }));
    });
    // El texto (2.ª capa) es el primer punto: así Crear post lo rellena con sentido.
    out.push(footer(t, opts, accent, fonts, handle));
  }

  // 5. Dato: una cifra grande.
  if (content.stat) {
    const t = base('Dato', size, palette.background, opts);
    const ink = readableOn(palette.background, palette.text);
    const head = fit(title, { width: inner, maxHeight: H * 0.2, max: Math.round(60 * k), min: Math.round(36 * k), lineHeight: 1.1, charWidth: 0.55 });
    t.layers.push(layer('Titular', { x: m, y: m + 40 * k, w: inner, size: head.size, color: ink, font: fonts.heading, weight: 700, lineHeight: 1.1, sample: title }));
    t.layers.push(layer('Texto', { x: m, y: H * 0.62, w: inner, size: Math.round(44 * k), color: ink, font: fonts.body, lineHeight: 1.3, sample: content.stat.label }));
    const num = fit(content.stat.value, { width: inner, maxHeight: H * 0.3, max: Math.round(300 * k), min: Math.round(120 * k), lineHeight: 1, charWidth: 0.6 });
    t.layers.push(layer('Cifra', { x: m - 6 * k, y: H * 0.62 - num.size * 1.05, w: inner, size: num.size, color: accentOn(palette.background, palette.primary, ink), font: fonts.heading, weight: 700, lineHeight: 1, sample: content.stat.value }));
    out.push(footer(t, opts, ink, fonts, handle));
  }

  // 6. Imagen: la imagen de la web de fondo, oscurecida, con el titular abajo.
  if (content.image) {
    const t = base('Imagen', size, '#111111', opts);
    t.bgAssetId = content.image;
    t.overlay = { color: '#000000', opacity: 0.5 };
    const head = fit(title, { width: inner, maxHeight: H * 0.36, max: Math.round(96 * k), min: Math.round(48 * k), lineHeight: 1.05, charWidth: 0.55 });
    const y = H - m - 110 * k - head.height;
    t.layers.push(layer('Titular', { x: m, y, w: inner, size: head.size, color: '#ffffff', font: fonts.heading, weight: 700, lineHeight: 1.05, sample: title }));
    if (content.kicker) t.layers.push(layer('Etiqueta', { x: m, y: y - 60 * k, w: inner, size: Math.round(28 * k), color: '#ffffff', font: fonts.body, weight: 700, sample: upper(content.kicker) }));
    t.logo.show = false;
    out.push(footer(t, opts, '#ffffff', fonts, handle));
  }

  // Números enteros para el editor.
  for (const t of out) for (const l of t.layers) for (const key of ['x', 'y', 'w', 'size']) l[key] = Math.round(l[key]);
  return out;
}
