/** Generic component vocabulary. No vehicle model or default equipment is assumed. */
export const COMPONENT_KINDS = Object.freeze({
  unknown: 'Forme générique', engine: 'Moteur', battery: 'Batterie', belt: 'Courroie / distribution',
  braking: 'Freinage · type inconnu', drum: 'Tambour de frein', disc: 'Disque de frein', pads: 'Plaquettes de frein',
  tire: 'Pneu', wheel: 'Roue / jante', oilFilter: 'Filtre à huile', airFilter: 'Filtre à air', cabinFilter: 'Filtre habitacle', fuelFilter: 'Filtre à carburant',
  oil: 'Huile moteur', coolant: 'Liquide de refroidissement', shock: 'Amortisseur', exhaust: 'Échappement', clutch: 'Embrayage', gearbox: 'Boîte de vitesses', steering: 'Direction', wiper: 'Essuie-glace', sparkPlug: 'Bougie',
});
export const COMPONENT_ZONES = Object.freeze({ unknown: 'À placer', front: 'Avant', rear: 'Arrière', cabin: 'Habitacle', engineBay: 'Compartiment moteur · schématique', underbody: 'Dessous du véhicule' });
export const COMPONENT_SIDES = Object.freeze({ unknown: 'Côté non renseigné', left: 'Gauche', right: 'Droite', center: 'Centre' });
export const normalizeName = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

const rules = [
  ['oilFilter', /\bfiltres?\s+(?:a\s+|d\s+)?huile(?:\s+moteur)?\b/, 'Filtre à huile', 'Moteur'],
  ['airFilter', /\bfiltres?\s+(?:a\s+|d\s+)?air\b/, 'Filtre à air', 'Moteur'],
  ['cabinFilter', /\bfiltres?\s+(?:d\s+)?(?:habitacle|pollen)\b/, 'Filtre habitacle', 'Habitacle'],
  ['fuelFilter', /\bfiltres?\s+(?:a\s+|de\s+)?(?:gazole|gasoil|diesel|essence|carburant)\b/, 'Filtre à carburant', 'Moteur'],
  ['battery', /\bbatteries?\b/, 'Batterie', 'Électricité'],
  ['belt', /\b(?:kits?\s+(?:de\s+)?distribution|courroies?(?:\s+(?:de\s+)?distribution)?)\b/, 'Courroie / distribution', 'Moteur'],
  ['drum', /\btambours?(?:\s+de\s+freins?)?\b/, 'Tambours', 'Freinage'],
  ['disc', /\bdisques?(?:\s+de\s+freins?)?\b/, 'Disques', 'Freinage'],
  ['pads', /\bplaquettes?(?:\s+de\s+freins?)?\b/, 'Plaquettes', 'Freinage'],
  ['tire', /\bpneus?\b|\bpneumatiques?\b/, 'Pneus', 'Liaison au sol'],
  ['wheel', /\b(?:roues?|jantes?)\b/, 'Roues / jantes', 'Liaison au sol'],
  ['oil', /\bhuile\s+moteur\b/, 'Huile moteur', 'Moteur'],
  ['coolant', /\bliquide\s+de\s+refroidissement\b/, 'Liquide de refroidissement', 'Moteur'],
  ['shock', /\bamortisseurs?\b/, 'Amortisseurs', 'Liaison au sol'],
  ['exhaust', /\b(?:pot\s+d\s+)?echappement\b/, 'Échappement', 'Moteur'],
  ['clutch', /\bembrayages?\b/, 'Embrayage', 'Transmission'],
  ['gearbox', /\bboites?\s+(?:de\s+)?vitesses\b/, 'Boîte de vitesses', 'Transmission'],
  ['steering', /\b(?:cremaillere|direction)\b/, 'Direction', 'Direction'],
  ['wiper', /\bessuie\s+glaces?\b/, 'Essuie-glaces', 'Habitacle'],
  ['sparkPlug', /\bbougies?(?:\s+(?:de\s+)?prechauffage)?\b/, 'Bougies', 'Moteur'],
  ['engine', /\bmoteurs?\b/, 'Moteur', 'Moteur'],
  ['braking', /\bfreins?\b|\bfreinage\b/, 'Freinage', 'Freinage'],
];
const uncertain = /\b(?:sans|aucun|aucune|absence|absent|absente|non|pas|devis|hypothese|eventuel|eventuelle|prevoir|prevu|prevue|envisage)\b/;

export function inferSpatial(name) {
  const detected = detectComponents(name)[0];
  if (detected) return detected.spatial;
  const text = normalizeName(name);
  if (!isPositiveComponentLabel(name)) return { kind: 'unknown', zone: 'unknown', side: 'unknown' };
  return { kind: 'unknown', zone: /\barriere\b/.test(text) ? 'rear' : /\bavant\b(?!\s+(?:de|le|la|les)\b)/.test(text) ? 'front' : 'unknown', side: /\bgauche\b/.test(text) ? 'left' : /\bdroite\b/.test(text) ? 'right' : 'unknown' };
}
export const isPositiveComponentLabel = (text) => normalizeName(text).length > 0 && !uncertain.test(normalizeName(text));

