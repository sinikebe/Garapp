/** Small software 3D renderer: real volumes, orthographic camera, depth ordering and face picking. */
const point = (x, y, z) => [x, y, z];
const add = (a, b) => a.map((value, index) => value + b[index]);
const colors = { battery: '#c09a45', drum: '#b97d5b', disc: '#a5b5b9', pads: '#c18d70', braking: '#b68c77', tire: '#52727d', wheel: '#829aa1', engine: '#558d78', oil: '#6d9a77', coolant: '#6b9ea9', unknown: '#82978e' };

function box(w, h, d, offset = [0, 0, 0]) {
  const v = [[-w/2,-h/2,-d/2],[w/2,-h/2,-d/2],[w/2,h/2,-d/2],[-w/2,h/2,-d/2],[-w/2,-h/2,d/2],[w/2,-h/2,d/2],[w/2,h/2,d/2],[-w/2,h/2,d/2]].map((v) => add(v, offset));
  return [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]].map((face) => face.map((index) => v[index]));
}
function ring(radius, inner, depth, { segments = 16, vertical = false, offset = [0, 0, 0] } = {}) {
  const faces = [];
  const vertex = (r, angle, z) => {
    const v = [r * Math.cos(angle), r * Math.sin(angle), z];
    return add(vertical ? [v[0], v[2], v[1]] : v, offset);
  };
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2, z = depth / 2;
    const A = vertex(radius,a,-z), B = vertex(radius,b,-z), C = vertex(radius,b,z), D = vertex(radius,a,z);
    const E = vertex(inner,a,-z), F = vertex(inner,b,-z), G = vertex(inner,b,z), H = vertex(inner,a,z);
    faces.push([A,B,C,D], [A,E,F,B], [D,C,G,H]);
    if (inner) faces.push([E,H,G,F]);
  }
  return faces;
}

export function componentMesh(kind) {
  if (kind === 'tire') return ring(.42,.27,.24);
  if (kind === 'wheel') return [...ring(.36,.28,.16), ...box(.5,.06,.1), ...box(.06,.5,.1)];
  if (kind === 'disc') return [...ring(.37,.13,.055), ...ring(.15,.06,.14)];
  if (kind === 'drum') return [...ring(.34,.07,.23), ...ring(.36,.07,.045,{ offset:[0,0,-.12] })];
  if (kind === 'pads') return [...box(.42,.17,.12,[0,.1,0]), ...box(.42,.17,.12,[0,-.13,.12])];
  if (kind === 'belt') return ring(.4,.35,.09).map((face) => face.map(([x,y,z]) => [x,y * .65,z]));
  if (kind === 'battery') return [...box(.65,.42,.4), ...box(.12,.08,.1,[-.19,.25,0]), ...box(.12,.08,.1,[.19,.25,0])];
  if (kind === 'engine') return [...box(.72,.5,.55), ...box(.54,.13,.38,[0,.31,0]), ...ring(.17,0,.2,{offset:[.35,-.05,.25]})];
  if (kind === 'shock') return [...ring(.065,0,.9,{vertical:true}), ...Array.from({length:7},(_,i) => ring(.13,.08,.035,{vertical:true,offset:[0,-.3+i*.1,0]})).flat()];
  if (kind === 'sparkPlug') return [...ring(.045,0,.5,{vertical:true}), ...ring(.09,0,.2,{vertical:true,offset:[0,-.1,0]})];
  if (kind === 'oil' || kind === 'coolant') return [...box(.3,.48,.22), ...box(.12,.08,.12,[.06,.28,0])];
  if (kind === 'oilFilter' || kind === 'fuelFilter') return [...ring(.18,0,.38,{vertical:true}), ...ring(.2,.07,.04,{vertical:true,offset:[0,.21,0]})];
  if (kind === 'airFilter' || kind === 'cabinFilter') return [...box(.58,.07,.35), ...Array.from({length:8},(_,i) => box(.025,.045,.32,[-.25+i*.07,.05,0])).flat()];
  if (kind === 'wiper') return [...box(.8,.04,.055), ...box(.35,.035,.045,[-.08,.04,.08])];
  if (kind === 'exhaust') return [...ring(.14,0,.75), ...ring(.045,0,.65,{offset:[0,0,.6]})];
  if (kind === 'gearbox') return [...box(.5,.43,.5), ...ring(.14,0,.7)];
  if (kind === 'clutch') return [...ring(.32,.08,.12), ...ring(.2,.08,.18)];
  if (kind === 'steering') return [...box(.85,.09,.1), ...ring(.18,.14,.045,{offset:[0,.18,0]})];
  if (kind === 'braking') return [...ring(.32,.08,.12), ...box(.17,.38,.15,[.28,0,.04])];
  const top = [0,.34,0], bottom = [0,-.34,0], sides = [[.3,0,0],[0,0,.3],[-.3,0,0],[0,0,-.3]];
  return sides.flatMap((v,i) => [[top,v,sides[(i+1)%4]], [bottom,sides[(i+1)%4],v]]);
}

