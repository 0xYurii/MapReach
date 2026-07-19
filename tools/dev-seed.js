/*
 * MapReach — DEVELOPMENT-ONLY mock data seeder.
 *
 * This file is NOT loaded by the extension and never runs in production.
 * It exists so you can populate the Tracker with realistic sample leads while
 * testing the UI.
 *
 * HOW TO USE
 * 1. Load the extension (chrome://extensions -> Load unpacked).
 * 2. Open the Tracker (or the side panel / Settings) so a MapReach extension
 *    page is focused.
 * 3. Open DevTools (F12) -> Console, ON THAT MapReach page (extension origin).
 * 4. Paste the ENTIRE contents of this file and press Enter.
 * 5. Run:  mapReachDevSeed()      // adds ~22 mock leads (merges, deduped)
 *    or:   mapReachDevClear()     // removes ONLY the mock leads added here
 *
 * The mock leads use ids prefixed with "dev:" so mapReachDevClear() can remove
 * exactly them without touching real leads.
 */
(function () {
  const KEY = 'mapreach_leads';
  const now = Date.now();
  const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();

  const CATS = ['Italian restaurant', 'Dental clinic', 'Hair salon', 'Gym', 'Auto mechanic', 'Café', 'Bakery', 'Barber shop', 'Pizzeria', 'Law firm'];
  const STAT = ['unsent', 'sent', 'replied', 'interested', 'closed', 'not_interested'];
  const WEB = [
    { websiteType: 'real', hasWebsite: true, website: 'https://example-biz.com', socialPlatform: null },
    { websiteType: 'social', hasWebsite: false, website: 'https://facebook.com/example', socialPlatform: 'Facebook' },
    { websiteType: 'social', hasWebsite: false, website: 'https://instagram.com/example', socialPlatform: 'Instagram' },
    { websiteType: 'none', hasWebsite: false, website: null, socialPlatform: null },
    { websiteType: 'unknown', hasWebsite: null, website: null, socialPlatform: null },
  ];
  const NAMES = [
    'Bella Cucina', 'Bright Smile Dental', 'Studio Coiffure', 'Iron Peak Gym', 'City Auto Care',
    'Café Central', 'Le Fournil', 'مطعم الأصيل', 'صالون الجمال', 'Napoli Pizza',
    'Downtown Barbers', 'Green Leaf Bakery', 'Sunset Dental', 'Cabinet Dentaire Nour', 'Fitness First',
    'Chez Amine', 'The Coffee Loft', 'Royal Cuts', 'Trattoria Roma', 'Auto Express',
    'Belle Époque Salon', 'مخبزة السعادة',
  ];

  function buildLeads() {
    return NAMES.map((name, i) => {
      const web = WEB[i % WEB.length];
      const status = STAT[i % STAT.length];
      const isAr = /[؀-ۿ]/.test(name);
      const contacted = status !== 'unsent';
      return {
        id: `dev:${i}`,
        placeId: `dev-place-${i}`,
        name,
        category: CATS[i % CATS.length],
        phone: i % 4 === 0 ? null : `+1 (555) ${String(1000 + i).slice(0, 3)}-${String(2000 + i).slice(0, 4)}`,
        website: web.website,
        hasWebsite: web.hasWebsite,
        websiteType: web.websiteType,
        socialPlatform: web.socialPlatform,
        rating: i % 5 === 0 ? null : Math.round((3.5 + (i % 15) / 10) * 10) / 10,
        reviewCount: i % 5 === 0 ? null : (i + 1) * 37,
        address: `${100 + i} Sample Street, ${isAr ? 'Algiers' : 'Springfield'}`,
        mapsUrl: 'https://www.google.com/maps',
        status,
        notes: i % 3 === 0 ? 'Follow up next week.' : '',
        selectedTemplateId: web.hasWebsite ? 'tpl-general' : 'tpl-no-website',
        selectedLanguage: isAr ? 'ar' : i % 2 ? 'fr' : 'en',
        firstContactedAt: contacted ? iso(20 - (i % 10)) : null,
        lastContactedAt: contacted ? iso(5) : null,
        source: 'google_maps',
        savedAt: iso(30 - i),
        updatedAt: iso((i % 10)),
        extractedAt: iso((i % 10)),
      };
    });
  }

  window.mapReachDevSeed = async function mapReachDevSeed() {
    const store = await chrome.storage.local.get(KEY);
    const existing = Array.isArray(store[KEY]) ? store[KEY] : [];
    const withoutDev = existing.filter((l) => l && typeof l.id === 'string' && !l.id.startsWith('dev:'));
    const merged = withoutDev.concat(buildLeads());
    await chrome.storage.local.set({ [KEY]: merged });
    console.log(`[MapReach dev-seed] Seeded ${buildLeads().length} mock leads. Reload the Tracker to see them.`);
  };

  window.mapReachDevClear = async function mapReachDevClear() {
    const store = await chrome.storage.local.get(KEY);
    const existing = Array.isArray(store[KEY]) ? store[KEY] : [];
    const kept = existing.filter((l) => l && typeof l.id === 'string' && !l.id.startsWith('dev:'));
    await chrome.storage.local.set({ [KEY]: kept });
    console.log(`[MapReach dev-seed] Removed mock leads. ${kept.length} real lead(s) remain.`);
  };

  console.log('[MapReach dev-seed] Ready. Run mapReachDevSeed() or mapReachDevClear().');
})();
