/**
 * MapReach — side panel controller.
 *
 * Requests the current listing from the Google Maps content script, renders one
 * of five UI states, and handles template selection, message copying, and
 * duplicate-guarded saving/updating. The panel stays docked open and re-reads
 * the listing as the user moves between businesses (guarding unsaved edits).
 */

import { MESSAGES, LANGUAGE_LABELS, RTL_LANGUAGES, STATUS_META } from '../utils/constants.js';
import {
  seedDefaultsIfNeeded,
  getSettings,
  getTemplates,
  getLeads,
  getLeadById,
  saveLead,
  updateLead,
} from '../utils/storage.js';
import { pickTemplate, generateMessage, suggestLanguage } from '../utils/templates.js';
import { classifyWebsite, getDomain, deriveCity, formatRating, formatReviewCount, truncate } from '../utils/formatters.js';
import { findDuplicateLead, mergeLeadData, buildLeadId } from '../utils/deduplication.js';
import { sanitizeLead, assertSavable, cryptoId } from '../utils/validation.js';

/* ---------- module state ---------- */
const state = {
  settings: null,
  templates: [],
  pageLanguage: null,
  candidate: null, // freshly extracted lead (not yet saved)
  duplicate: null, // { lead, reason } if already saved
  messageDirty: false,
  pendingLeadId: null, // id of a newly-detected listing awaiting a guarded refresh
  currentTemplateId: null,
};

/* ---------- element helpers ---------- */
const $ = (id) => document.getElementById(id);
const STATES = ['state-loading', 'state-not-maps', 'state-no-listing', 'state-error', 'state-success'];

/** Show exactly one top-level state section. */
function showState(id) {
  for (const s of STATES) {
    const el = $(s);
    if (el) el.hidden = s !== id;
  }
}

let toastTimer = null;
/**
 * Show a transient toast message.
 * @param {string} text
 * @param {('success'|'error'|'')} [kind]
 */
function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast${kind ? ` toast-${kind}` : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

/* ---------- clipboard ---------- */
/**
 * Copy text to the clipboard with a legacy fallback.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/* ---------- tab / content-script messaging ---------- */
const MAPS_HOST_RE = /^https?:\/\/www\.google\.com\/maps/i;

/** @returns {Promise<chrome.tabs.Tab|null>} the active tab in the current window. */
async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch {
    return null;
  }
}

/**
 * Send a message to a tab's content script, resolving null on failure instead
 * of throwing (the content script may not be injected).
 * @param {number} tabId
 * @param {object} message
 * @returns {Promise<object|null>}
 */
function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

/* ---------- core refresh / state machine ---------- */

/**
 * Read the active tab, talk to the content script, and render the right state.
 * @param {boolean} [force] bypass the unsaved-edits guard
 */
async function refresh(force = false) {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !MAPS_HOST_RE.test(tab.url)) {
    resetPanelState();
    showState('state-not-maps');
    return;
  }

  // Guard: if the user has unsaved edits and a different listing is now open,
  // don't clobber their message — offer a manual "Load it" instead.
  if (!force && state.messageDirty && !$('state-success').hidden) {
    const banner = $('refresh-banner');
    if (banner) banner.hidden = false;
    return;
  }

  showState('state-loading');

  const ping = await sendToTab(tab.id, { type: MESSAGES.PING });
  if (!ping) {
    // Content script not present (tab opened before install, or still loading).
    $('error-detail').textContent =
      'MapReach could not reach this Google Maps tab. Reload the Maps tab, then click “Try again”.';
    showState('state-error');
    return;
  }

  const payload = await sendToTab(tab.id, { type: MESSAGES.GET_CURRENT_LEAD });
  if (!payload || payload.success === false) {
    $('error-detail').textContent =
      (payload && payload.error) ||
      'Google Maps may have changed, or this listing may not expose the data. Try reopening the business.';
    showState('state-error');
    return;
  }

  state.pageLanguage = payload.pageLanguage || null;

  if (!payload.isBusinessListing || !payload.lead) {
    showState('state-no-listing');
    return;
  }

  await renderLead(payload.lead);
}

/** Clear transient per-listing state. */
function resetPanelState() {
  state.candidate = null;
  state.duplicate = null;
  state.messageDirty = false;
  state.pendingLeadId = null;
  const banner = $('refresh-banner');
  if (banner) banner.hidden = true;
}

