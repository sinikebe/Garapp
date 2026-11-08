import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage, associatedComponentIds, componentLife, componentHistory } from '../public/assets/js/garage.js';
import { COMPONENT_KINDS, COMPONENT_ZONES, COMPONENT_SIDES, detectComponents, componentSpatial, matchingComponents, inferSpatial } from '../public/assets/js/component-catalog.js';
import { knownComponents, proposedDiscoveries, applyDiscoveries } from '../public/assets/js/component-knowledge.js';
import { moveRecordToTrash, restoreTrashedRecord } from '../public/assets/js/record-trash.js';
import { backupBlob, readBackupFile } from '../public/assets/js/backups.js';
import { componentMesh, sceneLayout, rotatePoint, projectScene, hitComponent } from '../public/assets/js/component-scene.js';

const fixture = (records=[], components=[]) => parseGarage(JSON.stringify({version:2,activeId:'fiction',vehicles:[{id:'fiction',name:'Véhicule fictif',odometer:30000,components,records}]}));
const record = (title, extra={}) => ({id:'record',title,type:'controle',date:'2026-05-01',odometer:20000,...extra});
const drum = () => detectComponents('Contrôle des tambours arrière')[0];
const roundTrip = (value) => parseGarage(JSON.stringify(value));

test('an empty garage produces an empty component model without assumed standard equipment',()=>{
  const garage=fixture();assert.deepEqual(knownComponents(garage.vehicles[0]),[]);
  const frame=projectScene([],undefined,800,440);assert.deepEqual(frame.faces,[]);assert.equal(frame.wire.length,6);
});

test('explicit components are recognized with only the stated position and side',()=>{
  const [part]=detectComponents('Contrôle des tambours arrière gauche');
  assert.equal(part.spatial.kind,'drum');assert.equal(part.spatial.zone,'rear');assert.equal(part.spatial.side,'left');assert.equal(part.effect,'inspect');
  assert.deepEqual(detectComponents('Révision des freins arrière')[0].spatial,{kind:'braking',zone:'rear',side:'unknown'});
  assert.equal(detectComponents('Avant de contrôler les tambours')[0].spatial.zone,'unknown');
  assert.equal(detectComponents('Remplacement des plaquettes avant')[0].effect,'replace');
  assert.equal(detectComponents('Contrôle amortisseur arrière droit')[0].spatial.side,'right');
  assert.deepEqual(inferSpatial('Capteur fictif arrière droit'),{kind:'unknown',zone:'rear',side:'right'});
});

test('generic revisions, negative statements and hypothetical equipment do not install components',()=>{
  for(const title of ['Révision et vidange','Pas de tambours arrière','Véhicule sans tambours','Devis pour des tambours arrière','Tambours arrière non présents','Prévoir des plaquettes avant'])assert.deepEqual(detectComponents(title),[]);
  const found=detectComponents('Pas de tambours ; contrôle des disques avant');assert.equal(found.length,1);assert.equal(found[0].spatial.kind,'disc');
});

test('multiple components retain their own positions and filters do not invent an engine or oil',()=>{
  const parts=detectComponents('Remplacement filtre à huile moteur et filtre à air');
  assert.deepEqual(parts.map((part)=>part.spatial.kind),['oilFilter','airFilter']);
  assert.deepEqual(detectComponents('Tambours arrière et plaquettes avant').map((part)=>part.spatial.zone),['rear','front']);
});

test('older unlinked records populate a read-only projection and repeated mentions do not duplicate it',()=>{
  const garage=fixture([record('Contrôle des tambours arrière'),record('Révision des tambours arrière',{id:'another'})]);const before=structuredClone(garage);
  const rows=knownComponents(garage.vehicles[0]);assert.equal(rows.length,1);assert.equal(rows[0].stored,false);assert.equal(rows[0].sources.length,2);assert.equal(rows[0].spatial.kind,'drum');assert.deepEqual(garage,before);
});

