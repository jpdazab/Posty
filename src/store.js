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

// Al reemplazar una semana, sus posts nuevos empiezan como pendientes (los ids se repiten: 2026-W41-1…).
export function resetWeekStates(weekId) {
  for (const id of Object.keys(state)) {
    if (id.startsWith(`${weekId}-`)) {
      state = { ...state, [id]: {} };
      save(id);
    }
  }
}
