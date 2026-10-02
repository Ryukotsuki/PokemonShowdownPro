const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
require('./mute-test-audio.cjs');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'test-results/tcg-theme');
app.setPath('userData', path.join(out, 'preview-profile'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 750, height: 1000, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const wc = window.webContents;
  const evaluate = source => wc.executeJavaScript('(()=>{' + source + '})()');
  const bridge = fs.readFileSync(path.join(root, 'app/client-theme.js'), 'utf8');
  const enhancer = bridge.slice(bridge.indexOf('function installTCGPages()'), bridge.indexOf('function installHelpTips()')) + 'installTCGPages();';
  const pro = '@scope (html.showdown-pro){' + fs.readFileSync(path.join(root, 'app/client-theme.css'), 'utf8').replace(/\bhtml(?=[.,\s:#\[])/g, ':scope') + '}';
  const allowed = ['ptcg', 'ptcgdeck', 'ptcgrankings', 'ptcgnotes', 'ptcgabout', 'ptcgfaq', 'ptcgcredits'];
  const report = [];
  try {
    for (const client of ['old', 'new']) {
      const fixture = JSON.parse(fs.readFileSync(path.join(root, 'test-results/dropdown-controls', client + '-footer-1100.json')));
      const pages = JSON.parse(fs.readFileSync(path.join(out, client + '-pages.json'))).filter(page => allowed.some(id => page.id === 'room-view-bot-unrealbot-' + id));
      assert.equal(pages.length, allowed.length);
      for (const page of pages) {
        assert.ok(page.html, page.id + ' unavailable');
        const file = path.join(out, 'preview.html');
        fs.writeFileSync(file, '<!doctype html><html><head><meta charset="utf-8"><base href="https://play.pokemonshowdown.com/"><style>' + fixture.css + '</style><style>.ps-room.audit-room{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;box-sizing:border-box!important}body{margin:0}</style></head><body>' + page.html + '</body></html>');
        await wc.loadFile(file);
        await evaluate('for(const sheet of document.styleSheets)for(let i=sheet.cssRules.length-1;i>=0;i--)if(/^@scope\\s*\\(html\\.showdown-pro\\)/.test(sheet.cssRules[i].cssText))sheet.deleteRule(i);document.querySelector(".ps-room").classList.add("audit-room");for(const e of document.querySelectorAll("*"))for(const a of [...e.attributes])if(a.name.startsWith("data-showdown-pro-tcg"))e.removeAttribute(a.name);');
        await wc.insertCSS(pro, { cssOrigin: 'user' });
        const snapshot = () => evaluate(`
          const room=document.querySelector('.ps-room'),controls=[...room.querySelectorAll('button,a,input,select,textarea')];
          const action=e=>[e.tagName,e.textContent.trim(),e.getAttribute('value'),e.getAttribute('name'),e.getAttribute('href'),e.getAttribute('data-submitsend')];
          const visible=e=>e.checkVisibility()&&e.getBoundingClientRect().width>0;
          const styles=controls.map(e=>{const s=getComputedStyle(e);return [s.color,s.background,s.padding,s.borderRadius,s.fontSize]});
          const clipped=controls.filter(e=>visible(e)&&e.type!=='hidden'&&e.getBoundingClientRect().right>innerWidth+1).map(e=>e.textContent.trim()||e.name);
          return {actions:controls.map(action),forms:[...room.querySelectorAll('form')].map(e=>e.getAttribute('data-submitsend')),styles,clipped,overflow:room.scrollWidth>room.clientWidth+1,selected:[...room.querySelectorAll('[data-showdown-pro-tcg-selected]')].map(e=>getComputedStyle(e).backgroundColor),footer:room.querySelector('[data-showdown-pro-tcg-footer]')&&[...room.querySelectorAll('[data-showdown-pro-tcg-separator]')].every(e=>getComputedStyle(e).display==='none'),images:[...room.querySelectorAll('img')].map(e=>e.getAttribute('src'))};
        `);
        for (const width of [750, 430, 320]) {
          window.setContentSize(width, 1000);
          for (let i = 0; i < 20 && await evaluate('return innerWidth;') !== width; i++) await pause(50);
          await pause(100);
          for (const theme of ['light', 'dark', 'pro']) {
            await evaluate('document.documentElement.className=' + JSON.stringify((client === 'new' ? 'showdown-new-client ' : '') + (theme === 'light' ? '' : 'dark ') + (theme === 'pro' ? 'showdown-pro' : '')) + ';document.body.className=' + JSON.stringify(theme === 'light' ? '' : 'dark') + ';');
            const before = await snapshot();
            if (theme === 'light') await evaluate(enhancer);
            await pause(50);
            const after = await snapshot();
            assert.deepEqual(after.actions, before.actions, 'Preserve simulator commands and labels');
            assert.deepEqual(after.forms, before.forms, 'Preserve form commands');
            if (theme !== 'pro') assert.deepEqual(after.styles, before.styles, 'Native theme isolation');
            if (theme === 'pro') {
              assert.equal(after.overflow, false, page.id + ' horizontal overflow at ' + width);
              assert.deepEqual(after.clipped, [], page.id + ' controls exceed viewport at ' + width);
              assert.ok(after.selected.every(color => color === 'rgb(57, 122, 156)'), 'Selected format contrast');
              if (page.id.endsWith('-ptcg')) assert.equal(after.footer, true, 'Hide footer separators');
            }
            report.push({ client, page: page.id, width, theme, overflow: after.overflow, clipped: after.clipped });
            if (theme === 'pro' || theme === 'dark' && width === 750) {
              await evaluate('return Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise(resolve=>setTimeout(resolve,150))]);');
              await pause(150);
              fs.writeFileSync(path.join(out, client + '-' + page.id.replace('room-view-bot-unrealbot-', '') + '-' + theme + '-' + width + '.png'), (await wc.capturePage()).toPNG());
            }
          }
        }
      }
    }
    fs.writeFileSync(path.join(out, 'comparison.json'), JSON.stringify(report, null, 2));
    console.log('TCG: ' + report.length + ' page/client/width/theme checks passed');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
