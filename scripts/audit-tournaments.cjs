const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = require('node:assert/strict');
const {BrowserWindow} = require('electron');

async function verify(root,out) {
  const upstream=['oldclient.css','battle-log.css','font-awesome.css'].map(file=>fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style',file),'utf8')).join('\n');
  const pro='@scope (html.showdown-pro) {\n'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'\n}';
  const preview=new BrowserWindow({width:1100,height:950,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:true}});
  const report=[];
  try {
    for(const file of fs.readdirSync(out).filter(f=>f.endsWith('.html'))) {
      const id=file.slice(0,-5), html=fs.readFileSync(path.join(out,file),'utf8');
      await preview.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><html class="dark showdown-pro"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"><base href="https://play.pokemonshowdown.com/"><style>${upstream}\n${pro}</style></head><body><div class="ps-room ps-room-light" id="room-${id}" style="position:relative;inset:auto;height:100vh">${html}</div></body></html>`));
      await preview.webContents.insertCSS(pro,{cssOrigin:'user'});
      for(const width of [1100,654,380]) {
        preview.setContentSize(width,950);
        await pause(400);
        const state=await preview.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.ps-room'), nav=r.querySelector('.folderpane'), main=r.querySelector('.teampane');return {overflow:r.scrollWidth>r.clientWidth,mainOverflow:main.scrollWidth>main.clientWidth,navOverflow:nav.scrollWidth>nav.clientWidth,navWidth:nav.offsetWidth,mainWidth:main.offsetWidth,clipped:[...nav.querySelectorAll('.selectFolder')].some(e=>e.scrollWidth>e.clientWidth+1),cards:[...main.querySelectorAll('.blocklink,.infobox')].map(e=>getComputedStyle(e).borderRadius)}})()`);
        assert.equal(state.overflow,false,`${id} ${width} room overflow`);
        assert.equal(state.mainOverflow,false,`${id} ${width} content overflow`);
        assert.equal(state.navOverflow,false,`${id} ${width} navigation overflow`);
        assert.ok(state.navWidth>0,`${id} ${width} navigation must remain available`);
        assert.equal(state.clipped,false,`${id} ${width} clipped names`);
        assert.ok(state.cards.every(r=>r==='8px'));
        fs.writeFileSync(path.join(out,`${id}-${width}.png`),(await preview.webContents.capturePage()).toPNG());
        report.push({id,width,...state});
      }
      for(const theme of ['light','dark']) {
        const display=await preview.webContents.executeJavaScript(`document.documentElement.className=${JSON.stringify(theme==='dark'?'dark':'')}; getComputedStyle(document.querySelector('.ps-room')).display;`);
        assert.notEqual(display,'flex',`${theme} must retain native layout`);
      }
    }
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));
    console.log(`Verified ${report.length} tournament page layouts and Light/Dark isolation.`);
  } finally {preview.destroy();}
}

module.exports = async (wc, root) => {
  const out = path.join(root, 'test-results/tournaments-theme');
  fs.mkdirSync(out, {recursive:true});
  if(process.argv.includes('--cached-tournaments')) return verify(root,out);
  await wc.executeJavaScript("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}}); app.send('/smogtours'); true;");
  for(let attempt=0;attempt<100;attempt++) {
    await pause(250);
    const pages=await wc.executeJavaScript(`Object.entries(app.rooms).filter(([id,r])=>r.el?.textContent?.includes('Instant Tournaments')).map(([id,r])=>({id,html:r.el.innerHTML}))`);
    if(pages.length) {
      for(const page of pages) fs.writeFileSync(path.join(out,page.id+'.html'),page.html);
      console.log(JSON.stringify(pages.map(p=>({id:p.id,bytes:p.html.length}))));
      const ids=['view-tournaments-section-official','view-tournaments-section-smogon','view-tournaments-section-ps', ...[...pages[0].html.matchAll(/href="(view-tournaments-view-[^"]+)"/g)].map(m=>m[1]).slice(0,1)];
      for(const id of ids) {
        await wc.executeJavaScript(`app.joinRoom(${JSON.stringify(id)}); true;`);
        let loaded=false;
        for(let n=0;n<80;n++) {
          await pause(250);
          const html=await wc.executeJavaScript(`app.rooms[${JSON.stringify(id)}]?.el?.innerHTML || ''`);
          if(html.includes('teampane')) {fs.writeFileSync(path.join(out,id+'.html'),html); console.log(id); loaded=true; break;}
        }
        assert.ok(loaded,`Tournament page did not load: ${id}`);
      }
      return verify(root,out);
    }
  }
  throw new Error('Tournament directory did not load');
};
