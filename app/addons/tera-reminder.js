// Compatibility overrides for the upstream DOM observer in both clients.
function ditSpeciesGroups(text) {
  return [...text.matchAll(/\(([^()]*)\)/g)].map(match => match[1].trim()).filter(value =>
    value && !value.split('|').every(part => /^(?:active|fainted|par|slp|tox|psn|frz|brn|m|f|\d+(?:\.\d+)?%)$/i.test(part.trim()))
  );
}
function ditCleanSpecies(text) {
  return text.trim().replace(/^[()\s]+|[()\s]+$/g, '');
}
function getPkmnName(value, currentUser, showNickname, room) {
  // Native battle logs wrap the entire Tera announcement in parentheses.
  const announcement = value.trim();
  let name = beforeMarker(announcement.startsWith('(') && announcement.endsWith(')') ? announcement.slice(1, -1) : announcement, ' has Terastallized').trim();
  if (!currentUser && name.startsWith('The opposing ')) name = name.slice('The opposing '.length);
  if (showNickname) return name;
  return findRealPkmnName(name, currentUser, room);
}
function findRealPkmnName(name, currentUser, room = document) {
  const labels = [...room.querySelectorAll(getUserBar(currentUser) + ' .trainer .teamicons span.picon[aria-label]')].map(icon => icon.getAttribute('aria-label'));
  // Compare strings rather than putting nicknames (including quotes) in CSS.
  const matching = labels.find(label => label === name || label.startsWith(name + ' ('));
  const species = ditSpeciesGroups(matching || name).at(-1);
  return ditCleanSpecies(species || name);
}
function getTeraInfo(room, name, type, fontSize, textColor, currentUser) {
  const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const size = Math.max(10, Math.min(13, Number(fontSize) || 11));
  const color = /^#[0-9a-f]{6}$/i.test(textColor || '') ? `--dit-text-color:${textColor};` : '';
  return `<div class="ditTeraInfo" data-side="${currentUser ? 'you' : 'opponent'}" role="note" aria-label="${currentUser ? 'Your' : "Opponent's"} Terastallization" style="${getStyleForUser(room, currentUser)};font-size:${size}px;${color}">
    <span class="ditTeraLabel">Tera</span>
    <strong class="ditPokemonName">${escape(name)}</strong>
    <span class="ditTeraType"><span class="ditTypeLabel">Type</span> ${escape(type)}</span>
    <button class="ditCloseInfo" type="button" aria-label="Dismiss ${currentUser ? 'your' : "opponent's"} Tera reminder">×</button>
  </div>`;
}
function appendTeraInfo(room, markup, currentUser) {
  const bar = room.querySelector('.innerbattle ' + getUserBar(currentUser));
  if (!bar) return;
  room.querySelector('.ditTeraInfo[data-side="' + (currentUser ? 'you' : 'opponent') + '"]')?.remove();
  bar.insertAdjacentHTML('afterend', markup);
}
