const DEBUG = false;

const log = (...args) => {
  if (DEBUG) {
    console.log("[MapReach]", ...args);
  }
};

/**
 * SELECTORS / EXTRACTION STRATEGIES
 * Keep these grouped for easier maintenance as Google Maps DOM evolves.
 */
const SELECTORS = {
  businessTitle: [
    "h1.DUwDvf",
    "h1[data-attrid='title']",
    "h1[aria-level='1']",
    "h1",
  ],
  categoryButtons: [
    "button[jsaction*='category']",
    "button[aria-label*='Category']",
    "button[aria-label*='category']",
  ],
  ratingNodes: [
    "div[role='img'][aria-label*='star']",
    "span[aria-label*='star']",
    "div.F7nice span[aria-hidden='true']",
  ],
  infoButtons: [
    "button[data-item-id*='address']",
    "button[data-item-id*='phone']",
    "button[data-item-id*='authority']",
    "a[data-item-id*='authority']",
    "a[href^='tel:']",
    "a[href^='http']",
  ],
  allAnchors: ["a[href]"],
};

const MESSAGE_TYPES = {
  ping: "MAPREACH_PING",
  getCurrentLead: "MAPREACH_GET_CURRENT_LEAD",
};

/**
 * @param {Element | null | undefined} element
 */
function getCleanText(element) {
  if (!element) return null;
  return String(element.textContent || "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

/**
 * @param {Element | null | undefined} element
 */
function getAriaLabel(element) {
  if (!element) return null;
  const label = element.getAttribute("aria-label");
  return label ? label.trim() : null;
}

/**
 * @param {string[]} selectors
 * @param {ParentNode} [root]
 */
function queryFirst(selectors, root = document) {
  for (const selector of selectors) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}

/**
 * @param {string[]} selectors
 * @param {ParentNode} [root]
 */
function queryAll(selectors, root = document) {
  const out = [];
  for (const selector of selectors) {
    out.push(...Array.from(root.querySelectorAll(selector)));
  }
  return out;
}

/**
 * @param {string | null} raw
 */
function parseRating(raw) {
  if (!raw) return null;
  const normalized = raw.replace(/,/g, ".");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 5.1) return null;
  return Number(value.toFixed(1));
}

/**
 * @param {string | null} raw
 */
function parseReviewCount(raw) {
  if (!raw) return null;
  const compact = raw.replace(/\s/g, "");
  const explicit = compact.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)/);
  if (!explicit) return null;
  const str = explicit[1];
  const cleaned = str.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(/,/g, "");
  const count = Number(cleaned);
  if (!Number.isFinite(count)) return null;
  return Math.max(0, Math.round(count));
}

/**
 * @param {string | null} value
 */
function normalizePhone(value) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  const core = cleaned.match(/[+\d][\d\s().-]{5,}/);
  return core ? core[0].trim() : cleaned || null;
}

/**
 * @param {string | null} value
 */
