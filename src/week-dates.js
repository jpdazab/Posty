// Fechas de semanas ISO (lunes a domingo), compartidas por la web y el servidor.

const DAY_MS = 86400000;
export const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const iso = (d) => d.toISOString().slice(0, 10);

// Semana ISO (lunes a domingo) de una fecha AAAA-MM-DD.
export function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.floor((thursday.getTime() - yearStart) / DAY_MS / 7) + 1;
  return { id: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, start: iso(monday) };
}

// Semana objetivo y días disponibles: en la semana actual, solo desde hoy.
export function targetWeek(which, today) {
  const base = which === 'next' ? iso(new Date(new Date(`${today}T00:00:00Z`).getTime() + 7 * DAY_MS)) : today;
  const { id, start } = isoWeek(base);
  const days = Array.from({ length: 7 }, (_, i) => iso(new Date(new Date(`${start}T00:00:00Z`).getTime() + i * DAY_MS)));
  const available = days.filter((d) => d >= today);
  return { id, start, days: available.length ? available : days };
}

// "2026-W41" → { id, start, days } con los 7 días de esa semana ISO (o null si no es válido).
export function weekFromId(id) {
  const m = String(id || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const [year, week] = [Number(m[1]), Number(m[2])];
  if (week < 1 || week > 53) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const monday1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  const start = monday1 + (week - 1) * 7 * DAY_MS;
  const days = Array.from({ length: 7 }, (_, i) => iso(new Date(start + i * DAY_MS)));
  return isoWeek(days[0]).id === id ? { id, start: days[0], days } : null;
}

// Fecha local de hoy en AAAA-MM-DD (la del navegador, no la UTC).
export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
