import { MESSAGE_TYPES, TRACKER_URL, SETTINGS_URL } from "../utils/constants.js";

/**
 * @param {string} targetUrl
 */
async function openOrFocusTab(targetUrl) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.url && tab.url.startsWith(targetUrl));

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    if (typeof existing.windowId === "number") {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return { focused: true };
  }

  await chrome.tabs.create({ url: targetUrl });
  return { created: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

  if (type === MESSAGE_TYPES.ping) {
    sendResponse({ success: true, source: "service_worker" });
    return false;
  }

  if (type === MESSAGE_TYPES.openTracker) {
    openOrFocusTab(TRACKER_URL)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (type === MESSAGE_TYPES.openSettings) {
    openOrFocusTab(SETTINGS_URL)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});
