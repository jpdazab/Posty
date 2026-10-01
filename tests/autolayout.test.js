import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postFromText, toBlackbird, clip } from '../src/autolayout.js';

const POST = `Cancelé el 40% de mis reuniones con una sola pregunta.

Antes de aceptar cualquier invitación me pregunto qué decisión vamos a tomar. Si no hay respuesta clara, propongo otra cosa.

→ Un documento corto con comentarios.
→ Un mensaje asíncrono.
→ 10 minutos en lugar de 60.

¿Cuál es tu regla para decidir si una reunión vale la pena?

#Productividad #Liderazgo`;

test('separa hashtags del texto', () => {
  const post = postFromText(POST, 'card');
  assert.deepEqual(post.hashtags, ['#Productividad', '#Liderazgo']);
  assert.ok(!post.text.includes('#Productividad'));
  assert.ok(post.text.startsWith('Cancelé'));
});

test('card: gancho como titular, lista como puntos', () => {
  const { card } = postFromText(POST, 'card');
  assert.match(card.headline, /^Cancelé el 40%/);
  assert.ok(card.headline.length <= 47);
  assert.ok(card.headline.toLowerCase().includes(card.highlight.toLowerCase()));
  assert.equal(card.items.length, 3);
  assert.equal(card.items[0].title, 'Un documento corto con comentarios');
  assert.match(card.lead, /^Antes de aceptar/);
});

test('carrusel: portada, una slide por punto y cierre con la pregunta, sin tildes en Blackbird', () => {
  const post = postFromText(POST, 'carousel');
  assert.match(post.cover.title, /^Cancele el 40%/);
  assert.equal(post.cover.tag, 'productividad');
  assert.equal(post.slides.length, 4);
  for (const s of post.slides) {
    assert.ok(s.title.length <= 18 && s.titleAccent.length <= 18, `${s.title} / ${s.titleAccent}`);
    assert.doesNotMatch(s.title + s.titleAccent + s.tag, /[áéíóúñ¿¡]/i);
  }
  assert.equal(post.slides.at(-1).tag, 'y tu');
});

test('slide única con cifras', () => {
  const post = postFromText('El 72% de los equipos usa IA en research y el 31% en testing.\n\nMás datos abajo.', 'slide');
  assert.equal(post.format, 'slide');
  assert.equal(post.slide.visual.kind, 'stats');
  assert.equal(post.slide.visual.items[0].display, '72%');
});

test('utilidades', () => {
  assert.equal(toBlackbird('¿Diseño útil?'), 'Diseno util?');
  assert.equal(clip('uno dos tres cuatro', 9), 'uno dos…');
});
