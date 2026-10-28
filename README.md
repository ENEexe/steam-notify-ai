# Steam Notify AI

A small SFP customization for Steam. It highlights Store games whose Steam product page contains the developer's explicit **AI Generated Content Disclosure**. 

For each unique uncached AppID, it makes a same-origin GET to Steam's `/app/{AppID}/?l=english` product page (not a separate Steam Web API), using the browser's normal same-origin credentials. It fetches the page HTML and checks the app-page marker (`appHubAppName`) and the exact disclosure heading in `game_area_content_descriptors`; age-gated or error responses are treated as unknown. 

The script does not store the HTML or send it to a third party; local storage caches only the AppID's `disclosed`/`clean` result and check timestamp for 7 days. 

The Store script does **not** hide games, infer undisclosed AI use, report games, or change account data.

## Screenshots

Examples of the disclosure badge and product-page banner in Steam:

**Steam search listing**

![Steam search listing with an AI-disclosure badge](screenshots/steam-search-listing.webp)

**Featured page listing**

![Steam featured-page listing with an AI-disclosure badge](screenshots/featured-page-listing.webp)

**Game details page**

![Steam game details page with the AI-disclosure banner](screenshots/game-details.webp)

**Featured page carousel**

![Steam featured carousel with an AI-disclosure badge](screenshots/featured-page-carousel.webp)

## Behavior and limits

- Matches Steam's explicit developer-authored disclosure heading. It does not determine whether a game used AI when the developer did not disclose it.
- Does not use community reports or third-party disclosure databases.
- Checks Store cards with same-origin Steam Store requests; caches results for 7 days, allows at most two concurrent lookups, starts requests 600 ms apart, and backs off to 1.2–2 seconds plus at least a 60-second pause after HTTP 403/429 responses (honoring longer `Retry-After` headers).
- Defers cards beyond the queue limit rather than dropping them.
- Handles lazy-loaded cards, multiple Steam descriptor blocks, release/review alignment (including rows without a review icon), and a product-page banner whose disclosure link centers and focuses the explicit disclosure.

## Quick setup

1. Install and run [SFP](https://github.com/PhantomGamers/SFP) using its [official setup guide](https://github.com/PhantomGamers/SFP#instructions) and [official releases](https://github.com/PhantomGamers/SFP/releases); keep SFP running while Steam is open.
2. Download `webkit.js` from the [latest release](https://github.com/ENEexe/steam-notify-ai/releases/latest) and put it in Steam's `steamui` folder using SFP's **Open File** controls.
3. Enable **JavaScript injection** in SFP's settings menu under **Steam** category (you might need to scroll down a bit). JavaScript injection is disabled by default; Enable it only after reviewing the script.
4. Start/restart Steam through SFP and confirm `webkit.js` appears in SFP's injection log.

## Tests

Requires Node.js with the built-in test runner; there are no npm dependencies.

```bash
node --check webkit.js
node --test tests/*.test.cjs
```

## Credits and license

The Store-listing disclosure-highlighting idea is adapted from **[Steam Hide AI](https://github.com/Suvitruf/steam-hide-ai)**, a Tampermonkey/Violentmonkey userscript by **Suvitruf (Andrei Apanasik)**. This repository is a separate SFP-focused implementation: it highlights disclosed games instead of hiding them and does not include the upstream community reporting or filtering features. This project is released under the **[MIT License](LICENSE)**;

SFP is maintained by [PhantomGamers](https://github.com/PhantomGamers/SFP). Steam and Valve are trademarks of Valve Corporation. This project is unofficial and is not affiliated with or endorsed by Valve, SFP, or the upstream userscript author.

## AI assistance disclosure

Generative AI assisted the development and maintenance of this repository: code adaptation and cleanup, debugging, test creation, and documentation were done with the help of OpenAI GPT-6 Luna. The runtime itself does **not** call an AI model or AI service. Its result is based only on Steam's explicit developer disclosure text; the badge is not an AI classification or a claim about undisclosed AI use.

The code, tests, and README were reviewed and approved by a human.

Which is ironic considering this project was created to warn users about the use of AI in games... But it would be wrong not to mention that I used AI myself.
