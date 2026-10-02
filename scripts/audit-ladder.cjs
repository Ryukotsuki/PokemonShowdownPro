const fs=require('node:fs');
const path=require('node:path');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=require('node:assert/strict');
const {BrowserWindow}=require('electron');
async function verify(root,out) {
  const upstream=['oldclient.css','battle-log.css'].map(f=>fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style',f),'utf8')).join('\n');
  const pro='@scope (html.showdown-pro) {\n'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'\n}';
  const win=new BrowserWindow({width:1100,height:950,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true}});
  const wc=win.webContents,report=[];
  try {
    for(const scene of ['formats','rankings','help','empty']) {
      const html=fs.readFileSync(path.join(out,scene+'.html'),'utf8');
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><html class="dark showdown-pro"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${upstream}\n${pro}</style></head><body><div class="ps-room ps-room-light scrollable" id="room-ladder" style="position:relative;inset:auto;height:100vh">${html}</div></body></html>`));
      await wc.insertCSS(pro,{cssOrigin:'user'});
      for(const width of [1100,654,380]) {
        win.setContentSize(width,950);await pause(250);
        const state=await wc.executeJavaScript(`(()=>{const r=document.querySelector('.ps-room'),t=r.querySelector('table');return {overflow:r.scrollWidth>r.clientWidth, tableWidth:t?.clientWidth,tableScroll:t?.scrollWidth,columns:t?.rows[0].cells.length,rows:t?.rows.length, clippedButtons:[...r.querySelectorAll('button')].some(b=>b.scrollWidth>b.clientWidth+1),header:t?getComputedStyle(t.querySelector('th')).position:null, cards:r.querySelectorAll('ul button').length}})()`);
        assert.equal(state.overflow,false,`${scene} ${width} horizontal page overflow`);
        assert.equal(state.clippedButtons,false,`${scene} ${width} clipped button`);
        if(scene==='rankings') {assert.equal(state.columns,6);assert.ok(state.rows>100);assert.equal(state.header,'sticky');}
        if(scene==='formats') assert.ok(state.cards>30);
        if(state.tableWidth) assert.ok(state.tableWidth>width*.8,`${scene} table should fill content width`);
        fs.writeFileSync(path.join(out,`${scene}-${width}.png`),(await wc.capturePage()).toPNG());report.push({scene,width,...state});
      }
      if(scene==='rankings') {
        const pinned=await wc.executeJavaScript(`(()=>{const t=document.querySelector('table');t.scrollTop=400;return Math.abs(t.querySelector('th').getBoundingClientRect().top-t.getBoundingClientRect().top)<3;})()`);
        assert.ok(pinned,'Column headers should remain visible when scrolling rows');
      }
      for(const theme of ['light','dark']) {
        const style=await wc.executeJavaScript(`document.documentElement.className=${JSON.stringify(theme==='dark'?'dark':'')}; getComputedStyle(document.querySelector('.ladder.pad')).paddingTop;`);
        assert.notEqual(style,'16px','Native ladder spacing must be unchanged');
      }
    }
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
    console.log('Verified 12 ladder layouts, full rating columns, scrolling headers and Light/Dark isolation.');
  } finally {win.destroy();}
}
module.exports=async(wc,root)=>{
  const out=path.join(root,'test-results/ladder-theme'); fs.mkdirSync(out,{recursive:true});
  if(process.argv.includes('--cached-ladder')) return verify(root,out);
  await wc.executeJavaScript("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}}); app.addRoom('ladder'); true;");
  for(const scene of ['formats','rankings','help','empty']) {
    await wc.executeJavaScript(`app.rooms.ladder.curSearchVal=${JSON.stringify(scene==='empty'?'zzzzprothemeauditnomatches':'')}; app.rooms.ladder.selectFormat(${JSON.stringify(scene==='formats'?'':scene==='help'?'help':'gen9randombattle')}); true;`);
    let loaded=false;
    for(let n=0;n<120;n++) {
      await pause(250);
      const html=await wc.executeJavaScript("app.rooms.ladder.el.innerHTML");
      if(!html.includes('Loading...') && (html.includes('selectFormat') || html.includes('<table'))) {
        fs.writeFileSync(path.join(out,scene+'.html'),html);console.log(`${scene}: ${html.length} characters`);loaded=true;break;
      }
    }
    if(!loaded) throw new Error('Ladder scene did not load: '+scene);
  }
  await verify(root,out);
};
