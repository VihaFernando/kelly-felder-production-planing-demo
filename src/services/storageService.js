/**
 * Centralised localStorage persistence. Components never touch localStorage directly.
 * The payload is versioned; incompatible or corrupt data falls back to a fresh demo seed.
 */
export const STORAGE_KEY = 'kf-ppc-data';
export const SCHEMA_VERSION = 7;

const REQUIRED_ARRAYS = ['plants', 'lines', 'efficiencyLevels', 'shifts', 'calendars', 'calendarExceptions', 'workforce', 'buyers', 'styles', 'people', 'templates', 'milestoneTypes', 'orders', 'allocations', 'milestones', 'outputs', 'notifications', 'audit'];

export function isValidData(data) {
  return !!data && typeof data === 'object' && REQUIRED_ARRAYS.every((k) => Array.isArray(data[k])) && typeof data.settings === 'object' && data.settings !== null;
}

/** Upgrade older payloads where possible. Returns null when the data cannot be recovered. */
function migrate(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { version, data } = payload;
  if (version === SCHEMA_VERSION) return isValidData(data) ? data : null;
  // v3 stored leaders; v4 introduced the efficiency ladder; v5–v7 ship the smaller demo set. Older data is reseeded.
  return null;
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: null, status: 'empty' };
    const data = migrate(JSON.parse(raw));
    return data ? { data, status: 'ok' } : { data: null, status: 'incompatible' };
  } catch (err) {
    console.warn('Stored data could not be read; reseeding demo data.', err);
    return { data: null, status: 'corrupt' };
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, savedAt: new Date().toISOString(), data }));
    return true;
  } catch (err) {
    console.error('Failed to save to localStorage', err);
    return false;
  }
}

export function clearData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function storageSizeKb() {
  try {
    return Math.round(((localStorage.getItem(STORAGE_KEY) || '').length * 2) / 1024);
  } catch {
    return 0;
  }
}
