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
  ditWatchTeraLayout(room);
}

// A hidden room reports zero trainer height. Keep its cards unpainted until
// layout is available, then update without waiting for another Tera event.
var ditTeraLayouts = new Map();
var ditTeraCleanup;
function ditPositionTeraCards(room) {
  for (const card of room.querySelectorAll('.ditTeraInfo')) {
    const you = card.dataset.side === 'you';
    const trainer = room.querySelector('.innerbattle ' + getUserBar(you) + ' .trainer');
    const height = trainer?.offsetHeight;
    if (!height) { card.style.visibility = 'hidden'; continue; }
    const offset = (height + 45) + 'px';
    card.style.top = you ? 'auto' : offset;
    card.style.bottom = you ? offset : 'auto';
    card.style.visibility = '';
  }
}
function ditWatchTeraLayout(room) {
  if (typeof ResizeObserver !== 'function') return;
  const existing = ditTeraLayouts.get(room);
  if (existing) { existing.refresh(); return; }
  let watched = new Set();
  const sizes = new ResizeObserver(() => ditPositionTeraCards(room));
  const dispose = () => {
    sizes.disconnect(); changes.disconnect(); ditTeraLayouts.delete(room);
    if (!ditTeraLayouts.size) { ditTeraCleanup?.disconnect(); ditTeraCleanup = null; }
  };
  const refresh = () => {
    if (!room.isConnected || !room.querySelector('.ditTeraInfo')) { dispose(); return; }
    // Showdown replaces trainer elements after switches and team updates.
    const targets = new Set([room, ...room.querySelectorAll('.innerbattle, .leftbar .trainer, .rightbar .trainer')]);
    for (const target of watched) if (!targets.has(target)) sizes.unobserve(target);
    for (const target of targets) if (!watched.has(target)) sizes.observe(target);
    watched = targets;
    ditPositionTeraCards(room);
  };
  const changes = new MutationObserver(records => {
    // Ignore battle-log and animation changes; only sidebar/card replacement
    // requires observing new layout elements.
    const selector = '.innerbattle, .leftbar, .rightbar, .trainer, .ditTeraInfo';
    if (records.some(record => record.target.closest?.('.leftbar, .rightbar') ||
      [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches(selector) || node.querySelector(selector))))) refresh();
  });
  changes.observe(room, {childList: true, subtree: true});
  ditTeraLayouts.set(room, {refresh, dispose});
  if (!ditTeraCleanup) {
    ditTeraCleanup = new MutationObserver(records => {
      if (records.some(record => record.removedNodes.length)) {
        for (const [battle, layout] of ditTeraLayouts) if (!battle.isConnected) layout.dispose();
      }
    });
    ditTeraCleanup.observe(document.body, {childList: true, subtree: true});
  }
  refresh();
}
