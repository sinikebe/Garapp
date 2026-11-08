/** Optional vehicle covers refer to existing embedded documents, never remote URLs. */
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const unsupportedCompression = new Set(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']);
const embeddedUri = /^data:(?:image\/(?:png|jpeg|webp)|application\/(?:octet-stream|gltf-buffer));base64,[A-Za-z0-9+/]*={0,2}$/i;
let lastValidated;

export function visualKind(document) {
  if (/^image\/(?:jpeg|png|webp)$/i.test(document?.mimeType ?? '')) return 'image';
  if (document?.mimeType === 'model/gltf-binary' || document?.mimeType === 'application/octet-stream' && /\.glb$/i.test(document.name)) return 'model';
  return null;
}

export function validateGlb(bytes) {
  const fail = (message) => { throw Error(message); };
  if (bytes.length < 20) fail('Le fichier GLB est incomplet.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== bytes.length) fail('Le modèle doit être un fichier GLB version 2 valide.');
  const jsonLength = view.getUint32(12,true);
  if (view.getUint32(16,true) !== 0x4e4f534a || jsonLength % 4 || jsonLength > bytes.length - 20) fail('La description du modèle GLB est invalide.');
  let gltf;
  try { gltf = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(20,20 + jsonLength))); }
  catch { fail('La description du modèle GLB est illisible.'); }
  if (gltf?.asset?.version !== '2.0' || !Array.isArray(gltf.scenes) || !gltf.scenes.length) fail('Le modèle GLB doit contenir une scène glTF 2.0.');
  let offset = 20 + jsonLength;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('Le modèle GLB est tronqué.');
    const size = view.getUint32(offset,true);
    if (size % 4 || size > bytes.length - offset - 8) fail('Le modèle GLB est tronqué.');
    offset += 8 + size;
  }
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key,child] of Object.entries(value)) {
      if (unsupportedCompression.has(key) || (key === 'extensionsUsed' || key === 'extensionsRequired') && Array.isArray(child) && child.some((extension) => unsupportedCompression.has(extension))) fail('Réexporter le modèle GLB sans compression Draco, Meshopt ou KTX2 pour cet affichage hors connexion. Le fichier original peut être conservé dans les documents.');
      if (key === 'uri' && (typeof child !== 'string' || !embeddedUri.test(child))) fail('Le modèle GLB doit intégrer ses textures et ses données, sans fichier ni lien externe.');
      walk(child);
    }
  };
  walk(gltf);
  for (const image of gltf.images ?? []) if (image.mimeType && !/^image\/(?:jpeg|png|webp)$/i.test(image.mimeType)) fail('Les textures du modèle doivent être en JPEG, PNG ou WebP.');
  return gltf;
}

/** Structural checks complement the ordinary document/base64/size validation. */
export function validateVisualDocument(document) {
  const kind = visualKind(document);
  if (!kind) throw Error('Choisir une photo JPEG, PNG ou WebP, ou un modèle GLB autonome.');
  if (lastValidated?.dataUrl === document.dataUrl && lastValidated.kind === kind) return kind;
  const encoded = document.dataUrl.slice(document.dataUrl.indexOf(',') + 1);
  const head = Uint8Array.from(atob(encoded.slice(0,40)), (character) => character.charCodeAt(0));
  const imageValid = document.mimeType.toLowerCase() === 'image/jpeg' ? head[0] === 255 && head[1] === 216 && head[2] === 255
    : document.mimeType.toLowerCase() === 'image/png' ? [137,80,78,71,13,10,26,10].every((value,index) => head[index] === value)
    : document.mimeType.toLowerCase() === 'image/webp' ? String.fromCharCode(...head.slice(0,4)) === 'RIFF' && String.fromCharCode(...head.slice(8,12)) === 'WEBP' : false;
  if (kind === 'image' && !imageValid) throw Error('Le contenu du fichier ne correspond pas à une photo JPEG, PNG ou WebP valide.');
  if (kind === 'model') validateGlb(Uint8Array.from(atob(encoded),(character) => character.charCodeAt(0)));
  lastValidated = { dataUrl:document.dataUrl, kind };
  return kind;
}

export function vehicleCover(vehicle) {
  return vehicle?.coverDocumentId ? vehicle.documents?.find((document) => document.id === vehicle.coverDocumentId) ?? null : null;
}

export function vehicleVisualMarkup(vehicle) {
  const document = vehicleCover(vehicle);
  if (!document) return '';
  if (visualKind(document) === 'image') return `<figure class="vehicle-visual"><img src="${escape(document.dataUrl)}" alt="Photo de ${escape(vehicle.name)}" decoding="async"></figure>`;
  return `<figure class="vehicle-visual vehicle-model" aria-label="Modèle 3D de ${escape(vehicle.name)}"><div data-vehicle-model></div><p class="hint" role="status" data-model-status>Chargement du modèle 3D…</p><button type="button" class="text-button" data-model-reset hidden>Recentrer le modèle</button></figure>`;
}

let viewerModule;
export function mountVehicleModel(container, vehicle) {
  const host = container.querySelector('[data-vehicle-model]'), document = vehicleCover(vehicle);
  if (!host || !document) return () => {};
  let disposed = false, viewer;
  const controller = new AbortController();
  const status = container.querySelector('[data-model-status]'), reset = container.querySelector('[data-model-reset]');
  const fail = () => { if (disposed) return; host.hidden = true; reset.hidden = true; status.hidden = false; status.textContent = 'Le modèle ne peut pas être affiché sur cet appareil. Son fichier reste disponible dans la fiche du véhicule.'; };
  void (async () => {
    try {
      validateVisualDocument(document);
      const { ModelViewerElement } = await (viewerModule ??= import('../vendor/model-viewer/model-viewer.min.js'));
      if (disposed) return;
      // Embedded buffers/textures may create blob URLs; remote dependencies are never resolved.
      ModelViewerElement.mapURLs((url) => { if (!/^(?:data:|blob:)/i.test(url)) throw Error('Ressource externe non prise en charge.'); return url; });
      ModelViewerElement.modelCacheSize = 0;
      viewer = window.document.createElement('model-viewer');
      viewer.setAttribute('camera-controls',''); viewer.setAttribute('touch-action','pan-y');
      viewer.setAttribute('alt',`Modèle 3D de ${vehicle.name}`); viewer.setAttribute('interaction-prompt','none');
      viewer.setAttribute('loading','eager');
      viewer.addEventListener('load',() => { if (!disposed) { status.hidden = true; reset.hidden = false; } },{signal:controller.signal});
      viewer.addEventListener('error',fail,{signal:controller.signal});
      reset.addEventListener('click',() => { viewer.cameraOrbit = 'auto auto auto'; viewer.cameraTarget = 'auto auto auto'; viewer.fieldOfView = 'auto'; viewer.jumpCameraToGoal(); },{signal:controller.signal});
      host.append(viewer); viewer.src = document.dataUrl;
    } catch { fail(); }
  })();
  return () => { disposed = true; controller.abort(); viewer?.remove(); };
}