/**
 * Turn a raw content-script lead into a saveable candidate, re-classifying the
 * website against the user's (possibly customized) social-domain list.
 * @param {object} raw
 * @returns {object}
 */
function buildCandidate(raw) {
  const extraSocial = (state.settings && state.settings.socialDomains) || [];
  const info = classifyWebsite(raw.website, extraSocial);

  let hasWebsite = raw.hasWebsite;
  let websiteType = info.type;
  let socialPlatform = info.platform;

  if (raw.website) {
    if (info.type === 'real') hasWebsite = true;
    else if (info.type === 'social') hasWebsite = false;
  } else if (raw.websiteType === 'unknown') {
    websiteType = 'unknown';
    hasWebsite = null;
    socialPlatform = null;
  } else {
    websiteType = 'none';
    hasWebsite = false;
    socialPlatform = null;
  }

  const candidate = {
    placeId: raw.placeId || null,
    name: raw.name || '',
    category: raw.category || null,
    phone: raw.phone || null,
    website: info.url,
    hasWebsite,
    websiteType,
    socialPlatform,
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    reviewCount: typeof raw.reviewCount === 'number' ? raw.reviewCount : null,
    address: raw.address || null,
    mapsUrl: raw.mapsUrl || null,
    source: 'google_maps',
    extractedAt: raw.extractedAt || new Date().toISOString(),
    extractionWarnings: Array.isArray(raw.extractionWarnings) ? raw.extractionWarnings : [],
  };
  const id = buildLeadId(candidate);
  candidate.id = id || cryptoId();
  candidate._idWasRandom = !id;
  return candidate;
}

/**
 * Render the success state for a freshly-extracted lead.
 * @param {object} raw
 */
async function renderLead(raw) {
  resetPanelState();
  const candidate = buildCandidate(raw);
  state.candidate = candidate;

  // Name + category
  $('lead-name').textContent = candidate.name || 'Unnamed business';
  const catEl = $('lead-category');
  if (candidate.category) {
    catEl.textContent = candidate.category;
    catEl.hidden = false;
  } else {
    catEl.hidden = true;
  }

  // Rating + reviews
  const ratingEl = $('lead-rating');
  if (candidate.rating !== null) {
    const reviews = candidate.reviewCount !== null ? ` (${formatReviewCount(candidate.reviewCount)} reviews)` : '';
    ratingEl.textContent = '';
    const star = document.createElement('span');
    star.className = 'stars';
    star.textContent = '★ ';
    ratingEl.appendChild(star);
    ratingEl.appendChild(document.createTextNode(`${formatRating(candidate.rating)}${reviews}`));
    ratingEl.hidden = false;
  } else {
    ratingEl.hidden = true;
  }

  // Address
  const addrEl = $('lead-address');
  if (candidate.address) {
    addrEl.textContent = candidate.address;
    addrEl.hidden = false;
  } else {
    addrEl.hidden = true;
  }

  // Phone
  const phoneRow = $('phone-row');
  if (candidate.phone) {
    $('lead-phone').textContent = candidate.phone;
    phoneRow.hidden = false;
  } else {
    phoneRow.hidden = true;
  }

  renderWebsiteRow(candidate);
  renderWarnings(candidate);
  await renderSavedState(candidate);
  setupMessage(candidate);

  showState('state-success');
}

/**
 * Render the website row with the correct badge/link for the website type.
 * @param {object} candidate
 */
function renderWebsiteRow(candidate) {
  const row = $('website-row');
  row.textContent = '';

  const label = document.createElement('span');
  label.className = 'lead-line';

  if (candidate.websiteType === 'real' && candidate.website) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-real';
    badge.textContent = 'Website';
    const link = document.createElement('a');
    link.className = 'website-link';
    link.href = candidate.website;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = getDomain(candidate.website) || candidate.website;
    row.appendChild(badge);
    row.appendChild(link);
  } else if (candidate.websiteType === 'social') {
    const badge = document.createElement('span');
    badge.className = 'badge badge-social';
    badge.textContent = `Social media only${candidate.socialPlatform ? ` — ${candidate.socialPlatform}` : ''}`;
    row.appendChild(badge);
    if (candidate.website) {
      const link = document.createElement('a');
      link.className = 'website-link';
      link.href = candidate.website;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = truncate(getDomain(candidate.website) || candidate.website, 34);
      row.appendChild(link);
    }
  } else if (candidate.websiteType === 'unknown') {
    const badge = document.createElement('span');
    badge.className = 'badge badge-unknown';
    badge.textContent = 'Website not confirmed';
    row.appendChild(badge);
  } else {
    const badge = document.createElement('span');
    badge.className = 'badge badge-none';
    badge.textContent = 'No website detected';
    row.appendChild(badge);
  }
}

