const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { BrowserWindow } = require('electron');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async root => {
  const out = path.join(root, 'test-results/chat-theme');
  const rooms = JSON.parse(fs.readFileSync(path.join(out, 'rooms.json'), 'utf8'));
  const upstream = ['oldclient.css', 'battle-log.css', 'battle.css'].map(file => fs.readFileSync(path.join(root, 'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style', file), 'utf8')).join('\n');
  const pro = '@scope (html.showdown-pro) {\n' + fs.readFileSync(path.join(root, 'app/client-theme.css'), 'utf8').replace(/\bhtml(?=[.,\s:#\[])/g, ':scope') + '\n}';
  const preview = new BrowserWindow({ width: 1000, height: 900, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, nodeIntegration: false, contextIsolation: true } });
  const wc = preview.webContents;
  const evaluate = source => wc.executeJavaScript(`(() => { ${source} })()`);
  const selector = '.chat-log button, .chat-log input, .chat-log select, .chat-log textarea, .chat-log a.button, .chat-log a[role="button"], .chat-log a[style*="background"], .chat-log a[style*="padding"], .chat-log summary, .chat-log-add button';
  const report = [];
  try {
    await preview.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html class="dark showdown-pro"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"><base href="https://play.pokemonshowdown.com/"><style>${upstream}\n${pro}</style></head><body><div class="ps-room ps-room-light" id="room-rooms" style="position:relative;inset:auto;height:100vh;overflow:auto"></div></body></html>`));
    await wc.insertCSS(pro, { cssOrigin: 'user' });
    wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('DOM.enable');
    await wc.debugger.sendCommand('CSS.enable');
    await evaluate(`document.querySelector('.ps-room').innerHTML = ${JSON.stringify(fs.readFileSync(path.join(out, 'directory.html'), 'utf8'))};`);
    for (const width of [1000, 550]) {
      preview.setContentSize(width, 900);
      await pause(350);
      fs.writeFileSync(path.join(out, `directory-${width}.png`), (await wc.capturePage()).toPNG());
      assert.equal(await evaluate("const r=document.querySelector('.ps-room'); return r.scrollWidth > r.clientWidth;"), false);
    }
    preview.setContentSize(1000, 900);
    for (const room of rooms.filter(r => r.status === 'inspected')) {
      await evaluate(`
        const root=document.querySelector('.ps-room'); root.id=${JSON.stringify('room-' + room.id)};
        root.innerHTML='<div class="chat-log"><div class="inner message-log"></div></div>' + ${JSON.stringify(room.composer || '')};
        root.querySelector('.inner').innerHTML=${JSON.stringify((room.notices || []).join(''))};
        root.querySelectorAll('details').forEach(el=>el.open=true);
        const extra=document.createElement('div'); extra.className='audit-additional-controls';
        const present=new Set([...root.querySelectorAll('button,a,summary,input,select')].map(el=>el.outerHTML));
        for(const control of ${JSON.stringify(room.controls || [])}) {
          if(!present.has(control.html)) { extra.insertAdjacentHTML('beforeend',control.html); present.add(control.html); }
        }
        root.querySelector('.inner').append(extra);
      `);
      const inspect = state => evaluate(`
        return [...document.querySelectorAll(${JSON.stringify(selector)})].map((el, index) => {
          const css=getComputedStyle(el);
          const art=el.style.backgroundImage.includes('url(');
          const transparent=el.style.background === 'transparent' || (el.style.backgroundColor === 'transparent' && !el.style.backgroundImage && (!el.textContent.trim() || el.style.position === 'absolute'));
          const disabled=el.matches(':disabled,.disabled,[aria-disabled="true"]');
          const field=el.matches('input:not([type]),input[type="text"],input[type="number"],input[type="search"],textarea,select');
          const themed=field ? css.backgroundColor === 'rgb(20, 44, 61)' : css.backgroundImage.includes('gradient') || (${JSON.stringify(state)} === 'active' && css.backgroundColor === 'rgb(27, 63, 86)');
          const issue=css.appearance !== 'none' ? 'native painting' : art && !css.backgroundImage.includes('url(') ? 'missing artwork' : transparent && (css.backgroundImage !== 'none' || css.backgroundColor !== 'rgba(0, 0, 0, 0)') ? 'opaque artwork hotspot' : !art && !transparent && !disabled && !themed ? 'missing themed surface' : ${JSON.stringify(state)} === 'focus-visible' && !disabled && parseFloat(css.outlineWidth) === 0 ? 'missing focus ring' : null;
          return {index, state:${JSON.stringify(state)}, tag:el.tagName, name:el.getAttribute('name'), text:el.textContent.trim().slice(0,70), art, transparent, issue, background:css.backgroundColor, image:css.backgroundImage, outline:css.outlineWidth};
        });
      `);
      const normal = await inspect('normal');
      const { root: dom } = await wc.debugger.sendCommand('DOM.getDocument');
      const { nodeIds } = await wc.debugger.sendCommand('DOM.querySelectorAll', { nodeId: dom.nodeId, selector });
      const states = [];
      for (const state of ['hover', 'active', 'focus-visible']) {
        await Promise.all(nodeIds.map(nodeId => wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] })));
        states.push(...await inspect(state));
      }
      await Promise.all(nodeIds.map(nodeId => wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })));
      report.push({id:room.id, controls:normal.length, images:normal.filter(c=>c.art).length, hotspots:normal.filter(c=>c.transparent).length, issues:[...normal,...states].filter(c=>c.issue)});
      if (['lobby','help','tournaments','boardgames','smogondoubles','capproject'].includes(room.id)) {
        await evaluate("document.querySelector('.audit-additional-controls').style.display='none';");
        await pause(500);
        fs.writeFileSync(path.join(out, `${room.id}.png`), (await wc.capturePage()).toPNG());
      }
      fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
      if (report.length % 20 === 0) console.log(`Verified ${report.length} rooms and ${report.reduce((n,r)=>n+r.controls,0)} controls`);
    }
    for (const theme of ['light','dark']) {
      await evaluate(`document.documentElement.className=${JSON.stringify(theme === 'dark' ? 'dark' : '')}; document.querySelector('.ps-room').id='room-rooms'; document.querySelector('.ps-room').innerHTML=${JSON.stringify(fs.readFileSync(path.join(out, 'directory.html'), 'utf8'))};`);
      assert.notEqual(await evaluate("return getComputedStyle(document.querySelector('#room-rooms .roomlist .blocklink')).backgroundColor;"), 'rgb(28, 53, 71)');
    }
    const issues=report.flatMap(r=>r.issues.map(i=>({room:r.id,...i})));
    console.log(JSON.stringify({rooms:report.length,controls:report.reduce((n,r)=>n+r.controls,0),issues:issues.length,unavailable:rooms.filter(r=>r.status!=='inspected').map(r=>r.title)}));
    assert.equal(issues.length,0,'See test-results/chat-theme/verification.json for unthemed controls');
  } finally { preview.destroy(); }
};
