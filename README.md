# MapReach

**Tagline:** Turn Google Maps listings into organized outreach leads.

MapReach is a personal Chrome extension for capturing one Google Maps business listing at a time, organizing leads locally, generating outreach drafts from editable templates, and tracking outreach progress in a compact mini CRM.

## What MapReach does

- Reads only the **currently open** Google Maps business listing in your active tab
- Extracts public fields when available (name, category, phone, website, rating/reviews, address)
- Shows transparent missing-data states (for example, **No website detected** or **Website not confirmed**)
- Saves leads locally in `chrome.storage.local`
- Prevents duplicates and offers explicit update behavior
- Generates editable outreach text from templates
- Copies text to clipboard for **manual** sending
- Tracks lead status, notes, filtering, sorting, and CSV export

## Explicit non-goals

MapReach intentionally does **not** include:

- Bulk scraping
- Automatic messaging
- Any automation on WhatsApp, Instagram, email, SMS, or Google Maps
- Background crawling
- Cloud sync
- External APIs, backend, login, analytics, or tracking

## Features

- **Popup extraction flow**
  - Loading, no-Maps, no-listing, extraction-error, and success states
  - Warning list for partial extraction
  - Website state clarity: detected / no website / unknown
- **Lead save + update logic**
  - New leads default to `unsent`
  - Duplicate detection by place ID, phone, domain+name, name+address, fingerprint
  - Explicit `Update lead` action preserves notes/status/contact history
- **Template workflow**
  - Seeded category-aware defaults
  - Editable generated message textarea
  - Clipboard copy confirmation
- **Tracker page**
  - Search, filters, sort, status updates, notes editor, delete
  - Table view (desktop) and card view (narrow screens)
  - Export all or filtered leads to CSV
- **Settings page**
  - Template CRUD + default template + reset defaults
  - General behavior preferences
  - JSON backup export/import (merge strategy)
  - Local privacy disclosure

## Folder structure

```text
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
│   └── service-worker.js
├── content-scripts/
│   └── maps-scraper.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── tracker/
│   ├── tracker.html
│   ├── tracker.css
│   └── tracker.js
├── settings/
│   ├── settings.html
│   ├── settings.css
│   └── settings.js
└── utils/
    ├── constants.js
    ├── storage.js
    ├── templates.js
    ├── deduplication.js
    ├── export.js
    ├── formatters.js
    └── validation.js
```

## Installation (Chrome, unpacked)

1. Download/clone this project.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `mapreach` folder.
6. Open Google Maps, open one business listing, then open the MapReach popup.

## Development and testing workflow

1. Load unpacked extension from `mapreach/`.
2. Open `chrome://extensions`, find MapReach, click **Service worker** to inspect background logs.
3. Test popup states:
   - Non-Maps tab
   - Google Maps search page with no listing selected
   - Google Maps listing with full data
   - Listing missing website
4. Save leads, reopen popup, confirm duplicate/update behavior.
5. Open tracker and test filters, status updates, notes, delete, CSV export.
6. Open settings and test template edits, reset defaults, JSON export/import.

### Inspect content-script logs

- Open Google Maps listing page
- Press `F12` (or right click → Inspect)
- Use the page console (not service worker console)
- Enable debug mode in Settings if you want more extraction diagnostics
- Content-script logs are prefixed with `[MapReach]`

## Updating selector strategies when Google Maps changes

Edit `content-scripts/maps-scraper.js`:

- Keep updates inside the **SELECTORS / EXTRACTION STRATEGIES** section
- Prefer semantic/accessibility signals before class-name-only selectors
- Validate extraction on multiple listing types

Recommended maintenance order:
1. Name extraction
2. Website extraction
3. Phone extraction
4. Address/category
5. Rating/review parsing

## Data privacy

MapReach stores leads, notes, templates, and settings in your Chrome profile using `chrome.storage.local`.

- No telemetry
- No analytics
- No backend
- No third-party API requests from extension code

## CSV export behavior

- Supports export of **all** leads or **currently filtered** leads
- Uses UTF-8 BOM for better Excel compatibility
- Escapes commas/quotes/newlines using RFC-style CSV rules
- Protects against spreadsheet formula injection by prefixing risky leading characters

## Icons

Placeholder files are included so the extension loads without manifest icon errors.

To replace icons:

1. Create PNG files at:
   - `icons/icon16.png`
   - `icons/icon48.png`
   - `icons/icon128.png`
2. Keep the same file names (manifest already references them).

Suggested visual concept: map pin + upward-right arrow or small message bubble.

## Host permissions note

The manifest currently uses:

- `https://www.google.com/maps/*`

If you need regional domains later, add explicit valid patterns one by one (for example `https://www.google.co.uk/maps/*`) and retest. Avoid over-broad host permissions.

## Known limitations

- Google Maps DOM changes can require selector updates
- Not every listing exposes every field
- Website detection can be uncertain for some listings
- User should review extracted data before outreach

## Not implemented in V1

- Optional cloud backup
- Follow-up reminders
- Richer analytics
- Per-lead contact history timeline
- Google Sheets export
- Multi-language template packs