/**
 * Render extraction warnings (respecting the showWarnings setting).
 * @param {object} candidate
 */
function renderWarnings(candidate) {
  const wrap = $('warnings-wrap');
  const list = $('warnings-list');
  list.textContent = '';
  const warnings = candidate.extractionWarnings || [];
  if (!state.settings.showWarnings || warnings.length === 0) {
    wrap.hidden = true;
    return;
  }
  for (const w of warnings) {
    const li = document.createElement('li');
    li.textContent = w;
    list.appendChild(li);
  }
  wrap.hidden = false;
}

/**
 * Check whether this candidate already exists and update the save button + info.
 * @param {object} candidate
 */
async function renderSavedState(candidate) {
  const leads = await getLeads();
  const dup = findDuplicateLead(candidate, leads);
  state.duplicate = dup;
  const info = $('saved-info');
  const saveBtn = $('btn-save');

  if (dup) {
    const meta = STATUS_META[dup.lead.status] || STATUS_META.unsent;
    const saved = new Date(dup.lead.savedAt);
    const savedStr = Number.isNaN(saved.getTime()) ? '' : saved.toLocaleDateString();
    info.textContent = `Already saved · ${meta.label}${savedStr ? ` · ${savedStr}` : ''} · ${dup.reason}`;
    info.hidden = false;
    saveBtn.textContent = 'Update lead';
  } else {
    info.hidden = true;
    saveBtn.textContent = 'Save lead';
  }
}

/* ---------- message tools ---------- */

/** Effective language given the current selector value. */
function effectiveLanguage() {
  const sel = $('lang-select').value;
  if (sel === 'auto') return suggestLanguage(state.candidate, state.pageLanguage, state.settings);
  return sel;
}

/** Populate the template dropdown and auto-select the best match. */
function setupMessage(candidate) {
  const select = $('template-select');
  select.textContent = '';
  for (const t of state.templates) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  }

  const picked = pickTemplate(state.templates, candidate);
  state.currentTemplateId = picked ? picked.template.id : (state.templates[0] && state.templates[0].id);
  if (state.currentTemplateId) select.value = state.currentTemplateId;

  // Default language selector to Auto; show the detected language as a hint.
  $('lang-select').value = 'auto';
  const reason = picked ? picked.reason : '';
  const auto = suggestLanguage(candidate, state.pageLanguage, state.settings);
  $('template-reason').textContent = `${reason ? `${reason}. ` : ''}Language: ${LANGUAGE_LABELS[auto] || auto} (auto).`;

  regenerateMessage();
}

