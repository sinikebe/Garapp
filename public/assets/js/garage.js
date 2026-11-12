/** Local garage format, preserving source material and independently editable records. */
import { isAmount, sumAmounts, cents } from './amounts.js';
import { COMPONENT_KINDS, COMPONENT_ZONES, COMPONENT_SIDES } from './component-catalog.js';
import { validateVisualDocument } from './vehicle-visual.js';
import { validateComponentLayout } from './component-layout.js';
import { validateInsuranceContract, validateInsurancePayment } from './insurance-schema.js';
import { DEPLOYMENT, deploymentStoragePath } from './deployment-config.js';
export const VERSION = 2;
export const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const TYPES = Object.freeze({ revision: 'Révision', entretien: 'Entretien', reparation: 'Réparation', controle: 'Contrôle', acquisition: 'Acquisition / cession', registration: 'Mise en circulation', plan: 'Programme d’entretien', reading: 'Relevé kilométrique', fuel: 'Carburant', insurance: 'Assurance', other: 'Autre événement', unclassified: 'Non classé' });
export const LINE_TYPES = Object.freeze({ part: 'Pièce / consommable', labor: 'Main-d’œuvre', service: 'Prestation / contrôle', bundle: 'Forfait', fee: 'Frais', other: 'Autre', unclassified: 'Non classé' });
export const EFFECTS = Object.freeze({ none: 'Sans effet sur le suivi', replace: 'Remplacement / renouvellement', inspect: 'Contrôle', service: 'Entretien sans remplacement' });
export const ADMIN_TYPES = new Set(['acquisition', 'registration', 'plan', 'reading']);
export const isMaintenanceRecord = (record) => !ADMIN_TYPES.has(record.type) && !['fuel', 'insurance'].includes(record.type);
export const typeLabel = (type) => Object.hasOwn(TYPES, type) ? TYPES[type] : type;
export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const chronological = (records) => [...records].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.odometer ?? -1) - (a.odometer ?? -1));
/** Read both historical single links and grouped lines without dropping either association. */
export const lineComponentIds = (line) => [...new Set([line.componentId, ...(Array.isArray(line.componentIds) ? line.componentIds : [])].filter(Boolean))];
export const associatedComponentIds = (record) => [...new Set([...(record.componentIds ?? []), ...(record.observedComponentIds ?? []), ...(record.lines ?? []).flatMap(lineComponentIds)])];
export const replacementComponentIds = (record) => [...new Set([...(record.componentIds ?? []), ...(record.lines ?? []).filter((line) => line.effect === 'replace').flatMap(lineComponentIds)])];
export const componentHistory = (vehicle, id) => chronological(vehicle.records.filter((record) => associatedComponentIds(record).includes(id)));
export const replacementHistory = (vehicle, id) => chronological(vehicle.records.filter((record) => record.status !== 'planned' && record.type !== 'insurance' && replacementComponentIds(record).includes(id)));

/** A known invoice total remains authoritative even when its breakdown is incomplete. */
export function recordCost(record) {
  const lines = record.lines ?? [];
  const summary = [record.partsAmount, record.laborAmount];
  const values = lines.length ? lines.map((line) => line.amount) : summary;
  const incomplete = values.some((value) => value === null);
  const anyKnown = values.some((value) => value !== null);
  const subtotal = anyKnown ? sumAmounts(values) : null;
  const total = record.totalAmount ?? (!incomplete ? subtotal : null);
  const byKind = (kinds) => lines.length ? sumAmounts(lines.filter((line) => kinds.includes(line.kind)).map((line) => line.amount)) : null;
  return {
    total, subtotal, incomplete: total === null, breakdownIncomplete: incomplete,
    parts: lines.length ? byKind(['part']) : record.partsAmount,
    labor: lines.length ? byKind(['labor']) : record.laborAmount,
    other: lines.length ? byKind(['service', 'bundle', 'fee', 'other', 'unclassified']) : null,
  };
}
export const recordTotal = (record) => {
  const total = recordCost(record).total;
  return total === null ? null : Number(cents(total));
};
export const moneyInput = (text) => {
  const value = String(text).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const result = Math.round(Number(value) * 100);
  return Number.isSafeInteger(result) && result <= 100000000 ? result : null;
};

