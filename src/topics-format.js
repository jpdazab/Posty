// Temas del AI Digest de cada persona: formato compartido por la web y la API de las rutinas.

export const TOPIC_SUGGESTIONS = [
  'Liderazgo',
  'Diseño de producto',
  'Inteligencia artificial',
  'Carrera profesional',
  'Emprendimiento',
  'Productividad',
  'Cultura de equipo',
  'Marketing',
  'Ventas',
  'Tecnología',
  'Gestión de producto',
  'Marca personal',
];

export const MAX_TOPICS = 12;

const text = (v, max) => String(v ?? '').trim().slice(0, max);

export function normalizeSettings(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const topics = (Array.isArray(data.topics) ? data.topics : [])
    .map((t) => ({ name: text(t?.name, 60), note: text(t?.note, 200) }))
    .filter((t) => t.name && !seen.has(t.name.toLowerCase()) && seen.add(t.name.toLowerCase()))
    .slice(0, MAX_TOPICS);
  const perWeek = Number.parseInt(data.postsPerWeek, 10);
  return {
    topics,
    postsPerWeek: Number.isFinite(perWeek) ? Math.min(7, Math.max(1, perWeek)) : 3,
    audience: text(data.audience, 300),
    notes: text(data.notes, 1000),
  };
}

// Instrucciones en texto para la rutina de Claude.
export function settingsBrief(settings) {
  const s = normalizeSettings(settings);
  if (!s.topics.length) return 'Esta persona aún no eligió temas en Posty: usa los temas de siempre de la rutina.';
  const lines = [
    `Prepara ${s.postsPerWeek} ${s.postsPerWeek === 1 ? 'post' : 'posts'} esta semana, repartidos entre estos temas (usa cada tema como "pilar"):`,
    ...s.topics.map((t) => `- ${t.name}${t.note ? `: ${t.note}` : ''}`),
  ];
  if (s.audience) lines.push(`Audiencia: ${s.audience}`);
  if (s.notes) lines.push(`Indicaciones: ${s.notes}`);
  return lines.join('\n');
}
