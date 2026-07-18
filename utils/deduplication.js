import { formatDomain, safeText } from "./formatters.js";

/**
 * @param {string | null | undefined} text
 * @returns {string}
 */
export function normalizeText(text) {
  return safeText(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string | null | undefined} phone
 */
export function normalizePhoneForMatch(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d+]/g, "");
}

/**
 * @param {string | null | undefined} website
 */
export function normalizeWebsiteDomain(website) {
  return normalizeText(formatDomain(website));
}

/**
 * @param {Record<string, any>} lead
 */
export function getLeadFingerprint(lead) {
  const parts = [
    normalizeText(lead.name),
    normalizeText(lead.address),
    normalizePhoneForMatch(lead.phone),
  ];
  return parts.join("|");
}

/**
 * @param {Record<string, any>} candidateLead
 * @param {Array<Record<string, any>>} existingLeads
 * @returns {{ lead: Record<string, any> | null; reason: string | null }}
 */
export function findDuplicateLead(candidateLead, existingLeads) {
  if (!Array.isArray(existingLeads) || !existingLeads.length) {
    return { lead: null, reason: null };
  }

  if (candidateLead.placeId) {
    const byPlaceId = existingLeads.find((lead) => lead.placeId && lead.placeId === candidateLead.placeId);
    if (byPlaceId) return { lead: byPlaceId, reason: "Matched by place ID" };
  }

  const candidatePhone = normalizePhoneForMatch(candidateLead.phone);
  if (candidatePhone) {
    const byPhone = existingLeads.find(
      (lead) => normalizePhoneForMatch(lead.phone) && normalizePhoneForMatch(lead.phone) === candidatePhone,
    );
    if (byPhone) return { lead: byPhone, reason: "Matched by phone number" };
  }

  const candidateDomain = normalizeWebsiteDomain(candidateLead.website);
  const candidateName = normalizeText(candidateLead.name);
  if (candidateDomain && candidateName) {
    const byDomainAndName = existingLeads.find(
      (lead) =>
        normalizeWebsiteDomain(lead.website) === candidateDomain && normalizeText(lead.name) === candidateName,
    );
    if (byDomainAndName) return { lead: byDomainAndName, reason: "Matched by website domain + business name" };
  }

  const candidateAddress = normalizeText(candidateLead.address);
  if (candidateName && candidateAddress) {
    const byNameAndAddress = existingLeads.find(
      (lead) => normalizeText(lead.name) === candidateName && normalizeText(lead.address) === candidateAddress,
    );
    if (byNameAndAddress) return { lead: byNameAndAddress, reason: "Matched by business name + address" };
  }

  const candidateFingerprint = getLeadFingerprint(candidateLead);
  if (candidateFingerprint) {
    const byFingerprint = existingLeads.find((lead) => getLeadFingerprint(lead) === candidateFingerprint);
    if (byFingerprint) return { lead: byFingerprint, reason: "Matched by deterministic fingerprint" };
  }

  return { lead: null, reason: null };
}

/**
 * @param {Record<string, any>} existingLead
 * @param {Record<string, any>} incomingLead
 */
export function mergeLeadData(existingLead, incomingLead) {
  const merged = { ...existingLead };
  const extractionFields = [
    "name",
    "category",
    "phone",
    "website",
    "rating",
    "reviewCount",
    "address",
    "mapsUrl",
    "extractedAt",
    "hasWebsite",
    "placeId",
  ];

  for (const field of extractionFields) {
    const incomingValue = incomingLead[field];
    const existingValue = existingLead[field];
    const incomingHasValue = incomingValue !== null && incomingValue !== undefined && incomingValue !== "";

    if (incomingHasValue) {
      merged[field] = incomingValue;
      continue;
    }

    if (existingValue !== undefined) {
      merged[field] = existingValue;
    }
  }

  merged.updatedAt = new Date().toISOString();
  return merged;
}