/** Only positive titles and line labels are interpreted. Notes and document bodies are not scanned. */
export function detectComponents(text) {
  const result = new Map();
  for (const clause of String(text ?? '').split(/[;,\n.]+/).flatMap((part) => normalizeName(part).split(/\s+(?:et|puis|mais)\s+/))) {
    if (uncertain.test(clause)) continue;
    let remainder = clause;
    for (const [kind, pattern, label, group] of rules) {
      const match = pattern.exec(remainder);
      if (!match) continue;
      const after = remainder.slice(match.index + match[0].length);
      const zone = /\b(?:arriere|ar|arg|ard)\b/.test(after) ? 'rear' : /\b(?:avant(?!\s+(?:de|le|la|les|un|une)\b)|av|avg|avd)\b/.test(after) ? 'front' : /\bhabitacle\b/.test(after) ? 'cabin' : /\bcompartiment\s+moteur\b/.test(after) ? 'engineBay' : /\b(?:dessous|soubassement)\b/.test(after) ? 'underbody' : 'unknown';
      const side = /\b(?:gauche|avg|arg)\b/.test(after) ? 'left' : /\b(?:droite|avd|ard)\b/.test(after) ? 'right' : /\bcentre\b/.test(after) ? 'center' : 'unknown';
      const key = `${kind}-${zone}-${side}`;
      const effect = /\b(?:remplacement|remplace|changer|changement|renouvellement)\b/.test(clause) ? 'replace' : /\b(?:controle|verification|inspection)\b/.test(clause) ? 'inspect' : 'none';
      const suffix = [zone === 'front' ? 'avant' : zone === 'rear' ? 'arrière' : '', side === 'left' ? 'gauche' : side === 'right' ? 'droite' : ''].filter(Boolean).join(' ');
      result.set(key, { key, name: `${label}${suffix ? ' ' + suffix : ''}`, group, spatial: { kind, zone, side }, effect });
      remainder = remainder.slice(0, match.index) + ' '.repeat(match[0].length) + remainder.slice(match.index + match[0].length);
    }
  }
  return [...result.values()];
}

export function componentSpatial(component) {
  const inferred = inferSpatial(component.name);
  return { ...inferred, ...component.spatial, kind: component.spatial?.kind ?? inferred.kind, zone: component.spatial?.zone ?? inferred.zone, side: component.spatial?.side ?? inferred.side };
}
export const spatialLabel = (spatial) => [COMPONENT_ZONES[spatial.zone], spatial.side !== 'unknown' ? COMPONENT_SIDES[spatial.side] : null].filter(Boolean).join(' · ');
export const compatibleKind = (a, b) => a === b || a === 'unknown' || b === 'unknown' || a === 'braking' && ['drum', 'disc', 'pads'].includes(b) || b === 'braking' && ['drum', 'disc', 'pads'].includes(a);

export function mergeSpatial(original, incoming) {
  return { ...original, kind: original.kind === 'unknown' || original.kind === 'braking' && compatibleKind(original.kind, incoming.kind) ? incoming.kind : original.kind, zone: original.zone === 'unknown' ? incoming.zone : original.zone, side: original.side === 'unknown' ? incoming.side : original.side };
}

export function matchingComponents(components, candidate) {
  const exact = components.filter((part) => normalizeName(part.name) === normalizeName(candidate.name));
  if (exact.length) return exact;
  if (candidate.spatial.kind === 'unknown') return [];
  return components.filter((part) => {
    const spatial = componentSpatial(part), desired = candidate.spatial;
    return spatial.kind !== 'unknown' && compatibleKind(spatial.kind, desired.kind) && !(desired.kind === 'braking' && spatial.kind !== 'braking') && (spatial.zone === desired.zone || spatial.zone === 'unknown') && (spatial.side === desired.side || spatial.side === 'unknown');
  });
}

/** A possible identity is offered for review, never used to guess an unstated position. */
export function possibleComponents(components, candidate) {
  return components.filter((part) => {
    const spatial = componentSpatial(part), desired = candidate.spatial;
    if (desired.kind === 'unknown') return normalizeName(part.name) === normalizeName(candidate.name);
    return spatial.kind !== 'unknown' && compatibleKind(spatial.kind, desired.kind) && !(desired.kind === 'braking' && spatial.kind !== 'braking') && (desired.zone === 'unknown' || spatial.zone === 'unknown' || desired.zone === spatial.zone) && (desired.side === 'unknown' || spatial.side === 'unknown' || desired.side === spatial.side);
  });
}
