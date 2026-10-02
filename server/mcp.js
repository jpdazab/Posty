// Conector de Claude (servidor MCP remoto, Streamable HTTP sin estado) para que cada persona use
// su propio Claude (su suscripción, no la API) para crear posts y propuestas en Posty.
//
// Dirección: https://<posty>/api/mcp?token=posty_…  (el token personal de Cuenta; también vale
// "Authorization: Bearer posty_…"). Cada petición es JSON-RPC 2.0 y se responde con JSON.
//
// Herramientas: posty_get_topics, posty_list_templates, posty_list_proposals,
// posty_add_proposals y posty_create_post.

import { adminClient, routineOwner } from './handlers.js';
import { postsMarkdown, weekMarkdown } from './digest.js';
import { normalizeSettings, settingsBrief } from '../src/topics-format.js';
import { parseWeek, LINKEDIN_MAX_CHARS } from '../src/parser.js';
import { targetWeek, weekFromId, isoWeek } from '../src/week-dates.js';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'posty', title: 'Posty', version: '1.0.0' };
const MAX_POSTS = 10;

const INSTRUCTIONS = `Posty es la plataforma donde esta persona revisa, diseña y publica sus posts de LinkedIn.
- Antes de proponer posts, lee sus temas con posty_get_topics y lo ya propuesto con posty_list_proposals para no repetir.
- Para la tanda de la semana (propuestas de texto con fecha y hora), usa posty_add_proposals: aparecen en el AI Digest.
- Para un post con diseño, mira las plantillas con posty_list_templates y usa posty_create_post: aparece en Crear post.
- Escribe en el idioma de la persona, con una primera línea que funcione como gancho, sin hashtags dentro del texto y sin inventar datos.
- Las imágenes no se pueden subir desde aquí: la persona las elige en Posty.`;

const isoToday = () => new Date().toISOString().slice(0, 10);
const text = (v, max) => String(v ?? '').trim().slice(0, max);

class ToolError extends Error {}

// ---------- Herramientas ----------

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

