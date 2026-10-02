const {app,session,BrowserWindow}=require('electron');
require('./mute-test-audio.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {BrowserAddons}=require('../app/browser-addons.cjs');
const {addonDefaults}=require('../app/addon-catalog.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/tera-notices');
app.setPath('userData',path.join(out,'profile'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const ses=session.fromPartition('persist:tera-notices'),manager=new BrowserAddons(root,ses);
  await manager.apply({...Object.fromEntries(Object.keys(addonDefaults).map(key=>[key,false])),didItTera:true});
  const settings=new BrowserWindow({show:false,webPreferences:{session:ses}});
  const options=async values=>{await settings.loadURL(manager.optionsUrl('didItTera'));await settings.webContents.executeJavaScript(`chrome.storage.local.set(${JSON.stringify(values)})`);};
  const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{session:ses,offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
  assert.equal(wc.isAudioMuted(),true);
  assert.equal(settings.webContents.isAudioMuted(),true);
  const run=code=>wc.executeJavaScript('(()=>{try{'+code+'}catch(error){return {auditError:String(error),auditStack:error.stack};}})()').then(result=>{if(result?.auditError)throw new Error(result.auditError+'\n'+code+'\n'+result.auditStack);return result;});
  const wait=async code=>{for(let i=0;i<200;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(100);}throw new Error('Tera/notice audit timed out: '+code);};
  const capture=async filename=>{for(let attempt=0;attempt<3;attempt++){await pause(150);try{fs.writeFileSync(path.join(out,filename),(await wc.capturePage()).toPNG());return;}catch(error){if(attempt===2||!String(error).includes('UnknownVizError'))throw error;}}};
  const report=[];
  for(const version of ['old','new']) {
    await options({ditShowBothUserTera:true,ditShowNicknames:false,ditFontSize:11});
    await settings.webContents.executeJavaScript("chrome.storage.local.remove('ditTextColor')");
    await wc.loadURL('https://play.pokemonshowdown.com/'+(version==='old'?'oldclient':'newclient'));
    const host=version==='old'?'app':'PS';
    await wait(version==='old'?'window.app?.socket?.readyState===1 && window.OptionsPopup':'window.PS?.connection?.connected && window.PS?.prefs');
    await run(`window.__teraAuditSends=[];${version==='old'?'app.socket.send':'PS.connection.send'}=data=>__teraAuditSends.push(data);${version==='old'?"Storage.prefs('autotimer',false);":"PS.prefs.set('autotimer',false);"}`);
    assert.equal(await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8')),true);
    await wc.insertCSS('@scope (html.showdown-pro){'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'}',{cssOrigin:'user'});
    const theme=async value=>{await run(version==='old'?`OptionsPopup.prototype.setTheme({currentTarget:{value:${JSON.stringify(value)}}});`:`PS.prefs.set('theme',${JSON.stringify(value)});`);await pause(100);};
    await theme('pro');
    const id='battle-gen9randombattle-'+(version==='old'?'900001':'900002');
    // A second open room with the same nickname catches cross-room name lookup.
    const other=id+'0';
    const fixture=(room,species,name)=>'>'+room+'\n|init|battle\n|title|Tera reminder audit\n|gen|9\n|gametype|singles\n|tier|[Gen 9] Random Battle\n|player|p1|ProTest|1\n|player|p2|Opponent|2\n|teamsize|p1|6\n|teamsize|p2|6\n|start\n|switch|p1a: Cinder (friend)|Charizard, L80, M|100/100\n|switch|p2a: '+name+'|'+species+', L80, F|100/100\n|turn|1';
    await run(`${host}.receive(${JSON.stringify(fixture(other,'Blastoise','Fish'))});${host}.receive(${JSON.stringify(fixture(id,'Vaporeon','Fish'))});${host}.focusRoom(${JSON.stringify(id)});`);
    await wait(`${host}.rooms[${JSON.stringify(other)}]?.battle && ${host}.rooms[${JSON.stringify(id)}]?.battle`);
    await run(`${host}.rooms[${JSON.stringify(other)}].battle.seekTurn(Infinity);${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
    await wait(`document.querySelector('#room-${id} .rightbar .picon[aria-label]')`);
    await pause(250);
    await run(`${host}.receive(${JSON.stringify('>'+id+'\n|-terastallize|p2a: Fish|Ghost\n|-terastallize|p1a: Cinder (friend)|Fire')});${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
    await wait(`document.querySelectorAll('#room-${id} .ditTeraInfo').length===2`);
    const names=await run(`return [...document.querySelectorAll('#room-${id} .ditPokemonName')].map(e=>e.textContent).sort();`);
    fs.writeFileSync(path.join(out,version+'-names.json'),JSON.stringify(await run(`const room=document.getElementById('room-${id}');return {cards:[...room.querySelectorAll('.ditTeraInfo')].map(e=>e.outerHTML),icons:[...room.querySelectorAll('.picon[aria-label]')].map(e=>e.getAttribute('aria-label')),log:[...room.querySelectorAll('.battle-history')].map(e=>e.innerText)};`),null,2));
    assert.deepEqual(names,['Charizard','Vaporeon']);
    const cards=[];
    for(const selected of ['pro','light','dark']) {
      await theme(selected);
      for(const width of [1100,680,430]) {
        win.setContentSize(width,800);await pause(150);
        const appearance=await run(`const room=document.getElementById('room-${id}'),battle=room.querySelector('.innerbattle').getBoundingClientRect();return [...room.querySelectorAll('.ditTeraInfo')].map(e=>{const r=e.getBoundingClientRect(),close=e.querySelector('button').getBoundingClientRect(),s=getComputedStyle(e),bar=room.querySelector(e.dataset.side===\"you\"?\".leftbar\":\".rightbar\").getBoundingClientRect();return {sidebarInside:r.left>=bar.left-1&&r.right<=bar.right+1,name:e.querySelector('.ditPokemonName').textContent,background:s.backgroundImage,border:s.borderTopColor,color:s.color,font:s.fontSize,width:r.width,inside:r.left>=battle.left-1&&r.right<=battle.right+1&&r.top>=battle.top-1&&r.bottom<=battle.bottom+1,closeInside:close.left>=r.left-1&&close.right<=r.right+1&&close.top>=r.top-1&&close.bottom<=r.bottom+1};});`);
        for(const card of appearance) {
          assert.equal(card.inside,true,version+' '+selected+' card bounds at '+width);
          assert.equal(card.background.includes('gradient'),selected==='pro');
          if(selected==='pro'){assert.equal(card.sidebarInside,true,'Tera card stays inside its trainer sidebar');assert.equal(card.closeInside,true);assert.equal(card.border,'rgb(82, 123, 148)');}
        }
        cards.push({selected,width,appearance});
        await capture(`${version}-${selected}-tera-${width}.png`);
      }
    }
    await theme('pro');win.setContentSize(1100,800);
    await run(`document.querySelector('#room-${id} .ditTeraInfo[data-side="opponent"] button').click();`);
    assert.equal(await run(`return document.querySelector('#room-${id} .ditTeraInfo[data-side="opponent"]').style.display;`),'none');
    // Native battle-scene and connect-error rendering use the actual notice class.
    const unavailable='Battle "gen9randombattle-2691234101-w7rywv7b1udhsiuxebsahdy3738vx9ywfwp" not found';
    const notice='<div class="broadcast-red pad"><strong>'+unavailable+'</strong></div><br />The battle you\'re looking for has expired. Battles expire after 15 minutes of inactivity unless they\'re saved.<br /><br />In the future, remember to click "Save replay" to save a replay permanently.';
    await run(`const scene=${host}.rooms[${JSON.stringify(id)}].battle.scene;scene.messagebarOpen=false;scene.message(${JSON.stringify(notice)});`);
    await wait(`document.querySelector('#room-${id} .messagebar .broadcast-red')`);
    if(version==='new') {
      await run(`const room=PS.rooms[${JSON.stringify(id)}];room.connectMode='not-found';room.connectError=${JSON.stringify(unavailable)};room.update(null);`);
    } else {
      await run(`const room=app.rooms[${JSON.stringify(id)}];room.$controls.html('<div class="pad"><div class="broadcast-red pad"><h3>'+${JSON.stringify(unavailable)}+'</h3><p class="buttonbar"><button class="button">Close</button></p></div></div>');`);
    }
    const notices=[];
    for(const selected of ['pro','light','dark']) {
      await theme(selected);
      for(const width of [1100,680,430]) {
        win.setContentSize(width,800);await pause(150);
        const appearance=await run(`return [...document.querySelectorAll('#room-${id} .broadcast-red')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,border:s.borderTopColor,overflow:e.scrollWidth>e.clientWidth+1,width:r.width};});`);
        assert.ok(appearance.length>=2);
        for(const element of appearance) {
          assert.equal(element.background==='rgb(25, 52, 72)',selected==='pro');
          if(selected==='pro')assert.equal(element.overflow,false,'Long battle ID stays in the notice');
        }
        notices.push({selected,width,appearance});
        await capture(`${version}-${selected}-notices-${width}.png`);
      }
    }
    if(version==='new') {
      await theme('pro');win.setContentSize(1100,800);
      await run(`PS.receive(${JSON.stringify('>pro-expired-audit\n|init|chat\n|title|Expired room audit')});PS.focusRoom('pro-expired-audit');`);
      await wait("document.getElementById('room-pro-expired-audit')");
      await run(`PS.receive(${JSON.stringify('>pro-expired-audit\n|expire|')});`);
      await run(`PS.receive(${JSON.stringify('>pro-expired-audit\n|deinit')});`);
      await wait("document.querySelector('#room-pro-expired-audit .broadcast-red')");
      assert.equal(await run("return getComputedStyle(document.querySelector('#room-pro-expired-audit .broadcast-red')).backgroundColor;"),'rgb(25, 52, 72)');
      await capture('new-expired-room.png');
    }
    report.push({version,names,cards,notices});
    console.log(version+': species names, both-player cards, dismissal, palettes, notice wrapping and narrow battle bounds passed');
  }
  settings.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  win.close();app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
