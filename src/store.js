// Estado de cada post del AI Digest (aprobado, publicado, ediciones…).
// Se guarda en la cuenta (Supabase) o en el navegador en modo local (ver backend.js).
// Se puede exportar/importar como JSON para respaldarlo.

import { getBackend } from './backend.js';
import { toast } from './ui.js';

export const STATUSES = {
  pendiente: { label: 'Pendiente' },
  aprobado: { label: 'Aprobado' },
  publicado: { label: 'Publicado' },
  descartado: { label: 'Descartado' },
};

let state = {};

export async function initStore() {
  const loaded = await getBackend().loadStates();
  state = loaded && typeof loaded === 'object' ? loaded : {};
}

function save(id) {
  getBackend()
    .saveState(id, state[id], state)
    .catch((err) => {
      console.error(err);
      toast('No se pudo guardar el cambio. Revisa tu conexión.');
    });
}

export function getPostState(id) {
  return state[id] || {};
}

export function getStatus(id) {
  return state[id]?.status || 'pendiente';
}

export function updatePost(id, patch) {
  const next = { ...state[id], ...patch, updatedAt: new Date().toISOString() };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  state = { ...state, [id]: next };
  save(id);
}

export function exportState() {
  return JSON.stringify({ app: 'posty', version: 1, exportedAt: new Date().toISOString(), posts: state }, null, 2);
}

export function importState(json) {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.app !== 'posty' || typeof parsed.posts !== 'object') {
    throw new Error('El archivo no es un respaldo de Posty.');
  }
  state = { ...state, ...parsed.posts };
  for (const id of Object.keys(parsed.posts)) save(id);
}
