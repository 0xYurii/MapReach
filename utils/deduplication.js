/**
 * MapReach — duplicate detection & lead merging.
 *
 * Never merges automatically; the UI always shows the user an explicit "Update
 * lead" action. These helpers only detect matches and compute a merged object.
 */

import { getDomain } from './formatters.js';

/**
 * Normalize free text for fuzzy equality: lowercased, diacritics stripped (Latin),
 * punctuation collapsed to single spaces. Arabic letters are preserved.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip Latin combining diacritics
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Reduce a phone number to comparable digits. Converts a leading "00" to "+",
 * then drops the "+" so "+213..." and "00213..." compare equal.
 * @param {unknown} phone
 * @returns {string}
 */
export function normalizePhoneForMatch(phone) {
  if (typeof phone !== 'string') return '';
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  return p.replace(/^\+/, '');
}

/**
 * Registrable domain of a website (or '' when none/invalid).
 * @param {unknown} website
 * @returns {string}
 */
export function normalizeWebsiteDomain(website) {
  return getDomain(website) || '';
}

/**
 * Deterministic fingerprint from name + address + phone.
 * @param {object} lead
 * @returns {string}
 */
export function getLeadFingerprint(lead) {
  const l = lead || {};
  return [
    normalizeText(l.name),
    normalizeText(l.address),
    normalizePhoneForMatch(l.phone),
  ].join('|');
}

/**
 * Build a stable lead id: prefer gmaps:<placeId>, else a deterministic hash of
 * the name/address/phone fingerprint, else null (caller uses a random UUID and
 * warns that duplicate matching will be weaker).
 * @param {object} lead
 * @returns {string|null}
 */
export function buildLeadId(lead) {
  if (lead && typeof lead.placeId === 'string' && lead.placeId.trim()) {
    return `gmaps:${lead.placeId.trim()}`;
  }
  const fp = getLeadFingerprint(lead);
  if (fp.replace(/\|/g, '').trim()) {
    let h = 5381;
    for (let i = 0; i < fp.length; i += 1) {
      h = (h << 5) + h + fp.charCodeAt(i);
      h |= 0; // force 32-bit
    }
    return `fp:${(h >>> 0).toString(36)}`;
  }
  return null;
}

/**
 * Find an existing lead that matches the candidate, using a priority ladder.
 * @param {object} candidate
 * @param {object[]} existingLeads
 * @returns {{ lead: object, reason: string }|null}
 */
export function findDuplicateLead(candidate, existingLeads) {
  if (!candidate || !Array.isArray(existingLeads) || existingLeads.length === 0) return null;

  const cPlace = candidate.placeId || null;
  const cPhone = normalizePhoneForMatch(candidate.phone);
  const cDomain = normalizeWebsiteDomain(candidate.website);
  const cName = normalizeText(candidate.name);
  const cAddress = normalizeText(candidate.address);
  const cFingerprint = getLeadFingerprint(candidate);

  // 1. Exact non-null placeId.
  if (cPlace) {
    const hit = existingLeads.find((l) => l.placeId && l.placeId === cPlace);
    if (hit) return { lead: hit, reason: 'Matched by Google Maps place ID' };
  }
  // 2. Exact normalized phone.
  if (cPhone) {
    const hit = existingLeads.find((l) => normalizePhoneForMatch(l.phone) === cPhone);
    if (hit) return { lead: hit, reason: 'Matched by phone number' };
  }
  // 3. Website domain + business name.
  if (cDomain && cName) {
    const hit = existingLeads.find(
      (l) => normalizeWebsiteDomain(l.website) === cDomain && normalizeText(l.name) === cName,
    );
    if (hit) return { lead: hit, reason: 'Matched by website domain and business name' };
  }
  // 4. Business name + address.
  if (cName && cAddress) {
    const hit = existingLeads.find(
      (l) => normalizeText(l.name) === cName && normalizeText(l.address) === cAddress,
    );
    if (hit) return { lead: hit, reason: 'Matched by business name and address' };
  }
  // 5. Deterministic fingerprint (only when it carries real signal).
  if (cFingerprint.replace(/\|/g, '').trim()) {
    const hit = existingLeads.find((l) => getLeadFingerprint(l) === cFingerprint);
    if (hit) return { lead: hit, reason: 'Matched by name / address / phone fingerprint' };
  }
  return null;
}

/**
 * Merge freshly-extracted data into an existing saved lead.
 *
 * User-managed fields (status, notes, firstContactedAt, lastContactedAt,
 * selectedTemplateId, selectedLanguage, id, savedAt) are preserved. Extraction
 * fields are only overwritten when the incoming value is more reliable
 * (non-empty string, finite number, or a definite boolean).
 * @param {object} existing
 * @param {object} incoming
 * @returns {object} merged lead
 */
export function mergeLeadData(existing, incoming) {
  const base = { ...existing };
  const inc = incoming || {};

  const preferString = (next, prev) => (typeof next === 'string' && next.trim() ? next : prev);
  const preferNumber = (next, prev) => (typeof next === 'number' && Number.isFinite(next) ? next : prev);
  const preferBool = (next, prev) => (next === true || next === false ? next : prev);

  base.name = preferString(inc.name, base.name);
  base.category = preferString(inc.category, base.category);
  base.phone = preferString(inc.phone, base.phone);
  base.website = preferString(inc.website, base.website);
  base.websiteType = preferString(inc.websiteType, base.websiteType);
  base.socialPlatform = inc.socialPlatform !== undefined ? inc.socialPlatform : base.socialPlatform;
  base.hasWebsite = preferBool(inc.hasWebsite, base.hasWebsite);
  base.rating = preferNumber(inc.rating, base.rating);
  base.reviewCount = preferNumber(inc.reviewCount, base.reviewCount);
  base.address = preferString(inc.address, base.address);
  base.mapsUrl = preferString(inc.mapsUrl, base.mapsUrl);
  base.extractedAt = preferString(inc.extractedAt, base.extractedAt);
  base.placeId = base.placeId || (typeof inc.placeId === 'string' ? inc.placeId : null);

  base.updatedAt = new Date().toISOString();
  return base;
}
