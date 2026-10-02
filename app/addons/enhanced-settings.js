const stats = document.getElementById('stats');
const status = document.getElementById('status');
document.getElementById('close').onclick = () => window.close();
async function initialize() {
  try {
    const saved = await chrome.storage.local.get('showBaseStats');
    stats.checked = saved.showBaseStats === 'ON';
    stats.disabled = false;
  } catch {
    status.textContent = 'Could not load settings. Close this window and try again.';
    status.dataset.error = 'true';
  }
  document.documentElement.dataset.settingsReady = 'true';
}
stats.onchange = async () => {
  stats.disabled = true;
  try {
    await chrome.storage.local.set({showBaseStats: stats.checked ? 'ON' : 'OFF'});
    status.textContent = 'Saved. Applies to the next tooltip.';
    status.dataset.error = 'false';
  } catch {
    stats.checked = !stats.checked;
    status.textContent = 'Could not save. Please try again.';
    status.dataset.error = 'true';
  } finally {
    stats.disabled = false;
  }
};
void initialize();
