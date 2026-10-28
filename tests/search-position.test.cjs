const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

const row = { left: 816.67, top: 234.01, width: 878.21, height: 72.22 };
const release = { left: 1409.98, top: 278.73, right: 1485.76, bottom: 296.51 };
const review = { left: 1493.75, top: 277.62, right: 1523.75, bottom: 297.62 };
const reviewIcon = { left: 1493.75, top: 280.82, right: 1509.74, bottom: 296.81 };
const title = { left: 1013.65, top: 249.01, right: 1145.33, bottom: 267.90 };
const priceContent = { left: 1592.48, right: 1685.78, top: 256.13, bottom: 284.11 };
const badge = { width: 90.94, height: 22.2 };
const rowBorderLeft = 1.11111;
const rowBorderTop = 1.11111;

test('places the full badge above release/reviews and clear of visible discount and price text', () => {
  assert.equal(typeof api.computeSearchBadgePosition, 'function', 'search badge placement is missing');
  const pos = api.computeSearchBadgePosition({ row, rowBorderLeft, rowBorderTop, title, release, review, reviewIcon, priceContent, badge });
  assert.ok(pos);
  assert.equal(pos.compact, false);
  const originLeft = row.left + rowBorderLeft;
  const originTop = row.top + rowBorderTop;
  assert.ok(pos.left >= title.right - originLeft + 8);
  assert.ok(Math.abs(originLeft + pos.left + pos.width - reviewIcon.right) < 0.01);
  assert.ok(originLeft + pos.left + pos.width + 8 <= priceContent.left);
  assert.ok(originTop + pos.top + badge.height + 8 <= Math.min(release.top, review.top));
});

test('uses the review-icon column anchor for rows without a review icon', () => {
  const reviewIconWidth = 16;
  const pos = api.computeSearchBadgePosition({
    row, rowBorderLeft, rowBorderTop, title, release, review, reviewIcon: null,
    reviewIconWidth, priceContent, badge
  });
  assert.ok(pos);
  const originLeft = row.left + rowBorderLeft;
  assert.ok(Math.abs(originLeft + pos.left + pos.width - (review.left + reviewIconWidth)) < 0.01);
});

test('falls back to a compact badge on the artwork when the title leaves no safe gap', () => {
  const crowdedTitle = { left: 1013.65, top: 249.01, right: 1650, bottom: 267.90 };
  const pos = api.computeSearchBadgePosition({ row, title: crowdedTitle, release, review, priceContent, badge });
  assert.ok(pos);
  assert.equal(pos.compact, true);
  assert.equal(pos.fallback, 'artwork');
  assert.equal(pos.left, 8);
  assert.ok(pos.left + pos.width + 8 <= priceContent.left - row.left);
});
