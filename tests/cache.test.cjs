const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('uses only fresh positive or negative disclosure cache records', () => {
  assert.equal(typeof api.cacheStatus, 'function', 'cache reader is missing');
  const now = 2_000_000_000_000;
  const cache = {
    '4800590': { status: 'disclosed', checkedAt: now - 1000 },
    '620': { status: 'clean', checkedAt: now - api.CACHE_TTL_MS - 1 },
    '570': { status: 'unknown', checkedAt: now - 1000 }
  };
  assert.equal(api.cacheStatus(cache, 4800590, now), 'disclosed');
  assert.equal(api.cacheStatus(cache, 620, now), null);
  assert.equal(api.cacheStatus(cache, 570, now), null);
});
