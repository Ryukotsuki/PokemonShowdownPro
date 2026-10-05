require('./mute-test-audio.cjs');
const { app, BrowserWindow, session, protocol, net } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { isolateAuditNetwork, loadAuditClient } = require('./audit-client.cjs');
const { history, request } = require('../tests/fixtures.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-results/calcdex-controls');
protocol.registerSchemesAsPrivileged([{ scheme: 'showdown-pro', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setPath('userData', path.join(out, 'profile'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const ses = session.fromPartition('calcdex-controls-' + Date.now());
  isolateAuditNetwork(ses);
  ses.protocol.handle('showdown-pro', async req => {
    const url = new URL(req.url), base = url.hostname === 'showdex' ? path.join(root, 'build/showdex') : url.hostname === 'assets' ? path.join(root, 'app/assets') : null;
    if (!base) return new Response('', { status: 404 });
    const file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(base + path.sep)) return new Response('', { status: 403 });
    try {
      const response = await net.fetch(pathToFileURL(file).href), headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', 'https://play.pokemonshowdown.com');
      return new Response(response.body, { status: response.status, headers });
    } catch { return new Response('', { status: 404 }); }
  });
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { session: ses, offscreen: true, backgroundThrottling: false } });
  const wc = win.webContents, report = [];
  const run = code => wc.executeJavaScript('(async()=>{' + code + '})()');
  const wait = async code => {
    for (let i = 0; i < 250; i++) {
      if (await run('return !!(' + code + ');').catch(() => false)) return;
      await pause(100);
    }
    const state = await run(`return {rooms:Object.keys(window.app?.rooms||window.PS?.rooms||{}),buttons:[...document.querySelectorAll('button[name=toggleCalcdexOverlay]')].map(b=>b.outerHTML)};`);
    fs.writeFileSync(path.join(out,'failure.html'),await run('return document.documentElement.outerHTML;'));
    fs.writeFileSync(path.join(out,'failure.png'),(await wc.capturePage()).toPNG());
    throw new Error('Calcdex controls timed out: ' + code + ' ' + JSON.stringify(state));
  };
  wc.on('console-message', details => { if (details.level === 'error' && /Calcdex|TypeError|React error/.test(details.message)) console.error(details.message.slice(0, 600)); });
  const load = async version => {
    wc.setZoomFactor(1);
    await loadAuditClient(wc, 'https://play.pokemonshowdown.com/' + version + 'client');
    await wait(version === 'old' ? 'window.app?.socket?.readyState===1 && window.OptionsPopup' : 'window.PS?.connection?.connected && window.PS.prefs');
    await run(version === 'old'
      ? "app.socket.send=()=>{};app.user.set({name:'ProTest',named:true});Storage.prefs('autotimer',false);"
      : "PS.connection.send=()=>{};PS.user.setName('ProTest',true,'1');PS.prefs.set('autotimer',false);");
    await wc.executeJavaScript(fs.readFileSync(path.join(root, 'app/client-theme.js'), 'utf8'));
    await wc.insertCSS(require('../app/client-theme-css.cjs'), { cssOrigin: 'user' });
    await wc.insertCSS(require('../app/client-zoom.cjs').showdexZoomCSS, { cssOrigin: 'user' });
    await run('document.documentElement.style.setProperty("--showdown-pro-showdex-zoom","1");');
    await wc.executeJavaScript(fs.readFileSync(path.join(root, 'build/showdex/main.js'), 'utf8'));
    await wait('document.querySelector("[data-showdex-module=hellodex]")');
  };
  const configure = async settings => run(`await new Promise((resolve,reject)=>{
    const req=indexedDB.open('showdex');req.onerror=()=>reject(req.error);req.onsuccess=()=>{
      const db=req.result,tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings'),get=store.get('calcdex');
      get.onsuccess=()=>store.put({...get.result,...${JSON.stringify(settings)}},'calcdex');
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
  });`);
  let counter = 985100;
  for (const version of (process.env.SHOWDOWN_PRO_AUDIT_CLIENT ? [process.env.SHOWDOWN_PRO_AUDIT_CLIENT] : ['old', 'new'])) {
    const host = version === 'old' ? 'app' : 'PS';
    await load(version);
    for (const scenario of [
      { openAs: 'showdown', openOnStart: 'always', name: 'auto' },
      { openAs: 'overlay', openOnStart: 'always', name: 'overlay' },
      { openAs: 'panel', openOnStart: 'never', name: 'manual-panel' },
      { openAs: 'overlay', openOnStart: 'never', name: 'manual-overlay' },
      { openAs: 'showdown', openOnStart: 'always', name: 'spectator', spectating: true },
    ].filter(s => !process.env.SHOWDOWN_PRO_AUDIT_SCENARIO || s.name === process.env.SHOWDOWN_PRO_AUDIT_SCENARIO)) {
      win.setContentSize(1400, 900);
      await configure({ openAs: scenario.openAs, openOnStart: scenario.openOnStart, destroyOnClose: true });
      await load(version);
      const id = 'battle-gen9randombattle-' + (++counter), room = `${host}.rooms[${JSON.stringify(id)}]`;
      const selector = `'#room-${id} button[name=toggleCalcdexOverlay]'`;
      const lines = history().filter(line => !scenario.spectating || !line.startsWith('|request|'));
      await run(`${host}.receive(${JSON.stringify('>' + id + '\n' + lines.join('\n'))});${host}.focusRoom(${JSON.stringify(id)});`);
      await wait(`${room}?.battle`);
      await run(`${room}.battle.seekTurn(Infinity);`);
      await wait(`document.querySelector(${selector})`);
      const inspect = async step => {
        await pause(150);
        // Electron can deliver the resize and Showdown's layout update on
        // separate frames; measure the rendered layout after both have run.
        await run('await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));');
        const result = await run(`const buttons=[...document.querySelectorAll(${selector})],b=buttons[0],r=b.getBoundingClientRect();
          const replayControls=${room}.battle.ended ? [...document.querySelectorAll('#room-${id} .replayDownloadButton,#room-${id} button[name=saveReplay],#room-${id} button[data-cmd="/savereplay"]')].map(control=>{
            const c=control.getBoundingClientRect(),hit=document.elementFromPoint(c.x+c.width/2,c.y+c.height/2);
            return {label:control.textContent.trim(),visible:control.checkVisibility()&&c.width>0&&c.height>0,
              overlapsCalcdex:r.left<c.right&&r.right>c.left&&r.top<c.bottom&&r.bottom>c.top,
              accessible:!!hit&&control.contains(hit)};
          }) : [];
          return {count:buttons.length,label:b.textContent.trim(),disabled:b.disabled,visible:b.checkVisibility()&&r.width>0&&r.height>0,
            inViewport:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,overlay:${room}.battle.calcdexAsOverlay,
            ended:${room}.battle.ended,replayControls,
            initialized:!!${room}.battle.calcdexStateInit,timers:document.querySelectorAll('#room-${id} .timerbutton,#room-${id} [data-href=battletimer]').length,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};`);
        fs.writeFileSync(path.join(out, 'latest-state.json'), JSON.stringify({version, scenario:scenario.name, step, ...result}, null, 2));
        if (!result.inViewport || result.replayControls.some(c => c.overlapsCalcdex || !c.accessible)) {
          fs.writeFileSync(path.join(out, 'failure.png'), (await wc.capturePage()).toPNG());
        }
        assert.equal(result.count, 1, `${version}/${scenario.name}/${step}: one button`);
        assert.equal(result.visible, true, `${version}/${scenario.name}/${step}: visible`);
        assert.equal(result.disabled, false, `${version}/${scenario.name}/${step}: usable`);
        assert.equal(result.inViewport, true, `${version}/${scenario.name}/${step}: inside viewport`);
        assert.ok(result.timers <= 1, `${version}/${scenario.name}/${step}: no duplicate timer`);
        if (result.ended) {
          assert.equal(result.replayControls.length, 2, `${version}/${scenario.name}/${step}: download and upload controls`);
          for (const control of result.replayControls) {
            assert.equal(control.visible, true, `${version}/${scenario.name}/${step}: ${control.label} visible`);
            assert.equal(control.overlapsCalcdex, false, `${version}/${scenario.name}/${step}: ${control.label} overlaps Calcdex`);
            assert.equal(control.accessible, true, `${version}/${scenario.name}/${step}: ${control.label} receives clicks`);
          }
        }
        report.push({ version, scenario: scenario.name, step, ...result });
        return result;
      };
      let state = await inspect('initial');
      if (scenario.openOnStart === 'never') assert.equal(state.initialized, false, 'No automatic calculator with Never');
      await run(`document.querySelector(${selector}).click();`);
      await wait(`${room}.battle.calcdexStateInit && document.querySelector('[data-showdex-module=calcdex]')`);
      state = await inspect('opened');
      for(const [showdownZoom,showdexZoom] of [[100,150],[50,200],[200,50]]) {
        wc.setZoomFactor(showdownZoom/100);
        await run(`document.documentElement.style.setProperty("--showdown-pro-showdex-zoom",${JSON.stringify(showdexZoom/showdownZoom)});window.dispatchEvent(new Event('resize'));`);
        await pause(200);
        if(!state.overlay)await run(`${host}.focusRoom(${JSON.stringify(version==='old'?'view-calcdex-'+id.replace(/[^a-z0-9]/g,''):'calcdex-'+id)});`);
        await pause(150);
        const fit=await run('return [...document.querySelectorAll("[data-showdex-module=calcdex]")].filter(e=>e.checkVisibility()).map(e=>{const r=e.getBoundingClientRect(),p=(getComputedStyle(e).position==="relative"?e.parentElement:e.closest(".ps-room")).getBoundingClientRect();return {root:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},parent:{x:p.x,y:p.y,right:p.right,bottom:p.bottom},viewport:{width:innerWidth,height:innerHeight}};});');
        assert.ok(fit.length,'Calculator visible at independent zoom levels');
        for(const box of fit)assert.ok(box.root.width>0&&box.root.height>0&&box.root.x>=box.parent.x-.5&&box.root.y>=box.parent.y-.5&&box.root.right<=box.parent.right+.5&&box.root.bottom<=box.parent.bottom+.5,`Calculator fits ${version}/${scenario.name}/${showdownZoom}/${showdexZoom}: ${JSON.stringify(box)}`);
      }
      wc.setZoomFactor(1);
      await run('document.documentElement.style.setProperty("--showdown-pro-showdex-zoom","1");window.dispatchEvent(new Event("resize"));');
      await pause(200);
      if (state.overlay) {
        await wait(`document.querySelector(${selector}).textContent.includes('Close')`);
        await run(`document.querySelector(${selector}).click();`);
        await wait(`document.querySelector(${selector}).textContent.includes('Open')`);
      } else {
        const calcdexId = version === 'old' ? 'view-calcdex-' + id.replace(/[^a-z0-9]/g, '') : 'calcdex-' + id;
        await run(`${host}.${version === 'old' ? 'leaveRoom' : 'leave'}(${JSON.stringify(calcdexId)});${host}.focusRoom(${JSON.stringify(id)});`);
        await pause(150);
        await run(`document.querySelector(${selector}).click();`);
        await wait(`${room}.battle.calcdexStateInit && ${host}.rooms[${JSON.stringify(calcdexId)}] && document.querySelector('[data-showdex-module=calcdex]')`);
      }
      await inspect('reopened');
      // Native controls are replaced for waits, requests, new turns and team preview.
      for (const [step, req] of (scenario.spectating ? [] : [['waiting', { ...request(2), wait: true }], ['moves', request(3)], ['switching', { side: request().side, forceSwitch: [true], rqid: 4 }], ['preview', { side: request().side, teamPreview: true, maxTeamSize: 2, rqid: 5 }]])) {
        await run(`${host}.receive(${JSON.stringify('>' + id + '\n|request|' + JSON.stringify(req))});${room}.battle.seekTurn(Infinity);`);
        await inspect(step);
      }
      for (const theme of ['light', 'dark', 'pro']) {
        await run(version === 'old' ? `OptionsPopup.prototype.setTheme({currentTarget:{value:${JSON.stringify(theme)}}});` : `PS.prefs.set('theme',${JSON.stringify(theme)});`);
        for (const width of [1400, 680, 430]) {
          win.setContentSize(width, 900);
          await run(`${host}.focusRoom(${JSON.stringify(id)});`);
          await inspect(theme + '-' + width);
          if (theme === 'pro') fs.writeFileSync(path.join(out, `${version}-${scenario.name}-${width}.png`), (await wc.capturePage()).toPNG());
        }
      }
      await run(`${host}.receive(${JSON.stringify('>' + id + '\n|turn|2')});${room}.battle.seekTurn(Infinity);`);
      await inspect('next-turn');
      await run(`${host}.receive(${JSON.stringify('>' + id + '\n|win|ProTest')});${room}.battle.seekTurn(Infinity);`);
      await inspect('ended');
      for (const theme of ['light', 'dark', 'pro']) {
        await run(version === 'old' ? `OptionsPopup.prototype.setTheme({currentTarget:{value:${JSON.stringify(theme)}}});` : `PS.prefs.set('theme',${JSON.stringify(theme)});`);
        for (const width of [1400, 680, 430]) {
          win.setContentSize(width, 900);
          await run(`${host}.focusRoom(${JSON.stringify(id)});`);
          await inspect('ended-' + theme + '-' + width);
          if (theme === 'pro') fs.writeFileSync(path.join(out, `${version}-${scenario.name}-ended-${width}.png`), (await wc.capturePage()).toPNG());
        }
      }
      console.log(version + '/' + scenario.name + ': visible, opens, reopens and survives control changes in all themes and widths');
    }
  }
  assert.equal(wc.isAudioMuted(), true);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  win.destroy();app.exit(0);
}).catch(error => { console.error(error);app.exit(1); });