export function sceneLayout(parts, spread = .7) {
  const counts = new Map();
  let unplaced = 0;
  return parts.map((part) => {
    const { zone, side } = part.spatial, group = `${zone}-${side}`, index = counts.get(group) ?? 0;
    counts.set(group,index+1);
    const anchor = zone === 'front' ? [1.55,.25,0] : zone === 'rear' ? [-1.55,.25,0] : zone === 'cabin' ? [-.2,.8,0] : zone === 'engineBay' ? [1.1,.65,0] : zone === 'underbody' ? [0,-.15,0] : null;
    if (!anchor) {
      const slot = unplaced++;
      return { part, anchor:null, center:[-3.5-(slot%3)*.75,.25+Math.floor(slot/3)*.72,-1.3+(slot%3)*1.25] };
    }
    anchor[2] = side === 'left' ? -.86 : side === 'right' ? .86 : 0;
    const direction = [zone === 'front' || zone === 'engineBay' ? 1 : zone === 'rear' ? -1 : 0, zone === 'underbody' ? -.5 : 1, side === 'left' ? -1 : side === 'right' ? 1 : (index%2 ? -1 : 1)*.45];
    const center = add(anchor,[direction[0]*spread*(.6+index*.12), .2+index*.42+direction[1]*spread*.9, direction[2]*spread*.8]);
    return { part, anchor, center };
  });
}

