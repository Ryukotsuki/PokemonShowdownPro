const $ = id => document.getElementById(id);
let messagesDirty=false;
let latestState=null;
let renderedReplays=null;
let renderedAddons=null;
function applyTab(tab) {
  for(const button of document.querySelectorAll('[role="tab"]')) {
    const selected=button.dataset.tab===tab;
    button.setAttribute('aria-selected',String(selected));button.tabIndex=selected ? 0 : -1;
    const page=$(button.getAttribute('aria-controls'));
    if(selected && page.hidden) document.querySelector('.dashboard').scrollTop=0;
    page.hidden=!selected;
  }
}
function messageCounts() {
  for(const phase of ['start','end']) $(phase+'-message-count').textContent=$(`${phase}-message-text`).value.length+' / 280';
}
function updateHubTooltip() {
  const controls=[$('fullscreen-toggle'),$('sidebar-toggle'),...document.querySelectorAll('.zoom-controls button')];
  const visible=control=>control.checkVisibility();
  const target=controls.find(control=>visible(control) && control.matches(':hover')) || controls.find(control=>visible(control) && control.matches(':focus-visible'));
  window.pro.showHubTooltip(!!target, target?.getBoundingClientRect().bottom, target?.id);
}
async function hubAction(action) {
  try {$('hub-error').hidden=true;return await action();}
  catch(error) {$('hub-error').textContent=error.message;$('hub-error').hidden=false;}
}
function node(tag, text, className) { const item = document.createElement(tag); item.textContent = text; if (className) item.className = className; return item; }
function showRecord(prefix, record = {}) {
  const wins = record.wins || 0, losses = record.losses || 0, ties = record.ties || 0;
  const decisions = wins + losses;
  const ratio = losses ? (wins / losses).toFixed(2) : wins ? '∞' : '—';
  const winRate = decisions ? `${(100 * wins / decisions).toFixed(1)}%` : '—';
  $(`${prefix}-record`).textContent = `${wins} W · ${losses} L · ${ties} T`;
  $(`${prefix}-ratio`).textContent = `W/L ${ratio} · Win rate ${winRate}`;
}
function render(state) {
  if (!state) return;
  for(const [prefix,key] of [['','clientZoomPercent'],['showdex-','showdexZoomPercent']]) {
    const zoom=state.settings?.[key]||100;
    $(prefix+'zoom-percent').textContent=zoom+'%';
    $(prefix+'zoom-out').disabled=zoom<=50;
    $(prefix+'zoom-in').disabled=zoom>=200;
  }
  latestState=state;
  $('app-version').textContent=`v${state.appVersion}`;
  document.title='Pokémon Showdown Pro';
  const collapsed=!!state.ui?.collapsed;
  document.body.dataset.collapsed=String(collapsed);
  const zoomContainer=document.querySelector(collapsed ? '.hub-controls' : '.hero');
  for(const zoomControls of document.querySelectorAll('.zoom-controls')) {
    if(zoomControls.parentElement!==zoomContainer) zoomContainer.append(zoomControls);
  }
  $('fullscreen-toggle').setAttribute('aria-pressed',String(!!state.ui?.fullscreen));
  $('fullscreen-toggle').setAttribute('aria-label',state.ui?.fullscreen?'Exit fullscreen':'Enter fullscreen');
  $('hub-content').hidden=collapsed;
  $('sidebar-toggle').setAttribute('aria-expanded',String(!collapsed));
  $('sidebar-toggle').setAttribute('aria-label',collapsed ? 'Expand Battle Hub' : 'Collapse Battle Hub');
  if(collapsed && $('hub-content').contains(document.activeElement)) $('sidebar-toggle').focus();
  updateHubTooltip();
  applyTab(state.ui?.tab || 'battle');
  document.documentElement.dataset.theme = ['light', 'dark', 'pro'].includes(state.theme) ? state.theme : 'pro';
  $('auto-start-timer').checked = !!state.settings?.autoStartTimer;
  $('save-winning-replays').checked = !!state.settings?.saveWinningReplays;
  $('save-losing-replays').checked = !!state.settings?.saveLosingReplays;
  $('showdex-enabled').checked=state.settings?.showdexEnabled!==false;
  $('auto-update-app').checked=state.settings?.autoUpdateApp!==false;
  const appUpdate=state.appUpdates;
  $('auto-update-app').disabled=!appUpdate?.supported;
  $('app-update-status').textContent=appUpdate?.message||'App updates have not been checked yet.';
  $('check-app-updates').disabled=!appUpdate?.supported||!!appUpdate?.busy||appUpdate?.status==='ready';
  $('app-update-action').hidden=appUpdate?.status!=='ready';
  $('app-update-action').textContent='Restart to update';
  $('app-update-action').disabled=!appUpdate?.canRestart;
  $('auto-update-addons').checked=state.settings?.autoUpdateAddons!==false;
  $('addon-update-status').textContent=state.addonUpdates?.message||'Updates have not been checked yet.';
  $('check-addon-updates').disabled=!!state.addonUpdates?.busy;
  $('reload-pending').hidden=!state.reloadPending;
  if(!messagesDirty) {
    for(const phase of ['start','end']) {
      $(phase+'-message-enabled').checked=!!state.settings?.messages?.[phase+'Enabled'];
      $(phase+'-message-text').value=state.settings?.messages?.[phase+'Text'] || '';
    }
  }
  messageCounts();$('save-messages').disabled=!messagesDirty;
  $('message-status').hidden=!state.messageStatus;$('message-status').textContent=state.messageStatus || '';
  $('post-match-status').hidden = !state.postMatchStatus;
  $('post-match-status').textContent = state.postMatchStatus || '';
  $('showdex').textContent = state.showdexStatus; $('client-status').textContent = state.clientStatus;
  const addonKey=JSON.stringify(state.addons||[]);
  if(addonKey!==renderedAddons) {
    const focusedAddon=document.activeElement?.id;
    renderedAddons=addonKey;$('addons-list').replaceChildren();
    for(const addon of state.addons||[]) {
      const card=node('div','','addon-card'),label=node('label','','setting-row'),copy=node('span');
      copy.append(node('strong',addon.name),node('small',addon.description));
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=addon.enabled;toggle.id='addon-'+addon.key;label.htmlFor=toggle.id;
      toggle.onchange=()=>hubAction(async()=>{try{return render(await window.pro.setSetting('addon:'+addon.key,toggle.checked));}catch(error){render(await window.pro.getState());throw error;}});
      label.append(copy,toggle);card.append(label);
      const status=addon.error ? 'Unavailable: '+addon.error : addon.enabled!==addon.active ? (addon.enabled ? 'On after reload' : 'Off after reload') : addon.active ? 'On'+(addon.version ? ' · v'+addon.version : '') : 'Off';
      card.append(node('p',status,'helper addon-status'));
      if(addon.options) {const options=node('button',addon.key==='battleHistory' ? 'Open history' : 'Settings','action-button');options.disabled=!addon.active;options.onclick=()=>hubAction(()=>window.pro.addonOptions(addon.key));card.append(options);}
      $('addons-list').append(card);
    }
    if(focusedAddon?.startsWith('addon-'))$(focusedAddon)?.focus();
  }
  document.querySelector('.connection-dot').classList.toggle('is-ready', /connected/i.test(state.clientStatus));
  showRecord('session', state.statistics?.session);
  showRecord('all-time', state.statistics?.allTime);
  $('statistics-error').hidden = !state.statisticsError;
  $('statistics-error').textContent = state.statisticsError || '';
  $('battles').replaceChildren();
  if (!state.rooms.length) {
    const empty = node('div', '', 'empty'); empty.append(node('strong', 'Ready when you are'), node('span', 'Join a battle in Showdown. Your active matches appear here.')); $('battles').append(empty);
  }
  for (const room of state.rooms) {
    const card = node('article', '', 'battle'); card.append(node('h2', room.title), node('p', room.turn ? `Turn ${room.turn}` : 'Team preview / waiting', 'turn'));
    card.append(node('p', room.status, 'status'));
    const actions=node('div','','card-actions');
    const focus=node('button','Show battle');focus.onclick=()=>hubAction(async()=>{if(!await window.pro.focusBattle(room.id)) throw new Error('Battle is no longer open.');});actions.append(focus);
    card.append(actions);
    $('battles').append(card);
  }
  const replays=state.recentReplays || [];
  const checking=new Set(state.replayOutcomePending || []);
  const replayKey=JSON.stringify([replays,[...checking]]);
  if(replayKey!==renderedReplays) {
    renderedReplays=replayKey;$('recent-replays').replaceChildren();
    if(!replays.length) $('recent-replays').append(node('p','Uploaded battles appear here. Enable winning or losing replay uploads in Battle.','helper'));
    for(const replay of replays) {
      const item=node('article','','replay-card'),heading=node('div','','replay-heading');
      const outcome=['win','loss','tie'].includes(replay.outcome)?replay.outcome:'unknown';
      const result=node('span',outcome==='win'?'Win':outcome==='loss'?'Loss':outcome==='tie'?'Tie':checking.has(replay.url)?'Checking…':'Unknown','replay-result');
      result.dataset.outcome=outcome;
      result.title=outcome==='unknown'?'This older replay has no saved result. The winner is checked against your signed-in account.':'';
      heading.append(node('strong',replay.title),result);item.append(heading);
      const uploaded=new Date(replay.uploadedAt);
      if(!Number.isNaN(uploaded.getTime())) item.append(node('small',uploaded.toLocaleString()));
      const actions=node('div','','card-actions');
      const open=node('button','Open replay');open.onclick=()=>hubAction(()=>window.pro.openReplay(replay.url));
      const copy=node('button','Copy link');copy.onclick=()=>hubAction(async()=>{await window.pro.copyReplay(replay.url);copy.textContent='Copied';});
      actions.append(open,copy);item.append(actions);$('recent-replays').append(item);
    }
  }
}
$('fullscreen-toggle').onclick=()=>hubAction(async()=>render(await window.pro.toggleFullscreen()));
for(const [prefix,target] of [['','showdown'],['showdex-','showdex']]) {
  for(const [id,action] of [['zoom-out','out'],['zoom-in','in'],['zoom-reset','reset']]) {
    $(prefix+id).onclick=()=>hubAction(async()=>render(await window.pro.zoom(action,target)));
  }
}
$('sidebar-toggle').onclick=()=>hubAction(async()=>render(await window.pro.setSetting('sidebarCollapsed',!latestState?.ui?.collapsed)));
for (const control of [$('fullscreen-toggle'),$('sidebar-toggle'),...document.querySelectorAll('.zoom-controls button')]) {
  for (const event of ['mouseenter','mouseleave','focus','blur']) control.addEventListener(event,updateHubTooltip);
}
window.addEventListener('blur',()=>window.pro.showHubTooltip(false));
for(const button of document.querySelectorAll('[role="tab"]')) {
  button.onclick=()=>hubAction(async()=>{applyTab(button.dataset.tab);render(await window.pro.setSetting('sidebarTab',button.dataset.tab));});
}
document.querySelector('.hub-tabs').onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const tabs=[...document.querySelectorAll('[role="tab"]')],index=tabs.indexOf(document.activeElement);
  const next=event.key==='Home' ? 0 : event.key==='End' ? tabs.length-1 : (index+(event.key==='ArrowRight' ? 1 : -1)+tabs.length)%tabs.length;
  tabs[next].focus();tabs[next].click();
};
for(const phase of ['start','end']) {
  const dirty=()=>{messagesDirty=true;messageCounts();$('save-messages').disabled=false;$('messages-save-status').textContent='Unsaved changes';};
  $(phase+'-message-text').oninput=dirty;
  $(phase+'-message-enabled').onchange=dirty;
}
$('save-messages').onclick=async()=>{
  try {
    const messages={};for(const phase of ['start','end']){messages[phase+'Enabled']=$(phase+'-message-enabled').checked;messages[phase+'Text']=$(phase+'-message-text').value;}
    const next=await window.pro.setSetting('messages',messages);
    messagesDirty=false;$('messages-error').textContent='';$('messages-save-status').textContent='Messages saved.';render(next);
  } catch(error) {$('messages-error').textContent=error.message;}
};
for (const [id, key] of [['auto-start-timer', 'autoStartTimer'], ['save-winning-replays', 'saveWinningReplays'],['save-losing-replays','saveLosingReplays'],['showdex-enabled','showdexEnabled']]) {
  if(['showdexEnabled'].includes(key)) {
    $(id).onchange=()=>hubAction(async()=>{try{render(await window.pro.setSetting(key,$(id).checked));}catch(error){render(await window.pro.getState());throw error;}});
    continue;
  }
  $(id).onchange = async () => {
    try { $('settings-error').textContent = ''; render(await window.pro.setSetting(key, $(id).checked)); }
    catch (error) { $('settings-error').textContent = error.message; render(await window.pro.getState()); }
  };
}
$('reload').onclick = () => hubAction(()=>window.pro.reload());
$('auto-update-addons').onchange=()=>hubAction(async()=>render(await window.pro.setSetting('autoUpdateAddons',$('auto-update-addons').checked)));
$('check-addon-updates').onclick=()=>hubAction(async()=>render(await window.pro.checkUpdates()));
$('auto-update-app').onchange=()=>hubAction(async()=>{try{render(await window.pro.setSetting('autoUpdateApp',$('auto-update-app').checked));}catch(error){render(await window.pro.getState());throw error;}});
$('check-app-updates').onclick=()=>hubAction(async()=>render(await window.pro.checkAppUpdates()));
$('app-update-action').onclick=()=>hubAction(async()=>render(await window.pro.appUpdateAction()));
window.pro.onState(render); window.pro.getState().then(render);
