'use strict';

const qEl = document.getElementById('q');
const listEl = document.getElementById('list');
const statusEl = document.getElementById('status');
const countEl = document.getElementById('count');

const state = {
  tabId: null,
  items: [],
  results: [],
  active: -1,
};

// Only this function's source is injected into the tab, so it cannot reference
// anything above it. Reads the sidebar once the admin markup is in the DOM.
function collectMenuItems() {
  const text = (el) => {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll(
        '.update-plugins,.awaiting-mod,.plugin-count,.update-count,.count,.frm-meta-tag,.screen-reader-text'
      )
      .forEach((node) => node.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  };

  const url = (a) => {
    if (!a) return '';
    const raw = a.getAttribute('href') || '';
    if (!raw || raw === '#' || raw.startsWith('javascript:')) return '';
    return a.href;
  };

  const trim = (value) => value.replace(/^["']|["']$/g, '');

  const iconOf = (li) => {
    const box = li.querySelector('.wp-menu-image');
    if (!box) return null;
    const img = box.querySelector('img[src]');
    if (img) return { type: 'img', value: img.src };
    const bg = getComputedStyle(box).backgroundImage;
    if (bg.startsWith('url(')) return { type: 'img', value: trim(bg.slice(4, -1)) };
    const glyph = getComputedStyle(box, '::before').content;
    if (glyph && glyph !== 'none' && glyph !== 'normal' && glyph !== '""') {
      return { type: 'dash', value: trim(glyph) };
    }
    return null;
  };

  const found = [];
  const seen = new Set();
  const push = (label, link, parent, level, icon) => {
    if (!label || !link) return;
    const key = level + '|' + parent + '|' + label + '|' + link;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ label: label, url: link, parent: parent, level: level, icon: icon });
  };

  const root = document.getElementById('adminmenu');
  if (!root) return { items: found, font: '' };

  root.querySelectorAll('li.menu-top').forEach((li) => {
    const topLink = li.querySelector('a');
    const nameEl = topLink ? topLink.querySelector('.wp-menu-name') : null;
    const topLabel = text(nameEl || topLink);

    push(topLabel, url(topLink), '', 0, iconOf(li));

    const submenu = li.querySelector('ul.wp-submenu');
    if (!submenu) return;
    submenu.querySelectorAll('a').forEach((a) => push(text(a), url(a), topLabel, 1, null));
  });

  // Core icons are glyphs from the site's own dashicons font; the popup loads it.
  const css = document.querySelector('link[href*="dashicons"]');
  const font = css ? new URL('../fonts/dashicons.woff2', css.href).href : '';

  return { items: found, font: font };
}

function search(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice();

  const hits = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    let score;
    if (label === q) score = 0;
    else if (label.startsWith(q)) score = 1;
    else if (label.includes(q)) score = 2;
    else if (item.parent.toLowerCase().includes(q)) score = 3;
    else if (item.url.toLowerCase().includes(q)) score = 4;
    else continue;
    hits.push({ score: score, item: item });
  }

  hits.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
  return hits.map((hit) => hit.item);
}

function highlight(label, query) {
  const frag = document.createDocumentFragment();
  const q = query.trim();
  const at = q ? label.toLowerCase().indexOf(q.toLowerCase()) : -1;

  if (at < 0) {
    frag.appendChild(document.createTextNode(label));
    return frag;
  }

  frag.appendChild(document.createTextNode(label.slice(0, at)));
  const mark = document.createElement('span');
  mark.className = 'hit';
  mark.textContent = label.slice(at, at + q.length);
  frag.appendChild(mark);
  frag.appendChild(document.createTextNode(label.slice(at + q.length)));
  return frag;
}

function renderRow(item, index, query) {
  const li = document.createElement('li');
  li.className = 'row' + (item.level ? ' sub' : '');
  li.setAttribute('role', 'option');
  li.dataset.index = String(index);
  if (!query.trim() && item.level === 0 && index > 0) li.classList.add('group');

  const icon = document.createElement('span');
  icon.className = 'ico';
  if (item.icon && item.icon.type === 'img') {
    const img = document.createElement('img');
    img.src = item.icon.value;
    img.alt = '';
    icon.appendChild(img);
  } else if (item.icon && item.icon.type === 'dash') {
    const glyph = document.createElement('span');
    glyph.className = 'dash';
    glyph.textContent = item.icon.value;
    icon.appendChild(glyph);
  }
  li.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'label';
  label.appendChild(highlight(item.label, query));
  li.appendChild(label);

  if (item.parent && item.parent !== item.label) {
    const parent = document.createElement('span');
    parent.className = 'parent';
    parent.appendChild(highlight(item.parent, query));
    li.appendChild(parent);
  }

  return li;
}

function render() {
  const query = qEl.value;

  listEl.textContent = '';
  const frag = document.createDocumentFragment();
  state.results.forEach((item, index) => frag.appendChild(renderRow(item, index, query)));
  listEl.appendChild(frag);

  countEl.textContent = state.results.length
    ? state.results.length + ' of ' + state.items.length + ' menus'
    : '';

  if (state.results.length) {
    statusEl.hidden = true;
    setActive(0);
  } else {
    statusEl.hidden = false;
    statusEl.textContent = 'Nothing matches "' + query.trim() + '".';
  }
}

function setActive(index) {
  if (index === state.active) return;

  const rows = listEl.children;
  if (state.active >= 0 && rows[state.active]) rows[state.active].classList.remove('active');
  state.active = index;

  const row = rows[state.active];
  if (!row) return;
  row.classList.add('active');
  row.scrollIntoView({ block: 'nearest' });
}

function update() {
  state.results = search(state.items, qEl.value);
  render();
}

function message(text) {
  qEl.disabled = true;
  listEl.textContent = '';
  countEl.textContent = '';
  statusEl.hidden = false;
  statusEl.textContent = text;
}

async function open(item) {
  if (!item) return;
  await chrome.tabs.update(state.tabId, { url: item.url });
  window.close();
}

function activeItem() {
  return state.results[state.active] || state.results[0] || null;
}

qEl.addEventListener('input', update);

qEl.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setActive(Math.min(state.active + 1, state.results.length - 1));
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setActive(Math.max(state.active - 1, 0));
  } else if (event.key === 'Enter') {
    event.preventDefault();
    open(activeItem());
  } else if (event.key === 'Escape') {
    window.close();
  }
});

listEl.addEventListener('mouseover', (event) => {
  const row = event.target.closest('.row');
  if (row) setActive(Number(row.dataset.index));
});

listEl.addEventListener('click', (event) => {
  const row = event.target.closest('.row');
  if (row) open(state.results[Number(row.dataset.index)]);
});

function addDashiconFont(url) {
  const style = document.createElement('style');
  style.textContent = '@font-face{font-family:wpfind-dashicons;src:url("' + url + '") format("woff2")}';
  document.head.appendChild(style);
}

async function start() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    message('No active tab.');
    return;
  }
  state.tabId = tab.id;

  let injected;
  try {
    [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectMenuItems,
    });
  } catch (err) {
    message('WPFind cannot read this tab. Open a WordPress admin page.');
    return;
  }

  const data = (injected && injected.result) || null;
  if (!data || !data.items.length) {
    message('No admin menu on this page. Open a WordPress admin screen.');
    return;
  }

  state.items = data.items;
  if (data.font) addDashiconFont(data.font);
  qEl.disabled = false;
  qEl.focus();
  update();
}

start();
