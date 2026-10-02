const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { BrowserWindow, nativeTheme } = require('electron');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Runs against both live clients using the isolated smoke profile.
module.exports = async (wc, root) => {
  const out = path.join(root, 'test-results/new-client');
  fs.mkdirSync(out, { recursive: true });
  const evaluate = source => wc.executeJavaScript('(() => {' + source + '})()');
  const waitFor = async source => {
    for (let n = 0; n < 160; n++) {
      if (await evaluate('return !!(' + source + ');').catch(() => false)) return;
      await pause(250);
    }
    throw new Error('New client audit timed out: ' + source);
  };
  const ready = () => waitFor('window.__showdownProTheme && document.getElementById("showdown-pro-theme")?.sheet');
  await evaluate("app.addPopup(OptionsPopup);");
  const url = await evaluate('return document.querySelector(\'.ps-popup a[href="/newclient"]\').href;');
  await wc.loadURL(url);
  console.log('Navigated to new client:', wc.getURL());
  await ready();
  await waitFor('window.PS?.roomTypes?.options');
  const openOptions = async () => {
    await evaluate("PS.join('options');");
    await waitFor('document.querySelector("select[name=theme]")');
  };
  await openOptions();
  const selectTheme = async choice => {
    await evaluate(`
      const select = document.querySelector('select[name=theme]');
      if (!select) throw new Error('Theme picker missing');
      select.value = ${JSON.stringify(choice)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    await pause(100);
  };
  const appearance = () => evaluate(`
    const select = document.querySelector('select[name=theme]');
    return {
      saved: PS.prefs.theme, stored: JSON.parse(localStorage.showdown_prefs).theme,
      value: select.value, options: [...select.options].map(o => o.value),
      pro: document.documentElement.classList.contains('showdown-pro'),
      dark: document.body.classList.contains('dark'),
      background: getComputedStyle(document.body).backgroundImage,
      pickerBackground: getComputedStyle(select).backgroundImage,
      checkbox: getComputedStyle(document.querySelector('.ps-popup input[type=checkbox]')).appearance,
    };
  `);
  const capture = async name => {
    const snapshot = await evaluate(`
      const body = document.body.cloneNode(true);
      document.body.querySelectorAll('select').forEach((select, index) => {
        const copy = body.querySelectorAll('select')[index];
        [...copy.options].forEach(option => option.toggleAttribute('selected', option.value === select.value));
      });
      body.querySelectorAll('script').forEach(el => el.remove());
      return {
        htmlClass: document.documentElement.className, body: body.outerHTML,
        css: [...document.styleSheets].map(sheet => {
          try { return [...sheet.cssRules].map(r => r.cssText).join('\\n'); } catch { return ''; }
        }).join('\\n')
      };
    `);
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(snapshot, null, 2));
    const preview = new BrowserWindow({ width: 1100, height: 1000, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
    try {
      await preview.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html class="${snapshot.htmlClass}"><head><meta charset="utf-8"><base href="https://play.pokemonshowdown.com/"><style>${snapshot.css}</style></head>${snapshot.body}</html>`));
      await pause(500);
      fs.writeFileSync(path.join(out, name + '.png'), (await preview.webContents.capturePage()).toPNG());
    } finally { preview.destroy(); }
  };
  const results = [];
  assert.equal((await appearance()).value, 'pro', 'Stored Pro must be selected immediately');
  for (const choice of ['light', 'dark', 'pro', 'system']) {
    nativeTheme.themeSource = 'light';
    await selectTheme(choice);
    const result = await appearance();
    assert.deepEqual(result.options, ['light', 'dark', 'pro', 'system']);
    assert.equal(result.saved, choice);
    assert.equal(result.stored, choice);
    assert.equal(result.value, choice);
    assert.equal(result.pro, choice === 'pro');
    assert.equal(result.dark, ['dark', 'pro'].includes(choice));
    assert.equal(result.background.includes('radial-gradient'), choice === 'pro');
    assert.equal(result.checkbox === 'none', choice === 'pro');
    results.push(result);
    if (choice === 'pro') await capture('settings-pro');
    if (choice === 'system') {
      nativeTheme.themeSource = 'dark';
      await selectTheme('system');
      assert.equal((await appearance()).dark, true);
    }
    console.log(`New client ${choice}: picker, preference and appearance verified.`);
  }
  for (const choice of ['dark', 'pro']) {
    await selectTheme(choice);
    await wc.loadURL(wc.getURL());
    await ready();
    await openOptions();
    const result = await appearance();
    assert.equal(result.value, choice);
    assert.equal(result.pro, choice === 'pro');
    console.log(`New client ${choice}: reload verified.`);
  }
  await evaluate("PS.leave('options');");
  await openOptions();
  assert.deepEqual((await appearance()).options, ['light', 'dark', 'pro', 'system']);
  const oldUrl = await evaluate(`return [...document.querySelectorAll('.ps-popup a')].find(a => /old client/i.test(a.textContent))?.href;`);
  assert.ok(oldUrl, 'Old-client switch must be available');
  await evaluate("PS.leave('options');");
  await pause(100);
  await capture('home-pro');
  assert.equal(await evaluate("return document.querySelector('[data-showdex-scheme]')?.dataset.showdexScheme;"), 'dark', 'Showdex automatic scheme must recognize Pro');
  await wc.loadURL(oldUrl);
  await ready();
  await waitFor('window.OptionsPopup');
  await evaluate('app.addPopup(OptionsPopup);');
  assert.equal(await evaluate("return document.querySelector('select[name=theme]').value;"), 'pro');
  assert.equal(await evaluate("return document.documentElement.classList.contains('showdown-pro');"), true);
  console.log('Switching back to old client preserves Pro.');
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(results, null, 2));
  nativeTheme.themeSource = 'system';
  console.log('New-client theme checks passed.');
};

