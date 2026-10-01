import { parseWeek, composePost, linkedInShareUrl, LINKEDIN_MAX_CHARS } from './parser.js';
import { STATUSES, getPostState, getStatus, updatePost, exportState, importState } from './store.js';

// Todas las propuestas de la carpeta /propuestas se incluyen al compilar.
const files = import.meta.glob('../propuestas/*.md', { query: '?raw', import: 'default', eager: true });

const weeks = Object.entries(files)
  .map(([path, source]) => parseWeek(source, path.split('/').pop().replace(/\.md$/, '')))
  .sort((a, b) => b.id.localeCompare(a.id));

const allPosts = weeks.flatMap((w) => w.posts.map((p) => ({ ...p, week: w })));
const postsById = new Map(allPosts.map((p) => [p.id, p]));

const PREVIEW_CHARS = 210; // Lo que LinkedIn muestra antes de "…ver más".

const ui = {
  filter: 'activos',
  query: '',
  expanded: new Set(),
  editing: new Set(),
  collapsedWeeks: new Set(),
  publishing: null,
};

const FILTERS = [
  ['activos', 'Por publicar'],
  ['pendiente', 'Pendientes'],
  ['aprobado', 'Aprobados'],
  ['publicado', 'Publicados'],
  ['descartado', 'Descartados'],
  ['todos', 'Todos'],
];

const $ = (sel) => document.querySelector(sel);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function currentText(post) {
  return getPostState(post.id).text ?? post.text;
}

function finalText(post) {
  return composePost(currentText(post), post.hashtags);
}

function parseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDay(iso) {
  const d = parseDate(iso);
  if (!d) return '';
  const diff = Math.round((d - today()) / 86400000);
  const rel = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : null;
  const label = d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  return rel ? `${rel} · ${label}` : label;
}

