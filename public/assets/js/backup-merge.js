/** Two-way backup comparison: preserve additions and require explicit conflict choices. */
import { lineComponentIds, parseGarage } from './garage.js';

const plans = new WeakMap();
const absent = Symbol('absent');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => value === absent ? absent : structuredClone(value);
const own = (value, key) => Object.hasOwn(value, key) ? value[key] : absent;
const literal = (value) => ({ type: 'literal', value });
const labels = {
  name: 'Nom', title: 'Intitulé', label: 'Libellé', description: 'Description', notes: 'Notes', content: 'Contenu',
  date: 'Date', year: 'Année', engine: 'Motorisation', odometer: 'Kilométrage', odometerDate: 'Date du relevé',
  type: 'Type', status: 'État', amount: 'Montant', partsAmount: 'Montant des pièces', laborAmount: 'Main-d’œuvre',
  totalAmount: 'Total du justificatif', kind: 'Nature', effect: 'Action sur les composants',
  componentIds: 'Composants remplacés', observedComponentIds: 'Composants observés',
  intervalKm: 'Intervalle kilométrique', intervalMonths: 'Intervalle en mois', group: 'Groupe',
  coverDocumentId: 'Visuel du véhicule', example: 'Véhicule de démonstration',
  litres: 'Quantité de carburant', fullTank: 'Plein complet', provider: 'Assureur', reference: 'Référence',
  firstDate: 'Première échéance', endDate: 'Fin du contrat', debitDay: 'Jour du prélèvement',
  tariffs: 'Tarifs', skippedPeriods: 'Échéances exclues', contractId: 'Contrat associé', period: 'Mois',
  deletedAt: 'Date de mise à la corbeille', position: 'Position précédente', spatial: 'Emplacement du composant',
  componentLayout: 'Disposition du véhicule', zone: 'Zone', side: 'Côté',
};
const collections = {
  garage: { vehicles: 'vehicle', documents: 'document' },
  vehicle: { components: 'component', insurances: 'insurance', documents: 'document' },
  record: { lines: 'line', documents: 'document' },
  component: { documents: 'document' }, insurance: { documents: 'document' }, line: { documents: 'document' },
};
const collectionNames = { vehicle: 'Véhicule', component: 'Composant', record: 'Fiche', line: 'Ligne', document: 'Document', insurance: 'Contrat d’assurance' };
const fieldLabel = (key) => Object.hasOwn(labels, key) ? labels[key] : key;

