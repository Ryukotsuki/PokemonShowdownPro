const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {BrowserWindow}=require('electron');
const {history}=require('../tests/fixtures.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async(wc,root)=>{
  const out=path.join(root,'test-results/showdex-theme');fs.mkdirSync(out,{recursive:true});
  const evaluate=code=>wc.executeJavaScript(`(async()=>{${code}})()`);
  const click=async label=>{
    await evaluate(`const b=[...document.querySelectorAll('[data-showdex-module] button')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw new Error('Missing button: '+${JSON.stringify(label)});b.click();`);await pause(500);
  };
  const state=()=>evaluate(`const e=document.querySelector('[data-showdex-module="hellodex"]');const s=getComputedStyle(e,'::before');return {pro:document.documentElement.classList.contains('showdex-pro'),scheme:e.dataset.showdexScheme,background:s.backgroundColor,image:s.backgroundImage};`);
  const preview=new BrowserWindow({width:920,height:950,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}}),report=[];
  const capture=async(name)=>{
    const data=await evaluate(`
      const roots=[...document.querySelectorAll('[data-showdex-module]')];
      const active=roots.find(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden');
      const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>4&&r.height>4&&s.visibility!=='hidden';};
      const neutral=v=>{const c=v.match(/[\\d.]+/g)?.map(Number);return c&&c.length>=3&&(c.length<4||c[3]>.2)&&Math.max(...c.slice(0,3))-Math.min(...c.slice(0,3))<10;};
      const remaining=[...document.querySelectorAll('[data-showdex-module] *,[data-tippy-root] *')].filter(visible).filter(e=>!e.closest('svg,[class*=PokeType-module],[class*=PokeStatus-module],[class*=PokeHpBar-module]')).flatMap(e=>{const s=getComputedStyle(e);return neutral(s.backgroundColor)?[{class:e.className,color:s.backgroundColor,text:e.textContent.slice(0,60)}]:[];});
      return {classes:document.documentElement.className,html:active?.outerHTML+[...document.querySelectorAll('[data-tippy-root]')].filter(e=>!e.closest('[data-showdex-module]')).map(e=>e.outerHTML).join(''),styles:[...document.querySelectorAll('style')].map(e=>e.textContent).join('\\n'),remaining,modules:roots.map(e=>e.dataset.showdexModule),buttons:[...active?.querySelectorAll('button')||[]].map(e=>({text:e.textContent,label:e.getAttribute('aria-label')}))};
    `);
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));
    report.push({name,remaining:data.remaining,modules:data.modules});
    await preview.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><html class="${data.classes}"><head><meta charset="utf-8"><style>${data.styles}</style><style>body{margin:0} [data-showdex-module]{position:absolute!important;inset:0!important;width:100%!important;height:100%!important}</style></head><body>${data.html}</body></html>`));
    await pause(400);fs.writeFileSync(path.join(out,name+'.png'),(await preview.webContents.capturePage()).toPNG());
    if(['calcdex','honkdex','notedex'].includes(name)) {
      if(name==='calcdex')await preview.webContents.executeJavaScript(`document.querySelector('button [class*=PokeMoves-module-damageButtonLabel]').textContent='150.5 - 177.6%';`);
      for(const width of [920,560,430,380]) {
        preview.setContentSize(width,name==='calcdex'?750:950);await pause(150);
        const sizing=await preview.webContents.executeJavaScript(`(()=>{
          const buttons=[...document.querySelectorAll('button[class*=Button-module-container]')].filter(e=>e.getBoundingClientRect().height>0);
          return {width:innerWidth,clipped:buttons.flatMap(e=>{const label=e.querySelector('[class*=Button-module-label]');if(!label)return [];const b=e.getBoundingClientRect(),l=label.getBoundingClientRect();return l.left<b.left-.5||l.right>b.right+.5||l.top<b.top-.5||l.bottom>b.bottom+.5?[{text:e.textContent,button:{w:b.width,h:b.height},label:{w:l.width,h:l.height}}]:[];}),tiny:buttons.filter(e=>parseFloat(getComputedStyle(e).fontSize)<10||e.getBoundingClientRect().height<13).map(e=>e.textContent),inputs:[...document.querySelectorAll('input[class*=Dropdown-module-input]')].map(e=>({border:getComputedStyle(e).borderTopWidth,background:getComputedStyle(e).backgroundColor})),stages:[...document.querySelectorAll('[class*=PokeStats-module-stageValue]')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth}))};})()`);
        fs.writeFileSync(path.join(out,`${name}-${width}-sizing.json`),JSON.stringify(sizing,null,2));
        fs.writeFileSync(path.join(out,`${name}-${width}.png`),(await preview.webContents.capturePage()).toPNG());
        assert.deepEqual(sizing.clipped,[],`${name} ${width}: button labels must fit`);
        assert.deepEqual(sizing.tiny,[],`${name} ${width}: readable button sizes`);
        assert.ok(sizing.inputs.every(e=>e.border==='0px'&&e.background==='rgba(0, 0, 0, 0)'), 'Composite dropdown inputs must remain borderless and transparent');
        assert.ok(sizing.stages.every(e=>e.scroll<=e.width+1),'Boost buttons must fit their stat columns');
        const offscreen=await preview.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[class*=PokeInfo-module-presetHeader] button')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+.5||r.left<-.5);}).map(e=>e.textContent)`);
        assert.deepEqual(offscreen,[],`${name} ${width}: Import/Export controls must stay in view`);
        if(name==='calcdex') {
          const fit=await preview.webContents.executeJavaScript(`(()=>{const stats=[...document.querySelectorAll('[class*=PokeStats-module-container]')];const content=document.querySelector('[class*=Calcdex-module-content]');return {stats:stats.length,bottom:Math.max(...stats.map(e=>e.getBoundingClientRect().bottom)),contentBottom:content.getBoundingClientRect().bottom,height:innerHeight};})()`);
          fs.writeFileSync(path.join(out,`calcdex-${width}-fit.json`),JSON.stringify(fit,null,2));
          assert.equal(fit.stats,2,'Both Pokémon stat tables must be rendered');
          assert.ok(fit.bottom<=fit.height-4,`Full calculator must fit ${width}×750: bottom ${fit.bottom}`);
          assert.ok(fit.contentBottom<=fit.height+1,`Calculator including bottom padding must fit: ${fit.contentBottom}`);
        }
      }
      preview.setContentSize(920,950);
    }
    console.log(name+': '+data.remaining.length+' neutral surfaces');
    fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));
  };
  try {
    await wc.insertCSS('*,*::before,*::after {transition:none!important;animation:none!important}',{cssOrigin:'user'});
    await evaluate("app.socket.send=()=>{}; window.__showdownPro.setAutoTimer(false); app.focusRoom('hellodex');");await pause(500);
    await click('Open Showdex Settings');
    const baseline={};
    for(const mode of ['Light','Dark']){await click(mode);baseline[mode]=await state();assert.equal(baseline[mode].pro,false);}
    await click('Pro');assert.equal((await state()).pro,true);
    await capture('settings');
    await evaluate("document.querySelector('[data-showdex-module] [aria-label=Pro]')._tippy.show();");await pause(600);
    assert.ok(await evaluate("return [...document.querySelectorAll('[data-tippy-root]')].some(e=>e.textContent.includes('blue Pokémon Showdown Pro'));"),'Pro tooltip');
    await capture('tooltip');
    await evaluate("document.querySelector('[data-showdex-module] [aria-label=Pro]')._tippy.hide();");await pause(100);
    await click('Close Showdex Settings');await capture('home');
    await click('Support Showdex');await capture('support');
    await click('Close Supporter Info');
    await click('Create New Honk');await capture('honkdex');
    await evaluate("const input=document.querySelector('[data-showdex-module=honkdex] input[role=combobox]');input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',keyCode:40,bubbles:true}));");await pause(500);
    assert.ok(await evaluate("return !!document.querySelector('[role=listbox]');"),'Dropdown should open');await capture('dropdown');
    await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,bubbles:true}));document.activeElement.blur();");
    await evaluate("app.focusRoom('hellodex');");await click('Create New Note');await capture('notedex');
    const room='battle-gen9randombattle-918';
    await evaluate(`app.receive(${JSON.stringify('>'+room+'\n'+history().join('\n'))});app.focusRoom(${JSON.stringify(room)});`);await pause(3000);
    await evaluate('document.querySelector("button[name=toggleCalcdexOverlay]")?.click();');await pause(1000);await capture('calcdex');
    await evaluate("app.focusRoom('hellodex');");await click('Open Showdex Settings');
    for(const mode of ['Light','Dark']){await click(mode);assert.deepEqual(await state(),baseline[mode]);}
    await click('Showdown');assert.equal((await state()).pro,false);
    await click('Pro');
    await evaluate("OptionsPopup.prototype.setTheme({currentTarget:{value:'light'}});");await pause(400);assert.equal((await state()).pro,true);
    await pause(1200);wc.reload();
    for(let n=0;n<120;n++){await pause(250);if(await evaluate("return !!document.querySelector('[data-showdex-pro]');").catch(()=>false))break;}
    assert.equal((await state()).pro,true,'Pro must persist after reload');
    assert.ok(report.every(e=>e.remaining.length===0),'All nonsemantic Showdex surfaces must use Pro colors');
    console.log('Showdex Pro switching, host independence and persistence verified.');
  } finally {preview.destroy();}
};
