// Fondos de las plantillas propias: color liso, degradados y texturas (patterns) hechos solo con CSS,
// así se ven igual en el editor, en la vista previa y en el PNG/PDF exportado.
//
// tpl.background es siempre el color base (el de debajo de la textura o el de respaldo);
// tpl.fill describe lo que va encima:
//   { kind: 'linear', angle, from, to }
//   { kind: 'radial', from, to }
//   { kind: 'aurora', from, to }            manchas de color difuminadas sobre el color base
//   { kind: 'pattern', pattern, color, size } textura del color `color` sobre el color base

import { mix } from './charts.js';
import { contrast } from './layouts.js';

export const GRADIENT_KINDS = { linear: 'Lineal', radial: 'Radial', aurora: 'Aurora' };
export const PATTERNS = { dots: 'Puntos', grid: 'Cuadrícula', stripes: 'Rayas', lines: 'Líneas', checker: 'Cuadros' };

const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const hex = (c, fallback) => (isHex(c) ? c : fallback);
const px = (n) => `${Math.round(n * 100) / 100}px`;

function patternCss(pattern, color, size) {
  const s = Math.max(4, size);
  const line = Math.max(1, s / 24);
  switch (pattern) {
    case 'grid':
      return {
        backgroundImage: `linear-gradient(${color} ${px(line)}, transparent ${px(line)}), linear-gradient(90deg, ${color} ${px(line)}, transparent ${px(line)})`,
        backgroundSize: `${px(s)} ${px(s)}`,
      };
    case 'stripes':
      return { backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 ${px(s / 4)}, transparent ${px(s / 4)} ${px(s / 2)})` };
    case 'lines':
      return { backgroundImage: `repeating-linear-gradient(0deg, ${color} 0 ${px(line * 1.5)}, transparent ${px(line * 1.5)} ${px(s / 2)})` };
    case 'checker':
      return { backgroundImage: `conic-gradient(${color} 25%, transparent 0 50%, ${color} 0 75%, transparent 0)`, backgroundSize: `${px(s)} ${px(s)}` };
    default: // dots
      return { backgroundImage: `radial-gradient(circle, ${color} ${px(s * 0.1)}, transparent ${px(s * 0.1 + 0.5)})`, backgroundSize: `${px(s)} ${px(s)}` };
  }
}

// Estilo (camelCase) del fondo. `scale` reduce las texturas para las miniaturas.
export function fillStyle(background, fill, scale = 1) {
  const base = hex(background, '#ffffff');
  const style = { backgroundColor: base };
  if (!fill?.kind) return style;
  const from = hex(fill.from, base);
  const to = hex(fill.to, base);
  if (fill.kind === 'linear') style.backgroundImage = `linear-gradient(${Number(fill.angle) || 0}deg, ${from}, ${to})`;
  else if (fill.kind === 'radial') style.backgroundImage = `radial-gradient(circle at 30% 25%, ${from}, ${to} 75%)`;
  else if (fill.kind === 'aurora') {
    style.backgroundImage = `radial-gradient(at 12% 18%, ${from} 0, transparent 55%), radial-gradient(at 88% 82%, ${to} 0, transparent 55%), radial-gradient(at 80% 10%, ${mix(from, to, 0.5)}55 0, transparent 40%)`;
  } else if (fill.kind === 'pattern') Object.assign(style, patternCss(fill.pattern, hex(fill.color, mix(base, '#000000', 0.12)), (Number(fill.size) || 48) * scale));
  return style;
}

// El mismo estilo como texto CSS (editor y miniaturas, que no usan React).
export function fillCss(background, fill, scale) {
  return Object.entries(fillStyle(background, fill, scale))
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`)
    .join(';');
}

// Color dominante del fondo: con él se decide si el texto se lee.
export function fillBase(background, fill) {
  const base = hex(background, '#ffffff');
  if (!fill?.kind || fill.kind === 'pattern') return base;
  if (fill.kind === 'aurora') return mix(base, mix(hex(fill.from, base), hex(fill.to, base), 0.5), 0.35);
  return mix(hex(fill.from, base), hex(fill.to, base), 0.5);
}

// Temas listos para usar, hechos con los colores de la marca.
export function fillThemes({ primary: p, secondary: s, background: bg, text: t }) {
  const light = contrast(bg, '#000000') > contrast(bg, '#ffffff') ? bg : '#ffffff';
  const dark = contrast(t, '#ffffff') > contrast(t, '#000000') ? t : '#16161d';
  return [
    { name: 'Claro', background: light, fill: null },
    { name: 'Color de marca', background: p, fill: null },
    { name: 'Degradado de marca', background: p, fill: { kind: 'linear', angle: 135, from: p, to: s } },
    { name: 'Degradado suave', background: light, fill: { kind: 'linear', angle: 180, from: light, to: mix(light, p, 0.18) } },
    { name: 'Noche', background: dark, fill: { kind: 'linear', angle: 160, from: dark, to: mix(dark, p, 0.55) } },
    { name: 'Foco', background: p, fill: { kind: 'radial', from: mix(p, '#ffffff', 0.25), to: mix(p, '#000000', 0.35) } },
    { name: 'Aurora', background: light, fill: { kind: 'aurora', from: mix(light, p, 0.45), to: mix(light, s, 0.45) } },
    { name: 'Aurora oscura', background: dark, fill: { kind: 'aurora', from: mix(dark, p, 0.7), to: mix(dark, s, 0.6) } },
    { name: 'Puntos', background: light, fill: { kind: 'pattern', pattern: 'dots', color: mix(light, p, 0.3), size: 44 } },
    { name: 'Cuadrícula', background: light, fill: { kind: 'pattern', pattern: 'grid', color: mix(light, p, 0.16), size: 72 } },
    { name: 'Rayas', background: p, fill: { kind: 'pattern', pattern: 'stripes', color: mix(p, '#ffffff', 0.1), size: 64 } },
    { name: 'Líneas', background: light, fill: { kind: 'pattern', pattern: 'lines', color: mix(light, t, 0.08), size: 40 } },
    { name: 'Cuadros', background: light, fill: { kind: 'pattern', pattern: 'checker', color: mix(light, s, 0.12), size: 120 } },
    { name: 'Puntos oscuro', background: dark, fill: { kind: 'pattern', pattern: 'dots', color: mix(dark, p, 0.55), size: 44 } },
  ];
}

// Color de texto legible sobre el fondo: se mantiene si se lee (≥ 3:1); si no, el más legible de la marca.
export function readableText(color, base, { text, background }) {
  if (isHex(color) && contrast(color, base) >= 3) return color;
  return [text, background, '#ffffff', '#111111'].filter(isHex).sort((a, b) => contrast(b, base) - contrast(a, base))[0];
}
