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

test('paces lookups at 600ms by default and respects an active cooldown', () => {
  assert.equal(typeof api.nextRequestDelay, 'function', 'request delay helper is missing');
  assert.equal(api.nextRequestDelay({ now: 1000, lastRequestAt: 1000, pauseUntil: 0 }), 600);
  assert.equal(api.nextRequestDelay({ now: 1200, lastRequestAt: 1000, pauseUntil: 0 }), 400);
  assert.equal(api.nextRequestDelay({ now: 1200, lastRequestAt: 1000, pauseUntil: 6200 }), 5000);
});

test('backs off request spacing after rate limits and caps it at two seconds', () => {
  assert.equal(typeof api.backoffRequestSpacing, 'function', 'rate-limit backoff helper is missing');
  assert.equal(api.backoffRequestSpacing(600), 1200);
  assert.equal(api.backoffRequestSpacing(1200), 2000);
  assert.equal(api.backoffRequestSpacing(2000), 2000);
});

test('parses Retry-After seconds and HTTP-date values', () => {
  assert.equal(typeof api.retryAfterDelay, 'function', 'Retry-After parser is missing');
  assert.equal(api.retryAfterDelay('120', 1000), 120_000);
  assert.equal(api.retryAfterDelay(new Date(124_000).toUTCString(), 1000), 123_000);
  assert.equal(api.retryAfterDelay('not-a-date', 1000), 0);
});

test('403/429 response state pauses queued work and increases request spacing', () => {
  assert.equal(typeof api.updateRateLimitState, 'function', 'rate-limit state helper is missing');
  const throttled = api.updateRateLimitState({
    status: 429,
    now: 1000,
    pauseUntil: 0,
    requestSpacingMs: 600,
    retryAfter: '120'
  });
  assert.deepEqual(throttled, { pauseUntil: 121_000, requestSpacingMs: 1200 });
  assert.equal(api.nextRequestDelay({
    now: 1000,
    lastRequestAt: 1000,
    pauseUntil: throttled.pauseUntil,
    spacingMs: throttled.requestSpacingMs
  }), 120_000);

  const forbidden = api.updateRateLimitState({
    status: 403,
    now: 10_000,
    pauseUntil: 0,
    requestSpacingMs: 1200,
    retryAfter: null
  });
  assert.deepEqual(forbidden, { pauseUntil: 70_000, requestSpacingMs: 2000 });
});