function normalizeUrl(value) {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractMapsUrl() {
  return window.location.href;
}

function extractBusinessName() {
  const node = queryFirst(SELECTORS.businessTitle);
  return getCleanText(node);
}

function extractCategory() {
  const named = queryAll(SELECTORS.categoryButtons).find((node) => {
    const label = getAriaLabel(node) || "";
    return /category/i.test(label);
  });
  if (named) {
    const text = getCleanText(named);
    if (text && !/category/i.test(text)) return text;
  }

  const fallback = document.querySelector("button[jslog][class*='DkEaL']");
  return getCleanText(fallback);
}

function extractAddress() {
  const addressButton = document.querySelector("button[data-item-id*='address']");
  if (addressButton) {
    const label = getAriaLabel(addressButton);
    if (label) {
      return label.replace(/^Address:\s*/i, "").trim() || null;
    }
    return getCleanText(addressButton);
  }

  const node = Array.from(document.querySelectorAll("button, div, span")).find((el) => {
    const text = getCleanText(el);
    if (!text) return false;
    return /\d+\s+.+(street|st\b|road|rd\b|avenue|ave\b|blvd|lane|ln\b|drive|dr\b)/i.test(text);
  });

  return getCleanText(node);
}

function extractPhone() {
  const telLink = document.querySelector("a[href^='tel:']");
  if (telLink) {
    const href = telLink.getAttribute("href");
    const value = href?.replace(/^tel:/i, "") || getCleanText(telLink);
    return normalizePhone(value || null);
  }

  const phoneButton = document.querySelector("button[data-item-id*='phone']");
  if (phoneButton) {
    const label = getAriaLabel(phoneButton);
    if (label) return normalizePhone(label.replace(/^Phone:\s*/i, ""));
    return normalizePhone(getCleanText(phoneButton));
  }

  return null;
}

function extractWebsite() {
  const websiteCandidates = queryAll(SELECTORS.allAnchors).filter((anchor) => {
    const href = anchor.getAttribute("href") || "";
    if (!href) return false;
    if (href.startsWith("tel:")) return false;
    if (/google\./i.test(new URL(href, window.location.origin).hostname)) return false;
    return /^https?:\/\//i.test(href);
  });

  const authorityNode = document.querySelector("a[data-item-id*='authority']");
  if (authorityNode) {
    const explicit = normalizeUrl(authorityNode.getAttribute("href"));
    if (explicit) return explicit;
  }

  for (const anchor of websiteCandidates) {
    const normalized = normalizeUrl(anchor.getAttribute("href"));
    if (normalized) return normalized;
  }

  return null;
}

function extractRatingAndReviews() {
  const candidates = queryAll(SELECTORS.ratingNodes);
  for (const node of candidates) {
    const aria = getAriaLabel(node);
    const text = getCleanText(node);
    const blob = [aria, text].filter(Boolean).join(" ");
    if (!blob) continue;
    const rating = parseRating(blob);
    const reviewCount = parseReviewCount(blob);
    if (rating !== null || reviewCount !== null) {
      return { rating, reviewCount };
    }
  }

  const allText = getCleanText(document.body) || "";
  const rating = parseRating(allText);
  const reviewCount = parseReviewCount(allText);
  return { rating, reviewCount };
}

function extractPlaceIdFromUrl() {
  const url = window.location.href;
  const cidMatch = url.match(/[?&]cid=(\d+)/i);
  if (cidMatch) return `cid:${cidMatch[1]}`;

  const dataMatch = url.match(/!1s([^!]+)/);
  if (dataMatch) {
    const candidate = decodeURIComponent(dataMatch[1]);
    if (candidate && !candidate.includes(" ")) return `gpid:${candidate}`;
  }

  return null;
}

function hasOpenBusinessPanel() {
  const name = extractBusinessName();
  if (name) return true;

  const hasAddress = Boolean(document.querySelector("button[data-item-id*='address']"));
  const hasPhone = Boolean(document.querySelector("button[data-item-id*='phone'], a[href^='tel:']"));
  return hasAddress || hasPhone;
}

function buildFailurePayload(message) {
  return {
    success: true,
    isBusinessListing: false,
    error: message,
    lead: {
      placeId: null,
      name: null,
      category: null,
      phone: null,
      website: null,
      hasWebsite: null,
      rating: null,
      reviewCount: null,
      address: null,
      mapsUrl: extractMapsUrl(),
      source: "google_maps",
      extractedAt: new Date().toISOString(),
      extractionWarnings: [message],
    },
  };
}

function extractLeadPayload() {
  if (!/google\./i.test(window.location.hostname) || !window.location.pathname.startsWith("/maps")) {
    return buildFailurePayload("Open an individual business listing in Google Maps, then try again.");
  }

  if (!hasOpenBusinessPanel()) {
    return buildFailurePayload("Open an individual business listing in Google Maps, then try again.");
  }

  const warnings = [];
  const name = extractBusinessName();
  const category = extractCategory();
  const address = extractAddress();
  const phone = extractPhone();
  const website = extractWebsite();
  const { rating, reviewCount } = extractRatingAndReviews();
  const placeId = extractPlaceIdFromUrl();
  const mapsUrl = extractMapsUrl();

  if (!name) warnings.push("Could not reliably find the business name.");
  if (!phone) warnings.push("Could not find a phone number.");
  if (!website) warnings.push("Website link was not detected.");
  if (!category) warnings.push("Could not confidently identify the category.");
  if (!address) warnings.push("Could not confidently identify the address.");

  let hasWebsite = null;
  if (website) hasWebsite = true;
  else if (name) hasWebsite = false;

  return {
    success: true,
    isBusinessListing: true,
    lead: {
      placeId,
      name: name || null,
      category: category || null,
      phone: phone || null,
      website: website || null,
      hasWebsite,
      rating,
      reviewCount,
      address: address || null,
      mapsUrl,
      source: "google_maps",
      extractedAt: new Date().toISOString(),
      extractionWarnings: warnings,
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === MESSAGE_TYPES.ping) {
    sendResponse({
      success: true,
      source: "content_script",
      url: window.location.href,
      isMaps: window.location.pathname.startsWith("/maps"),
    });
    return;
  }

  if (message.type === MESSAGE_TYPES.getCurrentLead) {
    try {
      const payload = extractLeadPayload();
      log("Extraction payload", payload);
      sendResponse(payload);
    } catch (error) {
      sendResponse({
        success: false,
        isBusinessListing: false,
        error: "Could not read this listing. Google Maps may have changed.",
        lead: null,
        debug: DEBUG ? String(error?.message || error) : undefined,
      });
    }
  }
});