function formatWeekRange(week) {
  const start = parseDate(week.start);
  if (!start) return week.id;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function sortKey(post) {
  return `${post.dia || post.week.start || '9999'} ${post.hora || '99:99'}`;
}

function matchesFilter(post) {
  const status = getStatus(post.id);
  if (ui.filter === 'activos' && !['pendiente', 'aprobado'].includes(status)) return false;
  if (!['activos', 'todos'].includes(ui.filter) && status !== ui.filter) return false;
  if (ui.query) {
    const haystack = `${post.title} ${currentText(post)} ${post.pilar || ''} ${post.hashtags || ''}`.toLowerCase();
    if (!haystack.includes(ui.query)) return false;
  }
  return true;
}

// ---------- Render ----------

function renderStats() {
  const counts = { pendiente: 0, aprobado: 0, publicado: 0, descartado: 0 };
  for (const p of allPosts) counts[getStatus(p.id)]++;
  const items = [
    ['pendiente', 'Por revisar'],
    ['aprobado', 'Aprobados'],
    ['publicado', 'Publicados'],
    ['semanas', 'Semanas'],
  ];
  $('#stats').innerHTML = items
    .map(([key, label]) => `
      <div class="stat stat-${key}">
        <span class="stat-value">${key === 'semanas' ? weeks.length : counts[key]}</span>
        <span class="stat-label">${label}</span>
      </div>`)
    .join('');
}

function renderNextUp() {
  const queue = allPosts
    .filter((p) => ['pendiente', 'aprobado'].includes(getStatus(p.id)))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const next = queue.find((p) => !parseDate(p.dia) || parseDate(p.dia) >= today()) || queue[0];
  if (!next) {
    $('#next-up').innerHTML = allPosts.length
      ? `<div class="next-up empty">🎉 Estás al día: no hay posts pendientes por publicar.</div>`
      : '';
    return;
  }
  const overdue = parseDate(next.dia) && parseDate(next.dia) < today();
  $('#next-up').innerHTML = `
    <div class="next-up ${overdue ? 'overdue' : ''}">
      <div>
        <span class="eyebrow">${overdue ? 'Atrasado' : 'Próximo a publicar'}</span>
        <strong>${esc(next.title)}</strong>
        <span class="muted">${esc([formatDay(next.dia), next.hora].filter(Boolean).join(' · ') || next.week.id)}</span>
      </div>
      <div class="next-actions">
        <button class="btn ghost" data-action="goto" data-id="${esc(next.id)}">Ver</button>
        <button class="btn primary" data-action="publish" data-id="${esc(next.id)}">${linkedinIcon()} Publicar</button>
      </div>
    </div>`;
}

function renderFilters() {
  $('#filters').innerHTML = FILTERS.map(
    ([key, label]) =>
      `<button role="tab" class="chip ${ui.filter === key ? 'active' : ''}" aria-selected="${ui.filter === key}" data-filter="${key}">${label}</button>`,
  ).join('');
}

function renderWeeks() {
  if (!weeks.length) {
    $('#weeks').innerHTML = `
      <div class="empty-state">
        <h2>Aún no hay propuestas</h2>
        <p>Cuando Claude agregue un archivo en <code>propuestas/</code> aparecerá aquí. Revisa <code>PROPUESTAS.md</code> para ver el formato.</p>
      </div>`;
    return;
  }

  const html = weeks
    .map((week) => {
      const posts = week.posts.filter(matchesFilter).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      if (!posts.length && (ui.filter !== 'todos' || ui.query)) return '';
      const done = week.posts.filter((p) => ['publicado', 'descartado'].includes(getStatus(p.id))).length;
      const published = week.posts.filter((p) => getStatus(p.id) === 'publicado').length;
      const collapsed = ui.collapsedWeeks.has(week.id);
      const pct = week.posts.length ? Math.round((done / week.posts.length) * 100) : 0;
      return `
        <article class="week ${collapsed ? 'collapsed' : ''}">
          <button class="week-header" data-action="toggle-week" data-week="${esc(week.id)}" aria-expanded="${!collapsed}">
            <div>
              <span class="eyebrow">${esc(week.id)} · ${esc(formatWeekRange(week))}</span>
              <h2>${esc(week.theme || 'Propuestas de la semana')}</h2>
            </div>
            <div class="week-progress">
              <span>${published}/${week.posts.length} publicados</span>
              <span class="bar"><span style="width:${pct}%"></span></span>
            </div>
          </button>
          ${collapsed ? '' : `
            ${week.notes ? `<p class="week-notes">💬 ${esc(week.notes)}</p>` : ''}
            <div class="posts">${posts.map(renderPost).join('') || '<p class="muted">No hay posts con este filtro.</p>'}</div>`}
        </article>`;
    })
    .join('');

  $('#weeks').innerHTML = html || `<div class="empty-state"><p>No hay posts que coincidan con el filtro.</p></div>`;
}

function renderPost(post) {
  const st = getPostState(post.id);
  const status = getStatus(post.id);
  const text = currentText(post);
  const full = finalText(post);
  const editing = ui.editing.has(post.id);
  const expanded = ui.expanded.has(post.id);
  const long = text.length > PREVIEW_CHARS + 40;
  const shown = long && !expanded ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text;
  const over = full.length > LINKEDIN_MAX_CHARS;
  const late = ['pendiente', 'aprobado'].includes(status) && parseDate(post.dia) < today();

  const meta = [
    post.dia && `<span class="tag date ${late ? 'late' : ''}">${late ? '⏰ Atrasado · ' : '📅 '}${esc(formatDay(post.dia))}${post.hora ? ` · ${esc(post.hora)}` : ''}</span>`,
    post.pilar && `<span class="tag">${esc(post.pilar)}</span>`,
    post.objetivo && `<span class="tag">🎯 ${esc(post.objetivo)}</span>`,
    post.formato && `<span class="tag">${esc(post.formato)}</span>`,
    st.text !== undefined && `<span class="tag edited">Editado</span>`,
  ].filter(Boolean).join('');

  const body = editing
    ? `<textarea class="editor" data-editor="${esc(post.id)}" rows="12">${esc(text)}</textarea>`
    : `<div class="post-text">${esc(shown)}${long ? `<button class="link" data-action="expand" data-id="${esc(post.id)}">${expanded ? 'ver menos' : 'ver más'}</button>` : ''}</div>`;

  const hashtags = post.hashtags ? `<p class="hashtags">${esc(composePost('', post.hashtags).trim())}</p>` : '';

  const actions = editing
    ? `
      <button class="btn primary" data-action="save" data-id="${esc(post.id)}">Guardar</button>
      <button class="btn ghost" data-action="cancel-edit" data-id="${esc(post.id)}">Cancelar</button>
      ${st.text !== undefined ? `<button class="btn ghost danger" data-action="restore" data-id="${esc(post.id)}">Restaurar original</button>` : ''}`
    : status === 'publicado'
      ? `
      ${st.url ? `<a class="btn ghost" href="${esc(st.url)}" target="_blank" rel="noopener">Ver en LinkedIn ↗</a>` : ''}
      <button class="btn ghost" data-action="copy" data-id="${esc(post.id)}">Copiar texto</button>
      <button class="btn ghost" data-action="status" data-status="aprobado" data-id="${esc(post.id)}">Desmarcar</button>`
      : status === 'descartado'
        ? `<button class="btn ghost" data-action="status" data-status="pendiente" data-id="${esc(post.id)}">Recuperar</button>`
        : `
      <button class="btn primary" data-action="publish" data-id="${esc(post.id)}">${linkedinIcon()} Publicar</button>
      <button class="btn ghost" data-action="copy" data-id="${esc(post.id)}">Copiar</button>
      <button class="btn ghost" data-action="edit" data-id="${esc(post.id)}">Editar</button>
      ${status === 'pendiente'
        ? `<button class="btn ghost ok" data-action="status" data-status="aprobado" data-id="${esc(post.id)}">Aprobar</button>`
        : `<button class="btn ghost" data-action="status" data-status="pendiente" data-id="${esc(post.id)}">Quitar aprobación</button>`}
      <button class="btn ghost" data-action="mark-published" data-id="${esc(post.id)}">Ya lo publiqué</button>
      <button class="btn ghost danger" data-action="status" data-status="descartado" data-id="${esc(post.id)}">Descartar</button>`;

  return `
    <div class="post status-${status}" id="post-${esc(post.id)}">
      <div class="post-head">
        <h3>${esc(post.title)}</h3>
        <span class="badge badge-${status}">${STATUSES[status].label}${status === 'publicado' && st.publishedAt ? ` · ${esc(new Date(st.publishedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' }))}` : ''}</span>
      </div>
      ${meta ? `<div class="tags">${meta}</div>` : ''}
      ${body}
      ${editing ? '' : hashtags}
      ${post.imagen ? `<p class="image-hint">🖼️ ${esc(post.imagen)}</p>` : ''}
      <div class="post-foot">
        <span class="count ${over ? 'over' : ''}" data-count="${esc(post.id)}">${full.length.toLocaleString('es')} / ${LINKEDIN_MAX_CHARS.toLocaleString('es')}</span>
        <div class="actions">${actions}</div>
      </div>
    </div>`;
}

function linkedinIcon() {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>`;
}

function render() {
  renderStats();
  renderNextUp();
  renderFilters();
  renderWeeks();
}

// ---------- Acciones ----------

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function openPublishDialog(id) {
  ui.publishing = id;
  $('#publish-url').value = getPostState(id).url || '';
  $('#publish-dialog').showModal();
}

async function handleAction(btn) {
  const { action, id } = btn.dataset;
  const post = id && postsById.get(id);

  switch (action) {
    case 'publish': {
      // Abrir la pestaña antes del await para que el navegador no la bloquee.
      window.open(linkedInShareUrl(finalText(post)), '_blank', 'noopener');
      await copy(finalText(post));
      openPublishDialog(id);
      break;
    }
    case 'copy':
      toast((await copy(finalText(post))) ? 'Texto copiado ✓' : 'No se pudo copiar');
      break;
    case 'mark-published':
      openPublishDialog(id);
      break;
    case 'status':
      updatePost(id, { status: btn.dataset.status, ...(btn.dataset.status !== 'publicado' && { publishedAt: undefined }) });
      toast(`Marcado como ${STATUSES[btn.dataset.status].label.toLowerCase()}`);
      render();
      break;
    case 'edit':
      ui.editing.add(id);
      render();
      document.querySelector(`[data-editor="${CSS.escape(id)}"]`)?.focus();
      break;
    case 'cancel-edit':
      ui.editing.delete(id);
      render();
      break;
    case 'save': {
      const value = document.querySelector(`[data-editor="${CSS.escape(id)}"]`).value.replace(/\s+$/, '');
      updatePost(id, { text: value === post.text ? undefined : value });
      ui.editing.delete(id);
      toast('Cambios guardados');
      render();
      break;
    }
    case 'restore':
      updatePost(id, { text: undefined });
      ui.editing.delete(id);
      toast('Texto original restaurado');
      render();
      break;
    case 'expand':
      ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id);
      render();
      break;
    case 'toggle-week': {
      const w = btn.dataset.week;
      ui.collapsedWeeks.has(w) ? ui.collapsedWeeks.delete(w) : ui.collapsedWeeks.add(w);
      render();
      break;
    }
    case 'goto': {
      if (!matchesFilter(post)) ui.filter = 'todos';
      ui.collapsedWeeks.delete(post.week.id);
      render();
      const el = document.getElementById(`post-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('flash');
      setTimeout(() => el?.classList.remove('flash'), 1500);
      break;
    }
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    e.preventDefault();
    handleAction(btn);
    return;
  }
  const chip = e.target.closest('[data-filter]');
  if (chip) {
    ui.filter = chip.dataset.filter;
    render();
  }
});

document.addEventListener('input', (e) => {
  const id = e.target.dataset?.editor;
  if (!id) return;
  const post = postsById.get(id);
  const len = composePost(e.target.value, post.hashtags).length;
  const counter = document.querySelector(`[data-count="${CSS.escape(id)}"]`);
  counter.textContent = `${len.toLocaleString('es')} / ${LINKEDIN_MAX_CHARS.toLocaleString('es')}`;
  counter.classList.toggle('over', len > LINKEDIN_MAX_CHARS);
});

$('#search').addEventListener('input', (e) => {
  ui.query = e.target.value.trim().toLowerCase();
  renderWeeks();
});

$('#publish-dialog').addEventListener('close', () => {
  const id = ui.publishing;
  ui.publishing = null;
  if ($('#publish-dialog').returnValue !== 'confirm' || !id) return;
  const url = $('#publish-url').value.trim();
  updatePost(id, { status: 'publicado', publishedAt: new Date().toISOString(), url: url || undefined });
  toast('¡Publicado! 🎉');
  render();
});

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([exportState()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `posty-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    importState(await file.text());
    toast('Respaldo importado ✓');
    render();
  } catch (err) {
    toast(err.message || 'No se pudo importar');
  }
  e.target.value = '';
});

render();
