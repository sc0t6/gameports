const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const hash = s => [...String(s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
const DAY = 864e5;
const ago = t => { const h = Math.floor((Date.now() - t) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const DATA = window.GP_DATA;
const THEMES = {
  normal: { label: 'Normal', tag: 'Store-style library', color: '#0b0d12' },
  playstation: { label: 'PlayStation', tag: 'Console dashboard', color: '#04070d' },
  xbox: { label: 'Xbox', tag: 'Wide banner home', color: '#050803' },
  nintendo: { label: 'Nintendo', tag: 'Glowing tile home', color: '#0a0508' },
};
const TITLES = ['English', 'Math', 'Biology', 'Geography', 'Social', 'History', 'German'].map(s => `${s} Practice - ScotLearns`);
const VIEWS = { games: 'Search games…', apps: 'Search apps…', movies: 'Search movies…' };

let filter = 'all', sort = 'name', tab = 'games', sel = 0;
let shown = [], rowItems = [], detail = null, playerGame = null;
let favs = new Set(), recentIds = [];
try { favs = new Set(JSON.parse(store.get('gp-favs')) || []); } catch {}
try { recentIds = JSON.parse(store.get('gp-recent')) || []; } catch {}
const list = v => DATA[v] || [];
const view = () => { const v = location.hash.slice(1); return v in VIEWS ? v : 'games'; };
const isHome = () => document.documentElement.dataset.mode === 'home';
const playable = v => list(v).filter(g => g.play).length;

/* ---------- sound ---------- */
let soundOn = store.get('gp-sound') !== '0';
let AC = null;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function blip(f, d, type = 'sine', g = .035, to) {
  if (!soundOn) return;
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), gn = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime);
  if (to) o.frequency.exponentialRampToValueAtTime(to, c.currentTime + d);
  gn.gain.setValueAtTime(g, c.currentTime);
  gn.gain.exponentialRampToValueAtTime(.0001, c.currentTime + d);
  o.connect(gn).connect(c.destination);
  o.start(); o.stop(c.currentTime + d);
}
const SFX = {
  move: () => blip(540, .05, 'sine', .02),
  select: () => blip(440, .1, 'sine', .04, 660),
  back: () => blip(320, .08, 'sine', .03, 230),
  open: () => blip(520, .12, 'triangle', .04, 780),
  fav: () => blip(700, .09, 'sine', .035, 940),
  toggle: () => blip(620, .05, 'square', .015),
};
function paintSound() {
  document.querySelectorAll('[data-sound]').forEach(b => {
    b.setAttribute('aria-pressed', String(!soundOn));
    b.setAttribute('aria-label', soundOn ? 'Mute sounds' : 'Unmute sounds');
    b.innerHTML = `<svg><use href="#${soundOn ? 'i-vol' : 'i-vol-x'}"/></svg>`;
  });
}
function toggleSound() {
  soundOn = !soundOn;
  store.set('gp-sound', soundOn ? '1' : '0');
  paintSound();
  if (soundOn) SFX.toggle();
  toast(soundOn ? 'Sounds on' : 'Sounds muted', soundOn ? 'i-vol' : 'i-vol-x');
}

/* ---------- toasts ---------- */
function toast(msg, icon = 'i-check') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<svg><use href="#${icon}"/></svg><span>${esc(msg)}</span>`;
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  if (box.showPopover) { try { if (box.matches(':popover-open')) box.hidePopover(); box.showPopover(); } catch {} }
  setTimeout(() => { el.remove(); if (!box.children.length && box.hidePopover) { try { box.hidePopover(); } catch {} } }, 2400);
}

/* ---------- covers ---------- */
const initials = name => name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const hue = g => hash(g.id) % 360;
let coversOn = store.get('gp-covers') !== '0';
// Remote art is progressive enhancement: if a blocker or the network kills it, the procedural cover stays.
function artHTML(g) {
  return `<span class="pcover" style="--h:${hue(g)}">${esc(initials(g.name))}</span>` +
    (coversOn && g.img ? `<img class="cover-img" src="${esc(g.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('on')" onerror="this.remove()">` : '');
}

/* ---------- favorites & recent ---------- */
function paintFavs(id) {
  const on = favs.has(id);
  document.querySelectorAll(`[data-favid="${CSS.escape(id)}"]`).forEach(b => b.setAttribute('aria-pressed', String(on)));
  if (rowItems[sel] && rowItems[sel].id === id) $('hero-fav').setAttribute('aria-pressed', String(on));
}
function toggleFav(g) {
  if (favs.has(g.id)) { favs.delete(g.id); toast(`Removed ${g.name} from favorites`, 'i-star'); }
  else { favs.add(g.id); toast(`Added ${g.name} to favorites`, 'i-star'); SFX.fav(); }
  store.set('gp-favs', JSON.stringify([...favs]));
  paintFavs(g.id);
  if (filter === 'favs') render();
}
function pushRecent(id) {
  recentIds = [id, ...recentIds.filter(x => x !== id)].slice(0, 12);
  store.set('gp-recent', JSON.stringify(recentIds));
}

/* ---------- player ---------- */
let loaded = false, loadTimer = null;
function launch(g) {
  pushRecent(g.id);
  SFX.select();
  if (g.tab) { open(g.play, '_blank', 'noopener'); return; }
  playerGame = g;
  loaded = false;
  $('player-title').textContent = g.name;
  $('player-host').textContent = host(g.play);
  $('player-tab').href = g.play;
  $('fb-tab').href = g.play;
  $('fb-publish').hidden = !ghParts(g.repo);
  $('load-name').textContent = g.name;
  $('player-loading').classList.remove('done');
  $('player-fallback').hidden = true;
  $('frame').src = g.play;
  $('player').showModal();
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { if (!loaded) $('player-fallback').hidden = false; }, 9000);
}
function reloadFrame() {
  if (!playerGame) return;
  loaded = false;
  $('player-loading').classList.remove('done');
  $('player-fallback').hidden = true;
  $('frame').src = playerGame.play;
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => { if (!loaded) $('player-fallback').hidden = false; }, 9000);
}
$('frame').addEventListener('load', () => {
  if (!$('player').open || $('frame').src === 'about:blank') return;
  loaded = true;
  clearTimeout(loadTimer);
  $('player-loading').classList.add('done');
  $('player-fallback').hidden = true;
});
$('player').addEventListener('close', () => { clearTimeout(loadTimer); $('frame').src = 'about:blank'; playerGame = null; });
$('player-close').addEventListener('click', () => { SFX.back(); $('player').close(); });
$('player-full').addEventListener('click', () => $('frame').requestFullscreen().catch(() => toast('Fullscreen unavailable', 'i-info')));
$('player-reload').addEventListener('click', reloadFrame);
$('player-help').addEventListener('click', () => { $('player-fallback').hidden = !$('player-fallback').hidden; });
$('fb-reload').addEventListener('click', reloadFrame);
$('fb-publish').addEventListener('click', () => playerGame && publish(playerGame));

/* ---------- library ---------- */
const FILTERS = {
  all: ['All', () => true],
  play: ['Playable', g => g.play],
  repo: ['Repo only', g => !g.play],
  favs: ['Favorites', g => favs.has(g.id)],
  recent: ['Recent', g => recentIds.includes(g.id)],
};
function go(g) {
  if (g.play) launch(g);
  else if (ghParts(g.repo)) publish(g);
  else open(g.repo, '_blank', 'noopener');
}
function card(g, i) {
  const action = g.play ? (view() === 'games' ? 'Play' : 'Open') : ghParts(g.repo) ? 'Publish' : 'Open repo for';
  const badge = g.play ? (g.tab ? '<em class="badge tab">New tab</em>' : '') : '<em class="badge repo">Repo</em>';
  return `<article class="gcard" style="--d:${Math.min(i, 24) * .03}s">
    <button class="cover" data-go="${i}" style="--h:${hue(g)}" aria-label="${action} ${esc(g.name)}">${artHTML(g)}${badge}</button>
    <button class="fav" data-fav="${i}" data-favid="${esc(g.id)}" aria-pressed="${favs.has(g.id)}" aria-label="Favorite ${esc(g.name)}"><svg><use href="#i-star"/></svg></button>
    <div class="gmeta">
      <div><h3>${esc(g.name)}</h3><p>${esc(g.note || host(g.play || g.repo))}</p></div>
      <button class="more iconbtn" data-info="${i}" aria-label="Details for ${esc(g.name)}"><svg><use href="#i-info"/></svg></button>
    </div>
  </article>`;
}
function render() {
  const v = view(), games = v === 'games';
  document.querySelectorAll('.lib-nav a').forEach(a =>
    a.dataset.view === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  $('search').placeholder = VIEWS[v];
  $('grid').style.setProperty('--ca', games ? '3 / 4' : v === 'apps' ? '1' : '16 / 10');
  const items = list(v);
  const keys = games ? Object.keys(FILTERS) : ['all', 'favs', 'recent'];
  if (!keys.includes(filter)) filter = 'all';
  $('filters').innerHTML = keys.map(k =>
    `<button data-filter="${k}" aria-pressed="${k === filter}">${FILTERS[k][0]}<small>${items.filter(FILTERS[k][1]).length}</small></button>`).join('');
  const q = $('search').value.trim().toLowerCase();
  shown = items.filter(g => FILTERS[filter][1](g) && g.name.toLowerCase().includes(q));
  if (sort === 'recent') shown.sort((a, b) => (recentIds.indexOf(b.id) - recentIds.indexOf(a.id)) || a.name.localeCompare(b.name));
  if (sort === 'play') shown.sort((a, b) => !a.play - !b.play || a.name.localeCompare(b.name));
  $('count').textContent = `${shown.length} of ${items.length}`;
  $('grid').innerHTML = shown.length ? shown.map(card).join('')
    : `<p class="message">${items.length ? 'Nothing matches. Try another search or filter.' : 'Nothing here yet.'}</p>`;
}
function details(g) {
  detail = g;
  SFX.open();
  const label = view() === 'games' ? 'Play' : 'Open';
  const link = (href, text) => `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`;
  $('details-art').innerHTML = artHTML(g);
  $('details-title').textContent = g.name;
  $('details-meta').textContent = [g.note || host(g.play || g.repo), g.tab && 'opens in a new tab', !g.play && 'repo only — publish it yourself'].filter(Boolean).join(' · ');
  $('details-actions').innerHTML = [
    g.play && `<button class="btn primary" data-d="play"><svg class="fill"><use href="#i-play"/></svg>${label}</button>`,
    g.play && !g.tab && link(g.play, 'New tab'),
    ghParts(g.repo) && `<button class="btn${g.play ? '' : ' primary'}" data-d="publish"><svg><use href="#i-zip"/></svg>Publish</button>`,
    g.repo && link(g.repo, 'Repo'),
    `<button class="btn" data-d="fav" data-favid="${esc(g.id)}" aria-pressed="${favs.has(g.id)}"><svg><use href="#i-star"/></svg>Favorite</button>`,
  ].filter(Boolean).join('');
  $('details').showModal();
}

/* ---------- publish ---------- */
function ghParts(url) {
  const m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)\/?(.*?))?\/?(?:[?#].*)?$/.exec(url || '');
  return m && { owner: m[1], repo: m[2], branch: m[3] || '', path: (m[4] || '').replace(/\/$/, '') };
}
function publish(g) {
  const { owner, repo, branch, path } = ghParts(g.repo);
  const base = `https://github.com/${owner}/${repo}`;
  const sub = path ? `${path}/` : '';
  const serve = `python3 -m http.server 8000${path ? ` -d "${path}"` : ''}`;
  const btn = (href, label, primary) => `<a class="btn${primary ? ' primary' : ''}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`;
  const methods = [
    ['Instant preview', 'no account', `
      <p>Serves the files straight from GitHub through raw.githack. Good for small static games. Big files or games that need a build step may not load.</p>
      <div class="row-c">${btn(`https://raw.githack.com/${owner}/${repo}/${branch || 'HEAD'}/${sub}index.html`, 'Open preview', true)}</div>`],
    ['GitHub Pages', 'free, permanent', `
      <ol>
        <li>Fork the repo.</li>
        <li>In your fork open <b>Settings → Pages</b>. Source: <b>Deploy from a branch</b>, branch <code>${esc(branch || 'main')}</code>, folder <code>/ (root)</code>. Save.</li>
        <li>Wait about a minute, then open <code>https://YOUR-NAME.github.io/${esc(repo)}/${esc(sub)}</code></li>
        <li>Files missing? Add an empty file named <code>.nojekyll</code> to the fork.</li>
      </ol>
      <div class="row-c">${btn(`${base}/fork`, 'Fork on GitHub', true)}</div>`],
    ['Vercel', 'one click', `
      <p>Copies the ${path ? 'folder' : 'repo'} into your GitHub and deploys it. Open the link Vercel shows when it finishes.</p>
      <div class="row-c">${btn(`https://vercel.com/new/clone?repository-url=${encodeURIComponent(path ? `${base}/tree/${branch}/${path}` : base)}`, 'Deploy to Vercel', true)}</div>`],
    ['Netlify', 'one click', `
      <p>Copies the repo into your GitHub and deploys it.${path ? ` Then add <code>/${esc(sub)}</code> to the end of your new site's link.` : ''}</p>
      <div class="row-c">${btn(`https://app.netlify.com/start/deploy?repository=${encodeURIComponent(base)}`, 'Deploy to Netlify', true)}</div>`],
    ['Codespaces', 'runs anything', `
      <p>Opens the repo on a cloud computer. If the README says to build first, do that. Then run this in the terminal and click <b>Open in Browser</b>:</p>
      <p><code>${esc(serve)}</code></p>
      <div class="row-c">${btn(`https://codespaces.new/${owner}/${repo}`, 'Open Codespace', true)}<button class="btn" data-copy="${esc(serve)}"><svg><use href="#i-copy"/></svg>Copy command</button></div>`],
  ];
  $('publish-title').textContent = g.name;
  $('methods').innerHTML = methods.map(([title, note, body]) => `<li><h3>${title}<em>${note}</em></h3>${body}</li>`).join('');
  $('publish').showModal();
  SFX.open();
}
function copyText(text, btn) {
  const done = () => {
    btn.innerHTML = '<svg><use href="#i-check"/></svg>Copied';
    setTimeout(() => { btn.innerHTML = '<svg><use href="#i-copy"/></svg>Copy command'; }, 1600);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch {}
    ta.remove();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}

/* ---------- console home ---------- */
function rowFor(t) {
  const items = list(t).filter(g => g.play);
  const day = new Date().toDateString();
  const first = recentIds.map(id => items.find(g => g.id === id)).filter(Boolean);
  const rest = items.filter(g => !first.includes(g)).sort((a, b) => !a.img - !b.img || hash(day + a.id) - hash(day + b.id));
  return [...first, ...rest].slice(0, 30);
}
const tile = (g, i) => `<button class="tile-g" data-i="${i}" style="--h:${hue(g)}" aria-label="${esc(g.name)}">${artHTML(g)}</button>`;
function renderHome() {
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  rowItems = rowFor(tab);
  $('row').innerHTML = rowItems.map(tile).join('') +
    `<button class="tile-g lib" data-act="library"><span class="pcover">All ${tab}</span></button>`;
  select(Math.min(sel, Math.max(rowItems.length - 1, 0)), false);
}
const artA = $('art-a'), artB = $('art-b');
[artA, artB].forEach(im => im.addEventListener('error', () => im.classList.remove('on')));
function setArt(url) {
  if (!url) { artA.classList.remove('on'); artB.classList.remove('on'); return; }
  const active = artA.classList.contains('on') ? artA : artB;
  if (active.src === url && active.classList.contains('on')) return;
  const next = active === artA ? artB : artA;
  next.onload = () => { next.classList.add('on'); active.classList.remove('on'); next.onload = null; };
  next.src = url;
}
function select(i, scroll = true) {
  sel = i;
  $('row').querySelectorAll('[data-i]').forEach(t => t.setAttribute('aria-current', String(+t.dataset.i === i)));
  const g = rowItems[i];
  $('hero-kicker').textContent = tab === 'games' ? `Games · ${playable('games')} playable` : tab === 'apps' ? `Apps · ${list('apps').length} tools` : `Movies · ${list('movies').length} services`;
  $('hero-title').textContent = g ? g.name : '';
  $('hero-meta').textContent = g ? [g.note || host(g.play), g.tab && 'opens in a new tab'].filter(Boolean).join(' · ') : '';
  $('hero-play').querySelector('span').textContent = tab === 'games' ? 'Play' : 'Open';
  $('hero-fav').setAttribute('aria-pressed', String(g && favs.has(g.id)));
  setArt(coversOn && g ? g.img : '');
  if (scroll && g) {
    const t = $('row').querySelector(`[data-i="${i}"]`);
    if (t) t.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }
}
function setMode(mode) {
  document.documentElement.dataset.mode = mode;
  if (mode === 'home') {
    renderHome();
    const t = $('row').querySelector('[aria-current="true"]') || $('row').firstElementChild;
    if (t && !document.querySelector('dialog[open]')) t.focus({ preventScroll: true });
  } else render();
}
function act(name) {
  if (name === 'settings') { $('settings').showModal(); SFX.open(); return; }
  if (name === 'random') {
    const items = list(tab).filter(g => g.play);
    if (items.length) { toast('Random pick', 'i-shuffle'); launch(items[Math.floor(Math.random() * items.length)]); }
    return;
  }
  setMode('library');
  location.hash = tab === 'games' ? '' : tab;
  render();
  if (name === 'search') $('search').focus();
  SFX.open();
}
function navigate(e) {
  const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key];
  if (!move) return;
  const groups = [...$('home').querySelectorAll('[data-nav]')].filter(z => z.offsetParent)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const group = document.activeElement.closest('#home [data-nav]');
  const items = z => [...z.querySelectorAll('button, a')];
  e.preventDefault();
  if (!group) { const t = $('row').querySelector('[aria-current="true"]'); if (t) t.focus(); return; }
  const els = items(group);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const next = els[els.indexOf(document.activeElement) + move];
    if (next) { next.focus(); SFX.move(); }
    return;
  }
  const z = groups[groups.indexOf(group) + move];
  if (z) { (z.querySelector('[aria-current="true"], [aria-selected="true"]') || items(z)[0]).focus(); SFX.move(); }
}

/* ---------- gamepad ---------- */
const padState = {};
function padPress(key, down, now) {
  const s = padState[key] || (padState[key] = { down: false, t: 0, last: 0 });
  if (down) {
    if (!s.down) { s.down = true; s.t = now; s.last = now; return true; }
    if (now - s.t > 450 && now - s.last > 160) { s.last = now; return true; }
    return false;
  }
  s.down = false;
  return false;
}
function padLoop(t) {
  requestAnimationFrame(padLoop);
  const gp = navigator.getGamepads && [...navigator.getGamepads()].find(p => p && p.connected);
  if (!gp || $('player').open) return;
  const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const dirs = { ArrowLeft: btn(14) || ax < -.5, ArrowRight: btn(15) || ax > .5, ArrowUp: btn(12) || ay < -.5, ArrowDown: btn(13) || ay > .5 };
  for (const [key, down] of Object.entries(dirs)) {
    if (padPress(key, down, t) && isHome() && !document.querySelector('dialog[open]')) navigate({ key, preventDefault() {} });
  }
  if (padPress('a', btn(0), t)) {
    const el = document.activeElement;
    if (el && el !== document.body) el.click();
    else if (isHome()) { const t2 = $('row').querySelector('[aria-current="true"]'); if (t2) t2.focus(); }
    SFX.select();
  }
  if (padPress('b', btn(1), t)) {
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    if (dialogs.length) dialogs[dialogs.length - 1].close();
    else if (!isHome() && document.documentElement.dataset.theme !== 'normal') setMode('home');
    SFX.back();
  }
}
addEventListener('gamepadconnected', () => { $('pad-hint').hidden = false; toast('Controller connected — A start, B back', 'i-pad'); SFX.open(); });
addEventListener('gamepaddisconnected', () => {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  if (![...pads].some(p => p && p.connected)) $('pad-hint').hidden = true;
});

/* ---------- themes & settings ---------- */
function setTheme(name) {
  document.documentElement.dataset.theme = name;
  store.set('gp-theme', name);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', THEMES[name].color);
  document.querySelectorAll('[data-pick]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pick === name)));
  setMode(name === 'normal' ? 'library' : 'home');
}
document.querySelectorAll('[data-themes]').forEach(el => {
  el.innerHTML = Object.entries(THEMES).map(([k, t]) =>
    `<button class="tile" data-theme="${k}" data-pick="${k}" aria-pressed="false"><i class="mini">${'<b></b>'.repeat(6)}</i>${t.label}<small>${t.tag}</small></button>`).join('');
});
$('tab-title').innerHTML = '<option value="">Ports (default)</option>' + TITLES.map(t => `<option>${t}</option>`).join('');
$('tab-title').value = TITLES.includes(store.get('gp-title')) ? store.get('gp-title') : '';
document.title = $('tab-title').value || 'ports';
$('tab-title').addEventListener('change', e => { store.set('gp-title', e.target.value); document.title = e.target.value || 'ports'; });
$('pref-covers').checked = coversOn;
$('pref-covers').addEventListener('change', e => {
  coversOn = e.target.checked;
  store.set('gp-covers', coversOn ? '1' : '0');
  render(); if (isHome()) renderHome();
  toast(coversOn ? 'Remote cover art on' : 'Procedural covers only', 'i-grid');
});
const motionOff = store.get('gp-motion') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.dataset.motion = motionOff ? 'reduce' : '';
$('pref-motion').checked = motionOff;
$('pref-motion').addEventListener('change', e => {
  document.documentElement.dataset.motion = e.target.checked ? 'reduce' : '';
  store.set('gp-motion', e.target.checked ? '1' : '0');
});

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const pick = e.target.closest('[data-pick]');
  if (pick) {
    if (pick.closest('#boot')) $('boot').close();
    if (pick.closest('#settings')) $('settings').close();
    setTheme(pick.dataset.pick);
    SFX.toggle();
    toast(`${THEMES[pick.dataset.pick].label} theme`, 'i-logo');
    return;
  }
  const snd = e.target.closest('[data-sound]');
  if (snd) { toggleSound(); return; }
  const close = e.target.closest('[data-close]');
  if (close) { $(close.dataset.close).close(); SFX.back(); return; }
  const a = e.target.closest('#home [data-act]');
  if (a) act(a.dataset.act);
});
$('grid').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if ('go' in b.dataset) go(shown[b.dataset.go]);
  if ('info' in b.dataset) details(shown[b.dataset.info]);
  if ('fav' in b.dataset) toggleFav(shown[b.dataset.fav]);
});
$('details-actions').addEventListener('click', e => {
  const b = e.target.closest('[data-d]');
  if (!b) return;
  if (b.dataset.d === 'fav') { toggleFav(detail); return; }
  $('details').close();
  if (b.dataset.d === 'play') launch(detail);
  if (b.dataset.d === 'publish') publish(detail);
});
$('filters').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) { filter = b.dataset.filter; render(); SFX.toggle(); }
});
$('sort').addEventListener('change', e => { sort = e.target.value; render(); });
$('methods').addEventListener('click', e => {
  const b = e.target.closest('[data-copy]');
  if (b) copyText(b.dataset.copy, b);
});
let searchTimer = null;
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(render, 120); });

let armed = false;
$('row').addEventListener('focusin', e => { const t = e.target.closest('[data-i]'); if (t) { select(+t.dataset.i); SFX.move(); } });
$('row').addEventListener('pointerdown', e => { const t = e.target.closest('[data-i]'); armed = !!t && +t.dataset.i === sel; });
$('row').addEventListener('click', e => {
  const t = e.target.closest('[data-i]');
  if (t && (e.detail === 0 || armed)) launch(rowItems[+t.dataset.i]);
});
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab; sel = 0; renderHome(); SFX.toggle();
}));
$('hero-play').addEventListener('click', () => rowItems[sel] && launch(rowItems[sel]));
$('hero-info').addEventListener('click', () => rowItems[sel] && details(rowItems[sel]));
$('hero-fav').addEventListener('click', () => rowItems[sel] && toggleFav(rowItems[sel]));
$('home-open').addEventListener('click', () => { setMode('home'); SFX.back(); });
$('settings-open').addEventListener('click', () => { $('settings').showModal(); SFX.open(); });

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === '/' && !isHome()) { e.preventDefault(); $('search').focus(); return; }
  if (isHome()) navigate(e);
  else if (e.key === 'Escape' && document.documentElement.dataset.theme !== 'normal') { setMode('home'); SFX.back(); }
});
addEventListener('hashchange', () => { $('search').value = ''; render(); });

const tick = () => { $('clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
tick();
setInterval(tick, 15e3);

/* ---------- boot ---------- */
function finishBoot(error) {
  if (!$('boot').open) return;
  if (error) {
    $('boot-loading').hidden = true;
    $('boot-pick').hidden = false;
    $('boot-error').textContent = `${error} Reload to try again.`;
    $('boot-error').hidden = false;
    return;
  }
  $('boot').close();
}
addEventListener('error', e => finishBoot(`Something went wrong: ${e.message}.`));
if ($('boot').showModal) $('boot').showModal(); else $('boot').setAttribute('open', '');
$('boot').addEventListener('cancel', e => { if ($('boot-pick').hidden) e.preventDefault(); });

/* ---------- init ---------- */
const n = DATA.games.length, p = playable('games');
$('status').innerHTML = `<b>${n}</b> games · <b>${p}</b> playable · ${DATA.apps.length} apps · ${DATA.movies.length} movies · snapshot ${ago(DATA.time)}`;
paintSound();
const firstVisit = !store.get('gp-theme');
setTheme(firstVisit ? 'playstation' : store.get('gp-theme'));
requestAnimationFrame(padLoop);
setTimeout(() => {
  if (!firstVisit) finishBoot();
  else {
    $('boot-loading').hidden = true;
    $('boot-pick').hidden = false;
    const t = $('boot').querySelector('[aria-pressed="true"]');
    if (t) t.focus();
  }
}, 650);