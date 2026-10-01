// Gráficas de los posts creados en Posty, hechas con el design system jpdazab (src/ds):
// - card: post social 1080 x 1351 (titular con frase destacada, lead, NumberedCardList y lockup)
// - carrusel: CoverCard + SlideCards 1231 x 1731, con un visual opcional por slide.

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { React, Jpdazab as J, lockupUrl } from './ds/index.js';

const h = React.createElement;

export const SIZES = {
  card: { w: 1080, h: 1351 },
  carousel: { w: 1231, h: 1731 },
};

export const COVER_TONES = ['blue', 'ink', 'grey', 'yellow'];
export const VISUAL_KINDS = ['none', 'stats', 'bars', 'venn'];

// Projekt Blackbird no tiene tildes, ñ ni signos de apertura.
const NO_BLACKBIRD = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
export function blackbirdIssues(text) {
  return NO_BLACKBIRD.test(text || '');
}

// ---------- Normalización (también migra posts creados con la versión anterior) ----------

export function emptyVisual() {
  return { kind: 'none', items: [], left: '', overlap: '', right: '' };
}

export function normalizePost(post) {
  const p = { ...post, hashtags: post.hashtags || [] };
  if (p.format === 'card') {
    const c = p.card || {};
    p.card = {
      headline: c.headline || '',
      highlight: c.highlight || '',
      lead: c.lead || '',
      items: (c.items || []).map((it) => (typeof it === 'string' ? { title: it, description: '' } : { title: it.title || '', description: it.description || '' })),
    };
  } else {
    const slides = p.slides || [];
    if (!p.cover) {
      // Versión anterior: la slide 1 era la portada y cada slide tenía kicker/title/body.
      const [first = {}, ...rest] = slides;
      p.cover = { tone: 'blue', tag: first.kicker || '', title: first.title || '', underline: '', summary: first.body || '' };
      p.slides = rest.map((s) => ({ tag: s.kicker || '', title: s.title || '', titleAccent: '', summary: s.body || '', visual: emptyVisual() }));
    } else {
      p.cover = { tone: 'blue', tag: '', title: '', underline: '', summary: '', ...p.cover };
      p.slides = slides.map((s) => ({ tag: '', title: '', titleAccent: '', summary: '', ...s, visual: { ...emptyVisual(), ...(s.visual || {}) } }));
    }
  }
  return p;
}

// ---------- Componentes ----------

function SocialPost({ card }) {
  const { headline, highlight } = card;
  const i = highlight ? headline.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  const title =
    i < 0
      ? headline
      : [headline.slice(0, i), h('em', { key: 'em' }, headline.slice(i, i + highlight.length)), headline.slice(i + highlight.length)];
  const items = card.items.filter((it) => it.title).slice(0, 5);
  return h(
    'div',
    { className: 'ds ds-post' },
    h('div', { className: 'ds-post-head' }, h('h2', { className: 'ds-post-headline' }, title), card.lead && h('p', { className: 'ds-post-lead' }, card.lead)),
    items.length > 0 && h(J.NumberedCardList, { items }),
    h('img', { className: 'ds-post-lockup', src: lockupUrl, alt: 'JD /jpdazab', height: 55 }),
  );
}

function underlined(title, word) {
  if (!word) return title;
  const i = title.toLowerCase().indexOf(word.toLowerCase());
  if (i < 0) return title;
  return [title.slice(0, i), h('u', { key: 'u' }, title.slice(i, i + word.length)), title.slice(i + word.length)];
}

function SlideVisual({ visual }) {
  const items = (visual.items || []).filter((it) => it.label || it.display || it.value);
  switch (visual.kind) {
    case 'stats': {
      if (!items.length) return null;
      const tones = ['blue', 'white', 'yellow', 'ink'];
      const cards = items.slice(0, 6).map((it, n) => ({ value: it.display || String(it.value ?? ''), label: it.label, tone: tones[n % tones.length] }));
      const perRow = cards.length === 4 ? 2 : 3;
      const rows = [];
      for (let n = 0; n < cards.length; n += perRow) rows.push(cards.slice(n, n + perRow));
      return h(J.StatGrid, { rows });
    }
    case 'bars':
      if (!items.length) return null;
      return h(J.ProgressBars, {
        tone: 'brand',
        items: items.slice(0, 5).map((it) => ({ label: it.label, value: Number(it.value) || 0, display: it.display || String(it.value ?? '') })),
      });
    case 'venn':
      if (!visual.left && !visual.right && !visual.overlap) return null;
      return h(J.CarouselVenn, { left: visual.left, overlap: visual.overlap, right: visual.right, tone: 'highlight', diameter: 660 });
    default:
      return null;
  }
}

