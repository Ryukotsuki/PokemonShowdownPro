const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {BrowserWindow}=require('electron');
const pause=ms=>new Promise(r=>setTimeout(r,ms));

// Compare the current directory's server introductions under each native client
// stylesheet and Pro. No room links, commands, messages or polls are activated.
module.exports=async root=>{
  const selected=process.argv.find(arg=>arg.startsWith('--rooms='))?.slice(8).split(',');
  const out=path.join(root,'test-results',selected?'chat-layouts-selected':'chat-layouts');fs.mkdirSync(out,{recursive:true});
  const rooms=JSON.parse(fs.readFileSync(path.join(root,'test-results/chat-theme/rooms.json')));
  const pro='@scope (html.showdown-pro){'+fs.readFileSync(path.join(root,'app/client-theme.css'),'utf8').replace(/\bhtml(?=[.,\s:#\[])/g,':scope')+'}';
  const bridge=fs.readFileSync(path.join(root,'app/client-theme.js'),'utf8');
  const roomEnhancer=bridge.slice(bridge.indexOf('function installRoomControls()'),bridge.indexOf('function installHelpTips()'))+'installRoomControls();';
  const window=new BrowserWindow({width:750,height:1000,show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
  const wc=window.webContents;
  const capture=async file=>{
    for(let attempt=0;attempt<3;attempt++) {
      try {fs.writeFileSync(file,(await wc.capturePage()).toPNG());return;}
      catch(error) {if(!String(error).includes('UnknownVizError')||attempt===2)throw error;await pause(200);}
    }
  };
  const evaluate=code=>wc.executeJavaScript('(()=>{'+code+'})()');
  const resize=async width=>{
    window.setContentSize(width,1000);
    for(let attempt=0;attempt<20;attempt++) {
      if(await evaluate('return innerWidth;')===width) {
        await evaluate('return Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise(resolve=>setTimeout(resolve,150))]);');
        return;
      }
      await pause(50);
    }
    throw new Error('Renderer viewport did not resize to '+width);
  };
  const report=[];
  const inspect=()=>evaluate(`
    const intro=document.querySelector('.audit-content');
    const controls=[...intro.querySelectorAll('button,input,select,textarea,a.button,a[role=button],a[style*="position: absolute"],a[style*="position:absolute"],summary')];
    const contexts=[...intro.querySelectorAll('.infobox-roomintro,.notice')];
    const context=e=>contexts.indexOf(e.closest('.infobox-roomintro,.notice'));
    const collapsed=e=>{for(let p=e;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope>summary')?.contains(e))return true;return false;};
    const visible=e=>{const r=e.getBoundingClientRect();return !collapsed(e)&&e.checkVisibility()&&r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
    const frames=[...intro.querySelectorAll('[style]')].filter(e=>/^[\\d.]+px$/.test(e.style.height)&&(e.style.backgroundImage.includes('url(')||e.querySelector('img,[style*="background-image"]')));
    const outsideFrames=e=>{
      const r=e.getBoundingClientRect(),outside=[];
      for(let p=e.parentElement;p&&p!==intro;p=p.parentElement){
        const index=frames.indexOf(p),s=getComputedStyle(p);
        if(index<0||/auto|scroll|hidden|clip/.test(s.overflowX+' '+s.overflowY))continue;
        const b=p.getBoundingClientRect();
        if(r.left<b.left-2||r.right>b.right+2||r.top<b.top-2||r.bottom>b.bottom+2)outside.push(index);
      }
      return outside;
    };
    const whiteSurfaceContrast=e=>{
      if(getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)')return null;
      const rgb=value=>value.match(/[\\d.]+/g)?.map(Number);
      const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
      for(let p=e.parentElement;p&&p!==intro;p=p.parentElement){
        const s=getComputedStyle(p),bg=rgb(s.backgroundColor);
        if(s.backgroundImage!=='none')return null;
        if(!bg||bg[3]===0)continue;
        if(bg.slice(0,3).some(v=>v<245)||bg[3]!==undefined&&bg[3]<1)return null;
        const fg=rgb(getComputedStyle(e).color),alpha=fg[3]??1;
        const ink=luminance(fg.map((v,i)=>i<3?v*alpha+bg[i]*(1-alpha):v)),surface=luminance(bg);
        return (Math.max(ink,surface)+0.05)/(Math.min(ink,surface)+0.05);
      }
      return null;
    };
    const actionable=e=>!e.matches('[data-showdown-pro-room-control=decorative]')&&(e.textContent.trim()||e.value||e.style.backgroundImage.includes('url(')||e.closest('a[href]'));
    const authoredPositioned=e=>{for(let p=e;p&&p!==intro;p=p.parentElement)if(['absolute','fixed'].includes(p.style.position))return true;return false;};
    const items=controls.map((e,index)=>({index,context:context(e),html:e.outerHTML.slice(0,1400),text:[...e.childNodes].filter(n=>!n.classList?.contains('showdown-pro-room-art-label')).map(n=>n.textContent).join('').trim(),value:e.getAttribute('value'),name:e.getAttribute('name'),href:e.closest('a[href]')?.getAttribute('href'),
      visible:visible(e),actionable:!!actionable(e),rect:rect(e),image:getComputedStyle(e).backgroundImage,inlineImage:e.style.backgroundImage,
      outline:parseFloat(getComputedStyle(e).outlineWidth),disabled:e.matches(':disabled,.disabled,[aria-disabled=true]'),
      clipped:visible(e)&&!!e.textContent.trim()&&e.scrollWidth>e.clientWidth+2,label:e.querySelector('.showdown-pro-room-art-label')&&getComputedStyle(e.querySelector('.showdown-pro-room-art-label')).display,
      hotspot:e.dataset.showdownProRoomControl==='hotspot',authoredHotspot:(authoredPositioned(e)||!e.textContent.trim())&&(/^(none|transparent)(?:\\s|$)/.test(e.style.background)||/^rgba\\([^)]*,\\s*0(?:\\.0+)?\\)$/.test(e.style.backgroundColor))||e.matches('summary')&&e.style.color==='transparent'&&e.parentElement.style.position==='absolute',background:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow,
      ink:[e,...e.querySelectorAll('*')].filter(n=>n.style.color||n.style.textShadow||n.hasAttribute('color')).map(n=>({color:getComputedStyle(n).color,shadow:getComputedStyle(n).textShadow})),
      bannerAction:e.dataset.showdownProRoomControl==='banner-action',authoredRadius:e.style.borderRadius,radius:getComputedStyle(e).borderRadius,
      contrast:e.textContent.trim()?whiteSurfaceContrast(e):null,
      outsideFrames:visible(e)?outsideFrames(e):[],
      flow:e.dataset.showdownProRoomControl==='flow',gridSpacing:getComputedStyle(e.parentElement?.parentElement||e).display==='grid'&&parseFloat(getComputedStyle(e.parentElement?.parentElement||e).rowGap)>=3,margin:getComputedStyle(e).marginTop}));
    const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>2&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>2;
    const clip=(r,e)=>{let x=r.x,y=r.y,right=r.x+r.width,bottom=r.y+r.height;for(let p=e;p&&p!==intro;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){x=Math.max(x,b.x);right=Math.min(right,b.x+p.clientWidth);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){y=Math.max(y,b.y);bottom=Math.min(bottom,b.y+p.clientHeight);}}return {x,y,w:Math.max(0,right-x),h:Math.max(0,bottom-y)};};
    const overlaps=[];
    items.forEach((a,i)=>items.slice(i+1).forEach(b=>{if(a.context===b.context&&a.visible&&b.visible&&a.actionable&&b.actionable&&!controls[a.index].contains(controls[b.index])&&!controls[b.index].contains(controls[a.index])&&overlap(a.rect,b.rect))overlaps.push(a.index+':'+b.index);}));
    const textRects=[];const walker=document.createTreeWalker(intro,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim()||collapsed(node.parentElement)||!node.parentElement.checkVisibility()||node.parentElement.closest('button,summary,a.button,select,textarea,[hidden]'))continue;const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects()){const clipped=clip(r,node.parentElement);if(clipped.w>2&&clipped.h>2)textRects.push({context:context(node.parentElement),text:node.textContent.trim().slice(0,70),...clipped});}}
    const textOverlaps=items.filter((a)=>a.visible&&a.actionable&&!a.inlineImage&&textRects.some(r=>a.context===r.context&&overlap(a.rect,r))).map(a=>a.index);
    items.forEach(a=>a.textHits=textRects.filter(r=>a.context===r.context&&overlap(a.rect,r)));
    return {items,overlaps,textOverlaps,overflow:intro.scrollWidth>intro.clientWidth+2,introScroll:[...intro.querySelectorAll('.infobox-roomintro .infobox-limited')].some(e=>e.scrollHeight>e.clientHeight+2)};
  `);
  try {
    for(const client of process.argv.includes('--old-layouts-only')?['old']:['old','new']) {
      const newRoomFile=path.join(root,'test-results/chat-theme/new-rooms.json');
      const clientRooms=client==='new'&&fs.existsSync(newRoomFile)?JSON.parse(fs.readFileSync(newRoomFile)):rooms;
      const fixture=JSON.parse(fs.readFileSync(path.join(root,'test-results/dropdown-controls',client+'-footer-1100.json')));
      const font='@font-face{font-family:FontAwesome;src:url(data:font/woff2;base64,'+fs.readFileSync(path.join(root,'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style/fonts/fontawesome-webfont.woff2')).toString('base64')+') format("woff2")}';
      const file=path.join(out,'preview.html');
      fs.writeFileSync(file,'<!doctype html><html class="dark '+(client==='new'?'showdown-new-client':'')+'"><head><meta charset="utf-8"><base href="https://play.pokemonshowdown.com/"><style>'+fixture.css+'</style><style>.ps-room.audit-room{position:relative;inset:auto;width:100%;height:auto}.audit-room>.chat-log{position:relative;inset:auto;height:auto;overflow:visible}.audit-room>.chat-log>.inner{padding:8px}.audit-content{min-width:0}</style></head><body class="dark"><div class="ps-room audit-room"><div class="chat-log"><div class="inner message-log audit-content"></div></div></div></body></html>');
      await wc.loadFile(file);
      // The native CSS snapshot also contains an older injected Pro scope.
      // Remove it before inserting the current user stylesheet, so removed
      // selectors cannot keep affecting the comparison through author CSS.
      const removed=await evaluate('let removed=0;for(const sheet of document.styleSheets)for(let i=sheet.cssRules.length-1;i>=0;i--)if(/^@scope\\s*\\(html\\.showdown-pro\\)/.test(sheet.cssRules[i].cssText)){sheet.deleteRule(i);removed++;}return removed;');
      assert.ok(removed,'Discard cached Pro rules before comparing themes');
      await wc.insertCSS(font);await wc.insertCSS(pro,{cssOrigin:'user'});await evaluate(roomEnhancer);
      wc.debugger.attach('1.3');await wc.debugger.sendCommand('DOM.enable');await wc.debugger.sendCommand('CSS.enable');
      let checked=0;
      for(const room of clientRooms.filter(r=>r.status==='inspected'&&(!selected||selected.includes(r.id)))) {
        const notices=(room.notices||[]).filter(n=>!n.includes('tournament-bracket-tree')&&!n.includes('tournament-message-'));
        await evaluate('document.querySelector(".ps-room").id='+JSON.stringify('room-'+room.id)+';document.querySelector(".audit-content").innerHTML='+JSON.stringify(notices.join(''))+';');
        await evaluate('return Promise.race([Promise.all([...document.images].filter(e=>!e.complete).map(e=>new Promise(r=>{e.addEventListener("load",r,{once:true});e.addEventListener("error",r,{once:true});}))),new Promise(r=>setTimeout(r,250))]);');
        for(const expanded of [false,true]) {
        await evaluate('document.querySelectorAll(".audit-content details").forEach(e=>e.open='+expanded+');');
        for(const width of [750,430,320]) {
          await resize(width);
          await evaluate('document.documentElement.classList.remove("showdown-pro");');
          const dark=await inspect();
          await evaluate('document.documentElement.classList.add("showdown-pro");');
          const styled=await inspect();
          const issues=[];
          const targets=data=>data.items.map(e=>({text:e.text,value:e.value,name:e.name,href:e.href}));
          if(JSON.stringify(targets(dark))!==JSON.stringify(targets(styled)))issues.push('Changed labels or actions');
          for(const item of styled.items) {
            const native=dark.items[item.index];
            if(item.inlineImage.includes('url(')&&item.image!==native.image)issues.push('Missing artwork: '+item.index);
            if(native.label&&native.label!=='none')issues.push('Caption changed native Dark: '+item.index);
            if(item.clipped&&!native.clipped)issues.push('New text clipping: '+item.index+' '+item.text);
            if(native.visible&&native.actionable&&!item.visible)issues.push('Hidden action: '+item.index);
            if(item.flow&&item.visible&&item.margin!=='3px'&&!item.gridSpacing)issues.push('Missing action spacing: '+item.index);
            if(item.outsideFrames.some(frame=>!native.outsideFrames.includes(frame)))issues.push('Control outside banner frame: '+item.index);
            if(item.label&&item.label==='none')issues.push('Missing artwork caption: '+item.index);
            if((item.hotspot||item.authoredHotspot)&&(item.image!=='none'||item.background!=='rgba(0, 0, 0, 0)'||item.shadow!=='none'))issues.push('Painted artwork hotspot: '+item.index);
            if(item.hotspot&&JSON.stringify(item.ink)!==JSON.stringify(native.ink))issues.push('Changed artwork lettering: '+item.index);
            if(item.bannerAction&&item.authoredRadius&&item.radius!==native.radius)issues.push('Changed banner action shape: '+item.index);
            if(item.contrast!==null&&item.contrast<4.5&&native.contrast>=4.5)issues.push('Unreadable label on light surface: '+item.index);
          }
          for(const pair of styled.overlaps)if(!dark.overlaps.includes(pair))issues.push('New control overlap: '+pair);
          for(const index of styled.textOverlaps)if(!dark.textOverlaps.includes(index))issues.push('New text overlap: '+index);
          if(styled.overflow&&!dark.overflow)issues.push('New horizontal overflow');
          if(room.id==='videogames'&&styled.introScroll)issues.push('Video Games actions require scrolling inside the banner');
          report.push({client,room:room.id,width,expanded,controls:styled.items.length,issues,debug:issues.length?styled.items:undefined,dark:{overlaps:dark.overlaps,textOverlaps:dark.textOverlaps,overflow:dark.overflow},pro:{overlaps:styled.overlaps,textOverlaps:styled.textOverlaps,overflow:styled.overflow}});
          if((selected||['thelibrary','scavengers','help','boardgames','tournaments','lobby','smogondoubles','capproject','monotype','wifi','toursplaza','eventos','thestudio'].includes(room.id)||issues.length)&&width!==320) {
            await evaluate('document.querySelectorAll(".audit-extra").forEach(e=>e.hidden=true);document.querySelector(".chat-log").scrollTop=0;');await pause(100);
            await capture(path.join(out,client+'-'+room.id+'-pro-'+width+(expanded?'-expanded':'')+'.png'));
            await evaluate('document.documentElement.classList.remove("showdown-pro");');
            await capture(path.join(out,client+'-'+room.id+'-dark-'+width+(expanded?'-expanded':'')+'.png'));
            await evaluate('document.querySelectorAll(".audit-extra").forEach(e=>e.hidden=false);');
          }
        }
        }
        await resize(750);
        await evaluate('document.documentElement.classList.add("showdown-pro");');
        const normal=await inspect();
        const {root:dom}=await wc.debugger.sendCommand('DOM.getDocument');
        const {nodeIds}=await wc.debugger.sendCommand('DOM.querySelectorAll',{nodeId:dom.nodeId,selector:'.audit-content button,.audit-content input,.audit-content select,.audit-content textarea,.audit-content a.button,.audit-content a[role=button],.audit-content a[style*="position: absolute"],.audit-content a[style*="position:absolute"],.audit-content summary'});
        for(const state of ['hover','active','focus-visible']) {
          await Promise.all(nodeIds.map(nodeId=>wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[state]})));
          const styled=await inspect(),issues=[];
          for(const item of styled.items) {
            const before=normal.items[item.index];
            if(item.inlineImage.includes('url(')&&item.image!==before.image)issues.push('Missing artwork on '+state+': '+item.index);
            if((item.hotspot||item.authoredHotspot)&&(item.image!=='none'||item.background!=='rgba(0, 0, 0, 0)'||item.shadow!=='none'))issues.push('Painted artwork hotspot on '+state+': '+item.index);
            if(item.hotspot&&JSON.stringify(item.ink)!==JSON.stringify(before.ink))issues.push('Changed artwork lettering on '+state+': '+item.index);
            if(item.bannerAction&&item.authoredRadius&&item.radius!==before.radius)issues.push('Changed banner action shape on '+state+': '+item.index);
            if(item.contrast!==null&&item.contrast<4.5&&before.contrast>=4.5)issues.push('Unreadable label on light surface on '+state+': '+item.index);
            if(item.visible&&item.actionable&&!item.disabled&&state==='focus-visible'&&item.outline<2)issues.push('Missing keyboard focus: '+item.index);
            if(item.visible&&before.visible&&(Math.abs(item.rect.w-before.rect.w)>1||Math.abs(item.rect.h-before.rect.h)>1))issues.push('Control moved on '+state+': '+item.index);
          }
          report.push({client,room:room.id,width:750,expanded:true,state,controls:styled.items.length,issues});
        }
        await Promise.all(nodeIds.map(nodeId=>wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]})));
        checked++;
        if(checked%20===0)console.log(client+': compared '+checked+' rooms in Dark and Pro at three widths');
        fs.writeFileSync(path.join(out,process.argv.includes('--old-layouts-only')?'comparison-old.json':'comparison.json'),JSON.stringify({rooms:rooms.length,unavailable:{old:rooms.filter(r=>r.status!=='inspected').map(r=>({id:r.id,title:r.title,diagnostic:r.diagnostic})),new:clientRooms.filter(r=>r.status!=='inspected').map(r=>({id:r.id,title:r.title,diagnostic:r.diagnostic}))},scenes:report},null,2));
      }
      wc.debugger.detach();
    }
    const failures=report.filter(r=>r.issues.length);
    console.log(JSON.stringify({directory:rooms.length,inspected:rooms.filter(r=>r.status==='inspected').length,comparisons:report.length,issues:failures.length,unavailable:rooms.filter(r=>r.status!=='inspected').map(r=>r.id)}));
    if(!process.argv.includes('--review-layouts'))assert.equal(failures.length,0,'See test-results/chat-layouts/comparison.json');
  } finally {window.destroy();}
};