/** A missing replacement date or mileage is kept unknown rather than inferred. */
export function componentLife(vehicle, component, date = today()) {
  const replacements = replacementHistory(vehicle, component.id);
  const last = replacements.find((record) => !record.date) ?? replacements[0];
  if (!last || (!component.intervalKm && !component.intervalMonths)) return { status: 'unknown', percent: null, last, km: null, months: null };
  const usages = [];
  let km = null;
  let months = null;
  let missing = false;
  if (component.intervalKm) {
    if (vehicle.odometer == null || last.odometer == null || vehicle.odometer < last.odometer) missing = true;
    else {
      const distance = vehicle.odometer - last.odometer;
      usages.push(distance / component.intervalKm);
      km = Math.max(0, component.intervalKm - distance);
    }
  }
  if (component.intervalMonths) {
    if (!last.date || last.date > date) missing = true;
    else {
      const start = new Date(`${last.date}T12:00:00Z`);
      const end = new Date(start);
      const day = start.getUTCDate();
      end.setUTCDate(1);
      end.setUTCMonth(end.getUTCMonth() + component.intervalMonths);
      end.setUTCDate(Math.min(day, new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()));
      const now = new Date(`${date}T12:00:00Z`);
      usages.push((now - start) / (end - start));
      months = now >= end ? 0 : (end.getUTCFullYear() - now.getUTCFullYear()) * 12 + end.getUTCMonth() - now.getUTCMonth() + (end.getUTCDate() > now.getUTCDate() ? 1 : 0);
    }
  }
  if (!usages.length || (missing && Math.max(...usages) < 1)) return { status: 'unknown', percent: null, last, km, months };
  const remaining = 1 - Math.max(...usages);
  return { last, percent: Math.round(Math.max(0, remaining) * 100), status: remaining <= 0 ? 'due' : remaining <= .25 ? 'soon' : 'ok', km, months };
}

export function vehicleStats(vehicle, year = today().slice(0, 4), scope = 'maintenance') {
  const records = vehicle.records.filter((record) => record.status !== 'planned' && (scope === 'all' || isMaintenanceRecord(record)) && (String(year) === 'all' || record.date?.startsWith(String(year)) || (year === 'undated' && !record.date)));
  const costs = records.map(recordCost);
  const amount = sumAmounts(costs.map((cost) => cost.total ?? cost.subtotal));
  const partsAmount = sumAmounts(costs.map((cost) => cost.parts));
  const laborAmount = sumAmounts(costs.map((cost) => cost.labor));
  const otherAmount = sumAmounts(costs.map((cost) => cost.other));
  return {
    count: records.length, amount, partsAmount, laborAmount, otherAmount,
    total: Number(cents(amount)), parts: Number(cents(partsAmount)), labor: Number(cents(laborAmount)),
    incomplete: costs.filter((cost) => cost.incomplete).length,
    breakdownIncomplete: costs.filter((cost) => cost.breakdownIncomplete).length,
    categories: [...new Set(records.map((record) => record.type))].map((type) => {
      const value = sumAmounts(records.filter((record) => record.type === type).map((record) => { const cost = recordCost(record); return cost.total ?? cost.subtotal; }));
      return { type, amount: value, total: Number(cents(value)) };
    }),
  };
}

const validId = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 1000000) => typeof value === 'string' && value.length <= max;
const label = (value) => text(value, 2000) && value.trim().length > 0;
const integer = (value, max = 5000000) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const nullableInteger = (value, max) => value === null || integer(value, max);
const validDate = (value) => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value);
export const isTimestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = (message = 'Cette sauvegarde Garapp est invalide ou incompatible.') => { throw Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };

/** Embedded documents survive offline exports; remote URLs belong in metadata or links. */
export function validateDocument(document) {
  check(object(document) && validId(document.id) && label(document.name) && text(document.mimeType, 200));
  check(typeof document.dataUrl === 'string', 'Un document doit contenir son fichier dans dataUrl, et pas seulement un lien externe.');
  const separator = document.dataUrl.indexOf(',');
  const prefix = document.dataUrl.slice(0, separator);
  check(/^data:[\w.+-]+\/[\w.+-]+;base64$/i.test(prefix) && prefix.slice(5, -7).toLowerCase() === document.mimeType.toLowerCase(), 'Le type d’un document est incohérent.');
  const data = document.dataUrl.slice(separator + 1);
  check(data.length <= Math.ceil(MAX_DOCUMENT_BYTES / 3) * 4 && data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(data), 'Le contenu encodé d’un document est invalide.');
  const size = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  check(size <= MAX_DOCUMENT_BYTES, 'Un document dépasse la limite de 64 Mio.');
  if (document.size !== undefined) check(document.size === size, 'La taille d’un document ne correspond pas à son contenu.');
  if (document.description !== undefined) check(text(document.description));
  return { ...document, size, description: document.description ?? '' };
}

