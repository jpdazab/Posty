// Catálogo de plantillas: las integradas (hechas con el design system jpdazab) y las propias
// (fondo + capas de texto) que el usuario crea en la pantalla Diseños.
// Cada plantilla integrada es un post de ejemplo; "Usar" crea un post nuevo a partir de él.

import { getKit, getCustomTemplate, CUSTOM_SIZES } from './kit.js';

const visual = (kind, extra = {}) => ({ kind, items: [], left: '', overlap: '', right: '', src: '', alt: '', ...extra });

const slide = (title, titleAccent, summary, v = visual('none'), tag = 'idea') => ({ tag, title, titleAccent, summary, visual: v });

const STATS = visual('stats', {
  items: [
    { display: '+12%', value: 12, label: 'mas tareas' },
    { display: '+25%', value: 25, label: 'mas rapido' },
    { display: '+40%', value: 40, label: 'mas calidad' },
  ],
});
const BARS = visual('bars', {
  items: [
    { display: '72%', value: 72, label: 'Research' },
    { display: '48%', value: 48, label: 'Wireframes' },
    { display: '31%', value: 31, label: 'Testing' },
  ],
});
const VENN = visual('venn', { left: 'Velocidad', overlap: 'Criterio', right: 'Calidad' });

const cover = (tone) => ({ tone, tag: 'ux', title: 'Tres tareas que la IA acelera', underline: 'acelera', summary: 'Pero el criterio del diseñador sigue siendo clave.' });

export const BUILTIN_TEMPLATES = [
  {
    id: 'card-list',
    name: 'Card con lista',
    group: 'Card',
    description: 'Post social 1080 × 1351: titular con frase en naranja, lead y lista numerada.',
    post: {
      format: 'card',
      title: 'Card con lista',
      card: {
        headline: '3 tareas de UX que la IA acelera pero no reemplaza',
        highlight: 'pero no reemplaza',
        lead: 'El criterio del diseñador sigue siendo clave.',
        items: [
          { title: 'Priorización de negocio', description: 'La IA estructura, el diseñador conecta usuarios con negocio.' },
          { title: 'Pensamiento crítico', description: 'La IA sugiere, el diseñador decide.' },
          { title: 'Contexto del equipo', description: 'Nadie conoce mejor las restricciones reales.' },
        ],
      },
    },
  },
  ...['blue', 'ink', 'grey', 'yellow'].map((tone) => ({
    id: `cover-${tone}`,
    name: `Portada ${{ blue: 'azul', ink: 'negra', grey: 'gris', yellow: 'amarilla' }[tone]}`,
    group: 'Card única',
    description: 'CoverCard 1231 × 1731: titular grande con una palabra subrayada.',
    post: { format: 'slide', title: 'Portada', style: 'cover', cover: cover(tone), slide: slide('', '', '') },
  })),
  {
    id: 'slide-text',
    name: 'Slide de texto',
    group: 'Card única',
    description: 'SlideCard 1231 × 1731: título en dos colores y resumen.',
    post: { format: 'slide', title: 'Slide de texto', style: 'slide', cover: cover('blue'), slide: slide('Generar es facil', 'elegir no', 'Cuando todo se genera en segundos, el valor está en el criterio.') },
  },
  {
    id: 'slide-stats',
    name: 'Slide con cifras',
    group: 'Card única',
    description: 'Template-1/2: tarjetas de datos (StatGrid).',
    post: { format: 'slide', title: 'Slide con cifras', style: 'slide', cover: cover('blue'), slide: slide('Rendir mas', 'no es aprender', 'Estudio de BCG con Harvard: 758 consultores con IA.', STATS, 'data') },
  },
  {
    id: 'slide-bars',
    name: 'Slide con barras',
    group: 'Card única',
    description: 'Template-6: barras de progreso (ProgressBars).',
    post: { format: 'slide', title: 'Slide con barras', style: 'slide', cover: cover('blue'), slide: slide('Donde usamos', 'la IA hoy', 'Porcentaje de equipos que la usan en cada fase.', BARS, 'data') },
  },
  {
    id: 'slide-venn',
    name: 'Slide con Venn',
    group: 'Card única',
    description: 'Template-4: dos conceptos y su cruce (CarouselVenn).',
    post: { format: 'slide', title: 'Slide con Venn', style: 'slide', cover: cover('blue'), slide: slide('Lo que importa', 'esta en medio', 'La velocidad sin criterio no mejora la calidad.', VENN) },
  },
  {
    id: 'slide-image',
    name: 'Card con imagen',
    group: 'Card única',
    description: 'Template-5: título, resumen e imagen (CarouselImage).',
    post: { format: 'slide', title: 'Card con imagen', style: 'slide', cover: cover('blue'), slide: slide('Antes y despues', 'del rediseno', 'Así cambió el dashboard tras tres rondas de test.', visual('image')) },
  },
  {
    id: 'carousel',
    name: 'Carrusel completo',
    group: 'Carrusel',
    description: 'Portada + slides de texto, cifras y Venn, para subir como PDF.',
    post: {
      format: 'carousel',
      title: 'Carrusel completo',
      cover: cover('blue'),
      slides: [
        slide('Rendir mas', 'no es aprender', 'Estudio de BCG con Harvard: 758 consultores con IA.', STATS, 'data'),
        slide('Donde usamos', 'la IA hoy', 'Porcentaje de equipos que la usan en cada fase.', BARS, 'data'),
        slide('Lo que importa', 'esta en medio', 'La velocidad sin criterio no mejora la calidad.', VENN, 'cierre'),
      ],
    },
  },
];

const clone = (v) => JSON.parse(JSON.stringify(v));

// Post de ejemplo de una plantilla integrada, con el contenido editado en Diseños si lo hay.
export function builtinPost(id) {
  const tpl = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return null;
  const custom = getKit().templateContent[id];
  return clone({ text: '', hashtags: [], ...(custom || tpl.post), templateId: id });
}

// Post de ejemplo de una plantilla propia: cada capa con su texto de muestra.
export function customPost(id) {
  const tpl = getCustomTemplate(id);
  if (!tpl) return null;
  return {
    format: 'custom',
    templateId: id,
    title: tpl.name,
    text: '',
    hashtags: [],
    fields: Object.fromEntries(tpl.layers.map((l) => [l.id, l.sample || ''])),
  };
}

export function customSize(tpl) {
  // Plantillas hechas desde un PDF: conservan las proporciones de la página.
  if (tpl?.size === 'custom' && tpl.width && tpl.height) return { w: tpl.width, h: tpl.height, label: `Del PDF · ${tpl.width} × ${tpl.height}` };
  return CUSTOM_SIZES[tpl?.size] || CUSTOM_SIZES['1080x1350'];
}
