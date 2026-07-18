import {
  MESSAGE_TYPES,
  STATUS_LABELS,
  LEAD_STATUSES,
  SOURCE,
} from "../utils/constants.js";
import {
  seedDefaultsIfNeeded,
  getLeads,
  saveLead,
  updateLead,
  getTemplates,
  getSettings,
} from "../utils/storage.js";
import { findDuplicateLead, mergeLeadData, normalizeText } from "../utils/deduplication.js";
import { findBestTemplate, renderTemplate } from "../utils/templates.js";
import { formatDate, formatDomain, formatNumber } from "../utils/formatters.js";

const state = {
  activeTab: null,
  extracted: null,
  existingDuplicate: null,
  duplicateReason: null,
  templates: [],
  selectedTemplateId: null,
  settings: null,
};

const els = {
  statusArea: document.getElementById("statusArea"),
  loadingState: document.getElementById("loadingState"),
  nonMapsState: document.getElementById("nonMapsState"),
  noListingState: document.getElementById("noListingState"),
  errorState: document.getElementById("errorState"),
  successState: document.getElementById("successState"),
  retryNoListingBtn: document.getElementById("retryNoListingBtn"),
  retryErrorBtn: document.getElementById("retryErrorBtn"),
  openTrackerFromErrorBtn: document.getElementById("openTrackerFromErrorBtn"),
  openTrackerBtn: document.getElementById("openTrackerBtn"),
  openSettingsBtn: document.getElementById("openSettingsBtn"),
  leadName: document.getElementById("leadName"),
  leadCategory: document.getElementById("leadCategory"),
  leadAddress: document.getElementById("leadAddress"),
  leadRating: document.getElementById("leadRating"),
  leadPhone: document.getElementById("leadPhone"),
  copyPhoneBtn: document.getElementById("copyPhoneBtn"),
  leadWebsite: document.getElementById("leadWebsite"),
  openWebsiteLink: document.getElementById("openWebsiteLink"),
  noWebsiteBadge: document.getElementById("noWebsiteBadge"),
  unknownWebsiteBadge: document.getElementById("unknownWebsiteBadge"),
  warningBox: document.getElementById("warningBox"),
  warningList: document.getElementById("warningList"),
  duplicateInfo: document.getElementById("duplicateInfo"),
  saveLeadBtn: document.getElementById("saveLeadBtn"),
  markSentBtn: document.getElementById("markSentBtn"),
  templateSelect: document.getElementById("templateSelect"),
  messageTextarea: document.getElementById("messageTextarea"),
  generateMessageBtn: document.getElementById("generateMessageBtn"),
  copyMessageBtn: document.getElementById("copyMessageBtn"),
  copyFeedback: document.getElementById("copyFeedback"),
};

function showStatus(message, isError = false) {
  els.statusArea.textContent = message || "";
  els.statusArea.style.color = isError ? "#b91c1c" : "#475569";
}

function hideAllStates() {
  for (const node of [
    els.loadingState,
    els.nonMapsState,
    els.noListingState,
    els.errorState,
    els.successState,
  ]) {
    node.classList.add("hidden");
  }
}

function setState(name) {
  hideAllStates();
  if (name === "loading") els.loadingState.classList.remove("hidden");
  if (name === "nonMaps") els.nonMapsState.classList.remove("hidden");
  if (name === "noListing") els.noListingState.classList.remove("hidden");
  if (name === "error") els.errorState.classList.remove("hidden");
  if (name === "success") els.successState.classList.remove("hidden");
}

function toIsoNow() {
  return new Date().toISOString();
}

function buildFallbackId(lead) {
  const parts = [normalizeText(lead.name), normalizeText(lead.address), normalizeText(lead.phone)].filter(Boolean);
  if (parts.length >= 2) {
    return `lead:${parts.join("|")}`;
  }
  return crypto.randomUUID();
}

function buildLeadId(lead) {
  if (lead.placeId) return `gmaps:${lead.placeId}`;
  return buildFallbackId(lead);
}

function populateTemplates(lead) {
  els.templateSelect.innerHTML = "";
  for (const template of state.templates) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    els.templateSelect.appendChild(option);
  }

  const best = findBestTemplate(state.templates, lead);
  const preferred = state.existingDuplicate?.selectedTemplateId || best?.id || state.templates[0]?.id || null;

  if (preferred) {
    state.selectedTemplateId = preferred;
    els.templateSelect.value = preferred;
  }

  generateMessage();
}

function getSelectedTemplate() {
  return state.templates.find((template) => template.id === state.selectedTemplateId) || null;
}

