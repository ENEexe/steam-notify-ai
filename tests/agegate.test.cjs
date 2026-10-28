const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('treats age-gated product pages as unknown rather than clean', () => {
  const ageGate = '<form id="agegate_box"><p>Confirm your age</p></form>';
  assert.equal(api.parseDisclosureStatus(ageGate), 'unknown');
});
