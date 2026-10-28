const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.className = '';
    this.textContent = '';
    this.parentElement = null;
    this.listeners = {};
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  hasAttribute(key) { return Object.hasOwn(this.attributes, key); }
  addEventListener(type, handler) { (this.listeners[type] ??= []).push(handler); }
  click(init = {}) {
    const event = {
      button: 0,
      defaultPrevented: false,
      ...init,
      preventDefault() { this.defaultPrevented = true; }
    };
    for (const handler of this.listeners.click ?? []) handler(event);
    return event;
  }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  insertBefore(node, ref) {
    const old = this.children.indexOf(node);
    if (old >= 0) this.children.splice(old, 1);
    const i = this.children.indexOf(ref);
    node.parentElement = this;
    this.children.splice(i < 0 ? this.children.length : i, 0, node);
  }
  remove() {
    if (!this.parentElement) return;
    const i = this.parentElement.children.indexOf(this);
    if (i >= 0) this.parentElement.children.splice(i, 1);
    this.parentElement = null;
  }
  get nextElementSibling() {
    if (!this.parentElement) return null;
    const i = this.parentElement.children.indexOf(this);
    return this.parentElement.children[i + 1] ?? null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const isMatch = (node) => selector[0] === '.'
      ? node.className.split(/\s+/).includes(selector.slice(1))
      : selector[0] === '#' ? node.id === selector.slice(1)
        : node.tagName.toLowerCase() === selector.toLowerCase();
    const found = [];
    const visit = (node) => { for (const child of node.children) { if (isMatch(child)) found.push(child); visit(child); } };
    visit(this);
    return found;
  }
}
class FakeDocument {
  constructor() { this.body = new FakeElement('body'); }
  createElement(tag) { return new FakeElement(tag); }
  querySelector(selector) { return this.body.querySelector(selector); }
}

test('puts the product disclosure banner immediately before editions and pricing', () => {
  assert.equal(typeof api.ensureProductBanner, 'function', 'product banner insertion is missing');
  const doc = new FakeDocument();
  const column = new FakeElement('div');
  const actionBar = new FakeElement('div');
  const purchase = new FakeElement('div');
  column.append(actionBar, purchase);
  doc.body.append(column);

  const banner = api.ensureProductBanner(doc, purchase, 2887580);
  assert.equal(banner.parentElement, column);
  assert.equal(banner.nextElementSibling, purchase);
  assert.equal(banner.getAttribute('data-app-id'), '2887580');
  assert.equal(banner.querySelector('.sfp-ai-disclosure-product-badge')?.textContent, 'AI disclosed');
  assert.equal(banner.querySelector('.sfp-ai-disclosure-product-link')?.getAttribute('href'), '#sfp-ai-disclosure-details');
});

test('reuses the product banner instead of duplicating it', () => {
  const doc = new FakeDocument();
  const column = new FakeElement('div');
  const purchase = new FakeElement('div');
  column.append(purchase);
  doc.body.append(column);
  const first = api.ensureProductBanner(doc, purchase, 2887580);
  const second = api.ensureProductBanner(doc, purchase, 2887580);
  assert.equal(second, first);
  assert.equal(column.children.filter((node) => node.className === 'sfp-ai-disclosure-product-banner').length, 1);
});

test('centers the disclosure block when View disclosure is activated', () => {
  const doc = new FakeDocument();
  const column = new FakeElement('div');
  const purchase = new FakeElement('div');
  column.append(purchase);
  doc.body.append(column);

  const actions = [];
  const disclosure = new FakeElement('div');
  const anchor = new FakeElement('span');
  anchor.id = 'sfp-ai-disclosure-details';
  const heading = new FakeElement('h2');
  let focusOptions = null;
  heading.focus = (options) => {
    focusOptions = options;
    actions.push('focus');
  };
  disclosure.append(anchor, heading);
  let scrollOptions = null;
  doc.body.append(disclosure);

  const historyCalls = [];
  const historyState = { page: 'product' };
  const win = {
    location: { hash: '' },
    history: {
      state: historyState,
      pushState(...args) {
        historyCalls.push(args);
        actions.push('history');
        win.location.hash = args[2];
      }
    }
  };
  disclosure.scrollIntoView = (options) => {
    scrollOptions = options;
    actions.push('scroll');
  };
  const banner = api.ensureProductBanner(doc, purchase, 2887580, win);
  const link = banner.querySelector('.sfp-ai-disclosure-product-link');
  const event = link.click();

  assert.equal(event.defaultPrevented, true);
  assert.equal(heading.getAttribute('tabindex'), '-1');
  assert.deepEqual(focusOptions, { preventScroll: true });
  assert.deepEqual(scrollOptions, { behavior: 'smooth', block: 'center' });
  assert.deepEqual(historyCalls, [[historyState, '', '#sfp-ai-disclosure-details']]);
  assert.deepEqual(actions, ['history', 'focus', 'scroll']);
});

