const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Native HTML-page joins expose previews to a named guest. Use only the
// isolated smoke profile; no private messages, games, or saved decks.
module.exports = async (wc, root) => {
  const out = path.join(root, 'test-results/tcg-theme');
  fs.mkdirSync(out, { recursive: true });
  const evaluate = code => wc.executeJavaScript('(()=>{' + code + '})()');
  const name = 'ProAudit' + Date.now().toString().slice(-10);
  const pages = ['ptcg', 'ptcgdeck', 'ptcgrankings', 'ptcgnotes', 'ptcgabout', 'ptcgfaq', 'ptcgcredits'];
  for (const client of ['old', 'new']) {
    if (client === 'new') {
      await evaluate('app.addPopup(OptionsPopup);');
      await wc.loadURL(await evaluate('return document.querySelector(".ps-popup a[href=\\"/newclient\\"]").href;'));
      for (let i = 0; i < 160; i++) {
        if (await evaluate('return !!window.PS?.roomTypes.html && !!window.__showdownProTheme;').catch(() => false)) break;
        await pause(250);
      }
    }
    await evaluate(client === 'old' ? 'app.user.rename(' + JSON.stringify(name) + ');' : 'PS.user.changeName(' + JSON.stringify(name) + ');');
    for (let i = 0; i < 80; i++) {
      if (await evaluate(client === 'old' ? 'return !!app.user.get("named");' : 'return !!PS.user.named;')) break;
      await pause(250);
    }
    const report = [];
    for (const page of pages) {
      const id = 'view-bot-unrealbot-' + page;
      await evaluate((client === 'old' ? 'app.joinRoom(' : 'PS.join(') + JSON.stringify(id) + ');');
      let data;
      for (let i = 0; i < 24; i++) {
        await pause(250);
        data = await evaluate('const e=document.getElementById(' + JSON.stringify('room-' + id) + ');if(!e?.querySelector("button,select,form"))return null;return {id:e.id,html:e.outerHTML};');
        if (data) break;
      }
      report.push(data || { id: 'room-' + id, unavailable: true });
      console.log(client + ' ' + page + ': ' + (data ? data.html.length + ' bytes' : 'unavailable'));
      fs.writeFileSync(path.join(out, client + '-pages.json'), JSON.stringify(report, null, 2));
      await evaluate((client === 'old' ? 'app.leaveRoom(' : 'PS.leave(') + JSON.stringify(id) + ');');
    }
  }
};
