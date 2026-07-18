import { MESSAGE_TYPES, LEAD_STATUSES, STATUS_LABELS, STATUS_COLORS, SORT_OPTIONS } from "../utils/constants.js";
import {
  getLeads,
  updateLead,
  deleteLead,
  clearAllLeads,
  getTemplates,
  getSettings,
} from "../utils/storage.js";
import { leadsToCsv, downloadCsv } from "../utils/export.js";
import { renderTemplate, findBestTemplate } from "../utils/templates.js";
import { formatDate, formatDomain, formatNumber } from "../utils/formatters.js";

const state = {
  leads: [],
  filtered: [],
  templates: [],
  settings: null,
  activeNoteLeadId: null,
  noteDirty: false,
  filters: {
    search: "",
    status: "all",
    category: "all",
    website: "all",
    sort: "recently_updated",
  },
};

const els = {
  leadCount: document.getElementById("leadCount"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  categoryFilter: document.getElementById("categoryFilter"),
  websiteFilter: document.getElementById("websiteFilter"),
  sortSelect: document.getElementById("sortSelect"),
  activeFilters: document.getElementById("activeFilters"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  flash: document.getElementById("flash"),
  emptyState: document.getElementById("emptyState"),
  tableWrap: document.getElementById("tableWrap"),
  cardsWrap: document.getElementById("cardsWrap"),
  tableBody: document.getElementById("leadsTableBody"),
  exportAllBtn: document.getElementById("exportAllBtn"),
  exportFilteredBtn: document.getElementById("exportFilteredBtn"),
  openSettingsBtn: document.getElementById("openSettingsBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  notesDialog: document.getElementById("notesDialog"),
  notesForm: document.getElementById("notesForm"),
  notesLeadName: document.getElementById("notesLeadName"),
  notesTextarea: document.getElementById("notesTextarea"),
  cancelNotesBtn: document.getElementById("cancelNotesBtn"),
  clearDialog: document.getElementById("clearDialog"),
  clearForm: document.getElementById("clearForm"),
  clearConfirmInput: document.getElementById("clearConfirmInput"),
  cancelClearBtn: document.getElementById("cancelClearBtn"),
};

function setFlash(message, isError = false) {
  els.flash.textContent = message || "";
  els.flash.style.color = isError ? "#b91c1c" : "#475569";
}

function populateStatusFilter() {
  LEAD_STATUSES.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = STATUS_LABELS[status] || status;
    els.statusFilter.appendChild(option);
  });
}

function populateSortFilter() {
  SORT_OPTIONS.forEach((sort) => {
    const option = document.createElement("option");
    option.value = sort.value;
    option.textContent = sort.label;
    els.sortSelect.appendChild(option);
  });
}

function populateCategoryFilter() {
  const categories = new Set();
  state.leads.forEach((lead) => {
    if (lead.category) categories.add(lead.category);
  });

  els.categoryFilter.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All";
  els.categoryFilter.appendChild(all);

  Array.from(categories)
    .sort((a, b) => a.localeCompare(b))
    .forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      els.categoryFilter.appendChild(option);
    });
}

