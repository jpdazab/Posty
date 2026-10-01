// Convierte un texto ya escrito (pegado por el usuario) en el contenido de las gráficas,
// sin IA: detecta gancho, lista, cifras, pregunta final y hashtags, y reparte el texto
// en los campos de la card, el carrusel o la slide única. El resultado se revisa en el editor.

const BULLET = /^\s*(?:[-•*·→▪►✓✔]|\d+[.)]|[0-9]️?⃣|[①-⑨])\s*/u;
const NUMBER = /(?<![\p{L}\d-])([+-]?\d+(?:[.,]\d+)?\s?(?:%|x|k|m|€|\$)?)/iu;
// Palabras que no deben quedar al final de un título cortado.
const STOPWORDS = new Set('a al con de del el en es la las lo los o para pero por que se si sin su sus un una y e ni le les me mi mis tu tus mas más muy como cuando donde'.split(' '));

// Projekt Blackbird no tiene tildes, ñ ni ¿¡: en esos campos se escriben sin ellas.
export function toBlackbird(text) {
  return String(text || '')
    .replace(/[¿¡]/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function stripEmoji(text) {
  return clean(text.replace(/\p{Extended_Pictographic}|️|⃣/gu, ''));
}

// Corta en el último límite de palabra antes de `max` caracteres.
export function clip(text, max, ellipsis = true) {
  const t = clean(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, '');
  return (cut || t.slice(0, max)).replace(/[,;:.\s]+$/, '') + (ellipsis ? '…' : '');
}

function sentences(text) {
  return (clean(text).match(/[^.!?…]+[.!?…]*/g) || []).map(clean).filter(Boolean);
}

function trimStopwords(text) {
  const words = clean(text).replace(/[,;:.…]+$/, '').split(' ');
  while (words.length > 1 && STOPWORDS.has(words.at(-1).toLowerCase())) words.pop();
  return words.join(' ');
}

// Divide un título en dos líneas de hasta `max` caracteres (la segunda va en otro color).
function twoLines(text, max) {
  const words = clean(text).replace(/[.:;,]+$/, '').split(' ');
  let first = '';
  while (words.length && (first + ' ' + words[0]).trim().length <= max) first = (first + ' ' + words.shift()).trim();
  if (!first) first = words.shift() || '';
  // Si la primera línea acaba en "de", "en"… esa palabra pasa a la segunda.
  while (first.includes(' ') && STOPWORDS.has(first.split(' ').at(-1).toLowerCase())) {
    words.unshift(first.split(' ').at(-1));
    first = first.split(' ').slice(0, -1).join(' ');
  }
  return [first, trimStopwords(clip(words.join(' '), max, false))];
}

// "Título: descripción" o "Título, descripción" → { title, description }.
function splitPoint(text, max = 28) {
  const t = stripEmoji(text);
  const m = t.match(/^(.{3,40}?)[:—–-]\s+(.+)$/) || t.match(/^(.{3,40}?)[,.]\s+(.+)$/);
  if (m) return { title: trimStopwords(clip(m[1], max, false)), description: clip(m[2], 90) };
  const plain = t.replace(/[.…]+$/, '');
  if (plain.length <= max + 8) return { title: plain, description: '' };
  // Frase larga: el título son las primeras palabras y la descripción, el resto.
  const title = trimStopwords(clip(plain, max, false));
  return { title, description: clip(plain.slice(title.length), 90) };
}

function stats(text) {
  const out = [];
  const re = new RegExp(NUMBER.source + '\\s+([\\p{L}\\s]{3,30})', 'giu');
  for (const m of text.matchAll(re)) {
    if (!/\d/.test(m[1])) continue;
    out.push({ display: m[1].replace(/\s/g, ''), value: parseFloat(m[1].replace(',', '.')) || 0, label: toBlackbird(trimStopwords(clip(m[2].split(' ').slice(0, 3).join(' '), 22, false))) });
  }
  return out.slice(0, 4);
}

export function analyzeText(raw) {
  const lines = String(raw || '').replace(/\r/g, '').split('\n');
  const hashtags = [...new Set((raw.match(/#[\p{L}\d_]+/gu) || []).map((t) => t))];
  // Quita líneas que son solo hashtags.
  const body = lines.filter((l) => !/^\s*(#[\p{L}\d_]+\s*)+$/u.test(l));
  const text = body.join('\n').trim();

  const nonEmpty = body.map((l) => l.trim()).filter(Boolean);
  const hook = nonEmpty[0] || '';
  const listItems = nonEmpty.filter((l) => BULLET.test(l)).map((l) => l.replace(BULLET, ''));
  const question = [...nonEmpty].reverse().find((l) => /\?\s*$/.test(l)) || '';
  const rest = nonEmpty.slice(1).filter((l) => l !== question && !BULLET.test(l));
  const restSentences = rest.flatMap(sentences).filter((s) => !/:\s*$/.test(s));
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && p !== hook && p !== question && !p.split('\n').every((l) => BULLET.test(l)));

  return { text, hashtags, hook, listItems, question, restSentences, paragraphs };
}

function firstSentence(text) {
  return sentences(stripEmoji(text))[0] || stripEmoji(text);
}

// Lo que queda del gancho tras la primera frase, más el resto de frases.
function afterHook(a) {
  const hookRest = sentences(stripEmoji(a.hook)).slice(1);
  return [...hookRest, ...a.restSentences];
}

function headlineParts(hook) {
  const headline = clip(firstSentence(hook).replace(/[.…]+$/, ''), 46); // dos líneas a 64 px
  // Frase destacada: lo que va después de ":" o del primer punto, o las últimas 3 palabras.
  const m = headline.match(/[:.]\s+(.+)$/);
  const highlight = m ? m[1].replace(/[.…]+$/, '') : headline.replace(/[.…]+$/, '').split(' ').slice(-3).join(' ');
  return { headline, highlight };
}

export function layoutCard(a) {
  const { headline, highlight } = headlineParts(a.hook);
  const more = afterHook(a);
  const source = a.listItems.length >= 2 ? a.listItems : more.slice(1);
  return {
    headline,
    highlight,
    lead: clip(stripEmoji(more[0] || a.question || ''), 70),
    items: source.slice(0, 4).map((s) => splitPoint(s)),
  };
}

function slideFrom(text, n) {
  const [title, titleAccent] = twoLines(toBlackbird(firstSentence(splitPoint(text, 36).title)), 18);
  const found = stats(text);
  return {
    tag: `idea ${n}`,
    title,
    titleAccent,
    summary: clip(firstSentence(text).length > 40 ? firstSentence(text) : stripEmoji(text), 120),
    visual: found.length >= 2 ? { kind: 'stats', items: found, left: '', overlap: '', right: '' } : { kind: 'none', items: [], left: '', overlap: '', right: '' },
  };
}

export function layoutCarousel(a) {
  const tag = toBlackbird((a.hashtags[0] || '#post').slice(1).toLowerCase()).slice(0, 14);
  const cover = {
    tone: 'blue',
    tag,
    title: toBlackbird(clip(firstSentence(a.hook).replace(/[.…]+$/, ''), 56)),
    underline: '',
    summary: clip(afterHook(a)[0] || '', 110),
  };
  const sources = a.listItems.length >= 2 ? a.listItems : a.paragraphs.length >= 2 ? a.paragraphs : afterHook(a).slice(1);
  const slides = sources.slice(0, 5).map((s, i) => slideFrom(s, i + 1));
  if (a.question) {
    const [title, titleAccent] = twoLines(toBlackbird(stripEmoji(a.question).replace(/\?$/, '')), 18);
    slides.push({ tag: 'y tu', title, titleAccent, summary: '', visual: { kind: 'none', items: [], left: '', overlap: '', right: '' } });
  }
  return { cover, slides };
}

export function layoutSlide(a) {
  const { headline } = headlineParts(a.hook);
  const [title, titleAccent] = twoLines(toBlackbird(headline), 18);
  const found = stats(a.text);
  return {
    style: 'slide',
    cover: { tone: 'blue', tag: toBlackbird((a.hashtags[0] || '#post').slice(1).toLowerCase()).slice(0, 14), title: toBlackbird(headline), underline: '', summary: clip(afterHook(a)[0] || '', 110) },
    slide: {
      tag: toBlackbird((a.hashtags[0] || '#post').slice(1).toLowerCase()).slice(0, 14),
      title,
      titleAccent,
      summary: clip(afterHook(a)[0] || '', 120),
      visual: found.length >= 2 ? { kind: 'stats', items: found, left: '', overlap: '', right: '' } : { kind: 'none', items: [], left: '', overlap: '', right: '' },
    },
  };
}

// Post completo listo para el editor a partir del texto pegado.
export function postFromText(raw, format) {
  const a = analyzeText(raw);
  const base = {
    title: clip(firstSentence(a.hook), 50) || 'Post pegado',
    text: a.text,
    hashtags: a.hashtags,
  };
  if (format === 'card') return { ...base, format, card: layoutCard(a) };
  if (format === 'slide') return { ...base, format, ...layoutSlide(a) };
  return { ...base, format: 'carousel', ...layoutCarousel(a) };
}