test('honors reduced motion while centering the disclosure block', () => {
  const doc = new FakeDocument();
  const column = new FakeElement('div');
  const purchase = new FakeElement('div');
  column.append(purchase);
  doc.body.append(column);

  const disclosure = new FakeElement('div');
  const anchor = new FakeElement('span');
  anchor.id = 'sfp-ai-disclosure-details';
  disclosure.append(anchor);
  let scrollOptions = null;
  disclosure.scrollIntoView = (options) => { scrollOptions = options; };
  doc.body.append(disclosure);

  const win = {
    location: { hash: '' },
    history: { state: null, pushState() {} },
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)');
      return { matches: true };
    }
  };
  const banner = api.ensureProductBanner(doc, purchase, 2887580, win);
  const link = banner.querySelector('.sfp-ai-disclosure-product-link');
  link.click();

  assert.deepEqual(scrollOptions, { behavior: 'instant', block: 'center' });
});

test('leaves the native anchor path intact without a scrollable disclosure target', () => {
  for (const hasAnchor of [false, true]) {
    const doc = new FakeDocument();
    const column = new FakeElement('div');
    const purchase = new FakeElement('div');
    column.append(purchase);
    doc.body.append(column);

    if (hasAnchor) {
      const disclosure = new FakeElement('div');
      const anchor = new FakeElement('span');
      anchor.id = 'sfp-ai-disclosure-details';
      disclosure.append(anchor);
      doc.body.append(disclosure);
    }

    const banner = api.ensureProductBanner(doc, purchase, 2887580);
    const link = banner.querySelector('.sfp-ai-disclosure-product-link');
    const event = link.click();
    assert.equal(event.defaultPrevented, false);
  }
});

test('keeps centered scrolling when the browser refuses the fragment update', () => {
  const doc = new FakeDocument();
  const column = new FakeElement('div');
  const purchase = new FakeElement('div');
  column.append(purchase);
  doc.body.append(column);

  const disclosure = new FakeElement('div');
  const anchor = new FakeElement('span');
  anchor.id = 'sfp-ai-disclosure-details';
  disclosure.append(anchor);
  let scrollOptions = null;
  disclosure.scrollIntoView = (options) => { scrollOptions = options; };
  doc.body.append(disclosure);

  const win = {
    location: { hash: '' },
    history: {
      state: null,
      pushState() { throw new Error('fragment update refused'); }
    }
  };
  const banner = api.ensureProductBanner(doc, purchase, 2887580, win);
  const link = banner.querySelector('.sfp-ai-disclosure-product-link');
  const event = link.click();

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(scrollOptions, { behavior: 'smooth', block: 'center' });
});

test('preserves modified View disclosure link actions', () => {
  const doc = new FakeDocument();
  const column = new FakeElement('div');
  const purchase = new FakeElement('div');
  column.append(purchase);
  doc.body.append(column);

  const disclosure = new FakeElement('div');
  const anchor = new FakeElement('span');
  anchor.id = 'sfp-ai-disclosure-details';
  disclosure.append(anchor);
  let scrollOptions = null;
  disclosure.scrollIntoView = (options) => { scrollOptions = options; };
  doc.body.append(disclosure);

  const banner = api.ensureProductBanner(doc, purchase, 2887580);
  const link = banner.querySelector('.sfp-ai-disclosure-product-link');
  for (const init of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 }
  ]) {
    const event = link.click(init);
    assert.equal(event.defaultPrevented, false);
  }
  const alreadyPrevented = link.click({ defaultPrevented: true });

  assert.equal(alreadyPrevented.defaultPrevented, true);
  assert.equal(scrollOptions, null);
});
