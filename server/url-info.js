// Lee una página web (sin IA) y saca lo necesario para proponer diseños: título, descripción,
// imagen principal, colores, encabezados, párrafos y puntos de lista.
// Solo direcciones públicas: se rechazan IP privadas, locales y de metadatos (anti-SSRF).

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { GenerateError } from './generate.js';

const MAX_HTML = 2 * 1024 * 1024;
const MAX_IMAGE = 2.5 * 1024 * 1024; // en base64 cabe en la respuesta de Vercel (4,5 MB)
const TIMEOUT = 8000;
const UA = 'Mozilla/5.0 (compatible; PostyBot/1.0; +https://github.com/jpdazab/Posty)';

// ---------- Red ----------

export function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

async function assertPublic(url, resolve = lookup) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new GenerateError(400, 'La URL debe empezar por http:// o https://');
  if (url.port && !['80', '443'].includes(url.port)) throw new GenerateError(400, 'Solo se admiten direcciones web normales (puertos 80 y 443).');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new GenerateError(400, 'Esa dirección no es pública.');
  const addresses = isIP(host) ? [{ address: host }] : await resolve(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new GenerateError(400, 'No se encontró esa web. Revisa la dirección.');
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new GenerateError(400, 'Esa dirección no es pública.');
}

// fetch con redirecciones manuales (cada salto se comprueba) y tamaño máximo.
async function safeFetch(rawUrl, { accept, max, fetchImpl = fetch, resolve }) {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url, resolve);
    const res = await fetchImpl(url, {
      redirect: 'manual',
      headers: { 'user-agent': UA, accept, 'accept-language': 'es,en;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw new GenerateError(502, `La web respondió con un error (${res.status}).`);
    const length = Number(res.headers.get('content-length') || 0);
    if (length > max) throw new GenerateError(413, 'La página es demasiado grande.');
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new GenerateError(413, 'La página es demasiado grande.');
      }
      chunks.push(value);
    }
    return { url, type: res.headers.get('content-type') || '', body: Buffer.concat(chunks) };
  }
  throw new GenerateError(502, 'La web redirige demasiadas veces.');
}

// ---------- HTML ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s) => decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : '';
}

function meta(html, ...keys) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase();
    if (keys.includes(key)) {
      const content = attr(tag, 'content').trim();
      if (content) return content;
    }
  }
  return '';
}

function texts(html, tag, { min = 1, max = 400, limit = 8 } = {}) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  for (const m of html.matchAll(re)) {
    const t = clean(m[1]);
    if (t.length >= min && t.length <= max && !out.includes(t)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

const HEX = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function saturation(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

// Colores de marca: theme-color y los hex más repetidos en el CSS de la página (sin grises).
export function pageColors(html) {
  const counts = new Map();
  const css = [...(html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []), ...(html.match(/style\s*=\s*"[^"]*"/gi) || [])].join(' ');
  for (const m of css.matchAll(HEX)) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const hex = `#${h}`;
    if (saturation(hex) < 0.25) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  const theme = meta(html, 'theme-color').match(/^#[0-9a-f]{6}$/i)?.[0]?.toLowerCase();
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return [...new Set([...(theme && saturation(theme) >= 0.25 ? [theme] : []), ...ranked])].slice(0, 5);
}

export function parsePage(html, pageUrl) {
  // Si hay <article> o <main>, el contenido sale de ahí (menos menús y pies de página).
  const body = html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || '';
  const content = (body || html).replace(/<(script|style|nav|footer|header|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const title = meta(html, 'og:title', 'twitter:title') || texts(html, 'title', { limit: 1 })[0] || texts(content, 'h1', { limit: 1 })[0] || '';
  const image = meta(html, 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src');
  return {
    url: pageUrl.href,
    domain: pageUrl.hostname.replace(/^www\./, ''),
    siteName: meta(html, 'og:site_name', 'application-name'),
    title: clean(title).slice(0, 200),
    description: clean(meta(html, 'og:description', 'description', 'twitter:description')).slice(0, 400),
    headings: texts(content, 'h2', { min: 4, max: 120, limit: 6 }),
    paragraphs: texts(content, 'p', { min: 60, max: 600, limit: 6 }),
    items: body ? texts(content, 'li', { min: 12, max: 140, limit: 6 }) : [],
    colors: pageColors(html),
    imageUrl: image ? new URL(image, pageUrl).href : '',
  };
}

// ---------- Entrada ----------

export async function readUrl(rawUrl, deps = {}) {
  let url;
  try {
    const text = String(rawUrl || '').trim();
    // Sin esquema ("ejemplo.com/blog") se asume https; con otro esquema (ftp:, file:) se rechaza después.
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) && !/^[^:/]+:\d/.test(text) ? text : `https://${text}`);
  } catch {
    throw new GenerateError(400, 'Esa URL no es válida.');
  }
  const page = await safeFetch(url, { accept: 'text/html,application/xhtml+xml', max: MAX_HTML, ...deps });
  if (!/html|xml/i.test(page.type)) throw new GenerateError(400, 'Esa dirección no es una página web.');
  const info = parsePage(page.body.toString('utf8'), page.url);
  if (!info.title && !info.description && !info.paragraphs.length) throw new GenerateError(422, 'No se encontró texto en esa página (puede que necesite JavaScript o inicio de sesión).');

  // Imagen principal en base64: el navegador no puede descargarla de otra web por CORS.
  let image = null;
  if (info.imageUrl) {
    try {
      const img = await safeFetch(info.imageUrl, { accept: 'image/*', max: MAX_IMAGE, ...deps });
      const type = img.type.split(';')[0].trim();
      if (/^image\/(png|jpe?g|webp|gif)$/.test(type)) image = `data:${type};base64,${img.body.toString('base64')}`;
    } catch {
      // Sin imagen no pasa nada: se proponen diseños solo con texto.
    }
  }
  const { imageUrl, ...rest } = info;
  return { ...rest, image };
}