function equal(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equal(value, right[index]));
  if (!object(left) || !object(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

function entityLabel(role, entity) {
  const title = entity.name || entity.title || entity.label || (role === 'insurance' && (entity.provider || entity.reference)) || entity.id;
  return `${collectionNames[role]} « ${title} »`;
}

/** Inputs are detached from the caller; absence is an addition, never inferred deletion. */
export function compareGarages(local, incoming) {
  const left = parseGarage(JSON.stringify(local)), right = parseGarage(JSON.stringify(incoming));
  const differences = [];
  const change = (a, b, path, label, context, extra = {}) => {
    const localPresent = a !== absent, incomingPresent = b !== absent;
    const id = `difference-${differences.length + 1}`;
    const difference = { id, kind: !localPresent ? 'incoming-only' : !incomingPresent ? 'local-only' : 'changed',
      path: [...path], label, context: [...context], local: localPresent ? clone(a) : null,
      incoming: incomingPresent ? clone(b) : null, localPresent, incomingPresent,
      conflict: localPresent && incomingPresent, ...extra };
    if (path[0] === 'vehicles' && ['componentIds', 'observedComponentIds', 'coverDocumentId', 'contractId'].includes(path.at(-1))) {
      for (const [side, source, value] of [['Local', left, a], ['Incoming', right, b]]) {
        const vehicle = source.vehicles.find((entry) => entry.id === path[1]);
        const entities = path.at(-1) === 'coverDocumentId' ? vehicle?.documents : path.at(-1) === 'contractId' ? vehicle?.insurances : vehicle?.components;
        const name = (id) => {
          const entity = entities?.find((entry) => entry.id === id);
          return entity ? `${entity.name || entity.provider || entity.reference || id} [${id}]` : id;
        };
        if (value !== absent) difference[`display${side}`] = Array.isArray(value) ? value.map(name) : value === null ? null : name(value);
      }
    }
    differences.push(difference);
    return { type: 'choice', id, path: [...path], local: a, incoming: b, conflict: localPresent && incomingPresent };
  };

  const collection = (a, b, role, path, context) => {
    const leftMap = new Map((a === absent ? [] : a).map((entity) => [entity.id, entity]));
    const rightMap = new Map((b === absent ? [] : b).map((entity) => [entity.id, entity]));
    const ids = [...new Set([...leftMap.keys(), ...rightMap.keys()])];
    return { type: 'collection', present: a !== absent || b !== absent, items: ids.map((id) => {
      const localEntity = leftMap.has(id) ? leftMap.get(id) : absent;
      const incomingEntity = rightMap.has(id) ? rightMap.get(id) : absent;
      const entity = localEntity === absent ? incomingEntity : localEntity;
      const title = entityLabel(role, entity), entityPath = [...path, id];
      if (localEntity === absent || incomingEntity === absent) return change(localEntity, incomingEntity, entityPath, title, context, { entity: role });
      if (role === 'document') return equal(localEntity, incomingEntity) ? literal(localEntity) : change(localEntity, incomingEntity, entityPath, title, context, { entity: role });
      return visit(localEntity, incomingEntity, role, entityPath, [...context, title]);
    }) };
  };

  const recordSet = (a, b, path, context) => {
    const entries = (vehicle) => new Map([
      ...vehicle.records.map((record) => [record.id, { record, location: { state: 'active' } }]),
      ...(vehicle.trashedRecords ?? []).map(({ record, ...metadata }) => [record.id, { record, location: { state: 'trash', metadata } }]),
    ]);
    const leftMap = entries(a), rightMap = entries(b);
    return { type: 'records', trashPresent: Object.hasOwn(a, 'trashedRecords') || Object.hasOwn(b, 'trashedRecords'), items: [...new Set([...leftMap.keys(), ...rightMap.keys()])].map((id) => {
      const localEntry = leftMap.has(id) ? leftMap.get(id) : absent, incomingEntry = rightMap.has(id) ? rightMap.get(id) : absent;
      const entry = localEntry === absent ? incomingEntry : localEntry;
      const title = entityLabel('record', entry.record), recordPath = [...path, 'records', id];
      if (localEntry === absent || incomingEntry === absent) {
        const payment = entry.record.insurance;
        const node = change(localEntry, incomingEntry, recordPath, title, context, {
          entity: 'record', wrappedRecord: true,
          ...(payment ? { consequence: 'L’échéance exclue ne sera pas recréée automatiquement.' } : {}),
        });
        if (payment) node.excludedPayment = { vehicleId: path[1], contractId: payment.contractId, period: payment.period };
        return node;
      }
      const recordContext = [...context, title];
      const location = localEntry.location.state !== incomingEntry.location.state
        ? change(localEntry.location, incomingEntry.location, [...recordPath, '$location'], 'Classement de la fiche', recordContext, { lifecycle: true })
        : visit(localEntry.location, incomingEntry.location, 'location', [...recordPath, '$location'], recordContext);
      return { type: 'object', entries: [
        ['record', visit(localEntry.record, incomingEntry.record, 'record', recordPath, recordContext)], ['location', location],
      ] };
    }) };
  };

  const visit = (a, b, role, path, context) => {
    if (equal(a, b)) return literal(a);
    if (a === absent || b === absent || !object(a) || !object(b)) return change(a, b, path, fieldLabel(path.at(-1)), context);
    const entries = [];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (role === 'garage' && key === 'activeId') continue;
      if (role === 'vehicle' && ['records', 'trashedRecords'].includes(key)) continue;
      if (role === 'line' && ['componentId', 'componentIds'].includes(key)) continue;
      const av = own(a, key), bv = own(b, key), schema = collections[role];
      const childRole = schema && Object.hasOwn(schema, key) ? schema[key] : null;
      const node = childRole
        ? collection(av, bv, childRole, [...path, key], context)
        : visit(av, bv, 'field', [...path, key], object(av) && object(bv) && !equal(av, bv) ? [...context, fieldLabel(key)] : context);
      if (role === 'record' && key === 'status' && node.type === 'choice' && [av, bv].includes('planned') && (a.insurance?.generated || b.insurance?.generated)) {
        differences.find((difference) => difference.id === node.id).consequence = 'Si vous conservez l’état prévu, sa validation automatique sera désactivée.';
      }
      entries.push([key, node]);
    }
    if (role === 'line') {
      const av = lineComponentIds(a), bv = lineComponentIds(b);
      const links = equal(av, bv) ? literal({ componentId: a.componentId, ...(a.componentIds === undefined ? {} : { componentIds: a.componentIds }) }) : (() => {
        const node = change(av, bv, [...path, 'componentIds'], 'Composants liés', context, { componentLinks: true });
        node.local = { componentId: a.componentId, ...(a.componentIds === undefined ? {} : { componentIds: a.componentIds }) };
        node.incoming = { componentId: b.componentId, ...(b.componentIds === undefined ? {} : { componentIds: b.componentIds }) };
        return node;
      })();
      return { type: 'line', entries, links };
    }
    if (role === 'vehicle') return { type: 'vehicle', entries, records: recordSet(a, b, path, context) };
    return { type: 'object', entries };
  };

  const tree = visit(left, right, 'garage', [], ['Garage']);
  const counts = { localOnly: 0, incomingOnly: 0, changed: 0 };
  for (const difference of differences) counts[difference.kind === 'local-only' ? 'localOnly' : difference.kind === 'incoming-only' ? 'incomingOnly' : 'changed']++;
  const comparison = { differences, conflictCount: counts.changed, counts };
  plans.set(comparison, { tree, activeId: left.activeId, incomingActiveId: right.activeId });
  return comparison;
}

/** Rebuild and validate the complete model before the caller can persist a merge. */
export function mergeGarages(comparison, choices = {}) {
  const plan = plans.get(comparison);
  if (!plan) throw Error('Cette comparaison a expiré. Comparer à nouveau les sauvegardes.');
  if (!object(choices)) throw Error('Les choix de fusion sont invalides.');
  const explicit = new Map(), excludedPayments = [];
  const resolve = (node) => {
    if (node.type === 'literal') return clone(node.value);
    if (node.type === 'choice') {
      const selected = Object.hasOwn(choices, node.id) ? choices[node.id] : null;
      if (selected !== null && !['local', 'incoming'].includes(selected)) throw Error('Un choix de fusion est invalide.');
      if (node.conflict && !selected) throw Error('Choisir une valeur pour chaque différence avant de fusionner.');
      const value = node[selected ?? (node.local === absent ? 'incoming' : 'local')];
      if (selected) explicit.set(JSON.stringify(node.path), value);
      if (selected && value === absent && node.excludedPayment) excludedPayments.push(node.excludedPayment);
      return clone(value);
    }
    if (node.type === 'collection') return node.present ? node.items.map(resolve).filter((entry) => entry !== absent) : absent;
    if (node.type === 'records') {
      const records = [], trashedRecords = [];
      for (const entry of node.items.map(resolve)) {
        if (entry === absent) continue;
        if (entry.location.state === 'active') records.push(entry.record);
        else trashedRecords.push({ ...entry.location.metadata, record: entry.record });
      }
      return { records, ...(node.trashPresent || trashedRecords.length ? { trashedRecords } : {}) };
    }
    const result = Object.fromEntries(node.entries.map(([key, value]) => [key, resolve(value)]).filter(([, value]) => value !== absent));
    if (node.type === 'vehicle') return { ...result, ...resolve(node.records) };
    if (node.type === 'line') return { ...result, ...resolve(node.links) };
    return result;
  };
  const merged = resolve(plan.tree);
  for (const { vehicleId, contractId, period } of excludedPayments) {
    const vehicle = merged.vehicles.find((entry) => entry.id === vehicleId);
    const contract = vehicle?.insurances?.find((entry) => entry.id === contractId);
    if (!contract) continue;
    const records = [...vehicle.records, ...(vehicle.trashedRecords ?? []).map((entry) => entry.record)];
    if (records.some((record) => record.insurance?.contractId === contractId && record.insurance.period === period)) continue;
    contract.skippedPeriods = [...new Set([...(contract.skippedPeriods ?? []), period])];
  }
  for (const vehicle of merged.vehicles) for (const record of [...vehicle.records, ...(vehicle.trashedRecords ?? []).map((entry) => entry.record)]) {
    const path = ['vehicles', vehicle.id, 'records', record.id];
    if (explicit.get(JSON.stringify([...path, 'status'])) !== 'planned' || !record.insurance?.generated) continue;
    if (explicit.get(JSON.stringify([...path, 'insurance', 'autoStatus'])) === true) throw Error('Le choix « Prévu » contredit la validation automatique de cette échéance. Désactivez cette validation ou choisissez un autre état.');
    record.insurance.autoStatus = false;
  }
  merged.activeId = merged.vehicles.some((vehicle) => vehicle.id === plan.activeId) ? plan.activeId
    : merged.vehicles.some((vehicle) => vehicle.id === plan.incomingActiveId) ? plan.incomingActiveId : merged.vehicles[0]?.id ?? null;
  try { return parseGarage(JSON.stringify(merged)); }
  catch (error) { throw Error(`La fusion crée des données incompatibles. Vérifiez les composants, documents et contrats liés avant de confirmer. ${error.message}`, { cause: error }); }
}
