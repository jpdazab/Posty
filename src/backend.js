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

const LOCAL_KEYS = { states: 'posty:state:v1', created: 'posty:created:v1', kit: 'posty:kit:v1' };

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
    async listWeeks() {
      return [];
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
    if (error) throw new Error(error.message || 'Error de Supabase');
    return data;
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

// Envía el enlace de acceso. Solo funciona para emails invitados (no crea cuentas nuevas).
export async function sendMagicLink(email) {
  const { error } = await supabaseClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}${location.pathname}` },
  });
  if (error) {
    if (/signups not allowed|not found|user/i.test(error.message)) {
      throw new Error('Este email no tiene acceso a Posty. Pide una invitación a quien administra la plataforma.');
    }
    if (/rate limit|security purposes/i.test(error.message)) {
      throw new Error('Has pedido varios enlaces seguidos. Espera un minuto y vuelve a intentarlo.');
    }
    throw new Error(error.message);
  }
}
