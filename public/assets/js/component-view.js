import { ComponentScene, sceneLayout } from './component-scene.js';
import { COMPONENT_KINDS } from './component-catalog.js';
import { componentLayout, placementLabel, ENGINE_POSITIONS } from './component-layout.js';
import { chronological, componentLife } from './garage.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const statuses = { unknown:'Suivi à compléter', ok:'Repère non atteint', soon:'À prévoir', due:'Échéance atteinte' };
export const newSceneState = () => ({ yaw:-.6, pitch:.48, zoom:1, spread:.3, selected:null });

export function renderComponentView(container, rows, vehicle, state, configuration = componentLayout(vehicle.componentLayout,vehicle.components)) {
  const unplaced = new Set(sceneLayout(rows,0,configuration).filter((item)=>!item.anchor).map((item)=>item.part.id)).size;
  container.innerHTML = `<section class="panel component-scene-panel" aria-labelledby="scene-title"><div class="panel-heading"><div><h2 id="scene-title">Le véhicule se précise au fil des fiches.</h2><p class="hint">${rows.length} composant(s) connu(s) · ${unplaced} à placer</p></div><div class="scene-heading-actions"><span class="scene-badge">Vue générique</span><button type="button" class="ghost-button" data-action="vehicle-layout">Disposition du véhicule</button></div></div><p class="reference-note scene-note">Seuls les composants documentés apparaissent. Les groupes occupent les emplacements fixes du schéma ; plusieurs volumes peuvent renvoyer à la même fiche. La disposition ne confirme ni la quantité réelle ni un équipement absent de l’historique.</p>
    <p class="hint scene-configuration">Schéma : ${configuration.wheelCount} roues · ${configuration.doorCount} portières latérales · moteur ${ENGINE_POSITIONS[configuration.enginePosition].toLowerCase()}</p><div class="scene-controls"><div class="scene-presets" role="group" aria-label="Orientation de la vue 3D"><button type="button" class="ghost-button" data-scene-preset="perspective">Perspective</button><button type="button" class="ghost-button" data-scene-preset="top">Dessus</button><button type="button" class="ghost-button" data-scene-preset="side">Côté</button><button type="button" class="text-button" data-scene-preset="reset">Recentrer</button></div><label for="scene-spread">Éclatement guidé <output id="scene-spread-value"></output><input id="scene-spread" type="range" min="0" max="100" value="${Math.round(state.spread*100)}"></label><label for="scene-zoom">Zoom <output id="scene-zoom-value"></output><input id="scene-zoom" type="range" min="60" max="180" value="${Math.round(state.zoom*100)}"></label></div>
    <div class="scene-layout"><div class="scene-stage"><canvas id="component-scene" tabindex="0" role="img" aria-label="Vue 3D éclatée des composants connus" aria-describedby="scene-instructions"></canvas><p id="scene-instructions" class="hint">Glisser pour tourner · molette ou deux doigts pour zoomer. Au clavier : flèches, + et −, R pour recentrer. La sélection ci-dessous donne aussi accès à chaque composant.</p><p id="scene-limit" class="hint" hidden></p></div><aside id="scene-selection" class="scene-selection" aria-label="Composant sélectionné" aria-live="polite"></aside></div>
    <label class="scene-picker" for="scene-component-select">Composant à consulter<select id="scene-component-select">${rows.length?rows.map((row)=>`<option value="${esc(row.id)}">${esc(row.name)} · ${esc(placementLabel(row,configuration))}</option>`).join(''):'<option value="">Aucun composant renseigné</option>'}</select></label>
    ${!rows.length?'<div class="scene-empty"><h3>Une silhouette, aucun équipement supposé.</h3><p class="hint">Ajouter un composant ou une intervention qui le mentionne pour commencer. Un contrôle suffit à documenter sa présence.</p></div>':''}</section>`;
  const $=(selector)=>container.querySelector(selector), abort=new AbortController();
  let scene;
  const select=(id)=>{
    state.selected=id;const row=rows.find((row)=>row.id===id);if(!row)return;
    $('#scene-component-select').value=id;
    const life=componentLife(vehicle,row);
    $('#scene-selection').innerHTML=`<p class="eyebrow">${row.stored?'COMPOSANT RENSEIGNÉ':'REPÉRÉ DANS L’HISTORIQUE'}</p><h3>${esc(row.name)}</h3><p class="hint">${esc(COMPONENT_KINDS[row.spatial.kind])}</p><p class="scene-position">${esc(placementLabel(row,configuration))}</p><span class="status-pill" data-status="${life.status}">${statuses[life.status]}</span><p class="reference-note">Le repère d’entretien ne décrit pas l’état réel de la pièce. Un contrôle ne réinitialise pas un remplacement.</p><button type="button" class="ghost-button" data-edit-component="${esc(row.id)}">${row.stored?'Préciser le composant':'Enregistrer et préciser'}</button><h4>Fiches qui le documentent</h4>${row.sources.length?chronological(row.sources).slice(0,8).map((record)=>`<button type="button" class="text-button" data-record="${esc(record.id)}">${esc(record.title)}<small>${record.date??'Date inconnue'}</small></button>`).join(''):'<p class="hint">Composant ajouté manuellement.</p>'}${row.sources.length>8?`<button type="button" class="text-button" data-component="${esc(row.id)}">Voir les ${row.sources.length} fiches</button>`:''}`;
    let visible=rows.slice(0,80);if(!visible.some((part)=>part.id===id))visible=[...visible.slice(0,79),row];
    scene?.update(visible,id,configuration);
    $('#scene-limit').hidden=rows.length<=80;
    $('#scene-limit').textContent=`Vue limitée à ${Math.min(80,rows.length)} fiches sur ${rows.length}. Affiner la recherche pour alléger la vue ; toutes restent accessibles dans la sélection.`;
  };
  const sync=(camera,frame)=>{
    $('#scene-spread').value=Math.round(camera.spread*100);$('#scene-zoom').value=Math.round(camera.zoom*100);$('#scene-spread-value').textContent=Math.round(camera.spread*100)+' %';$('#scene-zoom-value').textContent=Math.round(camera.zoom*100)+' %';
    if(frame && frame.totalInstances>frame.renderedInstances){$('#scene-limit').hidden=false;$('#scene-limit').textContent=`${frame.renderedInstances} emplacements dessinés sur ${frame.totalInstances}. Toutes les fiches restent accessibles par la sélection.`;}
  };
  try { if($('#component-scene').getContext('2d'))scene=new ComponentScene($('#component-scene'),state,select,sync); }
  catch { /* The native selector and component details remain available. */ }
  if(!scene)$('#scene-instructions').textContent='L’affichage 3D est indisponible dans ce navigateur. La sélection des composants et leurs fiches restent accessibles.';
  $('#scene-component-select').addEventListener('change',(event)=>select(event.target.value),{signal:abort.signal});
  for(const name of ['spread','zoom'])$('#scene-'+name).addEventListener('input',(event)=>{state[name]=Number(event.target.value)/100;scene?.draw();sync(state);},{signal:abort.signal});
  container.addEventListener('click',(event)=>{
    const button=event.target.closest('[data-scene-preset]');if(!button)return;
    const preset=button.dataset.scenePreset;
    Object.assign(state,preset==='top'?{yaw:0,pitch:1.48}:preset==='side'?{yaw:0,pitch:0}:{yaw:-.6,pitch:.48,zoom:1});scene?.draw();sync(state);
  },{signal:abort.signal});
  sync(state);
  if(rows.length)select(rows.some((row)=>row.id===state.selected)?state.selected:rows[0].id);
  else {$('#scene-selection').innerHTML='<h3>Aucun composant connu</h3><p class="hint">La présence et l’emplacement des pièces se précisent avec l’historique.</p>';scene?.update([],null,configuration);}
  return ()=>{abort.abort();scene?.dispose();};
}
