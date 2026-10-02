// Lógica de las APIs de Posty, independiente de Vercel para poder probarla y usarla en desarrollo.
// Cada handler recibe { method, headers, query, body } (body = Buffer) y devuelve { status, json }.
//
// - POST /api/generate   { prompt, format }       Genera un post con Claude (sesión + límite mensual).
// - POST /api/proposals?week=AAAA-Www            Markdown de la semana (rutina semanal, token personal).
// - POST /api/proposals?week=AAAA-Www&file=x.png Un archivo de la semana (imagen o PDF).
// - POST /api/digest     { which, today, extra } Genera las propuestas de una semana con Claude (sesión + límite).
// - POST /api/url        { url }                  Lee una web (sin IA) para proponer diseños (sesión).
// - GET  /api/topics                             Temas del AI Digest de la persona (rutina semanal, token personal).

import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { generatePost, checkAccess, GenerateError } from './generate.js';
import { parseWeek } from '../src/parser.js';
import { normalizeSettings, settingsBrief } from '../src/topics-format.js';
import { generateWeek } from './digest.js';
import { readUrl } from './url-info.js';

export const MAX_MARKDOWN = 1024 * 1024; // 1 MB
export const MAX_FILE = 4 * 1024 * 1024; // 4 MB (Vercel admite 4,5 MB por petición)

const FILE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };

let admin;

// Cliente de Supabase con la clave de servicio (salta las reglas por usuario): solo en el servidor.
export function adminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

export function monthlyLimit() {
  const n = Number.parseInt(process.env.AI_MONTHLY_LIMIT ?? '30', 10);
  return Number.isFinite(n) ? n : 30;
}

const reply = (status, json) => ({ status, json });

function bearer(headers) {
  const h = headers.authorization || headers.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// ---------- /api/generate ----------

export async function handleGenerate(req, deps = {}) {
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido' });
  const db = deps.admin === undefined ? adminClient() : deps.admin;
  const generate = deps.generatePost || generatePost;

  let body;
  try {
    body = JSON.parse(req.body?.toString('utf8') || '{}');
  } catch {
    return reply(400, { error: 'La petición no es JSON válido.' });
  }

  let userId = null;
  try {
    if (db) {
      // Modo con cuentas: hace falta una sesión válida de Supabase.
      const token = bearer(req.headers);
      if (!token) return reply(401, { error: 'Inicia sesión para usar Claude.' });
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user) return reply(401, { error: 'Tu sesión caducó. Recarga la página.' });
      userId = data.user.id;
      const limit = monthlyLimit();
      const { data: count, error: rpcError } = await db.rpc('consume_ai_credit', { p_user: userId, p_limit: limit });
      if (rpcError) throw rpcError;
      if (count === null) return reply(429, { error: `Has llegado al límite de ${limit} posts generados con Claude este mes. Puedes seguir con "Pegar mi texto" o "Desde cero".` });
    } else {
      checkAccess(req.headers['x-posty-code']);
    }
    const post = await generate(body);
    return reply(200, post);
  } catch (err) {
    // Si Claude falló, se devuelve el crédito para no contar el intento.
    if (userId) await db.rpc('refund_ai_credit', { p_user: userId }).catch(() => {});
    if (err instanceof GenerateError) return reply(err.status, { error: err.message });
    console.error(err);
    return reply(500, { error: 'Error inesperado al generar el post.' });
  }
}

// ---------- /api/url ----------

// Sesión obligatoria con cuentas, para que nadie use Posty como proxy para leer webs.
export async function handleUrl(req, deps = {}) {
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido' });
  const db = deps.admin === undefined ? adminClient() : deps.admin;
  const read = deps.readUrl || readUrl;
  let body;
  try {
    body = JSON.parse(req.body?.toString('utf8') || '{}');
  } catch {
    return reply(400, { error: 'La petición no es JSON válido.' });
  }
  try {
    if (db) {
      const token = bearer(req.headers);
      if (!token) return reply(401, { error: 'Inicia sesión para leer webs.' });
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user) return reply(401, { error: 'Tu sesión caducó. Recarga la página.' });
    } else {
      checkAccess(req.headers['x-posty-code']);
    }
    if (!body.url) return reply(400, { error: 'Escribe la dirección de una web.' });
    return reply(200, await read(body.url));
  } catch (err) {
    if (err instanceof GenerateError) return reply(err.status, { error: err.message });
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return reply(504, { error: 'La web tardó demasiado en responder.' });
    console.error(err);
    return reply(502, { error: 'No se pudo leer esa web.' });
  }
}

