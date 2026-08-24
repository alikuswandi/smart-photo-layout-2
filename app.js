const PAPER_SIZES={A4:{w:210,h:297,name:'A4'},F4:{w:210,h:330,name:'F4'},A3:{w:297,h:420,name:'A3'}};
const PHOTO_PRESETS=[{id:'2x3',name:'2 x 3 cm',w:20,h:30},{id:'3x4',name:'3 x 4 cm',w:30,h:40},{id:'4x6',name:'4 x 6 cm',w:40,h:60},{id:'2R',name:'2R (6x9)',w:60,h:90},{id:'3R',name:'3R (8.9x12.7)',w:89,h:127},{id:'4R',name:'4R (10.2x15.2)',w:102,h:152},{id:'5R',name:'5R (12.7x17.8)',w:127,h:178}];
const DEFAULT_ADJ={brightness:100,contrast:100,saturation:100,sepia:0,hueRotate:0,rotation:0,zoom:100,offsetX:0,offsetY:0,bgEnabled:false,bgColor:'#ff0000'};
const PHOTO_COLOR_PRESETS={normal:{brightness:100,contrast:100,saturation:100,sepia:0,hueRotate:0},warm:{brightness:103,contrast:104,saturation:110,sepia:12,hueRotate:-3},cool:{brightness:102,contrast:103,saturation:96,sepia:0,hueRotate:7},vivid:{brightness:102,contrast:112,saturation:128,sepia:0,hueRotate:0},soft:{brightness:106,contrast:92,saturation:92,sepia:3,hueRotate:0},bw:{brightness:103,contrast:112,saturation:0,sepia:0,hueRotate:0}};
const STORAGE_KEY='smartPhotoLayoutProject_v5';
const LEGACY_STORAGE_KEYS=['smartPhotoLayoutProject_v4','smartPhotoLayoutProject_v3'];
const PDF_CDN='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AI_CDNS=['https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm','https://esm.sh/@imgly/background-removal@1.7.0?bundle'];
const state={photos:[],queue:[],layoutPages:[],adjustments:{},editingPhotoId:null,processedCache:new Map(),previewToken:0,aiModule:null,aiBusy:false,pdfLoading:null,saveTimer:null};
const $=s=>document.querySelector(s); const gid=()=>Math.random().toString(36).slice(2,11);
const ACCESS_USERNAME='admin';
const ACCESS_PASSWORD='AditPrint2026';
const ACCESS_SESSION_KEY='smartPhotoLayoutFullAccess_v1';

function hasFullAccess(){
  return sessionStorage.getItem(ACCESS_SESSION_KEY)==='1';
}
function showLogin(){
  $('#loginError')?.classList.add('hidden');
  $('#loginModal')?.classList.remove('hidden');
  setTimeout(()=>$('#loginUsername')?.focus(),50);
}
function hideLogin(){
  $('#loginModal')?.classList.add('hidden');
}
function updateAccessUI(){
  const unlocked=hasFullAccess();
  const login=$('#loginBtn'),print=$('#printBtn'),pdf=$('#exportPdfBtn');
  if(login){
    login.textContent=unlocked?'✓ Akses Penuh':'🔐 Login';
    login.classList.toggle('authenticated',unlocked);
    login.title=unlocked?'Akses penuh aktif':'Login untuk mengaktifkan Print dan Export PDF';
  }
  if(print){
    print.textContent=unlocked?'🖨 Print':'🔒 Print';
    print.classList.toggle('access-locked',!unlocked);
    print.title=unlocked?'Cetak layout':'Login untuk mencetak';
  }
  if(pdf){
    pdf.textContent=unlocked?'⇩ Export PDF':'🔒 Export PDF';
    pdf.classList.toggle('access-locked',!unlocked);
    pdf.title=unlocked?'Unduh hasil layout PDF':'Login untuk mengunduh PDF';
  }
}
function requireFullAccess(){
  if(hasFullAccess())return true;
  showLogin();
  return false;
}

