// My posts: los posts creados en Crear post, en tarjetas con su diseño (como Templates).
// Al abrir uno se muestra a pantalla completa en Crear post y al cerrarlo se vuelve aquí.

import { $, esc, toast, copy } from './ui.js';
import { composePost } from './parser.js';
import { normalizePost, mountPages, unmountPages, frameHtml, fitVisuals } from './visuals.js';
import { getCreated, openCreated, deleteCreated, onHistoryChange } from './create.js';

const FORMAT_LABELS = { carousel: 'Carrusel', card: 'Card', slide: 'Card única', custom: 'Plantilla propia' };
const ui = { query: '', format: 'todos' };

const root = () => $('#posts-root');
const visible = () => root() && !root().hidden;
const finalText = (p) => composePost(p.text || '', (p.hashtags || []).join(' '));

function matches(p) {
  if (ui.format !== 'todos' && p.format !== ui.format) return false;
  const q = ui.query.trim().toLowerCase();
  return !q || `${p.title || ''} ${p.text || ''}`.toLowerCase().includes(q);
}

function card(p) {
  const date = p.createdAt ? new Date(p.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const snippet = (p.text || '').replace(/\s+/g, ' ').trim();
  return `
    <article class="tpl-card post-card">
      <button class="tpl-preview post-card-preview" data-post-action="open" data-id="${esc(p.id)}" aria-label="Abrir ${esc(p.title || 'post')}">
        <div data-post-preview="${esc(p.id)}"></div>
      </button>
      <div class="tpl-body">
        <div class="tpl-title"><strong>${esc(p.title || 'Sin título')}</strong><span class="badge badge-pendiente">${esc(FORMAT_LABELS[p.format] || p.format)}</span></div>
        <p class="muted small">${esc(date)}</p>
        ${snippet ? `<p class="post-card-text">${esc(snippet)}</p>` : ''}
        <div class="tpl-actions">
          <button class="btn primary small" data-post-action="open" data-id="${esc(p.id)}">Abrir</button>
          <button class="btn ghost small" data-post-action="copy" data-id="${esc(p.id)}">Copiar texto</button>
          <button class="btn ghost small danger" data-post-action="delete" data-id="${esc(p.id)}">Borrar</button>
        </div>
      </div>
    </article>`;
}

function renderList() {
  const list = $('#posts-list');
  if (!list) return;
  unmountPages(list);
  const all = getCreated();
  const shown = all.filter(matches);
  list.innerHTML = !all.length
    ? `<div class="empty-state"><p>Todavía no has creado posts.</p><a class="btn primary" href="#/crear">+ Crear post</a></div>`
    : shown.length
      ? `<div class="tpl-grid posts-grid">${shown.map(card).join('')}</div>`
      : '<p class="muted">No hay posts que coincidan con la búsqueda.</p>';
  for (const el of list.querySelectorAll('[data-post-preview]')) {
    const post = all.find((p) => p.id === el.dataset.postPreview);
    if (!post) continue;
    try {
      const normalized = normalizePost(post);
      el.innerHTML = frameHtml(normalized);
      mountPages(el, normalized);
    } catch (err) {
      console.error(err);
      el.innerHTML = '<p class="muted small">Sin vista previa</p>';
    }
  }
}

export function renderPosts() {
  const el = root();
  const all = getCreated();
  const formats = [...new Set(all.map((p) => p.format))];
  if (!formats.includes(ui.format)) ui.format = 'todos';
  unmountPages(el);
  el.innerHTML = `
    <header class="page-head page-head-row">
      <div>
        <h1>My posts</h1>
        <p class="muted">Los posts que has creado, con su diseño. Ábrelos para editarlos, publicarlos o descargarlos.</p>
      </div>
      <div class="actions"><a class="btn primary small" href="#/crear">+ Crear post</a></div>
    </header>
    ${
      all.length
        ? `<div class="posts-toolbar">
             <input type="search" id="posts-search" placeholder="Buscar en tus posts…" value="${esc(ui.query)}" aria-label="Buscar en tus posts" />
             ${
               formats.length > 1
                 ? `<div class="mode-switch" role="tablist" aria-label="Formato">${['todos', ...formats]
                     .map((f) => `<button role="tab" class="chip ${ui.format === f ? 'active' : ''}" aria-selected="${ui.format === f}" data-post-action="format" data-format="${esc(f)}">${f === 'todos' ? `Todos (${all.length})` : esc(FORMAT_LABELS[f] || f)}</button>`)
                     .join('')}</div>`
                 : ''
             }
           </div>`
        : ''
    }
    <div id="posts-list"></div>`;
  renderList();
}

export function initPostsPage() {
  const el = root();
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-post-action]');
    if (!btn) return;
    e.preventDefault();
    const { postAction: action, id } = btn.dataset;
    const post = getCreated().find((p) => p.id === id);
    if (action === 'open') {
      if (!openCreated(id)) toast('Este post ya no existe');
    } else if (action === 'copy' && post) {
      toast((await copy(finalText(post))) ? 'Texto copiado ✓' : 'No se pudo copiar');
    } else if (action === 'delete' && post) {
      if (!window.confirm(`¿Borrar "${post.title || 'este post'}"? No se puede deshacer.`)) return;
      deleteCreated(id);
      toast('Post borrado');
    } else if (action === 'format') {
      ui.format = btn.dataset.format;
      renderPosts();
    }
  });
  el.addEventListener('input', (e) => {
    if (e.target.id !== 'posts-search') return;
    ui.query = e.target.value;
    renderList();
  });
  window.addEventListener('resize', () => {
    if (visible()) fitVisuals(el);
  });
  onHistoryChange(() => {
    if (visible()) renderPosts();
  });
}
