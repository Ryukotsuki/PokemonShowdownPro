const fs = require('node:fs');
const path = require('node:path');
const { addonDefaults } = require('./addon-catalog.cjs');
const messageDefaults = { startEnabled: false, startText: '', endEnabled: false, endText: '' };
const sidebarTabs = ['battle', 'addons', 'messages', 'history'];
const defaults = { autoStartTimer: false, saveWinningReplays: false, saveLosingReplays: false, showdexEnabled: true, autoUpdateAddons: true, recentReplays: [], sidebarCollapsed: false, sidebarTab: 'battle', messages: messageDefaults, addons: addonDefaults };
const validMessageText = text => typeof text === 'string' && text.length <= 280 && !/[\x00-\x1f\x7f\u0085\u2028\u2029]/.test(text) && !text.trimStart().startsWith('/');
const validMessages = value => value && ['start','end'].every(phase => typeof value[phase+'Enabled'] === 'boolean' && validMessageText(value[phase+'Text']) && (!value[phase+'Enabled'] || !!value[phase+'Text'].trim()));
const shouldUploadReplay = (settings, outcome) => outcome === 'win' ? settings.saveWinningReplays === true : outcome === 'loss' ? settings.saveLosingReplays === true : false;
const replayUrl = url => typeof url === 'string' && /^https:\/\/replay\.pokemonshowdown\.com\/[a-z0-9-]+$/.test(url);
function normalize(saved = {}) {
  if (!saved || typeof saved !== 'object') saved = {};
  return {
    autoStartTimer: saved.autoStartTimer === true,
    saveWinningReplays: saved.saveWinningReplays === true,
    saveLosingReplays: saved.saveLosingReplays === true,
    showdexEnabled: saved.showdexEnabled !== false,
    autoUpdateAddons: saved.autoUpdateAddons !== false,
    addons: Object.fromEntries(Object.entries(addonDefaults).map(([key,value]) => [key, typeof saved.addons?.[key] === 'boolean' ? saved.addons[key] : value])),
    recentReplays: Array.isArray(saved.recentReplays) ? saved.recentReplays.filter(item => replayUrl(item?.url) && typeof item.title === 'string').slice(0,20) : [],
    sidebarCollapsed: saved.sidebarCollapsed === true,
    sidebarTab: sidebarTabs.includes(saved.sidebarTab) ? saved.sidebarTab : 'battle',
    messages: validMessages(saved.messages) ? { ...saved.messages } : { ...messageDefaults },
  };
}
function loadPreferences(file) {
  try { return normalize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return normalize(); }
}
function savePreferences(file, preferences) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(normalize(preferences), null, 2));
  fs.renameSync(temporary, file);
}
function addReplay(preferences, replay) {
  if (!replayUrl(replay.url)) throw new Error('Invalid replay URL');
  preferences.recentReplays = [replay, ...preferences.recentReplays.filter(item => item.url !== replay.url)].slice(0,20);
}
module.exports = { defaults, replayUrl, validMessageText, validMessages, sidebarTabs, shouldUploadReplay, loadPreferences, savePreferences, addReplay };
