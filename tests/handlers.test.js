import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleGenerate, handleProposals, handleTopics, handleDigest, hashToken } from '../server/handlers.js';
import { GenerateError } from '../server/generate.js';

// Supabase simulado: registra las llamadas y responde según `db`.
function fakeAdmin(db) {
  const calls = [];
  const table = (name) => {
    const q = { filters: {} };
    const api = {
      select: () => api,
      eq: (k, v) => ((q.filters[k] = v), api),
      maybeSingle: async () => {
        calls.push(['select', name, q.filters]);
        if (name === 'ingest_tokens') return { data: db.tokens[q.filters.token_hash] ? { user_id: db.tokens[q.filters.token_hash] } : null, error: null };
        if (name === 'digest_settings') return { data: db.settings?.[q.filters.user_id] ? { data: db.settings[q.filters.user_id] } : null, error: null };
        return { data: null, error: null };
      },
      upsert: async (row, opts) => (calls.push(['upsert', name, row, opts]), { error: db.failUpsert ? { message: 'x' } : null }),
    };
    return api;
  };
  return {
    calls,
    auth: { getUser: async (token) => (db.users[token] ? { data: { user: { id: db.users[token] } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } }) },
    rpc: async (fn, args) => {
      calls.push(['rpc', fn, args]);
      if (fn === 'consume_ai_credit') {
        db.usage = (db.usage || 0) + 1;
        return { data: db.usage > args.p_limit ? null : db.usage, error: null };
      }
      return { data: null, error: null };
    },
    from: table,
    storage: {
      from: () => ({
        upload: async (path, body, opts) => (calls.push(['upload', path, body.length, opts.contentType]), { error: null }),
        list: async (dir) => (calls.push(['list', dir]), { data: db.files || [], error: null }),
        remove: async (paths) => (calls.push(['remove', paths]), { error: null }),
      }),
    },
  };
}

const post = (body, headers = {}, query = {}) => ({ method: 'POST', headers, query, body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) });

let db;
beforeEach(() => {
  db = { users: { 'jwt-a': 'user-a' }, tokens: { [hashToken('posty_tok')]: 'user-a' } };
  process.env.AI_MONTHLY_LIMIT = '2';
});

// ---------- /api/generate ----------

test('generate: pide sesión cuando hay Supabase', async () => {
  const admin = fakeAdmin(db);
  assert.equal((await handleGenerate(post({ prompt: 'x', format: 'card' }), { admin })).status, 401);
  assert.equal((await handleGenerate(post({ prompt: 'x', format: 'card' }, { authorization: 'Bearer malo' }), { admin })).status, 401);
});

test('generate: aplica el límite mensual por usuario', async () => {
  const admin = fakeAdmin(db);
  const generatePost = async () => ({ format: 'card', title: 'ok' });
  const req = post({ prompt: 'x', format: 'card' }, { authorization: 'Bearer jwt-a' });
  assert.equal((await handleGenerate(req, { admin, generatePost })).status, 200);
  assert.equal((await handleGenerate(req, { admin, generatePost })).status, 200);
  const third = await handleGenerate(req, { admin, generatePost });
  assert.equal(third.status, 429);
  assert.match(third.json.error, /límite de 2/);
  assert.deepEqual(admin.calls.find((c) => c[0] === 'rpc')[2], { p_user: 'user-a', p_limit: 2 });
});

test('generate: si Claude falla, devuelve el crédito', async () => {
  const admin = fakeAdmin(db);
  const generatePost = async () => {
    throw new GenerateError(502, 'La respuesta de Claude se cortó.');
  };
  const res = await handleGenerate(post({ prompt: 'x', format: 'card' }, { authorization: 'Bearer jwt-a' }), { admin, generatePost });
  assert.equal(res.status, 502);
  assert.ok(admin.calls.some((c) => c[0] === 'rpc' && c[1] === 'refund_ai_credit'));
});

