import test from 'node:test';
import assert from 'node:assert/strict';
import { componentLayout, componentMounts, fixedComponentLayout, placementLabel, validateComponentLayout, wheelSlots, doorSlots } from '../public/assets/js/component-layout.js';
import { detectComponents, componentSpatial } from '../public/assets/js/component-catalog.js';
import { projectScene } from '../public/assets/js/component-scene.js';
import { parseGarage } from '../public/assets/js/garage.js';
import { knownComponents } from '../public/assets/js/component-knowledge.js';
import { backupBlob, readBackupFile } from '../public/assets/js/backups.js';

const part = (id,kind,zone = 'unknown',side = 'unknown') => ({id,name:`Composant fictif ${id}`,spatial:{kind,zone,side}});
const garage = (components = [],layout) => ({version:2,activeId:'fiction',vehicles:[{id:'fiction',name:'Véhicule fictif',components,records:[],...(layout ? {componentLayout:layout} : {})}]});

test('a configured diagram still contains no equipment until a component is known',()=>{
  const source = garage([],{wheelCount:8,doorCount:6,enginePosition:'rear'}), before = structuredClone(source);
  assert.deepEqual(knownComponents(source.vehicles[0]),[]);
  assert.deepEqual(fixedComponentLayout([],1,source.vehicles[0].componentLayout),[]);
  assert.deepEqual(projectScene([],undefined,800,440,source.vehicles[0].componentLayout).faces,[]);
  assert.deepEqual(source,before);
});

test('wheel mounts preserve axle and side with configurable counts and no free vertical drift',()=>{
  for (let count = 2; count <= 12; count++) {
    const slots = wheelSlots(count);
    assert.equal(slots.length,count);assert.equal(new Set(slots.map(entry=>entry.anchor.join(','))).size,count);
    assert.ok(slots.every(entry=>entry.anchor.every(Number.isFinite)));
  }
  const wheels = part('wheels','wheel'), tires = part('tires','tire','front');
  assert.equal(componentMounts(wheels).length,4);assert.equal(componentMounts(tires).length,2);
  const fixed = fixedComponentLayout([tires],0), exploded = fixedComponentLayout([tires],1);
  for (let index=0;index<fixed.length;index++) {
    assert.equal(fixed[index].center[0],exploded[index].center[0]);assert.equal(fixed[index].center[1],exploded[index].center[1]);
    assert.notEqual(fixed[index].center[2],exploded[index].center[2]);
  }
  assert.equal(componentMounts(part('single','wheel','rear','left')).length,1);
  const center = componentMounts(part('center','wheel','front','center'));
  assert.equal(center.length,1);assert.equal(center[0].anchor[2],0);
  assert.equal(componentMounts(part('left','wheel','unknown','left'),{wheelCount:2}).length,2);
});

test('doors use fixed side mounts and never imply a tailgate or another component record',()=>{
  const doors = part('doors','door');
  for (let count=1;count<=8;count++) {
    const slots = doorSlots(count);assert.equal(slots.length,count);
    assert.equal(componentMounts(doors,{doorCount:count}).length,count);
    assert.ok(slots.every(entry=>entry.side==='left'||entry.side==='right'));
  }
  assert.equal(componentMounts(part('single','door','front','left')).length,1);
  const entries = fixedComponentLayout([doors],1,{doorCount:4});
  assert.equal(entries.length,4);assert.deepEqual([...new Set(entries.map(entry=>entry.part.id))],['doors']);
  assert.ok(entries.every(entry=>entry.kind==='door'));
  for(const entry of entries) { assert.equal(entry.center[0],entry.anchor[0]);assert.equal(entry.center[1],entry.anchor[1]); }
});

test('the engine and related mechanical parts follow the chosen engine bay while explicit positions win',()=>{
  const engine=part('engine','engine'), filter=part('filter','oilFilter');
  for (const [position,sign] of [['front',1],['rear',-1],['center',0]]) {
    const config={enginePosition:position};
    assert.equal(Math.sign(componentMounts(engine,config)[0].anchor[0]),sign);
    if(sign)assert.equal(Math.sign(componentMounts(filter,config)[0].anchor[0]),sign);
  }
  assert.ok(componentMounts(part('rear','engine','rear'),{enginePosition:'front'})[0].anchor[0]<0);
  assert.equal(componentLayout({},[part('rear','engine','rear')]).enginePosition,'rear');
  const resolved=componentLayout({},[part('rear','engine','rear'),filter]);
  assert.ok(projectScene([filter],{},800,440,resolved).markers[0].anchor);
  assert.ok(fixedComponentLayout([filter],0,resolved)[0].anchor[0]<0);
});

