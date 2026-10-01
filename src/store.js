// Estado de cada post (aprobado, publicado, ediciones…) guardado en el navegador.
// Se puede exportar/importar como JSON para respaldarlo o pasarlo a otro equipo.

const KEY = 'posty:state:v1';

export const STATUSES = {
  pendiente: { label: 'Pendiente' },
  aprobado: { label: 'Aprobado' },
  publicado: { label: 'Publicado' },
  descartado: { label: 'Descartado' },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Almacenamiento no disponible (modo privado, etc.): el estado vive solo en memoria.
  }
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
  save();
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
  save();
}
