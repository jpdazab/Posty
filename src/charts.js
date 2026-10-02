// Gráficas para las plantillas propias, dibujadas como SVG (iguales en el editor, el post y el PNG).
// Tipos: columnas, barras horizontales, línea, donut y cifras.
// Reglas: marcas finas con el extremo de datos redondeado y la base recta, separación entre barras,
// valores al final de la marca, textos en el color de texto (nunca en el de la serie) y,
// en el donut, leyenda siempre con nombre y valor.

export const CHART_TYPES = {
  bar: 'Columnas',
  hbar: 'Barras horizontales',
  line: 'Línea',
  donut: 'Donut',
  stats: 'Cifras',
};

export const SAMPLE_DATA = {
  bar: '12 | Ene\n18 | Feb\n15 | Mar\n26 | Abr\n31 | May',
  hbar: '72% | Research\n48% | Wireframes\n31% | Testing',
  line: '12 | Lun\n18 | Mar\n15 | Mié\n24 | Jue\n29 | Vie',
  donut: '45% | Producto\n30% | Diseño\n25% | Datos',
  stats: '+40% | más rápido\n12 | equipos\n94% | satisfacción',
};

const MAX_ROWS = { bar: 8, hbar: 6, line: 12, donut: 5, stats: 4 };

// "48% | Research" → { display: '48%', value: 48, label: 'Research' }
export function parseRows(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [first, ...rest] = line.split('|').map((x) => x.trim());
      // Punto de miles solo si le siguen 3 cifras ("1.284"); coma decimal ("3,5") o punto decimal ("12.5").
      const value = parseFloat(first.replace(/\.(?=\d{3}(?!\d))/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
      return { display: first, value: Number.isFinite(value) ? value : 0, label: rest.join(' | ') };
    });
}

export function rowsToText(rows) {
  return (rows || []).map((r) => `${r.display ?? r.value}${r.label ? ` | ${r.label}` : ''}`).join('\n');
}

// ---------- Colores ----------

