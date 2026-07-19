# MapReach

**Turn Google Maps listings into organized outreach leads.**

MapReach is a personal, privacy-first Chrome extension (Manifest V3) that lives
in the browser **side panel**. Open a single business on Google Maps, and
MapReach reads the publicly visible details from that one listing, saves it
locally as a lead, generates a personalized outreach message (English, French,
or Arabic), lets you copy it, and tracks your outreach status in a lightweight
CRM.

It is built for freelancers and small agencies looking for local businesses that
may need a website, landing page, or other digital services — including
businesses whose only "website" is a Facebook or Instagram page.

---

## What MapReach does

- Reads the **currently open** Google Maps business listing (name, category,
  rating, reviews, phone, website, address, Maps URL).
- Detects whether the listing has a **real website**, only a **social media
  link** (Facebook, Instagram, WhatsApp, etc.), **no website**, or an
  **uncertain** website — a strong signal for prospecting.
- Generates an editable outreach message from a **category-aware template** in
  **English, French, or Arabic**, with smart language auto-detection.
- Copies the message to your clipboard so **you** review and send it manually.
- Saves leads locally with **duplicate detection** and an **update** flow that
  never overwrites your notes or status.
- Tracks leads in a full-tab **Tracker** with search, filters, sorting, inline
  status, notes, and **CSV export**.
- Manages templates, preferences, custom social domains, and JSON backup/restore
  in **Settings**.

## Explicit non-goals

MapReach is a personal productivity tool, **not** a scraping or automation tool.
It deliberately does **not**:

- ❌ Bulk-scrape search results, scroll listings, or crawl in the background.
- ❌ Auto-send messages on WhatsApp, Instagram, email, SMS, or anywhere.
- ❌ Automate, click, or navigate Google Maps or any third-party site.
- ❌ Bypass CAPTCHAs, rotate proxies, or use any anti-detection technique.
- ❌ Use a backend, database server, login, API key, analytics, or cloud sync.

All data stays in `chrome.storage.local`, in your Chrome profile only.

---

## Features

- **Side panel UI** that stays docked open while you work through listings and
  re-reads the listing automatically as you open different businesses.
- **Resilient extraction** with layered fallback selectors and graceful
  "Not found" states — it never invents data.
- **Real-vs-social website detection** with a distinct "Social media only" badge.
- **Trilingual templates** (EN / FR / AR) with right-to-left rendering for Arabic
  and a smart language selector (Auto / EN / FR / AR).
- **Mini CRM** (Tracker): search, status/category/website filters, sorting,
  notes, delete, and per-lead actions.
- **CSV export** with UTF-8 BOM, RFC-style escaping, and formula-injection
  protection.
- **JSON backup & restore** (validated, merge-only) in Settings.
- **Light & dark mode** (follows your OS).

---

## Folder structure

```
mapreach/
├── manifest.json
├── README.md
├── .gitignore
├── icons/
│   ├── README.md
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── background/
│   └── service-worker.js      # opens side panel on icon click; opens tracker/settings
├── content-scripts/
│   └── maps-scraper.js         # reads the open Maps listing (classic script)
├── sidepanel/                  # (renamed from "popup" — the extension is a side panel)
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── tracker/
│   ├── tracker.html
│   ├── tracker.css
│   └── tracker.js
├── settings/
│   ├── settings.html
│   ├── settings.css
│   └── settings.js
├── utils/                      # shared ES modules
│   ├── constants.js
│   ├── storage.js
│   ├── templates.js
│   ├── deduplication.js
│   ├── export.js
│   ├── formatters.js
│   └── validation.js
└── tools/                      # DEV-ONLY, not loaded by the extension
    ├── generate-icons.py       # regenerate placeholder icons
    └── dev-seed.js             # seed mock leads for UI testing
```

> **Note on `sidepanel/`:** the original brief listed a `popup/` folder. Because
> MapReach uses the Chrome **side panel** (so it stays open while you work), that
> folder is named `sidepanel/`. This is the only structural change from the
> original spec.

---

## Requirements

- **Google Chrome 114 or newer** (the side panel API requires it).

## Installation