test('generate: sin Supabase usa el código de acceso opcional', async () => {
  process.env.POSTY_ACCESS_CODE = 'secreto';
  const generatePost = async () => ({ ok: true });
  assert.equal((await handleGenerate(post({ prompt: 'x', format: 'card' }), { admin: null, generatePost })).status, 401);
  assert.equal((await handleGenerate(post({ prompt: 'x', format: 'card' }, { 'x-posty-code': 'secreto' }), { admin: null, generatePost })).status, 200);
  delete process.env.POSTY_ACCESS_CODE;
});

// ---------- /api/proposals ----------

const WEEK = `---
semana: 2026-W42
inicio: 2026-10-12
---

## Primer post
dia: 2026-10-12
imagenes: lun-1.png, lun-2.png
pdf: lun.pdf

Texto.
`;

test('proposals: exige un token de rutina válido', async () => {
  const admin = fakeAdmin(db);
  assert.equal((await handleProposals(post(WEEK, {}, { week: '2026-W42' }), { admin })).status, 401);
  assert.equal((await handleProposals(post(WEEK, { authorization: 'Bearer otro' }, { week: '2026-W42' }), { admin })).status, 401);
  assert.equal((await handleProposals(post(WEEK, {}, { week: '2026-W42' }), { admin: null })).status, 503);
});

test('proposals: guarda la semana en la cuenta del dueño del token y limpia archivos viejos', async () => {
  db.files = [{ name: 'viejo.png' }];
  const admin = fakeAdmin(db);
  const res = await handleProposals(post(WEEK, { authorization: 'Bearer posty_tok' }, { week: '2026-W42' }), { admin });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.expectedFiles, ['lun-1.png', 'lun-2.png', 'lun.pdf']);
  const upsert = admin.calls.find((c) => c[0] === 'upsert');
  assert.equal(upsert[2].user_id, 'user-a');
  assert.equal(upsert[2].week, '2026-W42');
  assert.deepEqual(admin.calls.find((c) => c[0] === 'remove')[1], ['user-a/weeks/2026-W42/viejo.png']);
});

test('proposals: valida semana y contenido', async () => {
  const admin = fakeAdmin(db);
  const auth = { authorization: 'Bearer posty_tok' };
  assert.equal((await handleProposals(post(WEEK, auth, { week: '42' }), { admin })).status, 400);
  assert.equal((await handleProposals(post(WEEK, auth, { week: '2026-W43' }), { admin })).status, 400);
  assert.equal((await handleProposals(post('sin posts', auth, { week: '2026-W42' }), { admin })).status, 400);
});

test('proposals: sube archivos a la carpeta de la semana', async () => {
  const admin = fakeAdmin(db);
  const auth = { authorization: 'Bearer posty_tok' };
  const ok = await handleProposals(post('PNGDATA', auth, { week: '2026-W42', file: 'lun-1.png' }), { admin });
  assert.equal(ok.status, 200);
  assert.deepEqual(admin.calls.find((c) => c[0] === 'upload'), ['upload', 'user-a/weeks/2026-W42/lun-1.png', 7, 'image/png']);
  assert.equal((await handleProposals(post('x', auth, { week: '2026-W42', file: '../otro/x.png' }), { admin })).status, 400);
  assert.equal((await handleProposals(post('x', auth, { week: '2026-W42', file: 'script.js' }), { admin })).status, 400);
  const big = { ...post('', auth, { week: '2026-W42', file: 'big.png' }), body: Buffer.alloc(4 * 1024 * 1024 + 1) };
  assert.equal((await handleProposals(big, { admin })).status, 413);
});

// ---------- /api/topics ----------

const get = (headers = {}) => ({ method: 'GET', headers, query: {}, body: Buffer.alloc(0) });

test('topics: exige el token de la rutina', async () => {
  const admin = fakeAdmin(db);
  assert.equal((await handleTopics(get(), { admin })).status, 401);
  assert.equal((await handleTopics(get({ authorization: 'Bearer otro' }), { admin })).status, 401);
  assert.equal((await handleTopics({ ...get(), method: 'POST' }, { admin })).status, 405);
});