function documents(value = []) {
  check(Array.isArray(value) && value.length <= 1000);
  const ids = new Set();
  return value.map((entry) => { const doc = validateDocument(entry); check(!ids.has(doc.id), 'Deux documents partagent le même identifiant.'); ids.add(doc.id); return doc; });
}
function notes(entity) {
  check(text(entity.notes ?? '') && text(entity.content ?? ''));
  return { notes: entity.notes ?? '', content: entity.content ?? '', documents: documents(entity.documents) };
}
function uniqueId(entity, ids) {
  check(object(entity) && validId(entity.id) && !ids.has(entity.id), 'Un identifiant est absent, invalide ou dupliqué.');
  ids.add(entity.id);
}

/** Upgrade the original cent-based format without overwriting unknown source fields. */
export function migrateGarage(data) {
  if (data.version === 2) return data;
  check(data.version === 1);
  check(Array.isArray(data.vehicles));
  return { ...data, version: 2, vehicles: data.vehicles.map((vehicle) => {
    check(object(vehicle) && Array.isArray(vehicle.records));
    return { ...vehicle, records: vehicle.records.map((record) => {
    check(object(record));
    check(integer(record.partsCents, 100000000) && integer(record.laborCents, 100000000));
    return { ...record, partsAmount: record.partsAmount ?? (record.partsCents / 100).toFixed(2), laborAmount: record.laborAmount ?? (record.laborCents / 100).toFixed(2), totalAmount: record.totalAmount ?? null, lines: record.lines ?? [], status: record.status ?? 'done' };
  }) }; }) };
}

