// Genera las propuestas de una semana del AI Digest con Claude, a partir de los temas de la persona.
// Devuelve el Markdown en el formato de PROPUESTAS.md, igual que el que envía la rutina semanal.

import { callClaude, GenerateError } from './generate.js';
import { normalizeSettings } from '../src/topics-format.js';
import { parseWeek } from '../src/parser.js';
import { isoWeek, targetWeek, DAY_NAMES } from '../src/week-dates.js';

export { isoWeek, targetWeek };

const FORMATS = ['Texto', 'Texto + imagen', 'Carrusel'];
const iso = (d) => d.toISOString().slice(0, 10);

const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' };

function schemaFor(settings, days) {
  const pilar = settings.topics.length ? { type: 'string', enum: settings.topics.map((t) => t.name) } : str;
  return obj({
    tema: { type: 'string', description: 'Hilo conductor de la semana, una frase corta' },
    notas: { type: 'string', description: 'Comentario breve para el autor sobre el plan de la semana' },
    posts: {
      type: 'array',
      items: obj({
        titulo: { type: 'string', description: 'Título interno corto (no se publica)' },
        dia: { type: 'string', enum: days },
        hora: { type: 'string', description: 'HH:MM, hora sugerida de publicación' },
        pilar,
        objetivo: { type: 'string', description: 'Alcance, Conversación, Autoridad o Conversión' },
        formato: { type: 'string', enum: FORMATS },
        imagen: { type: 'string', description: 'Idea de imagen o carrusel; vacío si es solo texto' },
        hashtags: { type: 'array', items: str, description: '3 hashtags con #' },
        texto: { type: 'string', description: 'Texto del post listo para publicar, sin hashtags' },
      }),
    },
  });
}

const SYSTEM = `Eres ghostwriter de LinkedIn. Preparas la tanda semanal de propuestas de una persona según los temas que eligió.
Escribes en español, en prosa concisa, directa y con voz propia. Nada de listas con viñetas dentro del texto y nunca uses rayas (em dashes). No inventes datos ni cifras: si no hay una cifra verificable, no la pongas.
Cada post: una primera línea que funcione como gancho (es lo único que se ve antes de "ver más"), entre 120 y 220 palabras y una pregunta final que invite a conversar. Los hashtags van aparte, nunca dentro del texto.
Varía los ángulos (opinión, aprendizaje personal, guía práctica, tendencia) y reparte los posts entre los temas y los días disponibles, sin repetir día salvo que haya más posts que días. Horas habituales de LinkedIn: entre 07:30 y 09:30 o entre 12:00 y 13:30.`;

export function digestPrompt(settings, week, extra = '') {
  const s = normalizeSettings(settings);
  const lines = [
    `Prepara ${s.postsPerWeek} ${s.postsPerWeek === 1 ? 'propuesta' : 'propuestas'} de post para la semana ${week.id}.`,
    `Días disponibles: ${week.days.map((d) => `${DAY_NAMES[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7]} ${d}`).join(', ')}.`,
    'Temas (usa cada uno como "pilar"):',
    ...s.topics.map((t) => `- ${t.name}${t.note ? `: ${t.note}` : ''}`),
  ];
  if (s.audience) lines.push(`Audiencia: ${s.audience}`);
  if (s.notes) lines.push(`Indicaciones de la persona: ${s.notes}`);
  if (extra.trim()) lines.push(`Para esta semana: ${extra.trim().slice(0, 1000)}`);
  return lines.join('\n');
}

const oneLine = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
// Una línea "## " dentro del texto empezaría otro post: se le quitan las almohadillas.
const safeText = (v) => String(v ?? '').replace(/\r/g, '').replace(/^#{2,}\s*/gm, '').trim();

export function weekMarkdown(week, data) {
  const head = ['---', `semana: ${week.id}`, `inicio: ${week.start}`, `tema: ${oneLine(data.tema)}`];
  if (oneLine(data.notas)) head.push(`notas: ${oneLine(data.notas)}`);
  head.push('---', '');
  const posts = (data.posts || []).map((p) => {
    const meta = [
      `## ${oneLine(p.titulo) || 'Propuesta'}`,
      `dia: ${week.days.includes(p.dia) ? p.dia : week.days[0]}`,
      /^\d{2}:\d{2}$/.test(p.hora) ? `hora: ${p.hora}` : 'hora: 08:30',
      `pilar: ${oneLine(p.pilar)}`,
      `objetivo: ${oneLine(p.objetivo)}`,
      `formato: ${oneLine(p.formato)}`,
    ];
    if (oneLine(p.imagen)) meta.push(`imagen: ${oneLine(p.imagen)}`);
    const tags = (p.hashtags || []).map((t) => oneLine(t).replace(/^#?/, '#')).filter((t) => t.length > 1);
    if (tags.length) meta.push(`hashtags: ${tags.join(' ')}`);
    return `${meta.join('\n')}\n\n${safeText(p.texto)}\n`;
  });
  return `${head.join('\n')}\n${posts.join('\n')}`;
}

// { which: 'current' | 'next', today: 'AAAA-MM-DD', settings, extra } → { week, source, posts }
export async function generateWeek({ which, today, settings, extra = '' }, deps = {}) {
  const s = normalizeSettings(settings);
  if (!s.topics.length) throw new GenerateError(400, 'Elige primero tus temas en el AI Digest.');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : iso(new Date());
  const week = targetWeek(which === 'next' ? 'next' : 'current', day);
  const call = deps.callClaude || callClaude;
  const data = await call({ system: SYSTEM, prompt: digestPrompt(s, week, extra), schema: schemaFor(s, week.days) });
  const source = weekMarkdown(week, data);
  const parsed = parseWeek(source, week.id);
  if (!parsed.posts.length) throw new GenerateError(502, 'Claude no devolvió propuestas. Vuelve a intentarlo.');
  return { week: week.id, source, posts: parsed.posts.length };
}
