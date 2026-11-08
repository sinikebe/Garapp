/** Fixed schematic mounts. A layout never creates component records or equipment. */
import { componentSpatial } from './component-catalog.js';

export const DEFAULT_COMPONENT_LAYOUT = Object.freeze({ wheelCount:4, doorCount:4, enginePosition:'front' });
export const ENGINE_POSITIONS = Object.freeze({ front:'Avant', center:'Central', rear:'Arrière' });
const wheelKinds = new Set(['wheel','tire','disc','drum','pads','braking','shock']);
const engineKinds = new Set(['engine','belt','oilFilter','airFilter','fuelFilter','oil','coolant','gearbox','clutch','sparkPlug']);
const pairedBodyKinds = new Set(['mirror','headlight','rearLight']);

export function validateComponentLayout(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('La disposition du véhicule doit être un objet.');
  for (const [key,min,max] of [['wheelCount',2,12],['doorCount',1,8]]) {
    if (value[key] !== undefined && (!Number.isInteger(value[key]) || value[key] < min || value[key] > max)) throw Error('La disposition accepte de 2 à 12 roues et de 1 à 8 portières latérales.');
  }
  if (value.enginePosition !== undefined && !Object.hasOwn(ENGINE_POSITIONS,value.enginePosition)) throw Error('Choisir un moteur avant, central ou arrière.');
  return value;
}

export function componentLayout(value = {}, parts = []) {
  const result = { ...DEFAULT_COMPONENT_LAYOUT, ...value };
  if (!value.enginePosition) {
    const positions = [...new Set(parts.map(componentSpatial).filter((spatial) => spatial.kind === 'engine').map((spatial) => ({front:'front',rear:'rear',cabin:'center'})[spatial.zone]).filter(Boolean))];
    if (positions.length === 1) result.enginePosition = positions[0];
  }
  return result;
}

const slot = (key,zone,side,anchor,scale = [1,1,1]) => ({key,zone,side,anchor,scale});
const paired = (key,zone,x,y,z,scale) => ['left','right'].map((side) => slot(`${key}-${side}`,zone,side,[x,y,side === 'left' ? -z : z],scale));
const positionX = (zone, fallback) => zone === 'front' ? 1.4 : zone === 'rear' ? -1.4 : zone === 'cabin' ? 0 : fallback;
const sideZ = (side,z = .85) => side === 'left' ? -z : side === 'right' ? z : 0;

export function wheelSlots(count = 4) {
  if (count === 2) return [slot('wheel-front-center','front','center',[1.45,.37,0]),slot('wheel-rear-center','rear','center',[-1.45,.37,0])];
  const axles = Math.ceil(count / 2), slots = [];
  for (let axle = 0; axle < axles; axle++) {
    const zone = axle === 0 ? 'front' : 'rear', x = 1.45 - axle * 2.9 / (axles - 1);
    if (count % 2 && axle === axles - 1) slots.push(slot(`wheel-${axle}-center`,zone,'center',[x,.37,0]));
    else slots.push(...paired(`wheel-${axle}`,zone,x,.37,.96));
  }
  return slots;
}

export function doorSlots(count = 4) {
  const rows = Math.ceil(count / 2), width = Math.min(.95,1.08 / Math.max(1,rows - 1));
  return Array.from({length:count},(_,index) => {
    const row = Math.floor(index / 2), side = index % 2 ? 'right' : 'left';
    const x = rows === 1 ? .15 : .6 - row * 1.2 / (rows - 1);
    return slot(`door-${row}-${side}`,row === 0 ? 'front' : 'rear',side,[x,.7,sideZ(side,.94)],[width,1,1]);
  });
}

const filterSlots = (slots, spatial) => slots.filter((entry) => (!['front','rear','cabin'].includes(spatial.zone) || entry.zone === spatial.zone) && (spatial.side === 'unknown' || entry.side === spatial.side));
const engineX = (config) => ({front:1.25,center:0,rear:-1.25})[config.enginePosition];