test('planned, future and trashed sources do not confirm the presence of equipment',()=>{
  const garage=fixture([record('Tambours arrière',{status:'planned'}),record('Batterie',{id:'future',date:'2099-01-01'})]);assert.deepEqual(knownComponents(garage.vehicles[0],'2026-11-08'),[]);
  const original=fixture([record('Contrôle des tambours arrière')]);
  const moved=moveRecordToTrash(original,'fiction','record','2026-11-08T12:00:00.000Z');assert.deepEqual(knownComponents(moved.vehicles[0]),[]);
  assert.equal(knownComponents(restoreTrashedRecord(moved,'fiction','record').vehicles[0]).length,1);
});

test('manual components remain visible without an intervention and unknown names retain a generic shape',()=>{
  const garage=fixture([], [{id:'custom',name:'Capteur fictif XYZ'}]);const rows=knownComponents(garage.vehicles[0]);
  assert.equal(rows.length,1);assert.equal(rows[0].stored,true);assert.equal(rows[0].spatial.kind,'unknown');assert.equal(rows[0].spatial.zone,'unknown');
});

test('an inspection creates an observation without resetting the replacement interval',()=>{
  const garage=fixture([],[]), vehicle=garage.vehicles[0], draft=record('Contrôle des tambours arrière');
  const resolved=applyDiscoveries(vehicle,draft,[drum()],()=> 'drum-fiction');vehicle.components=resolved.components;vehicle.records=[resolved.record];
  const saved=roundTrip(garage),part=saved.vehicles[0].components[0];part.intervalKm=10000;
  assert.deepEqual(associatedComponentIds(saved.vehicles[0].records[0]),['drum-fiction']);
  assert.deepEqual(saved.vehicles[0].records[0].componentIds,[]);assert.equal(componentLife(saved.vehicles[0],part).status,'unknown');assert.equal(componentHistory(saved.vehicles[0],part.id).length,1);
});

test('a reviewed replacement reuses the same component and resets its existing reference',()=>{
  const garage=fixture([], [{id:'drum-fiction',name:'Tambours arrière',intervalKm:20000}]);const vehicle=garage.vehicles[0];
  const draft=record('Remplacement tambours arrière',{componentIds:[],observedComponentIds:[],lines:[]});const proposals=proposedDiscoveries(vehicle,draft);
  assert.equal(proposals[0].targetId,'drum-fiction');
  const result=applyDiscoveries(vehicle,draft,proposals,()=>{throw Error('Must not duplicate');});vehicle.components=result.components;vehicle.records=[result.record];
  assert.equal(vehicle.components.length,1);assert.equal(componentLife(vehicle,vehicle.components[0]).last.id,'record');assert.deepEqual(result.record.componentIds,['drum-fiction']);
});

test('front and rear, and left and right, stay distinct without assigning unknown positions',()=>{
  const components=[{id:'front',name:'Tambours avant',spatial:{kind:'drum',zone:'front',side:'left'}}];
  assert.deepEqual(matchingComponents(components,drum()),[]);
  assert.deepEqual(matchingComponents(components,detectComponents('Tambours')[0]),[]);
  assert.deepEqual(matchingComponents(components,detectComponents('Tambours avant droite')[0]),[]);
});

test('a generic braking component can be refined while a general brake check does not imply drums',()=>{
  const vehicle=fixture([record('Contrôle tambours arrière')],[{id:'braking',name:'Freinage arrière'}]).vehicles[0];
  const rows=knownComponents(vehicle);assert.equal(rows.length,1);assert.equal(rows[0].id,'braking');assert.equal(rows[0].spatial.kind,'drum');
  assert.equal(vehicle.components[0].spatial,undefined);
  assert.deepEqual(matchingComponents([{id:'drum',name:'Tambours arrière'}],detectComponents('Contrôle freinage arrière')[0]),[]);
});

test('explicit associations cover multiple components without adding a third inferred assembly',()=>{
  const components=[{id:'left',name:'Pneu avant gauche'},{id:'right',name:'Pneu avant droite'}];
  const vehicle=fixture([record('Contrôle pneus avant',{observedComponentIds:['left','right']})],components).vehicles[0];
  assert.equal(knownComponents(vehicle).length,2);assert.deepEqual(proposedDiscoveries(vehicle,vehicle.records[0]),[]);
});