export function rotatePoint([x,y,z], yaw, pitch) {
  const u = x*Math.cos(yaw)+z*Math.sin(yaw), v = z*Math.cos(yaw)-x*Math.sin(yaw);
  return [u,y*Math.cos(pitch)-v*Math.sin(pitch),y*Math.sin(pitch)+v*Math.cos(pitch)];
}
const body = [[-2.2,.08,-.88],[2.2,.08,-.88],[2.2,.08,.88],[-2.2,.08,.88],[-2.2,.08,-.88]];
export function projectScene(parts, { yaw = -.6, pitch = .48, zoom = 1, spread = .7 } = {}, width = 800, height = 440) {
  const layout = sceneLayout(parts,spread);
  const wire = [body, body.map(([x,y,z]) => [x,y+.42,z]), [[-1.4,.5,-.8],[-.9,1.25,-.68],[.65,1.25,-.68],[1.3,.5,-.8]], [[-1.4,.5,.8],[-.9,1.25,.68],[.65,1.25,.68],[1.3,.5,.8]], [[-.9,1.25,-.68],[-.9,1.25,.68]], [[.65,1.25,-.68],[.65,1.25,.68]]];
  const faces = layout.flatMap(({part,center}) => componentMesh(part.spatial.kind).map((vertices) => ({ id:part.id, color:colors[part.spatial.kind] ?? '#729487', vertices:vertices.map((v) => rotatePoint(add(v,center),yaw,pitch)) })));
  const bounds = [...wire.flat(), [2.7,0,0],[-2.7,0,0], ...layout.map((item) => item.center)].map((v) => rotatePoint(v,yaw,pitch));
  const xs = bounds.map((v) => v[0]), ys = bounds.map((v) => v[1]);
  const minX = Math.min(...xs)-.5, maxX = Math.max(...xs)+.5, minY = Math.min(...ys)-.5, maxY = Math.max(...ys)+.5;
  const scale = Math.min((width-70)/(maxX-minX),(height-70)/(maxY-minY))*zoom;
  const project = (v) => [width/2+(v[0]-(minX+maxX)/2)*scale,height/2-(v[1]-(minY+maxY)/2)*scale,v[2]];
  const world = (v) => project(rotatePoint(v,yaw,pitch));
  return {
    faces:faces.map((face) => ({ ...face, vertices:face.vertices.map(project), depth:face.vertices.reduce((sum,v)=>sum+v[2],0)/face.vertices.length })).sort((a,b)=>a.depth-b.depth),
    wire:wire.map((line)=>line.map(world)),
    markers:layout.map((item,index)=>({ id:item.part.id, name:item.part.name, index:index+1, center:world(item.center), anchor:item.anchor ? world(item.anchor) : null })),
    front:world([2.7,0,0]), rear:world([-2.7,0,0]), tray:world([-4.1,-.3,0]),
  };
}
export function hitComponent(faces, x, y) {
  for (let i=faces.length-1;i>=0;i--) {
    const vertices = faces[i].vertices;
    let inside = false;
    for (let a=0,b=vertices.length-1;a<vertices.length;b=a++) {
      const A=vertices[a],B=vertices[b];
      if ((A[1]>y)!==(B[1]>y) && x<(B[0]-A[0])*(y-A[1])/(B[1]-A[1])+A[0]) inside=!inside;
    }
    if (inside) return faces[i].id;
  }
  return null;
}
function shade(hex, amount) {
  return '#'+hex.slice(1).match(/../g).map((channel)=>Math.max(0,Math.min(255,Math.round(parseInt(channel,16)*amount))).toString(16).padStart(2,'0')).join('');
}

