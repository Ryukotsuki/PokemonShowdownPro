const {app,session,BrowserWindow}=require('electron');
require('./mute-test-audio.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {BrowserAddons}=require('../app/browser-addons.cjs');
const {addonDefaults}=require('../app/addon-catalog.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/hp-bars');
app.setPath('userData',path.join(out,'profile'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const ses=session.fromPartition('persist:hp-bars'),manager=new BrowserAddons(root,ses);
 const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{session:ses,offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
 const evaluate=code=>wc.executeJavaScript('(()=>{'+code+'})()');
 const wait=async code=>{for(let i=0;i<200;i++){if(await evaluate('return !!('+code+');').catch(()=>false))return;await pause(100);}throw new Error('HP bar audit timed out: '+code);};
 const disabled=Object.fromEntries(Object.keys(addonDefaults).map(key=>[key,false]));
 const theme=fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope');
 const report=[];
 for(const version of ['old','new']) {
  const host=version==='old'?'app':'PS',baseline=new Map();
  for(const enabled of [false,true]) {
   await manager.apply({...disabled,enhancedTooltips:enabled});
   await wc.loadURL('https://play.pokemonshowdown.com/'+version+'client');
   await wait(version==='old'?'window.app?.socket?.readyState===1 && window.PokemonSprite':'window.PS?.connection?.connected && window.PS.roomTypes.battle && window.PokemonSprite');
   if(enabled)await wait('document.documentElement.hasAttribute("data-showdown-pro-enhanced")');
   await evaluate(`${version==='old'?'app.socket.send':'PS.connection.send'}=()=>{};document.documentElement.classList.add('showdown-pro','dark');`);
   await wc.insertCSS('@scope (html.showdown-pro) {\n'+theme+'\n}',{cssOrigin:'user'});
   for(const mode of ['singles','doubles']) {
    const id='battle-gen9customgame-'+(mode==='singles'?801:802);
    const lines=['|init|battle','|title|HP bar audit','|gametype|'+mode,'|gen|9','|tier|[Gen 9] Custom Game','|player|p1|ProTest|1','|player|p2|Opponent|2','|teamsize|p1|3','|teamsize|p2|3','|start','|switch|p1a: Jumpluff|Jumpluff, L87, F|100/100','|switch|p2a: Bastiodon|Bastiodon, L89, F|97/100'];
    if(mode==='doubles')lines.push('|switch|p1b: Falinks|Falinks, L84|100/100','|switch|p2b: Zapdos|Zapdos, L77|100/100');
    lines.push('|turn|1');
    await evaluate(`${host}.receive(${JSON.stringify('>'+id+'\n'+lines.join('\n'))});${host}.focusRoom(${JSON.stringify(id)});`);
    await wait(`${host}.rooms[${JSON.stringify(id)}]?.battle`);
    const capture=async step=>{
     await evaluate(`${host}.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
     await wait(`document.querySelectorAll('#room-'+${JSON.stringify(id)}+' .statbar strong').length>=${mode==='singles'?2:4}`);
     await pause(150);
     const bars=await evaluate(`const room=document.getElementById('room-'+${JSON.stringify(id)}),battle=room.querySelector('.battle').getBoundingClientRect();
       const rect=e=>{const r=e.getBoundingClientRect();return {x:Math.round((r.left-battle.left)*100)/100,y:Math.round((r.top-battle.top)*100)/100,width:r.width,height:r.height};};
       return [...room.querySelectorAll('.statbar')].filter(e=>getComputedStyle(e).display!=='none' && Number(getComputedStyle(e).opacity)>0).map(bar=>{
         const r=rect(bar),before=getComputedStyle(bar,'::before'),link=bar.querySelector('strong a');
         return {classes:bar.className,name:bar.querySelector('strong').textContent,bar:r,hp:rect(bar.querySelector('.hpbar')),percent:rect(bar.querySelector('.hptext')),plate:{left:r.x+parseFloat(before.left),right:r.x+r.width-parseFloat(before.right)},tera:!!bar.querySelector('img[alt^="Tera-"]'),linked:!!link,color:link?getComputedStyle(link).color:null};
       });`);
     assert.equal(bars.length,mode==='singles'?2:4);
     for(const bar of bars) {
      assert.ok(bar.percent.x>=bar.plate.left-1 && bar.percent.x+bar.percent.width<=bar.plate.right+1,'HP percentage stays inside its plate: '+JSON.stringify(bar));
      if(mode==='singles')assert.ok(bar.plate.left>=99 && bar.plate.right<=541,'Plate stays between trainer panels: '+JSON.stringify(bar));
      if(enabled){assert.equal(bar.linked,true);assert.equal(bar.color,'rgb(241, 248, 252)');}
     }
     const geometry=bars.map(({linked,color,...bar})=>bar),key=mode+'-'+step;
     if(!enabled)baseline.set(key,geometry);else assert.deepEqual(geometry,baseline.get(key),version+' '+key+' matches native HP bar geometry');
     report.push({version,enabled,mode,step,bars});
     if(enabled) {
      const clip=await evaluate(`const r=document.getElementById('room-'+${JSON.stringify(id)}).querySelector('.battle').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};`);
      fs.writeFileSync(path.join(out,version+'-'+key+'.png'),(await wc.capturePage(clip)).toPNG());
     }
    };
    await capture('initial');
    await evaluate(`${host}.receive(${JSON.stringify('>'+id+'\n|-terastallize|p2a: Bastiodon|Rock\n|-boost|p2a: Bastiodon|def|2\n|turn|2')});`);
    await capture('tera');
    assert.ok(report.at(-1).bars.some(bar=>bar.tera),'Native Tera icon is retained');
    if(mode==='singles') {
     await evaluate(`${host}.receive(${JSON.stringify('>'+id+'\n|switch|p1a: Falinks|Falinks, L84|100/100\n|turn|3')});`);
     await capture('switch');
    }
    await evaluate(`${host}.rooms[${JSON.stringify(id)}].battle.switchViewpoint();`);
    await capture('reversed');
   }
  }
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log('Enhanced Tooltips HP bars match the native layout on both clients, including doubles, Tera, switches and reversed viewpoints.');
 app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
