/**
 * MapReach — background service worker (Manifest V3, ES module).
 *
 * Kept intentionally minimal: MV3 workers are ephemeral, so no important state
 * lives here. Responsibilities:
 *   - Make clicking the toolbar icon open the side panel.
 *   - Seed default templates/settings on install & startup.
 *   - Open the Tracker / Settings pages in a tab (focusing an existing one).
 */

import { MESSAGES } from '../utils/constants.js';
import { seedDefaultsIfNeeded } from '../utils/storage.js';

const TRACKER_PATH = 'tracker/tracker.html';
const SETTINGS_PATH = 'settings/settings.html';

/** Clicking the action icon opens the side panel (no popup is configured). */
async function enableSidePanelOnActionClick() {
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (err) {
    console.warn('[MapReach] Could not configure side panel behavior:', err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await enableSidePanelOnActionClick();
  try {
    await seedDefaultsIfNeeded();
  } catch (err) {
    console.warn('[MapReach] Seeding defaults failed:', err);
  }
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    enableSidePanelOnActionClick();
    seedDefaultsIfNeeded().catch(() => {});
  });
}

/**
 * Open an extension page in a tab, focusing an existing tab if one is already
 * showing that page.
 * @param {string} path relative extension path
 * @returns {Promise<number|undefined>} the tab id
 */
async function openExtensionPage(path) {
  const url = chrome.runtime.getURL(path);
  try {
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find((t) => t.url === url || t.pendingUrl === url);
    if (existing && existing.id != null) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        await chrome.windows.update(existing.windowId, { focused: true });
      }
      return existing.id;
    }
  } catch (err) {
    console.warn('[MapReach] Could not query tabs; creating a new one.', err);
  }
  const tab = await chrome.tabs.create({ url });
  return tab.id;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message && message.type;

  if (type === MESSAGES.OPEN_TRACKER) {
    openExtensionPage(TRACKER_PATH)
      .then((tabId) => sendResponse({ ok: true, tabId }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async response
  }

  if (type === MESSAGES.OPEN_SETTINGS) {
    openExtensionPage(SETTINGS_PATH)
      .then((tabId) => sendResponse({ ok: true, tabId }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async response
  }

  return false;
});
