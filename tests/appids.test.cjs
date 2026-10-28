const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('extracts and deduplicates AppIDs from Steam listing data', () => {
  assert.equal(typeof api.extractAppIds, 'function', 'AppID extractor is missing');
  assert.deepEqual(api.extractAppIds('4800590, 620, 4800590', '/app/620/portal-2/'), [4800590, 620]);
  assert.deepEqual(api.extractAppIds('', 'https://store.steampowered.com/app/42/example/'), [42]);
});
