const keys = ['ditFontSize', 'ditTextColor', 'ditShowNicknames', 'ditShowBothUserTera'];
const form = document.getElementById('settings');
const status = document.getElementById('status');
const color = document.getElementById('ditTextColor');
const save = document.getElementById('save');
const fontSize = document.getElementById('ditFontSize');
const colorOpen = document.getElementById('color-open');
const picker = document.getElementById('color-picker');
const hexInput = document.getElementById('color-hex');
const colorApply = document.getElementById('color-apply');
const channels = ['red', 'green', 'blue'];
const palette = [...document.querySelectorAll('[data-color]')];
let customColor = false;
let pendingColor = '#e7f4fc';
function parseColor(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match ? '#' + match[1].toLowerCase() : null;
}
function updateColorPreview() {
  document.getElementById('color-swatch').style.backgroundColor = color.value;
  document.getElementById('color-value').textContent = color.value.toUpperCase();
}
function syncFontButtons() {
  for (const button of document.querySelectorAll('.number-stepper button')) {
    button.disabled = fontSize.disabled || (button.dataset.step === 'up' ? fontSize.valueAsNumber >= 13 : fontSize.valueAsNumber <= 10);
  }
}
for (const button of document.querySelectorAll('.number-stepper button')) {
  button.onclick = () => {
    if (fontSize.disabled) return;
    if (button.dataset.step === 'up') fontSize.stepUp();
    else fontSize.stepDown();
    fontSize.dispatchEvent(new Event('input', {bubbles: true}));
    fontSize.dispatchEvent(new Event('change', {bubbles: true}));
  };
}
fontSize.addEventListener('input', syncFontButtons);
fontSize.addEventListener('change', syncFontButtons);
function updatePicker(value, updateHex = true) {
  pendingColor = value;
  if (updateHex) hexInput.value = value.toUpperCase();
  hexInput.setAttribute('aria-invalid', 'false');
  colorApply.disabled = false;
  document.getElementById('picker-swatch').style.backgroundColor = value;
  const rgb = channels.map((_, index) => parseInt(value.slice(1 + index * 2, 3 + index * 2), 16));
  channels.forEach((channel, index) => {
    const input = document.getElementById('color-' + channel);
    input.value = rgb[index];
    document.getElementById(channel + '-value').value = rgb[index];
    const low = [...rgb], high = [...rgb]; low[index] = 0; high[index] = 255;
    input.style.setProperty('--channel-gradient', `linear-gradient(to right, rgb(${low.join(',')}), rgb(${high.join(',')}))`);
  });
  for (const button of palette) button.setAttribute('aria-pressed', String(button.dataset.color === value));
}
colorOpen.onclick = () => {
  updatePicker(parseColor(color.value) || '#e7f4fc');
  picker.showModal();
};
hexInput.oninput = () => {
  const parsed = parseColor(hexInput.value);
  if (parsed) updatePicker(parsed, false);
  else { hexInput.setAttribute('aria-invalid', 'true'); colorApply.disabled = true; }
};
for (const channel of channels) document.getElementById('color-' + channel).oninput = () => {
  updatePicker('#' + channels.map(name => Number(document.getElementById('color-' + name).value).toString(16).padStart(2, '0')).join(''));
};
for (const button of palette) {
  button.style.backgroundColor = button.dataset.color;
  button.style.color = button.dataset.color === '#222222' ? '#ffffff' : '#102331';
  button.onclick = () => updatePicker(button.dataset.color);
}
document.getElementById('color-cancel').onclick = () => picker.close();
colorApply.onclick = () => {
  color.value = pendingColor;
  color.dispatchEvent(new Event('input', {bubbles: true}));
  picker.close();
};
function defaultColor() {
  if (!customColor) color.value = ['pro', 'dark'].includes(document.documentElement.dataset.theme) ? '#e7f4fc' : '#222222';
  updateColorPreview();
}
new MutationObserver(defaultColor).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
color.addEventListener('input', () => { customColor = true; updateColorPreview(); });
document.getElementById('close').onclick = () => window.close();
async function initialize() {
  try {
    const saved = await chrome.storage.local.get(keys);
    fontSize.value = saved.ditFontSize ?? 11;
    customColor = /^#[0-9a-f]{6}$/i.test(saved.ditTextColor || '');
    if (customColor) color.value = saved.ditTextColor;
    else defaultColor();
    updateColorPreview();
    for (const key of ['ditShowNicknames', 'ditShowBothUserTera']) document.getElementById(key).checked = saved[key] === true;
    for (const key of keys) document.getElementById(key).disabled = false;
    syncFontButtons();
    colorOpen.disabled = false;
    save.disabled = false;
  } catch {
    status.textContent = 'Could not load settings. Close this window and try again.';
    status.dataset.error = 'true';
  }
  document.documentElement.dataset.settingsReady = 'true';
}
form.onsubmit = async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  save.disabled = true;
  const values = {ditFontSize: document.getElementById('ditFontSize').value, ditTextColor: color.value, ditShowNicknames: document.getElementById('ditShowNicknames').checked, ditShowBothUserTera: document.getElementById('ditShowBothUserTera').checked};
  try {
    await chrome.storage.local.set(values);
    customColor = true;
    status.textContent = 'Saved. Applies to new battles.';
    status.dataset.error = 'false';
  } catch {
    status.textContent = 'Could not save. Please try again.';
    status.dataset.error = 'true';
  } finally { save.disabled = false; }
};
void initialize();
