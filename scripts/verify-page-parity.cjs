const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {app,BrowserWindow}=require('electron');
require('./mute-test-audio.cjs');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'test-results/page-parity-profile'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{
  const out=path.join(root,'test-results/page-parity');fs.mkdirSync(out,{recursive:true});
  const base=path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style');
  const oldCSS=['font-awesome.css','battle.css','battle-log.css','utilichart.css','oldclient.css'].map(f=>fs.readFileSync(path.join(base,f),'utf8')).join('\n');
  const newCSS=JSON.parse(fs.readFileSync(path.join(root,'test-results/new-surfaces/options.json'),'utf8')).css;
  const pro='@scope (html.showdown-pro){'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'}';
  const font=fs.readFileSync(path.join(base,'font-awesome.css'),'utf8')+'\n@font-face{font-family:FontAwesome;src:url(data:font/woff2;base64,'+fs.readFileSync(path.join(base,'fonts/fontawesome-webfont.woff2')).toString('base64')+') format("woff2")}';
  const pages=fs.readdirSync(path.join(root,'test-results/tournaments-theme')).filter(f=>f.endsWith('.html')).map(f=>({id:'room-'+f.slice(0,-5),html:fs.readFileSync(path.join(root,'test-results/tournaments-theme',f),'utf8'),selectors:['.folderpane','.teampane','.folder.cur .selectFolder','.blocklink','.infobox']}));
  const season=JSON.parse(fs.readFileSync(path.join(root,'test-results/builder-theme/seasons.json'),'utf8'));
  pages.push({id:season.id,html:season.html,selectors:['.pad','.pad > h2','.pad > h3','.pad > a.button']});
  const windows=['old','new'].map(()=>new BrowserWindow({width:1100,height:950,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}}));
  const report=[];
  try{
    for(const page of pages){
      for(const width of [1100,654,430]){
        const states=[];
        for(const [index,client] of ['old','new'].entries()){
          const win=windows[index];win.setContentSize(width,950);
          const html=client==='old'?page.html:'<div class="page-html-container"><div>'+page.html+'</div></div>';
          const loaded=new Promise(resolve=>win.webContents.once('dom-ready',resolve));
          const preview=path.join(out,client+'-preview.html');
          fs.writeFileSync(preview,'<!doctype html><html class="dark showdown-pro '+(client==='new'?'showdown-new-client':'')+'"><head><base href="https://play.pokemonshowdown.com/"><style>'+(client==='old'?oldCSS:newCSS)+font+'</style></head><body class="dark"><div id="'+page.id+'" class="ps-room ps-room-light scrollable" style="top:0;left:0;right:0;bottom:0">'+html+'</div></body></html>');
          win.loadFile(preview).catch(error=>console.error(error));
          await loaded;await win.webContents.insertCSS(pro,{cssOrigin:'user'});await pause(220);
          const result=await win.webContents.executeJavaScript('(()=>{const room=document.getElementById('+JSON.stringify(page.id)+');const selectors='+JSON.stringify(page.selectors)+';return {overflow:room.scrollWidth>room.clientWidth+1,parts:selectors.map(selector=>{const e=room.querySelector(selector);if(!e)return {selector,missing:true};const s=getComputedStyle(e),r=e.getBoundingClientRect();return {selector,width:Math.round(r.width),left:Math.round(r.left),top:Math.round(r.top),background:s.backgroundColor,image:s.backgroundImage,border:s.borderRadius,padding:s.padding,color:s.color,font:s.fontFamily,fontSize:s.fontSize,display:s.display,overflow:e.scrollWidth>e.clientWidth+1};})};})()');
          assert.equal(result.overflow,false,page.id+' '+client+' '+width+' room overflow');
          states.push(result);
          if(page.id==='room-view-tournaments-all'||page.id===season.id){
            for(let attempt=0;attempt<3;attempt++){
              try{fs.writeFileSync(path.join(out,client+'-'+page.id+'-'+width+'.png'),(await win.webContents.capturePage()).toPNG());break;}
              catch(error){if(attempt===2)throw error;await pause(300);}
            }
          }
        }
        assert.deepEqual(states[1],states[0],page.id+' '+width+' old/new layout and styling differ');
        report.push({id:page.id,width,...states[1]});
        console.log(page.id+' '+width+': matching layout, palette, typography and cards.');
      }
    }
    fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));
  }finally{windows.forEach(win=>win.destroy());}
}).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