const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#000000');
const rgb = (c) => [1, 3, 5].map((i) => parseInt(hex(c).slice(i, i + 2), 16));
export function mix(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// ---------- OKLCH: ajustar colores a una banda legible manteniendo su tono ----------

const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLin = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklch(c) {
  const [r, g, b] = rgb(c).map((v) => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s2;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s2;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s2;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function fromOklch([L, C, H]) {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s2 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s2];
  if (lin.some((v) => v < -0.0005 || v > 1.0005)) return null; // fuera de sRGB
  return `#${lin.map((v) => Math.round(Math.min(1, Math.max(0, fromLin(v))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const isDark = (c) => toOklch(c)[0] < 0.5;

// Banda de luminosidad y croma mínimo para que las porciones se distingan (con margen por el redondeo).
function snap(c, surface) {
  const [lo, hi] = isDark(surface) ? [0.49, 0.66] : [0.44, 0.76];
  let [L, C, H] = toOklch(c);
  L = Math.min(hi, Math.max(lo, L));
  C = Math.max(C, 0.11);
  // Si no cabe en sRGB, primero se acerca la luminosidad al centro y después se baja el croma (sin pasar de 0,105).
  for (let i = 0; i < 60; i++) {
    const out = fromOklch([L, C, H]);
    if (out) return out;
    if (i % 2 === 0) L += (0.6 - L) * 0.15;
    else C = Math.max(0.105, C * 0.97);
  }
  return hex(c);
}

// Simulación de daltonismo (Machado et al. 2009, severidad completa) para comparar colores vecinos.
const CVD = [
  [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
];

function oklab(linRgb) {
  const [r, g, b] = linRgb.map((v) => Math.min(1, Math.max(0, v)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s2, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s2, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s2];
}

const linOf = (c) => rgb(c).map((v) => toLin(v / 255));
const apply = (mat, v) => mat.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;

// Distancia entre dos colores para la peor visión (normal, protan, deutan o tritan).
export function worstDistance(a, b) {
  const [x, y] = [linOf(a), linOf(b)];
  const normal = dE(oklab(x), oklab(y));
  const cvd = Math.min(...CVD.map((mat) => dE(oklab(apply(mat, x)), oklab(apply(mat, y)))));
  return { normal, cvd };
}

const distinct = (a, b) => {
  const d = worstDistance(a, b);
  return d.normal >= 15 && d.cvd >= 8;
};

// Colores de apoyo validados, en su orden de referencia (aqua, amarillo, magenta, verde, violeta, rojo).
const SUPPORT = { light: ['#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'], dark: ['#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'] };

// Primera selección ordenada de k elementos de `items` que cumple `test` (búsqueda pequeña: ≤ 6 elementos).
function pick(items, k, test, prefix = []) {
  if (prefix.length === k) return test(prefix) ? prefix : null;
  for (const it of items) {
    if (prefix.includes(it)) continue;
    const found = pick(items, k, test, [...prefix, it]);
    if (found) return found;
  }
  return null;
}

// Colores por orden fijo (nunca se reparten al azar): principal y secundario de la marca (si tienen
// color; un negro o un gris no sirve para distinguir porciones) y después apoyos que se distingan
// del vecino y del primero (el donut es circular).
export function categoricalPalette(primary, secondary, background) {
  const out = [];
  for (const c of [primary, secondary]) {
    if (toOklch(c)[1] < 0.04) continue;
    const snapped = snap(c, background);
    if (!out.length || distinct(out[out.length - 1], snapped)) out.push(snapped);
  }
  // Se prueban combinaciones de apoyos (en orden de referencia) y se queda la más larga en la que cada
  // color se distingue de su vecino, el último del primero (el donut es circular) y todos entre sí a simple vista.
  const support = SUPPORT[isDark(background) ? 'dark' : 'light'];
  const ok = (list) =>
    list.every((c, i) => i === 0 || distinct(list[i - 1], c)) &&
    (list.length < 3 || distinct(list[list.length - 1], list[0])) &&
    list.every((a, i) => list.slice(i + 1).every((b) => worstDistance(a, b).normal >= 15));
  const want = Math.max(0, 5 - out.length);
  for (let k = want; k > 0; k--) {
    const found = pick(support, k, (combo) => ok([...out, ...combo]));
    if (found) return [...out, ...found];
  }
  return out;
}

// ---------- SVG ----------

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;
const fontAttr = (font) => `font-family="${esc(`'${String(font || 'sans-serif').replace(/'/g, '')}', sans-serif`)}"`;

// Corta un texto para que quepa (aprox. 0,55 × tamaño por carácter).
function fitText(text, width, size) {
  const max = Math.max(3, Math.floor(width / (size * 0.55)));
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Rectángulo con el extremo de datos redondeado (arriba en columnas, a la derecha en barras).
function roundedEnd(x, y, w, h, r, side) {
  r = Math.max(0, Math.min(r, side === 'top' ? Math.min(w / 2, h) : Math.min(h / 2, w)));
  if (side === 'top') {
    return `M${r1(x)},${r1(y + h)} V${r1(y + r)} Q${r1(x)},${r1(y)} ${r1(x + r)},${r1(y)} H${r1(x + w - r)} Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + r)} V${r1(y + h)} Z`;
  }
  return `M${r1(x)},${r1(y)} H${r1(x + w - r)} Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + r)} V${r1(y + h - r)} Q${r1(x + w)},${r1(y + h)} ${r1(x + w - r)},${r1(y + h)} H${r1(x)} Z`;
}

function columns(rows, o) {
  const { w, h, size } = o;
  const top = size * 1.8;
  const bottom = size * 2.1;
  const plotH = Math.max(10, h - top - bottom);
  const slot = w / rows.length;
  const barW = Math.min(slot * 0.62, Math.max(24, w * 0.09));
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  const parts = [`<line x1="0" x2="${w}" y1="${r1(top + plotH)}" y2="${r1(top + plotH)}" stroke="${o.text}" stroke-opacity="0.18" stroke-width="2"/>`];
  rows.forEach((r, i) => {
    const bh = Math.max(0, (r.value / max) * plotH);
    const x = slot * i + (slot - barW) / 2;
    const y = top + plotH - bh;
    parts.push(`<path d="${roundedEnd(x, y, barW, bh, Math.max(4, barW * 0.12), 'top')}" fill="${o.color}"/>`);
    parts.push(`<text x="${r1(x + barW / 2)}" y="${r1(y - size * 0.5)}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${o.text}">${esc(r.display)}</text>`);
    parts.push(`<text x="${r1(x + barW / 2)}" y="${r1(top + plotH + size * 1.4)}" text-anchor="middle" font-size="${r1(size * 0.85)}" fill="${o.text}" fill-opacity="0.72">${esc(fitText(r.label, slot - 4, size * 0.85))}</text>`);
  });
  return parts.join('');
}

function hbars(rows, o) {
  const { w, h, size } = o;
  const row = h / rows.length;
  const thick = Math.max(8, Math.min(row * 0.26, size * 1.1));
  const percent = rows.every((r) => /%\s*$/.test(r.display));
  const max = percent ? Math.max(100, ...rows.map((r) => r.value)) : Math.max(...rows.map((r) => r.value), 0) || 1;
  return rows
    .map((r, i) => {
      const y = row * i + (row - (size * 1.35 + thick)) / 2;
      const barY = y + size * 1.35;
      const bw = Math.max(thick, (Math.max(0, r.value) / max) * w);
      return [
        `<text x="0" y="${r1(y + size)}" font-size="${size}" fill="${o.text}">${esc(fitText(r.label, w * 0.75, size))}</text>`,
        `<text x="${w}" y="${r1(y + size)}" text-anchor="end" font-size="${size}" font-weight="700" fill="${o.text}">${esc(r.display)}</text>`,
        `<rect x="0" y="${r1(barY)}" width="${w}" height="${r1(thick)}" rx="${r1(thick / 2)}" fill="${o.track}"/>`,
        `<path d="${roundedEnd(0, barY, bw, thick, thick / 2, 'right')}" fill="${o.color}"/>`,
      ].join('');
    })
    .join('');
}

function line(rows, o) {
  const { w, h, size } = o;
  const stroke = Math.max(3, Math.min(8, w / 260));
  const endLabel = rows[rows.length - 1]?.display || '';
  const right = endLabel.length * size * 0.62 + stroke * 5;
  const top = size * 1.2;
  const bottom = size * 2.1;
  const plotW = Math.max(10, w - right);
  const plotH = Math.max(10, h - top - bottom);
  const values = rows.map((r) => r.value);
  const min = Math.min(0, ...values);
  const max = Math.max(...values) || 1;
  const pts = rows.map((r, i) => [rows.length === 1 ? plotW / 2 : (plotW * i) / (rows.length - 1), top + plotH - ((r.value - min) / (max - min || 1)) * plotH]);
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)},${r1(y)}`).join(' ');
  const base = top + plotH;
  const [ex, ey] = pts[pts.length - 1];
  // Etiquetas del eje: todas si son pocas; si no, primera y última.
  const labelIdx = rows.length <= 7 ? rows.map((_, i) => i) : [0, rows.length - 1];
  return [
    `<line x1="0" x2="${r1(plotW)}" y1="${r1(base)}" y2="${r1(base)}" stroke="${o.text}" stroke-opacity="0.18" stroke-width="2"/>`,
    `<path d="${path} L${r1(ex)},${r1(base)} L${r1(pts[0][0])},${r1(base)} Z" fill="${o.color}" fill-opacity="0.1"/>`,
    `<path d="${path}" fill="none" stroke="${o.color}" stroke-width="${r1(stroke)}" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<circle cx="${r1(ex)}" cy="${r1(ey)}" r="${r1(stroke * 2.2)}" fill="${o.color}" stroke="${o.surface}" stroke-width="${r1(stroke)}"/>`,
    `<text x="${r1(ex + stroke * 4)}" y="${r1(ey + size * 0.35)}" font-size="${size}" font-weight="700" fill="${o.text}">${esc(endLabel)}</text>`,
    ...labelIdx.map((i) => {
      const anchor = i === 0 && rows.length > 1 ? 'start' : i === rows.length - 1 && rows.length > 1 ? 'end' : 'middle';
      return `<text x="${r1(pts[i][0])}" y="${r1(base + size * 1.4)}" text-anchor="${anchor}" font-size="${r1(size * 0.85)}" fill="${o.text}" fill-opacity="0.72">${esc(fitText(rows[i].label, plotW / Math.max(1, labelIdx.length), size * 0.85))}</text>`;
    }),
  ].join('');
}