test('topics: devuelve los temas de la persona del token, limpios y con instrucciones', async () => {
  db.settings = {
    'user-a': { topics: [{ name: ' Liderazgo ', note: 'equipos remotos' }, { name: 'liderazgo' }, { name: '' }, { name: 'IA' }], postsPerWeek: 9, audience: 'Diseñadores' },
    'user-b': { topics: [{ name: 'Ventas' }] },
  };
  const res = await handleTopics(get({ authorization: 'Bearer posty_tok' }), { admin: fakeAdmin(db) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.topics, [{ name: 'Liderazgo', note: 'equipos remotos' }, { name: 'IA', note: '' }]);
  assert.equal(res.json.postsPerWeek, 7);
  assert.match(res.json.brief, /Prepara 7 posts/);
  assert.match(res.json.brief, /- Liderazgo: equipos remotos\n- IA/);
  assert.match(res.json.brief, /Audiencia: Diseñadores/);
  assert.ok(!res.json.brief.includes('Ventas'));
});

test('topics: sin temas elegidos, la rutina sigue con los suyos', async () => {
  const res = await handleTopics(get({ authorization: 'Bearer posty_tok' }), { admin: fakeAdmin(db) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.topics, []);
  assert.match(res.json.brief, /aún no eligió temas/);
});

// ---------- /api/digest ----------

test('digest: cobra un crédito por propuesta y usa los temas guardados', async () => {
  db.settings = { 'user-a': { topics: [{ name: 'IA' }], postsPerWeek: 2 } };
  process.env.AI_MONTHLY_LIMIT = '5';
  const admin = fakeAdmin(db);
  let args;
  const generateWeek = async (a) => ((args = a), { week: '2026-W41', source: 'x', posts: 2 });
  const res = await handleDigest(post({ which: 'next', today: '2026-10-01', settings: { topics: [{ name: 'trampa' }] } }, { authorization: 'Bearer jwt-a' }), { admin, generateWeek });
  assert.equal(res.status, 200);
  assert.deepEqual(args.settings.topics, [{ name: 'IA', note: '' }]);
  assert.equal(admin.calls.filter((c) => c[1] === 'consume_ai_credit').length, 2);
});

test('digest: si no alcanza el límite o Claude falla, devuelve los créditos', async () => {
  db.settings = { 'user-a': { topics: [{ name: 'IA' }], postsPerWeek: 3 } };
  process.env.AI_MONTHLY_LIMIT = '2';
  let admin = fakeAdmin(db);
  const over = await handleDigest(post({ which: 'next' }, { authorization: 'Bearer jwt-a' }), { admin, generateWeek: async () => assert.fail('no debe generar') });
  assert.equal(over.status, 429);
  assert.equal(admin.calls.filter((c) => c[1] === 'refund_ai_credit').length, 2);

  db.usage = 0;
  process.env.AI_MONTHLY_LIMIT = '10';
  admin = fakeAdmin(db);
  const failed = await handleDigest(post({ which: 'next' }, { authorization: 'Bearer jwt-a' }), {
    admin,
    generateWeek: async () => {
      throw new GenerateError(502, 'La respuesta de Claude se cortó.');
    },
  });
  assert.equal(failed.status, 502);
  assert.equal(admin.calls.filter((c) => c[1] === 'refund_ai_credit').length, 3);
});

test('digest: sin sesión o sin temas no genera', async () => {
  const admin = fakeAdmin(db);
  assert.equal((await handleDigest(post({ which: 'next' }), { admin })).status, 401);
  const none = await handleDigest(post({ which: 'next' }, { authorization: 'Bearer jwt-a' }), { admin });
  assert.equal(none.status, 400);
  assert.ok(!admin.calls.some((c) => c[1] === 'consume_ai_credit'));
});
