const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const ago = t => {
  const h = Math.floor((Date.now() - t) / 36e5);
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

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
let shown = [];    // cards currently on screen; buttons point into it by index

const isNew = g => !!data && Date.now() - (data.added[g.id] || 0) < 7 * DAY;
const FILTERS = {
  all: ['All', () => true],
  play: ['Playable', g => g.play],
  repo: ['Repo only', g => !g.play],
  new: ['New', isNew],
};
const view = () => { const v = location.hash.slice(1); return v in VIEWS ? v : 'games'; };

function card(g, i) {
  const label = view() === 'games' ? 'Play' : 'Open';
  // Sites that refuse to load inside the player (g.tab) open in a new tab instead.
  const play = !g.play ? ''
    : g.tab ? `<a class="primary" href="${esc(g.play)}" target="_blank" rel="noopener" title="Opens in a new tab">${label}</a>`
    : `<button class="primary" data-play="${i}">${label}</button>`;
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

  // Unchecked built-in lists are the fallback when catalog.json can't load.
  const items = (data && data[v]) || { apps: APPS, movies: MOVIES }[v] || [];
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
}

function play(name, url) {
  $('player-title').textContent = name;
  $('player-tab').href = url;
  $('frame').src = url;
  $('player').showModal();
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

$('grid').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if ('play' in b.dataset) { const g = shown[b.dataset.play]; play(g.name, g.play); }
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
function setTheme(name) {
  document.documentElement.dataset.theme = name;
  store.set('ports-theme', name);
  document.querySelectorAll('[data-pick]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pick === name));
}

// Each tile carries data-theme too, so its swatch shows that theme's accent.
document.querySelectorAll('[data-themes]').forEach(el => {
  el.innerHTML = Object.entries(THEMES).map(([k, label]) =>
    `<button class="tile" data-theme="${k}" data-pick="${k}" aria-pressed="false"><i></i>${label}</button>`).join('');
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  setTheme(b.dataset.pick);
  if (b.closest('#boot')) $('boot').close();
});

$('tab-title').innerHTML = '<option value="">Ports (default)</option>' + TITLES.map(t => `<option>${t}</option>`).join('');
$('tab-title').value = TITLES.includes(store.get('ports-title')) ? store.get('ports-title') : '';
document.title = $('tab-title').value || 'Ports';
$('tab-title').addEventListener('change', e => {
  store.set('ports-title', e.target.value);
  document.title = e.target.value || 'Ports';
});

$('search').addEventListener('input', render);
$('status').addEventListener('click', () => refresh());
$('settings-open').addEventListener('click', () => $('settings').showModal());
$('settings-close').addEventListener('click', () => $('settings').close());
// Esc can't skip the loading screen, only the theme choice.
$('boot').addEventListener('cancel', e => { if ($('boot-pick').hidden) e.preventDefault(); });
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