function generateMessage() {
  const template = getSelectedTemplate();
  if (!template || !state.extracted?.lead) {
    els.messageTextarea.value = "";
    return;
  }
  els.messageTextarea.value = renderTemplate(template, state.extracted.lead);
}

function renderWarnings(warnings) {
  if (!warnings || !warnings.length || state.settings?.showExtractionWarnings === false) {
    els.warningBox.classList.add("hidden");
    els.warningList.innerHTML = "";
    return;
  }

  els.warningList.innerHTML = "";
  warnings.forEach((warning) => {
    const li = document.createElement("li");
    li.textContent = warning;
    els.warningList.appendChild(li);
  });
  els.warningBox.classList.remove("hidden");
}

function renderWebsiteState(lead) {
  els.noWebsiteBadge.classList.add("hidden");
  els.unknownWebsiteBadge.classList.add("hidden");
  els.openWebsiteLink.classList.add("hidden");

  if (lead.website) {
    els.leadWebsite.textContent = formatDomain(lead.website) || lead.website;
    els.openWebsiteLink.href = lead.website;
    els.openWebsiteLink.classList.remove("hidden");
    return;
  }

  els.leadWebsite.textContent = "Not found";
  if (lead.hasWebsite === false) {
    els.noWebsiteBadge.classList.remove("hidden");
  } else {
    els.unknownWebsiteBadge.classList.remove("hidden");
  }
}

function renderDuplicateInfo() {
  const dup = state.existingDuplicate;
  if (!dup) {
    els.duplicateInfo.classList.add("hidden");
    els.duplicateInfo.textContent = "";
    els.saveLeadBtn.textContent = "Save lead";
    return;
  }

  els.duplicateInfo.classList.remove("hidden");
  els.duplicateInfo.textContent = `Already saved (${state.duplicateReason || "possible duplicate"}). Current status: ${
    STATUS_LABELS[dup.status] || dup.status
  }. Saved ${formatDate(dup.savedAt)}.`;
  els.saveLeadBtn.textContent = "Update lead";
}

function renderSuccessLead() {
  const lead = state.extracted.lead;
  els.leadName.textContent = lead.name || "Unnamed business";
  els.leadCategory.textContent = lead.category || "Category not found";
  els.leadAddress.textContent = lead.address || "Not found";

  if (lead.rating !== null || lead.reviewCount !== null) {
    const rating = lead.rating !== null ? String(lead.rating) : "N/A";
    const reviews = lead.reviewCount !== null ? formatNumber(lead.reviewCount) : "N/A";
    els.leadRating.textContent = `${rating} (${reviews} reviews)`;
  } else {
    els.leadRating.textContent = "Not found";
  }

  els.leadPhone.textContent = lead.phone || "Not found";
  if (lead.phone) {
    els.copyPhoneBtn.classList.remove("hidden");
  } else {
    els.copyPhoneBtn.classList.add("hidden");
  }

  renderWebsiteState(lead);
  renderWarnings(Array.isArray(lead.extractionWarnings) ? lead.extractionWarnings : []);
  renderDuplicateInfo();
  populateTemplates(lead);
  setState("success");
}

function markNotOnMaps() {
  showStatus("MapReach works on Google Maps business listings.");
  setState("nonMaps");
}

async function openViaWorker(type) {
  return chrome.runtime.sendMessage({ type });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function requestCurrentLead(tabId) {
  return chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.getCurrentLead });
}

async function refreshExtraction() {
  try {
    setState("loading");
    showStatus("");

    state.activeTab = await getActiveTab();
    if (!state.activeTab?.id || !state.activeTab.url) {
      markNotOnMaps();
      return;
    }

    const onMaps = /^https:\/\/www\.google\.com\/maps\//i.test(state.activeTab.url);
    if (!onMaps) {
      markNotOnMaps();
      return;
    }

    const response = await requestCurrentLead(state.activeTab.id);
    if (!response || response.success === false) {
      setState("error");
      showStatus(response?.error || "Couldn’t read this listing.", true);
      return;
    }

    state.extracted = response;

    if (!response.isBusinessListing) {
      setState("noListing");
      showStatus(response.error || "No business selected.");
      return;
    }

    const leads = await getLeads();
    const dedupe = findDuplicateLead(response.lead, leads);
    state.existingDuplicate = dedupe.lead;
    state.duplicateReason = dedupe.reason;
    renderSuccessLead();
  } catch (error) {
    setState("error");
    showStatus(
      "Couldn’t read this listing. Google Maps may have changed, or the page is still loading.",
      true,
    );
    if (state.settings?.debugMode) {
      console.error("MapReach popup error", error);
    }
  }
}

