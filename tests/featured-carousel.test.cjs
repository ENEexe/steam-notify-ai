const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('keeps Steam carousel card positioning native while anchoring search badges', () => {
  assert.equal(typeof api.buildStyles, 'function', 'highlighter CSS builder is missing');
  const css = api.buildStyles();
  const cardRule = css.match(/\.sfp-ai-disclosed-card\s*\{([^}]*)\}/);
  assert.ok(cardRule, 'generic disclosed-card rule is missing');
  assert.match(cardRule[1], /outline:/);
  assert.doesNotMatch(cardRule[1], /\bposition\s*:/, 'generic rule must not override carousel positioning');

  const searchRule = css.match(/\.search_result_row\.sfp-ai-disclosed-card\s*\{([^}]*)\}/);
  assert.ok(searchRule, 'search rows need their own positioning context');
  assert.match(searchRule[1], /position:\s*relative\s*!important/);
});