test('known body and mechanical forms have canonical mounts while unclassified parts keep the tray',()=>{
  for(const kind of ['battery','cabinFilter','hood','tailgate','bumper','mirror','headlight','rearLight','radiator','fuelTank','steering','exhaust','wiper']) {
    assert.ok(componentMounts(part(kind,kind)).length);
    assert.ok(fixedComponentLayout([part(kind,kind)],1).every(entry=>entry.center.every(Number.isFinite)));
  }
  assert.ok(componentMounts(part('hood','hood'))[0].anchor[0]>0);
  assert.ok(componentMounts(part('tailgate','tailgate'))[0].anchor[0]<0);
  const unknown=part('custom','unknown'), entry=fixedComponentLayout([unknown])[0];
  assert.equal(entry.anchor,null);assert.ok(entry.center[0]<-3);assert.equal(placementLabel(unknown),'À placer');
});

test('adding or reordering unrelated components does not move a fixed part',()=>{
  const engine=part('engine','engine'), doors=part('doors','door'), tire=part('tire','tire','front','left');
  const positions=(parts)=>fixedComponentLayout(parts,.5).filter(entry=>entry.part.id==='tire').map(entry=>entry.center);
  assert.deepEqual(positions([tire]),positions([doors,engine,tire]));
  assert.deepEqual(positions([tire,engine,doors]),positions([doors,tire,engine]));
});

test('overlapping group and individual records keep their identity and selection reveals the selected record',()=>{
  const group=part('group','tire'), specific=part('single','tire','front','left');
  const initial=projectScene([group,specific],{}), selected=projectScene([group,specific],{selected:'group'});
  assert.ok(initial.faces.some(face=>face.id==='single'));assert.ok(selected.faces.some(face=>face.id==='group'));
  assert.equal(initial.renderedInstances,4);assert.equal(selected.renderedInstances,4);
  const reversed=projectScene([specific,group],{});
  assert.deepEqual(new Set(initial.markers.map(entry=>entry.id)),new Set(reversed.markers.map(entry=>entry.id)));
});

test('render budgets keep a selected component available without altering the source collection',()=>{
  const parts=Array.from({length:200},(_,index)=>part(`fiction-${index}`,'unknown'));
  const frame=projectScene(parts,{selected:'fiction-199'});
  assert.equal(frame.totalInstances,200);assert.equal(frame.renderedInstances,160);
  assert.ok(frame.faces.some(face=>face.id==='fiction-199'));assert.equal(parts.length,200);
});

test('body vocabulary retains explicit positions and avoids turning a hood or auxiliary motor into an engine',()=>{
  assert.equal(detectComponents('Contrôle portière arrière gauche')[0].spatial.kind,'door');
  assert.equal(detectComponents('Contrôle portière arrière gauche')[0].spatial.side,'left');
  assert.deepEqual(detectComponents('Contrôle capot moteur').map(entry=>entry.spatial.kind),['hood']);
  assert.equal(detectComponents('Contrôle feu arrière droit')[0].spatial.zone,'rear');
  assert.equal(componentSpatial({name:'Rétroviseur intérieur'}).zone,'cabin');
  assert.ok(!detectComponents('Moteur de lève-vitre').some(entry=>entry.spatial.kind==='engine'));
  assert.deepEqual(detectComponents('Coffre de toit'),[]);
  assert.deepEqual(detectComponents('Prévoir une portière avant'),[]);
});

test('diagram configuration and unknown nested metadata survive complete backups without changing maintenance history',async()=>{
  const original=parseGarage(JSON.stringify(garage([part('doors','door')],{wheelCount:6,doorCount:3,enginePosition:'rear',source:{example:true}})));
  const copy=(await readBackupFile(backupBlob(original))).garage;
  assert.deepEqual(copy,original);assert.equal(copy.vehicles[0].components.length,1);assert.deepEqual(copy.vehicles[0].records,[]);
  assert.equal(parseGarage(JSON.stringify(garage())).vehicles[0].componentLayout,undefined);
});

test('invalid diagram choices are rejected before import while partial configurations remain valid',()=>{
  for(const value of [null,[],{wheelCount:1},{wheelCount:13},{wheelCount:3.5},{doorCount:0},{doorCount:9},{enginePosition:'__proto__'}])assert.throws(()=>validateComponentLayout(value));
  assert.doesNotThrow(()=>validateComponentLayout({enginePosition:'rear',metadata:{example:true}}));
  assert.throws(()=>parseGarage(JSON.stringify(garage([],{wheelCount:0}))));
});