1. Download or clone this project so the `mapreach/` folder is on disk.
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked**.
5. Select the `mapreach/` folder.
6. (Recommended) Click the puzzle-piece icon in the toolbar and **pin** MapReach.
7. Open [Google Maps](https://www.google.com/maps) and click an individual
   business listing.
8. Click the **MapReach toolbar icon** — the side panel opens and reads the
   current listing.

The panel stays open as you browse. Open another business and it updates (if you
have an unsaved edited message, it waits and offers a "Load it" button so your
text is never lost).

---

## Development / testing workflow

### Seed mock leads

To fill the Tracker with realistic sample data:

1. Open the Tracker (or side panel / Settings) so a MapReach page is focused.
2. Open DevTools → **Console** on that page.
3. Paste the entire contents of `tools/dev-seed.js`, press Enter.
4. Run `mapReachDevSeed()` (adds ~22 mock leads) or `mapReachDevClear()`
   (removes only the mock leads).

Mock leads use `dev:`-prefixed ids and never ship in production storage.

### Inspect the content-script console

The extraction logic runs in the Google Maps page context:

1. On a Google Maps listing, open DevTools → **Console**.
2. Set `const DEBUG = true;` at the top of `content-scripts/maps-scraper.js`
   and reload the extension + the Maps tab.
3. Logs are prefixed with `[MapReach]`, including the extracted lead object.

Remember to set `DEBUG` back to `false` before sharing/shipping.

### Updating selector strategies (when Google Maps changes)

Google Maps markup changes often. All brittle selectors live in one place:
the **`SELECTORS` block** near the top of `content-scripts/maps-scraper.js`.
Each field has layered fallbacks and degrades to `null` (with a warning) rather
than guessing.

Selectors verified against live Google Maps (July 2026):

| Field | Primary hook |
| --- | --- |
| Name | `h1` (e.g. `h1.DUwDvf`) |
| Category | `button[jsaction*="category"]` / `button.DkEaL` |
| Rating + reviews | `.F7nice` (rating span + `(53,928)` reviews) |
| Phone | `button[data-item-id^="phone:tel:"]` |
| Website | `a[data-item-id="authority"]` |
| Address | `button[data-item-id="address"]` |

If a field stops extracting, open the listing in DevTools, inspect the relevant
element, and update the matching entry in `SELECTORS`. The `data-item-id`
attributes are historically the most stable hooks.

### Regional Google domains

The content script and host permission target `https://www.google.com/maps/*`.
Match patterns do **not** support a `google.*` wildcard, so to support regional
domains (e.g. `google.fr`, `google.co.uk`) add explicit entries to **both**
`host_permissions` and `content_scripts[].matches` in `manifest.json`:

```json
"host_permissions": [
  "https://www.google.com/maps/*",
  "https://www.google.fr/maps/*",
  "https://www.google.co.uk/maps/*"
]
```

Add the same patterns under `content_scripts` → `matches`, then reload.

---

## How CSV export works

From the Tracker, **Export CSV** lets you export either the **filtered** leads
(what's currently shown) or **all** leads. The file:

- is named `mapreach-leads-YYYY-MM-DD.csv`,
- begins with a UTF-8 BOM so Excel renders Arabic and accented text correctly,
- quotes any field containing commas, quotes, or newlines (and doubles embedded
  quotes) per RFC 4180,
- prefixes a `'` to any cell starting with `=`, `+`, `-`, or `@` to prevent
  spreadsheet formula injection,
- is generated and downloaded entirely locally (no network, no `downloads`
  permission — it uses a Blob URL + anchor).

Columns: ID, Business Name, Category, Address, Phone, Website, Website Type,
Social Platform, Has Website, Rating, Review Count, Status, Message Language,
Notes, Maps URL, Saved At, Updated At, First Contacted At, Last Contacted At.

---

## Data & privacy

MapReach stores leads, notes, and templates in this Chrome profile using local
extension storage (`chrome.storage.local`). It does **not** send your saved lead
data to a MapReach server, and makes no network requests of its own. The only
outbound navigation is when **you** click a business's website link (opens in a
new tab) or the "Open Google Maps" button.

Back up or move your data with **Settings → Export JSON backup**, and restore it
(merge-only, deduplicated) with **Import**.

---

## Permissions & why each is needed

| Permission | Why |
| --- | --- |
| `storage` | Store leads, templates, and settings locally. |
| `sidePanel` | Render the docked side-panel UI. |
| `activeTab` | Reach the current Google Maps tab to request listing data. |
| `tabs` | Open the Tracker/Settings pages and detect the active tab's URL for the panel state. |
| `clipboardWrite` | Copy the generated message and phone number. |
| `host_permissions: https://www.google.com/maps/*` | Inject the content script and read the open listing. |

Deliberately **not** requested: `scripting`, `downloads`, `notifications`,
`identity`, `webRequest`, `unlimitedStorage`.

---

## Known limitations

- **Google Maps DOM changes.** Extraction depends on Maps' markup; if Google
  changes it, some fields may stop extracting until `SELECTORS` is updated.
- **Not every business exposes every field.** Missing values show as
  "Not found"/unavailable rather than being guessed.
- **Website classification isn't exhaustive.** The social-domain list is a
  best-effort default; extend it in Settings → Website detection.
- **Language auto-detection is heuristic.** Arabic script is detected reliably;
  French vs. English can't be told apart from a business name alone, so Auto
  falls back to the Maps page language and your default. You can always override.
- **Always verify before outreach.** Confirm the extracted details on the real
  listing before contacting anyone.

---

## Suggested next-phase ideas (Not implemented in V1)

- Optional cloud backup / sync
- Follow-up reminders and due dates
- Richer analytics (funnel, response rates)
- Per-lead contact history / timeline
- Google Sheets export
- Additional multi-language template packs

---

## Creating / replacing icons

See [`icons/README.md`](icons/README.md). In short: replace `icon16.png`,
`icon48.png`, and `icon128.png` with same-named/sized PNGs, or regenerate the
placeholders with `python3 tools/generate-icons.py`.

---

*MapReach is a personal tool. Use it responsibly and respect the terms of
service of any site you visit.*
