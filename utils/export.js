/**
 * MapReach — CSV export.
 *
 * Produces an RFC 4180-style CSV with a UTF-8 BOM (so Excel renders Arabic and
 * accented characters correctly) and neutralizes spreadsheet formula injection.
 * Downloads happen entirely locally via a Blob URL + anchor — no network, and no
 * "downloads" permission required.
 */

import { formatRating, formatReviewCount } from './formatters.js';

/** CSV column order. Includes MapReach's website-type and language extras. */
const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Business Name' },
  { key: 'category', label: 'Category' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'websiteType', label: 'Website Type' },
  { key: 'socialPlatform', label: 'Social Platform' },
  { key: 'hasWebsite', label: 'Has Website' },
  { key: 'rating', label: 'Rating' },
  { key: 'reviewCount', label: 'Review Count' },
  { key: 'status', label: 'Status' },
  { key: 'selectedLanguage', label: 'Message Language' },
  { key: 'notes', label: 'Notes' },
  { key: 'mapsUrl', label: 'Maps URL' },
  { key: 'savedAt', label: 'Saved At' },
  { key: 'updatedAt', label: 'Updated At' },
  { key: 'firstContactedAt', label: 'First Contacted At' },
  { key: 'lastContactedAt', label: 'Last Contacted At' },
];

/**
 * Prevent spreadsheet formula injection: if a cell begins with a formula
 * trigger, prefix a single apostrophe so it is treated as text.
 * @param {string} value
 * @returns {string}
 */
function sanitizeForFormula(value) {
  if (typeof value !== 'string' || value === '') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Escape a single CSV field per RFC 4180: wrap in quotes when it contains a
 * comma, quote, or newline, and double any embedded quotes.
 * @param {unknown} raw
 * @returns {string}
 */
export function csvEscape(raw) {
  let value = raw === null || raw === undefined ? '' : String(raw);
  value = sanitizeForFormula(value);
  if (/[",\n\r]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert a hasWebsite tri-state into a readable cell.
 * @param {boolean|null} value
 * @returns {string}
 */
function hasWebsiteCell(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

/**
 * Map a lead to its CSV cell values (before escaping).
 * @param {object} lead
 * @returns {string[]}
 */
function leadToRow(lead) {
  const l = lead || {};
  return COLUMNS.map(({ key }) => {
    switch (key) {
      case 'hasWebsite':
        return hasWebsiteCell(l.hasWebsite);
      case 'rating':
        return formatRating(l.rating);
      case 'reviewCount':
        return l.reviewCount === null || l.reviewCount === undefined ? '' : String(l.reviewCount);
      default: {
        const v = l[key];
        return v === null || v === undefined ? '' : String(v);
      }
    }
  });
}

/**
 * Build the full CSV string (including BOM) for a set of leads.
 * @param {object[]} leads
 * @returns {string}
 */
export function buildLeadsCsv(leads) {
  const rows = Array.isArray(leads) ? leads : [];
  const lines = [];
  lines.push(COLUMNS.map((c) => csvEscape(c.label)).join(','));
  for (const lead of rows) {
    lines.push(leadToRow(lead).map(csvEscape).join(','));
  }
  // ﻿ = UTF-8 BOM; CRLF line endings for maximum spreadsheet compatibility.
  return `﻿${lines.join('\r\n')}`;
}

/**
 * File name of the form mapreach-leads-YYYY-MM-DD.csv.
 * @param {Date} [date]
 * @returns {string}
 */
export function csvFileName(date = new Date()) {
  const iso = Number.isNaN(date.getTime()) ? new Date() : date;
  return `mapreach-leads-${iso.toISOString().slice(0, 10)}.csv`;
}

/**
 * Trigger a local download of text content via a Blob URL and a synthetic anchor.
 * @param {string} filename
 * @param {string} content
 * @param {string} [mime]
 */
export function downloadTextFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Build and download a leads CSV.
 * @param {object[]} leads
 * @returns {{ count: number, filename: string }}
 */
export function exportLeadsCsv(leads) {
  const rows = Array.isArray(leads) ? leads : [];
  const csv = buildLeadsCsv(rows);
  const filename = csvFileName();
  downloadTextFile(filename, csv);
  return { count: rows.length, filename };
}
