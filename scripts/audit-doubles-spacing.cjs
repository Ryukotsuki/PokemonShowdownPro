require('./mute-test-audio.cjs');
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {loadAuditClient,isolateAuditNetwork}=require('./audit-client.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/doubles-spacing');
app.setPath('userData',path.join(out,'profile'));app.disableHardwareAcceleration();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
setTimeout(()=>{console.error('Doubles spacing audit timed out');app.exit(1);},180000).unref();
app.whenReady().then(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const ses=session.fromPartition('doubles-spacing');isolateAuditNetwork(ses);
 const win=new BrowserWindow({show:false,width:1920,height:1080,webPreferences:{session:ses,offscreen:true,backgroundThrottling:false}}),wc=win.webContents;
 const run=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
 const wait=async code=>{for(let i=0;i<200;i++){if(await run('return !!('+code+');').catch(()=>false))return;await pause(100);}throw Error('Timed out: '+code);};
 const report=[];
 for(const version of ['old','new']){
  const host=version==='old'?'app':'PS',id='battle-gen9doublescustomgame-998981';
  await loadAuditClient(wc,'https://play.pokemonshowdown.com/'+version+'client');wc.setZoomFactor(1);
  await wait(version==='old'?'window.app?.socket?.readyState===1 && window.Storage':'window.PS?.connection?.connected && window.PS.prefs');
  await run(`${version==='old'?'app.socket.send':'PS.connection.send'}=()=>{};`);
  await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8'));
  const css=require('../app/client-theme-css.cjs')+'\n'+fs.readFileSync(path.join(root,'app/theater-mode.css'),'utf8');
  await wc.insertCSS(css,{cssOrigin:'user'});await wc.insertCSS(css);
  await run("window.showdownProEvents={getTheaterLayout:async()=>({width:320,chatShare:0.56,chatCollapsed:true,calcCollapsed:true}),setTheaterLayout:async value=>value,setTheaterActive:()=>{}};");
  await wc.executeJavaScript(fs.readFileSync(path.join(root,'app/theater-mode.js'),'utf8'));
  const lines=['|init|battle','|title|Doubles spacing audit','|gametype|doubles','|gen|9','|tier|[Gen 9] Doubles Custom Game','|player|p1|ProTest|1','|player|p2|Opponent|2','|teamsize|p1|3','|teamsize|p2|3','|start','|switch|p1a: Dedenne|Dedenne, L85, F|50/100 brn','|switch|p1b: Ninetales|Ninetales-Alola, L75, M|100/100','|switch|p2a: Lanturn|Lanturn, L87, M|53/100','|switch|p2b: Hatterene|Hatterene, L84, F|100/100','|-unboost|p1a: Dedenne|spe|1','|-boost|p2a: Lanturn|spd|1','|turn|1'];
  await run(`${host}.receive(${JSON.stringify('>'+id+'\n'+lines.join('\n'))});${host}.focusRoom('${id}');`);
  await wait(`${host}.rooms['${id}']?.battle`);
  await run(`${host}.rooms['${id}'].battle.seekTurn(Infinity);`);
  await wait(`document.querySelectorAll('#room-${id} .statbar').length===4`);
  const setTheme=async theme=>{await run(version==='old'?`OptionsPopup.prototype.setTheme({currentTarget:{value:'${theme}'}});`:`PS.prefs.set('theme','${theme}');`);await pause(100);};
  const capture=async(label)=>{
   await pause(150);
   const metrics=await run(`const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
    return [...document.querySelectorAll('#room-${id} .statbar')].map(e=>({side:e.classList.contains('lstatbar')?'left':'right',name:e.querySelector('strong').textContent,translate:getComputedStyle(e).translate,font:getComputedStyle(e.querySelector('strong')).fontSize,parts:[e.querySelector('strong'),e.querySelector('.hpbar'),e.querySelector('.hptext'),...e.querySelector('.status').children].filter(e=>e.getBoundingClientRect().width>0).map(rect)}));`);
   for(const side of ['left','right']){
    const pair=metrics.filter(bar=>bar.side===side);assert.equal(pair.length,2);
    for(const a of pair[0].parts)for(const b of pair[1].parts){
     const width=Math.min(a.right,b.right)-Math.max(a.x,b.x),height=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
     assert.ok(width<=0.5||height<=0.5,version+' '+label+' partner name/HP/status overlap: '+JSON.stringify({pair,a,b}));
    }
    assert.ok(pair.some(bar=>bar.translate==='0px 28px'),version+' '+label+' second slot uses Pro spacing');
   }
   assert.ok(metrics.every(bar=>bar.font==='12px'),version+' '+label+' compact readable names');
   report.push({version,label,metrics});
   if(label.includes('theater')&&!label.includes('reversed'))fs.writeFileSync(path.join(out,version+'-'+label+'.png'),(await wc.capturePage()).toPNG());
  };
  for(const view of ['normal','theater']){
   if(view==='theater'){await run(`__showdownProTheater.toggle('${id}');`);await wait(`__showdownProTheater.active==='${id}'`);}
   for(const zoom of [1,1.45]){
    wc.setZoomFactor(zoom);await pause(100);if(view==='theater')await run('__showdownProTheater.refresh();');
    for(const theme of ['light','dark','pro']){await setTheme(theme);await capture(view+'-'+theme+'-'+Math.round(zoom*100));}
   }
  }
  await run(`${host}.receive(${JSON.stringify('>'+id+'\n|switch|p1b: Farigiraf|Farigiraf, L80, M|70/100\n|-terastallize|p2b: Hatterene|Fairy\n|-boost|p2b: Hatterene|spa|1\n|turn|2')});${host}.rooms['${id}'].battle.seekTurn(Infinity);`);
  for(const theme of ['light','dark','pro']){await setTheme(theme);await capture('theater-switch-'+theme);}
  await run(`${host}.rooms['${id}'].battle.switchViewpoint();`);
  for(const theme of ['light','dark','pro']){await setTheme(theme);await capture('theater-reversed-'+theme);}
  await run('__showdownProTheater.exit();');
  console.log(version+': doubles names, HP and badges stay apart in Light/Dark/Pro, normal/Theater, 100%/145%, switches, Tera and reversed viewpoints.');
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
