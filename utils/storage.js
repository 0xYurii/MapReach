import { STORAGE_KEYS, SCHEMA_VERSION, DEFAULT_SETTINGS } from "./constants.js";
import { validateAndSanitizeLead, validateSettings } from "./validation.js";
import { normalizeTemplates, getDefaultTemplates } from "./templates.js";

/**
 * @template T
 * @param {string | string[] | Record<string, any>} keys
 * @returns {Promise<T>}
 */
function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

/**
 * @param {Record<string, any>} values
 */
function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(true);
    });
  });
}

/**
 * @param {string | string[]} keys
 */
function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(true);
    });
  });
}

async function runMigrationsIfNeeded() {
  const result = await storageGet({ [STORAGE_KEYS.schemaVersion]: 0 });
  const current = Number(result[STORAGE_KEYS.schemaVersion] || 0);

  if (current >= SCHEMA_VERSION) return;

  // Reserved migration hook for future schema upgrades.
  // v1 has no migration transforms.
  await storageSet({ [STORAGE_KEYS.schemaVersion]: SCHEMA_VERSION });
}

/**
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getLeads() {
  await runMigrationsIfNeeded();
  const result = await storageGet({ [STORAGE_KEYS.leads]: [] });
  const raw = Array.isArray(result[STORAGE_KEYS.leads]) ? result[STORAGE_KEYS.leads] : [];
  const cleaned = raw
    .map((lead) => validateAndSanitizeLead(lead))
    .filter((result) => result.valid)
    .map((result) => result.lead)
    .sort((a, b) => {
      const at = new Date(a.updatedAt || 0).getTime();
      const bt = new Date(b.updatedAt || 0).getTime();
      return bt - at;
    });
  return cleaned;
}

/**
 * @param {string} id
 */
export async function getLeadById(id) {
  const leads = await getLeads();
  return leads.find((lead) => lead.id === id) || null;
}

/**
 * @param {Record<string, any>} lead
 */
export async function saveLead(lead) {
  const now = new Date().toISOString();
  const candidate = {
    ...lead,
    savedAt: lead.savedAt || now,
    updatedAt: now,
    source: "google_maps",
  };

  const validation = validateAndSanitizeLead(candidate);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const leads = await getLeads();
  const withoutExisting = leads.filter((item) => item.id !== validation.lead.id);
  withoutExisting.push(validation.lead);

  await storageSet({ [STORAGE_KEYS.leads]: withoutExisting });
  return validation.lead;
}

/**
 * @param {string} id
 * @param {Record<string, any>} patch
 */
export async function updateLead(id, patch) {
  const leads = await getLeads();
  const current = leads.find((lead) => lead.id === id);
  if (!current) throw new Error("Lead not found.");

  const candidate = {
    ...current,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };

  const validation = validateAndSanitizeLead(candidate);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }

  const next = leads.map((lead) => (lead.id === id ? validation.lead : lead));
  await storageSet({ [STORAGE_KEYS.leads]: next });
  return validation.lead;
}

/**
 * @param {string} id
 */
export async function deleteLead(id) {
  const leads = await getLeads();
  const next = leads.filter((lead) => lead.id !== id);
  await storageSet({ [STORAGE_KEYS.leads]: next });
}

export async function clearAllLeads() {
  await storageSet({ [STORAGE_KEYS.leads]: [] });
}

/**
 * @returns {Promise<Array<Record<string, any>>>}
 */
export async function getTemplates() {
  await runMigrationsIfNeeded();
  const result = await storageGet({ [STORAGE_KEYS.templates]: [] });
  const templates = normalizeTemplates(result[STORAGE_KEYS.templates]);
  return templates;
}

/**
 * @param {Array<Record<string, any>>} templates
 */
export async function saveTemplates(templates) {
  const normalized = normalizeTemplates(templates);
  if (!normalized.length) throw new Error("At least one valid template is required.");

  let hasDefault = normalized.some((template) => template.isDefault);
  const next = normalized.map((template, index) => {
    if (template.isDefault) {
      if (hasDefault) {
        hasDefault = false;
        return template;
      }
      return { ...template, isDefault: false };
    }
    if (!hasDefault && index === 0) return { ...template, isDefault: true };
    return template;
  });

  await storageSet({ [STORAGE_KEYS.templates]: next });
  return next;
}

/**
 * @returns {Promise<Record<string, any>>}
 */
export async function getSettings() {
  await runMigrationsIfNeeded();
  const result = await storageGet({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  return validateSettings(result[STORAGE_KEYS.settings]);
}

/**
 * @param {Record<string, any>} settings
 */
export async function saveSettings(settings) {
  const safe = validateSettings(settings);
  await storageSet({ [STORAGE_KEYS.settings]: safe });
  return safe;
}

export async function seedDefaultsIfNeeded() {
  await runMigrationsIfNeeded();

  const [templates, settings, leads] = await Promise.all([
    getTemplates(),
    getSettings(),
    getLeads(),
  ]);

  const writes = [];
  if (!templates.length) {
    writes.push(storageSet({ [STORAGE_KEYS.templates]: getDefaultTemplates() }));
  }
  if (!settings || typeof settings !== "object") {
    writes.push(storageSet({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS }));
  }
  if (!Array.isArray(leads)) {
    writes.push(storageSet({ [STORAGE_KEYS.leads]: [] }));
  }
  if (writes.length) {
    await Promise.all(writes);
  }
}

export async function clearAllData() {
  await storageRemove([
    STORAGE_KEYS.leads,
    STORAGE_KEYS.templates,
    STORAGE_KEYS.settings,
    STORAGE_KEYS.schemaVersion,
  ]);
  await seedDefaultsIfNeeded();
}

export async function exportAllData() {
  const [leads, templates, settings] = await Promise.all([
    getLeads(),
    getTemplates(),
    getSettings(),
  ]);

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    leads,
    templates,
    settings,
  };
}
