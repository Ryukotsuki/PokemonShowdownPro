const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { history } = require('../tests/fixtures.cjs');

// Uses the isolated smoke profile. No team edits or account actions reach the server.
module.exports = async (wc, root) => {
  if (process.argv.includes('--dropdown-controls')) return require('./audit-dropdown-controls.cjs')(wc, root);
  if (process.argv.includes('--navigation-only')) return require('./audit-navigation.cjs')(wc, root);
  if (process.argv.includes('--formats-only')) return require('./audit-formats.cjs')(wc, root);
  if (process.argv.includes('--hover-only')) return require('./audit-hover.cjs')(wc, root);
  if (process.argv.includes('--new-surfaces')) return require('./audit-new-client-surfaces.cjs')(wc, root);
  if (process.argv.includes('--new-client')) return require('./audit-new-client.cjs')(wc, root);
  if (process.argv.includes('--showdex-only')) return require('./audit-showdex.cjs')(wc, root);
  if (process.argv.includes('--builder-only')) return require('./audit-builder.cjs')(wc, root);
  if (process.argv.includes('--ladder-only')) return require('./audit-ladder.cjs')(wc, root);
  if (process.argv.includes('--tournaments-only')) return require('./audit-tournaments.cjs')(wc, root);
  if (process.argv.includes('--chat-rooms')) return require('./audit-chat-rooms.cjs')(wc, root);
  if (process.argv.includes('--seasons-only')) return require('./audit-seasons.cjs')(wc, root);
  const out = path.join(root, 'test-results/theme-audit');
  fs.mkdirSync(out, { recursive: true });
  const evaluate = source => wc.executeJavaScript(`(async () => { ${source} })()`);
  const report = [];
  let captureAvailable = process.argv.includes('--visible');
  wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('DOM.enable');
  await wc.debugger.sendCommand('CSS.enable');
  await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}}); app.socket.send = () => {}; window.__showdownPro.setAutoTimer(false);");
  const snapshot = async name => {
    const result = await evaluate(`
      const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight && s.visibility !== 'hidden' && s.display !== 'none'; };
      const grey = value => { const n = value.match(/[\\d.]+/g)?.map(Number); return n && n.length >= 3 && (n.length < 4 || n[3] > .2) && n[0] > 35 && Math.max(...n.slice(0,3)) - Math.min(...n.slice(0,3)) < 10; };
      const seen = new Set();
      const remaining = [...document.querySelectorAll('.header *, .ps-popup *, .ps-room *')].filter(visible).flatMap(el => {
        if (el.closest('[data-showdex-scheme]') || el.matches('img, svg, svg *, .picon, .pokemonicon, .trainer, .backdrop, .hp, .statgraph span')) return [];
        const s = getComputedStyle(el);
        const colors = s.backgroundImage.match(/rgba?\\([^)]+\\)/g) || [];
        if (!grey(s.backgroundColor) && !(colors.length && colors.every(grey))) return [];
        const key = el.tagName + '.' + el.className + ':' + s.backgroundColor + ':' + s.backgroundImage;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ tag: el.tagName, class: el.className, name: el.getAttribute('name'), text: el.textContent.slice(0,80), background: s.backgroundColor, image: s.backgroundImage }];
      });
      const nativeControls = [...document.querySelectorAll('.header button, .ps-popup button, .ps-room button, .ps-popup input:is([type=checkbox],[type=radio],[type=range]), .ps-room input:is([type=checkbox],[type=radio],[type=range])')]
        .filter(visible).filter(el => !el.closest('[data-showdex-scheme]') && ['button', 'auto', 'checkbox', 'radio', 'slider-horizontal'].includes(getComputedStyle(el).appearance))
        .map(el => ({ tag: el.tagName, class: el.className, name: el.name, appearance: getComputedStyle(el).appearance }));
      return { name: ${JSON.stringify(name)}, remaining, nativeControls };
    `);
    report.push(result);
    console.log(`${name}: ${result.remaining.length} neutral surfaces, ${result.nativeControls.length} native controls to review`);
    try {
      if (captureAvailable) {
        const { data } = await Promise.race([
          wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }),
          new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Display surface did not render')), 3000); timer.unref(); }),
        ]);
        fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(data, 'base64'));
      }
    } catch (error) { captureAvailable = false; console.log('Screenshot unavailable:', error.message); }
    fs.writeFileSync(path.join(out, 'audit.json'), JSON.stringify(report, null, 2));
  };
  await snapshot('home');
  for (const [name, popup] of [['settings', 'OptionsPopup'], ['sound', 'SoundsPopup'], ['avatars', 'AvatarsPopup'], ['background', 'CustomBackgroundPopup'], ['formatting', 'FormattingPopup'], ['login', 'LoginPopup']]) {
    await evaluate(`app.addPopup(window[${JSON.stringify(popup)}], {type:'semimodal'});`);
    await snapshot(name);
    if (name === 'settings') {
      await evaluate("document.querySelector('.ps-popup button[name=editstatus]').click();");
      const status = await evaluate("const input = document.querySelector('.ps-popup input[name=statustext]'); if (!input) throw new Error('Status editor did not open'); return getComputedStyle(input).backgroundColor;");
      assert.equal(status, 'rgb(20, 44, 61)');
      await snapshot('status-editing');
      const { root: statusDOM } = await wc.debugger.sendCommand('DOM.getDocument');
      const { nodeId: statusNode } = await wc.debugger.sendCommand('DOM.querySelector', { nodeId: statusDOM.nodeId, selector: '.ps-popup input[name=statustext]' });
      await wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId: statusNode, forcedPseudoClasses: ['focus', 'focus-visible'] });
      assert.equal(await evaluate("return getComputedStyle(document.querySelector('.ps-popup input[name=statustext]')).outlineWidth;"), '2px');
      await snapshot('status-focused');
      await wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId: statusNode, forcedPseudoClasses: [] });
    }
    if (name === 'avatars') {
      const selector = '.ps-popup .avatarlist button.option:not(.cur)';
      const sprite = await evaluate(`return getComputedStyle(document.querySelector(${JSON.stringify(selector)})).backgroundImage;`);
      assert.match(sprite, /trainers-sheet/);
      const { root: avatarDOM } = await wc.debugger.sendCommand('DOM.getDocument');
      const { nodeId: avatarNode } = await wc.debugger.sendCommand('DOM.querySelector', { nodeId: avatarDOM.nodeId, selector });
      for (const state of ['hover', 'focus-visible']) {
        await wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId: avatarNode, forcedPseudoClasses: [state] });
        const tile = await evaluate(`const css = getComputedStyle(document.querySelector(${JSON.stringify(selector)})); return { image: css.backgroundImage, background: css.backgroundColor };`);
        assert.equal(tile.image, sprite);
        assert.equal(tile.background, 'rgb(37, 77, 101)');
        await snapshot(`avatar-${state}`);
      }
      await wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId: avatarNode, forcedPseudoClasses: [] });
      const selected = await evaluate(`const button = document.querySelector(${JSON.stringify(selector)}); button.classList.add('cur'); const css = getComputedStyle(button); return { image: css.backgroundImage, background: css.backgroundColor, width: css.width, height: css.height };`);
      assert.equal(selected.image, sprite);
      assert.equal(selected.background, 'rgb(44, 94, 123)');
      assert.equal(selected.width, '80px');
      assert.equal(selected.height, '80px');
      await snapshot('avatar-selected');
    }
    await evaluate('app.closePopup();');
  }
  await evaluate("document.querySelector('.menugroup button[name=format]').click();");
  await snapshot('formats');
  await evaluate("app.closePopup(); app.addRoom('teambuilder'); app.focusRoom('teambuilder');");
  await snapshot('teams');
  await evaluate(`
    const room = app.rooms.teambuilder;
    room.curTeam = {name:'Theme audit',format:'gen9ou',capacity:6,team:'',folder:'',gen:9,dex:Dex.forGen(9)};
    room.curSetList = [{name:'',species:'Alomomola',item:'',ability:'Healer',nature:'',teraType:'Water',level:100,evs:{},ivs:{},moves:[]}];
    room.formatResources ||= {};
    room.updateTeamView();
  `);
  await snapshot('team-editor');
  for (const chart of ['pokemon', 'details', 'stats', 'move', 'item', 'ability']) {
    await evaluate(`
      const room = app.rooms.teambuilder;
      room.curSet = room.curSetList[0]; room.curSetLoc = 0; room.updateSetView();
      room.curChartType = ${JSON.stringify(chart)}; room.curChartName = ${JSON.stringify(chart === 'move' ? 'move1' : chart)};
      room.updateChart(true);
    `);
    await snapshot(`pokemon-${chart}`);
  }
  await evaluate("app.rooms.teambuilder.curTeam = null; app.rooms.teambuilder.curSet = null; app.removeRoom('teambuilder', true);");
  for (const room of ['ladder', 'battles', 'rooms', 'resources']) {
    await evaluate(`app.addRoom(${JSON.stringify(room)}); app.focusRoom(${JSON.stringify(room)});`);
    await snapshot(room);
  }
  const battleId = 'battle-gen9randombattle-123';
  await evaluate(`app.receive(${JSON.stringify('>' + battleId + '\n' + history().join('\n'))}); app.focusRoom(${JSON.stringify(battleId)});`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  await snapshot('battle');
  await evaluate(`document.querySelector('#room-${battleId} button[name=openTimer]')?.click();`);
  await snapshot('battle-timer');
  await evaluate('app.closePopup();');
  // Exercise the native hover/focus/disabled/checked states in Chromium.
  await evaluate('app.addPopup(OptionsPopup);');
  const { root: dom } = await wc.debugger.sendCommand('DOM.getDocument');
  const { nodeId } = await wc.debugger.sendCommand('DOM.querySelector', { nodeId: dom.nodeId, selector: '.ps-popup button.button' });
  for (const state of ['hover', 'focus-visible', 'active']) {
    await wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] });
    await snapshot(`settings-${state}`);
  }
  await wc.debugger.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  const controls = await evaluate(`
    const button = document.querySelector('.ps-popup button.button'); button.disabled = true;
    const checkbox = document.querySelector('.ps-popup input[type=checkbox]'); checkbox.checked = true;
    return { disabled: getComputedStyle(button).backgroundColor, check: getComputedStyle(checkbox, '::after').content };
  `);
  assert.equal(controls.disabled, 'rgb(32, 55, 70)');
  assert.notEqual(controls.check, 'none');
  await snapshot('settings-disabled-checked');
  await evaluate('app.closePopup();');
  for (const theme of ['light', 'dark', 'pro']) {
    const sample = await evaluate(`
      OptionsPopup.prototype.setTheme({currentTarget:{value:${JSON.stringify(theme)}}});
      app.addPopup(OptionsPopup);
      const checkbox = document.querySelector('.ps-popup input[type=checkbox]');
      const button = document.querySelector('.ps-popup button.button');
      const sample = { checkbox: getComputedStyle(checkbox).appearance, button: getComputedStyle(button).appearance, background: getComputedStyle(button).backgroundColor };
      app.closePopup(); return sample;
    `);
    if (theme === 'pro') {
      assert.equal(sample.checkbox, 'none');
      assert.equal(sample.button, 'none');
      assert.equal(sample.background, 'rgb(41, 75, 97)');
    } else {
      assert.notEqual(sample.checkbox, 'none');
      assert.notEqual(sample.background, 'rgb(41, 75, 97)');
    }
  }
  wc.debugger.detach();
  assert.equal(report.flatMap(screen => screen.remaining).length, 0, 'Neutral surfaces remain; see theme-audit/audit.json');
  assert.equal(report.flatMap(screen => screen.nativeControls).length, 0, 'Native control painting remains; see theme-audit/audit.json');
  console.log('Theme isolation and native-control regression checks passed.');
};
