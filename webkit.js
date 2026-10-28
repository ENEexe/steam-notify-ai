(() => {
"use strict";

/*
 * Steam Notify AI — SFP Store disclosure highlighter.
 * Inspired by the disclosure-highlighting behavior in Steam Hide AI:
 * https://github.com/Suvitruf/steam-hide-ai
 *
 * Marks only Steam's explicit AI Generated Content Disclosure. It does not
 * submit reports, hide games, contact third-party servers, or read account data.
 * Listing lookups are same-origin Steam Store requests, throttled and cached.
 */
const DISCLOSURE_TITLE = "AI Generated Content Disclosure";
const CACHE_KEY = "sfp-ai-disclosure-cache-v2";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_QUEUED_LOOKUPS = 120;
const REQUEST_SPACING_MS = 600;
const MAX_REQUEST_SPACING_MS = 2_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_CONCURRENT_REQUESTS = 2;
const APP_SELECTOR = '[data-ds-appid], a[href*="/app/"]';
const CARD_CLASS = "sfp-ai-disclosed-card";
const CARD_BADGE_CLASS = "sfp-ai-disclosure-badge";
const CARD_BADGE_BASE_CLASS = "sfp-ai-card-badge";
const SEARCH_BADGE_CLASS = "sfp-ai-search-badge";
const SEARCH_BADGE_COMPACT_CLASS = "sfp-ai-search-badge-compact";
const CHECKING_BADGE_CLASS = "sfp-ai-checking-badge";
const CHECKING_ROW_CLASS = "sfp-ai-checking-row";
const SECTION_CLASS = "sfp-ai-disclosure-section";
const PRODUCT_BANNER_CLASS = "sfp-ai-disclosure-product-banner";
const PRODUCT_BADGE_CLASS = "sfp-ai-disclosure-product-badge";
const PRODUCT_LINK_CLASS = "sfp-ai-disclosure-product-link";
const DETAILS_ANCHOR_ID = "sfp-ai-disclosure-details";
const COMPACT_BADGE_WIDTH = 32;
const CHECKED_ATTRIBUTE = "data-sfp-ai-checked";
const STYLE_ID = "sfp-ai-disclosure-highlighter-style";

function normalizeTitle(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function stripAndDecode(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDisclosureStatus(html) {
  if (typeof html !== "string" || html.length === 0) return "unknown";
  if (/id=["']agegate_box["']|agegate_text_area|agecheck_form/i.test(html)) return "unknown";
  if (!/\bid=["']appHubAppName["']|class=["'][^"']*\bapphub_AppName\b/i.test(html)) return "unknown";
  const blocks = html.matchAll(/<div\b(?=[^>]*\bid\s*=\s*["']game_area_content_descriptors["'])[^>]*>([\s\S]*?)<\/div\s*>/gi);
  for (const block of blocks) {
    const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/i.exec(block[1]);
    if (heading && normalizeTitle(stripAndDecode(heading[1])) === normalizeTitle(DISCLOSURE_TITLE)) {
      return "disclosed";
    }
  }
  return "clean";
}

function extractAppIds(dataDsAppId, href) {
  const ids = new Set();
  for (const part of String(dataDsAppId ?? "").split(",")) {
    const value = Number.parseInt(part.trim(), 10);
    if (Number.isSafeInteger(value) && value > 0) ids.add(value);
  }
  if (ids.size === 0) {
    const match = /\/app\/(\d+)(?:\/|$|[?#])/.exec(String(href ?? ""));
    if (match) ids.add(Number.parseInt(match[1], 10));
  }
  return [...ids];
}

function markCardChecked(element, appIds) {
  const key = appIds.join(",");
  if (element.getAttribute(CHECKED_ATTRIBUTE) === key) return false;
  element.setAttribute(CHECKED_ATTRIBUTE, key);
  return true;
}

function searchResultRow(element) {
  return element?.closest?.("a.search_result_row") || null;
}

function trackPendingAppId(pendingByRow, row, appId) {
  let pending = pendingByRow.get(row);
  if (!pending) {
    pending = new Set();
    pendingByRow.set(row, pending);
  }
  pending.add(String(appId));
  return pending.size;
}

function resolvePendingAppId(pendingByRow, row, appId) {
  const pending = pendingByRow.get(row);
  if (!pending) return 0;
  pending.delete(String(appId));
  if (pending.size === 0) {
    pendingByRow.delete(row);
    return 0;
  }
  return pending.size;
}

function cacheStatus(cache, appId, now = Date.now()) {
  const record = cache?.[String(appId)];
  if (!record || !["disclosed", "clean"].includes(record.status)) return null;
  if (!Number.isFinite(record.checkedAt) || now - record.checkedAt > CACHE_TTL_MS) return null;
  return record.status;
}

function enqueueLookup(queue, queued, deferred, appId, limit = MAX_QUEUED_LOOKUPS) {
  const key = String(appId);
  if (queued.has(key) || deferred.has(key)) return "already";
  if (queue.length >= limit) {
    deferred.add(key);
    return "deferred";
  }
  queue.push(key);
  queued.add(key);
  return "queued";
}

function drainDeferredLookups(queue, queued, deferred, limit = MAX_QUEUED_LOOKUPS) {
  while (queue.length < limit && deferred.size > 0) {
    const key = deferred.values().next().value;
    deferred.delete(key);
    if (queued.has(key)) continue;
    queue.push(key);
    queued.add(key);
  }
}

function nextRequestDelay({ now, lastRequestAt, pauseUntil, spacingMs = REQUEST_SPACING_MS }) {
  return Math.max(0, pauseUntil - now, lastRequestAt + spacingMs - now);
}

function backoffRequestSpacing(currentSpacingMs) {
  return Math.min(Math.max(currentSpacingMs, REQUEST_SPACING_MS) * 2, MAX_REQUEST_SPACING_MS);
}

function retryAfterDelay(value, now = Date.now()) {
  const header = String(value ?? "").trim();
  if (!header) return 0;
  if (/^\d+(?:\.\d+)?$/.test(header)) {
    const seconds = Number(header);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }
  const retryAt = Date.parse(header);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : 0;
}

function updateRateLimitState({ status, now, pauseUntil, requestSpacingMs, retryAfter }) {
  if (status !== 403 && status !== 429) return { pauseUntil, requestSpacingMs };
  const retryAfterMs = retryAfterDelay(retryAfter, now);
  return {
    pauseUntil: Math.max(pauseUntil, now + Math.max(60_000, retryAfterMs)),
    requestSpacingMs: backoffRequestSpacing(requestSpacingMs)
  };
}

function computeSearchBadgePosition({ row, rowBorderLeft = 0, rowBorderTop = 0, title, release, review, reviewIcon, reviewIconWidth = 16, priceContent, badge, compactWidth = COMPACT_BADGE_WIDTH, gap = 8 }) {
  if (!row || !title || !release || !review || !priceContent || !badge) return null;
  const originLeft = row.left + rowBorderLeft;
  const originTop = row.top + rowBorderTop;
  const titleRight = title.right - originLeft;
  const priceContentLeft = priceContent.left - originLeft;
  const minLeft = titleRight + gap;
  const metadataRight = (reviewIcon?.right ?? review.left + reviewIconWidth) - originLeft;
  let width = badge.width;
  let compact = false;
  let maxLeft = priceContentLeft - gap - width;
  if (maxLeft < minLeft) {
    width = compactWidth;
    compact = true;
    maxLeft = priceContentLeft - gap - width;
  }
  const metadataTop = Math.min(release.top, review.top) - originTop;
  const top = metadataTop - badge.height - gap;
  if (top < 0) return null;
  if (maxLeft < minLeft) {
    return { left: 8, top, width: compactWidth, compact: true, fallback: "artwork" };
  }
  const preferredLeft = metadataRight - width;
  const left = Math.max(minLeft, Math.min(preferredLeft, maxLeft));
  return { left, top, width, compact };
}

function ensureProductBanner(doc, purchase, appId) {
  if (!purchase?.parentElement) return null;
  let banner = doc.querySelector(`.${PRODUCT_BANNER_CLASS}`);
  if (banner && banner.getAttribute("data-app-id") !== String(appId)) {
    banner.remove();
    banner = null;
  }
  if (!banner) {
    banner = doc.createElement("div");
    banner.className = PRODUCT_BANNER_CLASS;
    banner.setAttribute("data-app-id", String(appId));
    const badge = doc.createElement("span");
    badge.className = PRODUCT_BADGE_CLASS;
    badge.textContent = "AI disclosed";
    const link = doc.createElement("a");
    link.className = PRODUCT_LINK_CLASS;
    link.setAttribute("href", `#${DETAILS_ANCHOR_ID}`);
    link.textContent = "View disclosure";
    link.setAttribute("title", "Jump to the developer's AI content disclosure");
    banner.append(badge, link);
  }
  if (banner.parentElement !== purchase.parentElement || banner.nextElementSibling !== purchase) {
    purchase.parentElement.insertBefore(banner, purchase);
  }
  return banner;
}

function startRuntime(win, doc) {
  if (!win.location || win.location.hostname !== "store.steampowered.com") return false;
  if (win.__SFP_AI_DISCLOSURE_HIGHLIGHTER__) return false;
  win.__SFP_AI_DISCLOSURE_HIGHLIGHTER__ = true;

  installStyles(doc);

  let storage = null;
  let cache = {};
  try {
    storage = win.localStorage;
    const parsed = JSON.parse(storage.getItem(CACHE_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) cache = parsed;
  } catch {
    storage = null;
    cache = {};
  }

  const cardsByAppId = new Map();
  const pendingAppIdsByRow = new WeakMap();
  const queued = new Set();
  const deferred = new Set();
  const queue = [];
  const cardIds = new WeakMap();
  let activeRequests = 0;
  let lastRequestAt = 0;
  let pauseUntil = 0;
  let requestSpacingMs = REQUEST_SPACING_MS;
  let queueTimer = 0;
  let scanTimer = 0;

  function saveCache() {
    if (!storage) return;
    const now = Date.now();
    const entries = Object.entries(cache)
      .filter(([id]) => cacheStatus(cache, id, now) !== null)
      .sort((a, b) => a[1].checkedAt - b[1].checkedAt)
      .slice(-MAX_CACHE_ENTRIES);
    cache = Object.fromEntries(entries);
    try {
      storage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Storage can be unavailable or full; this page still works in memory.
    }
  }

  function addBadge(element, className, text, title) {
    if (!element) return null;
    const existing = element.querySelector(`.${className}`);
    if (existing) return existing;
    const badge = doc.createElement("span");
    badge.className = className;
    badge.classList.add(CARD_BADGE_BASE_CLASS);
    badge.textContent = text;
    badge.setAttribute("title", title);
    badge.setAttribute("aria-label", title);
    element.appendChild(badge);
    return badge;
  }

  function showCheckingIndicator(row) {
    if (!row || row.classList.contains(CARD_CLASS)) return;
    const badge = addBadge(
      row,
      CHECKING_BADGE_CLASS,
      "Checking…",
      "Checking Steam for the developer's AI content disclosure"
    );
    if (!badge) return;
    row.classList.add(CHECKING_ROW_CLASS);
    positionSearchBadge(row, badge, "Checking…", "…");
  }

  function removeCheckingIndicator(row) {
    if (!row) return;
    row.querySelector(`.${CHECKING_BADGE_CLASS}`)?.remove();
    row.classList.remove(CHECKING_ROW_CLASS);
  }

  function visiblePriceBounds(priceElement) {
    const bounds = [];
    const elements = [priceElement, ...priceElement.querySelectorAll("*")];
    for (const element of elements) {
      if (element.classList?.contains("discount_aria_label")) continue;
      const style = win.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) bounds.push(rect);
    }
    if (bounds.length === 0) return priceElement.getBoundingClientRect();
    return {
      left: Math.min(...bounds.map((rect) => rect.left)),
      right: Math.max(...bounds.map((rect) => rect.right)),
      top: Math.min(...bounds.map((rect) => rect.top)),
      bottom: Math.max(...bounds.map((rect) => rect.bottom))
    };
  }

  function positionSearchBadge(row, badge, label = "AI disclosed", compactLabel = "AI") {
    const title = row.querySelector(".search_name .title") || row.querySelector(".search_name");
    const release = row.querySelector(".search_released");
    const review = row.querySelector(".search_reviewscore");
    const reviewIconElement = review?.querySelector(".search_review_summary");
    const reviewIconRect = reviewIconElement?.getBoundingClientRect() || null;
    const referenceReviewIcon = reviewIconElement || doc.querySelector(".search_review_summary");
    const reviewIconWidth = reviewIconRect?.width || referenceReviewIcon?.getBoundingClientRect().width || 16;
    const price = row.querySelector(".search_price_discount_combined");
    if (!title || !release || !review || !price) return false;

    badge.classList.add(SEARCH_BADGE_CLASS);
    badge.classList.remove(SEARCH_BADGE_COMPACT_CLASS);
    badge.textContent = label;
    const rowRect = row.getBoundingClientRect();
    const rowStyle = win.getComputedStyle(row);
    const rects = {
      row: rowRect,
      rowBorderLeft: parseFloat(rowStyle.borderLeftWidth) || 0,
      rowBorderTop: parseFloat(rowStyle.borderTopWidth) || 0,
      title: title.getBoundingClientRect(),
      release: release.getBoundingClientRect(),
      review: review.getBoundingClientRect(),
      reviewIcon: reviewIconRect,
      reviewIconWidth,
      priceContent: visiblePriceBounds(price),
      badge: badge.getBoundingClientRect()
    };
    let position = computeSearchBadgePosition(rects);
    if (!position) {
      badge.classList.remove(SEARCH_BADGE_CLASS);
      return false;
    }
    if (position.compact) {
      badge.classList.add(SEARCH_BADGE_COMPACT_CLASS);
      badge.textContent = compactLabel;
      rects.badge = badge.getBoundingClientRect();
      position = computeSearchBadgePosition({ ...rects, compactWidth: rects.badge.width });
      if (!position) {
        badge.classList.remove(SEARCH_BADGE_CLASS, SEARCH_BADGE_COMPACT_CLASS);
        badge.textContent = label;
        return false;
      }
    }
    badge.style.setProperty("--sfp-ai-search-left", `${position.left}px`);
    badge.style.setProperty("--sfp-ai-search-top", `${position.top}px`);
    return true;
  }

  function highlightCard(element) {
    if (!element) return;
    const searchRow = searchResultRow(element);
    const card = searchRow || element;
    if (searchRow) removeCheckingIndicator(searchRow);
    if (!element.isConnected) {
      element.removeAttribute(CHECKED_ATTRIBUTE);
      return;
    }
    if (card.classList.contains(CARD_CLASS)) return;
    card.classList.add(CARD_CLASS);
    const badge = addBadge(
      card,
      CARD_BADGE_CLASS,
      "AI disclosed",
      "Steam developer AI content disclosure found"
    );
    if (searchRow && badge) positionSearchBadge(searchRow, badge);
  }

  function ensureDetailsAnchor(block) {
    let anchor = block.querySelector(`#${DETAILS_ANCHOR_ID}`);
    if (!anchor) {
      anchor = doc.createElement("span");
      anchor.id = DETAILS_ANCHOR_ID;
      anchor.className = "sfp-ai-disclosure-details-anchor";
      block.insertBefore(anchor, block.firstChild);
    }
  }

  function highlightDisclosureSection() {
    const blocks = [...doc.querySelectorAll('[id="game_area_content_descriptors"]')];
    const disclosureBlocks = blocks.filter((block) => {
      const heading = block.querySelector("h2");
      return normalizeTitle(heading?.textContent) === normalizeTitle(DISCLOSURE_TITLE);
    });
    if (disclosureBlocks.length === 0) return;

    for (const block of disclosureBlocks) {
      block.classList.add(SECTION_CLASS);
      ensureDetailsAnchor(block);
    }
    const appId = /^\/app\/(\d+)(?:\/|$)/.exec(win.location.pathname)?.[1] || "unknown";
    ensureProductBanner(doc, doc.querySelector("#game_area_purchase"), appId);
  }

  function updateCards(appId, status) {
    const cards = cardsByAppId.get(String(appId));
    if (!cards) return;
    for (const card of cards) {
      const row = searchResultRow(card);
      const remaining = row ? resolvePendingAppId(pendingAppIdsByRow, row, appId) : 0;
      if (status === "disclosed") {
        highlightCard(card);
      } else if (row && remaining === 0) {
        removeCheckingIndicator(row);
      }
    }
  }

  function storeCache(appId, status) {
    if (status !== "disclosed" && status !== "clean") return;
    cache[String(appId)] = { status, checkedAt: Date.now() };
    saveCache();
  }

  async function fetchStatus(appId) {
    const url = new URL(`/app/${appId}/?l=english`, win.location.origin).href;
    const response = await win.fetch(url, {
      credentials: "same-origin",
      redirect: "follow"
    });
    if (response.status === 403 || response.status === 429) {
      const rateLimit = updateRateLimitState({
        status: response.status,
        now: Date.now(),
        pauseUntil,
        requestSpacingMs,
        retryAfter: response.headers?.get?.("Retry-After")
      });
      pauseUntil = rateLimit.pauseUntil;
      requestSpacingMs = rateLimit.requestSpacingMs;
      return "unknown";
    }
    if (!response.ok) return "unknown";
    try {
      if (new URL(response.url || url).pathname.startsWith("/agecheck/")) return "unknown";
    } catch {
      return "unknown";
    }
    return parseDisclosureStatus(await response.text());
  }

  function pumpQueue() {
    if (queueTimer) return;
    while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
      const wait = nextRequestDelay({
        now: Date.now(),
        pauseUntil,
        lastRequestAt,
        spacingMs: requestSpacingMs
      });
      if (wait > 0) {
        queueTimer = win.setTimeout(() => {
          queueTimer = 0;
          pumpQueue();
        }, Math.min(wait, MAX_TIMER_DELAY_MS));
        return;
      }

      const appId = queue.shift();
      activeRequests++;
      lastRequestAt = Date.now();
      fetchStatus(appId)
        .then((status) => {
          storeCache(appId, status);
          updateCards(appId, status);
        })
        .catch(() => {
          updateCards(appId, "unknown");
          // Network failures are not cached; the next page visit can retry.
        })
        .finally(() => {
          activeRequests--;
          queued.delete(String(appId));
          cardsByAppId.delete(String(appId));
          drainDeferredLookups(queue, queued, deferred, MAX_QUEUED_LOOKUPS);
          pumpQueue();
        });
    }
  }

  function queueLookup(appId, card) {
    const key = String(appId);
    const cached = cacheStatus(cache, key);
    if (cached === "disclosed") {
      highlightCard(card);
      return;
    }
    if (cached === "clean") return;

    let cards = cardsByAppId.get(key);
    if (!cards) {
      cards = new Set();
      cardsByAppId.set(key, cards);
    }
    cards.add(card);
    const row = searchResultRow(card);
    if (row) {
      trackPendingAppId(pendingAppIdsByRow, row, key);
      showCheckingIndicator(row);
    }
    if (enqueueLookup(queue, queued, deferred, key, MAX_QUEUED_LOOKUPS) === "queued") {
      pumpQueue();
    }
  }

  function scan() {
    highlightDisclosureSection();
    if (/^\/app\/\d+(?:\/|$)/.test(win.location.pathname)) return;
    if (!doc.body) return;

    for (const row of doc.querySelectorAll("a.search_result_row." + CARD_CLASS)) {
      const badge = row.querySelector("." + CARD_BADGE_CLASS);
      if (badge) positionSearchBadge(row, badge);
    }
    for (const row of doc.querySelectorAll("a.search_result_row." + CHECKING_ROW_CLASS)) {
      const badge = row.querySelector("." + CHECKING_BADGE_CLASS);
      if (badge) positionSearchBadge(row, badge, "Checking…", "…");
    }

    for (const element of doc.querySelectorAll(APP_SELECTOR)) {
      if (element.parentElement?.closest(APP_SELECTOR)) continue;
      if (element.closest(".sfp-ai-disclosure-badge")) continue;
      const ids = extractAppIds(
        element.getAttribute("data-ds-appid"),
        element.getAttribute("href")
      );
      if (ids.length === 0 || !markCardChecked(element, ids)) continue;
      if (intersectionObserver) {
        cardIds.set(element, ids);
        intersectionObserver.observe(element);
      } else {
        for (const appId of ids) queueLookup(appId, element);
      }
    }
  }

  const intersectionObserver = typeof win.IntersectionObserver === "function"
    ? new win.IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          intersectionObserver.unobserve(entry.target);
          const ids = cardIds.get(entry.target);
          if (ids) for (const appId of ids) queueLookup(appId, entry.target);
        }
      }, { rootMargin: "400px" })
    : null;

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = win.setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 120);
  }

  function attach() {
    if (!doc.body) return;
    scan();
    if (typeof win.MutationObserver === "function") {
      const observer = new win.MutationObserver(scheduleScan);
      observer.observe(doc.body, { childList: true, subtree: true });
    }
    if (typeof win.addEventListener === "function") {
      win.addEventListener("resize", scheduleScan, { passive: true });
    }
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", attach, { once: true });
  } else {
    attach();
  }
  return true;
}

function buildStyles() {
  return `
    .${CARD_CLASS} {
      outline: 2px solid #e14b4b !important;
      outline-offset: -2px !important;
      box-shadow: 0 0 0 2px rgba(225, 75, 75, .35) !important;
    }
    .search_result_row.${CARD_CLASS} {
      position: relative !important;
    }
    .search_result_row.${CHECKING_ROW_CLASS} {
      position: relative !important;
    }
    .${CARD_BADGE_BASE_CLASS},
    .${PRODUCT_BADGE_CLASS} {
      display: inline-block !important;
      padding: 4px 7px !important;
      border-radius: 4px !important;
      background: #a92727 !important;
      color: #fff !important;
      font: 700 10px/1.2 Arial, sans-serif !important;
      letter-spacing: .03em !important;
      text-transform: uppercase !important;
    }
    .${CARD_BADGE_BASE_CLASS} {
      position: absolute !important;
      z-index: 9999 !important;
      top: 6px !important;
      right: 6px !important;
      border: 1px solid rgba(255,255,255,.4) !important;
      box-shadow: 0 1px 5px rgba(0,0,0,.55) !important;
      pointer-events: none !important;
    }
    .${CHECKING_BADGE_CLASS} {
      background: #536777 !important;
      border-color: rgba(255,255,255,.25) !important;
      font-size: 9px !important;
      text-transform: none !important;
    }
    .${SEARCH_BADGE_CLASS} {
      left: var(--sfp-ai-search-left, auto) !important;
      right: auto !important;
      top: var(--sfp-ai-search-top, 6px) !important;
      bottom: auto !important;
    }
    .${SEARCH_BADGE_COMPACT_CLASS} {
      width: ${COMPACT_BADGE_WIDTH}px !important;
      box-sizing: border-box !important;
      padding: 3px 4px !important;
      font-size: 9px !important;
      text-align: center !important;
    }
    .${SECTION_CLASS} {
      outline: 2px solid #e14b4b !important;
      outline-offset: 5px !important;
      background: rgba(225, 75, 75, .09) !important;
    }
    .${PRODUCT_BANNER_CLASS} {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      margin: 0 0 12px !important;
      padding: 8px 10px !important;
      border-left: 3px solid #e14b4b !important;
      border-radius: 3px !important;
      background: rgba(225, 75, 75, .10) !important;
      color: inherit !important;
    }
    .${PRODUCT_BADGE_CLASS} {
      white-space: nowrap !important;
    }
    .${PRODUCT_LINK_CLASS} {
      margin-left: auto !important;
      color: #c6d4df !important;
      font: inherit !important;
      text-decoration: underline !important;
      white-space: nowrap !important;
    }
    .sfp-ai-disclosure-details-anchor {
      display: block !important;
      height: 0 !important;
      scroll-margin-top: 16px !important;
    }
  `;
}

function installStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = buildStyles();
  (doc.head || doc.documentElement).appendChild(style);
}

const api = {
  parseDisclosureStatus,
  extractAppIds,
  markCardChecked,
  searchResultRow,
  trackPendingAppId,
  resolvePendingAppId,
  cacheStatus,
  enqueueLookup,
  drainDeferredLookups,
  nextRequestDelay,
  backoffRequestSpacing,
  retryAfterDelay,
  updateRateLimitState,
  computeSearchBadgePosition,
  ensureProductBanner,
  buildStyles,
  startRuntime,
  CACHE_TTL_MS
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined" && typeof document !== "undefined") {
  startRuntime(window, document);
}
})();
