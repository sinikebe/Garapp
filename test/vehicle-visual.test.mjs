import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGarage } from '../public/assets/js/garage.js';
import { backupBlob, readBackupFile } from '../public/assets/js/backups.js';
import { visualKind, validateVisualDocument, vehicleVisualMarkup, vehicleCover, validateGlb } from '../public/assets/js/vehicle-visual.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=';
const photo = () => ({id:'photo',name:'Photo fictive.png',mimeType:'image/png',dataUrl:`data:image/png;base64,${png}`,source:{example:true}});
const garage = (vehicle = {}) => ({version:2,activeId:'fiction',vehicles:[{id:'fiction',name:'Véhicule fictif',components:[],records:[],documents:[photo()],...vehicle}]});
const roundTrip = (value) => parseGarage(JSON.stringify(value));
const glb = (extra = {}) => {
  const json = JSON.stringify({asset:{version:'2.0'},scenes:[{nodes:[]}],...extra});
  const body = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4,' '));
  const bytes = new Uint8Array(20 + body.length), view = new DataView(bytes.buffer);
  [0x46546c67,2,bytes.length,body.length,0x4e4f534a].forEach((value,index) => view.setUint32(index * 4,value,true));
  bytes.set(body,20); return bytes;
};
const model = (extra) => ({id:'model',name:'Modèle fictif.glb',mimeType:'model/gltf-binary',dataUrl:'data:model/gltf-binary;base64,' + Buffer.from(glb(extra)).toString('base64')});

test('no cover is assumed for a vehicle or an existing attached photo',()=>{
  for (const vehicle of [roundTrip(garage()).vehicles[0],roundTrip(garage({coverDocumentId:null})).vehicles[0]]) {
    assert.equal(vehicleCover(vehicle),null); assert.equal(vehicleVisualMarkup(vehicle),'');
  }
});

test('an explicitly selected photo and all its original bytes survive a portable backup',async()=>{
  const source = roundTrip(garage({coverDocumentId:'photo',source:{example:true}}));
  const restored = (await readBackupFile(backupBlob(source))).garage;
  assert.deepEqual(restored,source); assert.equal(vehicleCover(restored.vehicles[0]).dataUrl,photo().dataUrl);
  assert.match(vehicleVisualMarkup(restored.vehicles[0]),/Photo de Véhicule fictif/);
  assert.equal(visualKind(photo()),'image');
});

test('hiding the cover preserves its attached original and unrelated vehicle metadata',()=>{
  const source = garage({coverDocumentId:'photo',metadata:{example:true}});
  source.vehicles[0].coverDocumentId = null;
  const restored = roundTrip(source).vehicles[0];
  assert.equal(vehicleVisualMarkup(restored),''); assert.equal(restored.documents[0].dataUrl,photo().dataUrl);
  assert.deepEqual(restored.metadata,{example:true});
});

test('missing, remote or non-image cover documents fail before import changes the garage',()=>{
  assert.throws(()=>roundTrip(garage({coverDocumentId:'missing'})),/absent/);
  assert.throws(()=>roundTrip(garage({coverDocumentId:'https://example.test/private.jpg'})),/document intégré/);
  const pdf = {id:'pdf',name:'Fichier fictif.pdf',mimeType:'application/pdf',dataUrl:'data:application/pdf;base64,JVBERg=='};
  assert.throws(()=>roundTrip(garage({coverDocumentId:'pdf',documents:[pdf]})),/Choisir une photo/);
  assert.throws(()=>roundTrip(garage({coverDocumentId:'photo',documents:[{...photo(),dataUrl:'data:image/png;base64,SGVsbG8='}]})),/contenu du fichier/);
});

test('markup escapes names and does not add a diagram or a model host for a photo',()=>{
  const vehicle = roundTrip(garage({coverDocumentId:'photo',name:'Véhicule fictif <img src=x onerror=1>'})).vehicles[0];
  const html = vehicleVisualMarkup(vehicle);
  assert.match(html,/&lt;img/); assert.doesNotMatch(html,/<svg|data-vehicle-model|onerror=1>/);
});

test('a self-contained GLB survives the same backup without rewriting geometry or metadata',async()=>{
  const document = {...model(),metadata:{example:true}}, source = roundTrip(garage({coverDocumentId:'model',documents:[document]}));
  const restored = (await readBackupFile(backupBlob(source))).garage;
  assert.deepEqual(restored,source); assert.equal(vehicleCover(restored.vehicles[0]).dataUrl,document.dataUrl);
  assert.match(vehicleVisualMarkup(restored.vehicles[0]),/data-vehicle-model/); assert.equal(validateVisualDocument(document),'model');
  assert.equal(visualKind({...document,mimeType:'application/octet-stream'}),'model');
});

test('GLB structure and all external dependencies are checked before a model is rendered',()=>{
  const invalid = glb(); new DataView(invalid.buffer).setUint32(8,1,true);
  assert.throws(()=>validateGlb(invalid),/GLB version 2/);
  assert.throws(()=>validateGlb(new Uint8Array(3)),/incomplet/);
  for (const uri of ['https://example.test/texture.png','texture.png','file:///texture.png','//example.test/image','data:text/html;base64,PHN2Zz4=']) {
    assert.throws(()=>validateVisualDocument(model({images:[{uri}]})),/sans fichier ni lien externe/);
  }
  for (const extension of ['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu']) {
    assert.throws(()=>validateVisualDocument(model({extensionsUsed:[extension]})),/sans compression/);
  }
  assert.equal(validateVisualDocument(model({images:[{uri:`data:image/png;base64,${png}`}]})),'model');
});