/** Regenerate the message from the current template + language. */
function regenerateMessage() {
  const template = state.templates.find((t) => t.id === $('template-select').value);
  const lang = effectiveLanguage();
  const leadForVars = { ...state.candidate, city: deriveCity(state.candidate && state.candidate.address) };
  const text = template ? generateMessage(template, leadForVars, lang) : '';
  const ta = $('message-text');
  ta.value = text;
  ta.setAttribute('dir', RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr');
  state.messageDirty = false;
}

/* ---------- save / update ---------- */

async function handleSaveOrUpdate() {
  if (!state.candidate) return;

  if (state.duplicate) {
    // Update existing lead, preserving user-managed fields.
    const existing = await getLeadById(state.duplicate.lead.id);
    if (!existing) {
      // It vanished; fall through to a fresh save.
      state.duplicate = null;
    } else {
      const merged = mergeLeadData(existing, state.candidate);
      const updated = await updateLead(existing.id, merged);
      if (updated) {
        toast('Lead updated', 'success');
        await renderSavedState(state.candidate);
        if (state.settings.openTrackerAfterSave) openTracker();
      } else {
        toast('Could not update the lead', 'error');
      }
      return;
    }
  }

  const check = assertSavable(state.candidate);
  if (!check.ok) {
    toast(check.reason || 'This lead cannot be saved.', 'error');
    return;
  }

  const now = new Date().toISOString();
  const lead = sanitizeLead({
    ...state.candidate,
    status: 'unsent',
    notes: '',
    selectedTemplateId: $('template-select').value || null,
    selectedLanguage: effectiveLanguage(),
    firstContactedAt: null,
    lastContactedAt: null,
    savedAt: now,
    updatedAt: now,
  });

  try {
    await saveLead(lead);
    if (state.candidate._idWasRandom) {
      toast('Saved (no stable ID — duplicate matching is weaker)', 'success');
    } else {
      toast('Lead saved', 'success');
    }
    await renderSavedState(state.candidate);
    if (state.settings.openTrackerAfterSave) openTracker();
  } catch (err) {
    toast(err && err.message ? err.message : 'Could not save the lead', 'error');
  }
}

/** Explicitly mark the current lead as sent (saving first if needed). */
async function handleMarkSent() {
  if (!state.candidate) return;
  const now = new Date().toISOString();

  let targetId = state.duplicate ? state.duplicate.lead.id : null;
  if (!targetId) {
    const check = assertSavable(state.candidate);
    if (!check.ok) {
      toast(check.reason || 'This lead cannot be saved.', 'error');
      return;
    }
    const saved = await saveLead(
      sanitizeLead({
        ...state.candidate,
        status: 'unsent',
        notes: '',
        selectedTemplateId: $('template-select').value || null,
        selectedLanguage: effectiveLanguage(),
        savedAt: now,
        updatedAt: now,
      }),
    );
    targetId = saved.id;
  }

  const existing = await getLeadById(targetId);
  const patch = {
    status: 'sent',
    lastContactedAt: now,
    firstContactedAt: existing && existing.firstContactedAt ? existing.firstContactedAt : now,
  };
  const updated = await updateLead(targetId, patch);
  if (updated) {
    toast('Marked as sent', 'success');
    await renderSavedState(state.candidate);
  } else {
    toast('Could not update status', 'error');
  }
}

/* ---------- navigation ---------- */
function openTracker() {
  chrome.runtime.sendMessage({ type: MESSAGES.OPEN_TRACKER }, () => void chrome.runtime.lastError);
}
function openSettings() {
  chrome.runtime.sendMessage({ type: MESSAGES.OPEN_SETTINGS }, () => void chrome.runtime.lastError);
}

/* ---------- wiring ---------- */
function wireEvents() {
  $('btn-refresh').addEventListener('click', () => refresh(true));
  $('btn-tracker').addEventListener('click', openTracker);
  $('btn-tracker-error').addEventListener('click', openTracker);
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-retry-nolisting').addEventListener('click', () => refresh(true));
  $('btn-retry-error').addEventListener('click', () => refresh(true));
  $('btn-apply-refresh').addEventListener('click', () => refresh(true));

  $('btn-save').addEventListener('click', handleSaveOrUpdate);
  $('btn-mark-sent').addEventListener('click', handleMarkSent);

  $('btn-copy-phone').addEventListener('click', async () => {
    if (state.candidate && state.candidate.phone) {
      const ok = await copyText(state.candidate.phone);
      toast(ok ? 'Phone copied' : 'Copy failed', ok ? 'success' : 'error');
    }
  });

  $('btn-copy-message').addEventListener('click', async () => {
    const text = $('message-text').value;
    if (!text.trim()) {
      toast('Nothing to copy yet', 'error');
      return;
    }
    const ok = await copyText(text);
    toast(ok ? 'Message copied' : 'Copy failed — select the text and copy manually', ok ? 'success' : 'error');
  });

  $('template-select').addEventListener('change', () => {
    state.currentTemplateId = $('template-select').value;
    regenerateMessage();
  });
  $('lang-select').addEventListener('change', regenerateMessage);
  $('message-text').addEventListener('input', () => {
    state.messageDirty = true;
  });

  // Tab awareness: re-read when the user switches tabs or navigates on Maps.
  let debounce = null;
  const scheduleRefresh = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => refresh(false), 500);
  };
  chrome.tabs.onActivated.addListener(scheduleRefresh);
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab && tab.active && changeInfo.url) scheduleRefresh();
  });
}

/* ---------- init ---------- */
async function init() {
  wireEvents();
  try {
    await seedDefaultsIfNeeded();
  } catch {
    /* non-fatal */
  }
  state.settings = await getSettings();
  state.templates = await getTemplates();
  await refresh(true);
}

document.addEventListener('DOMContentLoaded', init);
