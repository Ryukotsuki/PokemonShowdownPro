const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {BrowserWindow}=require('electron');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async(root,out)=>{
  const styleDir=path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style');
  const font=fs.readFileSync(path.join(styleDir,'fonts/fontawesome-webfont.woff2')).toString('base64');
  const icons=fs.readFileSync(path.join(styleDir,'font-awesome.css'),'utf8').replace(/@font-face\s*\{[^}]+\}/,`@font-face {font-family:FontAwesome;src:url(data:font/woff2;base64,${font}) format('woff2');}`);
  const upstream=['oldclient.css','battle.css','battle-log.css','utilichart.css'].map(f=>fs.readFileSync(path.join(styleDir,f),'utf8')).join('\n')+icons;
  const pro='@scope (html.showdown-pro) {\n'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'\n}';
  const win=new BrowserWindow({width:1100,height:1000,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true}});
  const wc=win.webContents,report=[];
  try {
    for(const file of fs.readdirSync(out).filter(f=>f.endsWith('.json')&&f!=='verification.json')) {
      const scene=file.slice(0,-5), data=JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><html class="dark showdown-pro"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; font-src data:; style-src 'unsafe-inline'"><base href="https://play.pokemonshowdown.com/"><style>${upstream}\n${pro}</style></head><body><div id="${data.id}" class="${data.classes}" style="position:relative;inset:auto;height:100vh">${data.html}</div></body></html>`));
      await wc.insertCSS(pro,{cssOrigin:'user'});
      const battle=['singles','doubles','doubles-reversed','triples'].includes(scene);
      for(const width of battle?[1100]:[1100,654,380]) {
        win.setContentSize(width,1000);
        // Replay the classic client's TeambuilderRoom.show() sizing for static snapshots.
        await wc.executeJavaScript(`(()=>{const w=document.querySelector('.teamwrapper');if(w){w.style.transform=innerWidth<640?'scale('+innerWidth/640+')':'none';w.classList.toggle('scaled',innerWidth<640);}})()`);
        await pause(250);
        const state=await wc.executeJavaScript(`(()=>{const r=document.querySelector('.ps-room'); const rect=e=>{const a=e.getBoundingClientRect();return {x:a.x,y:a.y,width:a.width,height:a.height,right:a.right,bottom:a.bottom};};return {overflow:r.scrollWidth>r.clientWidth+1,scrollWidth:r.scrollWidth,width:r.clientWidth,cards:r.querySelectorAll('.setchart,.teamlist .team').length,sets:[...r.querySelectorAll('.setchart')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth})),links:r.querySelectorAll('a.button').length,stats:[...r.querySelectorAll('.statbar')].map(e=>({classes:e.className,translate:getComputedStyle(e).translate,name:rect(e.querySelector('strong')),box:rect(e),panel:getComputedStyle(e,'::before').height})),seasonGrid:r.id==='room-view-seasonladder'?getComputedStyle(r.querySelector('.pad')).gridTemplateColumns:null};})()`);
        report.push({scene,width,...state});
        fs.writeFileSync(path.join(out,`${scene}-${width}.png`),(await wc.capturePage()).toPNG());
        if(!battle) {
          // Native scaling keeps a 640px layout box while painting it at the window width.
          const scaled=await wc.executeJavaScript(`(()=>{const w=document.querySelector('.teamwrapper.scaled');if(!w)return null;return w.getBoundingClientRect().right<=document.querySelector('.ps-room').getBoundingClientRect().right+1;})()`);
          if(scaled!==null) assert.equal(scaled,true,`${scene} scaled editor must fit`);
          else assert.equal(state.overflow,false,`${scene} ${width} horizontal overflow (${state.scrollWidth})`);
        }
        if(scene.startsWith('pokemon-')) {
          const compact=await wc.executeJavaScript(`(()=>{const s=e=>getComputedStyle(document.querySelector(e));return {height:s('.setchart').height,display:s('.setchart').display,resultsTop:s('.teambuilder-results').top,resultsPosition:s('.teambuilder-results').position,tabHeight:s('.teambar button').height};})()`);
          assert.equal(compact.height,'127px','Restore original set card height');
          assert.equal(compact.display,'block','Keep original side-by-side field layout');
          assert.equal(compact.resultsTop,'200px','Results should start directly below compact editor');
          assert.equal(compact.resultsPosition,'absolute');
          assert.equal(compact.tabHeight,'44px');
        }
        if(scene==='teams') {
          assert.ok(await wc.executeJavaScript(`Array.from(document.querySelectorAll('.teamlist .team')).every(e=>e.querySelector('strong').getBoundingClientRect().bottom<=e.querySelector('small').getBoundingClientRect().top)`),'Team icons must not overlap names');
        }
        if(scene==='pokemon-details') {
          assert.ok(await wc.executeJavaScript(`Array.from(document.querySelectorAll('.formlabel')).filter(e=>e.getBoundingClientRect().width).every(e=>e.getBoundingClientRect().left>=document.querySelector('.teambuilder-results').getBoundingClientRect().left)`),'Detail labels must not be clipped');
        }
        if(scene==='pokemon-stats') {
          assert.ok(await wc.executeJavaScript(`(()=>{const cols=[...document.querySelectorAll('.statform > .col')].map(e=>e.getBoundingClientRect().top);return Math.max(...cols)-Math.min(...cols)<4;})()`),'Stat columns must remain aligned');
        }
        if(scene.startsWith('doubles')) {
          for(const side of ['rstatbar','lstatbar']) {
            const bars=state.stats.filter(s=>s.classes.split(' ').includes(side));assert.equal(bars.length,2);
            const [a,b]=bars.map(s=>s.box);
            assert.ok(a.bottom<=b.y||b.bottom<=a.y||a.right<=b.x||b.right<=a.x,`${side} nameplates overlap`);
          }
        }
        if(scene==='singles') assert.ok(state.stats.every(s=>s.translate==='none'),'Singles positions unchanged');
      }
      for(const theme of ['light','dark']) {
        const result=await wc.executeJavaScript(`document.documentElement.className=${JSON.stringify(theme==='dark'?'dark':'')}; ({translate:document.querySelector('.statbar.rightstatbar')?getComputedStyle(document.querySelector('.statbar.rightstatbar')).translate:null,card:document.querySelector('.setchart')?getComputedStyle(document.querySelector('.setchart')).display:null})`);
        if(result.translate) assert.equal(result.translate,'none');
        if(result.card) assert.notEqual(result.card,'grid');
      }
    }
    console.log(`Verified ${report.length} builder/season/battle layouts and native theme isolation.`);
  } finally {fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));win.destroy();}
};
