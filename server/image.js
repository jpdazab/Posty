// Imágenes con ChatGPT (API de imágenes de OpenAI). Cada persona usa su propia clave de OpenAI:
// la manda el navegador en la cabecera x-openai-key en cada petición y aquí no se guarda.

import { GenerateError } from './generate.js';

// Del más nuevo al más antiguo: si la cuenta no tiene acceso a uno, se prueba el siguiente.
const MODELS = (process.env.OPENAI_IMAGE_MODELS || 'gpt-image-2,gpt-image-1.5,gpt-image-1').split(',').map((m) => m.trim()).filter(Boolean);
export const IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536'];
const QUALITIES = ['low', 'medium', 'high'];
const TIMEOUT = 110_000;

// El tamaño estándar más parecido a la proporción del hueco (ancho / alto).
export function sizeFor(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return '1024x1024';
  if (ratio > 1.2) return '1536x1024';
  if (ratio < 0.83) return '1024x1536';
  return '1024x1024';
}

function friendly(status, body) {
  const code = body?.error?.code || '';
  const message = body?.error?.message || '';
  if (status === 401) return new GenerateError(401, 'La clave de OpenAI no es válida. Revísala en Posty → Cuenta.');
  if (/verif/i.test(message) || code === 'organization_not_verified') {
    return new GenerateError(403, 'Tu organización de OpenAI tiene que estar verificada para generar imágenes: platform.openai.com → Settings → Organization → Verify.');
  }
  if (status === 429 || code === 'insufficient_quota' || code === 'billing_hard_limit_reached') {
    return new GenerateError(429, /quota|billing/i.test(`${code} ${message}`) ? 'Tu cuenta de OpenAI no tiene saldo o llegó a su límite de gasto (platform.openai.com → Billing).' : 'OpenAI está recibiendo demasiadas peticiones. Prueba en un minuto.');
  }
  if (code === 'moderation_blocked' || /safety|moderation|content policy/i.test(message)) {
    return new GenerateError(422, 'OpenAI rechazó la imagen por sus normas de contenido. Cambia el prompt y vuelve a intentarlo.');
  }
  return new GenerateError(502, `OpenAI no pudo generar la imagen (${status}${message ? `: ${message.slice(0, 160)}` : ''}).`);
}

const modelMissing = (status, body) => status === 404 || body?.error?.code === 'model_not_found' || /model .*(does not exist|not found|access)/i.test(body?.error?.message || '');

// { prompt, size, quality } + clave → { image: 'data:image/jpeg;base64,…', model }
export async function generateImage({ prompt, size, quality }, key, { fetchImpl = fetch } = {}) {
  if (typeof key !== 'string' || !/^sk-[\w-]{10,}$/.test(key.trim())) throw new GenerateError(400, 'Añade tu clave de API de OpenAI en Posty → Cuenta (empieza por "sk-").');
  const text = String(prompt || '').trim();
  if (!text) throw new GenerateError(400, 'Describe la imagen que quieres.');
  if (text.length > 4000) throw new GenerateError(400, 'El prompt es demasiado largo (máximo 4.000 caracteres).');
  const body = { prompt: text, n: 1, size: IMAGE_SIZES.includes(size) ? size : '1024x1024', quality: QUALITIES.includes(quality) ? quality : 'medium', output_format: 'jpeg' };

  for (const [i, model] of MODELS.entries()) {
    let res;
    try {
      res = await fetchImpl('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, ...body }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new GenerateError(504, 'OpenAI tardó demasiado. Prueba con calidad "rápida" o vuelve a intentarlo.');
      throw new GenerateError(502, 'No se pudo conectar con OpenAI.');
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new GenerateError(502, 'OpenAI no devolvió ninguna imagen. Vuelve a intentarlo.');
      return { image: `data:image/jpeg;base64,${b64}`, model };
    }
    if (modelMissing(res.status, json) && i < MODELS.length - 1) continue;
    throw friendly(res.status, json);
  }
  throw new GenerateError(502, 'Ningún modelo de imágenes de OpenAI está disponible para tu cuenta.');
}
