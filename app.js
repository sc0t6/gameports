const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const ago = t => {
  const h = Math.floor((Date.now() - t) / 36e5);
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const hash = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const THEMES = { normal: 'Normal', playstation: 'PlayStation', xbox: 'Xbox', nintendo: 'Nintendo' };
const TITLES = ['English', 'Math', 'Biology', 'Geography', 'Social', 'History', 'German']
  .map(s => `${s} Practice - ScotLearns`);
const VIEWS = { games: 'Search games', apps: 'Search apps', movies: 'Search movies' };

let data = null;   // catalog.json plus { added, error? } from loadCatalog()
let filter = 'all';
let shown = [];    // library cards on screen; buttons point into it by index
let tab = 'games'; // home screen tab
let rowItems = []; // home screen tiles; tiles point into it by index
let sel = 0;       // selected tile

const isNew = g => !!data && Date.now() - (data.added[g.id] || 0) < 7 * DAY;
const FILTERS = {
  all: ['All', () => true],
  play: ['Playable', g => g.play],
  repo: ['Repo only', g => !g.play],
  new: ['New', isNew],
};
const view = () => { const v = location.hash.slice(1); return v in VIEWS ? v : 'games'; };
// Unchecked built-in lists are the fallback when catalog.json can't load.
const list = v => (data && data[v]) || { apps: APPS, movies: MOVIES }[v] || [];
const recent = () => { try { return JSON.parse(store.get('ports-recent')) || []; } catch { return []; } };

// Every way of starting something goes through here.
function launch(g) {
  store.set('ports-recent', JSON.stringify([g.id, ...recent().filter(id => id !== g.id)].slice(0, 12)));
  if (g.tab) { open(g.play, '_blank', 'noopener'); return; }
  $('player-title').textContent = g.name;
  $('player-tab').href = g.play;
  $('frame').src = g.play;
  $('player').showModal();
}

/* ---------- Library (the Normal theme, and "Library" in the console themes) ---------- */

function card(g, i) {
  const label = view() === 'games' ? 'Play' : 'Open';
  // Sites that refuse to load inside the player (g.tab) open in a new tab instead.
  const play = g.play ? `<button class="primary" data-play="${i}"${g.tab ? ' title="Opens in a new tab"' : ''}>${label}</button>` : '';
  // Publish is also offered next to Play, since some Play links go dead.
  const publishable = ghParts(g.repo);
  return `<article class="card">
    <h3>${esc(g.name)}${isNew(g) ? '<span class="tag">new</span>' : ''}</h3>
    <p>${esc(g.note || host(g.play || g.repo))}</p>
    <div class="actions">
      ${play}
      ${publishable ? `<button${g.play ? '' : ' class="primary"'} data-publish="${i}">Publish</button>` : ''}
      ${g.repo ? `<a href="${esc(g.repo)}" target="_blank" rel="noopener">Repo</a>` : ''}
    </div>
  </article>`;
}

function render() {
  const v = view();
  const games = v === 'games';
  document.querySelectorAll('nav a').forEach(a =>
    a.dataset.view === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  $('search').placeholder = VIEWS[v];

  const items = list(v);
  $('filters').hidden = !games || !data;
  if (games && data) {
    $('filters').innerHTML = Object.entries(FILTERS).map(([k, [label, fn]]) =>
      `<button data-filter="${k}" aria-pressed="${k === filter}">${label}<small>${items.filter(fn).length}</small></button>`).join('');
  }

  const q = $('search').value.trim().toLowerCase();
  shown = items.filter(g => (!games || FILTERS[filter][1](g)) && g.name.toLowerCase().includes(q));
  $('grid').innerHTML = shown.length ? shown.map(card).join('')
    : items.length ? '<p class="message">Nothing matches.</p>' : '';
}

/* ---------- Console home screen ---------- */

const isHome = () => document.documentElement.dataset.mode === 'home';
const initials = name => name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean)
  .slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// Recently played first, then a different shuffle each day so the row stays fresh.
function rowFor(t) {
  const items = list(t).filter(g => g.play);
  const day = new Date().toDateString();
  const first = recent().map(id => items.find(g => g.id === id)).filter(Boolean);
  const rest = items.filter(g => !first.includes(g)).sort((a, b) => hash(day + a.id) - hash(day + b.id));
  return [...first, ...rest].slice(0, 30);
}

// Tiles without cover art get a flat colour block with initials.
const tile = (g, i) => `<button class="tile-g" data-i="${i}" aria-label="${esc(g.name)}" style="--h:${hash(g.id) % 360}">
  <span>${esc(initials(g.name))}</span>${g.img ? `<img src="${esc(g.img)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</button>`;

function renderHome() {
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  rowItems = rowFor(tab);
  $('row').innerHTML = rowItems.map(tile).join('') +
    `<button class="tile-g lib" data-act="library"><span>All ${tab}</span></button>`;
  select(Math.min(sel, Math.max(rowItems.length - 1, 0)));
}

function select(i) {
  sel = i;
  $('row').querySelectorAll('[data-i]').forEach(t => t.setAttribute('aria-current', +t.dataset.i === i));
  const g = rowItems[i];
  $('hero-title').textContent = g ? g.name : '';
  $('hero-meta').textContent = g ? g.note || host(g.play) : '';
  $('hero-play').textContent = tab === 'games' ? 'Play' : 'Open';
  $('art').hidden = !(g && g.img);
  if (g && g.img) $('art').src = g.img;
}

function setMode(mode) {
  document.documentElement.dataset.mode = mode;
  if (mode === 'home') {
    renderHome();
    const t = $('row').querySelector('[aria-current="true"]') || $('row').firstElementChild;
    if (t && !document.querySelector('dialog[open]')) t.focus();
  }
}

function act(name) {
  if (name === 'settings') return $('settings').showModal();
  if (name === 'random') {
    const items = list(tab).filter(g => g.play);
    if (items.length) launch(items[Math.floor(Math.random() * items.length)]);
    return;
  }
  // library / search: open the full list for the current tab
  setMode('library');
  location.hash = tab === 'games' ? '' : tab;
  render();
  if (name === 'search') $('search').focus();
}

// Arrow keys move inside a [data-nav] group (left/right) and between groups (up/down).
function navigate(e) {
  const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key];
  if (!move) return;
  const groups = [...$('home').querySelectorAll('[data-nav]')].filter(z => z.offsetParent)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const group = document.activeElement.closest('#home [data-nav]');
  const items = z => [...z.querySelectorAll('button, a')];
  e.preventDefault();
  if (!group) return setMode('home');
  const els = items(group);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const next = els[els.indexOf(document.activeElement) + move];
    if (next) next.focus();
    return;
  }
  const z = groups[groups.indexOf(group) + move];
  if (z) (z.querySelector('[aria-current="true"], [aria-selected="true"]') || items(z)[0]).focus();
}

