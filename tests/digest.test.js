import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, targetWeek, digestPrompt, weekMarkdown, generateWeek } from '../server/digest.js';
import { parseWeek } from '../src/parser.js';

test('semanas ISO, también en el cambio de año', () => {
  assert.deepEqual(isoWeek('2026-10-01'), { id: '2026-W40', start: '2026-09-28' });
  assert.deepEqual(isoWeek('2027-01-01'), { id: '2026-W53', start: '2026-12-28' });
  assert.deepEqual(isoWeek('2025-12-29'), { id: '2026-W01', start: '2025-12-29' });
});

test('semana actual desde hoy; la próxima, completa', () => {
  const now = targetWeek('current', '2026-10-01');
  assert.equal(now.id, '2026-W40');
  assert.deepEqual(now.days, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  const next = targetWeek('next', '2026-10-01');
  assert.equal(next.id, '2026-W41');
  assert.equal(next.days.length, 7);
  assert.equal(next.days[0], '2026-10-05');
});

const SETTINGS = { topics: [{ name: 'Liderazgo', note: 'equipos remotos' }, { name: 'IA' }], postsPerWeek: 2, audience: 'managers', notes: 'Tono cercano' };

test('el prompt lleva temas, días, audiencia e indicaciones', () => {
  const p = digestPrompt(SETTINGS, targetWeek('next', '2026-10-01'), 'Hablar del evento del jueves');
  assert.match(p, /Prepara 2 propuestas de post para la semana 2026-W41/);
  assert.match(p, /lunes 2026-10-05/);
  assert.match(p, /- Liderazgo: equipos remotos/);
  assert.match(p, /Audiencia: managers/);
  assert.match(p, /Para esta semana: Hablar del evento del jueves/);
});

test('el Markdown generado se lee como una semana del digest', () => {
  const week = targetWeek('next', '2026-10-01');
  const md = weekMarkdown(week, {
    tema: 'Liderar\ncon IA',
    notas: '',
    posts: [
      { titulo: 'Uno', dia: '2026-10-06', hora: '08:30', pilar: 'Liderazgo', objetivo: 'Conversación', formato: 'Texto', imagen: '', hashtags: ['Liderazgo', '#IA'], texto: 'Gancho.\n\n## no es un post\n\n¿Y tú?' },
      { titulo: 'Dos', dia: '2030-01-01', hora: 'pronto', pilar: 'IA', objetivo: 'Alcance', formato: 'Carrusel', imagen: 'Carrusel de 5 slides', hashtags: [], texto: 'Otro texto' },
    ],
  });
  const parsed = parseWeek(md, week.id);
  assert.equal(parsed.id, '2026-W41');
  assert.equal(parsed.theme, 'Liderar con IA');
  assert.equal(parsed.posts.length, 2);
  assert.equal(parsed.posts[0].hashtags, '#Liderazgo #IA');
  assert.equal(parsed.posts[0].text, 'Gancho.\n\nno es un post\n\n¿Y tú?');
  assert.equal(parsed.posts[1].dia, '2026-10-05'); // día fuera de la semana → primer día disponible
  assert.equal(parsed.posts[1].hora, '08:30');
  assert.equal(parsed.posts[1].imagen, 'Carrusel de 5 slides');
});

test('generateWeek pide a Claude un esquema con los temas y días, y sin temas no llama', async () => {
  let call;
  const callClaude = async (args) => ((call = args), { tema: 'T', notas: 'n', posts: [{ titulo: 'A', dia: '2026-10-02', hora: '09:00', pilar: 'IA', objetivo: 'Alcance', formato: 'Texto', imagen: '', hashtags: ['#IA'], texto: 'Hola' }] });
  const res = await generateWeek({ which: 'current', today: '2026-10-01', settings: SETTINGS }, { callClaude });
  assert.deepEqual({ week: res.week, posts: res.posts }, { week: '2026-W40', posts: 1 });
  const item = call.schema.properties.posts.items.properties;
  assert.deepEqual(item.pilar.enum, ['Liderazgo', 'IA']);
  assert.deepEqual(item.dia.enum, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  await assert.rejects(generateWeek({ which: 'next', today: '2026-10-01', settings: { topics: [] } }, { callClaude }), /Elige primero tus temas/);
});
