const keys = ['enabled', 'show-item', 'show-tera', 'import-code'];
const status = document.getElementById('status');
const previous = {};
document.getElementById('close').onclick = () => window.close();
async function initialize() {
  try {
    const saved = await chrome.storage.local.get(keys);
    for (const key of keys) {
      const input = document.getElementById(key);
      const valid = key === 'show-tera' ? ['0', '1', '2'] : ['0', '1'];
      previous[key] = valid.includes(saved[key]) ? saved[key] : '1';
      if (input.type === 'checkbox') input.checked = previous[key] === '1';
      else input.value = previous[key];
      input.disabled = false;
      input.onchange = async () => {
        const value = input.type === 'checkbox' ? (input.checked ? '1' : '0') : input.value;
        input.disabled = true;
        try {
          await chrome.storage.local.set({[key]: value});
          previous[key] = value;
          status.textContent = 'Saved. Reload Showdown to apply.';
          status.dataset.error = 'false';
        } catch {
          if (input.type === 'checkbox') input.checked = previous[key] === '1';
          else input.value = previous[key];
          status.textContent = 'Could not save. Please try again.';
          status.dataset.error = 'true';
        } finally { input.disabled = false; }
      };
    }
  } catch {
    status.textContent = 'Could not load settings. Close this window and try again.';
    status.dataset.error = 'true';
  }
  document.documentElement.dataset.settingsReady = 'true';
}
void initialize();