function donut(rows, o) {
  const { w, h, size } = o;
  // Una porción por color (nunca se repite un color): lo que sobra se agrupa en "Otros".
  const maxSlices = Math.max(2, Math.min(5, o.palette.length));
  let data = rows;
  if (rows.length > maxSlices) {
    const rest = rows.slice(maxSlices - 1).reduce((sum, r) => sum + r.value, 0);
    const percent = rows.every((r) => /%\s*$/.test(r.display));
    data = [...rows.slice(0, maxSlices - 1), { label: 'Otros', value: rest, display: `${rest.toLocaleString('es')}${percent ? '%' : ''}` }];
  }
  const total = data.reduce((s, r) => s + Math.max(0, r.value), 0) || 1;
  const d = Math.min(h, w * 0.48);
  const R = d / 2;
  const ring = R * 0.32;
  const cx = R;
  const cy = h / 2;
  const gap = Math.min(0.06, 4 / R); // radianes de separación entre porciones
  let angle = -Math.PI / 2;
  const arcs = data.map((r, i) => {
    const sweep = (Math.max(0, r.value) / total) * Math.PI * 2;
    const a0 = angle + (data.length > 1 ? gap / 2 : 0);
    const a1 = angle + sweep - (data.length > 1 ? gap / 2 : 0);
    angle += sweep;
    if (a1 <= a0) return '';
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, rr) => `${r1(cx + rr * Math.cos(rad))},${r1(cy + rr * Math.sin(rad))}`;
    const color = o.palette[i % o.palette.length];
    if (sweep >= Math.PI * 2 - 0.001) return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R - ring / 2)}" fill="none" stroke="${color}" stroke-width="${r1(ring)}"/>`;
    return `<path d="M${p(a0, R)} A${r1(R)},${r1(R)} 0 ${large} 1 ${p(a1, R)} L${p(a1, R - ring)} A${r1(R - ring)},${r1(R - ring)} 0 ${large} 0 ${p(a0, R - ring)} Z" fill="${color}"/>`;
  });
  // Leyenda: muestra de color + nombre + valor, en el color de texto.
  const lx = d + size * 1.6;
  const lw = w - lx;
  const step = Math.min(size * 2.1, h / data.length);
  const ly0 = cy - (step * data.length) / 2 + step / 2;
  const legend = data.map((r, i) => {
    const y = ly0 + step * i;
    return `<rect x="${r1(lx)}" y="${r1(y - size * 0.45)}" width="${r1(size * 0.9)}" height="${r1(size * 0.9)}" rx="${r1(size * 0.2)}" fill="${o.palette[i % o.palette.length]}"/>
      <text x="${r1(lx + size * 1.4)}" y="${r1(y + size * 0.35)}" font-size="${size}" fill="${o.text}">${esc(fitText(r.label, lw - size * 5, size))}</text>
      <text x="${r1(w)}" y="${r1(y + size * 0.35)}" text-anchor="end" font-size="${size}" font-weight="700" fill="${o.text}">${esc(r.display)}</text>`;
  });
  return arcs.join('') + (lw > size * 4 ? legend.join('') : '');
}

