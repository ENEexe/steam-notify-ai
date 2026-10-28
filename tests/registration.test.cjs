const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('marks a card once for each distinct AppID list', () => {
  assert.equal(typeof api.markCardChecked, 'function', 'card registration helper is missing');
  const attributes = new Map();
  const card = {
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, value); }
  };

  assert.equal(api.markCardChecked(card, [2887580, 5365110]), true);
  assert.equal(attributes.get('data-sfp-ai-checked'), '2887580,5365110');
  assert.equal(api.markCardChecked(card, [2887580, 5365110]), false);
  assert.equal(api.markCardChecked(card, [2887580]), true);
  assert.equal(attributes.get('data-sfp-ai-checked'), '2887580');
});