/** Return only the mounts for a known component; unknown forms keep their explicit zone. */
export function componentMounts(part, configuration = {}) {
  const config = componentLayout(configuration), spatial = componentSpatial(part), {kind,zone,side} = spatial;
  let mounts = [];
  if (wheelKinds.has(kind)) {
    mounts = filterSlots(wheelSlots(config.wheelCount),spatial);
    if (!mounts.length && ['front','rear'].includes(zone)) mounts = side === 'center' ? [slot(`wheel-${zone}-center`,zone,'center',[positionX(zone),.37,0])] : filterSlots(paired(`wheel-${zone}`,zone,positionX(zone),.37,.96),spatial);
    if (!mounts.length && zone === 'unknown' && side !== 'unknown') mounts = side === 'center' ? wheelSlots(2) : filterSlots(wheelSlots(4),spatial);
    if (!mounts.length && ['cabin','underbody','engineBay'].includes(zone)) mounts = [slot(`wheel-${zone}-${side}`,zone,side,[zone === 'engineBay' ? engineX(config) : zone === 'underbody' ? -.6 : 0,zone === 'underbody' ? .15 : .55,sideZ(side)])];
    const depth = ({tire:.02,wheel:0,disc:-.12,drum:-.1,pads:-.16,braking:-.12,shock:-.2})[kind];
    return mounts.map((entry) => ({...entry,anchor:[entry.anchor[0] + (kind === 'pads' ? .2 : 0),kind === 'shock' ? .8 : entry.anchor[1],entry.anchor[2] + Math.sign(entry.anchor[2]) * depth]}));
  }
  if (kind === 'door') {
    mounts = filterSlots(doorSlots(config.doorCount),spatial);
    if (!mounts.length && ['front','rear'].includes(zone)) mounts = filterSlots(paired(`door-${zone}`,zone,zone === 'front' ? .55 : -.55,.7,.94),spatial);
    if (mounts.length) return mounts;
  }
  if (pairedBodyKinds.has(kind) && zone !== 'cabin') {
    const rear = zone === 'rear' || kind === 'rearLight' && zone !== 'front';
    const x = kind === 'mirror' ? rear ? -.65 : .65 : rear ? -2 : 2;
    mounts = filterSlots(paired(kind,rear ? 'rear' : 'front',x,kind === 'mirror' ? 1.02 : .58,kind === 'mirror' ? 1.08 : .64),{...spatial,zone:'unknown'});
    if (mounts.length) return mounts;
  }
  if (kind === 'bumper') {
    mounts = filterSlots([slot('bumper-front','front','center',[2.1,.3,0]),slot('bumper-rear','rear','center',[-2.1,.3,0])],spatial);
    if (mounts.length) return mounts;
  }
  if (kind === 'wiper') {
    if (zone === 'rear') return [slot('wiper-rear','rear','center',[-1.3,1.08,0])];
    mounts = filterSlots(paired('wiper-front','front',.86,1.04,.35),{...spatial,zone:'unknown'});
    if (mounts.length) return mounts;
  }
  const x = positionX(zone,engineX(config)), z = sideZ(side,.45);
  const engineOffsets = { engine:[0,.63,0], belt:[.36,.62,0], oilFilter:[-.28,.4,-.35], airFilter:[-.25,.88,.3], fuelFilter:[.2,.7,-.37], oil:[-.16,.42,0], coolant:[.22,.75,.33], gearbox:[-.45,.4,0], clutch:[-.3,.4,0], sparkPlug:[.05,.99,0] };
  let anchor, effectiveZone = zone;
  if (engineKinds.has(kind)) {
    const offset = engineOffsets[kind], direction = x < 0 ? -1 : 1;
    anchor = [x + offset[0] * direction,offset[1],z + offset[2]];
    effectiveZone = x > .4 ? 'front' : x < -.4 ? 'rear' : 'cabin';
  } else if (kind === 'battery') { anchor = [positionX(zone,1.3),.65,side === 'unknown' ? -.48 : z]; effectiveZone = zone === 'unknown' ? 'front' : zone; }
  else if (kind === 'cabinFilter') { anchor = [positionX(zone,.6),.62,z]; effectiveZone = zone === 'unknown' ? 'cabin' : zone; }
  else if (kind === 'hood') { anchor = [zone === 'rear' ? -1.4 : 1.4,.93,0]; effectiveZone = zone === 'rear' ? 'rear' : 'front'; }
  else if (kind === 'tailgate') { anchor = [zone === 'front' ? 1.96 : -1.96,.72,0]; effectiveZone = zone === 'front' ? 'front' : 'rear'; }
  else if (kind === 'radiator') { anchor = [positionX(zone,1.85),.58,z]; effectiveZone = zone === 'rear' ? 'rear' : 'front'; }
  else if (kind === 'fuelTank') { anchor = [positionX(zone,-.65),.16,z]; effectiveZone = zone === 'unknown' ? 'underbody' : zone; }
  else if (kind === 'exhaust') { anchor = [positionX(zone,-1.05),.12,side === 'unknown' ? .35 : z]; effectiveZone = zone === 'unknown' ? 'underbody' : zone; }
  else if (kind === 'steering') { anchor = [positionX(zone,1.35),.35,z]; effectiveZone = zone === 'unknown' ? 'front' : zone; }
  else if (zone !== 'unknown') anchor = [zone === 'engineBay' ? engineX(config) : positionX(zone,0),zone === 'underbody' ? .1 : .75,sideZ(side)];
  if (!anchor) return [];
  return [slot(`${kind}-${effectiveZone}-${side}`,effectiveZone,side,anchor)];
}

