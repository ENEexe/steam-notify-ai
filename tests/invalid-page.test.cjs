const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('does not treat a generic error page as a clean Steam app page', () => {
  assert.equal(api.parseDisclosureStatus('<html><body>Not found</body></html>'), 'unknown');
});
