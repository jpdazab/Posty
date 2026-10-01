import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFontName, groupRuns } from '../src/pdf-text.js';

test('nombres de fuente del PDF', () => {
  assert.deepEqual(parseFontName('ABCDEF+Montserrat-SemiBold'), { family: 'Montserrat', weight: 600, raw: 'Montserrat-SemiBold' });
  assert.equal(parseFontName('Inter-ExtraBold').weight, 800);
  assert.equal(parseFontName('Inter-Bold').weight, 700);
  assert.equal(parseFontName('PlayfairDisplay-Regular').family, 'Playfair Display');
  assert.equal(parseFontName('ArialMT').family, 'Arial');
  assert.equal(parseFontName('').family, '');
});

const run = (text, x, baseline, extra = {}) => ({ text, x, baseline, width: text.length * 20, size: 40, font: 'Inter', weight: 700, color: '#ffffff', ...extra });

test('junta trozos en líneas y líneas en párrafos', () => {
  const blocks = groupRuns([
    run('Tres rituales', 80, 200),
    run('para equipos', 360, 200),
    run('remotos', 80, 246),
    run('Texto pequeño de apoyo', 80, 500, { size: 18, width: 300, weight: 400, color: '#c9d4f2' }),
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].text, 'Tres rituales para equipos remotos');
  assert.equal(blocks[0].lineHeight, 1.15);
  assert.equal(blocks[0].color, '#ffffff');
  assert.equal(blocks[1].text, 'Texto pequeño de apoyo');
});

test('texto espaciado, centrado y listas', () => {
  const letters = 'LIDERAZGO'.split('').map((c, i) => run(c, 80 + i * 26, 120, { size: 28, width: 18 }));
  assert.equal(groupRuns(letters)[0].text, 'LIDERAZGO');
  assert.equal(groupRuns([run('L I D E R A Z G O', 80, 120)])[0].text, 'LIDERAZGO');
  assert.equal(groupRuns([run('Y a mí', 80, 120)])[0].text, 'Y a mí');

  const centered = groupRuns([run('Lo que de verdad', 300, 150, { width: 480 }), run('funciona', 420, 196, { width: 240 })]);
  assert.equal(centered[0].align, 'center');

  const list = groupRuns(['1. Daily escrita', '2. Demo en vídeo', '3. Retro sin agenda'].map((t, i) => run(t, 120, 500 + i * 60, { size: 40, weight: 400, color: '#e23e57' })));
  assert.equal(list.length, 1);
  assert.equal(list[0].text, '1. Daily escrita\n2. Demo en vídeo\n3. Retro sin agenda');
});

test('distinto color o tamaño son capas distintas', () => {
  const blocks = groupRuns([run('Título', 80, 200), run('Otro color', 80, 246, { color: '#f2a541' })]);
  assert.equal(blocks.length, 2);
});
