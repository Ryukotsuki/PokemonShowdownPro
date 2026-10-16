const path = require('node:path');
const zlib = require('node:zlib');
const normalizeVisibility = value => ({hub:value?.hub===true,showdex:value?.showdex===true,moves:value?.moves===true,tooltips:value?.tooltips===true,teras:value?.teras===true});
// Read geometry only. The stream receives masked pixels, never the player's DOM.
function collectMirrorMap(visibility) {
 const selectors=[];
 if(!visibility.teras)selectors.push('.ditTeraInfo');
 if(!visibility.showdex)selectors.push('[data-showdex-module]','[data-showdex]','button[name="toggleCalcdexOverlay"]','[data-tippy-root]');
 if(!visibility.moves)selectors.push('.battle-controls','.movemenu','.switchmenu','.overlay-controls .movecontrols','.overlay-controls .switchcontrols','.overlay-controls .targetcontrols','.overlay-controls .teamcontrols','.overlay-controls .whatdo','.overlay-controls .overlay-message');
 // Read tooltip geometry independently: Pokémon details have their own
 // switch, while move tooltips still follow the move-selection setting.
 if(!visibility.moves||!visibility.tooltips)selectors.push('.tooltip');
 const selector=selectors.join(',')||':not(*)';let guard=window.__proMirrorGuard;
 if(guard?.selector!==selector){
  guard?.observer.disconnect();guard={selector,revision:0};
  const relevant=node=>node?.nodeType===1&&(node.matches(selector)||node.closest(selector)||node.querySelector(selector));
  guard.observer=new MutationObserver(records=>{if(records.some(record=>relevant(record.target)||[...record.addedNodes,...record.removedNodes].some(relevant)))guard.revision++;});
  guard.observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});window.__proMirrorGuard=guard;
 }
 const reveals=[];
 const masks=[...document.querySelectorAll(selector)].flatMap(element=>{
  const style=getComputedStyle(element),rect=element.getBoundingClientRect();
  if(style.display==='none'||style.visibility==='hidden'||rect.width<=0||rect.height<=0)return [];
  if(element.matches('.tooltip')){
   const pokemon=element.matches('.tooltip-pokemon,.tooltip-activepokemon,.tooltip-switchpokemon,.tooltip-allypokemon');
   if(pokemon&&visibility.tooltips){reveals.push({x:rect.x,y:rect.y,width:rect.width,height:rect.height});return [];}
   if(!pokemon&&visibility.moves)return [];
  }
  const contains=r=>rect.left>=r.left&&rect.right<=r.right&&rect.top>=r.top&&rect.bottom<=r.bottom;
  const calculatorButton=element.matches('button[name="toggleCalcdexOverlay"]');
  const controls=element.closest('.battle-controls')||[...document.querySelectorAll('.battle-controls')].find(panel=>{const r=panel.getBoundingClientRect();return r.width&&r.height&&(contains(r)||(calculatorButton&&rect.left<r.right&&rect.right>r.left&&rect.top<r.bottom&&rect.bottom>r.top));});
  if(controls&&!visibility.moves&&element.matches('.battle-controls,.movemenu,.switchmenu')){
   const roomId=controls.closest('.ps-room')?.id?.replace(/^room-/,''),room=(window.app||window.PS)?.rooms[roomId];
   // Replay/spectator controls carry no pending player choice. Keep their
   // original buttons and styling, while still hiding the calculator button.
   if(room?.battle&&(room.battle.ended||(!room.request&&!room.battle.myPokemon?.length))&&!element.matches('button[name="toggleCalcdexOverlay"]'))return [];
   if(element!==controls&&!element.matches('button[name="toggleCalcdexOverlay"]'))return [];
  }
  // Showdex can wrap its toggle in a separate, zero-layout container. Any
  // mask wholly inside this panel must use its fill too, without overscan.
  if(controls&&(element===controls||calculatorButton||contains(controls.getBoundingClientRect()))){
   const panel=controls.getBoundingClientRect(),panelStyle=getComputedStyle(controls),scaleX=panel.width/controls.offsetWidth||1,scaleY=panel.height/controls.offsetHeight||1;
   let left=Math.max(rect.left,panel.left+parseFloat(panelStyle.borderLeftWidth)*scaleX),top=Math.max(rect.top,panel.top+parseFloat(panelStyle.borderTopWidth)*scaleY);
   let right=Math.min(rect.right,panel.right-parseFloat(panelStyle.borderRightWidth)*scaleX),bottom=Math.min(rect.bottom,panel.bottom-parseFloat(panelStyle.borderBottomWidth)*scaleY);
   const scroller=controls.parentElement?.closest('.battle-log');
   if(scroller){const r=scroller.getBoundingClientRect();left=Math.max(left,r.left);top=Math.max(top,r.top);right=Math.min(right,r.right);bottom=Math.min(bottom,r.bottom);}
   // Match the source panel's interior and never paint over adjacent chat.
   for(const chat of controls.closest('.ps-room')?.querySelectorAll('.battle-log,.battle-log-add')||[]){
    if(chat.contains(controls))continue;const r=chat.getBoundingClientRect();
    if(r.width&&r.height&&r.left>left&&r.left<right&&r.bottom>top&&r.top<bottom)right=r.left;
    else if(r.width&&r.height&&r.left<=left&&r.right>left&&r.top>top&&r.top<bottom)bottom=r.top;
   }
   const rgba=panelStyle.backgroundColor.match(/[\d.]+/g)?.map(Number),color=rgba?.length>=3&&(rgba.length===3||rgba[3]===1)?[...rgba.slice(0,3),255]:null;
   return right>left&&bottom>top?[{x:left,y:top,width:right-left,height:bottom-top,...(color?{color}:{})}]:[];
  }
  const padding=element.closest('.roomtab')||element.matches('.closebutton')?0:4;
  return [{x:rect.x-padding,y:rect.y-padding,width:rect.width+padding*2,height:rect.height+padding*2}];
 });
 return {url:location.href,width:innerWidth,height:innerHeight,revision:guard.revision,masks,reveals};
}
function maskRectangles(masks,viewport,size){
 if(!viewport?.width||!viewport?.height||!size?.width||!size?.height)throw Error('Mirror size unavailable');
 return masks.map(rect=>{
  const x=Math.max(0,Math.floor(rect.x*size.width/viewport.width)),y=Math.max(0,Math.floor(rect.y*size.height/viewport.height));
  const right=Math.min(size.width,Math.ceil((rect.x+rect.width)*size.width/viewport.width)),bottom=Math.min(size.height,Math.ceil((rect.y+rect.height)*size.height/viewport.height));
  return {x,y,width:Math.max(0,right-x),height:Math.max(0,bottom-y),...(rect.color?{color:rect.color}:{})};
 }).filter(rect=>rect.width&&rect.height);
}
// Decode a one-pixel PNG through nativeImage to obtain this platform's bitmap
// order instead of assuming RGBA/BGRA. Only masked images leave this process.
function solidPixel(nativeImage,theme){
 const colors={pro:[20,40,56,255],dark:[32,35,41,255],light:[240,243,247,255]};
 const chunk=(type,data)=>{const tag=Buffer.from(type),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);tag.copy(result,4);data.copy(result,8);result.writeUInt32BE(zlib.crc32(Buffer.concat([tag,data])),data.length+8);return result;};
 const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(Buffer.from([0,...(colors[theme]||colors.pro)]))),chunk('IEND',Buffer.alloc(0))]);
 return nativeImage.createFromBuffer(png).toBitmap();
}
function bitmapFrame(image){
 const logical=image.getSize(1),pixels=image.toBitmap({scaleFactor:1});
 let width=logical.width,height=logical.height;
 if(pixels.length!==width*height*4){const scale=Math.sqrt(pixels.length/(width*height*4));width=Math.round(width*scale);height=Math.round(height*scale);}
 if(!width||!height||pixels.length!==width*height*4)throw Error('Mirror bitmap unavailable');
 return {width,height,displayWidth:logical.width,displayHeight:logical.height,pixels};
}
const colorCache=new Map();
function pixelInfo(nativeImage,theme){
 if(!colorCache.has(theme)){const pixel=solidPixel(nativeImage,theme),probe=solidPixel(nativeImage,'pro');
  const format=probe[0]===56&&probe[1]===40&&probe[2]===20?'bgra':probe[0]===20&&probe[1]===40&&probe[2]===56?'rgba':null;
  if(pixel.length!==4||!format)throw Error('Mirror pixel format unavailable');colorCache.set(theme,{pixel,format});
 }
 return colorCache.get(theme);
}
function maskedFrame(image,map,masks,theme,nativeImage){
 const frame=bitmapFrame(image),{pixel,format}=pixelInfo(nativeImage,theme);
 const reveals=maskRectangles(map.reveals||[],map,frame).map(rect=>{const pixels=Buffer.alloc(rect.width*rect.height*4);for(let y=0;y<rect.height;y++)frame.pixels.copy(pixels,y*rect.width*4,((rect.y+y)*frame.width+rect.x)*4,((rect.y+y)*frame.width+rect.x+rect.width)*4);return {...rect,pixels};});
 for(const rect of maskRectangles(masks,map,frame)){const color=rect.color?Buffer.from(format==='bgra'?[rect.color[2],rect.color[1],rect.color[0],255]:rect.color):pixel;const row=Buffer.alloc(rect.width*4);row.fill(color);for(let y=rect.y;y<rect.y+rect.height;y++)row.copy(frame.pixels,(y*frame.width+rect.x)*4);}
 // Allowed Pokémon tooltips may overlap hidden battle controls. Restore
 // only their own bounds, leaving the underlying choices covered elsewhere.
 for(const rect of reveals)for(let y=0;y<rect.height;y++)rect.pixels.copy(frame.pixels,((rect.y+y)*frame.width+rect.x)*4,y*rect.width*4,(y+1)*rect.width*4);
 frame.format=format;return frame;
}
function hubFrame(image,panel,nativeImage){
 const full=bitmapFrame(image),viewport={width:panel.x+panel.width,height:panel.height};
 const rect=maskRectangles([{x:panel.x,y:0,width:panel.width,height:panel.height}],viewport,full)[0];
 if(!rect)throw Error('Battle Hub mirror unavailable');const pixels=Buffer.alloc(rect.width*rect.height*4);
 for(let y=0;y<rect.height;y++)full.pixels.copy(pixels,y*rect.width*4,((rect.y+y)*full.width+rect.x)*4,((rect.y+y)*full.width+rect.x+rect.width)*4);
 return {width:rect.width,height:rect.height,displayWidth:panel.width,displayHeight:panel.height,pixels,format:pixelInfo(nativeImage,'pro').format};
}
// Compare native row bands first, then trim changed bands horizontally. Most
// frames change only sprites or a few chat lines, not the whole app surface.
function encodeFramePart(part,previous){
 if(!part)return null;
 if(!previous||part.width!==previous.width||part.height!==previous.height||part.format!==previous.format||part.pixels.byteOffset%4||previous.pixels.byteOffset%4)return {...part};
 const {width,height,pixels}=part,old=previous.pixels,words=new Uint32Array(pixels.buffer,pixels.byteOffset,pixels.length/4),before=new Uint32Array(old.buffer,old.byteOffset,old.length/4),patches=[];
 for(let top=0;top<height;top+=32){
  const bottom=Math.min(height,top+32),start=top*width*4,end=bottom*width*4;
  if(pixels.compare(old,start,end,start,end)===0)continue;
  let left=width,right=0;
  for(let y=top;y<bottom;y++){
   const row=y*width;let x=0;while(x<width&&words[row+x]===before[row+x])x++;
   if(x===width)continue;left=Math.min(left,x);x=width-1;while(x>=right&&words[row+x]===before[row+x])x--;right=Math.max(right,x+1);
  }
  // Unpooled buffers transfer exactly these already-masked pixels, without
  // carrying unrelated bytes from Node's shared allocation pool over IPC.
  const patchWidth=right-left,patchHeight=bottom-top,bytes=Buffer.allocUnsafeSlow(patchWidth*patchHeight*4);
  for(let y=0;y<patchHeight;y++)pixels.copy(bytes,y*patchWidth*4,((top+y)*width+left)*4,((top+y)*width+right)*4);
  patches.push({x:left,y:top,width:patchWidth,height:patchHeight,pixels:bytes});
 }
 const patchBytes=patches.reduce((sum,p)=>sum+p.pixels.length,0);
 if(patchBytes>=pixels.length*0.8)return {...part};
 const {pixels:_pixels,...metadata}=part;return {...metadata,patches};
}
class StreamerStream{
 constructor({createWindow,contents,size=()=>null,hub=()=>null,backgroundWindow=()=>null,visibility=()=>({}),theme=()=>'pro',icon,onClose=()=>{},visible=true,interval=1000/60,capture,onFrame=()=>{}}){
  Object.assign(this,{createWindow,contents,size,hub,backgroundWindow,visibility,theme,icon,onClose,visible,interval,capture,onFrame});this.window=null;this.generation=0;this.epoch=0;this.throttling=new Map();this.sequence=0;this.stats={sent:0,painted:0,dropped:0,bytes:0,fullBytes:0,stages:{samples:0,before:0,capture:0,after:0,mask:0,send:0,encode:0,ack:0}};
  this.capture=capture||((contents)=>this.nextImage(contents));
 }
 async open(){
  if(this.window&&!this.window.isDestroyed()){if(this.visible){this.window.show();this.window.focus();}return;}
  if(this.opening)return this.opening;this.opening=this.create().finally(()=>{this.opening=null;});return this.opening;
 }
 async create(){
  const generation=++this.generation;
  this.displaySize=null;
  this.keepAwake(this.contents());this.keepAwake(this.hub()?.contents);
  // A native minimize cannot be canceled and can permanently blank the Windows
  // capture surface. Own the caption controls and disable OS minimization so
  // backgrounding never enters that state, including through the taskbar.
  this.captionHeight=process.platform==='win32'?32:0;
  const win=this.createWindow({title:'Showdown Pro Stream',icon:this.icon,width:1200,height:760,minWidth:480,minHeight:360,show:false,...(this.captionHeight?{frame:false,minimizable:false}:{}),backgroundColor:'#142838',webPreferences:{preload:path.join(__dirname,'stream-preload.cjs'),partition:'pro-streamer-stream',contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
  this.window=win;win.webContents.ipc.on('stream:painted',(_event,sequence,reset)=>this.acknowledge(sequence,reset));win.setMenu(null);win.webContents.setAudioMuted(true);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.ipc.on('stream:window-control',(_event,action)=>{
   if(this.window!==win||win.isDestroyed()||!this.captionHeight)return;
   if(action==='minimize')this.keepCaptureVisible();
   else if(action==='maximize'){if(win.isMaximized())win.unmaximize();else win.maximize();}
   else if(action==='close')win.close();
  });
  win.on('restore',()=>this.queueDisplayRefresh());
  win.webContents.ipc.on('stream:restart',()=>{if(this.window!==win||win.isDestroyed())return;void this.restartDisplay(true).catch(error=>console.error('Stream display:',error.message));});
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));win.webContents.session.setPermissionCheckHandler(()=>false);
  win.on('closed',()=>{if(this.window!==win)return;this.window=null;this.latest=null;this.prefetch=null;this.encoded=null;++this.generation;clearTimeout(this.timer);clearTimeout(this.displayRefreshTimer);clearTimeout(this.ackTimer);this.stopFeed();this.cleanGuard();this.restoreThrottling();this.onClose();});
  try{await win.loadURL('showdown-pro://stream/index.html'+(this.softwareRenderer?'?renderer=2d':''));if(generation!==this.generation||win.isDestroyed())return;if(this.visible)win.show();void this.tick(generation);}catch(error){this.destroy();throw error;}
 }
 keepCaptureVisible(){
  const win=this.window,background=this.backgroundWindow();
  if(this.backgrounding||!win||win.isDestroyed()||!background||background.isDestroyed())return;
  this.backgrounding=true;const focusable=win.isFocusable();
  try{
   win.setFocusable(false);
   if(background.isMinimized())background.restore();
   background.showInactive();background.moveAbove(win.getMediaSourceId());
  }finally{if(!win.isDestroyed())win.setFocusable(focusable);this.backgrounding=false;}
 }
 queueDisplayRefresh(){
  if(!this.window?.loadURL)return;
  clearTimeout(this.displayRefreshTimer);
  this.displayRefreshTimer=setTimeout(()=>void this.restartDisplay().catch(error=>console.error('Stream display:',error.message)),100);
  this.displayRefreshTimer.unref?.();
 }
 async restartDisplay(software=false){
  this.softwareRenderer||=software;
  if(this.displayRestart)return this.displayRestart;
  const win=this.window;if(!win||win.isDestroyed())return;
  clearTimeout(this.displayRefreshTimer);this.invalidate();
  const renderer=this.softwareRenderer;
  this.displayRestart=(async()=>{
   await win.loadURL('showdown-pro://stream/index.html'+(renderer?'?renderer=2d':''));
   // Navigation can drop an in-flight acknowledgement. Start with a complete,
   // freshly masked frame after the new viewer has installed its listeners.
   if(this.window===win&&!win.isDestroyed())this.invalidate();
  })().catch(error=>{if(this.window===win&&!win.isDestroyed())throw error;}).finally(()=>{this.displayRestart=null;if(this.window===win&&!win.isDestroyed()&&renderer!==this.softwareRenderer)this.queueDisplayRefresh();});
  return this.displayRestart;
 }
 invalidate(){++this.epoch;this.latest=null;this.prefetch=null;this.encoded=null;this.hubCache=null;this.previousMap=null;this.cleanGuard();this.send(null);}
 signature(){return JSON.stringify({visibility:normalizeVisibility(this.visibility()),theme:this.theme()});}
 offer(frame,generation,epoch,signature,image){
  const packet={frame,generation,epoch,signature,image};
  if(this.pendingSequence&&frame){if(this.latest)this.stats.dropped++;this.latest=packet;return;}
  this.deliver(packet);
 }
 deliver(packet){
  if(packet.generation!==this.generation||packet.epoch!==this.epoch||packet.signature!==this.signature()||!this.window||this.window.isDestroyed())return;
  this.send(packet.frame);this.onFrame(packet.image);
 }
 acknowledge(sequence,reset=false){
  if(sequence!==this.pendingSequence)return;clearTimeout(this.ackTimer);this.pendingSequence=0;if(reset)this.encoded=null;else this.stats.painted++;this.stats.stages.ack+=performance.now()-this.sentAt;
  const packet=this.latest;this.latest=null;if(packet)this.deliver(packet);
 }
 send(frame){
  const started=performance.now();
  clearTimeout(this.ackTimer);
  if(frame){frame.sequence=++this.sequence;this.pendingSequence=frame.sequence;this.sentAt=started;this.stats.sent++;this.matchSize(frame);}else this.pendingSequence=0;
  this.lastFrame=frame;let packet=frame;
  if(frame){const clock=performance.now();packet={...frame,client:encodeFramePart(frame.client,this.encoded?.client),hub:encodeFramePart(frame.hub,this.encoded?.hub)};this.stats.stages.encode+=performance.now()-clock;this.encoded=frame;
   for(const part of [packet.client,packet.hub])if(part){this.stats.fullBytes+=part.width*part.height*4;this.stats.bytes+=part.pixels?.length||part.patches.reduce((sum,p)=>sum+p.pixels.length,0);}
  }
  if(this.window&&!this.window.isDestroyed())this.window.webContents.send('stream:frame',packet);
  if(frame&&this.window?.loadURL){const sequence=frame.sequence;this.ackTimer=setTimeout(()=>{if(this.pendingSequence===sequence)void this.restartDisplay(true).catch(error=>console.error('Stream display:',error.message));},1500);this.ackTimer.unref?.();}
  this.stats.stages.send+=performance.now()-started;
 }
 matchSize(frame){
  const width=Math.round(frame.client.displayWidth+(frame.hub?.displayWidth||0)),height=Math.round(Math.max(frame.client.displayHeight,frame.hub?.displayHeight||0));
  const key=width+'x'+height;if(key===this.displaySize)return;this.displaySize=key;
  if(this.visible&&!this.window.isMaximized()&&!this.window.isFullScreen())this.window.setContentSize(width,height+(this.captionHeight||0));
 }
 schedule(generation,started){clearTimeout(this.timer);this.timer=setTimeout(()=>void this.tick(generation),Math.max(1,this.interval-(Date.now()-started)));this.timer.unref?.();}
 nextImage(contents){
  // Electron's native frame subscription is capped at 30 fps. Surface
  // captures have no such cap and retain the before/after streamer checks.
  if(!contents.isOffscreen())return contents.capturePage(undefined,{stayHidden:true,stayAwake:true});
  if(this.feed?.contents!==contents){
   this.stopFeed();const feed={contents,waiters:new Set(),offscreen:contents.isOffscreen()};
   feed.receive=image=>{for(const waiter of feed.waiters){clearTimeout(waiter.timer);waiter.resolve(image);}feed.waiters.clear();};
   if(feed.offscreen){feed.listener=(_event,_dirty,image)=>feed.receive(image);contents.on('paint',feed.listener);}
   else contents.beginFrameSubscription(false,image=>feed.receive(image));
   this.feed=feed;
  }
  const feed=this.feed;
  return new Promise((resolve,reject)=>{
   const waiter={resolve,reject};feed.waiters.add(waiter);
   waiter.timer=setTimeout(()=>{feed.waiters.delete(waiter);contents.capturePage(undefined,{stayHidden:true,stayAwake:true}).then(resolve,reject);},100);
  });
 }
 stopFeed(){
  const feed=this.feed;if(!feed)return;this.feed=null;
  if(!feed.contents.isDestroyed()){if(feed.offscreen)feed.contents.removeListener('paint',feed.listener);else feed.contents.endFrameSubscription();}
  for(const waiter of feed.waiters){clearTimeout(waiter.timer);waiter.reject(Error('Stream closed'));}feed.waiters.clear();
 }
 async readHub(){
  const panel=this.hub();if(!panel?.contents||panel.contents.isDestroyed()||panel.width<=0||panel.height<=0)throw Error('Battle Hub mirror unavailable');
  this.keepAwake(panel.contents);const key=[panel.contents.id,panel.x,panel.width,panel.height].join(':');
  const refresh=()=>{
   if(this.hubJob?.key===key)return this.hubJob.promise;
   if(this.hubJob)return this.hubJob.promise.catch(()=>{}).then(()=>this.readHub());
   const generation=this.generation,job={key};
   job.promise=panel.contents.capturePage(undefined,{stayHidden:true,stayAwake:true}).then(image=>{
    const frame=hubFrame(image,panel,require('electron').nativeImage);
    if(generation===this.generation)this.hubCache={key,frame,time:Date.now()};return frame;
   }).finally(()=>{if(this.hubJob===job)this.hubJob=null;});this.hubJob=job;return job.promise;
  };
  if(this.hubCache?.key===key){if(Date.now()-this.hubCache.time>150)void refresh().catch(()=>{});return this.hubCache.frame;}
  return refresh();
 }
 async snapshot(contents,visibility,generation,epoch,seed){
  const current=()=>generation===this.generation&&epoch===this.epoch;
  try{
   if(!current())return null;
   const hidden=!visibility.showdex||!visibility.moves||!visibility.tooltips||!visibility.teras;
   const read=()=>contents.executeJavaScript(`(${collectMirrorMap})(${JSON.stringify(visibility)})`);
   // The previous capture's validated "after" map is also a valid "before"
   // map for the immediately following copy. Keep the observer running and
   // still validate again after capture, so transient private UI is rejected.
   let clock=performance.now();const before=hidden?(seed||await read()):null;this.stats.stages.before+=performance.now()-clock;
   if(!current())return null;
   if(hidden&&(!this.previousMap||this.previousMap.revision!==before.revision))await contents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))');
   if(!current())return null;
   const requestedSize=this.size();
   // Begin the copy a little before its display deadline, leaving room for
   // bitmap masking and patch encoding without blocking the next frame.
   const delay=(this.nextCaptureAt||0)-performance.now()-(this.processingMs||4);if(delay>0)await new Promise(resolve=>setTimeout(resolve,Math.ceil(delay)));
   if(!current())return null;clock=performance.now();this.nextCaptureAt=clock+this.interval;
   const [image,hub]=await Promise.all([this.capture(contents),visibility.hub?this.readHub():null]);this.stats.stages.capture+=performance.now()-clock;
   if(!current())return null;
   clock=performance.now();const after=hidden?await read():null;this.stats.stages.after+=performance.now()-clock;
   if(!current())return null;
   if(JSON.stringify(before)!==JSON.stringify(after)||JSON.stringify(requestedSize)!==JSON.stringify(this.size())){this.previousMap=null;return null;}
   this.previousMap=after;return {image,hub,map:after||{width:1,height:1},size:requestedSize};
  }catch(error){if(current()&&this.lastError!==error.message){console.warn('Stream mirror:',error.message);this.lastError=error.message;}return null;}
 }
 async tick(generation){
  if(generation!==this.generation||!this.window||this.window.isDestroyed())return;
  if(this.cycle===generation)return;this.cycle=generation;
  try{
  const started=Date.now();
  const epoch=this.epoch,visibility=normalizeVisibility(this.visibility()),theme=this.theme(),signature=JSON.stringify({visibility,theme});let frame,sourceImage,processingStarted;
  try{
   const contents=this.contents();
   if(contents&&!contents.isDestroyed()&&!contents.isLoadingMainFrame()){
    const key=[generation,epoch,signature].join('|'),pending=this.prefetch;this.prefetch=null;
    const snapshot=await (pending?.key===key&&pending.contents===contents?pending.promise:this.snapshot(contents,visibility,generation,epoch));
    if(generation!==this.generation)return;if(epoch!==this.epoch){this.schedule(generation,started);return;}
    // Start the next GPU surface copy while masking and sending this frame.
    // Keep one prefetched capture, never a queue of stale screenshots.
    this.prefetch={key,contents,promise:this.snapshot(contents,visibility,generation,epoch,snapshot?.map)};
    if(snapshot&&(!snapshot.size||JSON.stringify(snapshot.size)===JSON.stringify(this.size()))){
     const {image,hub,map,size}=snapshot;sourceImage=image;
     const {nativeImage}=require('electron');
     const clock=performance.now();processingStarted=clock;frame={client:maskedFrame(image,map,map.masks||[],theme,nativeImage),hub,theme};this.stats.stages.mask+=performance.now()-clock;this.stats.stages.samples++;
     if(size?.width>0&&size?.height>0){frame.client.displayWidth=size.width;frame.client.displayHeight=size.height;}
    }
   }else frame=null;
  }catch(error){frame=undefined;if(generation!==this.generation)return;if(this.lastError!==error.message)console.warn('Stream mirror:',error.message);this.lastError=error.message;}
  if(generation!==this.generation||!this.window||this.window.isDestroyed())return;
  // Keep the last safe frame during transient capture/layout changes. Visibility
  // changes explicitly clear it via invalidate(), so old allowed content cannot linger.
  if(frame!==undefined)this.offer(frame,generation,epoch,signature,sourceImage);
  if(processingStarted)this.processingMs=(this.processingMs||4)*0.8+Math.min(this.interval/2,performance.now()-processingStarted)*0.2;
  this.schedule(generation,started);
  }finally{if(this.cycle===generation)this.cycle=null;}
 }
 cleanGuard(){const contents=this.contents();if(contents&&!contents.isDestroyed())void contents.executeJavaScript('window.__proMirrorGuard?.observer.disconnect();delete window.__proMirrorGuard;void 0;').catch(()=>{});}
 keepAwake(contents){if(!contents||contents.isDestroyed()||!contents.setBackgroundThrottling)return;if(!this.throttling.has(contents))this.throttling.set(contents,contents.getBackgroundThrottling());contents.setBackgroundThrottling(false);}
 restoreThrottling(){for(const [contents,allowed] of this.throttling)if(!contents.isDestroyed())contents.setBackgroundThrottling(allowed);this.throttling.clear();}
 destroy(){++this.generation;++this.epoch;clearTimeout(this.timer);clearTimeout(this.displayRefreshTimer);clearTimeout(this.ackTimer);this.stopFeed();this.cleanGuard();this.restoreThrottling();const win=this.window;this.window=null;this.lastFrame=null;this.latest=null;this.prefetch=null;this.encoded=null;this.hubCache=null;if(win&&!win.isDestroyed())win.destroy();}
}
module.exports={StreamerStream,normalizeVisibility,collectMirrorMap,maskRectangles,maskedFrame,bitmapFrame,encodeFramePart};