/** Validate known fields and preserve every additional JSON field at every level. */
export function parseGarage(raw) {
  check(typeof raw === 'string' && raw.length <= MAX_BACKUP_BYTES, 'La sauvegarde dépasse la limite de 512 Mio.');
  let input;
  try { input = JSON.parse(raw); } catch { fail('Le fichier ne contient pas un JSON valide.'); }
  check(object(input) && [1, 2].includes(input.version), 'Version de sauvegarde inconnue. Aucun contenu n’a été importé.');
  const data = migrateGarage(input);
  check(Array.isArray(data.vehicles) && data.vehicles.length <= 100);
  const ids = new Set();
  const vehicles = data.vehicles.map((vehicle) => {
    uniqueId(vehicle, ids);
    check(label(vehicle.name) && text(vehicle.engine ?? '', 2000) && nullableInteger(vehicle.year ?? null, 2100) && (vehicle.year == null || vehicle.year >= 1900) && nullableInteger(vehicle.odometer ?? null));
    check(validDate(vehicle.odometerDate ?? null));
    check(vehicle.example === undefined || typeof vehicle.example === 'boolean');
    check(vehicle.insurances === undefined || Array.isArray(vehicle.insurances) && vehicle.insurances.length <= 100, 'Un véhicule peut contenir au plus 100 contrats d’assurance.');
    const insuranceIds = new Set(), insurancePeriods = new Set();
    const insurances = (vehicle.insurances ?? []).map((contract) => {
      uniqueId(contract, insuranceIds);
      return { ...validateInsuranceContract(contract), ...notes(contract) };
    });
    if (vehicle.componentLayout !== undefined) validateComponentLayout(vehicle.componentLayout);
    check(Array.isArray(vehicle.components) && vehicle.components.length <= 10000 && Array.isArray(vehicle.records) && vehicle.records.length <= 20000);
    const trash = vehicle.trashedRecords === undefined ? [] : vehicle.trashedRecords;
    check(Array.isArray(trash) && vehicle.records.length + trash.length <= 20000, 'Un véhicule peut contenir au plus 20 000 fiches, corbeille comprise.');
    const componentIds = new Set();
    const components = vehicle.components.map((part) => {
      uniqueId(part, componentIds);
      check(label(part.name) && text(part.group ?? '', 2000) && text(part.description ?? ''));
      for (const [field, max] of [['intervalKm', 1000000], ['intervalMonths', 1200]]) check(part[field] == null || (integer(part[field], max) && part[field] > 0));
      if (part.spatial !== undefined) {
        check(object(part.spatial) && Object.hasOwn(COMPONENT_KINDS, part.spatial.kind ?? 'unknown') && Object.hasOwn(COMPONENT_ZONES, part.spatial.zone ?? 'unknown') && Object.hasOwn(COMPONENT_SIDES, part.spatial.side ?? 'unknown'), 'Le type ou l’emplacement 3D d’un composant est invalide.');
        check(part.spatial.presenceOrigin === undefined || ['manual', 'record'].includes(part.spatial.presenceOrigin), 'La provenance du composant dans la vue 3D est invalide.');
      }
      return { ...part, group: part.group ?? '', description: part.description ?? '', intervalKm: part.intervalKm ?? null, intervalMonths: part.intervalMonths ?? null, ...notes(part) };
    });
    const recordIds = new Set();
    const readRecord = (record) => {
      uniqueId(record, recordIds);
      check(label(record.title) && validDate(record.date ?? null) && nullableInteger(record.odometer ?? null));
      const type = record.type ?? 'unclassified';
      const status = record.status ?? 'done';
      check(label(type) && ['done', 'planned', 'incomplete'].includes(status));
      validateInsurancePayment({ ...record, type }, insuranceIds, insurancePeriods);
      for (const field of ['partsAmount', 'laborAmount', 'totalAmount']) check(isAmount(record[field] ?? null), 'Les montants sont des chaînes décimales en euros, ou null si inconnus.');
      const replaced = record.componentIds ?? [];
      check(Array.isArray(replaced) && replaced.every((id) => componentIds.has(id)) && new Set(replaced).size === replaced.length, 'Un remplacement pointe vers un composant absent ou dupliqué.');
      if (record.observedComponentIds !== undefined) check(Array.isArray(record.observedComponentIds) && record.observedComponentIds.every((id) => componentIds.has(id)) && new Set(record.observedComponentIds).size === record.observedComponentIds.length, 'Une observation pointe vers un composant absent ou dupliqué.');
      const lineIds = new Set();
      check(Array.isArray(record.lines ?? []) && (record.lines?.length ?? 0) <= 10000);
      const lines = (record.lines ?? []).map((line) => {
        uniqueId(line, lineIds);
        check(label(line.label) && text(line.description ?? '') && isAmount(line.amount ?? null));
        const kind = line.kind ?? 'unclassified';
        const effect = line.effect ?? 'none';
        const componentId = line.componentId ?? null;
        check(Object.hasOwn(LINE_TYPES, kind) && Object.hasOwn(EFFECTS, effect) && (componentId === null || componentIds.has(componentId)), 'Une ligne comporte un type ou un lien de composant invalide.');
        if (line.componentIds !== undefined) check(Array.isArray(line.componentIds) && line.componentIds.length <= 10000 && line.componentIds.every((id) => componentIds.has(id)) && new Set(line.componentIds).size === line.componentIds.length, 'Une ligne pointe vers un composant absent ou dupliqué.');
        const linked = lineComponentIds(line);
        check(effect !== 'replace' || linked.length > 0, 'Un remplacement doit être lié à un composant.');
        return { ...line, kind, effect, componentId: linked[0] ?? null, ...(line.componentIds === undefined ? {} : { componentIds: linked }), amount: line.amount ?? null, description: line.description ?? '', ...notes(line) };
      });
      let fuel;
      if (record.fuel !== undefined) {
        check(object(record.fuel), 'Les informations de carburant doivent être un objet.');
        const litres = record.fuel.litres ?? null, fullTank = record.fuel.fullTank ?? null;
        check(isAmount(litres) && (litres === null || Number(litres) > 0 && Number(litres) <= 10000), 'La quantité de carburant doit être une chaîne décimale positive en litres (au plus 10 000), ou null.');
        check(fullTank === null || typeof fullTank === 'boolean', 'L’indication de plein complet doit être vraie, fausse ou inconnue.');
        fuel = { ...record.fuel, litres, fullTank };
      }
      return { ...record, type, status, date: record.date ?? null, odometer: record.odometer ?? null, partsAmount: record.partsAmount ?? null, laborAmount: record.laborAmount ?? null, totalAmount: record.totalAmount ?? null, componentIds: [...replaced], lines, ...(fuel === undefined ? {} : { fuel }), ...notes(record) };
    };
    const records = vehicle.records.map(readRecord);
    const trashedRecords = trash.map((entry) => {
      check(object(entry) && isTimestamp(entry.deletedAt) && (entry.position === undefined || integer(entry.position, 20000)), 'Une fiche de la corbeille comporte une date de suppression ou une position invalide.');
      return { ...entry, record: readRecord(entry.record) };
    });
    const common = notes(vehicle);
    if (vehicle.coverDocumentId != null) {
      check(validId(vehicle.coverDocumentId), 'Le visuel du véhicule doit désigner un document intégré.');
      const cover = common.documents.find((document) => document.id === vehicle.coverDocumentId);
      check(cover, 'Le fichier du visuel du véhicule est absent de ses documents.');
      validateVisualDocument(cover);
    }
    return { ...vehicle, engine: vehicle.engine ?? '', year: vehicle.year ?? null, odometer: vehicle.odometer ?? null, odometerDate: vehicle.odometerDate ?? null, example: vehicle.example === true, components, records, ...(vehicle.insurances === undefined ? {} : { insurances }), ...(vehicle.trashedRecords === undefined ? {} : { trashedRecords }), ...common };
  });
  check(data.documents === undefined || Array.isArray(data.documents));
  check(data.activeId == null || ids.has(data.activeId), 'Le véhicule actif est absent de la sauvegarde.');
  return { ...data, version: 2, vehicles, documents: documents(data.documents), activeId: ids.has(data.activeId) ? data.activeId : vehicles[0]?.id ?? null };
}