// Ancho aproximado de un texto en negrita, en múltiplos del tamaño de letra.
function emWidth(text) {
  let w = 0;
  for (const ch of String(text)) {
    if (/[%@MW]/.test(ch)) w += 1.05;
    else if (/[mw]/.test(ch)) w += 0.92;
    else if (/[.,:;'!|]/.test(ch)) w += 0.34;
    else if (/[/()\-\s]/.test(ch)) w += 0.42;
    else if (/[A-Z]/.test(ch)) w += 0.8;
    else w += 0.72;
  }
  return w;
}

function stats(rows, o) {
  const { w, h, size } = o;
  const n = rows.length;
  const col = w / n;
  // Ancho estimado de cada cifra en negrita (en "em"); se deja un 20 % de la columna libre entre cifras.
  const widest = Math.max(1.5, ...rows.map((r) => emWidth(r.display)));
  const valueSize = Math.min(h - size * 2.8, (col * 0.8) / widest);
  return rows
    .map((r, i) => {
      const x = col * i;
      return [
        `<rect x="${r1(x)}" y="0" width="${r1(Math.min(col * 0.3, size * 3))}" height="${r1(Math.max(4, size * 0.22))}" rx="${r1(size * 0.11)}" fill="${o.color}"/>`,
        `<text x="${r1(x)}" y="${r1(size * 0.6 + valueSize)}" font-size="${r1(valueSize)}" font-weight="700" fill="${o.text}" ${fontAttr(o.headingFont)}>${esc(r.display)}</text>`,
        `<text x="${r1(x)}" y="${r1(size * 0.6 + valueSize + size * 1.5)}" font-size="${size}" fill="${o.text}" fill-opacity="0.72">${esc(fitText(r.label, col - size, size))}</text>`,
      ].join('');
    })
    .join('');
}

const DRAW = { bar: columns, hbar: hbars, line, donut, stats };

// layer: { chart, w, h, data (texto "valor | etiqueta"), color, track, text, surface, palette, font, headingFont, labelSize }
export function chartSvg(layer, dataText) {
  const type = DRAW[layer.chart] ? layer.chart : 'bar';
  const rows = parseRows(dataText ?? layer.data).slice(0, MAX_ROWS[type]);
  const w = Math.max(40, layer.w || 600);
  const h = Math.max(40, layer.h || 400);
  const size = layer.labelSize || Math.round(Math.max(16, Math.min(36, Math.min(w, h) * 0.06)));
  const o = {
    w,
    h,
    size,
    color: hex(layer.color),
    track: hex(layer.track || mix(layer.color, layer.surface || '#ffffff', 0.82)),
    text: hex(layer.text || '#16161d'),
    surface: hex(layer.surface || '#ffffff'),
    palette: layer.palette?.length ? layer.palette : [hex(layer.color)],
    headingFont: layer.headingFont || layer.font,
  };
  const body = rows.length ? DRAW[type](rows, o) : `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="${size}" fill="${o.text}" fill-opacity="0.5">Añade datos: valor | etiqueta</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible" ${fontAttr(layer.font)} role="img" aria-label="${esc(rows.map((r) => `${r.label}: ${r.display}`).join(', '))}">${body}</svg>`;
}
