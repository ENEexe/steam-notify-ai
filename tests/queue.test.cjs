const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('defers overflow AppIDs and admits them as lookup slots free', () => {
  assert.equal(typeof api.enqueueLookup, 'function', 'queue admission helper is missing');
  assert.equal(typeof api.drainDeferredLookups, 'function', 'deferred lookup drain is missing');
  const queue = [];
  const queued = new Set();
  const deferred = new Set();
  api.enqueueLookup(queue, queued, deferred, 1, 2);
  assert.equal(api.enqueueLookup(queue, queued, deferred, 1, 2), 'already');
  api.enqueueLookup(queue, queued, deferred, 2, 2);
  assert.equal(api.enqueueLookup(queue, queued, deferred, 3, 2), 'deferred');
  assert.equal(api.enqueueLookup(queue, queued, deferred, 3, 2), 'already');
  assert.deepEqual(queue, ['1', '2']);
  assert.deepEqual([...deferred], ['3']);

  const completed = queue.shift();
  queued.delete(completed);
  api.drainDeferredLookups(queue, queued, deferred, 2);
  assert.deepEqual(queue, ['2', '3']);
  assert.equal(deferred.size, 0);
  assert.equal(queued.has('3'), true);
});
