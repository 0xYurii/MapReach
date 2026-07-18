import { MESSAGE_TYPES, SORT_OPTIONS } from "../utils/constants.js";
import {
  getTemplates,
  saveTemplates,
  getSettings,
  saveSettings,
  seedDefaultsIfNeeded,
  exportAllData,
  getLeads,
  clearAllData,
  saveLead,
  getLeadById,
} from "../utils/storage.js";
import { getDefaultTemplates, renderTemplate } from "../utils/templates.js";
import { parseAndValidateBackupJson } from "../utils/validation.js";
import { findDuplicateLead, mergeLeadData } from "../utils/deduplication.js";

const sampleLead = {
  name: "Riverstone Café",
  category: "Cafe",
  address: "22 Market Street, Austin",
  city: "Austin",
  website: "https://riverstone.example",
  rating: 4.7,
  reviewCount: 128,
};

const state = {
  templates: [],
  settings: null,
  editingTemplateId: null,
  pendingImport: null,
};

const els = {
  flash: document.getElementById("flash"),
  openTrackerBtn: document.getElementById("openTrackerBtn"),
  templatesList: document.getElementById("templatesList"),
  addTemplateBtn: document.getElementById("addTemplateBtn"),
  resetDefaultsBtn: document.getElementById("resetDefaultsBtn"),
  defaultSortSelect: document.getElementById("defaultSortSelect"),
  openTrackerAfterSave: document.getElementById("openTrackerAfterSave"),
  showWarnings: document.getElementById("showWarnings"),
  debugMode: document.getElementById("debugMode"),
  saveGeneralBtn: document.getElementById("saveGeneralBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  importJsonInput: document.getElementById("importJsonInput"),
  importPreview: document.getElementById("importPreview"),
  applyImportBtn: document.getElementById("applyImportBtn"),
  clearAllDataBtn: document.getElementById("clearAllDataBtn"),
  templateDialog: document.getElementById("templateDialog"),
  templateForm: document.getElementById("templateForm"),
  templateDialogTitle: document.getElementById("templateDialogTitle"),
  templateNameInput: document.getElementById("templateNameInput"),
  templateKeywordsInput: document.getElementById("templateKeywordsInput"),
  templateBodyInput: document.getElementById("templateBodyInput"),
  templateDefaultInput: document.getElementById("templateDefaultInput"),
  templatePreview: document.getElementById("templatePreview"),
  cancelTemplateBtn: document.getElementById("cancelTemplateBtn"),
  confirmDialog: document.getElementById("confirmDialog"),
  confirmForm: document.getElementById("confirmForm"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmBody: document.getElementById("confirmBody"),
  confirmCancelBtn: document.getElementById("confirmCancelBtn"),
  confirmOkBtn: document.getElementById("confirmOkBtn"),
};

function setFlash(message, isError = false) {
  els.flash.textContent = message || "";
  els.flash.style.color = isError ? "#b91c1c" : "#475569";
}

function parseKeywords(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function showConfirm(title, body, confirmText = "Confirm") {
  return new Promise((resolve) => {
    els.confirmTitle.textContent = title;
    els.confirmBody.textContent = body;
    els.confirmOkBtn.textContent = confirmText;
    els.confirmDialog.showModal();

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onSubmit = (event) => {
      event.preventDefault();
      cleanup();
      resolve(true);
      els.confirmDialog.close("confirm");
    };

    const cleanup = () => {
      els.confirmCancelBtn.removeEventListener("click", onCancel);
      els.confirmForm.removeEventListener("submit", onSubmit);
    };

    els.confirmCancelBtn.addEventListener("click", onCancel, { once: true });
    els.confirmForm.addEventListener("submit", onSubmit, { once: true });
  });
}

function populateSortSelect() {
  els.defaultSortSelect.innerHTML = "";
  SORT_OPTIONS.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    els.defaultSortSelect.appendChild(node);
  });
}

function renderTemplatesList() {
  els.templatesList.innerHTML = "";

  state.templates.forEach((template) => {
    const item = document.createElement("article");
    item.className = "template-row";

    const head = document.createElement("div");
    head.className = "template-row-head";
    const title = document.createElement("h3");
    title.textContent = template.isDefault ? `${template.name} (Default)` : template.name;

    const actions = document.createElement("div");
    actions.className = "template-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary";
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openTemplateDialog(template.id));

    const defaultBtn = document.createElement("button");
    defaultBtn.className = "btn btn-secondary";
    defaultBtn.type = "button";
    defaultBtn.textContent = "Set default";
    defaultBtn.disabled = template.isDefault;
    defaultBtn.addEventListener("click", async () => {
      const next = state.templates.map((tpl) => ({ ...tpl, isDefault: tpl.id === template.id }));
      await saveTemplates(next);
      await loadData();
      setFlash(`Default template changed to ${template.name}.`);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (state.templates.length === 1) {
        setFlash("At least one template is required.", true);
        return;
      }

      const confirmed = await showConfirm(
        "Delete template",
        `Delete "${template.name}"? This cannot be undone.`,
        "Delete",
      );
      if (!confirmed) return;

      const remaining = state.templates.filter((tpl) => tpl.id !== template.id);
      if (!remaining.some((tpl) => tpl.isDefault) && remaining.length) {
        remaining[0].isDefault = true;
      }
      await saveTemplates(remaining);
      await loadData();
      setFlash(`Deleted template ${template.name}.`);
    });

    actions.append(editBtn, defaultBtn, deleteBtn);
    head.append(title, actions);

    const keywords = document.createElement("p");
    keywords.className = "muted";
    keywords.textContent = `Keywords: ${(template.categoryKeywords || []).join(", ") || "(none)"}`;

    const body = document.createElement("p");
    body.textContent = template.body;

    item.append(head, keywords, body);
    els.templatesList.appendChild(item);
  });
}