// ---------- /api/digest ----------

// Una generación cuenta un crédito por propuesta. Si Claude falla, se devuelven todos.
export async function handleDigest(req, deps = {}) {
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido' });
  const db = deps.admin === undefined ? adminClient() : deps.admin;
  const generate = deps.generateWeek || generateWeek;

  let body;
  try {
    body = JSON.parse(req.body?.toString('utf8') || '{}');
  } catch {
    return reply(400, { error: 'La petición no es JSON válido.' });
  }

  let userId = null;
  let charged = 0;
  try {
    let settings;
    if (db) {
      const token = bearer(req.headers);
      if (!token) return reply(401, { error: 'Inicia sesión para usar Claude.' });
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user) return reply(401, { error: 'Tu sesión caducó. Recarga la página.' });
      userId = data.user.id;
      // Los temas guardados en la cuenta, los mismos que lee la rutina.
      const { data: row, error: readError } = await db.from('digest_settings').select('data').eq('user_id', userId).maybeSingle();
      if (readError) throw readError;
      settings = normalizeSettings(row?.data);
    } else {
      checkAccess(req.headers['x-posty-code']);
      settings = normalizeSettings(body.settings);
    }
    if (!settings.topics.length) return reply(400, { error: 'Elige primero tus temas en el AI Digest.' });

    if (db) {
      const limit = monthlyLimit();
      for (let i = 0; i < settings.postsPerWeek; i++) {
        const { data: count, error: rpcError } = await db.rpc('consume_ai_credit', { p_user: userId, p_limit: limit });
        if (rpcError) throw rpcError;
        if (count === null) {
          await refund(db, userId, charged);
          charged = 0;
          return reply(429, {
            error: `Generar ${settings.postsPerWeek} propuestas supera tu límite de ${limit} posts con Claude este mes. Baja los posts por semana en tus temas o espera al mes que viene.`,
          });
        }
        charged += 1;
      }
    }
    const result = await generate({ which: body.which, today: body.today, settings, extra: String(body.extra || '') });
    return reply(200, result);
  } catch (err) {
    if (userId && charged) await refund(db, userId, charged);
    if (err instanceof GenerateError) return reply(err.status, { error: err.message });
    console.error(err);
    return reply(500, { error: 'Error inesperado al generar las propuestas.' });
  }
}

async function refund(db, userId, n) {
  for (let i = 0; i < n; i++) await db.rpc('refund_ai_credit', { p_user: userId }).catch(() => {});
}

// ---------- Rutinas: token personal ----------

// Devuelve { userId } o { error: respuesta } según el token personal (rutina o conector de Claude).
export async function routineOwner(db, headers, token = bearer(headers)) {
  if (!db) return { error: reply(503, { error: 'Posty no tiene Supabase configurado (faltan VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY).' }) };
  if (!token) return { error: reply(401, { error: 'Falta el token de la rutina (cabecera Authorization: Bearer …).' }) };
  const { data: owner, error } = await db.from('ingest_tokens').select('user_id').eq('token_hash', hashToken(token)).maybeSingle();
  if (error) {
    console.error(error);
    return { error: reply(500, { error: 'No se pudo comprobar el token.' }) };
  }
  if (!owner) return { error: reply(401, { error: 'Token no válido. Crea uno nuevo en Posty → Cuenta.' }) };
  return { userId: owner.user_id };
}

// ---------- /api/topics ----------

