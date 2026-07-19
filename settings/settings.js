/**
 * MapReach — Settings controller.
 *
 * Manages multilingual templates (CRUD + live preview), general preferences,
 * the custom social-domain list, and JSON backup / validated import / data
 * clearing. All persistence goes through the storage layer.
 */

import { SORT_OPTIONS, SAMPLE_LEAD, LANGUAGES, RTL_LANGUAGES } from '../utils/constants.js';
import {
  getSettings,
  saveSettings,
  getTemplates,
  saveTemplates,
  resetTemplates,
  buildBackup,
  importBackupMerge,
  clearAllData,
  seedDefaultsIfNeeded,
} from '../utils/storage.js';
import { renderTemplateBody } from '../utils/templates.js';
import { validateBackup } from '../utils/validation.js';
import { downloadTextFile } from '../utils/export.js';

const $ = (id) => document.getElementById(id);

const state = {
  settings: null,
  templates: [],
  editingId: null, // null => creating a new template
  confirmOnOk: null,
  pendingImport: null,
};

/* ---------- toast ---------- */
let toastTimer = null;
function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast${kind ? ` toast-${kind}` : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- templates ---------- */
function templateSnippet(t) {
  const body = t.bodies.en || t.bodies.fr || t.bodies.ar || '';
  return body.length > 120 ? `${body.slice(0, 119)}…` : body;
}

function renderTemplates() {
  const list = $('template-list');
  list.textContent = '';
  if (!state.templates.length) {
    const p = document.createElement('p');
    p.className = 'card-sub';
    p.textContent = 'No templates. Add one or reset to defaults.';
    list.appendChild(p);
    return;
  }
  for (const t of state.templates) {
    const item = document.createElement('div');
    item.className = 'template-item';

    const info = document.createElement('div');
    info.className = 'template-info';
    const nameRow = document.createElement('div');
    nameRow.className = 'template-name';
    const name = document.createElement('span');
    name.textContent = t.name;
    nameRow.appendChild(name);
    if (t.isDefault) {
      const b = document.createElement('span');
      b.className = 'default-badge';
      b.textContent = 'Default';
      nameRow.appendChild(b);
    }
    if (t.isNoWebsite) {
      const b = document.createElement('span');
      b.className = 'nosite-badge';
      b.textContent = 'Auto: no-website';
      nameRow.appendChild(b);
    }
    info.appendChild(nameRow);

    if (Array.isArray(t.categoryKeywords) && t.categoryKeywords.length) {
      const kw = document.createElement('p');
      kw.className = 'template-keywords';
      kw.textContent = `Keywords: ${t.categoryKeywords.join(', ')}`;
      info.appendChild(kw);
    }
    const snippet = document.createElement('p');
    snippet.className = 'template-snippet';
    snippet.textContent = templateSnippet(t);
    info.appendChild(snippet);

    const actions = document.createElement('div');
    actions.className = 'template-item-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-ghost btn-tiny';
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openTemplateEditor(t.id));
    actions.appendChild(editBtn);

    if (!t.isDefault) {
      const defBtn = document.createElement('button');
      defBtn.className = 'btn btn-ghost btn-tiny';
      defBtn.type = 'button';
      defBtn.textContent = 'Make default';
      defBtn.addEventListener('click', () => makeDefault(t.id));
      actions.appendChild(defBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-danger-ghost btn-tiny';
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => confirmDeleteTemplate(t));
    actions.appendChild(delBtn);

    item.appendChild(info);
    item.appendChild(actions);
    list.appendChild(item);
  }
}

function openTemplateEditor(id) {
  state.editingId = id;
  const t = state.templates.find((x) => x.id === id) || null;
  $('template-editor-title').textContent = t ? 'Edit template' : 'Add template';
  $('tpl-name').value = t ? t.name : '';
  $('tpl-keywords').value = t && Array.isArray(t.categoryKeywords) ? t.categoryKeywords.join(', ') : '';
  $('tpl-default').checked = t ? Boolean(t.isDefault) : false;
  $('tpl-en').value = t ? t.bodies.en || '' : '';
  $('tpl-fr').value = t ? t.bodies.fr || '' : '';
  $('tpl-ar').value = t ? t.bodies.ar || '' : '';
  $('tpl-preview-lang').value = 'en';
  updatePreview();
  $('dialog-template').showModal();
  setTimeout(() => $('tpl-name').focus(), 30);
}

function currentEditorBodies() {
  return { en: $('tpl-en').value, fr: $('tpl-fr').value, ar: $('tpl-ar').value };
}

function updatePreview() {
  const lang = $('tpl-preview-lang').value;
  const bodies = currentEditorBodies();
  const text = renderTemplateBody(bodies[lang] || '', SAMPLE_LEAD);
  const el = $('tpl-preview');
  el.textContent = text || '(empty for this language)';
  el.setAttribute('dir', RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr');
}

function saveTemplate() {
  const name = $('tpl-name').value.trim();
  const bodies = currentEditorBodies();
  const hasBody = LANGUAGES.some((l) => (bodies[l] || '').trim());
  if (!name) { toast('Template needs a name', 'error'); return; }
  if (!hasBody) { toast('Add a message in at least one language', 'error'); return; }

  const keywords = $('tpl-keywords').value.split(',').map((s) => s.trim()).filter(Boolean);
  const makeDef = $('tpl-default').checked;
  const now = new Date().toISOString();

  let list = state.templates.slice();
  if (state.editingId) {
    list = list.map((t) =>
      t.id === state.editingId
        ? { ...t, name, categoryKeywords: keywords, bodies, isDefault: makeDef, updatedAt: now }
        : { ...t, isDefault: makeDef ? false : t.isDefault },
    );
  } else {
    const newTpl = {
      id: `tpl-custom-${Date.now().toString(36)}`,
      name,
      categoryKeywords: keywords,
      bodies,
      isDefault: makeDef,
      isNoWebsite: false,
      createdAt: now,
      updatedAt: now,
    };
    list = list.map((t) => ({ ...t, isDefault: makeDef ? false : t.isDefault }));
    list.push(newTpl);
  }
  // Guarantee at least one default.
  if (!list.some((t) => t.isDefault) && list.length) list[0].isDefault = true;

  persistTemplates(list, 'Template saved');
  $('dialog-template').close();
}

function makeDefault(id) {
  const list = state.templates.map((t) => ({ ...t, isDefault: t.id === id }));
  persistTemplates(list, 'Default template set');
}

function confirmDeleteTemplate(t) {
  openConfirm({
    title: 'Delete template?',
    message: `“${t.name}” will be removed. You can restore all seed templates with “Reset to defaults”.`,
    onOk: () => {
      let list = state.templates.filter((x) => x.id !== t.id);
      if (!list.some((x) => x.isDefault) && list.length) list[0].isDefault = true;
      $('dialog-confirm').close();
      persistTemplates(list, 'Template deleted');
    },
  });
}

async function persistTemplates(list, message) {
  state.templates = await saveTemplates(list);
  renderTemplates();
  toast(message, 'success');
}

function confirmResetTemplates() {
  openConfirm({
    title: 'Reset templates to defaults?',
    message: 'This replaces your current templates with the built-in English/French/Arabic seed templates.',
    onOk: async () => {
      state.templates = await resetTemplates();
      $('dialog-confirm').close();
      renderTemplates();
      toast('Templates reset to defaults', 'success');
    },
  });
}

/* ---------- general settings ---------- */
function bindGeneralControls() {
  const sortSel = $('set-sort');
  for (const s of SORT_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = s.value;
    opt.textContent = s.label;
    sortSel.appendChild(opt);
  }

  sortSel.value = state.settings.defaultSort;
  $('set-language').value = state.settings.defaultLanguage;
  $('set-autodetect').checked = state.settings.autoDetectLanguage;
  $('set-opentracker').checked = state.settings.openTrackerAfterSave;
  $('set-warnings').checked = state.settings.showWarnings;
  $('set-debug').checked = state.settings.debug;
  $('set-social').value = (state.settings.socialDomains || []).join('\n');

  const persist = async (patch) => {
    state.settings = await saveSettings({ ...state.settings, ...patch });
    toast('Preferences saved', 'success');
  };

  sortSel.addEventListener('change', () => persist({ defaultSort: sortSel.value }));
  $('set-language').addEventListener('change', () => persist({ defaultLanguage: $('set-language').value }));
  $('set-autodetect').addEventListener('change', () => persist({ autoDetectLanguage: $('set-autodetect').checked }));
  $('set-opentracker').addEventListener('change', () => persist({ openTrackerAfterSave: $('set-opentracker').checked }));
  $('set-warnings').addEventListener('change', () => persist({ showWarnings: $('set-warnings').checked }));
  $('set-debug').addEventListener('change', () => persist({ debug: $('set-debug').checked }));

  $('btn-save-social').addEventListener('click', async () => {
    const domains = $('set-social').value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    state.settings = await saveSettings({ ...state.settings, socialDomains: domains });
    toast(`Saved ${domains.length} custom domain${domains.length === 1 ? '' : 's'}`, 'success');
  });
}

/* ---------- data management ---------- */
async function exportJson() {
  try {
    const backup = await buildBackup();
    const filename = `mapreach-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadTextFile(filename, JSON.stringify(backup, null, 2), 'application/json');
    toast('Backup downloaded', 'success');
  } catch {
    toast('Backup failed', 'error');
  }
}

async function handleImportFile(file) {
  if (!file) return;
  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    toast('That file is not valid JSON', 'error');
    return;
  }
  const result = validateBackup(parsed);
  const summary = $('import-summary');
  const warnings = $('import-warnings');
  warnings.textContent = '';

  if (!result.ok) {
    summary.textContent = 'This backup could not be imported:';
    for (const e of result.errors) {
      const li = document.createElement('li');
      li.textContent = e;
      warnings.appendChild(li);
    }
    $('import-confirm').disabled = true;
    state.pendingImport = null;
  } else {
    summary.textContent = `Ready to merge ${result.counts.leads} lead(s) and ${result.counts.templates} template(s) into your existing data. Duplicate leads will be updated, not duplicated.`;
    for (const e of result.errors) {
      const li = document.createElement('li');
      li.textContent = e;
      warnings.appendChild(li);
    }
    $('import-confirm').disabled = false;
    state.pendingImport = result.data;
  }
  $('dialog-import').showModal();
}

async function confirmImport() {
  if (!state.pendingImport) { $('dialog-import').close(); return; }
  try {
    const res = await importBackupMerge(state.pendingImport);
    $('dialog-import').close();
    // Reload templates/settings in case they changed.
    state.templates = await getTemplates();
    state.settings = await getSettings();
    renderTemplates();
    toast(`Imported: ${res.leadsAdded} added, ${res.leadsUpdated} updated`, 'success');
  } catch {
    toast('Import failed', 'error');
  } finally {
    state.pendingImport = null;
    $('import-file').value = '';
  }
}

function confirmClearAll() {
  openConfirm({
    title: 'Clear ALL local data?',
    message: 'This permanently deletes every lead, template and setting stored by MapReach in this Chrome profile. Defaults will be re-seeded. This cannot be undone.',
    requireType: true,
    onOk: async () => {
      await clearAllData();
      await seedDefaultsIfNeeded();
      $('dialog-confirm').close();
      state.settings = await getSettings();
      state.templates = await getTemplates();
      bindGeneralValues();
      renderTemplates();
      toast('All data cleared and defaults restored', 'success');
    },
  });
}

/** Re-apply setting values to the general controls (after a reset). */
function bindGeneralValues() {
  $('set-sort').value = state.settings.defaultSort;
  $('set-language').value = state.settings.defaultLanguage;
  $('set-autodetect').checked = state.settings.autoDetectLanguage;
  $('set-opentracker').checked = state.settings.openTrackerAfterSave;
  $('set-warnings').checked = state.settings.showWarnings;
  $('set-debug').checked = state.settings.debug;
  $('set-social').value = (state.settings.socialDomains || []).join('\n');
}

/* ---------- confirm dialog ---------- */
function openConfirm({ title, message, requireType = false, onOk }) {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  const typeWrap = $('confirm-type-wrap');
  const typeInput = $('confirm-type-input');
  const okBtn = $('confirm-ok');
  typeWrap.hidden = !requireType;
  typeInput.value = '';
  okBtn.disabled = requireType;
  state.confirmOnOk = onOk;
  $('dialog-confirm').showModal();
  if (requireType) {
    typeInput.oninput = () => { okBtn.disabled = typeInput.value.trim().toUpperCase() !== 'DELETE'; };
    setTimeout(() => typeInput.focus(), 30);
  } else {
    setTimeout(() => okBtn.focus(), 30);
  }
}

/* ---------- wiring ---------- */
function wireEvents() {
  $('btn-tracker').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tracker/tracker.html') });
  });

  $('btn-add-template').addEventListener('click', () => openTemplateEditor(null));
  $('btn-reset-templates').addEventListener('click', confirmResetTemplates);

  $('tpl-save').addEventListener('click', saveTemplate);
  $('tpl-cancel').addEventListener('click', () => $('dialog-template').close());
  $('tpl-preview-lang').addEventListener('change', updatePreview);
  for (const idv of ['tpl-en', 'tpl-fr', 'tpl-ar']) {
    $(idv).addEventListener('input', updatePreview);
  }

  $('btn-export-json').addEventListener('click', exportJson);
  $('import-file').addEventListener('change', (e) => handleImportFile(e.target.files && e.target.files[0]));
  $('import-cancel').addEventListener('click', () => { $('dialog-import').close(); $('import-file').value = ''; });
  $('import-confirm').addEventListener('click', confirmImport);

  $('btn-clear-all').addEventListener('click', confirmClearAll);

  $('confirm-ok').addEventListener('click', () => { if (state.confirmOnOk) state.confirmOnOk(); });
  $('confirm-cancel').addEventListener('click', () => $('dialog-confirm').close());
}

/* ---------- init ---------- */
async function init() {
  try {
    await seedDefaultsIfNeeded();
  } catch {
    /* non-fatal */
  }
  state.settings = await getSettings();
  state.templates = await getTemplates();
  wireEvents();
  bindGeneralControls();
  renderTemplates();
}

document.addEventListener('DOMContentLoaded', init);
