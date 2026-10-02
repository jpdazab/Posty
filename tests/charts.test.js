import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRows, rowsToText, chartSvg, categoricalPalette, worstDistance, SAMPLE_DATA, CHART_TYPES } from '../src/charts.js';

test('datos: "valor | etiqueta" con miles y decimales en español', () => {
  assert.deepEqual(parseRows('48% | Research\n1.284 | Usuarios\n3,5x | Más rápido\n12.5 | Media\n\n'), [
    { display: '48%', value: 48, label: 'Research' },
    { display: '1.284', value: 1284, label: 'Usuarios' },
    { display: '3,5x', value: 3.5, label: 'Más rápido' },
    { display: '12.5', value: 12.5, label: 'Media' },
  ]);
  assert.equal(rowsToText(parseRows('48% | Research')), '48% | Research');
});

const LAYER = { w: 920, h: 480, color: '#2f5bea', text: '#16161d', surface: '#ffffff', font: 'Switzer', palette: categoricalPalette('#2f5bea', '#f2a541', '#ffffff') };

test('cada tipo dibuja un SVG con sus valores y etiquetas, en el color de texto', () => {
  for (const chart of Object.keys(CHART_TYPES)) {
    const svg = chartSvg({ ...LAYER, chart }, SAMPLE_DATA[chart]);
    assert.match(svg, /^<svg [^>]*width="920" height="480"/, chart);
    // En la línea solo se etiqueta el valor final (etiquetas selectivas); en el resto, todos.
    const rows = parseRows(SAMPLE_DATA[chart]);
    for (const r of chart === 'line' ? rows.slice(-1) : rows) assert.ok(svg.includes(`>${r.display}<`), `${chart}: valor ${r.display}`);
    if (chart === 'line') assert.ok(!svg.includes(`>${rows[0].display}<`));
    // Los textos nunca van en el color de la serie.
    for (const m of svg.matchAll(/<text[^>]*fill="([^"]+)"/g)) assert.equal(m[1], '#16161d', chart);
  }
  assert.match(chartSvg({ ...LAYER, chart: 'bar' }, ''), /Añade datos/);
});

test('columnas: base recta y extremo redondeado; barras de % sobre 100', () => {
  const bars = chartSvg({ ...LAYER, chart: 'bar' }, '10 | A\n20 | B');
  assert.equal((bars.match(/<path d="M/g) || []).length, 2);
  const h = chartSvg({ ...LAYER, chart: 'hbar', w: 1000 }, '50% | Mitad');
  const fill = h.match(/<path d="M0,[\d.]+ H([\d.]+)/);
  assert.ok(Math.abs(Number(fill[1]) + 0 - 1000 * 0.5) < 40, `barra al 50%: ${fill[1]}`);
});

test('donut: un color por porción, el resto en "Otros"', () => {
  const pal = ['#2f5bea', '#eb9f39', '#008300'];
  const svg = chartSvg({ ...LAYER, chart: 'donut', palette: pal }, '40% | A\n20% | B\n20% | C\n10% | D\n10% | E');
  assert.ok(svg.includes('>Otros<'));
  assert.ok(svg.includes('>40%<'));
  assert.equal((svg.match(/<path d="M[^"]*A/g) || []).length, 3);
});

test('paletas de la marca: vecinos distinguibles también con daltonismo', () => {
  const brands = [['#2f5bea', '#f2a541', '#ffffff'], ['#8b7cff', '#3ee0b0', '#121218'], ['#111111', '#ff4d2e', '#f5f5f2'], ['#0a66c2', '#0a66c2', '#ffffff']];
  for (const [p, s, bg] of brands) {
    const pal = categoricalPalette(p, s, bg);
    assert.ok(pal.length >= 3, `${p}: ${pal}`);
    pal.forEach((c, i) => {
      const next = pal[(i + 1) % pal.length];
      if (next === c) return;
      const d = worstDistance(c, next);
      assert.ok(d.normal >= 15 && d.cvd >= 8, `${c}↔${next} ${d.normal.toFixed(1)}/${d.cvd.toFixed(1)}`);
    });
  }
  assert.ok(!categoricalPalette('#111111', '#ff4d2e', '#ffffff').includes('#111111'), 'el negro no es un color de serie');
});
