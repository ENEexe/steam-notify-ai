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
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
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
      : selector[0] === '#' ? node.id === selector.slice(1) : false;
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
