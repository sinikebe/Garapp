/** Local UI context only. No route, filter or business value is sent to another app. */
import { DEPLOYMENT, deploymentStoragePath } from './deployment-config.js';
export const SECTIONS = Object.freeze(['garage', 'interventions', 'composants', 'assurance', 'depenses', 'statistiques']);
export const navigationKey = (base, config = DEPLOYMENT) => `garapp.navigation.v1:${deploymentStoragePath(base, config)}`;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value) => /^[\w-]{1,128}$/.test(value);
export const defaultFilters = (year) => ({ recordSearch: '', recordType: 'all', componentSearch: '', componentStatus: 'all', componentView: 'exploded', expenseYear: String(year), expenseScope: 'maintenance', insuranceYear: String(year), statisticsPeriod: 'all', statisticsScope: 'maintenance' });

export function normalizeFilters(value, year) {
  const defaults = defaultFilters(year);
  if (!object(value)) return defaults;
  const query = (field) => typeof value[field] === 'string' ? value[field].slice(0, 256) : defaults[field];
  return {
    recordSearch: query('recordSearch'),
    recordType: typeof value.recordType === 'string' && value.recordType.length > 0 && value.recordType.length <= 2000 ? value.recordType : 'all',
    componentSearch: query('componentSearch'),
    componentStatus: ['all', 'attention', 'ok', 'unknown'].includes(value.componentStatus) ? value.componentStatus : 'all',
    componentView: value.componentView === 'list' ? 'list' : 'exploded',
    expenseYear: ['all', 'undated'].includes(value.expenseYear) || /^(?:19|20|21)\d{2}$/.test(value.expenseYear) ? String(value.expenseYear) : defaults.expenseYear,
    expenseScope: value.expenseScope === 'all' ? 'all' : 'maintenance',
    insuranceYear: /^(?:19|20|21)\d{2}$/.test(value.insuranceYear) ? String(value.insuranceYear) : defaults.insuranceYear,
    statisticsPeriod: ['all', '12m', '36m'].includes(value.statisticsPeriod) ? value.statisticsPeriod : 'all',
    statisticsScope: value.statisticsScope === 'all' ? 'all' : 'maintenance',
  };
}

export function normalizeNavigation(value, year) {
  const source = object(value) ? value : {};
  const filters = object(source.filters) ? Object.fromEntries(Object.entries(source.filters).filter(([id]) => validId(id)).slice(0, 100).map(([id, entry]) => [id, normalizeFilters(entry, year)])) : {};
  Object.setPrototypeOf(filters, null);
  return { version: 1, section: SECTIONS.includes(source.section) ? source.section : 'garage', filters };
}

export function readNavigation(storage, key, year) {
  try { return normalizeNavigation(JSON.parse(storage.getItem(key)), year); }
  catch { return normalizeNavigation(null, year); }
}

export function writeNavigation(storage, key, state) {
  try { storage.setItem(key, JSON.stringify(state)); return true; }
  catch { return false; }
}

/** Explicit valid sections win; invalid fragments never reopen a stale view. */
export function resolveSection(hash, saved = 'garage') {
  const explicit = hash.replace(/^#/, '');
  if (SECTIONS.includes(explicit)) return explicit;
  return explicit ? 'garage' : SECTIONS.includes(saved) ? saved : 'garage';
}
