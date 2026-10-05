const MIN_ZOOM = 50, MAX_ZOOM = 200, ZOOM_STEP = 5;
const validZoomPercent = value => Number.isInteger(value) && value >= MIN_ZOOM && value <= MAX_ZOOM && value % ZOOM_STEP === 0;
function nextZoomPercent(value, action) {
  if (!['in', 'out', 'reset'].includes(action)) throw new Error('Invalid zoom action.');
  const current = validZoomPercent(value) ? value : 100;
  return action === 'reset' ? 100 : Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current + (action === 'in' ? ZOOM_STEP : -ZOOM_STEP)));
}
const showdexZoomCSS = `
[data-showdex-module] { zoom: var(--showdown-pro-showdex-zoom, 1) !important; }
[class*="Tooltip-module-container-"] { zoom: var(--showdown-pro-showdex-zoom, 1); }
`;
function applyClientZoom(contents, settings) {
  if(contents.isDestroyed()) return;
  contents.setZoomFactor(settings.clientZoomPercent / 100);
  contents.send('client:zoom-state', {clientZoomPercent:settings.clientZoomPercent,showdexZoomPercent:settings.showdexZoomPercent});
}
function bindClientZoom(contents, getZoom, getShowdexZoom = getZoom) {
  // Isolate the client's scaling from the Hub and other windows.
  contents.setZoomMode('isolated');
  const apply = () => applyClientZoom(contents,{clientZoomPercent:getZoom(),showdexZoomPercent:getShowdexZoom()});
  contents.on('did-finish-load', apply);
  apply();
}
module.exports = { MIN_ZOOM, MAX_ZOOM, validZoomPercent, nextZoomPercent, bindClientZoom, applyClientZoom, showdexZoomCSS };
