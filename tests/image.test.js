import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateImage, sizeFor } from '../server/image.js';
import { handleImage } from '../server/handlers.js';

const KEY = 'sk-proj-abcdefghijklmnop';
const ok = (b64 = 'QUJD') => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: b64 }] }) });
const fail = (status, error) => ({ ok: false, status, json: async () => ({ error }) });

test('tamaño según la proporción del hueco', () => {
  assert.equal(sizeFor(1080 / 1350), '1024x1536');
  assert.equal(sizeFor(600 / 400), '1536x1024');
  assert.equal(sizeFor(1), '1024x1024');
  assert.equal(sizeFor(NaN), '1024x1024');
});

test('genera con el modelo más nuevo y devuelve la imagen como data URL', async () => {
  let req;
  const res = await generateImage({ prompt: ' Una oficina luminosa ', size: '1024x1536', quality: 'high' }, KEY, { fetchImpl: async (url, init) => ((req = { url, init, body: JSON.parse(init.body) }), ok()) });
  assert.equal(res.image, 'data:image/jpeg;base64,QUJD');
  assert.equal(res.model, 'gpt-image-2');
  assert.equal(req.url, 'https://api.openai.com/v1/images/generations');
  assert.equal(req.init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(req.body, { model: 'gpt-image-2', prompt: 'Una oficina luminosa', n: 1, size: '1024x1536', quality: 'high', output_format: 'jpeg' });
});

test('si la cuenta no tiene el modelo, prueba el siguiente', async () => {
  const models = [];
  const res = await generateImage({ prompt: 'x' }, KEY, {
    fetchImpl: async (_u, init) => {
      const m = JSON.parse(init.body).model;
      models.push(m);
      return m === 'gpt-image-2' ? fail(404, { code: 'model_not_found', message: 'The model gpt-image-2 does not exist' }) : ok();
    },
  });
  assert.deepEqual(models, ['gpt-image-2', 'gpt-image-1.5']);
  assert.equal(res.model, 'gpt-image-1.5');
});

test('errores de OpenAI en mensajes claros', async () => {
  const cases = [
    [fail(401, { message: 'Incorrect API key' }), /clave de OpenAI no es válida/],
    [fail(403, { message: 'Your organization must be verified to use the model' }), /verificada/],
    [fail(429, { code: 'insufficient_quota', message: 'You exceeded your current quota' }), /saldo/],
    [fail(400, { code: 'moderation_blocked', message: 'blocked by safety system' }), /normas de contenido/],
  ];
  for (const [response, re] of cases) await assert.rejects(generateImage({ prompt: 'x' }, KEY, { fetchImpl: async () => response }), re);
  await assert.rejects(generateImage({ prompt: 'x' }, 'no-es-clave', { fetchImpl: async () => ok() }), /empieza por "sk-"/);
  await assert.rejects(generateImage({ prompt: '' }, KEY, { fetchImpl: async () => ok() }), /Describe la imagen/);
});

test('el endpoint exige sesión de Posty y pasa la clave de la cabecera', async () => {
  const admin = { auth: { getUser: async (t) => (t === 'jwt' ? { data: { user: { id: 'u' } }, error: null } : { data: { user: null }, error: { message: 'x' } }) } };
  const post = (headers) => ({ method: 'POST', headers, query: {}, body: Buffer.from(JSON.stringify({ prompt: 'x' })) });
  let gotKey;
  const generateImage = async (_b, key) => ((gotKey = key), { image: 'data:image/jpeg;base64,AA', model: 'm' });
  assert.equal((await handleImage(post({}), { admin, generateImage })).status, 401);
  const res = await handleImage(post({ authorization: 'Bearer jwt', 'x-openai-key': KEY }), { admin, generateImage });
  assert.equal(res.status, 200);
  assert.equal(gotKey, KEY);
});
