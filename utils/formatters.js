/**
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function formatDomain(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

/**
 * @param {number | null | undefined} value
 * @param {number} [decimals]
 * @returns {string}
 */
export function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function safeText(text) {
  if (!text) return "";
  return String(text).replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

/**
 * @param {string | null | undefined} phone
 * @returns {string}
 */
export function formatPhoneDisplay(phone) {
  if (!phone) return "Not found";
  return safeText(phone);
}
