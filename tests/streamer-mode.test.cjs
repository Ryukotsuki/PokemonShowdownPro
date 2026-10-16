const {test}=require('node:test'),assert=require('node:assert/strict');
const {StreamerStream,normalizeVisibility,maskRectangles,encodeFramePart}=require('../app/streamer-mode.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('stream visibility defaults hidden, persists explicit choices and rejects non-booleans',()=>{
 const {loadPreferences,savePreferences}=require('../app/preferences.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pro-mirror-prefs-'));
 try{
  const file=path.join(directory,'preferences.json'),prefs=loadPreferences(file);
  for(const key of ['streamerEnabled','streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])assert.equal(prefs[key],false);
  for(const key of ['streamerEnabled','streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])prefs[key]=true;
  savePreferences(file,prefs);const restored=loadPreferences(file);
  for(const key of ['streamerEnabled','streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])assert.equal(restored[key],true);
  fs.writeFileSync(file,JSON.stringify({streamerEnabled:'true',streamerShowHub:1,streamerShowShowdex:'false',streamerShowMoves:'true',streamerShowPokemonTooltips:'true',streamerShowTeras:'true'}));
  const invalid=loadPreferences(file);for(const key of ['streamerEnabled','streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'])assert.equal(invalid[key],false);
 }finally{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});}
});
test('pre-1.2.0 streaming choices migrate without overriding explicit new choices',()=>{
 const {loadPreferences,savePreferences}=require('../app/preferences.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pro-streamer-migration-'));
 const keys=['streamerEnabled','streamerShowHub','streamerShowShowdex','streamerShowMoves','streamerShowPokemonTooltips','streamerShowTeras'];
 const legacyKey=key=>key==='streamerEnabled'?'privacyMode':key.replace(/^streamer/,'privacy');
 try{
  const file=path.join(directory,'preferences.json');
  const legacy=Object.fromEntries(keys.map((key,i)=>[legacyKey(key),i%2===0]));
  fs.writeFileSync(file,JSON.stringify(legacy));
  const migrated=loadPreferences(file);
  for(const key of keys){assert.equal(migrated[key],legacy[legacyKey(key)]);assert.ok(!Object.hasOwn(migrated,legacyKey(key)));}
  savePreferences(file,migrated);
  const stored=JSON.parse(fs.readFileSync(file));
  for(const key of keys){assert.equal(stored[key],migrated[key]);assert.ok(!Object.hasOwn(stored,legacyKey(key)));}
  fs.writeFileSync(file,JSON.stringify(Object.fromEntries(keys.flatMap(key=>[[legacyKey(key),true],[key,false]]))));
  for(const key of keys)assert.equal(loadPreferences(file)[key],false,'Explicit false takes precedence over a legacy true');
  for(const invalid of ['true',1,null]){
   fs.writeFileSync(file,JSON.stringify(Object.fromEntries(keys.flatMap(key=>[[legacyKey(key),true],[key,invalid]]))));
   for(const key of keys)assert.equal(loadPreferences(file)[key],false,'An invalid new value cannot reveal a previously hidden item');
   fs.writeFileSync(file,JSON.stringify(Object.fromEntries(keys.map(key=>[legacyKey(key),invalid]))));
   for(const key of keys)assert.equal(loadPreferences(file)[key],false,'Legacy values remain strictly boolean');
  }
 }finally{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});}
});
test('display recovery drops stale deltas and requests a full frame on the same window',async()=>{
 const sent=[],urls=[],win={isDestroyed:()=>false,loadURL:async url=>urls.push(url),destroy:()=>{},webContents:{send:(_channel,packet)=>sent.push(packet)}};
 const stream=new StreamerStream({createWindow:()=>{},contents:()=>null,visible:false});stream.window=win;
 const frame=()=>({client:{width:3,height:3,displayWidth:3,displayHeight:3,format:'bgra',pixels:Buffer.alloc(36,5)},hub:null,theme:'pro'});
 try{
  stream.offer(frame(),0,0,stream.signature());stream.offer(frame(),0,0,stream.signature());assert.ok(stream.pendingSequence);assert.ok(stream.latest);
  await stream.restartDisplay(true);
  assert.equal(stream.window,win);assert.equal(stream.pendingSequence,0);assert.equal(stream.latest,null);assert.equal(stream.encoded,null);
  assert.deepEqual(urls,['showdown-pro://stream/index.html?renderer=2d']);
  stream.offer(frame(),0,stream.epoch,stream.signature());assert.ok(sent.at(-1).client.pixels,'Recovery starts with complete pixels, not deltas');
  await stream.restartDisplay();assert.ok(urls.at(-1).endsWith('?renderer=2d'),'The selected fallback survives subsequent restores');
 }finally{stream.destroy();}
});
test('mask bounds round outward, scale with zoom/HiDPI and clip to the image',()=>{
 assert.deepEqual(maskRectangles([{x:-2,y:5.3,width:22,height:10.1},{x:95,y:45,width:20,height:20}],{width:100,height:50},{width:200,height:100}),[{x:0,y:10,width:40,height:21},{x:190,y:90,width:10,height:10}]);
 assert.deepEqual(maskRectangles([{x:200,y:0,width:10,height:10}],{width:100,height:50},{width:200,height:100}),[]);
 assert.deepEqual(normalizeVisibility({hub:'true',showdex:1,moves:true}),{hub:false,showdex:false,moves:true,tooltips:false,teras:false});
});
test('Windows backgrounding keeps the same capturable window and restores focusability',()=>{
 const calls=[];
 const win={isDestroyed:()=>false,isFocusable:()=>true,setFocusable:value=>calls.push(['focusable',value]),restore:()=>calls.push(['restore-stream']),showInactive:()=>calls.push(['show-stream']),getMediaSourceId:()=>'window:123:0'};
 const background={isDestroyed:()=>false,isMinimized:()=>true,restore:()=>calls.push(['restore-client']),showInactive:()=>calls.push(['show-client']),moveAbove:id=>calls.push(['client-above',id])};
 const stream=new StreamerStream({createWindow:()=>{},contents:()=>null,backgroundWindow:()=>background});stream.window=win;
 stream.keepCaptureVisible();
 assert.deepEqual(calls,[['focusable',false],['restore-client'],['show-client'],['client-above','window:123:0'],['focusable',true]]);
 assert.equal(stream.window,win);assert.equal(stream.generation,0);assert.equal(stream.backgrounding,false);
 background.moveAbove=()=>{throw Error('Window unavailable');};
 assert.throws(()=>stream.keepCaptureVisible(),/Window unavailable/);assert.deepEqual(calls.at(-1),['focusable',true]);assert.equal(stream.backgrounding,false);
});
test('closing the mirror during capture prevents stale frames being sent',async()=>{
 let finish;const sent=[],map={url:'https://play.pokemonshowdown.com',width:100,height:100,revision:0,masks:[]};
 const contents={isDestroyed:()=>false,isLoadingMainFrame:()=>false,executeJavaScript:()=>Promise.resolve(map)};
 const stream=new StreamerStream({contents:()=>contents,createWindow:()=>{},capture:()=>new Promise(resolve=>finish=resolve)});
 const win={isDestroyed:()=>false,destroy(){this.destroyed=true;},webContents:{send:(...args)=>sent.push(args)}};
 stream.window=win;const pending=stream.tick(0);while(!finish)await Promise.resolve();stream.destroy();finish({});await pending;
 assert.deepEqual(sent,[]);assert.equal(win.destroyed,true);assert.equal(stream.timer,undefined);
});
test('changing visibility immediately clears the previously displayed frame',()=>{
 const sent=[],stream=new StreamerStream({contents:()=>null,createWindow:()=>{}});
 stream.window={isDestroyed:()=>false,webContents:{send:(...args)=>sent.push(args)}};stream.lastFrame={private:true};stream.invalidate();
 assert.equal(stream.lastFrame,null);assert.deepEqual(sent,[['stream:frame',null]]);
});
test('frame handoff keeps only the latest safe replacement and invalidation drops it',()=>{
 const sent=[],stream=new StreamerStream({contents:()=>null,createWindow:()=>{},visible:false});
 stream.window={isDestroyed:()=>false,webContents:{send:(_channel,packet)=>sent.push(packet)}};
 const make=n=>({client:{width:2,height:2,displayWidth:2,displayHeight:2,format:'bgra',pixels:Buffer.alloc(16,n)},hub:null,theme:'pro'}),signature=stream.signature();
 const first=make(1),second=make(2),third=make(3);stream.offer(first,0,0,signature);stream.offer(second,0,0,signature);stream.offer(third,0,0,signature);
 assert.equal(sent.length,1);assert.equal(stream.latest.frame,third);assert.equal(stream.stats.dropped,1);
 stream.acknowledge(1);assert.equal(sent.length,2);assert.equal(stream.lastFrame,third);
 stream.offer(make(4),0,0,signature);stream.invalidate();stream.acknowledge(2);assert.equal(sent.length,3);assert.equal(sent[2],null);assert.equal(stream.latest,null);
});
test('dirty-region packets reconstruct exact pixels through edits, unchanged frames and resizing',()=>{
 let previous,decoded;const width=93,height=87;
 const apply=packet=>{if(packet.pixels)decoded=Buffer.from(packet.pixels);else for(const p of packet.patches)for(let y=0;y<p.height;y++)p.pixels.copy(decoded,((p.y+y)*packet.width+p.x)*4,y*p.width*4,(y+1)*p.width*4);};
 const frames=[Buffer.alloc(width*height*4,9)];
 for(const [x,y,w,h,color] of [[2,3,15,12,27],[80,76,13,11,99],[0,0,1,87,54],[35,31,13,40,78]]){const pixels=Buffer.from(frames.at(-1));for(let row=y;row<y+h;row++)pixels.fill(color,(row*width+x)*4,(row*width+x+w)*4);frames.push(pixels);}
 frames.push(Buffer.from(frames.at(-1)));
 for(const pixels of frames){const part={width,height,format:'bgra',pixels},packet=encodeFramePart(part,previous);apply(packet);assert.ok(decoded.equals(pixels));previous=part;}
 assert.deepEqual(encodeFramePart(previous,previous).patches,[]);
 const resized={width:10,height:10,format:'bgra',pixels:Buffer.alloc(400,1)};assert.ok(encodeFramePart(resized,previous).pixels);assert.ok(encodeFramePart({...previous,format:'rgba'},previous).pixels);
});
test('a failed viewer draw requests a fresh complete frame instead of a delta',()=>{
 const sent=[],stream=new StreamerStream({contents:()=>null,createWindow:()=>{},visible:false});stream.window={isDestroyed:()=>false,webContents:{send:(_channel,packet)=>sent.push(packet)}};
 const make=()=>({client:{width:3,height:3,displayWidth:3,displayHeight:3,format:'bgra',pixels:Buffer.alloc(36,1)},hub:null,theme:'pro'});
 stream.offer(make(),0,0,stream.signature());stream.offer(make(),0,0,stream.signature());stream.acknowledge(1,true);
 assert.ok(sent[1].client.pixels);assert.equal(stream.stats.painted,0);
});
test('a prefetched capture rejects transient private UI changes against its seeded map',async()=>{
 const before={url:'https://play.pokemonshowdown.com',width:100,height:100,revision:0,masks:[],reveals:[]};
 const contents={executeJavaScript:()=>Promise.resolve({...before,revision:1})};
 const stream=new StreamerStream({createWindow:()=>{},contents:()=>contents,capture:async()=>({})});stream.previousMap=before;
 const snapshot=await stream.snapshot(contents,{moves:false,showdex:false,tooltips:false},0,0,before);
 assert.equal(snapshot,null);assert.equal(stream.previousMap,null);
});
