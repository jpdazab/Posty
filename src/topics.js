// Temas del AI Digest: cada cuenta elige de qué quiere que traten sus propuestas semanales.
// Se guardan en la cuenta y la rutina de Claude los lee con GET /api/topics antes de preparar la semana.

import { $, esc, toast } from './ui.js';
import { getBackend } from './backend.js';
import { normalizeSettings, TOPIC_SUGGESTIONS, MAX_TOPICS } from './topics-format.js';

let saved = normalizeSettings(null);
const ui = { editing: false, draft: null, saving: false };

const clone = (v) => JSON.parse(JSON.stringify(v));

export async function initTopics() {
  saved = normalizeSettings(await getBackend().loadDigestSettings());
}

export function getTopics() {
  return saved;
}

function renderSummary() {
  return `
    <div class="topics-card">
      <div class="topics-head">
        <div>
          <h2>Tus temas</h2>
          <p class="muted small">${saved.postsPerWeek} ${saved.postsPerWeek === 1 ? 'post' : 'posts'} por semana${saved.audience ? ` · Para ${esc(saved.audience)}` : ''}</p>
        </div>
        <button class="btn ghost small" data-topics-action="edit">Editar temas</button>
      </div>
      <div class="topic-chips">${saved.topics.map((t) => `<span class="topic-chip" title="${esc(t.note)}">${esc(t.name)}</span>`).join('')}</div>
    </div>`;
}

function renderEditor() {
  const d = ui.draft;
  const chosen = new Set(d.topics.map((t) => t.name.toLowerCase()));
  const suggestions = TOPIC_SUGGESTIONS.filter((s) => !chosen.has(s.toLowerCase()));
  const full = d.topics.length >= MAX_TOPICS;
  return `
    <form class="topics-card topics-editor" id="topics-form" novalidate>
      <div class="topics-head">
        <div>
          <h2>${saved.topics.length ? 'Editar tus temas' : 'Elige los temas de tu digest'}</h2>
          <p class="muted small">Tu rutina semanal de Claude los lee antes de preparar las propuestas de cada semana.</p>
        </div>
      </div>

      <div class="topic-rows">
        ${
          d.topics.length
            ? d.topics
                .map(
                  (t, i) => `
          <div class="topic-row">
            <input type="text" data-topic="${i}.name" value="${esc(t.name)}" maxlength="60" aria-label="Tema ${i + 1}" />
            <input type="text" data-topic="${i}.note" value="${esc(t.note)}" maxlength="200" placeholder="Enfoque (opcional): por ejemplo, equipos remotos" aria-label="Enfoque del tema ${i + 1}" />
            <button type="button" class="icon-btn" data-topics-action="remove" data-index="${i}" aria-label="Quitar ${esc(t.name)}" title="Quitar">×</button>
          </div>`,
                )
                .join('')
            : '<p class="muted small">Aún no hay temas. Añade al menos uno.</p>'
        }
      </div>

      ${
        full
          ? `<p class="muted small">Máximo ${MAX_TOPICS} temas.</p>`
          : `<div class="topic-add">
               <input type="text" id="topic-new" maxlength="60" placeholder="Escribe un tema y pulsa Enter" />
               <button type="button" class="btn ghost small" data-topics-action="add">Añadir</button>
             </div>
             ${suggestions.length ? `<div class="suggestions">${suggestions.map((s) => `<button type="button" class="chip" data-topics-action="suggest" data-name="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>` : ''}`
      }

      <div class="topics-fields">
        <label class="ed-field"><span>Posts por semana</span>
          <select data-setting="postsPerWeek">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${d.postsPerWeek === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
        <label class="ed-field"><span>¿Para quién escribes?</span>
          <input type="text" data-setting="audience" value="${esc(d.audience)}" maxlength="300" placeholder="Por ejemplo: diseñadores de producto y managers" />
        </label>
      </div>
      <label class="ed-field"><span>Indicaciones para Claude (opcional)</span>
        <textarea data-setting="notes" rows="2" maxlength="1000" placeholder="Tono, ejemplos que te gustan, temas a evitar…">${esc(d.notes)}</textarea>
      </label>

      <div class="actions start">
        <button class="btn primary" type="submit" ${ui.saving ? 'disabled' : ''}>${ui.saving ? 'Guardando…' : 'Guardar temas'}</button>
        ${saved.topics.length ? '<button type="button" class="btn ghost" data-topics-action="cancel">Cancelar</button>' : ''}
      </div>
      ${getBackend().mode === 'cloud' ? '<p class="muted small">Para que tu rutina use estos temas, copia sus instrucciones en <a href="#/cuenta">Cuenta → Rutina semanal</a>.</p>' : ''}
    </form>`;
}

export function renderTopics() {
  const root = $('#topics');
  if (!root) return;
  if (!saved.topics.length && !ui.editing) {
    ui.editing = true;
    ui.draft = clone(saved);
  }
  root.innerHTML = ui.editing ? renderEditor() : renderSummary();
}

function addTopic(name) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return;
  if (ui.draft.topics.some((t) => t.name.toLowerCase() === clean.toLowerCase())) {
    toast('Ese tema ya está en la lista');
    return;
  }
  if (ui.draft.topics.length >= MAX_TOPICS) return;
  ui.draft.topics.push({ name: clean, note: '' });
  renderTopics();
  $('#topic-new')?.focus();
}

async function save() {
  // Un tema escrito y sin añadir también cuenta.
  const pending = $('#topic-new')?.value.trim();
  if (pending) ui.draft.topics.push({ name: pending, note: '' });
  const next = normalizeSettings(ui.draft);
  if (!next.topics.length) {
    toast('Añade al menos un tema');
    return;
  }
  ui.saving = true;
  renderTopics();
  try {
    await getBackend().saveDigestSettings(next);
    saved = next;
    ui.editing = false;
    ui.draft = null;
    toast('Temas guardados');
  } catch (err) {
    console.error(err);
    toast('No se pudieron guardar los temas. Revisa tu conexión.');
  }
  ui.saving = false;
  renderTopics();
}

export function initTopicsPanel() {
  const root = $('#topics');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-topics-action]');
    if (!btn) return;
    e.preventDefault();
    switch (btn.dataset.topicsAction) {
      case 'edit':
        ui.editing = true;
        ui.draft = clone(saved);
        renderTopics();
        break;
      case 'cancel':
        ui.editing = false;
        ui.draft = null;
        renderTopics();
        break;
      case 'add':
        addTopic($('#topic-new').value);
        break;
      case 'suggest':
        addTopic(btn.dataset.name);
        break;
      case 'remove':
        ui.draft.topics.splice(Number(btn.dataset.index), 1);
        renderTopics();
        break;
    }
  });
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (!ui.draft) return;
    if (el.dataset.topic) {
      const [i, key] = el.dataset.topic.split('.');
      ui.draft.topics[Number(i)][key] = el.value;
    } else if (el.dataset.setting) {
      ui.draft[el.dataset.setting] = el.dataset.setting === 'postsPerWeek' ? Number(el.value) : el.value;
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.id === 'topic-new' && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      addTopic(e.target.value);
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'topics-form') return;
    e.preventDefault();
    save();
  });
}