function renderGeneralSettings() {
  els.defaultSortSelect.value = state.settings.defaultSort;
  els.openTrackerAfterSave.checked = Boolean(state.settings.openTrackerAfterSave);
  els.showWarnings.checked = Boolean(state.settings.showExtractionWarnings);
  els.debugMode.checked = Boolean(state.settings.debugMode);
}

function updateTemplatePreview() {
  const draft = {
    body: els.templateBodyInput.value,
  };
  els.templatePreview.textContent = renderTemplate(draft, sampleLead);
}

function openTemplateDialog(templateId = null) {
  state.editingTemplateId = templateId;
  const template = templateId ? state.templates.find((tpl) => tpl.id === templateId) : null;
  const isEdit = Boolean(template);

  els.templateDialogTitle.textContent = isEdit ? "Edit template" : "Add template";
  els.templateNameInput.value = template?.name || "";
  els.templateKeywordsInput.value = (template?.categoryKeywords || []).join(", ");
  els.templateBodyInput.value = template?.body || "";
  els.templateDefaultInput.checked = Boolean(template?.isDefault);
  updateTemplatePreview();
  els.templateDialog.showModal();
}

async function saveTemplateFromDialog() {
  const id = state.editingTemplateId || `tpl-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const existing = state.templates.find((tpl) => tpl.id === id);

  const draft = {
    id,
    name: els.templateNameInput.value.trim(),
    categoryKeywords: parseKeywords(els.templateKeywordsInput.value),
    body: els.templateBodyInput.value.trim(),
    isDefault: els.templateDefaultInput.checked,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (!draft.name || !draft.body) {
    setFlash("Template name and body are required.", true);
    return;
  }

  const next = state.templates.map((tpl) => ({ ...tpl }));
  const index = next.findIndex((tpl) => tpl.id === id);
  if (index >= 0) next[index] = draft;
  else next.push(draft);

  if (draft.isDefault) {
    next.forEach((tpl) => {
      if (tpl.id !== draft.id) tpl.isDefault = false;
    });
  } else if (!next.some((tpl) => tpl.isDefault)) {
    next[0].isDefault = true;
  }

  await saveTemplates(next);
  els.templateDialog.close("save");
  await loadData();
  setFlash("Template saved.");
}

function downloadJson(data, prefix = "mapreach-backup") {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${prefix}-${date}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function mergeImportedData(payload) {
  const currentLeads = await getLeads();
  const mergedLeads = [...currentLeads];

  for (const incoming of payload.leads) {
    const dedupe = findDuplicateLead(incoming, mergedLeads);
    if (dedupe.lead) {
      const merged = mergeLeadData(dedupe.lead, incoming);
      await saveLead(merged);
    } else {
      const existingById = incoming.id ? await getLeadById(incoming.id) : null;
      if (existingById) {
        const merged = mergeLeadData(existingById, incoming);
        await saveLead(merged);
      } else {
        await saveLead({ ...incoming, id: incoming.id || crypto.randomUUID() });
      }
    }
  }

  await saveTemplates(payload.templates);
  await saveSettings(payload.settings);
}

function bindEvents() {
  els.openTrackerBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.openTracker });
  });

  els.addTemplateBtn.addEventListener("click", () => openTemplateDialog());

  els.cancelTemplateBtn.addEventListener("click", () => {
    els.templateDialog.close("cancel");
  });

  els.templateBodyInput.addEventListener("input", updateTemplatePreview);
  els.templateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveTemplateFromDialog();
  });

  els.resetDefaultsBtn.addEventListener("click", async () => {
    const confirmed = await showConfirm(
      "Reset default templates",
      "This will replace your current templates with the original defaults.",
      "Reset",
    );
    if (!confirmed) return;
    await saveTemplates(getDefaultTemplates());
    await loadData();
    setFlash("Templates reset to defaults.");
  });

  els.saveGeneralBtn.addEventListener("click", async () => {
    try {
      const next = {
        defaultSort: els.defaultSortSelect.value,
        openTrackerAfterSave: els.openTrackerAfterSave.checked,
        showExtractionWarnings: els.showWarnings.checked,
        debugMode: els.debugMode.checked,
      };
      await saveSettings(next);
      await loadData();
      setFlash("General settings saved.");
    } catch (error) {
      setFlash(error.message || "Could not save settings.", true);
    }
  });

  els.exportJsonBtn.addEventListener("click", async () => {
    try {
      const data = await exportAllData();
      downloadJson(data);
      setFlash(`Exported ${data.leads.length} lead(s) to JSON.`);
    } catch {
      setFlash("JSON export failed.", true);
    }
  });

  els.importJsonInput.addEventListener("change", async () => {
    const file = els.importJsonInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = parseAndValidateBackupJson(parsed);

      if (!validation.valid) {
        state.pendingImport = null;
        els.applyImportBtn.disabled = true;
        els.importPreview.textContent = validation.error;
        setFlash("Invalid backup file.", true);
        return;
      }

      state.pendingImport = validation.payload;
      els.applyImportBtn.disabled = false;
      els.importPreview.textContent = `Ready to import: ${validation.payload.leads.length} lead(s), ${validation.payload.templates.length} template(s).`;
      setFlash("Import file validated.");
    } catch {
      state.pendingImport = null;
      els.applyImportBtn.disabled = true;
      els.importPreview.textContent = "Could not parse JSON file.";
      setFlash("Invalid JSON file.", true);
    }
  });

  els.applyImportBtn.addEventListener("click", async () => {
    if (!state.pendingImport) {
      setFlash("Choose a valid backup file first.", true);
      return;
    }
    try {
      await mergeImportedData(state.pendingImport);
      state.pendingImport = null;
      els.applyImportBtn.disabled = true;
      els.importPreview.textContent = "";
      els.importJsonInput.value = "";
      await loadData();
      setFlash("Backup merged successfully.");
    } catch (error) {
      setFlash(error.message || "Import failed.", true);
    }
  });

  els.clearAllDataBtn.addEventListener("click", async () => {
    const confirmed = await showConfirm(
      "Clear all local data",
      "This removes all leads, templates, and settings from local storage and cannot be undone.",
      "Clear all",
    );
    if (!confirmed) return;

    try {
      await clearAllData();
      await loadData();
      setFlash("All local data cleared.");
    } catch (error) {
      setFlash(error.message || "Could not clear data.", true);
    }
  });
}

async function loadData() {
  const [templates, settings] = await Promise.all([getTemplates(), getSettings()]);
  state.templates = templates;
  state.settings = settings;
  renderTemplatesList();
  renderGeneralSettings();
}

async function init() {
  await seedDefaultsIfNeeded();
  populateSortSelect();
  bindEvents();
  await loadData();
}

init().catch((error) => {
  setFlash("Settings failed to load.", true);
  console.error(error);
});
