/**
 * MapReach — validation & sanitization.
 *
 * Guards every value that enters storage or leaves it for display/export so the
 * app never persists `undefined`, invalid enums, or malformed types. Also
 * validates imported JSON backups before they are written.
 */

import {
  STATUSES,
  LANGUAGES,
  WEBSITE_TYPES,
  SOURCE_GOOGLE_MAPS,
  SCHEMA_VERSION,
} from './constants.js';
import { normalizeUrl } from './formatters.js';

/** @returns {boolean} true for a valid absolute http(s) URL. */
export function isValidHttpUrl(value) {
  return normalizeUrl(value) !== null;
}

/** Coerce to a trimmed string or null (never undefined). */
function strOrNull(value) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t : null;
}

/** Coerce to a finite number or null. */
function numOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Coerce to a boolean or null (tri-state, used for hasWebsite). */
function boolOrNull(value) {
  if (value === true || value === false) return value;
  return null;
}

/** Clamp a status to the allowed set, defaulting to 'unsent'. */
export function coerceStatus(value) {
  return STATUSES.includes(value) ? value : 'unsent';
}

/** Clamp a website type to the allowed set, defaulting to 'unknown'. */
export function coerceWebsiteType(value) {
  const allowed = Object.values(WEBSITE_TYPES);
  return allowed.includes(value) ? value : WEBSITE_TYPES.UNKNOWN;
}

/** Clamp a language code to the supported set, or null. */
export function coerceLanguage(value) {
  return LANGUAGES.includes(value) ? value : null;
}

/**
 * Produce a fully-formed, safe lead object with no undefined values. Missing
 * fields become null (or sensible defaults for status/notes/source/timestamps).
 * @param {object} input
 * @returns {object} sanitized lead
 */
export function sanitizeLead(input) {
  const lead = input && typeof input === 'object' ? input : {};
  const now = new Date().toISOString();
  const website = normalizeUrl(lead.website);
  return {
    id: strOrNull(lead.id) || cryptoId(),
    placeId: strOrNull(lead.placeId),
    name: strOrNull(lead.name) || '',
    category: strOrNull(lead.category),
    phone: strOrNull(lead.phone),
    website,
    websiteType: coerceWebsiteType(lead.websiteType),
    socialPlatform: strOrNull(lead.socialPlatform),
    hasWebsite: boolOrNull(lead.hasWebsite),
    rating: numOrNull(lead.rating),
    reviewCount: numOrNull(lead.reviewCount),
    address: strOrNull(lead.address),
    mapsUrl: strOrNull(lead.mapsUrl),
    status: coerceStatus(lead.status),
    notes: typeof lead.notes === 'string' ? lead.notes : '',
    selectedTemplateId: strOrNull(lead.selectedTemplateId),
    selectedLanguage: coerceLanguage(lead.selectedLanguage),
    firstContactedAt: strOrNull(lead.firstContactedAt),
    lastContactedAt: strOrNull(lead.lastContactedAt),
    source: SOURCE_GOOGLE_MAPS,
    savedAt: strOrNull(lead.savedAt) || now,
    updatedAt: strOrNull(lead.updatedAt) || now,
    extractedAt: strOrNull(lead.extractedAt),
  };
}

/**
 * Determine whether a lead may be saved. A business name is required.
 * @param {object} lead
 * @returns {{ ok: boolean, reason?: string }}
 */
export function assertSavable(lead) {
  if (!lead || typeof lead !== 'object') {
    return { ok: false, reason: 'No lead data to save.' };
  }
  const name = strOrNull(lead.name);
  if (!name) {
    return {
      ok: false,
      reason: 'No business name was detected, so this listing cannot be saved. Open an individual business on Google Maps and try again.',
    };
  }
  return { ok: true };
}

/** Generate a random fallback id. */
export function cryptoId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `uuid:${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  return `uuid:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validate the shape of a template object (used on import).
 * @param {object} t
 * @returns {boolean}
 */
export function isValidTemplate(t) {
  if (!t || typeof t !== 'object') return false;
  if (typeof t.id !== 'string' || !t.id) return false;
  if (typeof t.name !== 'string') return false;
  if (!t.bodies || typeof t.bodies !== 'object') return false;
  // At least one supported-language body must be a string.
  return LANGUAGES.some((lang) => typeof t.bodies[lang] === 'string');
}

/**
 * Validate a parsed JSON backup before it is written to storage.
 * @param {unknown} data
 * @returns {{ ok: boolean, errors: string[], counts: { leads: number, templates: number }, data: object|null }}
 */
export function validateBackup(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['The file is not a valid MapReach backup object.'], counts: { leads: 0, templates: 0 }, data: null };
  }
  const leads = Array.isArray(data.leads) ? data.leads : null;
  const templates = Array.isArray(data.templates) ? data.templates : null;

  if (leads === null && templates === null) {
    errors.push('The backup contains neither a "leads" array nor a "templates" array.');
  }

  let validLeads = [];
  if (leads) {
    validLeads = leads.filter((l) => l && typeof l === 'object' && (typeof l.name === 'string' || typeof l.id === 'string'));
    if (validLeads.length !== leads.length) {
      errors.push(`${leads.length - validLeads.length} lead record(s) were malformed and will be skipped.`);
    }
  }

  let validTemplates = [];
  if (templates) {
    validTemplates = templates.filter(isValidTemplate);
    if (validTemplates.length !== templates.length) {
      errors.push(`${templates.length - validTemplates.length} template record(s) were malformed and will be skipped.`);
    }
  }

  const hasUsable = validLeads.length > 0 || validTemplates.length > 0;
  return {
    ok: hasUsable,
    errors: hasUsable ? errors : errors.length ? errors : ['The backup contained no usable records.'],
    counts: { leads: validLeads.length, templates: validTemplates.length },
    data: {
      schemaVersion: typeof data.schemaVersion === 'number' ? data.schemaVersion : SCHEMA_VERSION,
      leads: validLeads,
      templates: validTemplates,
      settings: data.settings && typeof data.settings === 'object' ? data.settings : null,
    },
  };
}
