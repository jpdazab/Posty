// Genera un post de LinkedIn (texto + contenido de la gráfica) con Claude.
// Lo usan la función de Vercel (api/generate.js) y el servidor de desarrollo (vite.config.js).

import Anthropic from '@anthropic-ai/sdk';

export const FORMATS = ['carousel', 'card'];

const SYSTEM_PROMPT = `Eres el ghostwriter de LinkedIn de Juan Daza (/jpdazab), UX/UI Manager y Product Designer en Barcelona.
Escribes en español, en prosa concisa, directa y editorial. Nada de listas con viñetas dentro del texto del post y nunca uses rayas (em dashes). Cifras mejor que adjetivos, pero no inventes datos: si no tienes una cifra verificable en lo que te pide Juan, no pongas cifras.
Cada post: una primera línea que funcione como gancho (es lo único que se ve antes de "ver más"), 120 a 200 palabras, y una pregunta final que invite a conversar. Los hashtags van aparte, nunca dentro del texto.
También escribes el contenido de la gráfica que acompaña al post. Los textos de la gráfica son cortos y legibles en el móvil.`;

const CAROUSEL_GUIDE = `Formato: carrusel de 5 slides para subir como documento PDF.
Slide 1 es la portada (título con gancho y un subtítulo). Slides 2 a 4 desarrollan una idea cada una. Slide 5 cierra con la conclusión y la pregunta.
En cada slide: "kicker" (2 a 4 palabras, va en mayúsculas pequeñas), "title" (máximo 8 palabras) y "body" (máximo 30 palabras; en la portada, el subtítulo).`;

const CARD_GUIDE = `Formato: una card (imagen 4:5) con titular y una lista numerada.
"eyebrow": 2 a 4 palabras. "headline": máximo 10 palabras. "highlight": una frase literal y corta contenida en el headline que se destacará en color. "lead": una frase de apoyo de máximo 20 palabras. "items": de 3 a 4 puntos de máximo 12 palabras cada uno.`;

const base = {
  title: { type: 'string', description: 'Título interno corto para organizar el post' },
  text: { type: 'string', description: 'Texto del post listo para publicar, sin hashtags' },
  hashtags: { type: 'array', items: { type: 'string' }, description: '3 hashtags con #' },
};

const SCHEMAS = {
  carousel: {
    type: 'object',
    properties: {
      ...base,
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: { kicker: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } },
          required: ['kicker', 'title', 'body'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'text', 'hashtags', 'slides'],
    additionalProperties: false,
  },
  card: {
    type: 'object',
    properties: {
      ...base,
      card: {
        type: 'object',
        properties: {
          eyebrow: { type: 'string' },
          headline: { type: 'string' },
          highlight: { type: 'string' },
          lead: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['eyebrow', 'headline', 'highlight', 'lead', 'items'],
        additionalProperties: false,
      },
    },
    required: ['title', 'text', 'hashtags', 'card'],
    additionalProperties: false,
  },
};

export class GenerateError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let client;

export async function generatePost({ prompt, format }) {
  if (typeof prompt !== 'string' || !prompt.trim()) throw new GenerateError(400, 'Escribe de qué quieres que trate el post.');
  if (prompt.length > 8000) throw new GenerateError(400, 'La petición es demasiado larga (máximo 8.000 caracteres).');
  if (!FORMATS.includes(format)) throw new GenerateError(400, 'Formato no válido: elige carrusel o card.');
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new GenerateError(500, 'Falta configurar ANTHROPIC_API_KEY en el servidor.');
  }

  client ??= new Anthropic();

  let response;
  try {
    response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: SCHEMAS[format] },
      },
      system: `${SYSTEM_PROMPT}\n\n${format === 'carousel' ? CAROUSEL_GUIDE : CARD_GUIDE}`,
      messages: [{ role: 'user', content: prompt.trim() }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new GenerateError(500, 'La API key de Anthropic no es válida.');
    if (err instanceof Anthropic.RateLimitError) throw new GenerateError(429, 'Demasiadas peticiones a Claude. Prueba en un minuto.');
    if (err instanceof Anthropic.APIError) throw new GenerateError(502, `Error de la API de Claude (${err.status ?? 'red'}).`);
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw new GenerateError(422, 'Claude no puede escribir sobre este tema. Prueba a reformular la petición.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new GenerateError(502, 'La respuesta de Claude se cortó. Vuelve a intentarlo.');
  }

  const raw = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let post;
  try {
    post = JSON.parse(raw);
  } catch {
    throw new GenerateError(502, 'Claude devolvió una respuesta que no se pudo leer. Vuelve a intentarlo.');
  }
  return { format, ...post };
}

// Comprueba el código de acceso opcional (POSTY_ACCESS_CODE) para que nadie más gaste la API key.
export function checkAccess(headerValue) {
  const code = process.env.POSTY_ACCESS_CODE;
  if (code && headerValue !== code) throw new GenerateError(401, 'Código de acceso incorrecto.');
}
