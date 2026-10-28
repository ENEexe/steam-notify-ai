const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('keeps search-card loading active until all distinct AppIDs resolve', () => {
  assert.equal(typeof api.trackPendingAppId, 'function', 'pending AppID tracker is missing');
  assert.equal(typeof api.resolvePendingAppId, 'function', 'pending AppID resolver is missing');
  const pendingByRow = new WeakMap();
  const row = {};

  assert.equal(api.trackPendingAppId(pendingByRow, row, 101), 1);
  assert.equal(api.trackPendingAppId(pendingByRow, row, 101), 1);
  assert.equal(api.trackPendingAppId(pendingByRow, row, 202), 2);
  assert.equal(api.resolvePendingAppId(pendingByRow, row, 101), 1);
  assert.equal(pendingByRow.has(row), true);
  assert.equal(api.resolvePendingAppId(pendingByRow, row, 202), 0);
  assert.equal(pendingByRow.has(row), false);
});

test('resolves only Steam search-result rows as loading-indicator targets', () => {
  assert.equal(typeof api.searchResultRow, 'function', 'search-row selector helper is missing');
  const row = { closest: (selector) => selector === 'a.search_result_row' ? row : null };
  const nestedCard = { closest: (selector) => selector === 'a.search_result_row' ? row : null };
  const featuredCard = { closest: () => null };
  assert.equal(api.searchResultRow(row), row);
  assert.equal(api.searchResultRow(nestedCard), row);
  assert.equal(api.searchResultRow(featuredCard), null);
});

test('styles the temporary checking label neutrally and only positions search rows', () => {
  const css = api.buildStyles();
  assert.match(css, /\.sfp-ai-card-badge\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.sfp-ai-checking-badge\s*\{[^}]*background:/s);
  assert.match(css, /\.search_result_row\.sfp-ai-checking-row\s*\{[^}]*position:\s*relative\s*!important/s);
});
