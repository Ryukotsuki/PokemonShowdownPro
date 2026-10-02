const fs = require('node:fs');
const path = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async (wc, root) => {
  if (process.argv.includes('--capture-tcg')) return require('./capture-tcg.cjs')(wc, root);
  if (process.argv.includes('--capture-hidden-rooms')) return require('./capture-hidden-chat-rooms.cjs')(wc, root);
  if (process.argv.includes('--new-chat-layouts')) return require('./audit-new-chat-rooms.cjs')(wc,root);
  const out = path.join(root, 'test-results/chat-theme');
  fs.mkdirSync(out, { recursive: true });
  if (process.argv.includes('--cached-rooms')) return require(process.argv.includes('--room-layouts') ? './audit-chat-layouts.cjs' : './verify-chat-theme.cjs')(root);
  const evaluate = source => wc.executeJavaScript(`(() => { ${source} })()`);
  if (process.argv.includes('--retry-rooms')) {
    const report = JSON.parse(fs.readFileSync(path.join(out, 'rooms.json'), 'utf8'));
    for (const room of report.filter(r => r.status !== 'inspected')) {
      await evaluate(`app.joinRoom(${JSON.stringify(room.id)});`);
      await delay(5000);
      room.diagnostic = await evaluate(`const room=app.rooms[${JSON.stringify(room.id)}]; return {exists:!!room, text:room?.el?.textContent?.slice(0,1500), html:room?.el?.innerHTML?.slice(0,4000), popups:app.popups?.map(p=>p.el?.textContent)};`);
      console.log(room.id, JSON.stringify(room.diagnostic));
      await evaluate(`if(app.rooms[${JSON.stringify(room.id)}]) app.leaveRoom(${JSON.stringify(room.id)}); app.closePopup();`);
    }
    fs.writeFileSync(path.join(out, 'rooms.json'), JSON.stringify(report,null,2));
    return;
  }
  await evaluate("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}}); app.addRoom('rooms'); app.send('/cmd rooms');");
  let rooms;
  for (let attempt = 0; attempt < 100; attempt++) {
    rooms = await evaluate(`
      if (!app.roomsData?.chat?.length) return null;
      const source = [...(app.roomsData.official || []), ...(app.roomsData.pspl || []), ...app.roomsData.chat];
      return [...new Map(source.flatMap(room => [room, ...(room.subRooms || []).map(title => ({title}))]).map(room => [toID(room.title), {id:toID(room.title),title:room.title,privacy:room.privacy}])).values()];
    `);
    if (rooms) break;
    await delay(200);
  }
  if (!rooms) throw new Error('Public room directory did not load');
  await evaluate("app.rooms.rooms.showMoreRooms = true; app.rooms.rooms.updateRoomList();");
  fs.writeFileSync(path.join(out, 'directory.html'), await evaluate("return app.rooms.rooms.el.innerHTML;"));
  const report = [];
  for (const room of rooms) {
    await evaluate(`app.joinRoom(${JSON.stringify(room.id)});`);
    let data;
    for (let attempt = 0; attempt < 16; attempt++) {
      await delay(250);
      data = await evaluate(`
        const room = app.rooms[${JSON.stringify(room.id)}];
        if (!room?.el?.querySelector('.chat-log .inner') || !room.userList) return null;
        const inner = room.el.querySelector('.chat-log .inner');
        if (!inner.children.length) return null;
        const notices = [...inner.children].filter(el => el.classList.contains('notice') && (el.querySelector('button,a,summary,input,select') || el.querySelector('img'))).map(el => el.outerHTML);
        const controls = [...room.el.querySelectorAll('button, a.button, a.ilink, summary, input, select')].filter(el => !el.closest('.userlist')).map(el => {
          const css = getComputedStyle(el);
          return {html:el.outerHTML,background:css.backgroundColor,image:css.backgroundImage,color:css.color,appearance:css.appearance};
        });
        return { notices, controls, composer: room.el.querySelector('.chat-log-add')?.outerHTML || '' };
      `);
      if (data) break;
    }
    report.push({...room, status:data ? 'inspected' : 'unavailable', ...data});
    if (!data) report[report.length-1].diagnostic = await evaluate(`const room=app.rooms[${JSON.stringify(room.id)}]; return {text:room?.el?.textContent?.slice(0,1000),popups:app.popups?.map(p=>p.el?.textContent)};`);
    await evaluate(`if (app.rooms[${JSON.stringify(room.id)}]) app.leaveRoom(${JSON.stringify(room.id)}); app.closePopup();`);
    await delay(800);
    fs.writeFileSync(path.join(out, 'rooms.json'), JSON.stringify(report, null, 2));
    if (report.length % 10 === 0 || report.length === rooms.length) console.log(`Inspected ${report.length}/${rooms.length} rooms; ${report.filter(r => r.status === 'unavailable').length} unavailable`);
  }
  console.log('Room control inventory saved to test-results/chat-theme/rooms.json');
  if (process.argv.includes('--room-layouts')) return require('./audit-chat-layouts.cjs')(root);
  await require('./verify-chat-theme.cjs')(root);
};
