const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { BrowserWindow } = require('electron');

module.exports = async (wc, root) => {
  const pages = {};
  for (const id of ['view-seasonladder-gen9randombattle', 'view-seasonladder']) {
    await wc.executeJavaScript(`OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}}); app.joinRoom('${id}'); true;`);
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const html = await wc.executeJavaScript(`app.rooms['${id}']?.el?.innerHTML || ''`);
      if (html.includes('<table') || (id === 'view-seasonladder' && html.includes('<h2') && html.includes('<a'))) {
        pages[id] = html;
        fs.writeFileSync(path.join(root, `test-results/${id}.html`), html);
        console.log(`${id}: received server markup (${html.length} characters)`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!pages[id]) throw new Error('Season page did not arrive: ' + id);
  }
  // Render snapshots of the actual server markup offscreen for visual review.
  // Scripts are not included, so this preview cannot submit account actions.
  const upstream = ['oldclient.css', 'battle-log.css'].map(file => fs.readFileSync(path.join(root, 'vendor/pokemon-showdown-client/play.pokemonshowdown.com/style', file), 'utf8')).join('\n');
  const pro = '@scope (html.showdown-pro) {\n' + fs.readFileSync(path.join(root, 'app/client-theme.css'), 'utf8').replace(/\bhtml(?=[.,\s:#\[])/g, ':scope') + '\n}';
  const preview = new BrowserWindow({ width: 1100, height: 900, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, nodeIntegration: false, contextIsolation: true } });
  try {
    for (const [id, html] of Object.entries(pages)) {
      const content = `<!doctype html><html class="dark showdown-pro"><head><meta charset="utf-8"><base href="https://play.pokemonshowdown.com/"><style>${upstream}\n${pro}</style></head><body><div class="ps-room ps-room-light" id="room-${id}" style="position:relative;inset:auto;height:100vh;overflow:auto">${html}</div></body></html>`;
      await preview.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(content));
      for (const width of [1100, 550]) {
        preview.setContentSize(width, 900);
        await new Promise(resolve => setTimeout(resolve, 400));
        const layout = await preview.webContents.executeJavaScript(`(() => {
          const room = document.querySelector('.ps-room');
          const cards = [...room.querySelectorAll('.ladder.pad')];
          return { overflow: room.scrollWidth > room.clientWidth, rows: room.querySelectorAll('td a').length,
            cards: cards.map(el => ({ width: el.clientWidth, tableWidth: el.querySelector('table').clientWidth, accent: getComputedStyle(el).borderTopColor })) };
        })()`);
        assert.equal(layout.overflow, false);
        if (id.endsWith('gen9randombattle')) {
          assert.equal(layout.cards.length, 3);
          for (const card of layout.cards) assert.ok(Math.abs(card.width - card.tableWidth) < 2);
          assert.equal(layout.cards[0].accent, 'rgb(239, 208, 120)');
        }
        const image = await preview.webContents.capturePage();
        fs.writeFileSync(path.join(root, `test-results/${id}-${width}.png`), image.toPNG());
        console.log(`${id} at ${width}px: ${layout.cards.length} medal panels, ${layout.rows} linked rows, no horizontal overflow`);
      }
      const native = await preview.webContents.executeJavaScript(`document.documentElement.classList.remove('showdown-pro'); getComputedStyle(document.querySelector('.ps-room > .pad')).display;`);
      assert.notEqual(native, 'grid');
    }
  } finally { preview.destroy(); }
  console.log('Season page layout and native theme isolation verified.');
};