/* ---------- Data ---------- */

function showStatus() {
  const n = data.games.length;
  const p = data.games.filter(g => g.play).length;
  const fresh = data.games.filter(isNew).length;
  $('status').textContent = `${n} games · ${p} playable${fresh ? ` · ${fresh} new` : ''} · updated ${ago(data.time)}${data.error ? ' · offline' : ''}`;
}

async function refresh() {
  $('status').textContent = 'Updating…';
  $('message').hidden = true;
  try {
    data = await loadCatalog();
    showStatus();
    if (data.error) {
      $('message').textContent = `Couldn't update (${data.error}). Showing the last saved list.`;
      $('message').hidden = false;
    }
  } catch (e) {
    $('status').textContent = 'Retry';
    $('message').textContent = `Couldn't load the game list (${e.message}). Click Retry.`;
    $('message').hidden = false;
  }
  render();
  renderHome();
}

// The 5 ways to host a repo that has no Play link.
function publish(g) {
  const { owner, repo, branch, path } = ghParts(g.repo);
  const base = `https://github.com/${owner}/${repo}`;
  const sub = path ? `${path}/` : '';
  const serve = `python3 -m http.server 8000${path ? ` -d "${path}"` : ''}`;
  const btn = (href, label, primary) =>
    `<a class="btn${primary ? ' primary' : ''}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`;

  const methods = [
    ['Instant preview', 'no account', `
      <p>Serves the files straight from GitHub through raw.githack. Good for small static games. Big files or games that need a build step may not load.</p>
      <div class="row">${btn(`https://raw.githack.com/${owner}/${repo}/${branch || 'HEAD'}/${sub}index.html`, 'Open preview', true)}</div>`],
    ['GitHub Pages', 'free, permanent', `
      <ol>
        <li>Fork the repo.</li>
        <li>In your fork open <b>Settings → Pages</b>. Source: <b>Deploy from a branch</b>, branch <code>${esc(branch || 'main')}</code>, folder <code>/ (root)</code>. Save.</li>
        <li>Wait about a minute, then open <code>https://YOUR-NAME.github.io/${esc(repo)}/${esc(sub)}</code></li>
        <li>Files missing? Add an empty file named <code>.nojekyll</code> to the fork.</li>
      </ol>
      <div class="row">${btn(`${base}/fork`, 'Fork on GitHub', true)}</div>`],
    ['Vercel', 'one click', `
      <p>Copies the ${path ? 'folder' : 'repo'} into your GitHub and deploys it. Open the link Vercel shows when it finishes.</p>
      <div class="row">${btn(`https://vercel.com/new/clone?repository-url=${encodeURIComponent(path ? `${base}/tree/${branch}/${path}` : base)}`, 'Deploy to Vercel', true)}</div>`],
    ['Netlify', 'one click', `
      <p>Copies the repo into your GitHub and deploys it.${path ? ` Then add <code>/${esc(sub)}</code> to the end of your new site's link.` : ''}</p>
      <div class="row">${btn(`https://app.netlify.com/start/deploy?repository=${encodeURIComponent(base)}`, 'Deploy to Netlify', true)}</div>`],
    ['Codespaces', 'runs anything', `
      <p>Opens the repo on a cloud computer. If the README says to build first, do that. Then run this in the terminal and click <b>Open in Browser</b>:</p>
      <p><code>${esc(serve)}</code></p>
      <div class="row">${btn(`https://codespaces.new/${owner}/${repo}`, 'Open Codespace', true)}<button class="btn" data-copy="${esc(serve)}">Copy command</button></div>`],
  ];

  $('publish-title').textContent = g.name;
  $('methods').innerHTML = methods.map(([title, note, body]) =>
    `<li><h3>${title}<em>${note}</em></h3>${body}</li>`).join('');
  $('publish').showModal();
}

/* ---------- Themes and settings ---------- */

function setTheme(name) {
  document.documentElement.dataset.theme = name;
  store.set('ports-theme', name);
  document.querySelectorAll('[data-pick]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pick === name));
  setMode(name === 'normal' ? 'library' : 'home');
}

// Each picker tile carries data-theme too, so its mini preview uses that theme's layout and accent.
document.querySelectorAll('[data-themes]').forEach(el => {
  el.innerHTML = Object.entries(THEMES).map(([k, label]) =>
    `<button class="tile" data-theme="${k}" data-pick="${k}" aria-pressed="false"><i class="mini">${'<b></b>'.repeat(6)}</i>${label}</button>`).join('');
});

$('tab-title').innerHTML = '<option value="">Ports (default)</option>' + TITLES.map(t => `<option>${t}</option>`).join('');
$('tab-title').value = TITLES.includes(store.get('ports-title')) ? store.get('ports-title') : '';
document.title = $('tab-title').value || 'Ports';
$('tab-title').addEventListener('change', e => {
  store.set('ports-title', e.target.value);
  document.title = e.target.value || 'Ports';
});

/* ---------- Events ---------- */

document.addEventListener('click', e => {
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    if (pick.closest('#boot')) $('boot').close();
    setTheme(pick.dataset.pick);
  }
  const a = e.target.closest('#home [data-act]');
  if (a) act(a.dataset.act);
});
$('grid').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if ('play' in b.dataset) launch(shown[b.dataset.play]);
  if ('publish' in b.dataset) publish(shown[b.dataset.publish]);
});
$('filters').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { filter = b.dataset.filter; render(); }
});
$('methods').addEventListener('click', e => {
  const b = e.target.closest('[data-copy]');
  if (b) navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = 'Copied'; });
});

// Focusing a tile selects it; a click on the already selected tile (or Enter) starts it.
let armed = false;
$('row').addEventListener('focusin', e => { const t = e.target.closest('[data-i]'); if (t) select(+t.dataset.i); });
$('row').addEventListener('pointerdown', e => { const t = e.target.closest('[data-i]'); armed = !!t && +t.dataset.i === sel; });
$('row').addEventListener('click', e => {
  const t = e.target.closest('[data-i]');
  if (t && (e.detail === 0 || armed)) launch(rowItems[t.dataset.i]);
});
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  sel = 0;
  renderHome();
}));
$('hero-play').addEventListener('click', () => rowItems[sel] && launch(rowItems[sel]));
$('home-open').addEventListener('click', () => setMode('home'));

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || e.target.matches('input, select')) return;
  if (isHome()) navigate(e);
  else if (e.key === 'Escape' && document.documentElement.dataset.theme !== 'normal') setMode('home');
});

const tick = () => { $('clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
tick();
setInterval(tick, 15e3);

$('search').addEventListener('input', render);
$('status').addEventListener('click', () => refresh());
$('settings-open').addEventListener('click', () => $('settings').showModal());
$('settings-close').addEventListener('click', () => $('settings').close());
// Esc can't skip the loading screen, only the theme choice.
$('boot').addEventListener('cancel', e => { if ($('boot-pick').hidden) e.preventDefault(); });
$('boot').addEventListener('close', () => isHome() && setMode('home'));
$('player-close').addEventListener('click', () => $('player').close());
$('player-full').addEventListener('click', () => $('frame').requestFullscreen());
$('player').addEventListener('close', () => { $('frame').src = 'about:blank'; });
$('publish-close').addEventListener('click', () => $('publish').close());
addEventListener('hashchange', () => { $('search').value = ''; render(); });
// Tabs left open still pick up the daily update.
setInterval(() => data && Date.now() - data.time >= DAY && refresh(), 36e5);

setTheme(THEMES[store.get('ports-theme')] ? store.get('ports-theme') : 'normal');
render();
$('boot').showModal();
refresh().then(() => {
  $('boot-loading').hidden = true;
  $('boot-pick').hidden = false;
  $('boot').querySelector('[aria-pressed="true"]').focus();
});
