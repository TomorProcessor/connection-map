import { DEFAULT_TYPES, LIMITS, pairKey, emptyGraph, normalizeGraph, demoGraph, filteredConnections, embeddedness, extractBackbone } from './graph.js';
import { preparePhoto } from './photos.js';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE_KEY = 'circles.personal-map.v1';
let graph, storageWarning = false;
try { const saved = localStorage.getItem(STORAGE_KEY); graph = saved ? normalizeGraph(JSON.parse(saved)) : demoGraph(); }
catch { graph = demoGraph(); storageWarning = true; }
let enabled = new Set(graph.types.map(t => t.id)), selected = null, previous = null;
let visible = [], allFiltered = [], scores = [], positions = new Map(), nodeEls = new Map(), edgeEls = [];
let width = 1000, height = 700, camera = { x: 0, y: 0, k: 1 }, ticksLeft = 0, animation = 0, toastTimer;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dialog = $('dialog'), viewport = $('viewport'), svg = $('graph'), stage = $('graphStage');

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(graph)); $('saveStatus').textContent = 'Saved in this browser'; $('saveStatus').classList.remove('unsaved'); storageWarning = false; }
  catch { $('saveStatus').textContent = 'Not saved — export your map'; $('saveStatus').classList.add('unsaved'); storageWarning = true; }
}
function notify(message, undo = false) {
  clearTimeout(toastTimer); $('toastText').textContent = message; $('undoButton').hidden = !undo; $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, 6500);
}
function commit(change, message) {
  const next = structuredClone(graph);
  try { change(next); const normalized = normalizeGraph(next); previous = structuredClone(graph); graph = normalized; }
  catch (error) { showError(error.message); return false; }
  save(); enabled = new Set([...enabled].filter(id => graph.types.some(t => t.id === id)));
  if (!graph.people.some(p => p.id === selected)) selected = null;
  render(true); if (storageWarning) notify('Browser storage is full or unavailable. Export your map to keep your changes.'); else if (message) notify(message, true);
  return true;
}
function undo() {
  if (!previous) return;
  [graph, previous] = [previous, graph]; enabled = new Set(graph.types.map(t => t.id)); selected = null; save(); render(true); notify('Change undone.');
}
$('undoButton').addEventListener('click', undo);
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !dialog.open) { e.preventDefault(); undo(); } });
function hash(text) { let n = 0; for (const c of text) n = ((n << 5) - n + c.charCodeAt(0)) | 0; return Math.abs(n); }
function makeSvg(tag, attrs = {}) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); return e; }
function initials(name) { return name.split(/\s+/).slice(0,2).map(s => [...s][0]).join('').toLocaleUpperCase(); }
function typeById(id) { return graph.types.find(t => t.id === id); }
function fillAvatar(element, name, photo) {
  element.replaceChildren();
  const fallback = document.createElement('span'); fallback.textContent = initials(name || '?'); element.append(fallback);
  if (!photo) return;
  const image = new Image(); image.alt = ''; image.onload = () => fallback.hidden = true;
  image.onerror = () => { image.remove(); fallback.hidden = false; };
  image.src = photo; element.append(image);
}

