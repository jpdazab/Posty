// Supabase simulado en memoria para probar el servidor (tablas con filtros eq, orden, límite y upsert).
export function fakeDb(tables = {}) {
  const db = { weeks: [], post_states: [], created_posts: [], kits: [], digest_settings: [], ingest_tokens: [], ...tables };
  const removed = [];
  const keys = { weeks: ['user_id', 'week'], created_posts: ['user_id', 'id'], kits: ['user_id'], digest_settings: ['user_id'] };
  function query(table) {
    const filters = [];
    let order = null;
    let limit = Infinity;
    const run = () => {
      let rows = (db[table] || []).filter((r) => filters.every(([k, v]) => r[k] === v));
      if (order) rows = [...rows].sort((a, b) => (a[order.col] > b[order.col] ? 1 : -1) * (order.asc ? 1 : -1));
      return rows.slice(0, limit);
    };
    const api = {
      select: () => api,
      eq: (k, v) => (filters.push([k, v]), api),
      order: (col, { ascending = true } = {}) => ((order = { col, asc: ascending }), api),
      limit: (n) => ((limit = n), api),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve) => resolve({ data: run(), error: null }),
      upsert: async (row) => {
        const k = keys[table];
        const i = db[table].findIndex((r) => k.every((c) => r[c] === row[c]));
        if (i >= 0) db[table][i] = { ...db[table][i], ...row };
        else db[table].push(row);
        return { error: null };
      },
    };
    return api;
  }
  return {
    db,
    removed,
    from: query,
    storage: { from: () => ({ list: async () => ({ data: [{ name: 'vieja.png' }] }), remove: async (paths) => (removed.push(...paths), { error: null }) }) },
  };
}
