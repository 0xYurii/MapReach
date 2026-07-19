/**
 * MapReach — shared constants.
 *
 * This module has no imports; it is a dependency leaf imported by the storage,
 * template, deduplication, export, formatter and validation layers as well as
 * every extension page. The content script (a classic, non-module script) keeps
 * its own inlined copy of the few values it needs — see maps-scraper.js.
 */

/** Current persisted storage schema version. Bump when the stored shape changes. */
export const SCHEMA_VERSION = 1;

/** chrome.storage.local keys (single source of truth). */
export const STORAGE_KEYS = Object.freeze({
  LEADS: 'mapreach_leads',
  TEMPLATES: 'mapreach_templates',
  SETTINGS: 'mapreach_settings',
  SCHEMA: 'mapreach_schema_version',
});

/** Runtime message types. All use the MAPREACH_* namespace. */
export const MESSAGES = Object.freeze({
  PING: 'MAPREACH_PING',
  PONG: 'MAPREACH_PONG',
  GET_CURRENT_LEAD: 'MAPREACH_GET_CURRENT_LEAD',
  OPEN_TRACKER: 'MAPREACH_OPEN_TRACKER',
  OPEN_SETTINGS: 'MAPREACH_OPEN_SETTINGS',
});

export const SOURCE_GOOGLE_MAPS = 'google_maps';
export const MAPS_URL = 'https://www.google.com/maps';

/** Lead status values (single source of truth). */
export const STATUSES = Object.freeze([
  'unsent',
  'sent',
  'replied',
  'interested',
  'closed',
  'not_interested',
]);

/**
 * Display metadata per status: human label + a color token consumed by CSS via
 * a `data-status` attribute. Text is always shown alongside color (never rely on
 * color alone).
 */
export const STATUS_META = Object.freeze({
  unsent: { label: 'Unsent', color: 'gray' },
  sent: { label: 'Sent', color: 'amber' },
  replied: { label: 'Replied', color: 'blue' },
  interested: { label: 'Interested', color: 'green' },
  closed: { label: 'Closed', color: 'green' },
  not_interested: { label: 'Not interested', color: 'red' },
});

/** Website classification types. */
export const WEBSITE_TYPES = Object.freeze({
  REAL: 'real',
  SOCIAL: 'social',
  NONE: 'none',
  UNKNOWN: 'unknown',
});

/** Supported outreach-message languages. */
export const LANGUAGES = Object.freeze(['en', 'fr', 'ar']);
export const LANGUAGE_LABELS = Object.freeze({ en: 'English', fr: 'Français', ar: 'العربية' });
export const RTL_LANGUAGES = Object.freeze(['ar']);

/**
 * Default host fragments treated as social / messaging / link-in-bio links
 * rather than a real standalone business website. Users can extend this list in
 * Settings. Entries are bare registrable hosts (no scheme, no leading "www.").
 *
 * NOTE: This list is intentionally duplicated (in a trimmed form) inside
 * content-scripts/maps-scraper.js because content scripts declared in the
 * manifest cannot use ES module imports. Keep the two in rough sync.
 */
export const DEFAULT_SOCIAL_DOMAINS = Object.freeze([
  'facebook.com', 'fb.com', 'fb.me', 'm.facebook.com',
  'instagram.com', 'instagr.am',
  'wa.me', 'whatsapp.com', 'api.whatsapp.com', 'chat.whatsapp.com',
  't.me', 'telegram.me', 'telegram.org',
  'twitter.com', 'x.com',
  'tiktok.com',
  'youtube.com', 'youtu.be',
  'linkedin.com',
  'linktr.ee', 'linktree.com',
  'snapchat.com',
  'pinterest.com', 'pin.it',
  'threads.net',
]);

/** Friendly platform names for known social hosts. */
export const SOCIAL_PLATFORM_NAMES = Object.freeze({
  'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'fb.me': 'Facebook', 'm.facebook.com': 'Facebook',
  'instagram.com': 'Instagram', 'instagr.am': 'Instagram',
  'wa.me': 'WhatsApp', 'whatsapp.com': 'WhatsApp', 'api.whatsapp.com': 'WhatsApp', 'chat.whatsapp.com': 'WhatsApp',
  't.me': 'Telegram', 'telegram.me': 'Telegram', 'telegram.org': 'Telegram',
  'twitter.com': 'X (Twitter)', 'x.com': 'X (Twitter)',
  'tiktok.com': 'TikTok',
  'youtube.com': 'YouTube', 'youtu.be': 'YouTube',
  'linkedin.com': 'LinkedIn',
  'linktr.ee': 'Linktree', 'linktree.com': 'Linktree',
  'snapchat.com': 'Snapchat',
  'pinterest.com': 'Pinterest', 'pin.it': 'Pinterest',
  'threads.net': 'Threads',
});

/** Tracker sort options. */
export const SORT_OPTIONS = Object.freeze([
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'saved_desc', label: 'Recently saved' },
  { value: 'saved_asc', label: 'Oldest saved' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'rating_desc', label: 'Rating high to low' },
  { value: 'reviews_asc', label: 'Fewest reviews' },
]);

/** Tracker website-filter options. */
export const WEBSITE_FILTERS = Object.freeze([
  { value: 'all', label: 'All websites' },
  { value: 'none', label: 'No website' },
  { value: 'social', label: 'Social media only' },
  { value: 'real', label: 'Has real website' },
  { value: 'unknown', label: 'Website unknown' },
]);

/** Default user settings. */
export const DEFAULT_SETTINGS = Object.freeze({
  defaultSort: 'updated_desc',
  openTrackerAfterSave: false,
  showWarnings: true,
  debug: false,
  defaultLanguage: 'en',
  autoDetectLanguage: true,
  /** User-added social domains, merged with DEFAULT_SOCIAL_DOMAINS at runtime. */
  socialDomains: [],
});

/** Sample lead used for live template previews in Settings. */
export const SAMPLE_LEAD = Object.freeze({
  name: 'Bella Cucina',
  category: 'Italian restaurant',
  address: '12 Rue Didouche Mourad, Algiers',
  city: 'Algiers',
  website: null,
  rating: 4.6,
  reviewCount: 320,
});
