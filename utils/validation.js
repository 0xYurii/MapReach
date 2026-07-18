import { LEAD_STATUSES, SOURCE, DEFAULT_SETTINGS, SORT_OPTIONS } from "./constants.js";
import { safeText } from "./formatters.js";

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  const cleaned = safeText(String(value));
  return cleaned.length ? cleaned : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeWebsite(value) {
  const raw = normalizeNullableString(value);
  if (!raw) return null;

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * @param {unknown} value
 * @returns {boolean | null}
 */
export function normalizeNullableBoolean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  return null;
}

/**
 * @param {Record<string, unknown>} lead
 * @returns {{ valid: boolean; errors: string[]; lead: any }}
 */
export function validateAndSanitizeLead(lead) {
  const errors = [];
  const status = LEAD_STATUSES.includes(String(lead.status)) ? String(lead.status) : "unsent";

  const sanitized = {
    id: normalizeNullableString(lead.id),
    placeId: normalizeNullableString(lead.placeId),
    name: normalizeNullableString(lead.name),
    category: normalizeNullableString(lead.category),
    phone: normalizeNullableString(lead.phone),
    website: normalizeWebsite(lead.website),
    hasWebsite: normalizeNullableBoolean(lead.hasWebsite),
    rating: normalizeNullableNumber(lead.rating),
    reviewCount: normalizeNullableNumber(lead.reviewCount),
    address: normalizeNullableString(lead.address),
    mapsUrl: normalizeWebsite(lead.mapsUrl),
    status,
    notes: normalizeNullableString(lead.notes) ?? "",
    selectedTemplateId: normalizeNullableString(lead.selectedTemplateId),
    firstContactedAt: normalizeNullableString(lead.firstContactedAt),
    lastContactedAt: normalizeNullableString(lead.lastContactedAt),
    source: SOURCE,
    savedAt: normalizeNullableString(lead.savedAt),
    updatedAt: normalizeNullableString(lead.updatedAt),
    extractedAt: normalizeNullableString(lead.extractedAt),
  };

  if (!sanitized.id) errors.push("Lead ID is required.");
  if (!sanitized.name) errors.push("Business name is required.");
  if (sanitized.hasWebsite === true && !sanitized.website) {
    errors.push("Website flag is true but no valid website URL exists.");
  }

  return {
    valid: errors.length === 0,
    errors,
    lead: sanitized,
  };
}

/**
 * @param {Record<string, unknown>} template
 */
export function validateTemplate(template) {
  const id = normalizeNullableString(template.id);
  const name = normalizeNullableString(template.name);
  const body = normalizeNullableString(template.body);
  const categoryKeywords = Array.isArray(template.categoryKeywords)
    ? template.categoryKeywords
        .map((item) => normalizeNullableString(item))
        .filter(Boolean)
        .map((item) => item.toLowerCase())
    : [];

  return {
    valid: Boolean(id && name && body),
    template: {
      id,
      name,
      body,
      categoryKeywords,
      isDefault: Boolean(template.isDefault),
      createdAt: normalizeNullableString(template.createdAt) ?? new Date().toISOString(),
      updatedAt: normalizeNullableString(template.updatedAt) ?? new Date().toISOString(),
    },
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} settings
 */
export function validateSettings(settings) {
  const availableSorts = new Set(SORT_OPTIONS.map((option) => option.value));
  const incoming = settings && typeof settings === "object" ? settings : {};

  const normalizedSort = availableSorts.has(String(incoming.defaultSort))
    ? String(incoming.defaultSort)
    : DEFAULT_SETTINGS.defaultSort;

  return {
    defaultSort: normalizedSort,
    openTrackerAfterSave: Boolean(incoming.openTrackerAfterSave),
    showExtractionWarnings:
      incoming.showExtractionWarnings === undefined
        ? DEFAULT_SETTINGS.showExtractionWarnings
        : Boolean(incoming.showExtractionWarnings),
    debugMode: Boolean(incoming.debugMode),
  };
}

/**
 * @param {unknown} input
 */
export function parseAndValidateBackupJson(input) {
  if (!input || typeof input !== "object") {
    return { valid: false, error: "Backup JSON must be an object." };
  }

  const data = /** @type {any} */ (input);
  if (!Array.isArray(data.leads)) {
    return { valid: false, error: "Backup must include a leads array." };
  }
  if (!Array.isArray(data.templates)) {
    return { valid: false, error: "Backup must include a templates array." };
  }

  return {
    valid: true,
    payload: {
      schemaVersion: Number(data.schemaVersion) || 1,
      leads: data.leads,
      templates: data.templates,
      settings: validateSettings(data.settings),
    },
  };
}
