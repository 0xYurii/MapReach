/**
 * MapReach — formatting, URL and language helpers.
 *
 * Pure functions only (no chrome.* access). Safe to use from any page.
 */

import {
  WEBSITE_TYPES,
  DEFAULT_SOCIAL_DOMAINS,
  SOCIAL_PLATFORM_NAMES,
} from './constants.js';

/**
 * Normalize a raw string into a clean absolute http(s) URL, or return null.
 * Accepts values that omit the scheme (e.g. "example.com/path").
 * Rejects tel:, mailto:, javascript: and other non-web schemes.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value) return null;
  // Reject obviously non-web schemes early.
  if (/^(tel:|mailto:|javascript:|data:|sms:)/i.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extract a lowercased hostname without a leading "www." from a URL-ish string.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function getDomain(raw) {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Turn a user-entered domain token into a bare comparable host (no scheme/www/path).
 * @param {string} token
 * @returns {string}
 */
export function normalizeDomainToken(token) {
  if (typeof token !== 'string') return '';
  return (
    getDomain(token) ||
    token
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
  );
}

/**
 * Does `domain` equal or fall under `base` (e.g. "m.facebook.com" under "facebook.com")?
 * @param {string} domain
 * @param {string} base
 * @returns {boolean}
 */
function domainMatches(domain, base) {
  if (!domain || !base) return false;
  return domain === base || domain.endsWith(`.${base}`);
}

/**
 * Friendly platform label for a matched social host.
 * @param {string} base
 * @returns {string}
 */
function platformLabel(base) {
  if (SOCIAL_PLATFORM_NAMES[base]) return SOCIAL_PLATFORM_NAMES[base];
  const core = base.split('.')[0] || base;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

/**
 * Classify the URL behind a Maps "website" label as a real website, a social /
 * messaging link, none, or unknown.
 * @param {unknown} rawUrl
 * @param {string[]} [extraSocialDomains] additional user-defined social hosts
 * @returns {{ type: string, platform: string|null, domain: string|null, url: string|null }}
 */
export function classifyWebsite(rawUrl, extraSocialDomains = []) {
  const url = normalizeUrl(rawUrl);
  const domain = getDomain(url);
  if (!url || !domain) {
    return { type: WEBSITE_TYPES.NONE, platform: null, domain: null, url: null };
  }
  const socialBases = [
    ...DEFAULT_SOCIAL_DOMAINS,
    ...(Array.isArray(extraSocialDomains) ? extraSocialDomains.map(normalizeDomainToken) : []),
  ].filter(Boolean);

  for (const base of socialBases) {
    if (domainMatches(domain, base)) {
      return { type: WEBSITE_TYPES.SOCIAL, platform: platformLabel(base), domain, url };
    }
  }
  return { type: WEBSITE_TYPES.REAL, platform: null, domain, url };
}

/**
 * True if the text contains Arabic-script characters.
 * @param {unknown} text
 * @returns {boolean}
 */
export function containsArabic(text) {
  if (typeof text !== 'string') return false;
  // Arabic, Arabic Supplement, Extended-A, and Presentation Forms A/B.
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(text);
}

/**
 * Best-effort language guess from a single piece of text. Only Arabic can be
 * detected reliably from characters; Latin scripts return null (caller decides).
 * @param {unknown} text
 * @returns {('ar'|null)}
 */
export function detectLanguageFromText(text) {
  return containsArabic(text) ? 'ar' : null;
}

/**
 * Derive a rough "city" token from a full address (last comma-separated part,
 * with any postal code stripped). Returns '' when nothing sensible is found.
 * @param {unknown} address
 * @returns {string}
 */
export function deriveCity(address) {
  if (typeof address !== 'string' || !address.trim()) return '';
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  // If the last part looks like a country or postcode, prefer the previous part.
  const candidate = /\d{3,}/.test(last) && parts.length > 1 ? parts[parts.length - 2] : last;
  return candidate.replace(/\b\d{4,}\b/g, '').trim();
}

/**
 * Format a rating number for display, e.g. 4.6 -> "4.6". Null-safe.
 * @param {unknown} rating
 * @returns {string}
 */
export function formatRating(rating) {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return '';
  return (Math.round(rating * 10) / 10).toString();
}

/**
 * Format a review count with grouping, e.g. 1234 -> "1,234". Null-safe.
 * @param {unknown} count
 * @returns {string}
 */
export function formatReviewCount(count) {
  if (typeof count !== 'number' || !Number.isFinite(count)) return '';
  try {
    return count.toLocaleString('en-US');
  } catch {
    return String(count);
  }
}

/**
 * Format an ISO date string for display. Returns '' for missing/invalid input.
 * @param {unknown} iso
 * @param {boolean} [withTime]
 * @returns {string}
 */
export function formatDate(iso, withTime = false) {
  if (typeof iso !== 'string' || !iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts = withTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  try {
    return d.toLocaleDateString(undefined, opts);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Truncate a string to `max` characters, adding an ellipsis when cut.
 * @param {unknown} str
 * @param {number} max
 * @returns {string}
 */
export function truncate(str, max = 60) {
  const s = typeof str === 'string' ? str : '';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
