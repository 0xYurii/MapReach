/**
 * MapReach — Lead Tracker controller.
 *
 * Renders saved leads as a responsive table/cards with search, filters, sorting,
 * inline status changes, a notes editor, deletion, CSV export, and per-lead
 * actions (open Maps, copy message, mark sent). All rendering uses textContent /
 * DOM building — never innerHTML with extracted values.
 */

import {
  STATUSES,
  STATUS_META,
  SORT_OPTIONS,
  WEBSITE_FILTERS,
} from '../utils/constants.js';
import {
  getLeads,
  updateLead,
  deleteLead,
  clearAllLeads,
  getTemplates,
  getSettings,
} from '../utils/storage.js';
import { generateMessage, pickTemplate } from '../utils/templates.js';
import { formatRating, formatReviewCount, formatDate, getDomain, deriveCity, truncate } from '../utils/formatters.js';
import { exportLeadsCsv } from '../utils/export.js';

const $ = (id) => document.getElementById(id);

const state = {
  leads: [],
  templates: [],
  settings: null,
  filtered: [],
  filters: { search: '', status: 'all', category: 'all', website: 'all', sort: 'updated_desc' },
  notes: { leadId: null, initial: '' },
  confirm: { onOk: null },
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

/* ---------- clipboard ---------- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/* ---------- filter option population ---------- */
function populateStaticFilters() {
  const statusSel = $('filter-status');
  for (const s of STATUSES) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = STATUS_META[s].label;
    statusSel.appendChild(opt);
  }
  const webSel = $('filter-website');
  for (const w of WEBSITE_FILTERS) {
    const opt = document.createElement('option');
    opt.value = w.value;
    opt.textContent = w.label;
    webSel.appendChild(opt);
  }
  const sortSel = $('sort');
  for (const s of SORT_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = s.value;
    opt.textContent = s.label;
    sortSel.appendChild(opt);
  }
}

