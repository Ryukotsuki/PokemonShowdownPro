require('./mute-test-audio.cjs');
const { app, BrowserWindow, session, protocol, net, clipboard, ClipboardItem, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { installClientPermissions } = require('../app/client-permissions.cjs');
const { isolateAuditNetwork, loadAuditClient } = require('./audit-client.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'test-results/showdex-settings');
protocol.registerSchemesAsPrivileged([{ scheme: 'showdown-pro', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setPath('userData', path.join(out, 'profile'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const ses = session.fromPartition('showdex-settings-' + Date.now());
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
  const win = new BrowserWindow({ show: false, width: 1100, height: 900, webPreferences: {
    session: ses, preload: path.join(root, 'app/client-preload.cjs'), sandbox: true,
    contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false,
  } });
  const wc = win.webContents;
  ipcMain.handle('client:theme-css', event => event.sender === wc && event.senderFrame === wc.mainFrame ? require('../app/client-theme-css.cjs') : null);
  wc.debugger.attach('1.3');
  // Exercise Chromium's real clipboard API in a focused document without
  // opening a visible test window or taking focus from the user's app.
  const run = code => wc.executeJavaScript('(async()=>{' + code + '})()', true);
  const wait = async (code, label = code) => {
    for (let i = 0; i < 180; i++) {
      if (await run('return !!(await (' + code + '));').catch(() => false)) return;
      await pause(100);
    }
    fs.writeFileSync(path.join(out, 'failure.png'), (await wc.capturePage()).toPNG());
    throw new Error('Showdex settings audit timed out: ' + label);
  };
  const click = async selector => run(`const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw new Error('Missing settings button');b.click();`);
  const settingsButton = name => name === 'export' ? '[data-showdex-module=hellodex] button[aria-label=Export]' : `[data-showdex-module=hellodex] button[class*=SettingsPane-module-${name}Button]`;
  const clickLabel = async label => run(`const b=[...document.querySelectorAll('[data-showdex-module=hellodex] button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw new Error('Missing '+${JSON.stringify(label)});b.click();`);
  const validSettings = value => /^v:[^;]+;/.test(value) && value.includes('$:settings;');
  // Materialize every format before changing the clipboard; restore it after
  // the audit without printing or storing the user's clipboard contents.
  const saved = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(
    Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])))
  )));
  const report = [];
  try {
    for (const version of ['old', 'new']) {
      await loadAuditClient(wc, 'https://play.pokemonshowdown.com/' + version + 'client');
      await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
      await wait(version === 'old' ? 'window.app?.socket?.readyState===1 && window.OptionsPopup' : 'window.PS?.connection?.connected && window.PS.prefs');
      await run(version === 'old' ? 'app.socket.send=()=>{};' : 'PS.connection.send=()=>{};');
      await wc.executeJavaScript(fs.readFileSync(path.join(root, 'app/client-theme.js'), 'utf8'));
      await wc.insertCSS(require('../app/client-theme-css.cjs'), { cssOrigin: 'user' });
      await wc.executeJavaScript(fs.readFileSync(path.join(root, 'build/showdex/main.js'), 'utf8'));
      await wait('document.querySelector("[data-showdex-module=hellodex]")');
      await run(`${version === 'old' ? 'app' : 'PS'}.focusRoom('hellodex');`);
      await clickLabel('Open Showdex Settings');
      await wait(`document.querySelector(${JSON.stringify(settingsButton('export'))})`);
      // Reproduce the shipping deny-all policy before checking the fix.
      ses.setPermissionCheckHandler(() => false);
      ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      await clipboard.writeText('showdex-audit-sentinel');
      await click(settingsButton('export'));await pause(400);
      assert.equal(await clipboard.readText(), 'showdex-audit-sentinel', 'Deny-all blocks Export');
      installClientPermissions(ses, () => wc);
      assert.equal(await run("return (await navigator.permissions.query({name:'clipboard-read'})).state;"), 'granted');
      await click(settingsButton('export'));
      for (let i = 0; i < 100 && !validSettings(await clipboard.readText()); i++) await pause(50);
      const exported = await clipboard.readText();
      assert.ok(validSettings(exported), 'Export writes a valid Showdex settings payload');
      assert.ok(exported.includes('fc:pro;'), 'Pro preference survives export');
      await clickLabel('Light');
      await wait('!document.documentElement.classList.contains("showdex-pro")');
      await clipboard.writeText(exported);
      await click(settingsButton('import'));
      await wait('document.documentElement.classList.contains("showdex-pro")', 'Import restores exported Pro preference');
      // Undo must restore the settings that were active before importing.
      await click(settingsButton('import'));
      await wait('!document.documentElement.classList.contains("showdex-pro")', 'Import Undo restores Light preference');
      await click(settingsButton('defaults'));
      for (let i = 0; i < 100 && await clipboard.readText() === exported; i++) await pause(50);
      const defaults = await clipboard.readText();
      assert.ok(validSettings(defaults), 'Defaults copies a valid settings payload');
      assert.ok(defaults.includes('fc:pro;'), 'Defaults retains Pro as the bundled default');
      await click(settingsButton('import'));
      await wait('document.documentElement.classList.contains("showdex-pro")', 'Defaults payload imports successfully');
      await pause(300);
      assert.equal(await run('return document.documentElement.classList.contains("showdex-pro");'), true, 'Imported settings remain applied after the form rerenders');
      // Validate persistence using Showdex's database in this isolated profile.
      await wait(`new Promise(resolve=>{const req=indexedDB.open('showdex');req.onsuccess=()=>{const db=req.result,get=db.transaction('settings').objectStore('settings').get('showdex');get.onsuccess=()=>{db.close();resolve(get.result?.forcedColorScheme==='pro');};};})`);
      fs.writeFileSync(path.join(out, version + '-settings.png'), (await wc.capturePage()).toPNG());
      report.push({ version, deniedPolicyReproduced: true, export: true, import: true, undo: true, defaults: true, persisted: true });
      console.log(version + ': Export, Import, Undo and Defaults passed with the production clipboard policy');
    }
    assert.equal(wc.isAudioMuted(), true);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  } finally {
    if (saved.length) await clipboard.write(saved);else clipboard.clear();
    win.destroy();
  }
  app.exit(0);
}).catch(error => { console.error(error);app.exit(1); });