function getSearchBlob(lead) {
  return [lead.name, lead.category, lead.address, lead.phone, lead.website, lead.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function applySort(leads, sortKey) {
  const list = [...leads];
  if (sortKey === "recently_saved") {
    return list.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }
  if (sortKey === "oldest_saved") {
    return list.sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());
  }
  if (sortKey === "name_asc") {
    return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }
  if (sortKey === "rating_desc") {
    return list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }
  if (sortKey === "reviews_asc") {
    return list.sort((a, b) => (a.reviewCount ?? Number.MAX_SAFE_INTEGER) - (b.reviewCount ?? Number.MAX_SAFE_INTEGER));
  }

  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function applyFilters() {
  const search = state.filters.search.trim().toLowerCase();

  let filtered = state.leads.filter((lead) => {
    if (search && !getSearchBlob(lead).includes(search)) return false;
    if (state.filters.status !== "all" && lead.status !== state.filters.status) return false;
    if (state.filters.category !== "all" && lead.category !== state.filters.category) return false;

    if (state.filters.website === "no_website" && lead.hasWebsite !== false) return false;
    if (state.filters.website === "has_website" && !lead.website) return false;
    if (state.filters.website === "unknown" && lead.hasWebsite !== null) return false;

    return true;
  });

  filtered = applySort(filtered, state.filters.sort);
  state.filtered = filtered;
}

function setActiveFilterCount() {
  let count = 0;
  if (state.filters.search) count += 1;
  if (state.filters.status !== "all") count += 1;
  if (state.filters.category !== "all") count += 1;
  if (state.filters.website !== "all") count += 1;
  if (state.filters.sort !== "recently_updated") count += 1;
  els.activeFilters.textContent = `${count} active filter${count === 1 ? "" : "s"}`;
}

function statusChip(status) {
  const span = document.createElement("span");
  span.className = `status-chip ${STATUS_COLORS[status] || "status-unsent"}`;
  span.textContent = STATUS_LABELS[status] || status;
  return span;
}

function statusSelect(lead) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Status for ${lead.name}`);

  LEAD_STATUSES.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = STATUS_LABELS[status];
    option.selected = lead.status === status;
    select.appendChild(option);
  });

  select.addEventListener("change", async () => {
    const nextStatus = select.value;
    const patch = { status: nextStatus };

    if (nextStatus === "sent") {
      const now = new Date().toISOString();
      patch.firstContactedAt = lead.firstContactedAt || now;
      patch.lastContactedAt = now;
    }

    try {
      await updateLead(lead.id, patch);
      setFlash(`Updated status for ${lead.name}.`);
      await loadData();
    } catch (error) {
      setFlash(error.message || "Failed to update status.", true);
    }
  });

  return select;
}

function actionButton(label, onClick, variant = "btn-secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn ${variant}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function copyText(text, successMessage) {
  if (!text) {
    setFlash("Nothing to copy.", true);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setFlash(successMessage);
  } catch {
    setFlash("Clipboard copy failed.", true);
  }
}

function buildMessageForLead(lead) {
  const template =
    state.templates.find((tpl) => tpl.id === lead.selectedTemplateId) || findBestTemplate(state.templates, lead);
  if (!template) return "";
  return renderTemplate(template, lead);
}

function openNotesDialog(lead) {
  state.activeNoteLeadId = lead.id;
  state.noteDirty = false;
  els.notesLeadName.textContent = lead.name;
  els.notesTextarea.value = lead.notes || "";
  els.notesDialog.showModal();
  els.notesTextarea.focus();
}

async function deleteLeadWithConfirm(lead) {
  const confirmed = confirm(`Delete lead "${lead.name}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    await deleteLead(lead.id);
    setFlash(`Deleted ${lead.name}.`);
    await loadData();
  } catch (error) {
    setFlash(error.message || "Failed to delete lead.", true);
  }
}

