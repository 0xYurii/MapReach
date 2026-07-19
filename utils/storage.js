/**
 * MapReach — local storage layer (chrome.storage.local ONLY).
 *
 * Every read/write to persisted state goes through this module. All functions
 * are async and defend against malformed stored data by returning safe defaults.
 * chrome.storage.sync is never used.
 */

import { STORAGE_KEYS, SCHEMA_VERSION, DEFAULT_SETTINGS } from './constants.js';
import { getDefaultTemplates } from './templates.js';
import { sanitizeLead, isValidTemplate } from './validation.js';
import { findDuplicateLead, mergeLeadData } from './deduplication.js';

/* ------------------------------------------------------------------ */
/* Low-level get/set                                                   */
/* ------------------------------------------------------------------ */

/**
 * Read one key from chrome.storage.local, returning `fallback` on miss/error.
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function rawGet(key, fallback) {
  try {
    const result = await chrome.storage.local.get(key);
    const value = result ? result[key] : undefined;
    return value === undefined || value === null ? fallback : value;
  } catch (err) {
    console.warn('[MapReach] storage read failed for', key, err);
    return fallback;
  }
}

/**
 * Write one key to chrome.storage.local.
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function rawSet(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (err) {
    console.error('[MapReach] storage write failed for', key, err);
    throw new Error('Could not save data locally. Your browser storage may be full or restricted.');
  }
}

/** Read the raw leads array (validated to be an array, not sanitized). */
async function readLeadsArray() {
  const value = await rawGet(STORAGE_KEYS.LEADS, []);
  return Array.isArray(value) ? value : [];
}

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

/**
 * All leads, sanitized and sorted by updatedAt descending.
 * @returns {Promise<object[]>}
 */
export async function getLeads() {
  const arr = await readLeadsArray();
  const safe = arr.map(sanitizeLead);
  safe.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return safe;
}

/**
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getLeadById(id) {
  if (!id) return null;
  const arr = await readLeadsArray();
  const found = arr.find((l) => l && l.id === id);
  return found ? sanitizeLead(found) : null;
}

/**
 * Create or overwrite a lead (upsert by id).
 * @param {object} lead
 * @returns {Promise<object>} the saved lead
 */
export async function saveLead(lead) {
  const arr = await readLeadsArray();
  const now = new Date().toISOString();
  const existingIndex = arr.findIndex((l) => l && l.id === lead.id);
  const sanitized = sanitizeLead({
    ...lead,
    savedAt: lead.savedAt || (existingIndex >= 0 ? arr[existingIndex].savedAt : now),
    updatedAt: now,
  });
  if (existingIndex >= 0) {
    arr[existingIndex] = sanitized;
  } else {
    arr.push(sanitized);
  }
  await rawSet(STORAGE_KEYS.LEADS, arr);
  return sanitized;
}

/**
 * Patch an existing lead. Returns the updated lead, or null if not found.
 * @param {string} id
 * @param {object} patch
 * @returns {Promise<object|null>}
 */
export async function updateLead(id, patch) {
  const arr = await readLeadsArray();
  const index = arr.findIndex((l) => l && l.id === id);
  if (index < 0) return null;
  const merged = sanitizeLead({
    ...arr[index],
    ...patch,
    id,
    savedAt: arr[index].savedAt,
    updatedAt: new Date().toISOString(),
  });
  arr[index] = merged;
  await rawSet(STORAGE_KEYS.LEADS, arr);
  return merged;
}

/**
 * @param {string} id
 * @returns {Promise<boolean>} whether a lead was removed
 */
export async function deleteLead(id) {
  const arr = await readLeadsArray();
  const next = arr.filter((l) => l && l.id !== id);
  if (next.length === arr.length) return false;
  await rawSet(STORAGE_KEYS.LEADS, next);
  return true;
}

/** Remove every lead. */
export async function clearAllLeads() {
  await rawSet(STORAGE_KEYS.LEADS, []);
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/**
 * All templates. Returns the seeded defaults if storage holds nothing usable.
 * @returns {Promise<object[]>}
 */
export async function getTemplates() {
  const value = await rawGet(STORAGE_KEYS.TEMPLATES, null);
  if (!Array.isArray(value) || value.length === 0) return getDefaultTemplates();
  const valid = value.filter(isValidTemplate);
  return valid.length ? valid : getDefaultTemplates();
}

/**
 * @param {object[]} templates
 * @returns {Promise<object[]>} the persisted (validated) templates
 */
export async function saveTemplates(templates) {
  const valid = Array.isArray(templates) ? templates.filter(isValidTemplate) : [];
  await rawSet(STORAGE_KEYS.TEMPLATES, valid);
  return valid;
}

/** Reset templates back to the seeded defaults. */
export async function resetTemplates() {
  const defaults = getDefaultTemplates();
  await rawSet(STORAGE_KEYS.TEMPLATES, defaults);
  return defaults;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/**
 * User settings merged over defaults (so new keys always have a value).
 * @returns {Promise<object>}
 */
export async function getSettings() {
  const value = await rawGet(STORAGE_KEYS.SETTINGS, {});
  const merged = { ...DEFAULT_SETTINGS, ...(value && typeof value === 'object' ? value : {}) };
  if (!Array.isArray(merged.socialDomains)) merged.socialDomains = [];
  return merged;
}

/**
 * @param {object} settings
 * @returns {Promise<object>} the persisted settings
 */
export async function saveSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...(settings && typeof settings === 'object' ? settings : {}) };
  if (!Array.isArray(merged.socialDomains)) merged.socialDomains = [];
  await rawSet(STORAGE_KEYS.SETTINGS, merged);
  return merged;
}

