// Gráficas de los posts creados en Posty: card 1080x1350 y slides de carrusel 1080x1350,
// con los colores de jpdazab. Se dibujan en HTML a tamaño real y se escalan para la vista previa.

export const VISUAL_W = 1080;
export const VISUAL_H = 1350;

const TONES = ['ink', 'canvas', 'violet', 'canvas', 'ink'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function lockup() {
  return `<div class="v-lockup"><span class="v-avatar">JD</span><span>/jpdazab</span></div>`;
}

function highlightHeadline(headline, highlight) {
  const safe = esc(headline);
  if (!highlight) return safe;
  const i = headline.toLowerCase().indexOf(highlight.toLowerCase());
  if (i < 0) return safe;
  return `${esc(headline.slice(0, i))}<em>${esc(headline.slice(i, i + highlight.length))}</em>${esc(headline.slice(i + highlight.length))}`;
}

export function cardHtml(card) {
  const items = (card.items || []).slice(0, 5);
  return `
    <div class="visual v-card tone-canvas">
      <div class="v-eyebrow">${esc(card.eyebrow)}</div>
      <h2 class="v-headline">${highlightHeadline(card.headline, card.highlight)}</h2>
      <p class="v-lead">${esc(card.lead)}</p>
      <ol class="v-list">
        ${items.map((item, i) => `<li><span class="v-num">${String(i + 1).padStart(2, '0')}</span><span>${esc(item)}</span></li>`).join('')}
      </ol>
      ${lockup()}
    </div>`;
}

export function slideHtml(slide, index, total) {
  const tone = TONES[index % TONES.length];
  const cover = index === 0;
  return `
    <div class="visual v-slide tone-${tone} ${cover ? 'is-cover' : ''}">
      <div class="v-top">
        <span class="v-eyebrow">${esc(slide.kicker)}</span>
        <span class="v-page">${index + 1}/${total}</span>
      </div>
      <div class="v-body">
        ${cover ? '' : `<div class="v-big-num">${String(index).padStart(2, '0')}</div>`}
        <h2 class="v-title">${esc(slide.title)}</h2>
        <p class="v-text">${esc(slide.body)}</p>
      </div>
      <div class="v-bottom">
        ${lockup()}
        ${index < total - 1 ? '<span class="v-swipe">Desliza →</span>' : ''}
      </div>
    </div>`;
}

// Envuelve cada gráfica en un contenedor que la escala al ancho disponible.
export function framed(inner) {
  return `<div class="visual-frame"><div class="visual-scale">${inner}</div></div>`;
}

export function fitVisuals(root = document) {
  for (const frame of root.querySelectorAll('.visual-frame')) {
    const scale = frame.clientWidth / VISUAL_W;
    frame.style.height = `${VISUAL_H * scale}px`;
    frame.querySelector('.visual-scale').style.transform = `scale(${scale})`;
  }
}

async function renderPng(node) {
  const { toPng } = await import('html-to-image');
  await document.fonts?.ready;
  return toPng(node, { width: VISUAL_W, height: VISUAL_H, pixelRatio: 1, cacheBust: true });
}

function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadPngs(nodes, baseName) {
  for (const [i, node] of nodes.entries()) {
    const url = await renderPng(node);
    download(url, nodes.length > 1 ? `${baseName}-${i + 1}.png` : `${baseName}.png`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

export async function downloadPdf(nodes, baseName) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [VISUAL_W, VISUAL_H], hotfixes: ['px_scaling'] });
  for (const [i, node] of nodes.entries()) {
    if (i > 0) pdf.addPage([VISUAL_W, VISUAL_H], 'portrait');
    pdf.addImage(await renderPng(node), 'PNG', 0, 0, VISUAL_W, VISUAL_H);
  }
  pdf.save(`${baseName}.pdf`);
}
