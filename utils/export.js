const BOM = "\uFEFF";

/**
 * @param {string | number | boolean | null | undefined} value
 */
function escapeFormula(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(str) ? `'${str}` : str;
}

/**
 * @param {string | number | boolean | null | undefined} value
 */
function escapeCsvValue(value) {
  const safe = escapeFormula(value);
  const needsQuotes = /[",\n\r]/.test(safe);
  if (!needsQuotes) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * @param {Array<Record<string, any>>} leads
 */
export function leadsToCsv(leads) {
  const headers = [
    "ID",
    "Business Name",
    "Category",
    "Address",
    "Phone",
    "Website",
    "Has Website",
    "Rating",
    "Review Count",
    "Status",
    "Notes",
    "Maps URL",
    "Saved At",
    "Updated At",
    "First Contacted At",
    "Last Contacted At",
  ];

  const rows = leads.map((lead) => [
    lead.id,
    lead.name,
    lead.category,
    lead.address,
    lead.phone,
    lead.website,
    lead.hasWebsite,
    lead.rating,
    lead.reviewCount,
    lead.status,
    lead.notes,
    lead.mapsUrl,
    lead.savedAt,
    lead.updatedAt,
    lead.firstContactedAt,
    lead.lastContactedAt,
  ]);

  const csvLines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(","));
  return BOM + csvLines.join("\r\n");
}

/**
 * @param {string} csvContent
 * @param {string} [prefix]
 */
export function downloadCsv(csvContent, prefix = "mapreach-leads") {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const fileName = `${prefix}-${date}.csv`;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
