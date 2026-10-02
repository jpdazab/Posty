// Imágenes con ChatGPT (OpenAI): la clave de cada persona se guarda solo en este navegador y se envía
// a /api/image en cada petición; Posty no la guarda en el servidor.

import { getBackend } from './backend.js';
import { getKit } from './kit.js';

const KEY = 'posty:openai-key';

export function getOpenAiKey() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setOpenAiKey(value) {
  try {
    if (value) localStorage.setItem(KEY, value.trim());
    else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

export const hasOpenAiKey = () => /^sk-/.test(getOpenAiKey());

// Prompt sugerido: el tema del post, la paleta de la marca y sin texto (el texto lo pone la plantilla).
export function suggestPrompt(post) {
  const firstLine = String(post?.text || post?.title || '').split('\n').map((l) => l.trim()).find(Boolean) || 'un post profesional';
  const { colors } = getKit().brand || {};
  const palette = colors ? `Paleta de color dominante: ${colors.primary} y ${colors.secondary}, con fondos limpios. ` : '';
  return `Imagen para acompañar un post de LinkedIn sobre: "${firstLine.slice(0, 220)}". Estilo fotografía editorial luminosa y moderna, composición limpia con espacio libre. ${palette}Sin texto, letras, números ni logotipos en la imagen.`;
}

const SIZES = { wide: '1536x1024', tall: '1024x1536', square: '1024x1024' };
const sizeFor = (ratio) => (ratio > 1.2 ? SIZES.wide : ratio < 0.83 ? SIZES.tall : SIZES.square);

// Reduce la imagen (máx. 1400 px de ancho, JPEG) para guardarla en el post sin ocupar demasiado.
function shrink(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1400 / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// { prompt, ratio (ancho/alto del hueco), quality } → data URL de la imagen
export async function generateAiImage({ prompt, ratio, quality = 'medium' }) {
  const key = getOpenAiKey();
  if (!key) throw new Error('Añade tu clave de API de OpenAI en Posty → Cuenta → Imágenes con ChatGPT.');
  const backend = getBackend();
  const auth = backend.mode === 'cloud' ? { Authorization: `Bearer ${await backend.accessToken()}` } : {};
  let res;
  try {
    res = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-openai-key': key, ...auth },
      body: JSON.stringify({ prompt, size: sizeFor(ratio), quality }),
    });
  } catch {
    throw new Error('No hay conexión con el servidor.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.image) {
    throw new Error(data.error || (res.status === 404 ? 'Generar imágenes solo funciona con Posty desplegado en Vercel.' : 'No se pudo generar la imagen.'));
  }
  return shrink(data.image);
}