function buildLeadForStorage() {
  const extracted = state.extracted?.lead;
  if (!extracted) return null;
  if (!extracted.name) {
    throw new Error("Business name is required before saving. Open a full listing and try again.");
  }

  const now = toIsoNow();
  const existing = state.existingDuplicate;

  return {
    id: existing?.id || buildLeadId(extracted),
    placeId: extracted.placeId ?? null,
    name: extracted.name,
    category: extracted.category ?? null,
    phone: extracted.phone ?? null,
    website: extracted.website ?? null,
    hasWebsite: extracted.hasWebsite ?? null,
    rating: extracted.rating ?? null,
    reviewCount: extracted.reviewCount ?? null,
    address: extracted.address ?? null,
    mapsUrl: extracted.mapsUrl ?? state.activeTab?.url ?? null,
    status: existing?.status || "unsent",
    notes: existing?.notes || "",
    selectedTemplateId: existing?.selectedTemplateId || state.selectedTemplateId || null,
    firstContactedAt: existing?.firstContactedAt || null,
    lastContactedAt: existing?.lastContactedAt || null,
    source: SOURCE,
    savedAt: existing?.savedAt || now,
    updatedAt: now,
    extractedAt: extracted.extractedAt || now,
  };
}

async function handleSaveOrUpdate() {
  try {
    const prepared = buildLeadForStorage();
    if (!prepared) return;

    if (!state.existingDuplicate) {
      await saveLead(prepared);
      showStatus("Lead saved.");
    } else {
      const merged = mergeLeadData(state.existingDuplicate, prepared);
      merged.selectedTemplateId = state.existingDuplicate.selectedTemplateId || state.selectedTemplateId || null;
      await updateLead(state.existingDuplicate.id, merged);
      showStatus("Lead updated.");
    }

    if (state.settings?.openTrackerAfterSave) {
      await openViaWorker(MESSAGE_TYPES.openTracker);
    }
    await refreshExtraction();
  } catch (error) {
    showStatus(error.message || "Could not save this lead.", true);
  }
}

async function handleMarkSent() {
  try {
    if (!state.existingDuplicate) {
      showStatus("Save the lead first, then mark it as sent.", true);
      return;
    }

    const now = toIsoNow();
    const first = state.existingDuplicate.firstContactedAt || now;
    await updateLead(state.existingDuplicate.id, {
      status: "sent",
      firstContactedAt: first,
      lastContactedAt: now,
    });

    showStatus("Lead marked as sent.");
    await refreshExtraction();
  } catch (error) {
    showStatus(error.message || "Could not mark lead as sent.", true);
  }
}

async function copyTextToClipboard(text) {
  if (!text?.trim()) {
    showStatus("Nothing to copy yet.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    els.copyFeedback.classList.remove("hidden");
    setTimeout(() => els.copyFeedback.classList.add("hidden"), 1200);
  } catch {
    showStatus("Could not copy to clipboard. Check browser permissions.", true);
  }
}

function bindEvents() {
  els.retryNoListingBtn.addEventListener("click", refreshExtraction);
  els.retryErrorBtn.addEventListener("click", refreshExtraction);
  els.openTrackerFromErrorBtn.addEventListener("click", () => openViaWorker(MESSAGE_TYPES.openTracker));
  els.openTrackerBtn.addEventListener("click", () => openViaWorker(MESSAGE_TYPES.openTracker));
  els.openSettingsBtn.addEventListener("click", () => openViaWorker(MESSAGE_TYPES.openSettings));

  els.templateSelect.addEventListener("change", () => {
    state.selectedTemplateId = els.templateSelect.value;
    generateMessage();
  });

  els.generateMessageBtn.addEventListener("click", generateMessage);
  els.copyMessageBtn.addEventListener("click", () => copyTextToClipboard(els.messageTextarea.value));
  els.copyPhoneBtn.addEventListener("click", () => copyTextToClipboard(els.leadPhone.textContent || ""));
  els.saveLeadBtn.addEventListener("click", handleSaveOrUpdate);
  els.markSentBtn.addEventListener("click", handleMarkSent);
}

async function init() {
  bindEvents();
  setState("loading");
  showStatus("");

  await seedDefaultsIfNeeded();
  const [templates, settings] = await Promise.all([getTemplates(), getSettings()]);
  state.templates = templates;
  state.settings = settings;

  await refreshExtraction();
}

init().catch((error) => {
  setState("error");
  showStatus("MapReach failed to initialize.", true);
  console.error(error);
});
