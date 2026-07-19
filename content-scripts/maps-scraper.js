/**
 * MapReach — Google Maps content script (classic script, NO ES modules).
 *
 * Reads ONLY the currently-open business listing on Google Maps and returns
 * normalized data. It never modifies the page, never clicks or navigates, and
 * never scrapes the search-results list. It responds to two runtime messages:
 *   - { type: "MAPREACH_PING" }              -> liveness + current URL
 *   - { type: "MAPREACH_GET_CURRENT_LEAD" }  -> normalized lead payload
 *
 * Google Maps markup changes often. All brittle selectors and per-field
 * strategies are grouped in the SELECTORS / EXTRACTION STRATEGIES block below so
 * they are easy to find and update. Every field has layered fallbacks and
 * degrades to null (with a warning) rather than guessing.
 */

(function () {
  'use strict';

  /** Toggle verbose logging. Leave false in shipped builds. */
  const DEBUG = false;
  const TAG = '[MapReach]';

  /** @param {...unknown} args */
  function log(...args) {
    if (DEBUG) console.log(TAG, ...args);
  }

  /* =================================================================== */
  /* SELECTORS / EXTRACTION STRATEGIES  (maintain these when Maps changes) */
  /* =================================================================== */

  const SELECTORS = Object.freeze({
    // The place detail panel. Google reuses role="main" for both the results
    // list and the open place; we disambiguate by looking for an <h1> and/or
    // action buttons carrying data-item-id.
    panel: ['div[role="main"]', 'div[role="region"]'],
    name: ['h1'],
    // Category button carries jsaction ending in ".category" (verified on live
    // Maps, July 2026); the DkEaL class is a secondary hook.
    category: ['button[jsaction*="category" i]', 'button.DkEaL', '[jsaction*="category" i]'],
    // Rating/reviews live in a small cluster; class names are volatile so we
    // also fall back to aria-labels.
    ratingCluster: ['div.F7nice', '.F7nice'],
    ratingAria: ['[role="img"][aria-label]'],
    reviewsButton: [
      'button[aria-label*="review" i]',
      'button[aria-label*="avis" i]',
      'span[aria-label*="review" i]',
      'span[aria-label*="مراجع"]',
    ],
    // Phone: the most stable signal is data-item-id="phone:tel:...".
    phone: [
      'button[data-item-id^="phone:tel:"]',
      'a[data-item-id^="phone:tel:"]',
      'a[href^="tel:"]',
    ],
    // Website: the canonical link carries data-item-id="authority".
    website: [
      'a[data-item-id="authority"]',
      'a[data-item-id^="authority"]',
      'a[aria-label*="website" i]',
      'a[aria-label*="site web" i]',
      'a[aria-label*="الموقع"]',
    ],
    // Address: data-item-id="address" button.
    address: ['button[data-item-id="address"]', '[data-item-id="address"]'],
    // Presence of any of these means the info section has loaded.
    infoSection: ['[data-item-id]', 'div.F7nice', 'button[data-item-id^="phone:tel:"]'],
  });

  /**
   * Host fragments treated as social / messaging links rather than a real
   * website. Trimmed copy of utils/constants.js DEFAULT_SOCIAL_DOMAINS — content
   * scripts can't import ES modules, so keep this roughly in sync.
   */
  const SOCIAL_DOMAINS = [
    'facebook.com', 'fb.com', 'fb.me', 'm.facebook.com',
    'instagram.com', 'instagr.am',
    'wa.me', 'whatsapp.com', 'api.whatsapp.com', 'chat.whatsapp.com',
    't.me', 'telegram.me', 'telegram.org',
    'twitter.com', 'x.com',
    'tiktok.com',
    'youtube.com', 'youtu.be',
    'linkedin.com',
    'linktr.ee', 'linktree.com',
    'snapchat.com',
    'pinterest.com', 'pin.it',
    'threads.net',
  ];
  const SOCIAL_PLATFORM_NAMES = {
    'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'fb.me': 'Facebook', 'm.facebook.com': 'Facebook',
    'instagram.com': 'Instagram', 'instagr.am': 'Instagram',
    'wa.me': 'WhatsApp', 'whatsapp.com': 'WhatsApp', 'api.whatsapp.com': 'WhatsApp', 'chat.whatsapp.com': 'WhatsApp',
    't.me': 'Telegram', 'telegram.me': 'Telegram', 'telegram.org': 'Telegram',
    'twitter.com': 'X (Twitter)', 'x.com': 'X (Twitter)',
    'tiktok.com': 'TikTok',
    'youtube.com': 'YouTube', 'youtu.be': 'YouTube',
    'linkedin.com': 'LinkedIn',
    'linktr.ee': 'Linktree', 'linktree.com': 'Linktree',
    'snapchat.com': 'Snapchat',
    'pinterest.com': 'Pinterest', 'pin.it': 'Pinterest',
    'threads.net': 'Threads',
  };

  /* =================================================================== */
  /* Generic DOM helpers                                                  */
  /* =================================================================== */

  /**
   * Collapsed, trimmed textContent of an element.
   * @param {Element|null} element
   * @returns {string}
   */
  function getCleanText(element) {
    if (!element || typeof element.textContent !== 'string') return '';
    return element.textContent.replace(/\s+/g, ' ').trim();
  }

  /**
   * Trimmed aria-label of an element.
   * @param {Element|null} element
   * @returns {string}
   */
  function getAriaLabel(element) {
    if (!element || typeof element.getAttribute !== 'function') return '';
    return (element.getAttribute('aria-label') || '').trim();
  }

  /**
   * First element matching any selector in the list, searched within `root`.
   * @param {string[]} selectors
   * @param {ParentNode|null} [root]
   * @returns {Element|null}
   */
  function queryFirst(selectors, root) {
    const scope = root || document;
    for (const sel of selectors) {
      try {
        const el = scope.querySelector(sel);
        if (el) return el;
      } catch (err) {
        log('bad selector', sel, err);
      }
    }
    return null;
  }

  /**
   * All elements matching any selector in the list (de-duplicated).
   * @param {string[]} selectors
   * @param {ParentNode|null} [root]
   * @returns {Element[]}
   */
  function queryAll(selectors, root) {
    const scope = root || document;
    const out = [];
    const seen = new Set();
    for (const sel of selectors) {
      try {
        scope.querySelectorAll(sel).forEach((el) => {
          if (!seen.has(el)) {
            seen.add(el);
            out.push(el);
          }
        });
      } catch (err) {
        log('bad selector', sel, err);
      }
    }
    return out;
  }

  /* =================================================================== */
  /* Parsing / normalization helpers                                      */
  /* =================================================================== */

  /**
   * Parse a rating (0–5) from a string such as "4.6", "4,6" or "4.6 stars".
   * @param {string} value
   * @returns {number|null}
   */
  function parseRating(value) {
    if (typeof value !== 'string') return null;
    const m = value.match(/(\d+(?:[.,]\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    if (!isFinite(n) || n < 0 || n > 5) return null;
    return Math.round(n * 10) / 10;
  }

  /**
   * Parse a review count, tolerating comma/period/space grouping separators.
   * Only call this on text known to be a count (not the rating).
   * @param {string} value
   * @returns {number|null}
   */
  function parseReviewCount(value) {
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/[.,  \s]/g, '');
    const m = cleaned.match(/\d{1,9}/);
    if (!m) return null;
    const n = parseInt(m[0], 10);
    return isFinite(n) ? n : null;
  }

  /**
   * Conservatively normalize a phone number for display: keep + and digits,
   * collapse whitespace. Returns null when nothing usable remains.
   * @param {string} value
   * @returns {string|null}
   */
  function normalizePhone(value) {
    if (typeof value !== 'string') return null;
    let v = value.replace(/\s+/g, ' ').trim();
    // Strip a leading "Phone:"-style label if present.
    v = v.replace(/^[^+\d]{0,20}[:\-]\s*/, '').trim();
    const digits = v.replace(/[^\d]/g, '');
    if (digits.length < 5) return null;
    return v;
  }

  /**
   * Normalize a raw href into a clean absolute http(s) URL, or null.
   * @param {string} value
   * @returns {string|null}
   */
  function normalizeUrl(value) {
    if (typeof value !== 'string') return null;
    let v = value.trim();
    if (!v) return null;
    if (/^(tel:|mailto:|javascript:|data:|sms:)/i.test(v)) return null;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
      const u = new URL(v);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!u.hostname || u.hostname.indexOf('.') === -1) return null;
      return u.toString();
    } catch (err) {
      return null;
    }
  }

  /**
   * Domain (lowercased, no www) for a URL, or null.
   * @param {string} url
   * @returns {string|null}
   */
  function getDomain(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) return null;
    try {
      return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
    } catch (err) {
      return null;
    }
  }

  /**
   * Classify a website URL as real / social / none.
   * @param {string|null} url
   * @returns {{ type: string, platform: string|null, domain: string|null, url: string|null }}
   */
  function classifyWebsite(url) {
    const normalized = normalizeUrl(url);
    const domain = getDomain(normalized);
    if (!normalized || !domain) return { type: 'none', platform: null, domain: null, url: null };
    for (const base of SOCIAL_DOMAINS) {
      if (domain === base || domain.endsWith('.' + base)) {
        return { type: 'social', platform: SOCIAL_PLATFORM_NAMES[base] || base, domain: domain, url: normalized };
      }
    }
    return { type: 'real', platform: null, domain: domain, url: normalized };
  }

  /**
   * Remove a leading field label (e.g. "Address:") from a string.
   * @param {string} value
   * @returns {string}
   */
  function stripLeadingLabel(value) {
    return String(value || '')
      .replace(/^(address|adresse|dirección|indirizzo|العنوان|phone|téléphone|telephone|الهاتف|هاتف)\s*[:\-]?\s*/i, '')
      .trim();
  }

  /* =================================================================== */
  /* Panel + per-field extraction                                         */
  /* =================================================================== */

  /**
   * Locate the open place's detail panel. Prefers a role="main"/region element
   * that contains an <h1> and/or data-item-id action buttons.
   * @returns {Element}
   */
  function getPanel() {
    const candidates = queryAll(SELECTORS.panel);
    let best = null;
    for (const el of candidates) {
      const hasHeading = !!el.querySelector('h1');
      const hasItems = !!el.querySelector('[data-item-id]');
      if (hasHeading && hasItems) return el;
      if ((hasHeading || hasItems) && !best) best = el;
    }
    return best || document.body;
  }

  /**
   * @param {Element} panel
   * @returns {string|null}
   */
  function extractBusinessName(panel) {
    const headings = queryAll(SELECTORS.name, panel);
    for (const h of headings) {
      const text = getCleanText(h);
      if (text && text.length <= 120) return text;
    }
    // Fallback: panel aria-label, unless it looks like the generic results label.
    const label = getAriaLabel(panel);
    if (label && !/^(results|résultats|resultados|نتائج)/i.test(label)) return label;
    return null;
  }

  /**
   * @param {Element} panel
   * @returns {string|null}
   */
  function extractCategory(panel) {
    const el = queryFirst(SELECTORS.category, panel);
    if (!el) return null;
    const text = getCleanText(el);
    // Guard against grabbing ratings / long strings.
    if (!text || text.length > 60) return null;
    if (/^\d+([.,]\d+)?$/.test(text)) return null;
    return text;
  }

  /**
   * @param {Element} panel
   * @returns {{ rating: number|null, reviewCount: number|null }}
   */
  function extractRatingAndReviews(panel) {
    let rating = null;
    let reviewCount = null;

    // Rating via an aria-label that mentions stars/étoiles/نجوم.
    const ratingAriaEl = queryAll(SELECTORS.ratingAria, panel).find((el) => {
      const al = getAriaLabel(el);
      return /(\d+[.,]?\d*)\s*(star|étoile|estrella|نجم|نجوم)/i.test(al);
    });
    if (ratingAriaEl) rating = parseRating(getAriaLabel(ratingAriaEl));

    // Cluster text like "4.6(1,234)" or "4.6 · 1,234 reviews".
    const cluster = queryFirst(SELECTORS.ratingCluster, panel);
    if (cluster) {
      const clusterText = getCleanText(cluster);
      if (rating === null) {
        const firstSpan = cluster.querySelector('span[aria-hidden="true"]');
        rating = parseRating(firstSpan ? getCleanText(firstSpan) : clusterText);
      }
      const paren = clusterText.match(/\(([\d.,  \s]+)\)/);
      if (paren) reviewCount = parseReviewCount(paren[1]);
      if (reviewCount === null) {
        const near = clusterText.match(/([\d.,  \s]+)\s*(reviews?|avis|reseñas?|مراجع|تقييم)/i);
        if (near) reviewCount = parseReviewCount(near[1]);
      }
    }

    // Reviews via a dedicated button/span aria-label.
    if (reviewCount === null) {
      const rEl = queryFirst(SELECTORS.reviewsButton, panel);
      if (rEl) {
        const al = getAriaLabel(rEl) || getCleanText(rEl);
        const m = al.match(/([\d.,  \s]+)\s*(reviews?|avis|reseñas?|مراجع|تقييم)/i);
        reviewCount = m ? parseReviewCount(m[1]) : parseReviewCount(al);
      }
    }

    return { rating, reviewCount };
  }

  /**
   * @param {Element} panel
   * @returns {string|null}
   */
  function extractPhone(panel) {
    const el = queryFirst(SELECTORS.phone, panel);
    if (el) {
      const itemId = el.getAttribute('data-item-id') || '';
      const m = itemId.match(/tel:(.+)$/);
      if (m && m[1]) return normalizePhone(decodeURIComponent(m[1]));
      const href = el.getAttribute('href') || '';
      if (href.indexOf('tel:') === 0) return normalizePhone(decodeURIComponent(href.slice(4)));
      const al = getAriaLabel(el);
      if (al) return normalizePhone(al);
    }
    // Fallback: an element whose aria-label/tooltip reads like a phone label.
    const labeled = queryAll(['button[aria-label]', '[data-tooltip]'], panel).find((node) => {
      const hay = (getAriaLabel(node) + ' ' + (node.getAttribute('data-tooltip') || '')).toLowerCase();
      return /(phone|téléphone|telephone|copy phone|الهاتف|هاتف)/.test(hay) && /\d{4,}/.test(hay);
    });
    if (labeled) return normalizePhone(getAriaLabel(labeled));
    return null;
  }

  /**
   * Returns the raw website href behind the listing's website label, or null.
   * @param {Element} panel
   * @returns {string|null}
   */
  function extractWebsite(panel) {
    const el = queryFirst(SELECTORS.website, panel);
    if (el && el.getAttribute('href')) {
      const href = el.getAttribute('href');
      if (href && href.indexOf('#') !== 0) return href;
    }
    return null;
  }

  /**
   * @param {Element} panel
   * @returns {string|null}
   */
  function extractAddress(panel) {
    const el = queryFirst(SELECTORS.address, panel);
    if (el) {
      const al = getAriaLabel(el);
      if (al) return stripLeadingLabel(al);
      const text = getCleanText(el);
      if (text) return stripLeadingLabel(text);
    }
    const labeled = queryAll(['button[aria-label]'], panel).find((node) =>
      /^(address|adresse|dirección|indirizzo|العنوان)/i.test(getAriaLabel(node)),
    );
    if (labeled) return stripLeadingLabel(getAriaLabel(labeled));
    return null;
  }

  /** @returns {string} the canonical Maps URL of the current view. */
  function extractMapsUrl() {
    return location.href;
  }

  /**
   * Best-effort stable Google Maps identifier from the URL. Returns null when
   * none can be safely extracted (no fabricated IDs).
   * @returns {string|null}
   */
  function extractPlaceId() {
    const url = location.href;
    let m = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
    if (m) return m[1];
    m = url.match(/[?&]cid=(\d+)/);
    if (m) return 'cid:' + m[1];
    m = url.match(/\b(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)\b/);
    if (m) return m[1];
    return null;
  }

  /** @returns {string|null} the Maps UI language (e.g. "fr"), if detectable. */
  function extractPageLanguage() {
    const lang = (document.documentElement.getAttribute('lang') || '').trim();
    if (lang) return lang;
    const m = location.href.match(/[?&]hl=([a-zA-Z-]+)/);
    return m ? m[1] : null;
  }

  /** @returns {boolean} whether the URL looks like an individual place. */
  function urlLooksLikePlace() {
    return /\/maps\/place\//.test(location.pathname) || /\/maps\/place\//.test(location.href);
  }

  /* =================================================================== */
  /* Payload assembly                                                     */
  /* =================================================================== */

  /**
   * Build the normalized response payload for the current view.
   * @returns {object}
   */
  function buildPayload() {
    const panel = getPanel();
    const name = extractBusinessName(panel);
    const infoLoaded = !!queryFirst(SELECTORS.infoSection, panel);
    const isListing = (urlLooksLikePlace() || infoLoaded) && !!name;

    if (!isListing) {
      return {
        success: true,
        isBusinessListing: false,
        message: 'Open an individual business listing in Google Maps, then try again.',
        pageLanguage: extractPageLanguage(),
        lead: null,
      };
    }

    const warnings = [];
    const rawWebsite = extractWebsite(panel);
    const websiteInfo = classifyWebsite(rawWebsite);

    let hasWebsite;
    let websiteType = websiteInfo.type;
    let socialPlatform = websiteInfo.platform;

    if (websiteInfo.type === 'real') {
      hasWebsite = true;
    } else if (rawWebsite && websiteInfo.type === 'social') {
      hasWebsite = false; // a social link is not a real website
      warnings.push('The website label points to ' + (socialPlatform || 'a social media page') + ', not a standalone website.');
    } else if (infoLoaded) {
      // Info section is present and exposes no website link.
      hasWebsite = false;
      websiteType = 'none';
      warnings.push('No website link was detected for this listing.');
    } else {
      // Panel not fully loaded; do not claim there is no website.
      hasWebsite = null;
      websiteType = 'unknown';
      warnings.push('The website could not be confirmed (the listing may still be loading).');
    }

    const phone = extractPhone(panel);
    if (!phone) warnings.push('Could not find a phone number.');

    const category = extractCategory(panel);
    if (!category) warnings.push('Could not determine the business category.');

    const address = extractAddress(panel);
    if (!address) warnings.push('Could not find a street address.');

    const rr = extractRatingAndReviews(panel);

    const lead = {
      placeId: extractPlaceId(),
      name: name,
      category: category,
      phone: phone,
      website: websiteInfo.url,
      hasWebsite: hasWebsite,
      websiteType: websiteType,
      socialPlatform: socialPlatform,
      rating: rr.rating,
      reviewCount: rr.reviewCount,
      address: address,
      mapsUrl: extractMapsUrl(),
      source: 'google_maps',
      extractedAt: new Date().toISOString(),
      extractionWarnings: warnings,
    };

    log('extracted lead', lead);

    return {
      success: true,
      isBusinessListing: true,
      pageLanguage: extractPageLanguage(),
      lead: lead,
    };
  }

  /* =================================================================== */
  /* Messaging                                                            */
  /* =================================================================== */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = message && message.type;

    if (type === 'MAPREACH_PING') {
      sendResponse({ type: 'MAPREACH_PONG', ok: true, url: location.href });
      return false;
    }

    if (type === 'MAPREACH_GET_CURRENT_LEAD') {
      try {
        sendResponse(buildPayload());
      } catch (err) {
        log('extraction failed', err);
        sendResponse({
          success: false,
          isBusinessListing: false,
          error: 'Could not read this listing. Google Maps may have changed, or the listing does not expose this data.',
          lead: null,
        });
      }
      return false;
    }

    return false;
  });

  log('content script ready on', location.href);
})();