export class ComponentScene {
  constructor(canvas, state, select, onCamera = () => {}) {
    this.canvas=canvas; this.state=state; this.select=select; this.onCamera=onCamera; this.parts=[]; this.selected=null; this.abort=new AbortController(); this.pointers=new Map();
    const listen=(type,handler,options={})=>canvas.addEventListener(type,handler,{...options,signal:this.abort.signal});
    listen('pointerdown',(event)=>{ canvas.focus({preventScroll:true}); canvas.setPointerCapture(event.pointerId); this.pointers.set(event.pointerId,[event.clientX,event.clientY]); this.down=[event.clientX,event.clientY]; this.moved=false; });
    listen('pointermove',(event)=>{
      const last=this.pointers.get(event.pointerId); if(!last)return;
      const current=[event.clientX,event.clientY];
      if(Math.hypot(current[0]-this.down[0],current[1]-this.down[1])>5)this.moved=true;
      if(this.pointers.size===2){
        const other=[...this.pointers.entries()].find(([id])=>id!==event.pointerId)[1];
        const before=Math.hypot(last[0]-other[0],last[1]-other[1]),after=Math.hypot(current[0]-other[0],current[1]-other[1]);
        if(before>1)this.state.zoom=Math.max(.6,Math.min(1.8,this.state.zoom*after/before));
      }else{this.state.yaw+=(current[0]-last[0])*.012; this.state.pitch=Math.max(-.15,Math.min(1.5,this.state.pitch+(current[1]-last[1])*.009));}
      this.pointers.set(event.pointerId,current); this.draw();
    });
    listen('pointerup',(event)=>{ const clicked=!this.moved&&this.pointers.size===1; this.pointers.delete(event.pointerId); if(clicked&&this.frame){const box=canvas.getBoundingClientRect();const id=hitComponent(this.frame.faces,event.clientX-box.left,event.clientY-box.top);if(id)this.select(id);} });
    listen('pointercancel',(event)=>this.pointers.delete(event.pointerId));
    listen('wheel',(event)=>{event.preventDefault();this.state.zoom=Math.max(.6,Math.min(1.8,this.state.zoom*Math.exp(-event.deltaY*.001)));this.draw();},{passive:false});
    listen('keydown',(event)=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','r','Home'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='ArrowLeft')this.state.yaw-=.15;if(event.key==='ArrowRight')this.state.yaw+=.15;
      if(event.key==='ArrowUp')this.state.pitch=Math.min(1.5,this.state.pitch+.1);if(event.key==='ArrowDown')this.state.pitch=Math.max(-.15,this.state.pitch-.1);
      if(['+','='].includes(event.key))this.state.zoom=Math.min(1.8,this.state.zoom+.1);if(event.key==='-')this.state.zoom=Math.max(.6,this.state.zoom-.1);
      if(['r','Home'].includes(event.key))Object.assign(this.state,{yaw:-.6,pitch:.48,zoom:1});this.draw();
    });
    this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(canvas);
  }
  update(parts,selected){this.parts=parts;this.selected=selected;this.draw();}
  draw(){
    if(this.raf)cancelAnimationFrame(this.raf);
    this.raf=requestAnimationFrame(()=>{this.raf=null;this.paint();});
  }
  paint(){
    const canvas=this.canvas,ctx=canvas.getContext('2d');if(!ctx)return;
    const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    this.onCamera(this.state);
    const ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.scale(ratio,ratio);
    const frame=this.frame=projectScene(this.parts,this.state,width,height),ink=getComputedStyle(canvas).color;
    const stroke=(vertices,color,alpha=1)=>{ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.beginPath();vertices.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.stroke();ctx.globalAlpha=1;};
    ctx.lineWidth=1.2;frame.wire.forEach((line)=>stroke(line,ink,.22));
    for(const marker of frame.markers)if(marker.anchor){ctx.setLineDash([3,5]);stroke([marker.anchor,marker.center],ink,.2);ctx.setLineDash([]);}
    for(const face of frame.faces){
      const a=face.vertices[0],b=face.vertices[1],c=face.vertices[2];
      const light=.72+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/(1+Math.hypot(b[0]-a[0],b[1]-a[1])*Math.hypot(c[0]-a[0],c[1]-a[1]))*.3;
      ctx.beginPath();face.vertices.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.closePath();ctx.fillStyle=shade(face.color,light);ctx.fill();ctx.strokeStyle=face.id===this.selected?'#e4b453':shade(face.color,.62);ctx.lineWidth=face.id===this.selected?1.5:.45;ctx.stroke();
    }
    ctx.fillStyle=ink;ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('AVANT',frame.front[0],frame.front[1]+20);ctx.fillText('ARRIÈRE',frame.rear[0],frame.rear[1]+20);
    if(frame.markers.some((marker)=>!marker.anchor)){ctx.globalAlpha=.7;ctx.fillText('À PLACER',frame.tray[0],frame.tray[1]+16);ctx.globalAlpha=1;}
    for(const marker of frame.markers){
      if(this.parts.length>12&&marker.id!==this.selected)continue;
      ctx.font=marker.id===this.selected?'600 13px system-ui':'12px system-ui';ctx.fillStyle=ink;
      const label=marker.name.length>26?marker.name.slice(0,24)+'…':marker.name;ctx.fillText(label,marker.center[0],marker.center[1]-25);
    }
  }
  dispose(){this.abort.abort();this.observer.disconnect();if(this.raf)cancelAnimationFrame(this.raf);}
}
