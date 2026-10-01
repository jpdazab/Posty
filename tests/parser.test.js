import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWeek, composePost, linkedInShareUrl, splitList } from '../src/parser.js';

test('parsea frontmatter, metadatos y texto de cada post', () => {
  const week = parseWeek(`---
semana: 2026-W41
inicio: 2026-10-05
tema: "Tema"
---

## Primer post
dia: 2026-10-06
hora: 08:30
hashtags: #A #B

Hola
mundo

## Segundo post

- una lista que no es metadato
pilar: esto es texto, no metadato
`);
  assert.equal(week.id, '2026-W41');
  assert.equal(week.start, '2026-10-05');
  assert.equal(week.theme, 'Tema');
  assert.equal(week.posts.length, 2);
  assert.deepEqual(
    { id: week.posts[0].id, title: week.posts[0].title, dia: week.posts[0].dia, hora: week.posts[0].hora, text: week.posts[0].text },
    { id: '2026-W41-1', title: 'Primer post', dia: '2026-10-06', hora: '08:30', text: 'Hola\nmundo' },
  );
  assert.equal(week.posts[1].pilar, undefined);
  assert.equal(week.posts[1].text, '- una lista que no es metadato\npilar: esto es texto, no metadato');
});

test('usa el nombre de archivo si falta la semana', () => {
  assert.equal(parseWeek('## Post\n\nTexto', '2026-W01').id, '2026-W01');
});

test('composePost agrega hashtags que no estén ya en el texto', () => {
  assert.equal(composePost('Hola #IA', '#IA Liderazgo'), 'Hola #IA\n\n#Liderazgo');
  assert.equal(composePost('Hola', ''), 'Hola');
});

test('linkedInShareUrl codifica el texto', () => {
  assert.equal(linkedInShareUrl('a b&c'), 'https://www.linkedin.com/feed/?shareActive=true&text=a%20b%26c');
});

test('el archivo de ejemplo es válido', () => {
  const week = parseWeek(readFileSync(new URL('../propuestas/2026-W40.md', import.meta.url), 'utf8'));
  assert.equal(week.posts.length, 3);
  for (const post of week.posts) {
    assert.ok(post.text.length > 50);
    assert.match(post.dia, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('metadatos de imágenes, pdf y fuentes', () => {
  const post = parseWeek('---\nsemana: 2026-W42\n---\n## P\nimagenes: a.jpg, b.jpg\npdf: c.pdf\nfuentes: https://a.com https://b.com\n\nTexto').posts[0];
  assert.deepEqual(splitList(post.imagenes), ['a.jpg', 'b.jpg']);
  assert.equal(post.pdf, 'c.pdf');
  assert.deepEqual(splitList(post.fuentes, { spaces: true }), ['https://a.com', 'https://b.com']);
  assert.equal(post.text, 'Texto');
});