test('ambiguous matches require a choice and explicit creation can preserve separate occurrences',()=>{
  const vehicle=fixture([],[{id:'a',name:'Batterie'},{id:'b',name:'Batterie'}]).vehicles[0];
  const proposal=proposedDiscoveries(vehicle,record('Contrôle batterie'))[0];assert.equal(proposal.ambiguous,true);assert.equal(proposal.targetId,null);
  const result=applyDiscoveries(vehicle,record('Contrôle batterie',{lines:[]}),[{...proposal,forceNew:true}],()=> 'new-battery');assert.equal(result.components.length,3);
});

test('ambiguous older mentions do not create phantom parts or guess a known front position',()=>{
  const components=[{id:'a',name:'Pneu avant gauche'},{id:'b',name:'Pneu avant droite'}];
  const vehicle=fixture([record('Contrôle des pneus')],components).vehicles[0];
  assert.equal(knownComponents(vehicle).length,2);
  const [proposal]=proposedDiscoveries(vehicle,vehicle.records[0]);assert.equal(proposal.ambiguous,true);assert.equal(proposal.targetId,null);
});

test('a free-name line can create a component atomically and keeps all original line fields',()=>{
  const vehicle=fixture().vehicles[0];const draft=record('Contrôle capteur fictif',{lines:[{id:'line',label:'Capteur fictif XYZ',amount:'12.345',effect:'inspect',componentId:null,metadata:{example:true}}]});
  const result=applyDiscoveries(vehicle,draft,[{name:'Capteur fictif XYZ',group:'Électricité',spatial:{kind:'unknown',zone:'unknown',side:'unknown'},effect:'inspect',lineId:'line'}],()=> 'sensor');
  assert.equal(result.record.lines[0].componentId,'sensor');assert.equal(result.record.lines[0].amount,'12.345');assert.deepEqual(result.record.lines[0].metadata,{example:true});assert.deepEqual(vehicle.components,[]);
});

test('an explicitly classified part line supports unknown component names without guessing from labor or fuel',()=>{
  const vehicle=fixture([record('Contrôle fictif',{lines:[{id:'line',label:'Capteur fictif arrière gauche',kind:'part',amount:null,effect:'inspect'}]})],[{id:'battery',name:'Batterie'}]).vehicles[0];
  const rows=knownComponents(vehicle);assert.equal(rows.length,2);assert.equal(rows[1].name,'Capteur fictif arrière gauche');assert.equal(rows[1].spatial.kind,'unknown');assert.equal(rows[1].spatial.zone,'rear');assert.equal(rows[1].spatial.side,'left');
  assert.equal(proposedDiscoveries(vehicle,vehicle.records[0])[0].targetId,null);
  vehicle.records[0].lines[0].kind='labor';assert.deepEqual(knownComponents(vehicle).map(part=>part.id),['battery']);
  vehicle.records[0].type='fuel';vehicle.records[0].lines[0].kind='part';assert.deepEqual(knownComponents(vehicle).map(part=>part.id),['battery']);
});

test('record-created components disappear from the scene when their final source is trashed',()=>{
  const garage=fixture(),vehicle=garage.vehicles[0],draft=record('Contrôle tambours arrière',{lines:[]});const result=applyDiscoveries(vehicle,draft,[drum()],()=> 'drum');vehicle.components=result.components;vehicle.records=[result.record];
  const moved=moveRecordToTrash(roundTrip(garage),'fiction','record','2026-11-08T12:00:00.000Z');assert.equal(moved.vehicles[0].components.length,1);assert.deepEqual(knownComponents(moved.vehicles[0]),[]);
  assert.equal(knownComponents(restoreTrashedRecord(moved,'fiction','record').vehicles[0]).length,1);
});