const settings=()=>({paperSize:$('#paperSize').value,margin:Math.max(0,Number($('#margin').value)||0),gap:Math.max(0,Number($('#gap').value)||0),smartRotation:$('#smartRotation').checked,cropMarks:$('#cropMarks').checked,photoBorder:$('#photoBorder').checked,borderColor:$('#borderColor').value||'#ffffff',borderWidth:Math.max(.1,Math.min(5,Number($('#borderWidth').value)||1)),borderStyle:$('#borderStyle').value||'solid'});
const loadImage=url=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function setStorageStatus(text,type=''){const e=$('#storageStatus');if(!e)return;e.textContent=text;e.className='storage-status'+(type?' '+type:'')}
function invalidate(save=true){state.layoutPages=[];renderWorkspace();if(save)scheduleSave()}
function resetCache(id){for(const key of [...state.processedCache.keys()])if(key.startsWith(id+'|'))state.processedCache.delete(key)}
function dataUrlToBlob(dataUrl){const [head,b64]=dataUrl.split(',');const mime=(head.match(/data:([^;]+)/)||[])[1]||'image/png';const bin=atob(b64);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:mime})}
function blobToDataUrl(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(blob)})}
async function fileToOptimizedDataUrl(file){const raw=await blobToDataUrl(file),img=await loadImage(raw);const maxDim=2800,ratio=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight));if(ratio===1&&file.size<1200000)return raw;const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*ratio));c.height=Math.max(1,Math.round(img.naturalHeight*ratio));const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.9)}
async function addFiles(files){const valid=[...files].filter(f=>f.type.startsWith('image/'));for(const file of valid){try{const dataUrl=await fileToOptimizedDataUrl(file),id=gid();state.photos.push({id,name:file.name,dataUrl,aiCutoutDataUrl:null});state.adjustments[id]={...DEFAULT_ADJ}}catch(e){console.error(e);alert('Gagal membaca '+file.name)}}renderPhotos();scheduleSave()}
function removePhoto(id){
  const removeIds=new Set(state.photos.filter(p=>p.id===id||p.sourcePhotoId===id).map(p=>p.id));
  state.photos=state.photos.filter(p=>!removeIds.has(p.id));
  state.queue=state.queue.filter(q=>!removeIds.has(q.photoId)&&q.sourcePhotoId!==id);
  for(const rid of removeIds){delete state.adjustments[rid];resetCache(rid)}
  invalidate(false);renderPhotos();renderQueue();scheduleSave()
}
function addToQueue(photoId,presetId){
  const preset=PHOTO_PRESETS.find(x=>x.id===presetId),source=state.photos.find(x=>x.id===photoId);
  if(!preset||!source)return;
  const queuePhotoId=gid(),sourceRootId=source.sourcePhotoId||source.id;
  state.photos.push({
    ...source,
    id:queuePhotoId,
    sourcePhotoId:sourceRootId,
    isQueueClone:true
  });
  state.adjustments[queuePhotoId]={...DEFAULT_ADJ,...(state.adjustments[photoId]||{})};
  state.queue.push({
    id:gid(),
    photoId:queuePhotoId,
    sourcePhotoId:sourceRootId,
    presetId:preset.id,w:preset.w,h:preset.h,name:preset.name,qty:1
  });
  renderQueue();invalidate()
}
function renderPhotos(){const el=$('#photoLibrary'),libraryPhotos=state.photos.filter(p=>!p.isQueueClone);if(!libraryPhotos.length){el.innerHTML='<div class="empty-mini">Belum ada foto.</div>';return}el.innerHTML=libraryPhotos.map(p=>`<div class="photo-card"><div class="photo-head"><img class="thumb" src="${p.aiCutoutDataUrl||p.dataUrl}"><div class="photo-meta"><div class="filename" title="${esc(p.name)}">${esc(p.name)}</div><div class="photo-actions"><button class="link-edit" data-edit-photo="${p.id}">✎ Edit Foto</button><button class="link-danger" data-remove-photo="${p.id}">🗑 Hapus</button></div></div></div><div class="preset-grid">${PHOTO_PRESETS.map(pr=>`<button class="preset-btn" data-add="${p.id}|${pr.id}">+ ${pr.id}</button>`).join('')}</div></div>`).join('')}
function renderQueue(){const el=$('#printQueue');$('#queueBadge').textContent=`${state.queue.length} item`;if(!state.queue.length){el.innerHTML='<div class="empty-mini">Antrean masih kosong.</div>';return}el.innerHTML=state.queue.map(q=>{const p=state.photos.find(x=>x.id===q.photoId);if(!p)return'';return `<div class="queue-item"><img src="${p.aiCutoutDataUrl||p.dataUrl}"><div class="queue-info"><b>${esc(q.name)}</b><span>${q.w} × ${q.h} mm</span></div><div><div class="qty"><button data-qty="${q.id}|-1">−</button><span>${q.qty}</span><button data-qty="${q.id}|1">+</button></div><div class="queue-actions"><button class="icon-mini" data-edit="${q.photoId}" title="Edit khusus item antrean ini">✎</button><button class="icon-mini danger" data-remove-queue="${q.id}" title="Hapus">🗑</button></div></div></div>`}).join('')}
function splitRect(rect,placed,gap){const out=[],rw=rect.w-placed.w-gap,bh=rect.h-placed.h-gap;if(rw>=bh){if(rw>0)out.push({x:rect.x+placed.w+gap,y:rect.y,w:rw,h:rect.h});if(bh>0)out.push({x:rect.x,y:rect.y+placed.h+gap,w:placed.w,h:bh})}else{if(bh>0)out.push({x:rect.x,y:rect.y+placed.h+gap,w:rect.w,h:bh});if(rw>0)out.push({x:rect.x+placed.w+gap,y:rect.y,w:rw,h:placed.h})}return out.filter(r=>r.w>.01&&r.h>.01)}
function prune(rects){return rects.filter((r,i)=>!rects.some((o,j)=>i!==j&&r.x>=o.x&&r.y>=o.y&&r.x+r.w<=o.x+o.w&&r.y+r.h<=o.y+o.h))}
function runLayout(){if(!state.queue.length)return alert('Antrean kosong! Tambahkan ukuran cetak terlebih dahulu.');const s=settings(),paper=PAPER_SIZES[s.paperSize],usableW=paper.w-2*s.margin,usableH=paper.h-2*s.margin;if(usableW<=0||usableH<=0)return alert('Margin terlalu besar.');let items=[];state.queue.forEach(q=>{for(let i=0;i<q.qty;i++)items.push({...q,uniqueId:`${q.id}_${i}`})});items.sort((a,b)=>b.w*b.h-a.w*a.h);const makePage=i=>({index:i,items:[],freeRects:[{x:s.margin,y:s.margin,w:usableW,h:usableH}]});const pages=[makePage(0)];for(const item of items){let best=null;for(let pi=0;pi<pages.length;pi++){for(let ri=0;ri<pages[pi].freeRects.length;ri++){const r=pages[pi].freeRects[ri],vars=[{w:item.w,h:item.h,rotated:false}];if(s.smartRotation&&item.w!==item.h)vars.push({w:item.h,h:item.w,rotated:true});for(const v of vars){if(v.w<=r.w+.01&&v.h<=r.h+.01){const waste=r.w*r.h-v.w*v.h,short=Math.min(r.w-v.w,r.h-v.h),score=waste+short*.15;if(!best||score<best.score)best={pi,ri,v,r,score}}}}}if(!best){pages.push(makePage(pages.length));const pi=pages.length-1,r=pages[pi].freeRects[0],vars=[{w:item.w,h:item.h,rotated:false},...(s.smartRotation?[{w:item.h,h:item.w,rotated:true}]:[])].filter(v=>v.w<=r.w+.01&&v.h<=r.h+.01);if(!vars.length){pages.pop();alert(`${item.name} terlalu besar untuk ${s.paperSize}.`);continue}vars.sort((a,b)=>(r.w*r.h-a.w*a.h)-(r.w*r.h-b.w*b.h));best={pi,ri:0,v:vars[0],r,score:0}}const page=pages[best.pi],placed={...item,originalW:item.w,originalH:item.h,x:best.r.x,y:best.r.y,w:best.v.w,h:best.v.h,rotated:best.v.rotated};page.items.push(placed);page.freeRects.splice(best.ri,1,...splitRect(best.r,placed,s.gap));page.freeRects=prune(page.freeRects)}state.layoutPages=pages.filter(p=>p.items.length);renderWorkspace();scheduleSave()}
async function getProcessedCanvas(photoId){const p=state.photos.find(x=>x.id===photoId);if(!p)return null;const a=state.adjustments[photoId]||DEFAULT_ADJ;const key=photoId+'|'+JSON.stringify({brightness:a.brightness,contrast:a.contrast,saturation:a.saturation,sepia:a.sepia||0,hueRotate:a.hueRotate||0,bgEnabled:a.bgEnabled,bgColor:a.bgColor,ai:!!p.aiCutoutDataUrl});if(state.processedCache.has(key))return state.processedCache.get(key);const img=await loadImage(p.aiCutoutDataUrl||p.dataUrl),maxDim=2200,ratio=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*ratio)),h=Math.max(1,Math.round(img.naturalHeight*ratio));const out=document.createElement('canvas');out.width=w;out.height=h;const o=out.getContext('2d');if(p.aiCutoutDataUrl&&a.bgEnabled){o.fillStyle=a.bgColor;o.fillRect(0,0,w,h)}o.filter=`brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%) sepia(${a.sepia||0}%) hue-rotate(${a.hueRotate||0}deg)`;o.drawImage(img,0,0,w,h);state.processedCache.set(key,out);return out}
function rotatedCanvas(source,deg){const normalized=((deg%360)+360)%360;if(!normalized)return source;const swap=normalized===90||normalized===270,c=document.createElement('canvas');c.width=swap?source.height:source.width;c.height=swap?source.width:source.height;const x=c.getContext('2d');x.translate(c.width/2,c.height/2);x.rotate(normalized*Math.PI/180);x.drawImage(source,-source.width/2,-source.height/2);return c}
function drawCover(ctx,source,dx,dy,dw,dh,zoom=100,offX=0,offY=0){const sw=source.width,sh=source.height,targetAR=dw/dh,srcAR=sw/sh;let cw,ch;if(srcAR>targetAR){ch=sh;cw=sh*targetAR}else{cw=sw;ch=sw/targetAR}const z=Math.max(1,zoom/100);cw/=z;ch/=z;const maxX=sw-cw,maxY=sh-ch,sx=Math.max(0,Math.min(maxX,maxX/2+(offX/100)*(maxX/2))),sy=Math.max(0,Math.min(maxY,maxY/2+(offY/100)*(maxY/2)));ctx.drawImage(source,sx,sy,cw,ch,dx,dy,dw,dh)}
async function itemDataUrl(photoId,item,wpx,hpx){
  const base=await getProcessedCanvas(photoId),a=state.adjustments[photoId]||DEFAULT_ADJ;
  const userRot=rotatedCanvas(base,a.rotation);
  const isSmartRotated=!!item?.rotated;

  /*
    v12 - Smart Rotation presisi:
    crop/zoom/offset dihitung terlebih dahulu pada orientasi ukuran foto asli.
    Setelah komposisi selesai, hasil akhir baru diputar 90°. Dengan cara ini
    Smart Rotation tidak mengubah framing wajah, zoom, atau posisi X/Y.
  */
  if(isSmartRotated){
    const finalW=Math.max(1,Math.round(wpx)),finalH=Math.max(1,Math.round(hpx));
    const uprightW=finalH,uprightH=finalW;
    const upright=document.createElement('canvas');
    upright.width=uprightW; upright.height=uprightH;
    const ux=upright.getContext('2d');
    ux.fillStyle=a.bgEnabled?a.bgColor:'#ffffff';
    ux.fillRect(0,0,uprightW,uprightH);
    drawCover(ux,userRot,0,0,uprightW,uprightH,a.zoom,a.offsetX,a.offsetY);

    const out=document.createElement('canvas');
    out.width=finalW; out.height=finalH;
    const ox=out.getContext('2d');
    ox.fillStyle=a.bgEnabled?a.bgColor:'#ffffff';
    ox.fillRect(0,0,finalW,finalH);
    ox.save();
    ox.translate(finalW/2,finalH/2);
    ox.rotate(Math.PI/2);
    ox.drawImage(upright,-uprightW/2,-uprightH/2);
    ox.restore();
    return out.toDataURL('image/jpeg',.94);
  }

  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(wpx)); c.height=Math.max(1,Math.round(hpx));
  const x=c.getContext('2d');
  x.fillStyle=a.bgEnabled?a.bgColor:'#ffffff';
  x.fillRect(0,0,c.width,c.height);
  drawCover(x,userRot,0,0,c.width,c.height,a.zoom,a.offsetX,a.offsetY);
  return c.toDataURL('image/jpeg',.94);
}
function cropMarkOffset(){ return 1; }
function cropMarkPreviewHtml(it,scale,s){
  if(!s.cropMarks) return '';
  const co=cropMarkOffset()*scale;
  const cl=Math.max(5,3*scale);
  const x=it.x*scale,y=it.y*scale,w=it.w*scale,h=it.h*scale;
  const marks=[
    ['h',x-co-cl,y,cl],['v',x,y-co-cl,cl],
    ['h',x+w+co,y,cl],['v',x+w,y-co-cl,cl],
    ['h',x-co-cl,y+h,cl],['v',x,y+h+co,cl],
    ['h',x+w+co,y+h,cl],['v',x+w,y+h+co,cl]
  ];
  return marks.map(([dir,l,t,len])=>`<span class="crop-mark ${dir}" style="left:${l}px;top:${t}px;${dir==='h'?`width:${len}px`:`height:${len}px`}"></span>`).join('');
}
function borderPreviewHtml(scale,s){
  if(!s.photoBorder)return '';
  const px=Math.max(1,s.borderWidth*scale);
  const style=s.borderStyle==='dotted'?'dotted':s.borderStyle==='dashed'?'dashed':'solid';
  return `<span class="photo-border-overlay" style="border-color:${esc(s.borderColor)};border-width:${px}px;border-style:${style}"></span>`;
}
async function renderWorkspace(){
  const empty=$('#emptyWorkspace'),cont=$('#pagesContainer');
  if(!state.layoutPages.length){empty.classList.remove('hidden');cont.innerHTML='';return}
  empty.classList.add('hidden');
  const token=++state.previewToken,s=settings(),paper=PAPER_SIZES[s.paperSize],maxW=Math.max(350,Math.min(760,$('#workspace').clientWidth-80)),scale=maxW/paper.w;
  cont.innerHTML=state.layoutPages.map((pg,idx)=>`<div><div class="page-label">Page ${idx+1} - ${s.paperSize} (${paper.w}×${paper.h} mm) • Crop mark: ${s.cropMarks?'ON':'OFF'} • Border: ${s.photoBorder?`${s.borderWidth} mm ${s.borderStyle}`:'OFF'}</div><div class="paper" style="width:${paper.w*scale}px;height:${paper.h*scale}px">${pg.items.map(it=>`${cropMarkPreviewHtml(it,scale,s)}<div class="layout-item" data-photo-id="${it.photoId}" data-item-id="${it.uniqueId}" tabindex="0" role="button" aria-label="Edit dan atur posisi foto" style="left:${it.x*scale}px;top:${it.y*scale}px;width:${it.w*scale}px;height:${it.h*scale}px"><img id="pv-${it.uniqueId}" alt="preview" draggable="false">${borderPreviewHtml(scale,s)}</div>`).join('')}</div></div>`).join('');
  for(const pg of state.layoutPages)for(const it of pg.items){
    const img=$('#pv-'+CSS.escape(it.uniqueId));if(!img)continue;
    try{const url=await itemDataUrl(it.photoId,it,Math.max(80,it.w*scale*1.5),Math.max(80,it.h*scale*1.5));if(token===state.previewToken&&img)img.src=url}catch(e){console.error(e)}
  }
}
function applyPhotoPreset(name){if(!state.editingPhotoId||!PHOTO_COLOR_PRESETS[name])return;Object.assign(state.adjustments[state.editingPhotoId],PHOTO_COLOR_PRESETS[name]);resetCache(state.editingPhotoId);updateEditorPreview();scheduleSave();document.querySelectorAll('[data-photo-preset]').forEach(b=>b.classList.toggle('active',b.dataset.photoPreset===name))}
async function refreshLayoutPhoto(photoId){for(const pg of state.layoutPages)for(const it of pg.items){if(it.photoId!==photoId)continue;const img=$('#pv-'+CSS.escape(it.uniqueId));if(!img)continue;const r=img.parentElement.getBoundingClientRect();try{img.src=await itemDataUrl(it.photoId,it,Math.max(80,r.width*1.5),Math.max(80,r.height*1.5))}catch(e){console.error(e)}}}
function adjustPhotoByWheel(photoId,delta){const a=state.adjustments[photoId];if(!a)return;a.zoom=Math.max(100,Math.min(250,a.zoom+(delta<0?5:-5)));refreshLayoutPhoto(photoId);scheduleSave()}
function adjustPhotoOffset(photoId,dx,dy,w,h){const a=state.adjustments[photoId];if(!a)return;const sx=w?dx/w*200:0,sy=h?dy/h*200:0;a.offsetX=Math.max(-100,Math.min(100,a.offsetX-sx));a.offsetY=Math.max(-100,Math.min(100,a.offsetY-sy));refreshLayoutPhoto(photoId);scheduleSave()}
async function openEditor(id){state.editingPhotoId=id;const p=state.photos.find(x=>x.id===id),a=state.adjustments[id];if(!p)return;$('#editorPhotoName').textContent=p.name;['brightness','contrast','saturation','zoom','offsetX','offsetY'].forEach(k=>$('#'+k).value=a[k]);$('#bgEnabled').checked=a.bgEnabled;$('#bgColor').value=a.bgColor;$('#bgColorText').value=a.bgColor;updateEditorLabels();updateAiStatus();$('#editorModal').classList.remove('hidden');await updateEditorPreview()}
function updateEditorLabels(){const a=state.adjustments[state.editingPhotoId];if(!a)return;$('#brightnessValue').textContent=a.brightness+'%';$('#contrastValue').textContent=a.contrast+'%';$('#saturationValue').textContent=a.saturation+'%';$('#zoomValue').textContent=a.zoom+'%';$('#offsetXValue').textContent=a.offsetX;$('#offsetYValue').textContent=a.offsetY;$('#bgControls').classList.toggle('disabled',!a.bgEnabled);document.querySelectorAll('[data-photo-preset]').forEach(b=>{const p=PHOTO_COLOR_PRESETS[b.dataset.photoPreset];b.classList.toggle('active',!!p&&['brightness','contrast','saturation','sepia','hueRotate'].every(k=>(a[k]||0)===p[k]))})}
function updateAiStatus(msg){const p=state.photos.find(x=>x.id===state.editingPhotoId),e=$('#aiStatus');if(!e)return;if(msg){e.textContent=msg;return}e.textContent=p?.aiCutoutDataUrl?'Background sudah dihapus oleh AI.':'Belum diproses AI.';$('#resetAiBg').disabled=!p?.aiCutoutDataUrl}
async function updateEditorPreview(){const id=state.editingPhotoId;if(!id)return;updateEditorLabels();const token=++state.previewToken;try{const a=state.adjustments[id],base=await getProcessedCanvas(id),rot=rotatedCanvas(base,a.rotation),box=$('.editor-preview');const maxW=Math.max(220,Math.min(520,box.clientWidth-56)),maxH=Math.max(300,Math.min(650,box.clientHeight-56));let w=Math.min(maxW,maxH*3/4),h=w*4/3;if(h>maxH){h=maxH;w=h*3/4}const c=document.createElement('canvas');c.width=Math.round(w);c.height=Math.round(h);const x=c.getContext('2d');x.fillStyle=a.bgEnabled?a.bgColor:'#222';x.fillRect(0,0,c.width,c.height);drawCover(x,rot,0,0,c.width,c.height,a.zoom,a.offsetX,a.offsetY);if(token===state.previewToken)$('#editorImage').src=c.toDataURL('image/jpeg',.92)}catch(e){console.error(e)}}
function setAdj(k,v){if(!state.editingPhotoId)return;state.adjustments[state.editingPhotoId][k]=v;if(['brightness','contrast','saturation','sepia','hueRotate','bgEnabled','bgColor'].includes(k))resetCache(state.editingPhotoId);updateEditorPreview();scheduleSave()}
async function loadAiModule(){if(state.aiModule)return state.aiModule;let last;for(const url of AI_CDNS){try{const m=await import(url);state.aiModule=m;return m}catch(e){last=e;console.warn('AI CDN gagal:',url,e)}}throw last||new Error('AI library gagal dimuat')}
function setAiProgress(percent){const wrap=$('#aiProgressWrap'),bar=$('#aiProgressBar');wrap.classList.remove('hidden');bar.style.width=Math.max(0,Math.min(100,percent))+'%'}
async function runAiBackgroundRemoval(){if(state.aiBusy||!state.editingPhotoId)return;const p=state.photos.find(x=>x.id===state.editingPhotoId);if(!p)return;state.aiBusy=true;const btn=$('#runAiBg'),old=btn.textContent;btn.disabled=true;btn.textContent='⟳ Memuat AI...';setAiProgress(3);updateAiStatus('Memuat library/model AI dari internet...');try{const mod=await loadAiModule();const removeBackground=mod.removeBackground||mod.default;if(typeof removeBackground!=='function')throw new Error('Fungsi AI tidak ditemukan');btn.textContent='⟳ Memproses Background...';const source=dataUrlToBlob(p.dataUrl);const result=await removeBackground(source,{progress:(key,current,total)=>{const pct=total?Math.round(current/total*100):10;setAiProgress(Math.max(5,pct));updateAiStatus(`AI: ${String(key).replace(':',' ')} ${pct}%`)}});const cutoutRaw=await blobToDataUrl(result),img=await loadImage(cutoutRaw),c=document.createElement('canvas');const maxDim=2400,ratio=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*ratio);c.height=Math.round(img.naturalHeight*ratio);c.getContext('2d').drawImage(img,0,0,c.width,c.height);p.aiCutoutDataUrl=c.toDataURL('image/webp',.94);state.adjustments[p.id].bgEnabled=true;resetCache(p.id);setAiProgress(100);updateAiStatus('Selesai. Background dihapus dengan AI.');$('#bgEnabled').checked=true;updateEditorLabels();await updateEditorPreview();renderPhotos();renderQueue();scheduleSave()}catch(e){console.error(e);updateAiStatus('AI gagal dijalankan. Pastikan internet aktif dan buka lewat HTTPS/localhost.');alert('Background Removal AI gagal dimuat/dijalankan. Pastikan internet aktif. Untuk hasil terbaik, deploy aplikasi melalui Vercel/HTTPS.')}finally{state.aiBusy=false;btn.disabled=false;btn.textContent=old;setTimeout(()=>$('#aiProgressWrap').classList.add('hidden'),900)}}
function resetAiBackground(){const p=state.photos.find(x=>x.id===state.editingPhotoId);if(!p)return;p.aiCutoutDataUrl=null;state.adjustments[p.id].bgEnabled=false;$('#bgEnabled').checked=false;resetCache(p.id);updateAiStatus();updateEditorPreview();renderPhotos();renderQueue();scheduleSave()}
function loadPdfLibrary(){if(window.jspdf)return Promise.resolve(window.jspdf);if(state.pdfLoading)return state.pdfLoading;state.pdfLoading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=PDF_CDN;s.async=true;s.onload=()=>resolve(window.jspdf);s.onerror=()=>reject(new Error('jsPDF gagal dimuat'));document.head.appendChild(s)}).then(v=>{setStorageStatus('Project tersimpan • PDF siap','ok');return v}).catch(e=>{console.error(e);setStorageStatus('Project tersimpan • PDF perlu internet','error');throw e});return state.pdfLoading}
function drawPdfCropMarks(doc,item,s){
  if(!s.cropMarks)return;
  doc.setDrawColor(90);doc.setLineWidth(.18);
  const co=cropMarkOffset(),cl=3,x=item.x,y=item.y,w=item.w,h=item.h;
  // Horizontal marks
  doc.line(x-co-cl,y,x-co,y); doc.line(x+w+co,y,x+w+co+cl,y);
  doc.line(x-co-cl,y+h,x-co,y+h); doc.line(x+w+co,y+h,x+w+co+cl,y+h);
  // Vertical marks
  doc.line(x,y-co-cl,x,y-co); doc.line(x+w,y-co-cl,x+w,y-co);
  doc.line(x,y+h+co,x,y+h+co+cl); doc.line(x+w,y+h+co,x+w,y+h+co+cl);
}
function hexToRgb(hex){const m=String(hex||'').match(/^#([0-9a-f]{6})$/i);if(!m)return [255,255,255];const n=parseInt(m[1],16);return [(n>>16)&255,(n>>8)&255,n&255]}
function drawPdfPhotoBorder(doc,item,s){
  if(!s.photoBorder)return;
  const [r,g,b]=hexToRgb(s.borderColor),lw=Math.max(.1,Math.min(5,s.borderWidth));
  doc.setDrawColor(r,g,b);doc.setLineWidth(lw);
  if(s.borderStyle==='dashed')doc.setLineDashPattern([Math.max(.8,lw*2.5),Math.max(.8,lw*1.6)],0);
  else if(s.borderStyle==='dotted')doc.setLineDashPattern([Math.max(.2,lw*.35),Math.max(.7,lw*1.7)],0);
  else doc.setLineDashPattern([],0);
  const inset=lw/2;
  doc.rect(item.x+inset,item.y+inset,Math.max(.01,item.w-lw),Math.max(.01,item.h-lw));
  doc.setLineDashPattern([],0);
}
async function buildPrintPdf(){
  if(!state.layoutPages.length)throw new Error('NO_LAYOUT');
  await loadPdfLibrary();
  const {jsPDF}=window.jspdf,s=settings(),paper=PAPER_SIZES[s.paperSize];

  /*
    v13: Print/PDF memakai renderer foto yang SAMA dengan preview layout.
    Sebelumnya buildPrintPdf melakukan rotasi + drawCover sendiri sehingga
    Smart Rotation meng-crop ulang foto dan hasilnya berbeda dari preview.
  */
  const doc=new jsPDF({
    orientation:paper.w>paper.h?'landscape':'portrait',
    unit:'mm',
    format:[paper.w,paper.h],
    compress:true,
    precision:12,
    hotfixes:['px_scaling']
  });

  const PX_PER_MM=300/25.4; // render target 300 DPI
  for(let i=0;i<state.layoutPages.length;i++){
    if(i)doc.addPage([paper.w,paper.h],paper.w>paper.h?'landscape':'portrait');
    for(const item of state.layoutPages[i].items){
      const p=state.photos.find(x=>x.id===item.photoId);if(!p)continue;

      const pxW=Math.max(1,Math.round(item.w*PX_PER_MM));
      const pxH=Math.max(1,Math.round(item.h*PX_PER_MM));
      const dataUrl=await itemDataUrl(p.id,item,pxW,pxH);

      // Koordinat dan ukuran tetap dalam mm; tidak ada resize/crop kedua.
      doc.addImage(
        dataUrl,'JPEG',
        Number(item.x),Number(item.y),Number(item.w),Number(item.h),
        item.uniqueId || undefined,'FAST',0
      );
      drawPdfPhotoBorder(doc,item,s);
      drawPdfCropMarks(doc,item,s);
    }
  }
  return doc;
}
async function exportPDF(){
  if(!requireFullAccess())return;
  if(!state.layoutPages.length)return alert('Silakan jalankan Auto Layout terlebih dahulu!');
  const btn=$('#exportPdfBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='⟳ Menyiapkan PDF...';
  try{const doc=await buildPrintPdf();doc.save('Smart_Photo_Layout_Print_Ready.pdf')}
  catch(e){console.error(e);alert('Terjadi kesalahan saat membuat PDF. Pastikan internet aktif saat library PDF pertama kali dimuat.')}
  finally{btn.disabled=false;btn.textContent=old}
}
async function printLayout(){
  if(!requireFullAccess())return;
  if(!state.layoutPages.length)return alert('Silakan jalankan Auto Layout terlebih dahulu!');
  const btn=$('#printBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='⟳ Menyiapkan Print...';
  try{
    const doc=await buildPrintPdf(),blob=doc.output('blob'),url=URL.createObjectURL(blob);
    let frame=document.getElementById('printPdfFrame');
    if(!frame){frame=document.createElement('iframe');frame.id='printPdfFrame';frame.style.position='fixed';frame.style.right='0';frame.style.bottom='0';frame.style.width='1px';frame.style.height='1px';frame.style.border='0';frame.style.opacity='0';document.body.appendChild(frame)}
    frame.onload=()=>{setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}catch(err){console.error(err);window.open(url,'_blank')}setTimeout(()=>URL.revokeObjectURL(url),60000)},250)};
    frame.src=url;
  }catch(e){console.error(e);alert('Gagal menyiapkan halaman Print. Pastikan internet aktif saat library PDF pertama kali dimuat.')}
  finally{btn.disabled=false;btn.textContent=old}
}
function serializeProject(){return {version:6,savedAt:Date.now(),photos:state.photos,queue:state.queue,layoutPages:state.layoutPages,adjustments:state.adjustments,settings:settings()}}
function scheduleSave(){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(saveProject,300)}
function saveProject(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(serializeProject()));setStorageStatus('Project tersimpan otomatis','ok')}catch(e){console.warn(e);setStorageStatus('Penyimpanan penuh — kurangi foto','error')}}
function migrateQueueIndependentEdits(){
  let changed=false;
  const queuePhotoMap=new Map();
  for(const q of state.queue){
    const current=state.photos.find(p=>p.id===q.photoId);
    if(current?.isQueueClone){
      q.sourcePhotoId=q.sourcePhotoId||current.sourcePhotoId||current.id;
      continue
    }
    if(!current)continue;
    const cloneId=gid(),rootId=q.sourcePhotoId||current.sourcePhotoId||current.id;
    const clone={...current,id:cloneId,sourcePhotoId:rootId,isQueueClone:true};
    state.photos.push(clone);
    state.adjustments[cloneId]={...DEFAULT_ADJ,...(state.adjustments[current.id]||{})};
    queuePhotoMap.set(q.id,cloneId);
    q.photoId=cloneId;
    q.sourcePhotoId=rootId;
    changed=true;
  }
  if(changed&&Array.isArray(state.layoutPages)){
    for(const pg of state.layoutPages)for(const it of (pg.items||[])){
      const cloneId=queuePhotoMap.get(it.id);
      if(cloneId)it.photoId=cloneId;
    }
  }
  return changed
}
function restoreProject(){try{let raw=localStorage.getItem(STORAGE_KEY);if(!raw){for(const k of LEGACY_STORAGE_KEYS){raw=localStorage.getItem(k);if(raw)break}}if(!raw)return false;const d=JSON.parse(raw);if(!d||!Array.isArray(d.photos))return false;state.photos=d.photos.map(p=>({...p,aiCutoutDataUrl:p.aiCutoutDataUrl||null}));state.queue=Array.isArray(d.queue)?d.queue:[];state.layoutPages=Array.isArray(d.layoutPages)?d.layoutPages:[];state.adjustments=d.adjustments||{};for(const p of state.photos)state.adjustments[p.id]={...DEFAULT_ADJ,...(state.adjustments[p.id]||{})};migrateQueueIndependentEdits();const s=d.settings||{};if(s.paperSize&&PAPER_SIZES[s.paperSize])$('#paperSize').value=s.paperSize;if(s.margin!=null)$('#margin').value=s.margin;if(s.gap!=null)$('#gap').value=s.gap;if(s.smartRotation!=null)$('#smartRotation').checked=!!s.smartRotation;if(s.cropMarks!=null)$('#cropMarks').checked=!!s.cropMarks;if(s.photoBorder!=null)$('#photoBorder').checked=!!s.photoBorder;if(s.borderColor&&/^#[0-9a-f]{6}$/i.test(s.borderColor)){$('#borderColor').value=s.borderColor;$('#borderColorText').value=s.borderColor}if(s.borderWidth!=null)$('#borderWidth').value=s.borderWidth;if(['solid','dashed','dotted'].includes(s.borderStyle))$('#borderStyle').value=s.borderStyle;updateBorderControls();setStorageStatus('Project sebelumnya dipulihkan','ok');return true}catch(e){console.warn(e);return false}}
function newProject(){if(!confirm('Hapus project yang tersimpan di perangkat ini dan mulai project baru?'))return;localStorage.removeItem(STORAGE_KEY);state.photos=[];state.queue=[];state.layoutPages=[];state.adjustments={};state.processedCache.clear();renderPhotos();renderQueue();renderWorkspace();setStorageStatus('Project baru','ok')}
$('#fileInput').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='' });const dz=$('#dropZone');['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragover')}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('dragover')}));dz.addEventListener('drop',e=>addFiles(e.dataTransfer.files));
$('#photoLibrary').addEventListener('click',e=>{const r=e.target.closest('[data-remove-photo]'),a=e.target.closest('[data-add]'),ed=e.target.closest('[data-edit-photo]');if(r)removePhoto(r.dataset.removePhoto);if(a){const [pid,pre]=a.dataset.add.split('|');addToQueue(pid,pre)}if(ed)openEditor(ed.dataset.editPhoto)});
$('#printQueue').addEventListener('click',e=>{
  const q=e.target.closest('[data-qty]'),rm=e.target.closest('[data-remove-queue]'),ed=e.target.closest('[data-edit]');
  if(q){
    const[id,d]=q.dataset.qty.split('|'),it=state.queue.find(x=>x.id===id);
    if(it)it.qty=Math.max(1,it.qty+Number(d));
    renderQueue();invalidate()
  }
  if(rm){
    const id=rm.dataset.removeQueue,it=state.queue.find(x=>x.id===id);
    if(it){
      state.photos=state.photos.filter(p=>p.id!==it.photoId);
      delete state.adjustments[it.photoId];
      resetCache(it.photoId)
    }
    state.queue=state.queue.filter(x=>x.id!==id);
    renderQueue();invalidate()
  }
  if(ed)openEditor(ed.dataset.edit)
});
['paperSize','margin','gap'].forEach(id=>$('#'+id).addEventListener('change',()=>invalidate()));
/* v11: Smart Rotation tidak membongkar layout yang sudah jadi. Layout tetap terkunci sampai pengguna menekan Run Auto Layout. */
$('#smartRotation').addEventListener('change',()=>{renderWorkspace();scheduleSave()});
$('#cropMarks').addEventListener('change',()=>{renderWorkspace();scheduleSave()});
function updateBorderControls(){const enabled=$('#photoBorder').checked;$('#borderControls').classList.toggle('disabled',!enabled)}
function updateBorderAndSave(){updateBorderControls();renderWorkspace();scheduleSave()}
$('#photoBorder').addEventListener('change',updateBorderAndSave);
['borderWidth','borderStyle'].forEach(id=>$('#'+id).addEventListener('change',updateBorderAndSave));
$('#borderColor').addEventListener('input',e=>{$('#borderColorText').value=e.target.value;updateBorderAndSave()});
$('#borderColorText').addEventListener('change',e=>{let v=e.target.value.trim();if(!v.startsWith('#'))v='#'+v;if(/^#[0-9a-f]{6}$/i.test(v)){$('#borderColor').value=v;e.target.value=v;updateBorderAndSave()}else e.target.value=$('#borderColor').value});
document.querySelectorAll('[data-bordercolor]').forEach(b=>b.addEventListener('click',()=>{$('#borderColor').value=b.dataset.bordercolor;$('#borderColorText').value=b.dataset.bordercolor;updateBorderAndSave()}));$('#runLayoutBtn').addEventListener('click',runLayout);$('#exportPdfBtn').addEventListener('click',exportPDF);$('#printBtn').addEventListener('click',printLayout);$('#newProjectBtn').addEventListener('click',newProject);$('#closeEditor').addEventListener('click',()=>$('#editorModal').classList.add('hidden'));$('#applyEditor').addEventListener('click',()=>{$('#editorModal').classList.add('hidden');renderPhotos();renderQueue();renderWorkspace();scheduleSave()});
['brightness','contrast','saturation','zoom','offsetX','offsetY'].forEach(k=>$('#'+k).addEventListener('input',e=>setAdj(k,Number(e.target.value))));$('#bgEnabled').addEventListener('change',e=>setAdj('bgEnabled',e.target.checked));$('#bgColor').addEventListener('input',e=>{$('#bgColorText').value=e.target.value;setAdj('bgColor',e.target.value)});$('#bgColorText').addEventListener('change',e=>{let v=e.target.value.trim();if(!v.startsWith('#'))v='#'+v;if(/^#[0-9a-f]{6}$/i.test(v)){$('#bgColor').value=v;setAdj('bgColor',v)}else e.target.value=state.adjustments[state.editingPhotoId].bgColor});document.querySelectorAll('[data-bgcolor]').forEach(b=>b.addEventListener('click',()=>{$('#bgColor').value=b.dataset.bgcolor;$('#bgColorText').value=b.dataset.bgcolor;setAdj('bgColor',b.dataset.bgcolor)}));
$('#rotateLeft').addEventListener('click',()=>{const a=state.adjustments[state.editingPhotoId];setAdj('rotation',(a.rotation-90)%360)});$('#rotateRight').addEventListener('click',()=>{const a=state.adjustments[state.editingPhotoId];setAdj('rotation',(a.rotation+90)%360)});$('#resetEditor').addEventListener('click',()=>{const id=state.editingPhotoId;state.adjustments[id]={...DEFAULT_ADJ};resetCache(id);openEditor(id);scheduleSave()});$('#runAiBg').addEventListener('click',runAiBackgroundRemoval);$('#resetAiBg').addEventListener('click',resetAiBackground);
document.querySelectorAll('[data-photo-preset]').forEach(b=>b.addEventListener('click',()=>applyPhotoPreset(b.dataset.photoPreset)));
/* v11: preview layout dikunci. Mouse hanya membuka dialog Edit Foto. */
$('#pagesContainer').addEventListener('click',e=>{const item=e.target.closest('.layout-item');if(!item)return;openEditor(item.dataset.photoId)});
$('#pagesContainer').addEventListener('keydown',e=>{const item=e.target.closest('.layout-item');if(!item)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();openEditor(item.dataset.photoId)}});
let editorDrag=null;
$('#editorPreviewArea').addEventListener('pointerdown',e=>{editorDrag={x:e.clientX,y:e.clientY};$('#editorPreviewArea').classList.add('dragging')});
$('#editorPreviewArea').addEventListener('pointermove',e=>{if(!editorDrag||!state.editingPhotoId)return;const r=$('#editorPreviewArea').getBoundingClientRect(),dx=e.clientX-editorDrag.x,dy=e.clientY-editorDrag.y;editorDrag={x:e.clientX,y:e.clientY};const a=state.adjustments[state.editingPhotoId];a.offsetX=Math.max(-100,Math.min(100,a.offsetX-dx/r.width*200));a.offsetY=Math.max(-100,Math.min(100,a.offsetY-dy/r.height*200));$('#offsetX').value=a.offsetX;$('#offsetY').value=a.offsetY;updateEditorPreview();scheduleSave()});
window.addEventListener('pointerup',()=>{editorDrag=null;$('#editorPreviewArea')?.classList.remove('dragging')});
$('#editorPreviewArea').addEventListener('wheel',e=>{if(!state.editingPhotoId)return;e.preventDefault();const a=state.adjustments[state.editingPhotoId];a.zoom=Math.max(100,Math.min(250,a.zoom+(e.deltaY<0?5:-5)));$('#zoom').value=a.zoom;updateEditorPreview();scheduleSave()},{passive:false});

$('#loginBtn').addEventListener('click',()=>{
  if(hasFullAccess()){
    if(confirm('Akses penuh sedang aktif. Keluar dari mode akses penuh?')){
      sessionStorage.removeItem(ACCESS_SESSION_KEY);
      updateAccessUI();
    }
  }else showLogin();
});
$('#closeLogin').addEventListener('click',hideLogin);
$('#loginModal').addEventListener('click',e=>{if(e.target.id==='loginModal')hideLogin()});
$('#togglePassword').addEventListener('click',()=>{
  const p=$('#loginPassword');
  p.type=p.type==='password'?'text':'password';
});
$('#loginForm').addEventListener('submit',e=>{
  e.preventDefault();
  const user=$('#loginUsername').value.trim();
  const pass=$('#loginPassword').value;
  if(user===ACCESS_USERNAME&&pass===ACCESS_PASSWORD){
    sessionStorage.setItem(ACCESS_SESSION_KEY,'1');
    $('#loginError').classList.add('hidden');
    $('#loginPassword').value='';
    hideLogin();
    updateAccessUI();
  }else{
    $('#loginError').classList.remove('hidden');
    $('#loginPassword').select();
  }
});

window.addEventListener('resize' ,()=>{if(state.layoutPages.length)renderWorkspace()});
restoreProject();updateBorderControls();renderPhotos();renderQueue();renderWorkspace();updateAccessUI();loadPdfLibrary().catch(()=>{});
