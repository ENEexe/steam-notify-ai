const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../webkit.js');

const disclosedPage = `
<div id="appHubAppName">Supermarket Chaos</div>
<div id="game_area_content_descriptors" class="game_area_description">
  <h2>AI Generated Content Disclosure</h2>
  <p>The developers describe how this game uses AI.</p>
  <p><i>Generative AI was used for some in-game textures.</i></p>
</div>`;

test('detects Steam’s explicit AI disclosure block', () => {
  assert.equal(typeof api.parseDisclosureStatus, 'function', 'disclosure parser is missing');
  assert.equal(api.parseDisclosureStatus(disclosedPage), 'disclosed');
});
