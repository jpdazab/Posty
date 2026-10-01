// Convierte un archivo de propuestas semanales (Markdown) en datos.
//
// Formato (ver PROPUESTAS.md):
//
//   ---
//   semana: 2026-W40
//   inicio: 2026-09-28
//   tema: Tema de la semana
//   notas: Comentario opcional de Claude
//   ---
//
//   ## Título del post
//   dia: 2026-09-29
//   hora: 08:30
//   pilar: Liderazgo
//
//   Texto del post tal cual se publicará en LinkedIn...

export const META_KEYS = [
  'dia', 'hora', 'pilar', 'objetivo', 'formato', 'imagen', 'hashtags',
  'imagenes', 'pdf', 'inspiracion', 'fuentes',
];

export const LINKEDIN_MAX_CHARS = 3000;

function parseFrontmatter(source) {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    if (kv) data[kv[1].toLowerCase()] = unquote(kv[2].trim());
  }
  return { data, body: source.slice(match[0].length) };
}

function unquote(value) {
  if (/^(["']).*\1$/.test(value)) return value.slice(1, -1);
  return value;
}

function parsePost(block, index, weekId) {
  const lines = block.split(/\r?\n/);
  const title = lines.shift().replace(/^##\s*/, '').trim();
  const meta = {};

  // Metadatos: líneas "clave: valor" inmediatamente después del título,
  // solo con claves conocidas para no confundir texto del post.
  while (lines.length) {
    const kv = lines[0].match(/^\s*([\w]+)\s*:\s*(.*)$/);
    if (!kv || !META_KEYS.includes(kv[1].toLowerCase())) break;
    meta[kv[1].toLowerCase()] = unquote(kv[2].trim());
    lines.shift();
  }

  const text = lines.join('\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
  return {
    id: `${weekId}-${index + 1}`,
    index: index + 1,
    title,
    ...meta,
    text,
  };
}

export function parseWeek(source, fallbackId = 'semana') {
  const { data, body } = parseFrontmatter(source);
  const weekId = data.semana || fallbackId;
  const blocks = body.split(/^(?=##\s)/m).filter((b) => /^##\s/.test(b));
  return {
    id: weekId,
    start: data.inicio || null,
    theme: data.tema || '',
    notes: data.notas || '',
    posts: blocks.map((b, i) => parsePost(b, i, weekId)),
  };
}

// Texto final listo para LinkedIn: cuerpo + hashtags (si no están ya en el texto).
export function composePost(text, hashtags) {
  if (!hashtags) return text;
  const tags = hashtags
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
  return tags.length ? `${text}\n\n${tags.join(' ')}` : text;
}

// "a.png, b.png" -> ['a.png', 'b.png']; las fuentes (URLs) también pueden ir separadas por espacios.
export function splitList(value, { spaces = false } = {}) {
  if (!value) return [];
  return value.split(spaces ? /[\s,]+/ : /\s*,\s*/).map((v) => v.trim()).filter(Boolean);
}

export function linkedInShareUrl(text) {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
}
