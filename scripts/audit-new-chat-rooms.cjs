const fs=require('node:fs');
const path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async(wc,root)=>{
  const out=path.join(root,'test-results/chat-theme');
  const source=JSON.parse(fs.readFileSync(path.join(out,'rooms.json')));
  const sample=process.argv.includes('--capture-room-markup');
  const retryUnavailable=process.argv.includes('--retry-new-unavailable');
  const pending=retryUnavailable?new Set(JSON.parse(fs.readFileSync(path.join(out,'new-rooms.json'))).filter(r=>r.status!=='inspected').map(r=>r.id)):null;
  const retry=process.argv.includes('--retry-new-hidden')||sample||retryUnavailable;
  const directory=source.filter(r=>sample?['help','boardgames','tournaments','monotype','eventos','franais'].includes(r.id):retryUnavailable?pending.has(r.id):!retry||r.status!=='inspected').map(({id,title,privacy})=>({id,title,privacy}));
  const evaluate=code=>wc.executeJavaScript('(()=>{'+code+'})()');
  await evaluate('app.addPopup(OptionsPopup);');
  const url=await evaluate(`return document.querySelector('.ps-popup a[href="/newclient"]').href;`);
  await wc.loadURL(url);
  for(let i=0;i<160;i++){if(await evaluate('return !!(window.__showdownProTheme&&window.PS?.roomTypes.chat);').catch(()=>false))break;await pause(250);}
  await evaluate('PS.prefs.set("theme","pro");');
  const report=retry?JSON.parse(fs.readFileSync(path.join(out,'new-rooms.json'))):[];
  let checked=0;
  for(const room of directory){
    await evaluate('PS.join('+JSON.stringify(room.id)+');PS.focusRoom('+JSON.stringify(room.id)+');');
    let data;
    for(let i=0;i<16;i++){
      await pause(250);
      data=await evaluate(`
        const root=document.getElementById(${JSON.stringify('room-'+room.id)}),inner=root?.querySelector('.chat-log .inner');
        if(!inner?.children.length||/does not exist or requires a login/.test(root.textContent))return null;
        const notices=[...inner.children].filter(e=>e.querySelector('.infobox,button,summary,input,select,img')||e.classList.contains('infobox-roomintro')).map(e=>e.outerHTML);
        const controls=[...root.querySelectorAll('button,a.button,a.ilink,summary,input,select')].filter(e=>!e.closest('.userlist')).map(e=>({html:e.outerHTML}));
        return {notices,controls,composer:root.querySelector('.chat-log-add')?.outerHTML||'',markup:${sample?'root.outerHTML':'null'}};
      `);
      if(data)break;
    }
    const entry={...room,status:data?'inspected':'unavailable',...data};
    if(sample&&data)fs.writeFileSync(path.join(out,'new-'+room.id+'.html'),data.markup);
    if(!data)entry.diagnostic=await evaluate('return {text:document.getElementById('+JSON.stringify('room-'+room.id)+')?.textContent?.slice(0,1000),popups:[...document.querySelectorAll(".ps-popup")].map(e=>e.textContent)};');
    const previous=report.findIndex(r=>r.id===entry.id);
    if(previous>=0)report[previous]=entry;else report.push(entry);
    await evaluate('PS.closePopupsAbove(null);if(PS.rooms['+JSON.stringify(room.id)+'])PS.leave('+JSON.stringify(room.id)+');');
    fs.writeFileSync(path.join(out,'new-rooms.json'),JSON.stringify(report,null,2));
    checked++;
    if(checked%10===0||checked===directory.length)console.log('New client inspected '+checked+'/'+directory.length+' rooms; '+report.filter(r=>r.status==='unavailable').length+' unavailable');
    await pause(800);
  }
  if(sample)return;
  return require('./audit-chat-layouts.cjs')(root);
};
