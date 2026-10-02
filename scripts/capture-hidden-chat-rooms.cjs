const fs = require('node:fs');
const path = require('node:path');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use a temporary, unregistered guest in the isolated smoke profile. This does
// not log into the user's account or send chat messages or room commands.
module.exports = async (wc, root) => {
  const evaluate = code => wc.executeJavaScript('(()=>{' + code + '})()');
  const name = 'ProAudit' + Date.now().toString().slice(-10);
  const folder = path.join(root, 'test-results/chat-theme');
  const old = JSON.parse(fs.readFileSync(path.join(folder, 'rooms.json')));
  const pending = old.filter(room => room.status !== 'inspected');
  for (const client of ['old', 'new']) {
    if (client === 'new') {
      await evaluate('app.addPopup(OptionsPopup);');
      await wc.loadURL(await evaluate('return document.querySelector(".ps-popup a[href=\\"/newclient\\"]").href;'));
      for (let attempt = 0; attempt < 160; attempt++) {
        if (await evaluate('return !!window.PS?.roomTypes.chat;').catch(() => false)) break;
        await pause(250);
      }
    }
    await evaluate(client === 'old' ? 'app.user.rename(' + JSON.stringify(name) + ');' : 'PS.user.changeName(' + JSON.stringify(name) + ');');
    let named = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      named = await evaluate(client === 'old' ? 'return !!app.user.get("named");' : 'return !!PS.user.named;');
      if (named) break;
      await pause(250);
    }
    if (!named) throw new Error('Temporary guest name could not be selected');
    const file = path.join(folder, client === 'old' ? 'rooms.json' : 'new-rooms.json');
    const report = JSON.parse(fs.readFileSync(file));
    for (const room of pending) {
      await evaluate(client === 'old' ? 'app.joinRoom(' + JSON.stringify(room.id) + ');' : 'PS.join(' + JSON.stringify(room.id) + ');');
      let data;
      for (let attempt = 0; attempt < 32; attempt++) {
        await pause(250);
        data = await evaluate('const room=document.getElementById(' + JSON.stringify('room-' + room.id) + '),inner=room?.querySelector(".chat-log .inner");if(!inner?.querySelector(".infobox-roomintro"))return null;return {notices:[...inner.children].filter(e=>e.querySelector(".infobox,button,summary,img")).map(e=>e.outerHTML),composer:room.querySelector(".chat-log-add")?.outerHTML||""};');
        if (data) break;
      }
      const index = report.findIndex(entry => entry.id === room.id);
      if (data) report[index] = {...room, status: 'inspected', ...data};
      else report[index].diagnostic = await evaluate('return {text:document.getElementById(' + JSON.stringify('room-' + room.id) + ')?.textContent?.slice(0,1000)};');
      fs.writeFileSync(file, JSON.stringify(report, null, 2));
      console.log(client + ' ' + room.id + ': ' + (data ? 'captured' : 'unavailable'));
      await evaluate(client === 'old' ? 'app.leaveRoom(' + JSON.stringify(room.id) + ');app.closePopup();' : 'PS.leave(' + JSON.stringify(room.id) + ');PS.closePopupsAbove(null);');
    }
  }
};
