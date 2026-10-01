// Genera un post de LinkedIn (texto + contenido de la gráfica) con Claude.
// Lo usan la función de Vercel (api/generate.js) y el servidor de desarrollo (vite.config.js).

import Anthropic from '@anthropic-ai/sdk';

export const FORMATS = ['carousel', 'card', 'slide'];

const SYSTEM_PROMPT = `Eres el ghostwriter de LinkedIn de Juan Daza (/jpdazab), UX/UI Manager y Product Designer en Barcelona.
Escribes en español, en prosa concisa, directa y editorial. Nada de listas con viñetas dentro del texto del post y nunca uses rayas (em dashes). Cifras mejor que adjetivos, pero no inventes datos: si no tienes una cifra verificable en lo que te pide Juan, no pongas cifras.
Cada post: una primera línea que funcione como gancho (es lo único que se ve antes de "ver más"), 120 a 200 palabras, y una pregunta final que invite a conversar. Los hashtags van aparte, nunca dentro del texto.
También escribes el contenido de la gráfica que acompaña al post. Los textos de la gráfica son cortos y legibles en el móvil.`;

const BLACKBIRD_RULE = `Los campos marcados como "Blackbird" se dibujan con la fuente Projekt Blackbird, que NO tiene á é í ó ú ü ñ ¿ ¡: escríbelos en español eligiendo palabras sin esas letras (por ejemplo "IA" en vez de "inteligencia", "equipo" en vez de "diseño").`;

const CAROUSEL_GUIDE = `Formato: carrusel para subir a LinkedIn como PDF, con el design system jpdazab.
- cover (portada): "tone" (blue por defecto), "tag" (Blackbird, 1 o 2 palabras en minúscula), "title" (Blackbird, gancho de máximo 45 caracteres, hasta 3 líneas), "underline" (una palabra exacta del title para subrayar, o ""), "summary" (máximo 120 caracteres).
- slides: de 3 a 5. Cada una con "tag" (Blackbird, 1 o 2 palabras), "title" y "titleAccent" (Blackbird, máximo 18 caracteres cada uno: son las dos líneas del título, la segunda va en azul), "summary" (máximo 120 caracteres, una idea).
- "visual" de cada slide: usa "none" salvo que Juan te dé cifras reales. Con cifras: "stats" (2 a 6 items con "display" corto como "48%" y "label" Blackbird de 2 a 4 palabras), "bars" (2 a 5 items con "value" de 0 a 100, "display" y "label") o "venn" (dos conceptos en "left" y "right" y su cruce en "overlap", Blackbird, máximo 2 palabras cada uno). Deja vacíos los campos que no uses.
- La última slide cierra con la conclusión.
${BLACKBIRD_RULE}`;

const CARD_GUIDE = `Formato: post social 1080 x 1351 con el design system jpdazab.
- "headline": máximo 45 caracteres (dos líneas). "highlight": una frase literal y corta contenida en el headline, que irá en naranja.
- "lead": una frase de apoyo de máximo 60 caracteres.
- "items": de 3 a 4 puntos, cada uno con "title" (máximo 28 caracteres, una línea) y "description" (máximo 80 caracteres).`;

const SLIDE_GUIDE = `Formato: una sola imagen 1231 x 1731 con los componentes del carrusel del design system jpdazab (sin "Swipe").
- "style": "slide" si hay una idea con cifras o un contraste que mostrar; "cover" si es una frase potente.
- "cover" (si style es "cover"): "tone" (blue, ink, grey o yellow), "tag" (Blackbird, 1 o 2 palabras), "title" (Blackbird, máximo 45 caracteres), "underline" (una palabra del title o ""), "summary" (máximo 120 caracteres).
- "slide" (si style es "slide"): "tag" (Blackbird), "title" y "titleAccent" (Blackbird, máximo 18 caracteres cada uno), "summary" (máximo 120 caracteres) y "visual" como en el carrusel ("none" salvo cifras reales; nunca "image").
- Rellena también el bloque que no uses, con textos cortos coherentes.
${BLACKBIRD_RULE}`;

const base = {
  title: { type: 'string', description: 'Título interno corto para organizar el post' },
  text: { type: 'string', description: 'Texto del post listo para publicar, sin hashtags' },
  hashtags: { type: 'array', items: { type: 'string' }, description: '3 hashtags con #' },
};

const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' };

const COVER = obj({ tone: { type: 'string', enum: ['blue', 'ink', 'grey', 'yellow'] }, tag: str, title: str, underline: str, summary: str });
const SLIDE = obj({
  tag: str,
  title: str,
  titleAccent: str,
  summary: str,
  visual: obj({
    kind: { type: 'string', enum: ['none', 'stats', 'bars', 'venn'] },
    items: { type: 'array', items: obj({ label: str, value: { type: 'number' }, display: str }) },
    left: str,
    overlap: str,
    right: str,
  }),
});

const SCHEMAS = {
  carousel: obj({ ...base, cover: COVER, slides: { type: 'array', items: SLIDE } }),
  slide: obj({ ...base, style: { type: 'string', enum: ['slide', 'cover'] }, cover: COVER, slide: SLIDE }),
  card: obj({
    ...base,
    card: obj({
      headline: str,
      highlight: str,
      lead: str,
      items: { type: 'array', items: obj({ title: str, description: str }) },
    }),
  }),
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
  if (!FORMATS.includes(format)) throw new GenerateError(400, 'Formato no válido: elige carrusel, card única o card.');
  return { format, ...(await callClaude({
    system: `${SYSTEM_PROMPT}\n\n${{ carousel: CAROUSEL_GUIDE, card: CARD_GUIDE, slide: SLIDE_GUIDE }[format]}`,
    prompt: prompt.trim(),
    schema: SCHEMAS[format],
  })) };
}

// Llamada a Claude con salida JSON según `schema`. Convierte los fallos en GenerateError legibles.
export async function callClaude({ system, prompt, schema, effort = 'medium' }) {
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
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: prompt }],
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
  try {
    return JSON.parse(raw);
  } catch {
    throw new GenerateError(502, 'Claude devolvió una respuesta que no se pudo leer. Vuelve a intentarlo.');
  }
}

// Comprueba el código de acceso opcional (POSTY_ACCESS_CODE) para que nadie más gaste la API key.
export function checkAccess(headerValue) {
  const code = process.env.POSTY_ACCESS_CODE;
  if (code && headerValue !== code) throw new GenerateError(401, 'Código de acceso incorrecto.');
}
