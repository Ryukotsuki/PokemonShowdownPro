const fs=require('node:fs');
const path=require('node:path');
const {BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
module.exports=async(root,bothClients=false)=>{
  const cache=path.join(root,'test-results/new-surfaces');
  const out=bothClients?path.join(root,'test-results/hover-theme'):cache;
  fs.mkdirSync(out,{recursive:true});
  const snapshots=fs.readdirSync(cache).filter(f=>f.endsWith('.json')&&!['audit.json','routes.json','verification.json','ladder-audit.json','ladder-layout.json'].includes(f)&&(!process.argv.includes('--ladder-only')||/^ladder(?:-gen9randombattle)?(?:-\d+)?\.json$/.test(f))).map(file=>({name:file.slice(0,-5),data:JSON.parse(fs.readFileSync(path.join(cache,file),'utf8'))}));
  if(bothClients){
    const style=path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style');
    const css=['font-awesome.css','battle.css','battle-log.css','utilichart.css','oldclient.css'].map(file=>fs.readFileSync(path.join(style,file),'utf8')).join('\n');
    const add=(name,id,classes,html)=>snapshots.push({name:'old-'+name,data:{width:1100,height:950,htmlClass:'dark showdown-pro',css,body:'<body><div id="'+id+'" class="'+classes+'" style="position:relative;inset:auto;height:100vh">'+html+'</div></body>'}});
    const builder=path.join(root,'test-results/builder-theme');
    for(const file of fs.readdirSync(builder).filter(f=>f.endsWith('.json')&&f!=='verification.json')){
      const data=JSON.parse(fs.readFileSync(path.join(builder,file),'utf8'));
      if(data.html)add(file.slice(0,-5),data.id,data.classes,data.html);
    }
    for(const dir of ['ladder-theme','tournaments-theme']){
      const folder=path.join(root,'test-results',dir);
      for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.html')))add(dir+'-'+file.slice(0,-5),'room-'+dir.split('-')[0],'ps-room ps-room-light scrollable',fs.readFileSync(path.join(folder,file),'utf8'));
    }
    add('private-message','room-','ps-room mainmenu',JSON.parse(fs.readFileSync(path.join(root,'test-results/pm-theme/live.json'),'utf8')).html);
  }
  const source=fs.readFileSync(path.join(root,'scripts/audit-new-client-surfaces.cjs'),'utf8');
  const scan=source.split('evaluate(String.raw`')[1].split('`);')[0].split('const body=document.body.cloneNode')[0]+'return issues;';
  const pro='@scope (html.showdown-pro) {'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'}';
  const font=fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style/font-awesome.css'),'utf8')+'\n@font-face{font-family:FontAwesome;src:url(data:font/woff2;base64,'+fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style/fonts/fontawesome-webfont.woff2')).toString('base64')+') format("woff2");font-weight:normal;font-style:normal}';
  const win=new BrowserWindow({width:1200,height:950,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const wc=win.webContents;
  await win.loadURL('about:blank');
  wc.debugger.attach('1.3');await wc.debugger.sendCommand('DOM.enable');await wc.debugger.sendCommand('CSS.enable');
  const results=[];
  const shots=new Set(['old-overflow','tabs-430','settings-430','settings-800','options','team-editor','pokemon-stats','pokemon-details','pokemon-430','challenge','battle-controls','ladder','ladder-430','ladder-800','ladder-gen9randombattle','ladder-gen9randombattle-430','ladder-gen9randombattle-800','page-view-tournaments-all','tournaments-430','season-records','seasons-430','prompt','rules','forfeitbattle']);
  try{
    for(const {name,data} of snapshots){
      if(!data.body)continue;
      console.log('Checking '+name);
      win.setContentSize(data.width,data.height);
      const loaded=new Promise(resolve=>wc.once('dom-ready',resolve));
      // Large search-result fixtures exceed Chromium's data-URL limit.
      const preview=path.join(out,'preview.html');
      fs.writeFileSync(preview,'<!doctype html><html class="'+data.htmlClass+'"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src \'none\'; object-src \'none\'; frame-src \'none\'"><base href="https://play.pokemonshowdown.com/"><style>'+data.css+font+'</style></head>'+data.body+'</html>');
      win.loadFile(preview).catch(error=>console.error('Preview load failed:',name,error.message));
      await loaded;
      await wc.insertCSS(pro,{cssOrigin:'user'});
      const evaluate=code=>wc.executeJavaScript('(()=>{'+code+'})()');
      // HTML parsing inserts tbody; restore the Preact fixture's actual row structure.
      const directRows=data.directRowTables||[...data.body.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)].map(match=>/^\s*<tr\b/.test(match[1]));
      await evaluate('const flags='+JSON.stringify(directRows)+';document.querySelectorAll("table").forEach((table,index)=>{if(flags[index])for(const section of [...table.children].filter(e=>e.tagName==="TBODY")){section.replaceWith(...section.children);}});');
      const issues=await evaluate(scan);
      const states=[];
      // One representative per control class/type; exercise real Chromium pseudo states.
      const controls=await evaluate(`
        const seen=new Set(),selectors=[];
        for(const el of document.querySelectorAll(':is(.header,.header-vertical,.mini-header) button,:is(.header,.header-vertical,.mini-header) a,.ps-popup button,.ps-popup select,.ps-popup a,.ps-room button,.ps-room select,.ps-room a,.ps-room input[type=range],.ps-room input[type=text]')){
          if(el.closest('[data-showdex-scheme]')||!el.checkVisibility()||el.disabled)continue;
          const key=el.tagName+'.'+el.className+':'+el.type;
          if(seen.has(key))continue;seen.add(key);
          el.dataset.auditControl=selectors.length;
          selectors.push('[data-audit-control="'+selectors.length+'"]');
        }
        return selectors;
      `);
      const {root:dom}=await wc.debugger.sendCommand('DOM.getDocument');
      for(const selector of controls){
        const {nodeId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:dom.nodeId,selector});
        for(const state of ['hover','active','focus-visible']){
          await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[state]});
          const found=await evaluate(scan);
          const extra=found.filter(i=>!issues.some(j=>j.tag===i.tag&&j.class===i.class&&j.background===i.background&&j.image===i.image&&j.appearance===i.appearance));
          if(extra.length)states.push({selector,state,issues:extra});
        }
        await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
        await evaluate('document.querySelector('+JSON.stringify(selector)+').disabled=true;');
        const disabled=await evaluate(scan);
        const extra=disabled.filter(i=>!issues.some(j=>j.tag===i.tag&&j.class===i.class&&j.background===i.background&&j.image===i.image&&j.appearance===i.appearance));
        if(extra.length)states.push({selector,state:'disabled',issues:extra});
        await evaluate('document.querySelector('+JSON.stringify(selector)+').disabled=false;');
      }
      if(shots.has(name))fs.writeFileSync(path.join(out,name+'.png'),(await wc.capturePage()).toPNG());
      results.push({name,issues,states,controls:controls.length});
      fs.writeFileSync(path.join(out,process.argv.includes('--ladder-only')?'ladder-verification.json':'verification.json'),JSON.stringify(results,null,2));
      console.log(name+': '+issues.length+' base / '+states.length+' state findings; '+controls.length+' controls checked');
    }
  }finally{win.destroy();}
  assert.equal(results.reduce((count,scene)=>count+scene.issues.length+scene.states.length,0),0,'Unreviewed neutral surfaces or native controls remain; see verification.json');
  console.log('Visual and state review saved to '+out);
};

