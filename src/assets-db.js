// Archivos subidos por el usuario (fuentes, fondos de plantillas, logos) guardados en IndexedDB,
// porque no caben en localStorage. Cada archivo se guarda como Blob con un id.

const DB_NAME = 'posty-assets';
const STORE = 'assets';

let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

export function newAssetId(prefix = 'asset') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function putAsset(id, blob) {
  return tx('readwrite', (s) => s.put(blob, id));
}

export function getAsset(id) {
  return tx('readonly', (s) => s.get(id));
}

export function deleteAsset(id) {
  return tx('readwrite', (s) => s.delete(id));
}

// URLs blob: en memoria para usar los archivos en CSS e <img>.
const urls = new Map();

export async function assetUrl(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  try {
    const blob = await getAsset(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  } catch {
    return null;
  }
}

export function cachedAssetUrl(id) {
  return urls.get(id) || null;
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}
