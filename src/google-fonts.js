// Todas las tipografías de Google Fonts. La lista (familia, categoría y pesos) está en
// google-fonts.json, generada desde el paquete google-font-metadata; se carga solo al abrirla.
//
// Cada familia elegida se guarda en el kit (kit.googleFonts) y su CSS se descarga de
// fonts.googleapis.com y se inserta como <style>: así la exportación a PNG/PDF la incluye.
//
// En cualquier <select> de tipografías, la opción GOOGLE_OPTION abre el buscador; al elegir una
// familia, el select la toma y dispara sus eventos normales (cada página los maneja como siempre).

import { esc, toast } from './ui.js';

export const GOOGLE_VALUE = '__google_fonts__';
export const GOOGLE_OPTION = `<option value="${GOOGLE_VALUE}">＋ Más tipografías de Google…</option>`;

const CATEGORIES = { all: 'Todas', s: 'Sans serif', e: 'Serif', d: 'Display', h: 'Manuscrita', m: 'Monoespaciada' };
const POPULAR = ['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'Lato', 'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Space Grotesk', 'Work Sans', 'Raleway', 'Nunito', 'Outfit', 'Sora', 'Playfair Display', 'Merriweather', 'Lora', 'DM Serif Display', 'Fraunces', 'Libre Baskerville', 'Bebas Neue', 'Oswald', 'Anton', 'Archivo Black', 'Caveat', 'JetBrains Mono', 'IBM Plex Mono'];
const PAGE = 60;

let catalog;
export async function googleCatalog() {
  catalog ??= import('./google-fonts.json').then((m) => m.default);
  return catalog;
}

// URL del CSS de Google Fonts con todos los pesos (normal) de la familia.
export function cssUrl(family, weights) {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${weights}&display=swap`;
}

const loaded = new Map();

export function loadGoogleFont(family) {
  if (loaded.has(family)) return loaded.get(family);
  const promise = (async () => {
    const entry = (await googleCatalog()).find((f) => f[0] === family);
    if (!entry) return false;
    const res = await fetch(cssUrl(family, entry[2]));
    if (!res.ok) throw new Error(`Google Fonts respondió ${res.status}`);
    const style = document.createElement('style');
    style.dataset.googleFont = family;
    style.textContent = await res.text();
    document.head.appendChild(style);
    await Promise.allSettled([400, 700].map((w) => document.fonts.load(`${w} 32px "${family}"`)));
    return true;
  })();
  promise.catch(() => loaded.delete(family));
  loaded.set(family, promise);
  return promise;
}

export async function loadGoogleFonts(families = []) {
  // No se espera más de unos segundos: sin conexión, Posty sigue con las fuentes de respaldo.
  const all = Promise.allSettled(families.map(loadGoogleFont));
  await Promise.race([all, new Promise((r) => setTimeout(r, 4000))]);
}

// Solo las letras del nombre, para pintar cada fila del buscador con su tipografía sin descargarla
// entera. Se registra con un alias ("gfp-…") para no tocar fuentes del sistema con el mismo nombre
// (por ejemplo, Roboto en la interfaz de Posty).
const previewed = new Set();
const previewName = (family) => `gfp-${family}`;
function previewFont(family) {
  if (previewed.has(family)) return;
  previewed.add(family);
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&text=${encodeURIComponent(family)}&display=swap`;
  fetch(url)
    .then((r) => (r.ok ? r.text() : ''))
    .then((css) => {
      if (!css) return;
      const style = document.createElement('style');
      style.dataset.googleFontPreview = family;
      style.textContent = css.replace(/font-family:\s*(['"])[^'"]*\1/g, `font-family: '${previewName(family).replace(/'/g, '')}'`);
      document.head.appendChild(style);
    })
    .catch(() => previewed.delete(family));
}

// ---------- Buscador ----------

const ui = { query: '', cat: 'all', limit: PAGE, onPick: null, el: null };

function results(list) {
  const q = ui.query.trim().toLowerCase();
  let out = list.filter((f) => (ui.cat === 'all' || f[1] === ui.cat) && (!q || f[0].toLowerCase().includes(q)));
  if (!q) {
    // Sin búsqueda: primero las más usadas.
    const rank = (f) => {
      const i = POPULAR.indexOf(f[0]);
      return i === -1 ? POPULAR.length : i;
    };
    out = [...out].sort((a, b) => rank(a) - rank(b));
  } else {
    // Las que empiezan por lo buscado, antes.
    out = [...out].sort((a, b) => Number(!a[0].toLowerCase().startsWith(q)) - Number(!b[0].toLowerCase().startsWith(q)));
  }
  return out;
}

async function renderList() {
  const list = await googleCatalog();
  const box = ui.el?.querySelector('.gf-list');
  if (!box) return;
  const found = results(list);
  const shown = found.slice(0, ui.limit);
  shown.forEach((f) => previewFont(f[0]));
  box.innerHTML = shown.length
    ? `${shown
        .map(
          (f) => `<li><button type="button" class="gf-item" data-gf-pick="${esc(f[0])}">
            <span class="gf-name" style="font-family:'${esc(previewName(f[0]).replace(/'/g, ''))}', system-ui, sans-serif">${esc(f[0])}</span>
            <span class="muted small">${esc(CATEGORIES[f[1]])}</span>
          </button></li>`,
        )
        .join('')}
       ${found.length > shown.length ? `<li class="gf-more"><button type="button" class="btn ghost small" data-gf-more>Ver más (${(found.length - shown.length).toLocaleString('es')})</button></li>` : ''}`
    : '<li class="muted gf-empty">No hay tipografías con ese nombre.</li>';
  ui.el.querySelector('.gf-count').textContent = `${found.length.toLocaleString('es')} tipografías`;
}

function close() {
  ui.el?.remove();
  ui.el = null;
  ui.onPick = null;
  document.removeEventListener('keydown', onKey, true);
}

function onKey(e) {
  if (e.key === 'Escape' && ui.el) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

export function openGoogleFonts(onPick) {
  close();
  Object.assign(ui, { query: '', cat: 'all', limit: PAGE, onPick });
  const el = document.createElement('div');
  el.className = 'modal-backdrop gf-modal';
  el.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Tipografías de Google">
      <div class="modal-head">
        <strong>Tipografías de Google</strong>
        <button type="button" class="icon-btn" data-gf-close aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body">
        <input type="search" class="gf-search" placeholder="Buscar: Inter, Playfair, mono…" aria-label="Buscar tipografía" />
        <div class="gf-cats" role="group" aria-label="Categoría">${Object.entries(CATEGORIES)
          .map(([k, v]) => `<button type="button" class="chip ${k === 'all' ? 'active' : ''}" data-gf-cat="${k}">${v}</button>`)
          .join('')}</div>
        <p class="muted small gf-count"></p>
        <ul class="gf-list"><li class="muted gf-empty">Cargando…</li></ul>
      </div>
    </div>`;
  document.body.appendChild(el);
  ui.el = el;
  document.addEventListener('keydown', onKey, true);
  el.addEventListener('click', async (e) => {
    if (e.target === el || e.target.closest('[data-gf-close]')) return close();
    const cat = e.target.closest('[data-gf-cat]');
    if (cat) {
      ui.cat = cat.dataset.gfCat;
      ui.limit = PAGE;
      el.querySelectorAll('[data-gf-cat]').forEach((b) => b.classList.toggle('active', b === cat));
      return renderList();
    }
    if (e.target.closest('[data-gf-more]')) {
      ui.limit += PAGE * 2;
      return renderList();
    }
    const pick = e.target.closest('[data-gf-pick]');
    if (pick) {
      const family = pick.dataset.gfPick;
      const cb = ui.onPick;
      pick.disabled = true;
      try {
        await loadGoogleFont(family);
      } catch (err) {
        console.error(err);
        toast('No se pudo descargar la tipografía de Google. Revisa tu conexión.');
        pick.disabled = false;
        return;
      }
      close();
      cb?.(family);
    }
  });
  el.querySelector('.gf-search').addEventListener('input', (e) => {
    ui.query = e.target.value;
    ui.limit = PAGE;
    renderList();
  });
  el.querySelector('.gf-search').focus();
  renderList();
}

// La opción "Más tipografías de Google" de cualquier select: se intercepta antes que los
// manejadores de la página, se abre el buscador y, al elegir, el select toma la familia.
export function initGoogleFontSelects({ onAdd }) {
  const intercept = (e) => {
    const select = e.target;
    if (select?.tagName !== 'SELECT' || select.value !== GOOGLE_VALUE) return;
    e.stopImmediatePropagation();
    if (e.type !== 'change') return;
    const previous = [...select.options].find((o) => o.defaultSelected && o.value !== GOOGLE_VALUE);
    select.value = previous ? previous.value : select.options[0].value;
    openGoogleFonts((family) => {
      onAdd(family);
      if (!select.isConnected) return;
      if (![...select.options].some((o) => o.value === family)) {
        select.insertBefore(new Option(family, family), select.querySelector(`option[value="${GOOGLE_VALUE}"]`));
      }
      select.value = family;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  document.addEventListener('input', intercept, true);
  document.addEventListener('change', intercept, true);
}
