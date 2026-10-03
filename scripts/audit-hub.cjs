const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { history, request } = require('../tests/fixtures.cjs');

// Runs through real preload IPC in the app's isolated guest profile.
module.exports = async ({ window, client, root, state, hubTooltip, waitFor, actions }) => {
  const panel = window.webContents, wc = client.webContents;
  assert.equal(panel.isAudioMuted(), true);
  assert.equal(wc.isAudioMuted(), true);
  const run = code => wc.executeJavaScript(`(() => { ${code} })()`);
  const ui = code => panel.executeJavaScript(`(() => { ${code} })()`);
  const isNew = await run('return !!window.PS?.receive;');
  await run("window.__hubErrors=[];window.addEventListener('error',event=>__hubErrors.push(String(event.error?.stack || event.message).slice(0,1800)));");
  const out = path.join(root, 'test-results/hub', isNew ? 'new' : 'old');
  fs.mkdirSync(out, { recursive: true });
  const setting = (key,value) => panel.executeJavaScript(`pro.setSetting(${JSON.stringify(key)},${JSON.stringify(value)})`);
  await waitFor(() => ui('return !!document.querySelector(".empty");'));
  await require('./audit-window-controls.cjs')({window,client,root,state,waitFor});
  await require('./audit-update-ui.cjs')({window,client,root});
  assert.deepEqual(await ui('return [...document.querySelectorAll("[role=tab]")].map(tab=>tab.dataset.tab);'), ['battle','addons','messages','history']);
  assert.equal(await ui('return typeof pro.setMode;'), 'undefined');
  assert.equal(await run('return typeof __showdownPro.submit;'), 'undefined');
  assert.equal(await run('return typeof __showdownPro.queueNext;'), 'undefined');
  assert.equal(await ui('return !!document.querySelector(".mode-switch, #pause-auto, #collapsed-status, #page-automation");'), false);
  assert.equal(Object.hasOwn(state(),'engineStatus'),false);
  await setting('sidebarCollapsed', false);
  await setting('sidebarTab','battle');
  const fullWidth=client.getBounds().width;
  await ui('document.getElementById("sidebar-toggle").click();');
  await waitFor(()=>state().ui.collapsed);
  assert.equal(client.getBounds().width,fullWidth+312);
  const point=await ui('const r=document.getElementById("sidebar-toggle").getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};');
  panel.sendInputEvent({type:'mouseMove',...point});
  await waitFor(()=>hubTooltip.view.getVisible());
  assert.equal(await hubTooltip.view.webContents.executeJavaScript('document.getElementById("label").textContent'),'Expand Battle Hub');
  panel.sendInputEvent({type:'mouseMove',x:5,y:200});
  await setting('sidebarCollapsed',false);
  await setting('autoStartTimer',false);
  await setting('saveWinningReplays',true);
  await setting('saveLosingReplays',true);
  await setting('messages',{startEnabled:true,startText:'Good luck!',endEnabled:true,endText:'Good game!'});
  const baseline={...state().statistics.session};
  // Intercept all transports before synthetic rooms or scripted chat are added.
  await run(`const host=${isNew?'PS':'app'};window.__hubSends=[];window.__hubUploads=[];
    const intercepted=(data,room)=>{
      __hubSends.push({data,room});
      if(data==='/savereplay')setTimeout(()=>{
        const id=room.slice(7);
        ${isNew ? "host.mainmenu.handleQueryResponse('savereplay',{id,log:'synthetic replay'});" : "host.addPopup(ReplayUploadedPopup,{id});"}
      },30);
    };
    host.send=intercepted;
    if(host.socket)host.socket.send=intercepted;
    if(host.connection)host.connection.send=intercepted;
    if(host.connection?.socket)host.connection.socket.send=intercepted;
    ${isNew ? "window.fetch=async (url,options)=>{if(!String(url).includes('action.php'))throw new Error('Unexpected audit fetch');const id=options.body.get('id');__hubUploads.push(id);return {ok:true,text:async()=> 'success:'+id};};" : ''}
  `);
  const ids=[1,2,3].map(offset=>'battle-gen9randombattle-'+(Date.now()+offset));
  for (const id of ids) await run(`${isNew?'PS':'app'}.receive(${JSON.stringify('>'+id+'\n'+history(request()).join('\n'))});`);
  await waitFor(()=>state().rooms.length===3);
  await waitFor(()=>run('return __hubSends.filter(s=>s.data==="Good luck!").length===3;'));
  assert.equal(await run('return __hubSends.some(s=>/^\\/(choose|move|switch|team|search)\\b/.test(s.data));'),false);
  await ui('document.querySelector("#battles button").click();');
  await waitFor(()=>run(`return ${isNew?'PS':'app'}.room?.id===${JSON.stringify(ids[2])} || ${isNew?'PS':'app'}.curRoom?.id===${JSON.stringify(ids[2])};`));
  const completed='>'+ids[0]+'\n|win|ProTest\n>'+ids[1]+'\n|win|Opponent\n>'+ids[2]+'\n|tie';
  await run(`${isNew?'PS':'app'}.receive(${JSON.stringify(completed)});`);
  await waitFor(()=>state().recentReplays.some(replay=>replay.url.endsWith(ids[1].slice(7))));
  await run(`${isNew?'PS':'app'}.receive(${JSON.stringify(completed)});`);
  await new Promise(resolve=>setTimeout(resolve,100));
  const sends=await run('return __hubSends;');
  assert.equal(sends.filter(s=>s.data==='/savereplay').length,2);
  assert.equal(sends.filter(s=>s.data==='Good game!').length,3);
  assert.deepEqual(state().statistics.session,{wins:baseline.wins+1,losses:baseline.losses+1,ties:baseline.ties+1});
  assert.equal(state().rooms.length,0);
  assert.equal(state().recentReplays.find(replay=>replay.url.endsWith(ids[0].slice(7))).outcome,'win');
  assert.equal(state().recentReplays.find(replay=>replay.url.endsWith(ids[1].slice(7))).outcome,'loss');
  console.log('Hub lifecycle, messages, duplicate results and replay uploads passed.');
  await setting('messages',{startEnabled:false,startText:'',endEnabled:false,endText:''});
  await setting('saveWinningReplays',false);await setting('saveLosingReplays',false);
  await setting('sidebarTab','history');
  await waitFor(()=>ui('return !document.getElementById("page-history").hidden;'));
  await ui('document.querySelector("#recent-replays button").click();document.querySelectorAll("#recent-replays button")[1].click();');
  await waitFor(()=>actions.opened.length===1 && actions.copies.length===1);
  assert.equal(actions.opened[0],state().recentReplays[0].url);
  assert.equal(actions.copies[0],state().recentReplays[0].url);
  await ui('document.getElementById("tab-battle").focus();');
  panel.sendInputEvent({type:'keyDown',keyCode:'Right'});panel.sendInputEvent({type:'keyUp',keyCode:'Right'});
  await waitFor(()=>state().ui.tab==='addons');
  const layouts=[];
  for (const theme of ['pro','light','dark']) {
    await run(isNew ? `PS.prefs.set('theme',${JSON.stringify(theme)});` : `OptionsPopup.prototype.setTheme({currentTarget:{value:${JSON.stringify(theme)}}});`);
    await waitFor(()=>state().theme===theme);
    for (const height of [650,980]) {
      window.setSize(1080,height);
      for (const tab of ['battle','addons','messages','history']) {
        await setting('sidebarTab',tab);
        await waitFor(()=>ui(`return !document.getElementById('page-${tab}').hidden;`));
        const layout=await ui(`const sidebar=document.querySelector('.sidebar'),dashboard=document.querySelector('.dashboard');return {theme:${JSON.stringify(theme)},tab:${JSON.stringify(tab)},height:${height},width:sidebar.getBoundingClientRect().width,overflow:dashboard.scrollWidth>dashboard.clientWidth,background:getComputedStyle(sidebar).backgroundColor};`);
        assert.equal(layout.width,360);assert.equal(layout.overflow,false);layouts.push(layout);
        if(tab==='history')assert.deepEqual(await ui('return [...document.querySelectorAll(".replay-result")].map(e=>e.textContent).slice(0,2);'),['Loss','Win']);
        fs.writeFileSync(path.join(out,`${theme}-${tab}-${height}.png`),(await panel.capturePage()).toPNG());
      }
    }
    console.log('Hub palette and layouts passed: '+theme);
  }
  await setting('sidebarTab','battle');
  const errors=await run('return window.__hubErrors || [];');
  await setting('showdexEnabled',false);assert.equal(state().reloadPending,true);
  await panel.executeJavaScript('pro.reload()');
  await waitFor(()=>state().showdexStatus==='Disabled' && /connected/i.test(state().clientStatus));
  await setting('showdexEnabled',true);await panel.executeJavaScript('pro.reload()');
  await waitFor(()=>state().showdexStatus==='Showdex loaded');
  await waitFor(()=>ui('return document.getElementById("showdex").textContent==="Showdex loaded";'));
  assert.equal(await wc.executeJavaScript('typeof require'),'undefined');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({isNew,layouts,sends,errors,showdexReload:true,statistics:state().statistics},null,2));
  console.log(`${isNew?'New':'Old'} client hub passed: four tabs, collapse/tooltip, messages, records, serialized replay uploads, three palettes, and Showdex reload.`);
};
