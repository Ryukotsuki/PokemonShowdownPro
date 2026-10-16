require('./mute-test-audio.cjs');
const {app,session,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {BrowserAddons}=require('../app/browser-addons.cjs'),{addonDefaults}=require('../app/addon-catalog.cjs');
const {loadAuditClient,isolateAuditNetwork}=require('./audit-client.cjs');
const {history}=require('../tests/fixtures.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/team-sheets');app.setPath('userData',path.join(out,'profile'));app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
setTimeout(()=>{console.error('Team sheet audit timed out');app.exit(1);},120000).unref();
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});const ses=session.fromPartition('persist:team-sheet-audit');isolateAuditNetwork(ses);
 const manager=new BrowserAddons(root,ses);await manager.apply(Object.fromEntries(Object.keys(addonDefaults).map(key=>[key,key==='threeIsland'])));assert.equal(manager.errors.size,0);
 const win=new BrowserWindow({show:false,width:1300,height:900,webPreferences:{session:ses,offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
 const run=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
 const wait=async(code,label=code)=>{for(let i=0;i<250;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(100);}throw Error('Timed out '+label);};
 const names=['Charizard','Iron Treads','Iron Boulder','Miraidon','Rillaboom','Terapagos'];
 const html='<div class="infobox"><details open><summary>Open team sheet for 2nahog9</summary>'+names.map(name=>'<p><img src="https://play.pokemonshowdown.com/sprites/gen5/'+name.toLowerCase().replace(/ /g,'')+'.png" /><br>'+name+' (F) @ Leftovers<br><br>Ability: Pressure<br><br>Timid Nature<br>Tera Type: <img src="https://play.pokemonshowdown.com/sprites/types/Fairy.png" alt="[Fairy]" /><br>- Tackle<br>- Protect</p>').join('')+'</details></div>';
 try{
  for(const version of ['old','new']){
   await loadAuditClient(wc,'https://play.pokemonshowdown.com/'+version+'client');const host=version==='old'?'app':'PS',id='battle-gen9ou-998961';
   await wait(version==='old'?'window.app?.socket?.readyState===1&&window.Storage':'window.PS?.connection?.connected&&window.PS.prefs');
   await wait('window.R3I&&window.__showdownProPastePreview');
   await run(version==='old'?"app.socket.send=()=>{};Storage.prefs('theme','pro');":"PS.connection.send=()=>{};PS.prefs.set('theme','pro');");
   await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8'));await wc.insertCSS(require('../app/client-theme-css.cjs'),{cssOrigin:'user'});
   await run(`${host}.receive(${JSON.stringify('>'+id+'\n'+history().filter(line=>!line.startsWith('|request|')).join('\n'))});${host}.focusRoom('${id}');${host}.receive(${JSON.stringify('>'+id+'\n|raw|'+html)});`);
   await wait(`${host}.rooms['${id}'].battle`);await run(`${host}.rooms['${id}'].battle.seekTurn(Infinity);`);
   await wait(`document.getElementById('room-${id}').querySelector('.pro-team-sheet-import')`,'One import control appears on native sheet');
   const teams=version==='old'?'Storage.teams':'PS.teams.list',unpack=version==='old'?'Storage.unpackTeam':'Teams.unpack';
   const before=await run(`return ${teams}.length;`);
   for(let count=0;count<4;count++){
    await run(`document.getElementById('room-${id}').querySelector('.pro-team-sheet-import').click();`);await pause(100);
    assert.equal(await run(`return document.getElementById('room-${id}').querySelectorAll('summary button').length;`),1,'Repeated imports cannot duplicate Import controls');
    assert.equal(await run(`return ${teams}.length;`),before+count+1,'One team is saved per click');
    assert.equal(await run(`return ${teams}[0].name;`),"2nahog9's team sheet",'Imported team is named after the owner, excluding the Import control');
    const sets=await run(`return ${unpack}(${teams}[0].${version==='old'?'team':'packedTeam'});`);
    assert.equal(sets.length,6,'Exactly six Pokemon, with no blank entries or box');assert.deepEqual(sets.map(set=>set.species),names);
    assert.ok(sets.every(set=>set.item==='Leftovers'&&set.ability==='Pressure'&&set.teraType==='Fairy'&&set.moves.length===2),'Native imported sets preserve all sheet information');
   }
   assert.ok(await run(`const button=document.getElementById('room-${id}').querySelector('.pro-team-sheet-import'),style=getComputedStyle(button);return style.backgroundImage.includes('gradient')&&style.borderRadius!=='0px';`),'Team sheet Import uses Pro styling');
   await run(`const room=document.getElementById('room-${id}');room.querySelector('details').open=true;room.querySelector('.battle-log').scrollTop=0;`);await pause(200);
   fs.writeFileSync(path.join(out,version+'.png'),(await wc.capturePage()).toPNG());console.log(version+' team sheet: single stable control, repeated native import, exactly six complete Pokemon and Pro styling passed');
  }
  win.destroy();app.exit(0);
 }catch(error){console.error(error);fs.writeFileSync(path.join(out,'failure.html'),await run('return document.documentElement.outerHTML;'));fs.writeFileSync(path.join(out,'failure.png'),(await wc.capturePage()).toPNG());app.exit(1);}
}).catch(error=>{console.error(error);app.exit(1);});
