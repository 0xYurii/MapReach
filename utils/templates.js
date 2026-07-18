import { validateTemplate } from "./validation.js";

const VARIABLE_PATTERN = /\$\{(name|category|address|city|website|rating|reviewCount)\}/g;

/**
 * @returns {Array<Record<string, any>>}
 */
export function getDefaultTemplates() {
  const now = new Date().toISOString();
  return [
    {
      id: "tpl-default",
      name: "General / Default",
      categoryKeywords: ["business", "service", "store"],
      body: "Hello ${name}, I came across your business on Google Maps. I noticed you may have an opportunity to improve your online presence. I build modern websites that help local businesses look more professional and get more customer inquiries. Would you be open to a quick chat?",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tpl-no-website",
      name: "No website",
      categoryKeywords: ["no website", "without website"],
      body: "Hello ${name}, I found your business on Google Maps and noticed that you may not have a website listed. I build simple, modern websites for local businesses that make it easier for customers to find services, contact you, and build trust. Would you be interested in seeing a quick idea for your business?",
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tpl-restaurant",
      name: "Restaurant",
      categoryKeywords: ["restaurant", "cafe", "food", "coffee"],
      body: "Hello ${name}, I came across your restaurant on Google Maps. A clear mobile-friendly website can make it easier for customers to view your menu, location, hours, and contact details. I build modern websites for local businesses. Would you be open to a quick chat?",
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tpl-dentist",
      name: "Dentist",
      categoryKeywords: ["dentist", "dental", "clinic", "orthodontist"],
      body: "Hello ${name}, I found your clinic on Google Maps. A professional website can help new patients quickly understand your services, location, hours, and how to book an appointment. I build clean websites for local businesses. Would you be open to a quick chat?",
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "tpl-salon",
      name: "Salon",
      categoryKeywords: ["salon", "barber", "beauty", "spa"],
      body: "Hello ${name}, I came across your salon on Google Maps. A simple website can showcase your services, prices, gallery, location, and contact information so customers can reach you more easily. Would you be open to a quick chat?",
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/**
 * @param {Array<Record<string, any>>} templates
 */
export function normalizeTemplates(templates) {
  if (!Array.isArray(templates)) return [];
  return templates
    .map((template) => validateTemplate(template))
    .filter((result) => result.valid)
    .map((result) => result.template);
}

/**
 * @param {Record<string, any>} lead
 */
function getTemplateVars(lead) {
  const address = lead.address || "";
  const city = address.includes(",") ? address.split(",").map((v) => v.trim()).filter(Boolean).at(-2) || "" : "";
  return {
    name: lead.name || "",
    category: lead.category || "",
    address,
    city,
    website: lead.website || "",
    rating: lead.rating ?? "",
    reviewCount: lead.reviewCount ?? "",
  };
}

/**
 * @param {string} text
 */
function compactText(text) {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+\./g, ".")
    .trim();
}

/**
 * @param {Record<string, any>} template
 * @param {Record<string, any>} lead
 */
export function renderTemplate(template, lead) {
  const vars = getTemplateVars(lead);
  const body = String(template?.body || "");
  const rendered = body.replace(VARIABLE_PATTERN, (_, key) => String(vars[key] ?? ""));
  return compactText(rendered);
}

/**
 * @param {Array<Record<string, any>>} templates
 * @param {Record<string, any>} lead
 */
export function findBestTemplate(templates, lead) {
  const safeTemplates = normalizeTemplates(templates);
  if (!safeTemplates.length) {
    return null;
  }

  const category = String(lead?.category || "").toLowerCase();
  const hasNoWebsite = lead?.hasWebsite === false;

  if (hasNoWebsite) {
    const noWebsite = safeTemplates.find((template) => template.id === "tpl-no-website");
    if (noWebsite) return noWebsite;
  }

  let best = null;
  let bestScore = -1;

  for (const template of safeTemplates) {
    const keywords = Array.isArray(template.categoryKeywords) ? template.categoryKeywords : [];
    let score = 0;
    for (const keyword of keywords) {
      const normalized = String(keyword || "").toLowerCase().trim();
      if (normalized && category.includes(normalized)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = template;
    }
  }

  if (best && bestScore > 0) return best;

  return safeTemplates.find((template) => template.isDefault) || safeTemplates[0];
}
