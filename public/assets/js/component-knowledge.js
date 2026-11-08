import { associatedComponentIds, today, uid } from './garage.js';
import { componentSpatial, compatibleKind, detectComponents, matchingComponents, possibleComponents, mergeSpatial } from './component-catalog.js';

const explicitMatches = (components, candidate, linked) => components.filter((part) => {
  const spatial = componentSpatial(part), desired = candidate.spatial;
  return linked.has(part.id) && compatibleKind(spatial.kind, desired.kind) && (desired.zone === 'unknown' || spatial.zone === 'unknown' || spatial.zone === desired.zone) && (desired.side === 'unknown' || spatial.side === 'unknown' || spatial.side === desired.side);
});

const actual = (record, date) => record.status !== 'planned' && (!record.date || record.date <= date);
export function recordDiscoveries(record) {
  const byKey = new Map();
  for (const text of [record.title, ...(record.lines ?? []).filter((line) => !line.componentId).map((line) => line.label)]) {
    for (const candidate of detectComponents(text)) if (!byKey.has(candidate.key)) byKey.set(candidate.key, candidate);
  }
  return [...byKey.values()];
}

/** A read-only projection also covers older records with no explicit component links. */
export function knownComponents(vehicle, date = today()) {
  const evidence = new Map(vehicle.components.map((part) => [part.id, new Map()]));
  for (const record of vehicle.records.filter((record) => actual(record, date))) {
    for (const id of associatedComponentIds(record)) evidence.get(id)?.set(record.id, record);
  }
  const rows = vehicle.components.filter((part) => part.spatial?.presenceOrigin !== 'record' || evidence.get(part.id).size).map((part) => ({ ...part, spatial: componentSpatial(part), stored: true, sources: [...evidence.get(part.id).values()] }));
  for (const record of vehicle.records.filter((record) => actual(record, date))) {
    for (const candidate of recordDiscoveries(record)) {
      const matches = matchingComponents(rows, candidate);
      const linked = explicitMatches(rows,candidate,new Set(associatedComponentIds(record)));
      if (linked.length) { for (const row of linked) if (!row.sources.some((source)=>source.id===record.id)) row.sources.push(record); continue; }
      if (matches.length > 1 || !matches.length && possibleComponents(rows,candidate).length) continue;
      let row = matches.length === 1 ? matches[0] : rows.find((part) => !part.stored && part.key === candidate.key);
      if (!row) {
        row = { ...candidate, id: `detected-${candidate.key}`, stored: false, notes: '', content: '', documents: [], description: '', intervalKm: null, intervalMonths: null, sources: [] };
        while (rows.some((part) => part.id === row.id)) row.id += '-derived';
        rows.push(row);
      } else row.spatial = mergeSpatial(row.spatial, candidate.spatial);
      if (!row.sources.some((source) => source.id === record.id)) row.sources.push(record);
    }
  }
  return rows;
}

export function proposedDiscoveries(vehicle, record) {
  const linked = new Set(associatedComponentIds(record));
  return recordDiscoveries(record).map((candidate) => {
    const matches = matchingComponents(vehicle.components, candidate);
    const possible = possibleComponents(vehicle.components,candidate);
    return { ...candidate, matches: possible, targetId: matches.length === 1 ? matches[0].id : null, ambiguous: matches.length > 1 || !matches.length && possible.length > 0 };
  }).filter((candidate) => !explicitMatches(vehicle.components,candidate,linked).length);
}

/** Apply only the choices reviewed in the record editor; identifiers and source text stay stable. */
export function applyDiscoveries(vehicle, record, choices, newId = uid) {
  const components = structuredClone(vehicle.components), updated = structuredClone(record);
  updated.observedComponentIds = [...record.observedComponentIds ?? []];
  for (const choice of choices) {
    let part = choice.targetId ? components.find((part) => part.id === choice.targetId) : null;
    if (choice.targetId && !part) throw Error('Un composant choisi a changé. Vérifier la fiche avant de réessayer.');
    if (!part && !choice.forceNew) {
      const matches = matchingComponents(components, choice);
      if (matches.length === 1) part = matches[0];
    }
    if (!part) {
      part = { id: newId(), name: choice.name, group: choice.group, spatial: { ...choice.spatial, presenceOrigin: 'record' }, intervalKm: null, intervalMonths: null, notes: '', description: '', content: '', documents: [] };
      components.push(part);
    } else part.spatial = mergeSpatial(componentSpatial(part), choice.spatial);
    if (choice.effect === 'replace') updated.componentIds = [...new Set([...(updated.componentIds ?? []), part.id])];
    else updated.observedComponentIds = [...new Set([...updated.observedComponentIds, part.id])];
    if (choice.lineId) {
      const line = updated.lines.find((line) => line.id === choice.lineId);
      if (!line) throw Error('La ligne du composant est introuvable.');
      line.componentId = part.id;
    }
  }
  return { components, record: updated };
}