/** Counts are shown before import and include documents attached to individual lines. */
export function inventory(garage) {
  const result = { vehicles: garage.vehicles.length, records: 0, trashedRecords: 0, insurances: 0, components: 0, lines: 0, documents: 0, bytes: 0 };
  const count = (docs) => { for (const doc of docs ?? []) { result.documents++; result.bytes += doc.size ?? 0; } };
  count(garage.documents);
  for (const vehicle of garage.vehicles) {
    count(vehicle.documents); result.components += vehicle.components.length; result.records += vehicle.records.length;
    const trashed = (vehicle.trashedRecords ?? []).map((entry) => entry.record);
    result.trashedRecords += trashed.length;
    for (const component of vehicle.components) count(component.documents);
    result.insurances += vehicle.insurances?.length ?? 0;
    for (const contract of vehicle.insurances ?? []) count(contract.documents);
    for (const record of [...vehicle.records, ...trashed]) { count(record.documents); result.lines += record.lines.length; for (const line of record.lines) count(line.documents); }
  }
  return result;
}

/** The original storage key remains stable so earlier local garages can be recovered. */
export const storageKey = (base, config = DEPLOYMENT) => `garapp.workspace.v1:${deploymentStoragePath(base, config)}`;

/** Entirely fictional records for exploring the interface. */
export function exampleGarage(date = today()) {
  const ago = (months) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(6); value.setUTCMonth(value.getUTCMonth() - months); return value.toISOString().slice(0, 10); };
  return parseGarage(JSON.stringify({ version: 2, activeId: 'example-car', vehicles: [{
    id: 'example-car', name: 'Renault Captur', year: 2014, engine: '1.5 dCi 90', odometer: 128400, example: true,
    components: [
      { id: 'oil', name: 'Huile moteur', group: 'Moteur', intervalKm: 15000, intervalMonths: 12 },
      { id: 'cabin', name: 'Filtre habitacle', group: 'Habitacle', intervalKm: 20000, intervalMonths: 12 },
      { id: 'brakes', name: 'Plaquettes avant', group: 'Freinage', intervalKm: 35000 },
      { id: 'tires', name: 'Pneus avant', group: 'Liaison au sol', intervalKm: 40000, intervalMonths: 60 },
      { id: 'battery', name: 'Batterie', group: 'Électricité', intervalMonths: 48 },
      { id: 'belt', name: 'Kit de distribution', group: 'Moteur', intervalKm: 120000, intervalMonths: 72 },
    ],
    records: [
      { id: 'check', title: 'Contrôle technique', type: 'controle', date: ago(1), odometer: 127350, partsAmount: '0', laborAmount: '79', notes: 'Exemple fictif de contrôle périodique.' },
      { id: 'pads', title: 'Remplacement des plaquettes avant', type: 'reparation', date: ago(3), odometer: 125200, partsAmount: '117', laborAmount: '130', componentIds: ['brakes'] },
      { id: 'service', title: 'Révision et vidange', type: 'revision', date: ago(8), odometer: 116000, componentIds: [], lines: [
        { id: 'oil-line', label: 'Huile moteur et filtre', kind: 'part', amount: '65.125', componentId: 'oil', effect: 'replace', description: 'Montant fictif conservé avec sa précision d’origine.' },
        { id: 'cabin-line', label: 'Filtre habitacle', kind: 'part', amount: '33.875', componentId: 'cabin', effect: 'replace' },
        { id: 'labor-line', label: 'Vidange et contrôles', kind: 'labor', amount: '90' },
      ] },
      { id: 'wheels', title: 'Deux pneus avant', type: 'entretien', date: ago(20), odometer: 100200, partsAmount: '218', laborAmount: '50', componentIds: ['tires'] },
      { id: 'power', title: 'Remplacement de la batterie', type: 'reparation', date: ago(43), odometer: 81200, partsAmount: '135', laborAmount: '30', componentIds: ['battery'] },
      { id: 'timing', title: 'Remplacement du kit de distribution', type: 'entretien', date: ago(60), odometer: 67000, partsAmount: '320', laborAmount: '300', componentIds: ['belt'] },
    ],
  }] }));
}
