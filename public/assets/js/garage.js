/** Vehicle records and maintenance reference points, independent of presentation. */
export const TYPES = Object.freeze({ revision: 'Révision', entretien: 'Entretien', reparation: 'Réparation', controle: 'Contrôle' });
export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const recordTotal = (record) => record.partsCents + record.laborCents;
export const chronological = (records) => [...records].sort((a, b) => b.date.localeCompare(a.date) || b.odometer - a.odometer);
export const componentHistory = (vehicle, id) => chronological(vehicle.records.filter((record) => record.componentIds.includes(id)));
export const moneyInput = (text) => {
  const value = String(text).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents <= 100000000 ? cents : null;
};

/** Remaining usage is an editable planning reference, never a diagnosis. */
export function componentLife(vehicle, component, date = today()) {
  const last = componentHistory(vehicle, component.id)[0];
  if (!last || (!component.intervalKm && !component.intervalMonths)) return { status: 'unknown', percent: null, last };
  const days = Math.max(0, (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${last.date}T12:00:00Z`)) / 86400000);
  const distance = Math.max(0, vehicle.odometer - last.odometer);
  const usages = [];
  let months = null;
  if (component.intervalKm) usages.push(distance / component.intervalKm);
  if (component.intervalMonths) {
    const start = new Date(`${last.date}T12:00:00Z`);
    const end = new Date(start);
    const day = start.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + component.intervalMonths);
    const endOfMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(day, endOfMonth));
    const now = new Date(`${date}T12:00:00Z`);
    usages.push(days / ((end - start) / 86400000));
    months = now >= end ? 0 : (end.getUTCFullYear() - now.getUTCFullYear()) * 12
      + end.getUTCMonth() - now.getUTCMonth() + (end.getUTCDate() > now.getUTCDate() ? 1 : 0);
  }
  const remaining = 1 - Math.max(...usages);
  return {
    last, percent: Math.round(Math.max(0, remaining) * 100),
    status: remaining <= 0 ? 'due' : remaining <= .25 ? 'soon' : 'ok',
    km: component.intervalKm ? Math.max(0, component.intervalKm - distance) : null,
    months,
  };
}

export function vehicleStats(vehicle, year = today().slice(0, 4)) {
  const records = vehicle.records.filter((record) => String(year) === 'all' || record.date.startsWith(String(year)));
  return {
    count: records.length,
    total: records.reduce((sum, record) => sum + recordTotal(record), 0),
    parts: records.reduce((sum, record) => sum + record.partsCents, 0),
    labor: records.reduce((sum, record) => sum + record.laborCents, 0),
    categories: Object.keys(TYPES).map((type) => ({ type, total: records.filter((record) => record.type === type).reduce((sum, record) => sum + recordTotal(record), 0) })),
  };
}

/** A fictional garage, with relative dates so the interface remains explorable. */
export function exampleGarage(date = today()) {
  const ago = (months) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(6);
    value.setUTCMonth(value.getUTCMonth() - months);
    return value.toISOString().slice(0, 10);
  };
  return { version: 1, activeId: 'example-captur', vehicles: [{
    id: 'example-captur', name: 'Renault Captur', year: 2014, engine: '1.5 dCi 90', odometer: 128400, example: true,
    components: [
      { id: 'oil', name: 'Huile moteur', group: 'Moteur', intervalKm: 15000, intervalMonths: 12 },
      { id: 'cabin', name: 'Filtre habitacle', group: 'Habitacle', intervalKm: 20000, intervalMonths: 12 },
      { id: 'brakes', name: 'Plaquettes avant', group: 'Freinage', intervalKm: 35000, intervalMonths: null },
      { id: 'tires', name: 'Pneus avant', group: 'Liaison au sol', intervalKm: 40000, intervalMonths: 60 },
      { id: 'battery', name: 'Batterie', group: 'Électricité', intervalKm: null, intervalMonths: 48 },
      { id: 'belt', name: 'Kit de distribution', group: 'Moteur', intervalKm: 120000, intervalMonths: 72 },
    ],
    records: [
      { id: 'check', title: 'Contrôle technique', type: 'controle', date: ago(1), odometer: 127350, partsCents: 0, laborCents: 7900, componentIds: [], notes: 'Exemple fictif de contrôle périodique.' },
      { id: 'pads', title: 'Remplacement des plaquettes avant', type: 'reparation', date: ago(3), odometer: 125200, partsCents: 11700, laborCents: 13000, componentIds: ['brakes'], notes: 'Remplacement du jeu de plaquettes avant.' },
      { id: 'service', title: 'Révision et vidange', type: 'revision', date: ago(8), odometer: 116000, partsCents: 9900, laborCents: 9000, componentIds: ['oil', 'cabin'], notes: 'Vidange moteur et renouvellement du filtre habitacle.' },
      { id: 'wheels', title: 'Deux pneus avant', type: 'entretien', date: ago(20), odometer: 100200, partsCents: 21800, laborCents: 5000, componentIds: ['tires'], notes: 'Montage et équilibrage inclus dans la main-d’œuvre.' },
      { id: 'power', title: 'Remplacement de la batterie', type: 'reparation', date: ago(43), odometer: 81200, partsCents: 13500, laborCents: 3000, componentIds: ['battery'], notes: '' },
      { id: 'timing', title: 'Remplacement du kit de distribution', type: 'entretien', date: ago(60), odometer: 67000, partsCents: 32000, laborCents: 30000, componentIds: ['belt'], notes: '' },
    ],
  }] };
}

/** Validate a bounded backup before replacing any open data. */
export function parseGarage(text) {
  if (typeof text !== 'string' || text.length > 2000000) throw Error('La sauvegarde dépasse la taille autorisée.');
  const data = JSON.parse(text);
  const fail = () => { throw Error('Cette sauvegarde Garapp est invalide ou incompatible.'); };
  const label = (value, max = 160) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const id = (value) => typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
  const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  const nullableInterval = (value, max) => value === null || (integer(value, max) && value > 0);
  if (!data || data.version !== 1 || !Array.isArray(data.vehicles) || data.vehicles.length > 30) fail();
  const ids = new Set();
  const vehicles = data.vehicles.map((vehicle) => {
    if (!vehicle || !id(vehicle.id) || ids.has(vehicle.id) || !label(vehicle.name) || !label(vehicle.engine) || !integer(vehicle.year, 2100) || vehicle.year < 1900 || !integer(vehicle.odometer, 5000000)) fail();
    ids.add(vehicle.id);
    if (!Array.isArray(vehicle.components) || vehicle.components.length > 200 || !Array.isArray(vehicle.records) || vehicle.records.length > 2000) fail();
    const partIds = new Set();
    const components = vehicle.components.map((part) => {
      if (!part || !id(part.id) || partIds.has(part.id) || !label(part.name) || !label(part.group) || !nullableInterval(part.intervalKm, 1000000) || !nullableInterval(part.intervalMonths, 600)) fail();
      partIds.add(part.id);
      return { id: part.id, name: part.name.trim(), group: part.group.trim(), intervalKm: part.intervalKm, intervalMonths: part.intervalMonths };
    });
    const recordIds = new Set();
    const records = vehicle.records.map((record) => {
      if (!record || !id(record.id) || recordIds.has(record.id) || !label(record.title) || !Object.hasOwn(TYPES, record.type) || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !Number.isFinite(Date.parse(`${record.date}T12:00:00Z`)) || new Date(`${record.date}T12:00:00Z`).toISOString().slice(0, 10) !== record.date || !integer(record.odometer, vehicle.odometer) || !integer(record.partsCents, 100000000) || !integer(record.laborCents, 100000000) || typeof record.notes !== 'string' || record.notes.length > 2000 || !Array.isArray(record.componentIds) || record.componentIds.length > 200 || record.componentIds.some((one) => !partIds.has(one)) || new Set(record.componentIds).size !== record.componentIds.length) fail();
      recordIds.add(record.id);
      return { id: record.id, title: record.title.trim(), type: record.type, date: record.date, odometer: record.odometer, partsCents: record.partsCents, laborCents: record.laborCents, notes: record.notes, componentIds: [...record.componentIds] };
    });
    return { id: vehicle.id, name: vehicle.name.trim(), year: vehicle.year, engine: vehicle.engine.trim(), odometer: vehicle.odometer, example: vehicle.example === true, components, records };
  });
  return { version: 1, vehicles, activeId: ids.has(data.activeId) ? data.activeId : vehicles[0]?.id ?? null };
}

export function storageKey(base) {
  return `garapp.workspace.v1:${new URL('./', base).pathname}`;
}