const TOOLS = [
  {
    name: 'posty_get_topics',
    title: 'Ver mis temas',
    description: 'Devuelve los temas que la persona eligió en Posty para su AI Digest (con su enfoque), cuántos posts quiere por semana, su audiencia y sus indicaciones de tono. Úsalo antes de proponer posts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'posty_list_templates',
    title: 'Ver mis plantillas',
    description: 'Lista las plantillas de diseño de la persona con sus campos (textos, imágenes y gráficas) para poder rellenarlas con posty_create_post.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'posty_list_proposals',
    title: 'Ver propuestas',
    description: 'Lista las propuestas del AI Digest de las últimas semanas (título, fecha, pilar y estado: pendiente, aprobado, publicado o descartado). Úsalo para no repetir ideas.',
    inputSchema: {
      type: 'object',
      properties: { weeks: { type: 'integer', minimum: 1, maximum: 8, description: 'Cuántas semanas recientes incluir (por defecto 3).' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'posty_add_proposals',
    title: 'Añadir propuestas al AI Digest',
    description: `Añade propuestas de post (solo texto) a una semana del AI Digest de Posty. Por defecto se suman a las que ya hubiera en esa semana. Máximo ${MAX_POSTS} por llamada y ${LINKEDIN_MAX_CHARS} caracteres por texto.`,
    inputSchema: {
      type: 'object',
      properties: {
        week: str('"next" (la semana que viene, por defecto), "current" (esta semana, desde hoy) o una semana ISO como "2026-W42".'),
        theme: str('Hilo conductor de la semana, una frase corta.'),
        notes: str('Comentario opcional para la persona sobre el plan.'),
        replace: { type: 'boolean', description: 'true para sustituir las propuestas que ya hubiera en esa semana (por defecto false: se añaden).' },
        posts: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_POSTS,
          items: {
            type: 'object',
            properties: {
              title: str('Título interno corto (no se publica).'),
              text: str('Texto del post listo para publicar, sin hashtags.'),
              day: str('Fecha sugerida AAAA-MM-DD dentro de esa semana.'),
              time: str('Hora sugerida HH:MM.'),
              pillar: str('Tema o pilar (uno de sus temas).'),
              objective: str('Alcance, Conversación, Autoridad o Conversión.'),
              format: str('Texto, Texto + imagen o Carrusel.'),
              image_idea: str('Idea para la imagen o el carrusel (opcional).'),
              hashtags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
            },
            required: ['title', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['posts'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false },
  },
  {
    name: 'posty_create_post',
    title: 'Crear post con diseño',
    description: 'Crea un post en "Crear post" de Posty usando una de sus plantillas: el texto para LinkedIn y el contenido de cada campo de la plantilla (textos y datos de gráficas). La persona lo revisa, elige imágenes si hace falta, descarga la gráfica y lo publica.',
    inputSchema: {
      type: 'object',
      properties: {
        title: str('Título interno corto.'),
        text: str('Texto del post para LinkedIn, sin hashtags.'),
        hashtags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        template: str('Nombre o id de la plantilla (de posty_list_templates). Si no se indica, se usa la primera.'),
        fields: {
          type: 'object',
          description: 'Texto de cada campo de texto de la plantilla: clave = nombre o id del campo (por ejemplo {"Titular": "…", "Texto": "…"}). Los dos primeros campos que falten se rellenan con el título y la primera frase del texto.',
          additionalProperties: { type: 'string' },
        },
        charts: {
          type: 'object',
          description: 'Datos de cada gráfica: clave = nombre o id del campo; valor = una línea por dato "valor | etiqueta" (por ejemplo "48% | Research\\n31% | Testing"). Solo cifras reales.',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['title', 'text'],
      additionalProperties: false,
    },
    annotations: { destructiveHint: false },
  },
];

// ---------- Datos ----------

async function loadKit(db, userId) {
  const { data, error } = await db.from('kits').select('data').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.data || {};
}

const layerKind = (l) => (l.kind === 'image' ? 'imagen' : l.kind === 'chart' ? 'gráfica' : l.kind === 'shape' ? null : 'texto');

function templateSummary(t) {
  return {
    id: t.id,
    name: t.name,
    fields: (t.layers || [])
      .filter((l) => layerKind(l))
      .map((l) => ({
        id: l.id,
        name: l.name || l.id,
        type: layerKind(l),
        ...(l.kind === 'chart' ? { chart: l.chart, example: l.data } : l.kind === 'image' ? {} : { example: l.sample || '' }),
      })),
  };
}

function findByKey(layers, key) {
  const k = String(key).trim().toLowerCase();
  return layers.find((l) => l.id.toLowerCase() === k) || layers.find((l) => (l.name || '').trim().toLowerCase() === k);
}

const firstSentence = (s) => (String(s).replace(/\s+/g, ' ').match(/^.+?[.!?…](\s|$)/) || [String(s)])[0].trim();

function resolveWeek(value) {
  const v = String(value || 'next').trim();
  if (v === 'next' || v === 'current') return targetWeek(v, isoToday());
  const week = weekFromId(v);
  if (!week) throw new ToolError(`Semana no válida: "${v}". Usa "next", "current" o el formato AAAA-Www (por ejemplo ${isoWeek(isoToday()).id}).`);
  return week;
}

function cleanTags(list) {
  return (list || []).map((t) => String(t).trim().replace(/^#?/, '#').replace(/\s+/g, '')).filter((t) => t.length > 1).slice(0, 5);
}

// ---------- Ejecución ----------

const TOOL_RUN = {
  async posty_get_topics({ db, userId }) {
    const { data, error } = await db.from('digest_settings').select('data').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(error.message);
    const settings = normalizeSettings(data?.data);
    return { text: settingsBrief(settings), structured: settings };
  },

  async posty_list_templates({ db, userId }) {
    const kit = await loadKit(db, userId);
    const templates = (kit.customTemplates || []).map(templateSummary);
    if (!templates.length) return { text: 'Esta persona aún no tiene plantillas. Puede crearlas en Posty → Diseños. Mientras tanto, usa posty_add_proposals para propuestas de solo texto.', structured: { templates } };
    const lines = templates.map((t) => `- ${t.name} (id ${t.id}): ${t.fields.map((f) => `${f.name} [${f.type}${f.chart ? `: ${f.chart}` : ''}]`).join(', ')}`);
    return { text: `Plantillas:\n${lines.join('\n')}\nLas imágenes las elige la persona en Posty.`, structured: { templates } };
  },

  async posty_list_proposals({ db, userId }, args) {
    const limit = Math.min(8, Math.max(1, Number(args.weeks) || 3));
    const { data: rows, error } = await db.from('weeks').select('week, source').eq('user_id', userId).order('week', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    const { data: states } = await db.from('post_states').select('post_id, data').eq('user_id', userId);
    const status = Object.fromEntries((states || []).map((s) => [s.post_id, s.data?.status || 'pendiente']));
    const weeks = (rows || []).map((r) => {
      const w = parseWeek(r.source, r.week);
      return { week: w.id, theme: w.theme, posts: w.posts.map((p) => ({ title: p.title, day: p.dia || '', pillar: p.pilar || '', status: status[p.id] || 'pendiente' })) };
    });
    if (!weeks.length) return { text: 'Todavía no hay propuestas en el AI Digest.', structured: { weeks } };
    const lines = weeks.map((w) => `${w.week}${w.theme ? ` · ${w.theme}` : ''}\n${w.posts.map((p) => `  - ${p.title} (${[p.day, p.pillar, p.status].filter(Boolean).join(', ')})`).join('\n')}`);
    return { text: lines.join('\n'), structured: { weeks } };
  },

  async posty_add_proposals({ db, userId, origin }, args) {
    const posts = Array.isArray(args.posts) ? args.posts.slice(0, MAX_POSTS) : [];
    if (!posts.length) throw new ToolError('Incluye al menos una propuesta en "posts".');
    const week = resolveWeek(args.week);
    const items = posts.map((p, i) => {
      const body = text(p.text, LINKEDIN_MAX_CHARS + 500);
      if (!body) throw new ToolError(`La propuesta ${i + 1} no tiene texto.`);
      return {
        titulo: text(p.title, 120) || `Propuesta ${i + 1}`,
        dia: week.days.includes(p.day) ? p.day : week.days[Math.min(i, week.days.length - 1)],
        hora: /^\d{2}:\d{2}$/.test(p.time || '') ? p.time : '08:30',
        pilar: text(p.pillar, 60),
        objetivo: text(p.objective, 40),
        formato: text(p.format, 40) || 'Texto',
        imagen: text(p.image_idea, 300),
        hashtags: cleanTags(p.hashtags),
        texto: body,
      };
    });

    const { data: existing, error } = await db.from('weeks').select('source').eq('user_id', userId).eq('week', week.id).maybeSingle();
    if (error) throw new Error(error.message);
    const append = existing?.source && !args.replace;
    const source = append
      ? `${existing.source.replace(/\s+$/, '')}\n\n${postsMarkdown(week, items).join('\n')}`
      : weekMarkdown(week, { tema: text(args.theme, 200) || 'Propuestas desde Claude', notas: text(args.notes, 500), posts: items });
    const parsed = parseWeek(source, week.id);
    if (parsed.id !== week.id || !parsed.posts.length) throw new Error('No se pudo componer la semana.');

    // Al sustituir una semana, sus archivos anteriores ya no corresponden.
    if (existing && args.replace) {
      const dir = `${userId}/weeks/${week.id}`;
      const { data: old } = await db.storage.from('assets').list(dir, { limit: 200 });
      if (old?.length) await db.storage.from('assets').remove(old.map((f) => `${dir}/${f.name}`));
    }
    const { error: saveError } = await db.from('weeks').upsert({ user_id: userId, week: week.id, source, updated_at: new Date().toISOString() }, { onConflict: 'user_id,week' });
    if (saveError) throw new Error(saveError.message);
    const over = items.filter((p) => p.texto.length > LINKEDIN_MAX_CHARS).length;
    return {
      text: `Listo: ${items.length} ${items.length === 1 ? 'propuesta añadida' : 'propuestas añadidas'} a ${week.id} (${parsed.posts.length} en total esa semana). Se ven en ${origin}/#/digest${over ? `. Ojo: ${over} superan los ${LINKEDIN_MAX_CHARS} caracteres de LinkedIn.` : '.'}`,
      structured: { week: week.id, added: items.length, total: parsed.posts.length, url: `${origin}/#/digest` },
    };
  },

  async posty_create_post({ db, userId, origin }, args) {
    const title = text(args.title, 120);
    const body = text(args.text, LINKEDIN_MAX_CHARS + 500);
    if (!title || !body) throw new ToolError('Faltan "title" o "text".');
    const kit = await loadKit(db, userId);
    const templates = kit.customTemplates || [];
    if (!templates.length) throw new ToolError('Esta persona aún no tiene plantillas en Posty (Diseños). Usa posty_add_proposals para dejar la propuesta de texto en el AI Digest.');
    const tpl = args.template ? findByKey(templates.map((t) => ({ ...t, id: t.id, name: t.name })), args.template) : templates[0];
    if (!tpl) throw new ToolError(`No hay ninguna plantilla llamada "${args.template}". Disponibles: ${templates.map((t) => t.name).join(', ')}.`);

    const layers = tpl.layers || [];
    const texts = layers.filter((l) => !l.kind || l.kind === 'text');
    const charts = layers.filter((l) => l.kind === 'chart');
    const fields = Object.fromEntries(texts.map((l) => [l.id, l.sample || '']));
    const unknown = [];
    for (const [key, value] of Object.entries(args.fields || {})) {
      const l = findByKey(texts, key);
      if (l) fields[l.id] = text(value, 600);
      else unknown.push(key);
    }
    // Los dos primeros textos (titular y texto) se rellenan aunque no se indiquen.
    const given = new Set(Object.keys(args.fields || {}).map((k) => findByKey(texts, k)?.id).filter(Boolean));
    if (texts[0] && !given.has(texts[0].id)) fields[texts[0].id] = title;
    if (texts[1] && !given.has(texts[1].id)) fields[texts[1].id] = text(firstSentence(body), 200);
    const chartData = Object.fromEntries(charts.map((l) => [l.id, l.data || '']));
    for (const [key, value] of Object.entries(args.charts || {})) {
      const l = findByKey(charts, key);
      if (l) chartData[l.id] = text(value, 1000);
      else unknown.push(key);
    }

    const now = new Date();
    const post = {
      id: `post-${now.getTime()}`,
      createdAt: now.toISOString(),
      prompt: 'Creado desde Claude',
      source: 'claude',
      format: 'custom',
      templateId: tpl.id,
      title,
      text: body,
      hashtags: cleanTags(args.hashtags),
      fields,
      images: {},
      charts: chartData,
    };
    const { error } = await db.from('created_posts').upsert({ user_id: userId, id: post.id, data: post, updated_at: now.toISOString() }, { onConflict: 'user_id,id' });
    if (error) throw new Error(error.message);
    const images = layers.filter((l) => l.kind === 'image' && !l.assetId).length;
    return {
      text: [
        `Post "${title}" creado con la plantilla "${tpl.name}". Está en ${origin}/#/crear (Creados recientemente).`,
        images ? `La plantilla tiene ${images} ${images === 1 ? 'hueco de imagen' : 'huecos de imagen'}: la persona elige la imagen en Posty.` : '',
        unknown.length ? `Campos que no existen en la plantilla y se ignoraron: ${unknown.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      structured: { id: post.id, template: tpl.name, url: `${origin}/#/crear` },
    };
  },
};

// ---------- JSON-RPC ----------

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function dispatch(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Petición JSON-RPC no válida');
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null; // notifications/initialized, notifications/cancelled…

  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return rpcResult(msg.id, {});
    case 'tools/list':
      return rpcResult(msg.id, { tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      const run = TOOL_RUN[name];
      if (!run) return rpcError(msg.id, -32602, `Herramienta desconocida: ${name}`);
      try {
        const out = await run(ctx, msg.params?.arguments || {});
        return rpcResult(msg.id, { content: [{ type: 'text', text: out.text }], structuredContent: out.structured });
      } catch (err) {
        if (!(err instanceof ToolError)) console.error(err);
        // Errores de la herramienta: se devuelven como resultado para que Claude los lea y corrija.
        return rpcResult(msg.id, { content: [{ type: 'text', text: err instanceof ToolError ? err.message : 'Posty no pudo completar la acción. Inténtalo de nuevo en un momento.' }], isError: true });
      }
    }
    default:
      return rpcError(msg.id, -32601, `Método no soportado: ${msg.method}`);
  }
}

function originOf(headers) {
  const host = headers['x-forwarded-host'] || headers.host || 'posty';
  const proto = headers['x-forwarded-proto'] || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${String(proto).split(',')[0]}://${String(host).split(',')[0]}`;
}

export async function handleMcp(req, deps = {}) {
  // Sin flujo SSE: solo POST (las respuestas van en el propio JSON).
  if (req.method !== 'POST') return { status: 405, headers: { Allow: 'POST' }, json: rpcError(null, -32000, 'Usa POST') };
  const db = deps.admin === undefined ? adminClient() : deps.admin;
  const token = String(req.query?.token || '').trim() || undefined;
  const owner = await routineOwner(db, req.headers, token ?? undefined);
  if (owner.error) return { status: owner.error.status, json: rpcError(null, -32001, owner.error.json.error) };

  let payload;
  try {
    payload = JSON.parse(req.body?.toString('utf8') || '');
  } catch {
    return { status: 400, json: rpcError(null, -32700, 'JSON no válido') };
  }
  const ctx = { db, userId: owner.userId, origin: originOf(req.headers) };
  const batch = Array.isArray(payload);
  const responses = (await Promise.all((batch ? payload : [payload]).map((m) => dispatch(m, ctx)))).filter(Boolean);
  if (!responses.length) return { status: 202 }; // solo notificaciones
  return { status: 200, json: batch ? responses : responses[0] };
}