function Cover({ cover }) {
  return h(
    'div',
    { className: 'ds ds-page' },
    h(J.CoverCard, {
      tone: cover.tone,
      tag: cover.tag || undefined,
      title: underlined(cover.title, cover.underline),
      summary: cover.tone === 'yellow' ? undefined : cover.summary || undefined,
    }),
  );
}

function Slide({ slide, last }) {
  return h(
    'div',
    { className: 'ds ds-page' },
    h(
      J.SlideCard,
      {
        tag: slide.tag || undefined,
        title: slide.title,
        titleAccent: slide.titleAccent || undefined,
        summary: slide.summary || undefined,
        swipe: last ? false : undefined,
      },
      h(SlideVisual, { visual: slide.visual }),
    ),
  );
}

// Lista de elementos React, uno por imagen exportable.
export function pages(post) {
  if (post.format === 'card') return [h(SocialPost, { card: post.card })];
  const slides = post.slides || [];
  return [h(Cover, { cover: post.cover }), ...slides.map((s, i) => h(Slide, { slide: s, last: i === slides.length - 1 }))];
}

// ---------- Montaje y escalado ----------

const roots = new WeakMap();

// Renderiza las páginas en los contenedores .visual-frame de `container` (uno por página).
export function mountPages(container, post) {
  const size = SIZES[post.format];
  const els = pages(post);
  const frames = [...container.querySelectorAll('.visual-frame')];
  frames.forEach((frame, i) => {
    const target = frame.querySelector('.visual-scale');
    target.style.width = `${size.w}px`;
    target.style.height = `${size.h}px`;
    let root = roots.get(target);
    if (!root) {
      root = createRoot(target);
      roots.set(target, root);
    }
    flushSync(() => root.render(els[i] || null));
  });
  fitVisuals(container);
}

export function unmountPages(container) {
  for (const target of container.querySelectorAll('.visual-scale')) {
    roots.get(target)?.unmount();
    roots.delete(target);
  }
}

export function frameHtml(format) {
  const { w, h: height } = SIZES[format];
  return `<div class="visual-frame" style="aspect-ratio:${w} / ${height}"><div class="visual-scale"></div></div>`;
}

export function fitVisuals(root = document) {
  for (const frame of root.querySelectorAll('.visual-frame')) {
    const target = frame.querySelector('.visual-scale');
    const w = parseFloat(target.style.width) || 1;
    target.style.transform = `scale(${frame.clientWidth / w})`;
  }
}

// ---------- Exportación ----------

async function renderPng(node) {
  const { toPng } = await import('html-to-image');
  await document.fonts?.ready;
  // html-to-image no aplica los fill/stroke que vienen de CSS en SVG: los fijamos como atributos.
  for (const shape of node.querySelectorAll('svg *')) {
    const cs = getComputedStyle(shape);
    if (cs.fill && cs.fill !== 'none') shape.setAttribute('fill', cs.fill);
    if (cs.stroke && cs.stroke !== 'none') shape.setAttribute('stroke', cs.stroke);
  }
  const w = node.offsetWidth;
  const height = node.offsetHeight;
  return toPng(node, { width: w, height, pixelRatio: 1, cacheBust: true, style: { transform: 'none' } });
}

function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function exportNodes(container) {
  return [...container.querySelectorAll('.visual-scale')];
}

export async function downloadPngs(container, baseName) {
  const nodes = exportNodes(container);
  for (const [i, node] of nodes.entries()) {
    download(await renderPng(node), nodes.length > 1 ? `${baseName}-${i + 1}.png` : `${baseName}.png`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

export async function downloadPdf(container, baseName) {
  const { jsPDF } = await import('jspdf');
  const nodes = exportNodes(container);
  const w = nodes[0].offsetWidth;
  const height = nodes[0].offsetHeight;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [w, height], hotfixes: ['px_scaling'] });
  for (const [i, node] of nodes.entries()) {
    if (i > 0) pdf.addPage([w, height], 'portrait');
    pdf.addImage(await renderPng(node), 'PNG', 0, 0, w, height);
  }
  pdf.save(`${baseName}.pdf`);
}
