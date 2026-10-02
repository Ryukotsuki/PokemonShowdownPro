const { WebContentsView } = require('electron');

// A separate overlay keeps the tooltip above the native Showdown view, even
// when the sidebar is only 48px wide.
async function createHubTooltip(window) {
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  view.setBackgroundColor('#00000000');
  view.setVisible(false);
  window.contentView.addChildView(view);
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', event => event.preventDefault());
  await view.webContents.loadURL('showdown-pro://app/hub-tooltip.html');
  let revision = 0, current = null;
  const hide = () => { revision++; current = null; view.setVisible(false); };
  const show = async ({ collapsed, theme, top, label = collapsed ? 'Expand Battle Hub' : 'Collapse Battle Hub' }) => {
    const [width, height] = window.getContentSize();
    if (!Number.isFinite(top) || top < 0 || top > height) return hide();
    const palette = ['pro', 'light', 'dark'].includes(theme) ? theme : 'light';
    const key = JSON.stringify([label, palette, top, collapsed, width, height]);
    if (key === current) return;
    current = key;
    const request = ++revision;
    // Leave the rail clear so a tooltip never blocks its next control.
    const rightInset = collapsed ? 56 : 8;
    const tipWidth = Math.min(label.length > 30 ? 292 : 180, width - rightInset - 8);
    const left = width - tipWidth - rightInset;
    view.setBounds({ x: left, y: Math.max(8, Math.min(height - 40, Math.round(top + 8))), width: tipWidth, height: 40 });
    await view.webContents.executeJavaScript(`document.documentElement.dataset.theme=${JSON.stringify(palette)}; document.getElementById('label').textContent=${JSON.stringify(label)}; true;`);
    const tipHeight = await view.webContents.executeJavaScript("Math.ceil(document.getElementById('label').getBoundingClientRect().height) + 4");
    if (request === revision) {
      view.setBounds({ x: left, y: Math.max(8, Math.min(height - tipHeight - 8, Math.round(top + 8))), width: tipWidth, height: tipHeight });
      view.setVisible(true);
    }
  };
  window.on('blur', hide);
  return { view, show, hide, destroy: () => { revision++; if (!view.webContents.isDestroyed()) view.webContents.close(); } };
}

module.exports = { createHubTooltip };
