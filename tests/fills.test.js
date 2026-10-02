import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillStyle, fillCss, fillBase, fillThemes, readableText } from '../src/fills.js';
import { contrast } from '../src/layouts.js';

const BRAND = { primary: '#2f5bea', secondary: '#f2a541', background: '#ffffff', text: '#16161d' };

test('sin relleno: solo el color de fondo', () => {
  assert.deepEqual(fillStyle('#ffffff', null), { backgroundColor: '#ffffff' });
  assert.equal(fillStyle('no-es-color', null).backgroundColor, '#ffffff');
});

test('degradados y texturas generan CSS', () => {
  assert.match(fillStyle('#fff000', { kind: 'linear', angle: 90, from: '#111111', to: '#222222' }).backgroundImage, /^linear-gradient\(90deg, #111111, #222222\)$/);
  assert.match(fillStyle('#ffffff', { kind: 'radial', from: '#111111', to: '#222222' }).backgroundImage, /^radial-gradient/);
  assert.match(fillStyle('#ffffff', { kind: 'aurora', from: '#111111', to: '#222222' }).backgroundImage, /radial-gradient.*radial-gradient/);
  for (const pattern of ['dots', 'grid', 'stripes', 'lines', 'checker']) {
    const s = fillStyle('#ffffff', { kind: 'pattern', pattern, color: '#2f5bea', size: 40 });
    assert.ok(s.backgroundImage.includes('#2f5bea'), pattern);
    assert.equal(s.backgroundColor, '#ffffff');
  }
  // Las miniaturas escalan el tamaño de la textura.
  assert.match(fillStyle('#ffffff', { kind: 'pattern', pattern: 'dots', color: '#000000', size: 40 }, 0.5).backgroundSize, /^20px 20px$/);
  assert.match(fillCss('#ffffff', { kind: 'linear', angle: 0, from: '#000000', to: '#ffffff' }), /background-color:#ffffff;background-image:linear-gradient/);
});

test('un color inválido en el degradado no rompe el CSS', () => {
  const s = fillStyle('#ffffff', { kind: 'linear', angle: 10, from: 'red;}', to: '#000000' });
  assert.equal(s.backgroundImage, 'linear-gradient(10deg, #ffffff, #000000)');
});

test('los temas usan los colores de la marca y son todos válidos', () => {
  const themes = fillThemes(BRAND);
  assert.ok(themes.length >= 10);
  assert.ok(themes.some((t) => t.fill?.kind === 'pattern') && themes.some((t) => t.fill?.kind === 'linear'));
  assert.ok(themes.some((t) => t.fill?.from === BRAND.primary && t.fill?.to === BRAND.secondary));
  for (const t of themes) {
    assert.match(t.background, /^#[0-9a-f]{6}$/i, t.name);
    assert.match(fillBase(t.background, t.fill), /^#[0-9a-f]{6}$/i, t.name);
  }
});

test('el texto se ajusta solo si deja de leerse', () => {
  assert.equal(readableText('#16161d', '#ffffff', BRAND), '#16161d');
  const onDark = readableText('#16161d', '#101014', BRAND);
  assert.ok(contrast(onDark, '#101014') >= 4.5);
});
