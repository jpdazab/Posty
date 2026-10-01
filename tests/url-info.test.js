import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePage, readUrl, isPrivateAddress, decodeEntities, pageColors } from '../server/url-info.js';

const HTML = `<!doctype html><html><head>
<title>Fallback</title>
<meta property="og:title" content="Cómo liderar equipos remotos &amp; no morir">
<meta name="description" content="Una guía práctica con 5 rituales.">
<meta content="/img/cover.png" property="og:image">
<meta name="theme-color" content="#E23E57">
<style>.btn{background:#14a08c}.x{color:#14A08C}.g{color:#eeeeee}.y{color:#f2a541}</style>
</head><body><nav><ul><li>Inicio del sitio web</li></ul></nav>
<article><h1>Liderar en remoto</h1>
<p>Los equipos remotos necesitan rituales cortos y claros para mantener la confianza entre personas que casi nunca coinciden.</p>
<h2>1. Daily asíncrona</h2><ul><li>Una daily escrita de tres líneas</li><li>Una demo quincenal en vídeo</li></ul>
<script>var p = "<p>no</p>";</script></article></body></html>`;

test('lee título, descripción, imagen, colores, encabezados, párrafos y listas del artículo', () => {
  const info = parsePage(HTML, new URL('https://www.ejemplo.com/blog/post'));
  assert.equal(info.title, 'Cómo liderar equipos remotos & no morir');
  assert.equal(info.description, 'Una guía práctica con 5 rituales.');
  assert.equal(info.domain, 'ejemplo.com');
  assert.equal(info.imageUrl, 'https://www.ejemplo.com/img/cover.png');
  assert.deepEqual(info.colors, ['#e23e57', '#14a08c', '#f2a541']);
  assert.deepEqual(info.headings, ['1. Daily asíncrona']);
  assert.equal(info.paragraphs.length, 1);
  assert.deepEqual(info.items, ['Una daily escrita de tres líneas', 'Una demo quincenal en vídeo']);
});

test('entidades y colores', () => {
  assert.equal(decodeEntities('a&nbsp;b &#225; &#xF1; &rsquo;'), 'a b á ñ ’');
  assert.deepEqual(pageColors('<p style="color:#888">x</p>'), []);
});

test('direcciones privadas', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1', '0.0.0.0']) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
});

const page = (body, type = 'text/html', status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'content-type': type, ...headers } });

test('no lee direcciones internas, ni tras una redirección', async () => {
  const resolve = async (host) => [{ address: host === 'interno.ejemplo.com' ? '10.0.0.5' : '93.184.216.34' }];
  await assert.rejects(readUrl('http://localhost/', { resolve }), /no es pública/);
  await assert.rejects(readUrl('http://169.254.169.254/latest/meta-data', { resolve }), /no es pública/);
  await assert.rejects(readUrl('ftp://ejemplo.com', { resolve }), /http/);
  await assert.rejects(readUrl('https://ejemplo.com:8080', { resolve }), /puertos/);
  await assert.rejects(readUrl('https://interno.ejemplo.com', { resolve }), /no es pública/);
  const fetchImpl = async () => page('', 'text/html', 302, { location: 'http://interno.ejemplo.com/admin' });
  await assert.rejects(readUrl('https://ejemplo.com', { resolve, fetchImpl }), /no es pública/);
});

test('lee la página y trae la imagen en base64', async () => {
  const resolve = async () => [{ address: '93.184.216.34' }];
  const fetchImpl = async (url) => (String(url).endsWith('.png') ? page(Buffer.from([137, 80, 78, 71]), 'image/png') : page(HTML, 'text/html; charset=utf-8'));
  const info = await readUrl('ejemplo.com/blog', { resolve, fetchImpl });
  assert.equal(info.url, 'https://ejemplo.com/blog');
  assert.match(info.image, /^data:image\/png;base64,/);
  assert.equal(info.imageUrl, undefined);
  await assert.rejects(readUrl('ejemplo.com', { resolve, fetchImpl: async () => page('{}', 'application/json') }), /no es una página web/);
});