function populateCategoryFilter() {
  const sel = $('filter-category');
  const current = sel.value || 'all';
  const cats = Array.from(
    new Set(state.leads.map((l) => (l.category || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  sel.textContent = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All categories';
  sel.appendChild(allOpt);
  for (const c of cats) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }
  sel.value = cats.includes(current) || current === 'all' ? current : 'all';
}

/* ---------- filtering & sorting ---------- */
function matchesWebsiteFilter(lead, filter) {
  if (filter === 'all') return true;
  const type = lead.websiteType || (lead.hasWebsite === true ? 'real' : lead.hasWebsite === false ? 'none' : 'unknown');
  return type === filter;
}

function applyFilters() {
  const { search, status, category, website, sort } = state.filters;
  const q = search.trim().toLowerCase();

  let rows = state.leads.filter((lead) => {
    if (status !== 'all' && lead.status !== status) return false;
    if (category !== 'all' && (lead.category || '') !== category) return false;
    if (!matchesWebsiteFilter(lead, website)) return false;
    if (q) {
      const hay = [lead.name, lead.category, lead.address, lead.phone, lead.website, lead.notes]
        .map((v) => (v || '').toString().toLowerCase())
        .join(' ');
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const byStr = (a, b) => String(a).localeCompare(String(b));
  rows = rows.slice().sort((a, b) => {
    switch (sort) {
      case 'saved_desc': return byStr(b.savedAt, a.savedAt);
      case 'saved_asc': return byStr(a.savedAt, b.savedAt);
      case 'name_asc': return (a.name || '').localeCompare(b.name || '');
      case 'rating_desc': return (b.rating || 0) - (a.rating || 0);
      case 'reviews_asc': return (a.reviewCount == null ? Infinity : a.reviewCount) - (b.reviewCount == null ? Infinity : b.reviewCount);
      case 'updated_desc':
      default: return byStr(b.updatedAt, a.updatedAt);
    }
  });

  state.filtered = rows;
  return rows;
}

function updateActiveFilterMeta() {
  const { search, status, category, website } = state.filters;
  let count = 0;
  if (search.trim()) count += 1;
  if (status !== 'all') count += 1;
  if (category !== 'all') count += 1;
  if (website !== 'all') count += 1;
  const meta = $('active-filters');
  meta.textContent = count ? `${count} active filter${count > 1 ? 's' : ''}` : '';
  $('btn-clear-filters').hidden = count === 0;
}

/* ---------- rendering ---------- */
function makeWebsiteCell(lead) {
  const td = document.createElement('td');
  td.dataset.label = 'Website';
  const type = lead.websiteType || (lead.hasWebsite === true ? 'real' : lead.hasWebsite === false ? 'none' : 'unknown');

  if (type === 'real' && lead.website) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-real';
    badge.textContent = 'Real';
    const link = document.createElement('a');
    link.className = 'website-link';
    link.href = lead.website;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = ' ' + (getDomain(lead.website) || lead.website);
    td.appendChild(badge);
    td.appendChild(link);
  } else if (type === 'social') {
    const badge = document.createElement('span');
    badge.className = 'badge badge-social';
    badge.textContent = lead.socialPlatform ? `Social · ${lead.socialPlatform}` : 'Social only';
    td.appendChild(badge);
  } else if (type === 'unknown') {
    const badge = document.createElement('span');
    badge.className = 'badge badge-unknown';
    badge.textContent = 'Unknown';
    td.appendChild(badge);
  } else {
    const badge = document.createElement('span');
    badge.className = 'badge badge-none';
    badge.textContent = 'No website';
    td.appendChild(badge);
  }
  return td;
}

function makeStatusSelect(lead) {
  const sel = document.createElement('select');
  sel.className = 'status-select';
  sel.setAttribute('data-status', lead.status);
  sel.setAttribute('aria-label', `Status for ${lead.name}`);
  for (const s of STATUSES) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = STATUS_META[s].label;
    if (s === lead.status) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', async () => {
    await changeStatus(lead, sel.value);
    sel.setAttribute('data-status', sel.value);
  });
  return sel;
}

function iconButton(label, title, handler, extraClass = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn-icon${extraClass ? ` ${extraClass}` : ''}`;
  btn.textContent = label;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.addEventListener('click', handler);
  return btn;
}

function makeRow(lead) {
  const tr = document.createElement('tr');

  // Business
  const bizTd = document.createElement('td');
  bizTd.className = 'cell-business';
  bizTd.dataset.label = 'Business';
  const name = document.createElement('div');
  name.className = 'biz-name';
  name.textContent = lead.name || 'Unnamed business';
  bizTd.appendChild(name);
  if (lead.address) {
    const addr = document.createElement('div');
    addr.className = 'biz-address';
    addr.textContent = lead.address;
    bizTd.appendChild(addr);
  }
  tr.appendChild(bizTd);

  // Category
  const catTd = document.createElement('td');
  catTd.dataset.label = 'Category';
  catTd.textContent = lead.category || '—';
  if (!lead.category) catTd.classList.add('muted');
  tr.appendChild(catTd);

  // Contact
  const contactTd = document.createElement('td');
  contactTd.dataset.label = 'Contact';
  if (lead.phone) {
    const wrap = document.createElement('div');
    wrap.className = 'contact-phone';
    const span = document.createElement('span');
    span.className = 'mono';
    span.textContent = lead.phone;
    wrap.appendChild(span);
    wrap.appendChild(
      iconButton('Copy', 'Copy phone number', async () => {
        const ok = await copyText(lead.phone);
        toast(ok ? 'Phone copied' : 'Copy failed', ok ? 'success' : 'error');
      }),
    );
    contactTd.appendChild(wrap);
  } else {
    contactTd.textContent = '—';
    contactTd.classList.add('muted');
  }
  tr.appendChild(contactTd);

  // Website
  tr.appendChild(makeWebsiteCell(lead));

  // Rating
  const ratingTd = document.createElement('td');
  ratingTd.dataset.label = 'Rating';
  if (lead.rating !== null && lead.rating !== undefined) {
    ratingTd.textContent = `★ ${formatRating(lead.rating)}`;
    if (lead.reviewCount != null) {
      const rc = document.createElement('div');
      rc.className = 'muted';
      rc.style.fontSize = '12px';
      rc.textContent = `${formatReviewCount(lead.reviewCount)} reviews`;
      ratingTd.appendChild(rc);
    }
  } else {
    ratingTd.textContent = '—';
    ratingTd.classList.add('muted');
  }
  tr.appendChild(ratingTd);

  // Status
  const statusTd = document.createElement('td');
  statusTd.dataset.label = 'Status';
  statusTd.appendChild(makeStatusSelect(lead));
  tr.appendChild(statusTd);

  // Saved
  const savedTd = document.createElement('td');
  savedTd.dataset.label = 'Saved';
  savedTd.className = 'muted';
  savedTd.textContent = formatDate(lead.savedAt);
  tr.appendChild(savedTd);

  // Actions
  const actionsTd = document.createElement('td');
  actionsTd.dataset.label = 'Actions';
  const actions = document.createElement('div');
  actions.className = 'actions';
  if (lead.mapsUrl) {
    const a = document.createElement('a');
    a.className = 'btn-icon';
    a.href = lead.mapsUrl;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.textContent = 'Maps';
    a.title = 'Open in Google Maps';
    actions.appendChild(a);
  }
  actions.appendChild(iconButton('Message', 'Copy generated outreach message', () => copyMessage(lead)));
  actions.appendChild(iconButton('Sent', 'Mark as sent', () => markSent(lead)));
  actions.appendChild(iconButton('Notes', 'Edit notes', () => openNotes(lead)));
  actions.appendChild(iconButton('Delete', 'Delete lead', () => confirmDelete(lead), 'danger'));
  actionsTd.appendChild(actions);
  tr.appendChild(actionsTd);

  return tr;
}

function render() {
  applyFilters();
  updateActiveFilterMeta();

  const count = state.leads.length;
  $('lead-count').textContent = `${count} lead${count === 1 ? '' : 's'}`;

  const tbody = $('rows');
  tbody.textContent = '';

  const hasLeads = state.leads.length > 0;
  const hasResults = state.filtered.length > 0;

  $('empty-state').hidden = hasLeads;
  $('no-results').hidden = !(hasLeads && !hasResults);
  $('table-wrap').hidden = !hasResults;

  if (!hasResults) return;

  const frag = document.createDocumentFragment();
  for (const lead of state.filtered) frag.appendChild(makeRow(lead));
  tbody.appendChild(frag);
}

/* ---------- actions ---------- */
async function changeStatus(lead, newStatus) {
  const now = new Date().toISOString();
  const patch = { status: newStatus };
  if (newStatus === 'sent') {
    patch.lastContactedAt = now;
    if (!lead.firstContactedAt) patch.firstContactedAt = now;
  }
  const updated = await updateLead(lead.id, patch);
  if (updated) {
    Object.assign(lead, updated);
    toast(`Status: ${STATUS_META[newStatus].label}`, 'success');
  } else {
    toast('Could not update status', 'error');
  }
}

async function markSent(lead) {
  await changeStatus(lead, 'sent');
  render();
}

function resolveTemplateAndLang(lead) {
  let template = state.templates.find((t) => t.id === lead.selectedTemplateId);
  if (!template) {
    const picked = pickTemplate(state.templates, lead);
    template = picked ? picked.template : state.templates[0];
  }
  const lang = lead.selectedLanguage || (state.settings && state.settings.defaultLanguage) || 'en';
  return { template, lang };
}

async function copyMessage(lead) {
  const { template, lang } = resolveTemplateAndLang(lead);
  if (!template) {
    toast('No template available', 'error');
    return;
  }
  const text = generateMessage(template, { ...lead, city: deriveCity(lead.address) }, lang);
  const ok = await copyText(text);
  toast(ok ? 'Message copied' : 'Copy failed', ok ? 'success' : 'error');
}

/* ---------- notes dialog ---------- */
function openNotes(lead) {
  state.notes.leadId = lead.id;
  state.notes.initial = lead.notes || '';
  $('notes-title').textContent = 'Notes';
  $('notes-subtitle').textContent = lead.name || '';
  $('notes-text').value = lead.notes || '';
  $('dialog-notes').showModal();
  setTimeout(() => $('notes-text').focus(), 30);
}

function notesDirty() {
  return $('notes-text').value !== state.notes.initial;
}

async function saveNotes() {
  const lead = state.leads.find((l) => l.id === state.notes.leadId);
  if (!lead) { $('dialog-notes').close(); return; }
  const updated = await updateLead(lead.id, { notes: $('notes-text').value });
  if (updated) {
    Object.assign(lead, updated);
    state.notes.initial = updated.notes;
    toast('Notes saved', 'success');
    $('dialog-notes').close();
    render();
  } else {
    toast('Could not save notes', 'error');
  }
}

function tryCloseNotes() {
  if (notesDirty() && !window.confirm('Discard unsaved note changes?')) return;
  $('dialog-notes').close();
}

/* ---------- confirm dialog ---------- */
function openConfirm({ title, message, requireType = false, danger = true, onOk }) {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  const typeWrap = $('confirm-type-wrap');
  const typeInput = $('confirm-type-input');
  const okBtn = $('confirm-ok');
  typeWrap.hidden = !requireType;
  typeInput.value = '';
  okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  okBtn.disabled = requireType;
  state.confirm.onOk = onOk;
  $('dialog-confirm').showModal();

  if (requireType) {
    const onInput = () => { okBtn.disabled = typeInput.value.trim().toUpperCase() !== 'DELETE'; };
    typeInput.oninput = onInput;
    setTimeout(() => typeInput.focus(), 30);
  } else {
    setTimeout(() => okBtn.focus(), 30);
  }
}

function confirmDelete(lead) {
  openConfirm({
    title: 'Delete this lead?',
    message: `“${lead.name || 'This lead'}” will be permanently removed. This cannot be undone.`,
    requireType: false,
    onOk: async () => {
      const ok = await deleteLead(lead.id);
      $('dialog-confirm').close();
      if (ok) {
        state.leads = state.leads.filter((l) => l.id !== lead.id);
        populateCategoryFilter();
        render();
        toast('Lead deleted', 'success');
      } else {
        toast('Could not delete lead', 'error');
      }
    },
  });
}

function confirmClearAll() {
  openConfirm({
    title: 'Clear ALL local data?',
    message: 'This permanently deletes every saved lead in this Chrome profile. Templates and settings are kept. This cannot be undone.',
    requireType: true,
    onOk: async () => {
      await clearAllLeads();
      $('dialog-confirm').close();
      state.leads = [];
      populateCategoryFilter();
      render();
      toast('All leads cleared', 'success');
    },
  });
}

/* ---------- export dialog ---------- */
function openExport() {
  const total = state.leads.length;
  const shown = state.filtered.length;
  $('export-sub').textContent = `${shown} lead${shown === 1 ? '' : 's'} match your filters, out of ${total} total.`;
  $('export-filtered').textContent = `Export filtered leads (${shown})`;
  $('export-all').textContent = `Export all leads (${total})`;
  $('dialog-export').showModal();
}

function doExport(list) {
  $('dialog-export').close();
  if (!list.length) {
    toast('No leads to export', 'error');
    return;
  }
  try {
    const { count, filename } = exportLeadsCsv(list);
    toast(`Exported ${count} lead${count === 1 ? '' : 's'} to ${filename}`, 'success');
  } catch {
    toast('Export failed', 'error');
  }
}

/* ---------- wiring ---------- */
function wireEvents() {
  $('search').addEventListener('input', (e) => { state.filters.search = e.target.value; render(); });
  $('filter-status').addEventListener('change', (e) => { state.filters.status = e.target.value; render(); });
  $('filter-category').addEventListener('change', (e) => { state.filters.category = e.target.value; render(); });
  $('filter-website').addEventListener('change', (e) => { state.filters.website = e.target.value; render(); });
  $('sort').addEventListener('change', (e) => { state.filters.sort = e.target.value; render(); });

  const clearFilters = () => {
    state.filters.search = '';
    state.filters.status = 'all';
    state.filters.category = 'all';
    state.filters.website = 'all';
    $('search').value = '';
    $('filter-status').value = 'all';
    $('filter-category').value = 'all';
    $('filter-website').value = 'all';
    render();
  };
  $('btn-clear-filters').addEventListener('click', clearFilters);
  $('btn-clear-filters-2').addEventListener('click', clearFilters);

  $('btn-export').addEventListener('click', openExport);
  $('btn-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('btn-clear-all').addEventListener('click', confirmClearAll);

  // Notes dialog
  $('notes-save').addEventListener('click', saveNotes);
  $('notes-cancel').addEventListener('click', (e) => { e.preventDefault(); tryCloseNotes(); });
  $('dialog-notes').addEventListener('cancel', (e) => { e.preventDefault(); tryCloseNotes(); });

  // Confirm dialog
  $('confirm-ok').addEventListener('click', () => { if (state.confirm.onOk) state.confirm.onOk(); });
  $('confirm-cancel').addEventListener('click', () => $('dialog-confirm').close());

  // Export dialog
  $('export-filtered').addEventListener('click', () => doExport(state.filtered));
  $('export-all').addEventListener('click', () => doExport(state.leads));
  $('export-cancel').addEventListener('click', () => $('dialog-export').close());
}

/* ---------- init ---------- */
async function init() {
  wireEvents();
  populateStaticFilters();
  state.settings = await getSettings();
  state.templates = await getTemplates();
  state.filters.sort = state.settings.defaultSort || 'updated_desc';
  $('sort').value = state.filters.sort;
  state.leads = await getLeads();
  populateCategoryFilter();
  render();
}

document.addEventListener('DOMContentLoaded', init);
