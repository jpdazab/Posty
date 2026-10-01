import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentFromText, contentFromPage, designsFrom, fit, findStat, contrast } from '../src/layouts.js';

const POST = `Cancelé el 40% de mis reuniones y mi equipo rinde más 🚀

Durante un mes probamos tres cambios:
- Un documento corto con comentarios
- Una daily escrita de tres líneas
- Una demo quincenal en vídeo

La confianza no se construye en reuniones largas, sino en acuerdos claros que todos entienden.

¿Qué reunión cancelarías tú?

#Liderazgo #Productividad`;

const BRAND = { palette: { primary: '#2f5bea', secondary: '#f2a541', background: '#ffffff', text: '#16161d' }, fonts: { heading: 'Switzer', body: 'Georgia' }, handle: '@ana', hasLogo: true };

test('del texto: titular, puntos, cita, cifra y etiqueta', () => {
  const c = contentFromText(POST);
  assert.equal(c.title, 'Cancelé el 40% de mis reuniones y mi equipo rinde más');
  assert.equal(c.kicker, 'Liderazgo');
  assert.deepEqual(c.items, ['Un documento corto con comentarios', 'Una daily escrita de tres líneas', 'Una demo quincenal en vídeo']);
  assert.match(c.quote, /confianza/);
  assert.deepEqual(c.stat, { value: '40%', label: 'de mis reuniones y mi equipo rinde más 🚀' });
});

test('de una web: título, descripción, puntos de los encabezados y fuente', () => {
  const c = contentFromPage({ domain: 'ejemplo.com', siteName: '', title: 'Guía de rituales remotos', description: 'Cinco rituales para equipos distribuidos que casi nunca coinciden.', headings: ['1. Daily escrita', '2. Demo en vídeo'], items: [], paragraphs: [], colors: [] });
  assert.equal(c.kicker, 'ejemplo.com');
  assert.deepEqual(c.items, ['Daily escrita', 'Demo en vídeo']);
  assert.equal(c.source, 'ejemplo.com');
});

test('propone varias composiciones legibles, con el texto dentro del lienzo', () => {
  const content = { ...contentFromText(POST), image: 'img-1' };
  const designs = designsFrom(content, BRAND);
  assert.deepEqual(designs.map((d) => d.name), ['Editorial', 'Bloque de color', 'Cita', 'Lista', 'Dato', 'Imagen']);
  for (const d of designs) {
    assert.equal(d.layers[0].font, d.name === 'Lista' || d.name === 'Editorial' || d.name === 'Bloque de color' || d.name === 'Dato' || d.name === 'Imagen' || d.name === 'Cita' ? 'Switzer' : d.layers[0].font);
    for (const l of d.layers) {
      assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= 1080 && l.y < 1350, `${d.name}/${l.name} dentro del lienzo`);
      assert.ok(Number.isInteger(l.size) && l.size > 0);
      const bg = d.overlay ? '#000000' : d.background;
      if (!['Comillas', 'Línea'].includes(l.name)) assert.ok(contrast(l.color, bg) >= 3, `${d.name}/${l.name} legible`);
    }
  }
  const image = designs.find((d) => d.name === 'Imagen');
  assert.equal(image.bgAssetId, 'img-1');
  assert.equal(image.overlay.opacity, 0.5);
  assert.equal(designs[0].logo.show, true);
  // Sin lista, cifra ni imagen: solo las composiciones que tienen sentido.
  const few = designsFrom({ kicker: '', title: 'Una idea', body: '', items: [], quote: '', stat: null, source: '', image: null }, BRAND);
  assert.deepEqual(few.map((d) => d.name), ['Editorial', 'Bloque de color', 'Cita']);
});

test('fit reduce el tamaño hasta que el texto cabe', () => {
  const short = fit('Hola', { width: 900, maxHeight: 300, max: 100, min: 40 });
  const long = fit('palabra '.repeat(25), { width: 900, maxHeight: 300, max: 100, min: 40 });
  assert.equal(short.size, 100);
  assert.ok(long.size < 100 && long.height <= 300);
});

test('cifras', () => {
  assert.equal(findStat('Sin números aquí'), null);
  assert.equal(findStat('Crecimos 3x en ventas este año').value, '3x');
});
