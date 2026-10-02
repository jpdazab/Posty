import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMcp } from '../server/mcp.js';
import { hashToken } from '../server/handlers.js';
import { parseWeek } from '../src/parser.js';
import { fakeDb } from './fake-db.js';

const U = 'user-a';
const setup = () =>
  fakeDb({
    ingest_tokens: [{ user_id: U, token_hash: hashToken('posty_ok') }, { user_id: 'user-b', token_hash: hashToken('posty_b') }],
    weeks: [{ user_id: 'user-b', week: '2026-W41', source: '---\nsemana: 2026-W41\n---\n\n## De B\n\nNo debe verse.' }],
    kits: [{ user_id: U, data: { customTemplates: [{ id: 'tpl-1', name: 'Cita', layers: [{ id: 't1', name: 'Frase', sample: 'x' }, { id: 't2', name: 'Autor', sample: 'y' }] }] } }],
  });

const rpc = (admin, body, { token = 'posty_ok', headers = {} } = {}) =>
  handleMcp({ method: 'POST', headers: { host: 'posty.test', ...headers }, query: token ? { token } : {}, body: Buffer.from(JSON.stringify(body)) }, { admin });

test('mcp: inicializa, lista herramientas y responde 202 a notificaciones', async () => {
  const admin = setup();
  const init = await rpc(admin, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal(init.status, 200);
  assert.equal(init.json.result.protocolVersion, '2025-06-18');
  assert.ok(init.json.result.capabilities.tools);
  const unknownVersion = await rpc(admin, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(unknownVersion.json.result.protocolVersion, '2025-11-25');
  assert.equal((await rpc(admin, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const list = await rpc(admin, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.deepEqual(list.json.result.tools.map((t) => t.name), ['posty_get_topics', 'posty_list_templates', 'posty_list_proposals', 'posty_add_proposals', 'posty_create_post']);
  for (const t of list.json.result.tools) assert.equal(t.inputSchema.type, 'object');
  assert.equal((await rpc(admin, { jsonrpc: '2.0', id: 4, method: 'nada' })).json.error.code, -32601);
  const batch = await rpc(admin, [{ jsonrpc: '2.0', id: 5, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/x' }]);
  assert.deepEqual(batch.json, [{ jsonrpc: '2.0', id: 5, result: {} }]);
});

test('mcp: token en la ruta, en ?token= o como Bearer; si falta o no vale, conecta y avisa sin 401', async () => {
  const admin = setup();
  const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
  const inPath = await handleMcp({ method: 'POST', headers: {}, query: {}, path: '/api/mcp/posty_ok', body: Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'posty_list_templates', arguments: {} } })) }, { admin });
  assert.equal(inPath.json.result.isError, undefined);
  assert.match(inPath.json.result.content[0].text, /Cita/);
  const bearer = await rpc(admin, ping, { token: '', headers: { authorization: 'Bearer posty_ok' } });
  assert.equal(bearer.status, 200);
  for (const token of ['', 'malo']) {
    // Nunca 401: Claude intentaría OAuth y pediría registrarse.
    const init = await rpc(admin, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { token });
    assert.equal(init.status, 200);
    const tool = await rpc(admin, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'posty_get_topics', arguments: {} } }, { token });
    assert.equal(tool.json.result.isError, true);
    assert.match(tool.json.result.content[0].text, /no reconoce el token/);
  }
  const get = await handleMcp({ method: 'GET', headers: {}, query: {}, body: Buffer.alloc(0) }, { admin });
  assert.equal(get.status, 405);
  assert.equal((await handleMcp({ method: 'POST', headers: {}, query: { token: 'posty_ok' }, body: Buffer.from('{no') }, { admin })).status, 400);
});

const call = (admin, name, args, token) => rpc(admin, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }, token ? { token } : {});

test('mcp: propuestas en la semana del usuario del token, sumadas y sin tocar las de otros', async () => {
  const admin = setup();
  const res = await call(admin, 'posty_add_proposals', { week: '2026-W41', theme: 'Remoto', posts: [{ title: 'Uno', text: 'Texto uno', day: '2026-10-07', time: '09:15', pillar: 'Liderazgo' }] });
  assert.equal(res.json.result.isError, undefined);
  assert.match(res.json.result.content[0].text, /https:\/\/posty\.test\/#\/digest/);
  await call(admin, 'posty_add_proposals', { week: '2026-W41', posts: [{ title: 'Dos', text: 'Texto dos' }] });
  const mine = admin.db.weeks.find((w) => w.user_id === U);
  const parsed = parseWeek(mine.source, '2026-W41');
  assert.deepEqual(parsed.posts.map((p) => [p.title, p.dia, p.hora]), [['Uno', '2026-10-07', '09:15'], ['Dos', '2026-10-05', '08:30']]);
  assert.match(admin.db.weeks.find((w) => w.user_id === 'user-b').source, /De B/);
  const listed = await call(admin, 'posty_list_proposals', {});
  assert.ok(!listed.json.result.content[0].text.includes('De B'));
  const bad = await call(admin, 'posty_add_proposals', { posts: [{ title: 'Sin texto', text: '  ' }] });
  assert.equal(bad.json.result.isError, true);
});

test('mcp: post con plantilla por nombre; sin plantillas, error legible', async () => {
  const admin = setup();
  const res = await call(admin, 'posty_create_post', { title: 'La frase', text: 'Una idea. Y más.', template: 'cita', fields: { autor: 'Ana' } });
  assert.match(res.json.result.content[0].text, /plantilla "Cita"/);
  const post = admin.db.created_posts[0];
  assert.equal(post.user_id, U);
  assert.deepEqual(post.data.fields, { t1: 'La frase', t2: 'Ana' });
  assert.equal(post.data.format, 'custom');
  const none = await call(admin, 'posty_create_post', { title: 'x', text: 'y' }, 'posty_b');
  assert.equal(none.json.result.isError, true);
  assert.match(none.json.result.content[0].text, /no tiene plantillas/);
});