export async function handleTopics(req, deps = {}) {
  if (req.method !== 'GET') return reply(405, { error: 'Método no permitido' });
  const db = deps.admin === undefined ? adminClient() : deps.admin;
  const { userId, error } = await routineOwner(db, req.headers);
  if (error) return error;
  const { data, error: readError } = await db.from('digest_settings').select('data').eq('user_id', userId).maybeSingle();
  if (readError) {
    console.error(readError);
    return reply(500, { error: 'No se pudieron leer los temas.' });
  }
  const settings = normalizeSettings(data?.data);
  return reply(200, { ...settings, brief: settingsBrief(settings) });
}

// ---------- /api/proposals ----------

export async function handleProposals(req, deps = {}) {
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido' });
  const db = deps.admin === undefined ? adminClient() : deps.admin;
  const owner = await routineOwner(db, req.headers);
  if (owner.error) return owner.error;
  const { userId } = owner;

  const week = String(req.query.week || '');
  if (!/^\d{4}-W\d{2}$/.test(week)) return reply(400, { error: 'Falta ?week= con el formato AAAA-Www (por ejemplo 2026-W42).' });
  const dir = `${userId}/weeks/${week}`;
  const storage = db.storage.from('assets');
  const body = req.body || Buffer.alloc(0);

  // Archivo de la semana
  if (req.query.file) {
    const file = String(req.query.file);
    const ext = file.split('.').pop().toLowerCase();
    if (!/^[\w.-]{1,120}$/.test(file) || !FILE_TYPES[ext]) {
      return reply(400, { error: 'Nombre de archivo no válido: usa letras, números, guiones y extensión png, jpg, webp, gif o pdf.' });
    }
    if (!body.length) return reply(400, { error: 'El archivo está vacío.' });
    if (body.length > MAX_FILE) return reply(413, { error: 'El archivo supera 4 MB. Conviértelo a JPEG o redúcelo.' });
    const { error } = await storage.upload(`${dir}/${file}`, body, { upsert: true, contentType: FILE_TYPES[ext] });
    if (error) {
      console.error(error);
      return reply(500, { error: `No se pudo guardar ${file}.` });
    }
    return reply(200, { ok: true, week, file });
  }

  // Markdown de la semana
  if (body.length > MAX_MARKDOWN) return reply(413, { error: 'El Markdown supera 1 MB.' });
  const source = body.toString('utf8');
  const parsed = parseWeek(source, week);
  if (!parsed.posts.length) return reply(400, { error: 'El Markdown no tiene posts: cada post empieza con "## Título" (ver PROPUESTAS.md).' });
  if (parsed.id !== week) return reply(400, { error: `El Markdown dice "semana: ${parsed.id}" pero la URL dice ${week}.` });

  // Reemplazar la semana: se borran sus archivos anteriores (la rutina los vuelve a subir después).
  const { data: old } = await storage.list(dir, { limit: 200 });
  if (old?.length) await storage.remove(old.map((f) => `${dir}/${f.name}`));
  const { error } = await db
    .from('weeks')
    .upsert({ user_id: userId, week, source, updated_at: new Date().toISOString() }, { onConflict: 'user_id,week' });
  if (error) {
    console.error(error);
    return reply(500, { error: 'No se pudo guardar la semana.' });
  }
  const files = parsed.posts.flatMap((p) => [...(p.imagenes ? p.imagenes.split(',') : []), ...(p.pdf ? [p.pdf] : [])]).map((f) => f.trim()).filter(Boolean);
  return reply(200, { ok: true, week, posts: parsed.posts.length, expectedFiles: files });
}

// ---------- Adaptadores ----------

export async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new GenerateError(413, 'La petición es demasiado grande.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Para funciones de Vercel y el servidor de desarrollo (req/res de Node).
export function nodeHandler(handler, limit) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let result;
    try {
      const body = await readBody(req, limit);
      result = await handler({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), path: url.pathname, body });
    } catch (err) {
      result = err instanceof GenerateError ? reply(err.status, { error: err.message }) : reply(500, { error: 'Error inesperado.' });
      if (!(err instanceof GenerateError)) console.error(err);
    }
    res.statusCode = result.status;
    for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, v);
    // Sin cuerpo (por ejemplo, 202 a una notificación MCP).
    if (result.json === undefined) return res.end();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(result.json));
  };
}
