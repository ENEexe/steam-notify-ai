const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return new Set(this.element.className.split(/\s+/).filter(Boolean)); }
  add(...names) { this.element.className = [...new Set([...this.values(), ...names])].join(' '); }
  remove(...names) { const current = this.values(); for (const name of names) current.delete(name); this.element.className = [...current].join(' '); }
  contains(name) { return this.values().has(name); }
}

class FakeElement {
  constructor(tagName, className = '') {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.classList = new FakeClassList(this);
    this.children = [];
    this.attributes = {};
    this.parentElement = null;
    this.isConnected = true;
  }
  appendChild(node) { node.parentElement = this; node.isConnected = this.isConnected; this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  matches(selector) {
    if (selector === 'a.search_result_row') return this.tagName === 'A' && this.classList.contains('search_result_row');
    if (selector === '[data-ds-appid], a[href*="/app/"]') return Boolean(this.getAttribute('data-ds-appid') || /\/app\//.test(this.getAttribute('href') || ''));
    const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    if (classes.length) return classes.every((name) => this.classList.contains(name));
    return false;
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
    this.isConnected = false;
  }
}

class FakeDocument {
  constructor(appCards) {
    this.body = new FakeElement('body');
    this.head = new FakeElement('head');
    this.readyState = 'complete';
    this.appCards = appCards;
    for (const card of appCards) this.body.appendChild(card);
  }
  createElement(tagName) { return new FakeElement(tagName); }
  getElementById(id) { return [...this.head.querySelectorAll('*'), ...this.body.querySelectorAll('*')].find((el) => el.id === id) ?? null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    if (selector === '[id="game_area_content_descriptors"]') return [];
    if (selector === '[data-ds-appid], a[href*="/app/"]') return this.appCards.filter((card) => card.isConnected);
    return this.body.querySelectorAll(selector);
  }
}

function createRuntime(card, responsePromise, cacheRecords = null) {
  const fetches = [];
  const timers = [];
  const observers = [];
  const doc = new FakeDocument([card]);
  let storedCache = cacheRecords ? JSON.stringify(cacheRecords) : null;
  const storage = { getItem: () => storedCache, setItem: (_key, value) => { storedCache = value; } };
  const win = {
    location: { hostname: 'store.steampowered.com', origin: 'https://store.steampowered.com', pathname: '/search/?term=test' },
    localStorage: storage,
    IntersectionObserver: undefined,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
    },
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout: () => {},
    fetch: (url) => { fetches.push(url); return responsePromise(); },
    addEventListener: () => {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', borderLeftWidth: '0px', borderTopWidth: '0px' })
  };
  return { doc, win, fetches, storage, timers, observers };
}

function cleanResponse(appId = 101) {
  return {
    status: 200,
    ok: true,
    url: `https://store.steampowered.com/app/${appId}/?l=english`,
    text: async () => '<div id="appHubAppName">Test</div>'
  };
}

function disclosedResponse(appId = 101) {
  return {
    status: 200,
    ok: true,
    url: `https://store.steampowered.com/app/${appId}/?l=english`,
    text: async () => '<div id="appHubAppName">Test</div><div id="game_area_content_descriptors"><h2>AI Generated Content Disclosure</h2></div>'
  };
}

async function flushRuntime() {
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

test('shows Checking on search rows until the lookup resolves, then removes it', async () => {
  let resolveFetch;
  const card = new FakeElement('a', 'search_result_row');
  card.setAttribute('data-ds-appid', '101');
  const { doc, win, fetches } = createRuntime(card, () => new Promise((resolve) => { resolveFetch = resolve; }));

  assert.equal(api.startRuntime(win, doc), true);
  assert.equal(fetches.length, 1);
  assert.equal(card.querySelector('.sfp-ai-checking-badge')?.textContent, 'Checking…');
  assert.equal(card.querySelector('.sfp-ai-disclosure-badge'), null);

  resolveFetch(cleanResponse());
  await flushRuntime();
  assert.equal(card.querySelector('.sfp-ai-checking-badge'), null);
});

test('does not show Checking on featured cards', async () => {
  let resolveFetch;
  const card = new FakeElement('div');
  card.setAttribute('data-ds-appid', '101');
  const { doc, win, fetches } = createRuntime(card, () => new Promise((resolve) => { resolveFetch = resolve; }));

  assert.equal(api.startRuntime(win, doc), true);
  assert.equal(fetches.length, 1);
  assert.equal(card.querySelector('.sfp-ai-checking-badge'), null);

  resolveFetch(cleanResponse());
  await flushRuntime();
});

test('replaces Checking with the disclosure badge only for a positive page result', async () => {
  let resolveFetch;
  const card = new FakeElement('a', 'search_result_row');
  card.setAttribute('data-ds-appid', '101');
  const { doc, win } = createRuntime(card, () => new Promise((resolve) => { resolveFetch = resolve; }));

  api.startRuntime(win, doc);
  assert.equal(card.querySelector('.sfp-ai-checking-badge')?.textContent, 'Checking…');
  resolveFetch(disclosedResponse());
  await flushRuntime();
  assert.equal(card.querySelector('.sfp-ai-checking-badge'), null);
  assert.equal(card.querySelector('.sfp-ai-disclosure-badge')?.textContent, 'AI disclosed');
});

test('keeps Checking until every AppID on a search row resolves, even when responses arrive in reverse order', async () => {
  const originalNow = Date.now;
  let now = 50_000;
  Date.now = () => now;
  try {
    const resolvers = [];
    const timers = [];
    const card = new FakeElement('a', 'search_result_row');
    card.setAttribute('data-ds-appid', '101,202');
    const { doc, win, fetches } = createRuntime(card, () => new Promise((resolve) => resolvers.push(resolve)));
    win.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };

    api.startRuntime(win, doc);
    assert.equal(fetches.length, 1);
    assert.equal(card.querySelector('.sfp-ai-checking-badge')?.textContent, 'Checking…');
    assert.equal(timers.length, 1);

    now += timers[0].delay;
    timers.shift().callback();
    assert.equal(fetches.length, 2);

    resolvers[1]({ status: 503, ok: false, url: 'https://store.steampowered.com/app/202/?l=english' });
    await flushRuntime();
    assert.equal(card.querySelector('.sfp-ai-checking-badge')?.textContent, 'Checking…');
    assert.equal(card.querySelector('.sfp-ai-disclosure-badge'), null);

    resolvers[0](cleanResponse(101));
    await flushRuntime();
    assert.equal(card.querySelector('.sfp-ai-checking-badge'), null);
  } finally {
    Date.now = originalNow;
  }
});

test('shows the disclosed badge as soon as one AppID in a multi-ID row resolves positive', async () => {
  const originalNow = Date.now;
  let now = 75_000;
  Date.now = () => now;
  try {
    const resolvers = [];
    const timers = [];
    const card = new FakeElement('a', 'search_result_row');
    card.setAttribute('data-ds-appid', '101,202');
    const { doc, win, fetches } = createRuntime(card, () => new Promise((resolve) => resolvers.push(resolve)));
    win.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };

    api.startRuntime(win, doc);
    now += timers[0].delay;
    timers.shift().callback();
    assert.equal(fetches.length, 2);
    assert.equal(card.querySelector('.sfp-ai-checking-badge')?.textContent, 'Checking…');

    resolvers[0](disclosedResponse(101));
    await flushRuntime();
    assert.equal(card.querySelector('.sfp-ai-checking-badge'), null);
    assert.equal(card.querySelector('.sfp-ai-disclosure-badge')?.textContent, 'AI disclosed');

    resolvers[1](cleanResponse(202));
    await flushRuntime();
    assert.equal(card.querySelector('.sfp-ai-disclosure-badge')?.textContent, 'AI disclosed');
  } finally {
    Date.now = originalNow;
  }
});

test('cached clean and disclosed results skip the checking state', () => {
  const checkedAt = Date.now();
  const cleanCard = new FakeElement('a', 'search_result_row');
  cleanCard.setAttribute('data-ds-appid', '101');
  const clean = createRuntime(cleanCard, () => { throw new Error('cached lookup must not fetch'); }, {
    101: { status: 'clean', checkedAt }
  });
  api.startRuntime(clean.win, clean.doc);
  assert.equal(clean.fetches.length, 0);
  assert.equal(cleanCard.querySelector('.sfp-ai-checking-badge'), null);
  assert.equal(cleanCard.querySelector('.sfp-ai-disclosure-badge'), null);

  const disclosedCard = new FakeElement('a', 'search_result_row');
  disclosedCard.setAttribute('data-ds-appid', '101');
  const disclosed = createRuntime(disclosedCard, () => { throw new Error('cached lookup must not fetch'); }, {
    101: { status: 'disclosed', checkedAt }
  });
  api.startRuntime(disclosed.win, disclosed.doc);
  assert.equal(disclosed.fetches.length, 0);
  assert.equal(disclosedCard.querySelector('.sfp-ai-checking-badge'), null);
  assert.equal(disclosedCard.querySelector('.sfp-ai-disclosure-badge')?.textContent, 'AI disclosed');
});

test('removes a stale checking label and clears the checked marker if a positive result arrives after detachment', async () => {
  let resolveFetch;
  const card = new FakeElement('a', 'search_result_row');
  card.setAttribute('data-ds-appid', '101');
  const { doc, win, fetches, timers, observers } = createRuntime(card, () => new Promise((resolve) => { resolveFetch = resolve; }));

  api.startRuntime(win, doc);
  assert.equal(card.querySelector('.sfp-ai-checking-badge')?.textContent, 'Checking…');
  card.remove();
  observers[0].callback([]);
  timers.shift().callback();
  resolveFetch(disclosedResponse());
  await flushRuntime();
  assert.equal(card.querySelector('.sfp-ai-checking-badge'), null);
  assert.equal(card.getAttribute('data-sfp-ai-checked'), null);

  doc.body.appendChild(card);
  observers[0].callback([]);
  timers.shift().callback();
  assert.equal(fetches.length, 1);
  assert.equal(card.querySelector('.sfp-ai-checking-badge'), null);
  assert.equal(card.querySelector('.sfp-ai-disclosure-badge')?.textContent, 'AI disclosed');
});

test('removes Checking when the lookup fails', async () => {
  let rejectFetch;
  const card = new FakeElement('a', 'search_result_row');
  card.setAttribute('data-ds-appid', '101');
  const { doc, win } = createRuntime(card, () => new Promise((_resolve, reject) => { rejectFetch = reject; }));

  api.startRuntime(win, doc);
  assert.equal(card.querySelector('.sfp-ai-checking-badge')?.textContent, 'Checking…');
  rejectFetch(new Error('network failure'));
  await flushRuntime();
  assert.equal(card.querySelector('.sfp-ai-checking-badge'), null);
});
