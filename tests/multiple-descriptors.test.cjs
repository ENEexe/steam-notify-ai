const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

test('finds an AI disclosure after a separate mature-content descriptor block', () => {
  const html = `
    <div id="appHubAppName">SQUIRT GAME</div>
    <div id="game_area_content_descriptors"><h2>Mature Content Description</h2><p>Adult content.</p></div>
    <div class="game_page_autocollapse">
      <div id="game_area_content_descriptors"><h2>AI Generated Content Disclosure</h2><p>AI tools were used.</p></div>
    </div>`;
  assert.equal(api.parseDisclosureStatus(html), 'disclosed');
});