function renderTable() {
  els.tableBody.innerHTML = "";

  state.filtered.forEach((lead) => {
    const tr = document.createElement("tr");

    const business = document.createElement("td");
    business.innerHTML = "";
    const name = document.createElement("div");
    name.className = "lead-name";
    name.textContent = lead.name;
    const address = document.createElement("div");
    address.className = "small";
    address.textContent = lead.address || "Address not found";
    business.append(name, address);

    const category = document.createElement("td");
    category.textContent = lead.category || "-";

    const contact = document.createElement("td");
    contact.innerHTML = "";
    const phone = document.createElement("div");
    phone.textContent = lead.phone || "No phone";
    const copyPhone = actionButton("Copy", () => copyText(lead.phone, `Copied phone for ${lead.name}.`));
    copyPhone.classList.add("small");
    copyPhone.disabled = !lead.phone;
    contact.append(phone, copyPhone);

    const website = document.createElement("td");
    if (lead.website) {
      const link = document.createElement("a");
      link.href = lead.website;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = formatDomain(lead.website) || lead.website;
      website.appendChild(link);
    } else if (lead.hasWebsite === false) {
      website.textContent = "No website";
    } else {
      website.textContent = "Unknown";
    }

    const rating = document.createElement("td");
    const ratingVal = lead.rating !== null ? String(lead.rating) : "-";
    const reviewsVal = lead.reviewCount !== null ? formatNumber(lead.reviewCount) : "-";
    rating.textContent = `${ratingVal} / ${reviewsVal}`;

    const status = document.createElement("td");
    status.append(statusChip(lead.status), statusSelect(lead));

    const saved = document.createElement("td");
    saved.textContent = formatDate(lead.savedAt);

    const actions = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "actions";

    wrap.append(
      actionButton("Open Maps", () => {
        if (!lead.mapsUrl) return;
        window.open(lead.mapsUrl, "_blank", "noreferrer");
      }),
      actionButton("Edit notes", () => openNotesDialog(lead)),
      actionButton(
        "Copy message",
        () => copyText(buildMessageForLead(lead), `Copied message for ${lead.name}.`),
      ),
      actionButton("Mark sent", async () => {
        const now = new Date().toISOString();
        await updateLead(lead.id, {
          status: "sent",
          firstContactedAt: lead.firstContactedAt || now,
          lastContactedAt: now,
        });
        await loadData();
      }),
      actionButton("Delete", () => deleteLeadWithConfirm(lead), "btn-danger"),
    );

    actions.appendChild(wrap);
    tr.append(business, category, contact, website, rating, status, saved, actions);
    els.tableBody.appendChild(tr);
  });
}

function renderCards() {
  els.cardsWrap.innerHTML = "";
  state.filtered.forEach((lead) => {
    const card = document.createElement("article");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "card-top";
    const name = document.createElement("h2");
    name.textContent = lead.name;
    name.style.margin = "0";
    name.style.fontSize = "18px";
    top.append(name, statusChip(lead.status));

    const grid = document.createElement("div");
    grid.className = "card-grid";
    grid.innerHTML = "";
    const fields = [
      ["Category", lead.category || "-"],
      ["Address", lead.address || "-"],
      ["Phone", lead.phone || "-"],
      ["Website", lead.website ? formatDomain(lead.website) || lead.website : lead.hasWebsite === false ? "No website" : "Unknown"],
      ["Rating", `${lead.rating ?? "-"} / ${lead.reviewCount ?? "-"}`],
      ["Saved", formatDate(lead.savedAt)],
    ];
    fields.forEach(([label, value]) => {
      const row = document.createElement("p");
      row.innerHTML = "";
      row.textContent = `${label}: ${value}`;
      row.className = "small";
      grid.appendChild(row);
    });

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      actionButton("Open Maps", () => lead.mapsUrl && window.open(lead.mapsUrl, "_blank", "noreferrer")),
      actionButton("Edit notes", () => openNotesDialog(lead)),
      actionButton("Copy msg", () => copyText(buildMessageForLead(lead), `Copied message for ${lead.name}.`)),
      actionButton("Delete", () => deleteLeadWithConfirm(lead), "btn-danger"),
    );

    card.append(top, grid, statusSelect(lead), actions);
    els.cardsWrap.appendChild(card);
  });
}

function render() {
  const count = state.filtered.length;
  els.leadCount.textContent = `${count} lead${count === 1 ? "" : "s"}`;
  setActiveFilterCount();

  if (count === 0) {
    els.emptyState.classList.remove("hidden");
    els.tableWrap.classList.add("hidden");
    els.cardsWrap.classList.add("hidden");
    return;
  }

  els.emptyState.classList.add("hidden");
  els.tableWrap.classList.remove("hidden");
  els.cardsWrap.classList.remove("hidden");
  renderTable();
  renderCards();
}

async function loadData() {
  const [leads, templates, settings] = await Promise.all([getLeads(), getTemplates(), getSettings()]);
  state.leads = leads;
  state.templates = templates;
  state.settings = settings;

  if (!state.filters.sort) {
    state.filters.sort = settings.defaultSort || "recently_updated";
  }

  populateCategoryFilter();
  els.sortSelect.value = state.filters.sort;
  applyFilters();
  render();
}