function explosion(entry, kind, amount) {
  if (wheelKinds.has(kind)) return [0,0,Math.sign(entry.anchor[2]) * amount * (kind === 'tire' ? .65 : kind === 'wheel' ? .48 : .25)];
  if (kind === 'door' || kind === 'mirror') return [0,0,Math.sign(entry.anchor[2]) * amount * .5];
  if (['bumper','headlight','rearLight','tailgate'].includes(kind)) return [Math.sign(entry.anchor[0]) * amount * .35,0,0];
  return [0,amount * (kind === 'hood' ? .55 : .28),0];
}

export function fixedComponentLayout(parts, spread = .3, configuration = {}) {
  const config = componentLayout(configuration,parts), result = [];
  let unplaced = 0;
  for (const part of parts) {
    const spatial = componentSpatial(part), mounts = componentMounts(part,config);
    if (!mounts.length) {
      const index = unplaced++;
      result.push({part,kind:spatial.kind,anchor:null,center:[-3.5 - index % 3 * .75,.3 + Math.floor(index / 3) * .72,-1.3 + index % 3 * 1.25],scale:[1,1,1],key:`unplaced-${part.id}`});
    }
    for (const entry of mounts) {
      const delta = explosion(entry,spatial.kind,spread);
      result.push({part,kind:spatial.kind,anchor:entry.anchor,center:entry.anchor.map((value,index) => value + delta[index]),scale:entry.scale,key:`${spatial.kind}-${entry.key}`,zone:entry.zone,side:entry.side});
    }
  }
  return result;
}

export function placementLabel(part, configuration = {}) {
  const mounts = componentMounts(part,configuration), spatial = componentSpatial(part);
  if (!mounts.length) return 'À placer';
  const zones = [...new Set(mounts.map((entry) => entry.zone))];
  const position = zones.length > 1 ? 'Avant et arrière' : ({front:'Avant',rear:'Arrière',cabin:'Habitacle',underbody:'Dessous du véhicule',engineBay:'Compartiment moteur'})[zones[0]] ?? 'Emplacement fixe';
  const side = spatial.side === 'left' ? ' · Gauche' : spatial.side === 'right' ? ' · Droite' : '';
  return `${position}${side}${mounts.length > 1 ? ` · ${mounts.length} emplacements` : ''}${spatial.zone === 'unknown' || spatial.zone === 'engineBay' ? ' · schématique' : ''}`;
}
