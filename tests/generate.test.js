import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Servidor falso de la API de Anthropic para comprobar la petición y la lectura de la respuesta.
let server;
let lastRequest;
let reply;

before(async () => {
  server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    lastRequest = { url: req.url, headers: req.headers, body: JSON.parse(raw) };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(reply));
  });
  await new Promise((r) => server.listen(0, r));
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const message = (content, stop_reason = 'end_turn') => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content,
  stop_reason,
  usage: { input_tokens: 1, output_tokens: 1 },
});

test('genera una card con salida estructurada y fallback por defecto', async () => {
  const { generatePost } = await import('../server/generate.js');
  const card = { eyebrow: 'Design', headline: 'Menos pantallas', highlight: 'pantallas', lead: 'x', items: ['a', 'b', 'c'] };
  reply = message([{ type: 'text', text: JSON.stringify({ title: 'T', text: 'Hola', hashtags: ['#UX'], card }) }]);

  const post = await generatePost({ prompt: '  Un post sobre UX  ', format: 'card' });

  assert.deepEqual(post, { format: 'card', title: 'T', text: 'Hola', hashtags: ['#UX'], card });
  assert.equal(lastRequest.url, '/v1/messages?beta=true');
  assert.match(lastRequest.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(lastRequest.body.model, 'claude-opus-5-5');
  assert.equal(lastRequest.body.fallbacks, 'default');
  assert.equal(lastRequest.body.output_config.format.type, 'json_schema');
  assert.ok(lastRequest.body.output_config.format.schema.properties.card);
  assert.deepEqual(lastRequest.body.messages, [{ role: 'user', content: 'Un post sobre UX' }]);
});

test('el carrusel pide slides', async () => {
  const { generatePost } = await import('../server/generate.js');
  reply = message([{ type: 'text', text: JSON.stringify({ title: 'T', text: 'x', hashtags: [], slides: [] }) }]);
  await generatePost({ prompt: 'x', format: 'carousel' });
  assert.ok(lastRequest.body.output_config.format.schema.properties.slides);
  assert.match(lastRequest.body.system, /carrusel de 5 slides/);
});

test('una negativa de Claude se convierte en un error legible', async () => {
  const { generatePost, GenerateError } = await import('../server/generate.js');
  reply = message([], 'refusal');
  await assert.rejects(generatePost({ prompt: 'x', format: 'card' }), (err) => err instanceof GenerateError && err.status === 422);
});

test('valida la entrada antes de llamar a la API', async () => {
  const { generatePost } = await import('../server/generate.js');
  await assert.rejects(generatePost({ prompt: '', format: 'card' }), /Escribe/);
  await assert.rejects(generatePost({ prompt: 'x', format: 'video' }), /Formato/);
});

test('el código de acceso es opcional', async () => {
  const { checkAccess } = await import('../server/generate.js');
  delete process.env.POSTY_ACCESS_CODE;
  assert.doesNotThrow(() => checkAccess(undefined));
  process.env.POSTY_ACCESS_CODE = 'secreto';
  assert.throws(() => checkAccess('otro'), /Código/);
  assert.doesNotThrow(() => checkAccess('secreto'));
  delete process.env.POSTY_ACCESS_CODE;
});
