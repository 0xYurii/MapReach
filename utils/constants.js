export const STORAGE_KEYS = {
  leads: "mapreach_leads",
  templates: "mapreach_templates",
  settings: "mapreach_settings",
  schemaVersion: "mapreach_schema_version",
};

export const SCHEMA_VERSION = 1;

export const LEAD_STATUSES = [
  "unsent",
  "sent",
  "replied",
  "interested",
  "closed",
  "not_interested",
];

export const STATUS_LABELS = {
  unsent: "Unsent",
  sent: "Sent",
  replied: "Replied",
  interested: "Interested",
  closed: "Closed",
  not_interested: "Not interested",
};

export const STATUS_COLORS = {
  unsent: "status-unsent",
  sent: "status-sent",
  replied: "status-replied",
  interested: "status-interested",
  closed: "status-closed",
  not_interested: "status-not-interested",
};

export const SOURCE = "google_maps";

export const DEFAULT_SETTINGS = {
  defaultSort: "recently_updated",
  openTrackerAfterSave: false,
  showExtractionWarnings: true,
  debugMode: false,
};

export const SORT_OPTIONS = [
  { value: "recently_updated", label: "Recently updated" },
  { value: "recently_saved", label: "Recently saved" },
  { value: "oldest_saved", label: "Oldest saved" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "rating_desc", label: "Rating high to low" },
  { value: "reviews_asc", label: "Fewest reviews" },
];

export const MESSAGE_TYPES = {
  ping: "MAPREACH_PING",
  getCurrentLead: "MAPREACH_GET_CURRENT_LEAD",
  openTracker: "MAPREACH_OPEN_TRACKER",
  openSettings: "MAPREACH_OPEN_SETTINGS",
};

export const TRACKER_URL = chrome.runtime.getURL("tracker/tracker.html");
export const SETTINGS_URL = chrome.runtime.getURL("settings/settings.html");