function render(recompute = false) {
  const typeCounts = new Map(graph.types.map(t => [t.id,0]));
  for (const e of graph.connections) for (const id of e.types) typeCounts.set(id,typeCounts.get(id)+1);
  $('typeFilters').replaceChildren();
  for (const type of graph.types) {
    const label = document.createElement('label'); label.className = 'type-filter';
    label.innerHTML = `<input type="checkbox" ${enabled.has(type.id) ? 'checked' : ''}><span class="type-dot" style="--type-color:${type.color}"></span><span class="type-name">${esc(type.name)}</span><span class="type-count">${typeCounts.get(type.id)}</span>`;
    label.querySelector('input').addEventListener('change', e => { if (e.target.checked) enabled.add(type.id); else enabled.delete(type.id); rebuildGraph(true); });
    $('typeFilters').append(label);
  }
  $('demoBadge').hidden = !graph.demo;
  $('startBlank').hidden = !graph.demo;
  $('peopleCount').textContent = graph.people.length;
  $('connectionCount').textContent = graph.connections.length;
  $('addPerson').disabled = graph.people.length >= LIMITS.people;
  $('addType').disabled = graph.types.length >= LIMITS.types;
  $('addConnection').disabled = graph.people.length < 2 || !graph.types.length;
  $('exportButton').disabled = !graph.people.length;
  $('emptyState').hidden = !!graph.people.length;
  rebuildGraph(recompute);
}
function rebuildGraph(recompute = false) {
  allFiltered = filteredConnections(graph, enabled);
  if (recompute) scores = null;
  if ($('backboneToggle').checked) {
    if (!scores) scores = embeddedness(graph.people, allFiltered);
    visible = extractBackbone(graph.people, allFiltered, Number($('keepRange').value)/100, scores);
  } else visible = allFiltered;
  $('backboneControls').hidden = !$('backboneToggle').checked;
  $('keepValue').textContent = `${$('keepRange').value}%`;
  $('shownCount').textContent = visible.length !== graph.connections.length ? `${visible.length} shown` : '';
  $('viewLabel').textContent = $('backboneToggle').checked ? `Backbone · ${visible.length} of ${allFiltered.length} connections` : enabled.size === graph.types.length ? 'All connections' : `${enabled.size} relation ${enabled.size === 1 ? 'type' : 'types'} selected`;
  const ids = new Set(graph.people.map(p=>p.id));
  for (const id of positions.keys()) if (!ids.has(id)) positions.delete(id);
  graph.people.forEach((p, i) => {
    if (!positions.has(p.id)) {
      const theta = i * 2.39996 + hash(p.id) % 20 / 10, radius = 50 + Math.sqrt(i + 1) * 40;
      positions.set(p.id, { x: width/2 + Math.cos(theta)*radius, y: height/2 + Math.sin(theta)*radius, vx:0,vy:0,fixed:false });
    }
  });
  $('edgeLayer').replaceChildren(); $('nodeLayer').replaceChildren(); nodeEls.clear(); edgeEls=[];
  for (const edge of visible) {
    edge.types.forEach((typeId,i) => {
      const line = makeSvg('line', { class:'graph-edge', stroke:typeById(typeId).color, 'stroke-width':1.35 });
      $('edgeLayer').append(line); edgeEls.push({ line, edge, offset:(i-(edge.types.length-1)/2)*3.5 });
    });
  }
  const colors = ['#d8dfc2','#d2ded3','#e8d8cf','#d6ddec','#dfd5e5','#e9dfbc'];
  for (const [index, person] of graph.people.entries()) {
    const group = makeSvg('g', { class:'graph-node', 'data-id':person.id, tabindex:'0', role:'button', 'aria-label':`View ${person.name}` });
    const title = makeSvg('title'); title.textContent = person.name; group.append(title);
    group.append(makeSvg('circle',{r:27,class:'node-ring'}));
    group.append(makeSvg('circle',{r:22,class:'node-face',fill:colors[hash(person.id)%colors.length]}));
    const initial = makeSvg('text',{class:'initial','text-anchor':'middle',dy:4}); initial.textContent=initials(person.name); group.append(initial);
    if (person.photo) {
      const clipId = `person-photo-${index}`;
      const defs = makeSvg('defs'), clip = makeSvg('clipPath', {id:clipId});
      clip.append(makeSvg('circle', {r:20})); defs.append(clip); group.append(defs);
      const photo = makeSvg('image', {href:person.photo,x:-20,y:-20,width:40,height:40,preserveAspectRatio:'xMidYMid slice','clip-path':`url(#${clipId})`,class:'node-photo'});
      photo.onload = () => initial.setAttribute('visibility','hidden');
      photo.onerror = () => { photo.remove(); initial.removeAttribute('visibility'); };
      group.append(photo);
    }
    const name = makeSvg('text',{class:'node-name','text-anchor':'middle',dy:39}); name.textContent=person.name.length>22 ? person.name.slice(0,20)+'…' : person.name; group.append(name);
    group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPerson(person.id);}});
    $('nodeLayer').append(group); nodeEls.set(person.id,group);
  }
  updatePositions(); highlight(); renderCard(); restart();
}
function updatePositions() {
  for (const [id,element] of nodeEls) { const p=positions.get(id); element.setAttribute('transform',`translate(${p.x},${p.y})`); }
  for (const {line,edge,offset} of edgeEls) {
    const a=positions.get(edge.source),b=positions.get(edge.target),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ox=-dy/d*offset,oy=dx/d*offset;
    line.setAttribute('x1',a.x+ox);line.setAttribute('y1',a.y+oy);line.setAttribute('x2',b.x+ox);line.setAttribute('y2',b.y+oy);
  }
}
function tick() {
  const nodes=[...positions.values()];
  const heat=Math.max(.12, Math.min(1,ticksLeft/100));
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j];let dx=b.x-a.x,dy=b.y-a.y;
    if(Math.abs(dx)+Math.abs(dy)<.01){dx=.1;dy=.1;}
    const d2=Math.max(600,dx*dx+dy*dy),f=2200*heat/d2,dist=Math.sqrt(d2);
    a.vx-=dx/dist*f;b.vx+=dx/dist*f;a.vy-=dy/dist*f;b.vy+=dy/dist*f;
  }
  for(const edge of visible){const a=positions.get(edge.source),b=positions.get(edge.target),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,f=(d-105)*.012*heat;a.vx+=dx/d*f;b.vx-=dx/d*f;a.vy+=dy/d*f;b.vy-=dy/d*f;}
  for(const p of nodes){if(p.fixed){p.vx=0;p.vy=0;continue;}p.vx+=(width/2-p.x)*.0009*heat;p.vy+=(height/2-p.y)*.0009*heat;p.vx*=.8;p.vy*=.8;p.x+=p.vx;p.y+=p.vy;}
  updatePositions();
}
function restart() { ticksLeft=180;if(!animation) animation=requestAnimationFrame(animate); }
function animate() {
  if(reducedMotion){for(let i=0;i<120;i++){tick();ticksLeft--;}ticksLeft=0;}
  else {tick();ticksLeft--;}
  if(ticksLeft>0)animation=requestAnimationFrame(animate);else {animation=0;if(needsFit){needsFit=false;fitMap();}}
}
let needsFit=true;
function updateCamera() { viewport.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.k})`); }
function fitMap() {
  if(!positions.size){camera={x:0,y:0,k:1};updateCamera();return;}
  const ps=[...positions.values()],minX=Math.min(...ps.map(p=>p.x))-65,maxX=Math.max(...ps.map(p=>p.x))+65,minY=Math.min(...ps.map(p=>p.y))-55,maxY=Math.max(...ps.map(p=>p.y))+65;
  camera.k=Math.max(.12,Math.min(1.45,(width-55)/(maxX-minX),(height-80)/(maxY-minY)));
  camera.x=width/2-(minX+maxX)/2*camera.k;camera.y=height/2-(minY+maxY)/2*camera.k;updateCamera();
}
function zoom(factor,x=width/2,y=height/2){const k=Math.max(.1,Math.min(4,camera.k*factor)),r=k/camera.k;camera.x=x-(x-camera.x)*r;camera.y=y-(y-camera.y)*r;camera.k=k;updateCamera();}
$('fitMap').addEventListener('click',fitMap);$('zoomIn').addEventListener('click',()=>zoom(1.25));$('zoomOut').addEventListener('click',()=>zoom(.8));
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0012),e.clientX-r.left,e.clientY-r.top);},{passive:false});
let gesture=null;
svg.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const target=e.target.closest('.graph-node'),id=target?.dataset.id;
  gesture={pointerId:e.pointerId,id,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
  svg.setPointerCapture(e.pointerId);if(id)positions.get(id).fixed=true;else svg.classList.add('panning');
});
svg.addEventListener('pointermove',e=>{
  if(!gesture||gesture.pointerId!==e.pointerId)return;
  const dx=e.clientX-gesture.lastX,dy=e.clientY-gesture.lastY;
  if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>4)gesture.moved=true;
  if(gesture.id){const p=positions.get(gesture.id);p.x+=dx/camera.k;p.y+=dy/camera.k;updatePositions();}
  else{camera.x+=dx;camera.y+=dy;updateCamera();}
  gesture.lastX=e.clientX;gesture.lastY=e.clientY;
});
function endGesture(e,cancel=false){if(!gesture||gesture.pointerId!==e.pointerId)return;if(!cancel&&!gesture.moved)selectPerson(gesture.id||null);gesture=null;svg.classList.remove('panning');}
svg.addEventListener('pointerup',e=>endGesture(e));svg.addEventListener('pointercancel',e=>endGesture(e,true));
new ResizeObserver(()=>{const r=stage.getBoundingClientRect();width=r.width;height=r.height;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);fitMap();}).observe(stage);

function selectPerson(id){selected=id;highlight();renderCard();}
function highlight(){
  const query=$('search').value.trim().toLocaleLowerCase();
  const matches=new Set(graph.people.filter(p=>p.name.toLocaleLowerCase().includes(query)).map(p=>p.id));
  const neighbors=new Set([selected]);
  for(const e of visible){if(e.source===selected)neighbors.add(e.target);if(e.target===selected)neighbors.add(e.source);}
  for(const [id,el] of nodeEls){el.classList.toggle('selected',id===selected);el.classList.toggle('dim',query?!matches.has(id):selected&&!neighbors.has(id));}
  for(const {line,edge} of edgeEls)line.style.opacity=query?(matches.has(edge.source)||matches.has(edge.target)?'.55':'.06'):selected?(edge.source===selected||edge.target===selected?'.85':'.07'):'.43';
  $('searchStatus').hidden=!query;
  $('searchStatus').textContent=matches.size?`${matches.size} ${matches.size===1?'person':'people'} found`:'No people found';
  document.querySelector('.view-label').hidden=!!query;
}
$('search').addEventListener('input',()=>{selected=null;highlight();renderCard();});
$('search').addEventListener('keydown',e=>{if(e.key==='Escape'){e.target.value='';highlight();}if(e.key==='Enter'){const found=graph.people.filter(p=>p.name.toLocaleLowerCase().includes(e.target.value.trim().toLocaleLowerCase()));if(found.length===1)selectPerson(found[0].id);}});
function renderCard(){
  const p=graph.people.find(p=>p.id===selected);$('personCard').hidden=!p;if(!p)return;
  const edges=graph.connections.filter(e=>e.source===p.id||e.target===p.id);
  $('personCard').innerHTML=`<button class="close-card" aria-label="Close person details">×</button><div class="eyebrow">A PERSON IN YOUR MAP</div><h2>${esc(p.name)}</h2><div class="card-caption">${edges.length} ${edges.length===1?'connection':'connections'}</div><div class="card-actions"><button class="button primary" data-action="connect">＋ Connect</button><button class="button secondary" data-action="edit">Edit person</button></div><div class="card-connections">${edges.length?'': '<p class="small-copy">A new connection is a good place to start.</p>'}${edges.map(e=>{const other=graph.people.find(n=>n.id===(e.source===p.id?e.target:e.source));return `<button class="connection-row" data-other="${esc(other.id)}" title="Edit connection with ${esc(other.name)}"><span>${esc(other.name)}</span><span class="relation-dots" aria-label="${esc(e.types.map(id=>typeById(id).name).join(', '))}">${e.types.map(id=>`<span class="type-dot" style="--type-color:${typeById(id).color}"></span>`).join('')}</span></button>`;}).join('')}</div>`;
  const avatar=document.createElement('div');avatar.className=p.photo?'avatar card-avatar card-photo':'avatar card-avatar';avatar.setAttribute('aria-hidden','true');
  $('personCard').querySelector('h2').before(avatar);fillAvatar(avatar,p.name,p.photo);
  $('personCard').querySelector('.close-card').onclick=()=>selectPerson(null);
  $('personCard').querySelector('[data-action=edit]').onclick=()=>personDialog(p.id);
  $('personCard').querySelector('[data-action=connect]').onclick=()=>connectionDialog(p.id);
  for(const b of $('personCard').querySelectorAll('[data-other]'))b.onclick=()=>connectionDialog(p.id,b.dataset.other);
}
function openDialog(title,body,setup){
  $('dialogContent').innerHTML=`<div class="dialog-header"><h2>${esc(title)}</h2><button type="button" id="closeDialog" aria-label="Close dialog">×</button></div>${body}`;
  $('closeDialog').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();setup?.();
}
function showError(message){const element=$('formError');if(element){element.textContent=message;element.hidden=false;}else notify(message);}
const errorField='<p id="formError" class="form-error" role="alert" hidden></p>';
function personDialog(id){
  const person=graph.people.find(p=>p.id===id);
  let photo=person?.photo,generation=0;
  openDialog(person?'Edit person':'Someone new',`<p class="dialog-copy">A name, and a picture if you like.</p><form id="personForm"><label class="field-label" for="personName">Name</label><input class="form-control" id="personName" name="name" maxlength="80" placeholder="e.g. Anna Kovács" autocomplete="off" required value="${esc(person?.name||'')}" autofocus><span class="field-label">Profile picture <span class="optional-label">optional</span></span><div class="photo-editor"><div class="avatar photo-preview" id="photoPreview" role="img" aria-label="Profile picture preview"></div><div class="photo-actions"><input type="file" id="personPhoto" accept="image/jpeg,image/png,image/webp" hidden><div class="photo-buttons"><button type="button" class="button secondary" id="choosePhoto">${photo?'Change picture':'Choose picture'}</button><button type="button" class="text-button" id="removePhoto" ${photo?'':'hidden'}>Remove picture</button></div><p class="photo-note" id="photoStatus" aria-live="polite">JPEG, PNG or WebP · up to 10 MB<br>Cropped to a square and saved on this device.</p></div></div>${errorField}<div class="dialog-actions">${person?'<button type="button" class="button danger" id="removePerson">Remove</button>':''}<button type="button" class="button secondary" id="cancelForm">Cancel</button><button class="button primary" id="savePerson" type="submit">${person?'Save changes':'Add person'}</button></div></form>`,()=>{
    const form=$('personForm'),name=$('personName'),preview=$('photoPreview'),input=$('personPhoto'),choose=$('choosePhoto'),remove=$('removePhoto'),submit=$('savePerson'),status=$('photoStatus'),error=$('formError');
    const refreshPhoto=()=>{fillAvatar(preview,name.value.trim()||'?',photo);choose.textContent=photo?'Change picture':'Choose picture';remove.hidden=!photo;};
    refreshPhoto();name.addEventListener('input',refreshPhoto);
    choose.onclick=()=>input.click();
    remove.onclick=()=>{generation++;photo=undefined;submit.disabled=false;status.textContent='Picture removed. Save your changes to keep the initials.';refreshPhoto();};
    input.onchange=async()=>{
      const file=input.files[0];input.value='';if(!file)return;
      const current=++generation;submit.disabled=true;status.textContent='Preparing picture…';error.hidden=true;
      try {
        const prepared=await preparePhoto(file);
        if(current!==generation||!form.isConnected)return;
        photo=prepared;refreshPhoto();status.textContent='Picture ready. It stays on this device and in your JSON backups.';
      } catch(e) {if(current===generation&&form.isConnected){error.textContent=e.message;error.hidden=false;status.textContent='Choose another picture, or keep the current one.';}}
      finally {if(current===generation&&form.isConnected)submit.disabled=false;}
    };
    $('cancelForm').onclick=()=>dialog.close();
    form.onsubmit=e=>{e.preventDefault();if(submit.disabled)return;const personName=name.value.trim();if(!personName)return showError('Enter a name.');const newId=id||crypto.randomUUID();if(commit(g=>{let target;if(person){target=g.people.find(p=>p.id===id);target.name=personName;}else{target={id:newId,name:personName};g.people.push(target);}if(photo)target.photo=photo;else delete target.photo;},person?'Person updated.':'Person added.')){dialog.close();selectPerson(newId);if(!person)needsFit=true;}};
    if(person)$('removePerson').onclick=()=>confirmDialog('Remove this person?',`This removes ${person.name} and their ${graph.connections.filter(e=>e.source===id||e.target===id).length} connections. You can undo this.`,()=>{commit(g=>{g.people=g.people.filter(p=>p.id!==id);g.connections=g.connections.filter(e=>e.source!==id&&e.target!==id);},'Person removed.');},'Remove person');
  });
}
function personOptions(value){return `<option value="">Choose a person</option>`+[...graph.people].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${esc(p.id)}" ${p.id===value?'selected':''}>${esc(p.name)}</option>`).join('');}
function connectionDialog(source='',target=''){
  if(graph.people.length<2)return notify('Add at least two people first.');
  const existing=source&&target?graph.connections.find(e=>pairKey(e.source,e.target)===pairKey(source,target)):null;
  openDialog(existing?'Their connection':'Connect two people',`<p class="dialog-copy">What connects them? Choose one or more relation types.</p><form id="connectionForm"><label class="field-label" for="sourcePerson">First person</label><select class="form-control" id="sourcePerson" required>${personOptions(source)}</select><label class="field-label" for="targetPerson">Second person</label><select class="form-control" id="targetPerson" required>${personOptions(target)}</select><span class="field-label" id="relationLabel">Relation types</span><div class="check-grid" role="group" aria-labelledby="relationLabel">${graph.types.map(t=>`<label class="type-filter"><input type="checkbox" name="type" value="${esc(t.id)}" ${existing?.types.includes(t.id)?'checked':''}><span class="type-dot" style="--type-color:${t.color}"></span><span class="type-name">${esc(t.name)}</span></label>`).join('')}</div>${errorField}<div class="dialog-actions"><button type="button" class="button danger" id="removeConnection" ${existing?'':'hidden'}>Remove</button><button type="button" class="button secondary" id="cancelForm">Cancel</button><button class="button primary" type="submit">Save connection</button></div></form>`,()=>{
    $('cancelForm').onclick=()=>dialog.close();
    const syncTypes=()=>{const s=$('sourcePerson').value,t=$('targetPerson').value,edge=graph.connections.find(e=>pairKey(e.source,e.target)===pairKey(s,t));for(const box of $('connectionForm').querySelectorAll('input[name=type]'))box.checked=!!edge?.types.includes(box.value);$('removeConnection').hidden=!edge;};
    $('sourcePerson').onchange=syncTypes;$('targetPerson').onchange=syncTypes;
    $('connectionForm').onsubmit=e=>{e.preventDefault();const s=$('sourcePerson').value,t=$('targetPerson').value,types=[...$('connectionForm').querySelectorAll('input[name=type]:checked')].map(b=>b.value);if(s===t)return showError('Choose two different people.');if(!types.length)return showError('Choose at least one relation type.');if(commit(g=>{const prior=g.connections.find(e=>pairKey(e.source,e.target)===pairKey(s,t));if(prior)prior.types=types;else g.connections.push({source:s,target:t,types});},'Connection saved.'))dialog.close();};
    $('removeConnection').onclick=()=>{const key=pairKey($('sourcePerson').value,$('targetPerson').value);if(commit(g=>g.connections=g.connections.filter(e=>pairKey(e.source,e.target)!==key),'Connection removed.'))dialog.close();};
  });
}
function typeDialog(){
  openDialog('A new way to connect',`<p class="dialog-copy">Name your relation type and give it a color.</p><form id="typeForm"><div class="color-row"><div><label class="field-label" for="typeName">Relation type</label><input class="form-control" id="typeName" maxlength="32" placeholder="e.g. Discord" required autofocus></div><div><label class="field-label" for="typeColor">Color</label><input class="form-control" type="color" id="typeColor" value="#c38b46"></div></div>${errorField}<div class="dialog-actions"><button type="button" class="button secondary" id="cancelForm">Cancel</button><button class="button primary" type="submit">Add type</button></div></form>`,()=>{
    $('cancelForm').onclick=()=>dialog.close();$('typeForm').onsubmit=e=>{e.preventDefault();const name=$('typeName').value.trim();if(!name)return showError('Enter a relation type.');if(graph.types.some(t=>t.name.toLocaleLowerCase()===name.toLocaleLowerCase()))return showError('That relation type already exists.');const id=crypto.randomUUID();if(commit(g=>g.types.push({id,name,color:$('typeColor').value}),'Relation type added.')){enabled.add(id);render(true);dialog.close();}};
  });
}
function confirmDialog(title,message,action,label='Continue'){
  openDialog(title,`<p class="dialog-copy">${esc(message)}</p><div class="dialog-actions"><button id="cancelConfirm" class="button secondary">Cancel</button><button id="confirmAction" class="button primary">${esc(label)}</button></div>`,()=>{$('cancelConfirm').onclick=()=>dialog.close();$('confirmAction').onclick=()=>{dialog.close();action();};});
}
function replaceGraph(next,message){previous=structuredClone(graph);graph=next;enabled=new Set(graph.types.map(t=>t.id));selected=null;positions.clear();$('search').value='';save();needsFit=true;render(true);notify(storageWarning?'Map loaded, but browser storage is unavailable. Export a copy.':message,true);}
function startBlank(){confirmDialog('Start your own circle?',graph.demo?'This replaces the example with an empty map. Your first person can be anyone.':'This clears the current map. Export a backup first if you want to keep a copy. You can undo this.',()=>replaceGraph(emptyGraph(),'A fresh map. Start with one person.'),'Start a blank map');}
function exportMap(){const data=JSON.stringify(graph,null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`circles-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Map exported. Keep this file as your backup.');}
$('importButton').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>40*1024*1024)return notify('Choose a JSON file smaller than 40 MB.');try{const next=normalizeGraph(JSON.parse(await file.text()));confirmDialog('Import this map?',`${next.people.length} people and ${next.connections.length} connections. This replaces the current map; you can undo the import.`,()=>replaceGraph(next,'Map imported.'),'Import map');}catch(error){notify(error instanceof SyntaxError?'This file is not valid JSON. Your current map is unchanged.':error.message);}};
$('exportButton').onclick=exportMap;
$('dataMenu').onclick=()=>openDialog('Your map',`<p class="dialog-copy">Your people and connections are saved in this browser. A JSON export lets you back up your map or move it to another device.</p><div class="options-list"><button id="optionExport" class="button secondary">↗ Export a backup</button><button id="optionBlank" class="button secondary">＋ Start a blank map</button><button id="optionDemo" class="button secondary">✳ Load the example map</button></div>`,()=>{$('optionExport').onclick=exportMap;$('optionBlank').onclick=startBlank;$('optionDemo').onclick=()=>confirmDialog('Load the example?', 'This replaces the current map with fictional people. You can undo the change.',()=>replaceGraph(demoGraph(),'Example map loaded.'),'Load example');});
$('helpButton').onclick=()=>openDialog('A little perspective.',`<p class="dialog-copy">A person is a dot. A connection is a line. Its color tells you what connects two people.</p><p class="dialog-copy">Add your people, connect them, then choose which relation types to explore. Click a person to edit them or their connections. You can drag people around, pan the canvas, and zoom.</p><p class="dialog-copy"><strong>Backbone view</strong> selects fewer connections to help groups stand out. It keeps enough bridges to preserve connected groups, so the actual number retained may be above the slider target. Every person and connection stays saved.</p><div class="help-note">Your map stays on this device. There is no Facebook login, crawler, tracking, or data upload. Export a JSON file for a backup. Circles JSON and old Lost Circles JSON exports can be imported.</div><div class="dialog-actions"><button id="helpDone" class="button primary">Got it</button></div>`,()=>{$('helpDone').onclick=()=>dialog.close();});
$('addPerson').onclick=()=>personDialog();$('emptyAdd').onclick=()=>personDialog();$('addConnection').onclick=()=>connectionDialog(selected||'');$('addType').onclick=typeDialog;$('startBlank').onclick=startBlank;
$('allTypes').onclick=()=>{enabled=new Set(graph.types.map(t=>t.id));render(true);};
$('backboneToggle').onchange=()=>rebuildGraph();$('keepRange').oninput=()=>rebuildGraph();
render(true);
if(storageWarning){$('saveStatus').textContent='Saved map unavailable — showing example';$('saveStatus').classList.add('unsaved');notify('Could not load your saved map. Your saved data has not been overwritten.');}