function bindFilterEvents() {
  els.searchInput.addEventListener("input", () => {
    state.filters.search = els.searchInput.value;
    applyFilters();
    render();
  });

  els.statusFilter.addEventListener("change", () => {
    state.filters.status = els.statusFilter.value;
    applyFilters();
    render();
  });

  els.categoryFilter.addEventListener("change", () => {
    state.filters.category = els.categoryFilter.value;
    applyFilters();
    render();
  });

  els.websiteFilter.addEventListener("change", () => {
    state.filters.website = els.websiteFilter.value;
    applyFilters();
    render();
  });

  els.sortSelect.addEventListener("change", () => {
    state.filters.sort = els.sortSelect.value;
    applyFilters();
    render();
  });

  els.clearFiltersBtn.addEventListener("click", () => {
    state.filters = {
      search: "",
      status: "all",
      category: "all",
      website: "all",
      sort: state.settings?.defaultSort || "recently_updated",
    };
    els.searchInput.value = "";
    els.statusFilter.value = "all";
    els.categoryFilter.value = "all";
    els.websiteFilter.value = "all";
    els.sortSelect.value = state.filters.sort;
    applyFilters();
    render();
  });
}

function bindTopActions() {
  els.exportAllBtn.addEventListener("click", () => {
    try {
      const csv = leadsToCsv(state.leads);
      downloadCsv(csv);
      setFlash(`Exported ${state.leads.length} lead(s).`);
    } catch {
      setFlash("CSV export failed.", true);
    }
  });

  els.exportFilteredBtn.addEventListener("click", () => {
    try {
      const csv = leadsToCsv(state.filtered);
      downloadCsv(csv);
      setFlash(`Exported ${state.filtered.length} filtered lead(s).`);
    } catch {
      setFlash("CSV export failed.", true);
    }
  });

  els.openSettingsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.openSettings });
  });

  els.clearAllBtn.addEventListener("click", () => {
    els.clearConfirmInput.value = "";
    els.clearDialog.showModal();
  });
}

function bindNotesDialog() {
  els.notesTextarea.addEventListener("input", () => {
    state.noteDirty = true;
  });

  els.cancelNotesBtn.addEventListener("click", () => {
    if (state.noteDirty && !confirm("Discard unsaved note changes?")) return;
    els.notesDialog.close("cancel");
  });

  els.notesDialog.addEventListener("cancel", (event) => {
    if (state.noteDirty && !confirm("Discard unsaved note changes?")) {
      event.preventDefault();
    }
  });

  els.notesForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = state.activeNoteLeadId;
    if (!id) return;

    try {
      await updateLead(id, { notes: els.notesTextarea.value || "" });
      els.notesDialog.close("save");
      setFlash("Notes saved.");
      await loadData();
    } catch (error) {
      setFlash(error.message || "Failed to save notes.", true);
    }
  });
}

function bindClearDialog() {
  els.cancelClearBtn.addEventListener("click", () => {
    els.clearDialog.close("cancel");
  });

  els.clearForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (els.clearConfirmInput.value !== "DELETE") {
      setFlash("Type DELETE to confirm data removal.", true);
      return;
    }

    try {
      await clearAllLeads();
      els.clearDialog.close("confirm");
      setFlash("All leads were deleted.");
      await loadData();
    } catch (error) {
      setFlash(error.message || "Failed to clear data.", true);
    }
  });
}

function bindEscapeToCloseDialogs() {
  [els.notesDialog, els.clearDialog].forEach((dialog) => {
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dialog.close("cancel");
      }
    });
  });
}

async function init() {
  populateStatusFilter();
  populateSortFilter();
  bindFilterEvents();
  bindTopActions();
  bindNotesDialog();
  bindClearDialog();
  bindEscapeToCloseDialogs();
  await loadData();
}

init().catch((error) => {
  setFlash("Tracker failed to load.", true);
  console.error(error);
});