test('spatial metadata, observation links and unknown nested properties survive portable backups',async()=>{
  const garage=fixture([record('Contrôle capteur fictif',{observedComponentIds:['sensor'],extra:{example:true}})],[{id:'sensor',name:'Capteur fictif',origin:'Archive fictive conservée',spatial:{presenceOrigin:'record',kind:'unknown',zone:'rear',side:'left',source:{position:'Exemple fictif'}}}]);
  const copy=await readBackupFile(new File([backupBlob(garage)],'modele-fictif.json'));assert.deepEqual(copy.garage,garage);
  assert.equal(componentHistory(copy.garage.vehicles[0],'sensor').length,1);
});

test('invalid placements and dangling observed links are rejected in active records and recycle bins',()=>{
  const original=fixture([record('Contrôle fictif',{observedComponentIds:['part']})],[{id:'part',name:'Composant fictif',spatial:{kind:'unknown',zone:'unknown',side:'unknown'}}]);
  for(const change of [
    (v)=>{v.components[0].spatial.kind='__proto__';},(v)=>{v.components[0].spatial.zone='missing';},(v)=>{v.components[0].spatial.side='missing';},(v)=>{v.components[0].spatial=null;},(v)=>{v.components[0].spatial.presenceOrigin='missing';},(v)=>{v.records[0].observedComponentIds=['absent'];},(v)=>{v.records[0].observedComponentIds=['part','part'];},
  ]){const garage=structuredClone(original);change(garage.vehicles[0]);assert.throws(()=>roundTrip(garage));}
  const moved=moveRecordToTrash(original,'fiction','record','2026-11-08T12:00:00.000Z');moved.vehicles[0].trashedRecords[0].record.observedComponentIds=['absent'];assert.throws(()=>roundTrip(moved));
});

test('all generic meshes have finite spatial coordinates and unknown placements stay outside the silhouette',()=>{
  for(const kind of Object.keys(COMPONENT_KINDS)){const mesh=componentMesh(kind);assert.ok(mesh.length);for(const face of mesh)for(const vertex of face)assert.ok(vertex.every(Number.isFinite));}
  const [unknown,front]=sceneLayout([{id:'a',spatial:{kind:'unknown',zone:'unknown',side:'unknown'}},{id:'b',spatial:{kind:'drum',zone:'front',side:'left'}}]);
  assert.equal(unknown.anchor,null);assert.ok(unknown.center[0]<-3);assert.ok(front.anchor[0]>0);assert.ok(front.anchor[2]<0);
});

test('rotation and explosion change actual projected geometry; polygon picking selects the nearest visible part',()=>{
  const part={id:'part',name:'Tambours arrière',spatial:drum().spatial};
  const a=projectScene([part],{yaw:0,pitch:.4,zoom:1,spread:0}),b=projectScene([part],{yaw:1,pitch:.4,zoom:1,spread:1});
  assert.notDeepEqual(a.faces[0].vertices,b.faces[0].vertices);assert.notDeepEqual(a.markers[0].center,b.markers[0].center);
  assert.deepEqual(rotatePoint([1,2,3],0,0),[1,2,3]);
  assert.equal(hitComponent([{id:'back',vertices:[[0,0],[10,0],[10,10],[0,10]]},{id:'front',vertices:[[2,2],[8,2],[8,8],[2,8]]}],5,5),'front');
  assert.equal(hitComponent(a.faces,-100,-100),null);
  for(const width of [320,800])for(const height of [240,440])for(const yaw of [0,1,3]){const frame=projectScene([part],{yaw,pitch:1.48,zoom:1,spread:1},width,height);assert.ok(frame.faces.every((face)=>face.vertices.every((v)=>v.every(Number.isFinite))));}
});

test('known spatial enums can all be represented without assuming a side for grouped components',()=>{
  for(const zone of Object.keys(COMPONENT_ZONES))for(const side of Object.keys(COMPONENT_SIDES)){const part={id:'part',name:'Composant fictif',spatial:{kind:'unknown',zone,side}};assert.equal(projectScene([part]).markers.length,1);}
  assert.equal(componentSpatial({name:'Tambours arrière'}).side,'unknown');
});
