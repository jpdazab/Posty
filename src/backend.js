// Dónde guarda Posty los datos. Dos modos con la misma interfaz:
// - "cloud": Supabase (login por enlace de email, datos por usuario, archivos en Storage).
//   Se activa cuando existen VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.
// - "local": el navegador (localStorage + IndexedDB), sin login. Para desarrollo o una sola persona.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = 'assets';

export const mode = SUPABASE_URL && SUPABASE_ANON_KEY ? 'cloud' : 'local';

// ---------- Local ----------

const LOCAL_KEYS = { states: 'posty:state:v1', created: 'posty:created:v1', kit: 'posty:kit:v1', digest: 'posty:digest:v1', weeks: 'posty:weeks:v1' };

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let idb;
function openIdb() {
  idb ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('posty-assets', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('assets');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idb;
}

async function idbDo(mode_, fn) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('assets', mode_);
    const req = fn(t.objectStore('assets'));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

function localBackend() {
  return {
    mode: 'local',
    user: null,
    // Semanas generadas desde Posty (las imágenes solo existen en modo cuentas).
    async listWeeks() {
      return readLocal(LOCAL_KEYS.weeks, []).map((w) => ({ ...w, files: {} }));
    },
    async saveWeek(week, source) {
      writeLocal(LOCAL_KEYS.weeks, [...readLocal(LOCAL_KEYS.weeks, []).filter((w) => w.week !== week), { week, source }]);
    },
    async deleteWeek(week) {
      writeLocal(LOCAL_KEYS.weeks, readLocal(LOCAL_KEYS.weeks, []).filter((w) => w.week !== week));
    },
    async loadStates() {
      return readLocal(LOCAL_KEYS.states, {});
    },
    async saveState(postId, data, all) {
      writeLocal(LOCAL_KEYS.states, all);
    },
    async listCreated() {
      return readLocal(LOCAL_KEYS.created, []);
    },
    async saveCreated(post, all) {
      writeLocal(LOCAL_KEYS.created, all);
    },
    async deleteCreated(id, all) {
      writeLocal(LOCAL_KEYS.created, all);
    },
    async loadKit() {
      return readLocal(LOCAL_KEYS.kit, null);
    },
    async loadDigestSettings() {
      return readLocal(LOCAL_KEYS.digest, null);
    },
    async saveDigestSettings(data) {
      writeLocal(LOCAL_KEYS.digest, data);
    },
    async saveKit(data) {
      writeLocal(LOCAL_KEYS.kit, data);
    },
    putAsset: (id, blob) => idbDo('readwrite', (s) => s.put(blob, id)),
    getAsset: (id) => idbDo('readonly', (s) => s.get(id)),
    deleteAsset: (id) => idbDo('readwrite', (s) => s.delete(id)),
  };
}

// ---------- Supabase ----------

export function cloudBackend(client, user) {
  const uid = user.id;
  const kitPath = (id) => `${uid}/kit/${id}`;
  const weekDir = (week) => `${uid}/weeks/${week}`;
  const check = ({ data, error }) => {
    if (!error) return data;
    // Falta parte del esquema en Supabase: el mensaje dice qué hacer en vez del error técnico.
    if (/bucket not found/i.test(error.message)) {
      throw new Error('Falta la carpeta de archivos "assets" en Supabase. Ejecuta supabase/schema.sql en el SQL Editor (ver SETUP.md).');
    }
    if (/relation .* does not exist|could not find the table/i.test(error.message)) {
      throw new Error('Falta una tabla en Supabase. Vuelve a ejecutar supabase/schema.sql completo en el SQL Editor (ver SETUP.md).');
    }
    throw new Error(error.message || 'Error de Supabase');
  };

  return {
    mode: 'cloud',
    user,
    client,

    // Semanas del AI Digest, con URL firmadas (6 h) para sus imágenes y PDF.
    async listWeeks() {
      const rows = check(await client.from('weeks').select('week, source, updated_at').order('week', { ascending: false }));
      const storage = client.storage.from(BUCKET);
      return Promise.all(
        rows.map(async (row) => {
          const files = check(await storage.list(weekDir(row.week), { limit: 200 })).filter((f) => f.id);
          const urls = {};
          if (files.length) {
            const signed = check(await storage.createSignedUrls(files.map((f) => `${weekDir(row.week)}/${f.name}`), 6 * 3600));
            signed.forEach((s, i) => {
              if (s.signedUrl) urls[files[i].name] = s.signedUrl;
            });
          }
          return { week: row.week, source: row.source, files: urls };
        }),
      );
    },

    // Subir una semana a mano (Markdown + archivos) desde la página Cuenta.
    async saveWeek(week, source, files = []) {
      check(await client.from('weeks').upsert({ week, source, updated_at: new Date().toISOString() }, { onConflict: 'user_id,week' }));
      for (const file of files) {
        check(await client.storage.from(BUCKET).upload(`${weekDir(week)}/${file.name}`, file, { upsert: true, contentType: file.type || undefined }));
      }
    },

    async deleteWeek(week) {
      const storage = client.storage.from(BUCKET);
      const files = check(await storage.list(weekDir(week), { limit: 200 }));
      if (files.length) check(await storage.remove(files.map((f) => `${weekDir(week)}/${f.name}`)));
      check(await client.from('weeks').delete().eq('week', week));
    },

    async loadStates() {
      const rows = check(await client.from('post_states').select('post_id, data'));
      return Object.fromEntries(rows.map((r) => [r.post_id, r.data]));
    },
    async saveState(postId, data) {
      check(await client.from('post_states').upsert({ post_id: postId, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,post_id' }));
    },

    async listCreated() {
      const rows = check(await client.from('created_posts').select('data').order('updated_at', { ascending: false }).limit(50));
      return rows.map((r) => r.data);
    },
    async saveCreated(post) {
      check(await client.from('created_posts').upsert({ id: post.id, data: post, updated_at: new Date().toISOString() }, { onConflict: 'user_id,id' }));
    },
    async deleteCreated(id) {
      check(await client.from('created_posts').delete().eq('id', id));
    },

    async loadKit() {
      const row = check(await client.from('kits').select('data').maybeSingle());
      return row?.data && Object.keys(row.data).length ? row.data : null;
    },
    async loadDigestSettings() {
      return check(await client.from('digest_settings').select('data').maybeSingle())?.data || null;
    },
    async saveDigestSettings(data) {
      check(await client.from('digest_settings').upsert({ data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
    },
    async saveKit(data) {
      check(await client.from('kits').upsert({ data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
    },

    async putAsset(id, blob) {
      check(await client.storage.from(BUCKET).upload(kitPath(id), blob, { upsert: true, contentType: blob.type || undefined }));
    },
    async getAsset(id) {
      const { data, error } = await client.storage.from(BUCKET).download(kitPath(id));
      return error ? null : data;
    },
    async deleteAsset(id) {
      check(await client.storage.from(BUCKET).remove([kitPath(id)]));
    },

    async usageThisMonth() {
      const month = new Date().toISOString().slice(0, 7);
      const row = check(await client.from('ai_usage').select('count').eq('month', month).maybeSingle());
      return row?.count || 0;
    },
    async hasIngestToken() {
      const row = check(await client.from('ingest_tokens').select('created_at').maybeSingle());
      return row?.created_at || null;
    },
    async createIngestToken() {
      return check(await client.rpc('create_ingest_token'));
    },
    async accessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token || '';
    },
    async signOut() {
      await client.auth.signOut();
      location.hash = '';
      location.reload();
    },
  };
}

// ---------- Inicio ----------

let backend;
let client;

export function getBackend() {
  return backend;
}

export function supabaseClient() {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });
  return client;
}

// Devuelve el backend listo, o null si hace falta iniciar sesión (modo cloud sin sesión).
export async function initBackend() {
  if (mode === 'local') {
    backend = localBackend();
    return backend;
  }
  const { data } = await supabaseClient().auth.getSession();
  if (!data.session) return null;
  backend = cloudBackend(supabaseClient(), data.session.user);
  return backend;
}

// Envía el email de acceso (enlace + código). Solo funciona para emails invitados (no crea cuentas nuevas).
export async function sendMagicLink(email) {
  const { error } = await supabaseClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}${location.pathname}` },
  });
  if (!error) return;
  const text = `${error.code || ''} ${error.message || ''}`;
  if (/signups? not allowed|otp_disabled|user_not_found|user not found/i.test(text)) {
    throw new Error('Este email no tiene acceso a Posty. Pide una invitación a quien administra la plataforma.');
  }
  if (/rate limit|security purposes|over_email_send_rate_limit/i.test(text)) {
    throw new Error('Has pedido varios emails seguidos. Espera un minuto y vuelve a intentarlo.');
  }
  if (/error sending|smtp/i.test(text)) {
    throw new Error('No se pudo enviar el email. Revisa la configuración de email (SMTP) en Supabase.');
  }
  throw new Error(error.message);
}

// Entra con el código de 6 dígitos que llega en el mismo email (sirve aunque el enlace falle).
export async function verifyEmailCode(email, code) {
  const { data, error } = await supabaseClient().auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.session) {
    const text = `${error?.code || ''} ${error?.message || ''}`;
    if (/expired|invalid|otp/i.test(text)) throw new Error('El código no es válido o caducó. Revisa el último email o pide uno nuevo.');
    throw new Error(error?.message || 'No se pudo entrar. Inténtalo de nuevo.');
  }
}

// Entra con email y contraseña (no depende de que lleguen los emails).
export async function signInWithPassword(email, password) {
  const { data, error } = await supabaseClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    const text = `${error?.code || ''} ${error?.message || ''}`;
    if (/invalid.*credentials|invalid_credentials/i.test(text)) throw new Error('Email o contraseña incorrectos. Si nunca has puesto contraseña, entra con el código del email o pídesela a quien administra Posty.');
    if (/not.*confirmed/i.test(text)) throw new Error('Tu cuenta aún no está confirmada. Pide a quien administra Posty que la confirme.');
    if (/rate limit|too many/i.test(text)) throw new Error('Demasiados intentos. Espera un minuto y vuelve a probar.');
    throw new Error(error?.message || 'No se pudo entrar. Inténtalo de nuevo.');
  }
}

// Pone o cambia la contraseña de la cuenta con la sesión abierta.
export async function setPassword(password) {
  const { error } = await supabaseClient().auth.updateUser({ password });
  if (error) {
    if (/weak|short|at least/i.test(error.message)) throw new Error('La contraseña es demasiado débil: usa al menos 8 caracteres, mezclando letras y números.');
    if (/same/i.test(error.message)) throw new Error('Es la misma contraseña que ya tenías.');
    throw new Error(error.message);
  }
}

// Avisa cuando se inicia sesión (también si el enlace se abrió en otra pestaña del mismo navegador).
export function onSignedIn(callback) {
  supabaseClient().auth.onAuthStateChange((event, session) => {
    if (session && event === 'SIGNED_IN') callback();
  });
}
