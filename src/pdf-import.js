// PDF → plantillas propias, sin IA. Cada página se convierte en una plantilla:
// - fondo: la página dibujada SIN su texto (se interceptan los fillText de pdf.js);
// - capas: el texto de la página agrupado en bloques, con su posición, tamaño, color, alineación y fuente.
// pdf.js se carga solo cuando hace falta (es pesado).

import { getKit, allFontFamilies, storeImage } from './kit.js';
import { assetUrl } from './assets-db.js';
import { parseFontName, groupRuns } from './pdf-text.js';

export const MAX_PAGES = 10;
const TARGET_WIDTH = 1080;

let pdfjsPromise;
async function loadPdfjs() {
  // Versión "legacy": incluye los polyfills para navegadores que aún no tienen lo más reciente de JavaScript.
  pdfjsPromise ??= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsPromise;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]+/g, '');

// La fuente del PDF si la tienes (subida o del sistema); si no, la de la marca según el tamaño.
function matchFont(pdfFamily, size, missing) {
  const available = allFontFamilies();
  const found = available.find((f) => norm(f) === norm(pdfFamily)) || available.find((f) => pdfFamily && norm(f).startsWith(norm(pdfFamily)));
  if (found) return found;
  if (pdfFamily && !/^(g_d|sans|serif|monospace)/i.test(pdfFamily)) missing.add(pdfFamily);
  const { heading, body } = getKit().brand.fonts;
  return size >= 40 ? heading : body;
}

// ---------- Colores ----------

function toHex(c) {
  if (typeof c !== 'string') return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}` : null;
}

// Sin color registrado (texto dentro de grupos de transparencia): negro o blanco según el fondo.
function contrastColorAt(ctx, x, y, w, h) {
  const d = ctx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data;
  let lum = 0;
  for (let i = 0; i < d.length; i += 4) lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return lum / (d.length / 4) > 140 ? '#111111' : '#ffffff';
}

// ---------- Página → plantilla ----------

async function renderPage(page, lib) {
  const base = page.getViewport({ scale: 1 });
  const scale = TARGET_WIDTH / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Se dibuja la página sin texto horizontal y se apunta el color de cada letra.
  const glyphs = [];
  const protos = [globalThis.CanvasRenderingContext2D?.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean);
  const originals = protos.map((p) => [p.fillText, p.strokeText]);
  const skip = function (orig) {
    return function (text, x, y, ...rest) {
      const t = this.getTransform();
      if (Math.abs(t.b) > 0.01 || Math.abs(t.c) > 0.01) return orig.call(this, text, x, y, ...rest); // texto girado: se queda en el fondo
      if (this === ctx) glyphs.push({ x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f, color: toHex(this.fillStyle) });
    };
  };
  protos.forEach((p, i) => {
    p.fillText = skip(originals[i][0]);
    p.strokeText = skip(originals[i][1]);
  });
  try {
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  } finally {
    protos.forEach((p, i) => {
      [p.fillText, p.strokeText] = originals[i];
    });
  }

  const content = await page.getTextContent();
  const runs = [];
  for (const item of content.items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = lib.Util.transform(viewport.transform, item.transform);
    if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) continue; // girado
    const size = Math.hypot(tx[2], tx[3]);
    if (size < 4) continue;
    const x = tx[4];
    const baseline = tx[5];
    const width = item.width * scale;
    let fontName = '';
    try {
      fontName = page.commonObjs.get(item.fontName)?.name || '';
    } catch {
      // fuente sin cargar: se usa la de la marca
    }
    const { family, weight } = parseFontName(fontName);
    const near = glyphs.filter((g) => g.color && g.x >= x - 2 && g.x <= x + width + 2 && g.y >= baseline - size && g.y <= baseline + size * 0.4);
    const counts = new Map();
    for (const g of near) counts.set(g.color, (counts.get(g.color) || 0) + 1);
    const color = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || contrastColorAt(ctx, x, baseline - size, width, size);
    runs.push({ text: item.str, x, baseline, width, size, font: family, weight, color });
  }
  return { canvas, runs };
}

function blobOf(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/jpeg', 0.9));
}

// file: PDF → { templates, missingFonts, totalPages }. onProgress(página, total).
export async function templatesFromPdf(file, { onProgress } = {}) {
  const lib = await loadPdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    throw new Error(err?.name === 'PasswordException' ? 'El PDF tiene contraseña: quítasela y vuelve a subirlo.' : 'No se pudo leer el PDF.');
  }
  const totalPages = doc.numPages;
  const total = Math.min(totalPages, MAX_PAGES);
  const missing = new Set();
  const templates = [];
  const baseName = file.name.replace(/\.pdf$/i, '');
  for (let n = 1; n <= total; n++) {
    onProgress?.(n, total);
    const page = await doc.getPage(n);
    const { canvas, runs } = await renderPage(page, lib);
    const blocks = groupRuns(runs).sort((a, b) => b.size - a.size || a.baseline - b.baseline);
    const W = canvas.width;
    const H = canvas.height;
    const bgAssetId = await storeImage(await blobOf(canvas));
    await assetUrl(bgAssetId);
    // Las capas más grandes primero: Crear post rellena la 1.ª (titular) y la 2.ª (texto).
    const layers = blocks.map((b, i) => {
      const lh = b.lineHeight;
      const font = matchFont(b.font, b.size, missing);
      const width = Math.min(W - b.x, b.width * 1.04 + b.size * 0.6);
      const x = b.align === 'right' ? Math.max(0, b.x + b.width - width) : b.align === 'center' ? Math.max(0, b.x + b.width / 2 - width / 2) : b.x;
      return {
        id: `capa-${n}-${i}`,
        name: i === 0 ? 'Titular' : i === 1 ? 'Texto' : `Texto ${i + 1}`,
        x: Math.round(x),
        y: Math.round(b.baseline - b.size * (0.8 + (lh - 1) / 2)),
        w: Math.round(width),
        size: Math.round(b.size),
        color: b.color,
        font,
        weight: b.weight,
        align: b.align,
        lineHeight: lh,
        sample: b.text,
      };
    });
    templates.push({
      id: `__gen_pdf_${Date.now().toString(36)}_${n}`,
      name: total > 1 ? `${baseName} · página ${n}` : baseName,
      size: 'custom',
      width: W,
      height: H,
      background: '#ffffff',
      bgAssetId,
      overlay: null,
      logo: { show: false, x: 80, y: H - 150, h: 70 },
      layers,
    });
    page.cleanup();
  }
  await task.destroy();
  return { templates, missingFonts: [...missing], totalPages };
}