/* ------------------------------------------------------------------ */
/* Seeding & migrations                                                */
/* ------------------------------------------------------------------ */

/**
 * Migration hook. v1 has no prior versions to migrate from; future schema
 * bumps add cases here. Kept deliberately so the upgrade path already exists.
 * @param {number} fromVersion
 * @param {number} toVersion
 * @returns {Promise<void>}
 */
async function runMigrations(fromVersion, toVersion) {
  if (fromVersion === toVersion) return;
  // Example placeholder for future migrations:
  // if (fromVersion < 2) { ...transform stored leads... }
  console.info(`[MapReach] migrating storage from schema ${fromVersion} to ${toVersion}`);
}

/**
 * Seed default templates/settings and record the schema version on first run.
 * Safe to call on every page load; it only writes what is missing.
 * @returns {Promise<void>}
 */
export async function seedDefaultsIfNeeded() {
  const storedVersion = await rawGet(STORAGE_KEYS.SCHEMA, null);

  const templates = await rawGet(STORAGE_KEYS.TEMPLATES, null);
  if (!Array.isArray(templates) || templates.length === 0) {
    await rawSet(STORAGE_KEYS.TEMPLATES, getDefaultTemplates());
  }

  const settings = await rawGet(STORAGE_KEYS.SETTINGS, null);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    await rawSet(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
  }

  const leads = await rawGet(STORAGE_KEYS.LEADS, null);
  if (!Array.isArray(leads)) {
    await rawSet(STORAGE_KEYS.LEADS, []);
  }

  if (typeof storedVersion === 'number' && storedVersion !== SCHEMA_VERSION) {
    await runMigrations(storedVersion, SCHEMA_VERSION);
  }
  if (storedVersion !== SCHEMA_VERSION) {
    await rawSet(STORAGE_KEYS.SCHEMA, SCHEMA_VERSION);
  }
}

/* ------------------------------------------------------------------ */
/* Backup / restore                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build a full JSON backup object.
 * @returns {Promise<object>}
 */
export async function buildBackup() {
  const [leads, templates, settings] = await Promise.all([
    readLeadsArray(),
    getTemplates(),
    getSettings(),
  ]);
  return {
    app: 'MapReach',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    leads: leads.map(sanitizeLead),
    templates,
    settings,
  };
}

/**
 * Import a validated backup, MERGING into existing data. Leads are de-duplicated
 * (existing matches are updated via mergeLeadData, new leads are added).
 * Templates are merged by id (imported wins). Settings are shallow-merged.
 * @param {{ leads: object[], templates: object[], settings: object|null }} validated
 * @returns {Promise<{ leadsAdded: number, leadsUpdated: number, templates: number }>}
 */
export async function importBackupMerge(validated) {
  const current = await readLeadsArray();
  let leadsAdded = 0;
  let leadsUpdated = 0;

  for (const raw of validated.leads || []) {
    const incoming = sanitizeLead(raw);
    const dup = findDuplicateLead(incoming, current);
    if (dup) {
      const merged = mergeLeadData(dup.lead, incoming);
      const idx = current.findIndex((l) => l.id === dup.lead.id);
      if (idx >= 0) current[idx] = sanitizeLead(merged);
      leadsUpdated += 1;
    } else {
      current.push(incoming);
      leadsAdded += 1;
    }
  }
  await rawSet(STORAGE_KEYS.LEADS, current);

  let templateCount = 0;
  if (Array.isArray(validated.templates) && validated.templates.length) {
    const existing = await getTemplates();
    const byId = new Map(existing.map((t) => [t.id, t]));
    for (const t of validated.templates) {
      if (isValidTemplate(t)) {
        byId.set(t.id, t);
        templateCount += 1;
      }
    }
    await saveTemplates([...byId.values()]);
  }

  if (validated.settings && typeof validated.settings === 'object') {
    const currentSettings = await getSettings();
    await saveSettings({ ...currentSettings, ...validated.settings });
  }

  return { leadsAdded, leadsUpdated, templates: templateCount };
}

/**
 * Wipe ALL MapReach data from local storage.
 * @returns {Promise<void>}
 */
export async function clearAllData() {
  try {
    await chrome.storage.local.remove([
      STORAGE_KEYS.LEADS,
      STORAGE_KEYS.TEMPLATES,
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.SCHEMA,
    ]);
  } catch (err) {
    console.error('[MapReach] clearAllData failed', err);
    throw new Error('Could not clear local data.');
  }
}
