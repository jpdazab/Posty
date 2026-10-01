// Archivos subidos por el usuario (fuentes, fondos de plantillas, logos). Se guardan en la cuenta
// (Supabase Storage) o, en modo local, en IndexedDB del navegador (ver backend.js).

import { getBackend } from './backend.js';

// URLs blob: en memoria para usar los archivos en CSS e <img>.
const urls = new Map();

export function newAssetId(prefix = 'asset') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function putAsset(id, blob) {
  return getBackend().putAsset(id, blob);
}

export function getAsset(id) {
  return getBackend().getAsset(id);
}

export function deleteAsset(id) {
  urls.delete(id);
  return getBackend().deleteAsset(id);
}


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
