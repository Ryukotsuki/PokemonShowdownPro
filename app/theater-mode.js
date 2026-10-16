// Alternate presentation of the existing room. Native controls and the
// renderer stay mounted; no battle protocol or calculator is recreated here.
(() => {
 if(window.__showdownProTheater)return true;
 const host=window.PS||window.app;if(!host?.rooms)return false;
 const defaultLayout={width:360,chatShare:0.56,chatCollapsed:false,calcCollapsed:false};
 let preferences={...defaultLayout},active=null,queued=0,expanded=false,drag=null,saveTimer;
 const marked=new Set(),chrome=new Map(),openedStats=new Set();
 const nativeLayouts=new WeakSet();
 const presentations=new Map();let normalRight=null;
 const element=id=>document.getElementById('room-'+id);
 const roomOf=node=>node?.closest?.('.ps-room')?.id?.replace(/^room-/,'');
 const visible=node=>!!node&&getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().width>0;
 const selected=()=>{
  const id=[host.room,host.panel,host.leftPanel,host.curRoom,host.leftRoom].map(room=>room?.id).find(id=>id?.startsWith('battle-')&&host.rooms[id]?.battle);
  if(id)return id;
  return Object.keys(host.rooms).find(id=>id.startsWith('battle-')&&host.rooms[id]?.battle&&visible(element(id)));
 };
 const api=()=>window.showdownProEvents;
 const save=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>api()?.setTheaterLayout?.({...preferences}).catch(console.error),180);};
 const mark=(node,part)=>{if(node&&node.dataset.proTheaterPart!==part){node.dataset.proTheaterPart=part;marked.add(node);}return node;};
 const setVar=(node,key,value)=>{if(node.style.getPropertyValue(key)!==String(value))node.style.setProperty(key,String(value));};
 const button=(label,icon,action)=>{const node=document.createElement('button');node.type='button';node.className='button pro-theater-action';node.title=label;node.setAttribute('aria-label',label);node.innerHTML='<i class="fa '+icon+'" aria-hidden="true"></i>';node.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();action();});return node;};
 const buttonContent=(node,html)=>{if(node.__proContent!==html){node.innerHTML=html;node.__proContent=html;}};
 function ensureToggle(id){
  const root=element(id);if(!root?.querySelector('.battle'))return;
  const controls=root.querySelector('.battle-controls'),timer=root.querySelector('.timerbutton,[data-href="battletimer"]');
  let toggle=root.querySelector('.pro-theater-toggle');
  if(!toggle){toggle=button('Enter Theater Mode','fa-expand',()=>{toggleMode(id);refreshNative();schedule();});toggle.classList.add('pro-theater-toggle');}
  if(timer){
   // Insert directly before the native timer, without replacing it or its
   // Calcdex wrapper. Preact/Backbone may replace controls between requests.
   if(toggle.nextSibling!==timer)timer.before(toggle);
   if(getComputedStyle(timer.parentElement).display!=='flex'){
    timer.parentElement.dataset.proTheaterTimerFlow='overlay';
    setVar(toggle,'position','absolute');setVar(toggle,'top',timer.offsetTop+'px');setVar(toggle,'left',Math.max(0,timer.offsetLeft-38)+'px');
   }else{delete timer.parentElement.dataset.proTheaterTimerFlow;for(const key of ['position','top','left'])if(toggle.style.getPropertyValue(key))toggle.style.removeProperty(key);}
   setVar(toggle,'height',timer.offsetHeight+'px');setVar(toggle,'min-height',timer.offsetHeight+'px');
  }else if(controls){
   const actions=root.querySelector('[data-calcdex-controls="battle-timer"]');
   if(actions){if(toggle.parentElement!==actions)actions.append(toggle);}
   else if(!toggle.isConnected||toggle.parentElement!==controls)controls.prepend(toggle);
   toggle.classList.add('pro-theater-without-timer');
  }
  toggle.classList.toggle('pro-theater-without-timer',!timer);
  const enabled=active===id,label=enabled?'Exit Theater Mode':'Enter Theater Mode';
  toggle.title=label;toggle.setAttribute('aria-label',label);toggle.setAttribute('aria-pressed',String(enabled));
  const icon=toggle.querySelector('i');if(icon)icon.className='fa '+(enabled?'fa-compress':'fa-expand');
 }
 function clearLayout(){
  for(const node of marked){delete node.dataset.proTheaterPart;delete node.dataset.proTheaterCollapsed;delete node.dataset.proTheaterBothCollapsed;node.classList.remove('pro-theater-room','pro-theater-calcdex','pro-theater-calc-expanded');for(const key of [...node.style])if(key.startsWith('--pro-theater-'))node.style.removeProperty(key);}
  marked.clear();for(const node of chrome.values())node.remove();chrome.clear();
  for(const node of document.querySelectorAll('[data-pro-theater-hidden]'))delete node.dataset.proTheaterHidden;
  document.documentElement.classList.remove('pro-theater-active');
 }
 function exit(){
  const id=active;active=null;expanded=false;drag=null;clearLayout();
  api()?.setTheaterActive?.(null);if(id)ensureToggle(id);
  for(const [battleId,presentation] of presentations)window.__showdownProCalcdex?.restore(battleId,presentation);
  presentations.clear();
  if(window.PS){host.rightPanel=normalRight&&host.rooms[normalRight.id]||null;host.update();}
  else {if(host.curSideRoom!==normalRight)host.curSideRoom?.hide?.();host.curSideRoom=host.sideRoom=normalRight&&host.rooms[normalRight.id]||null;host.updateLayout?.();}
  normalRight=null;
  window.dispatchEvent(new Event('resize'));
 }
 function enter(id){
  if(!host.rooms[id]?.battle||!element(id))return false;
  if(!active)normalRight=host.rightPanel||host.curSideRoom||null;
  if(!presentations.has(id))presentations.set(id,window.__showdownProCalcdex?.snapshot(id));
  if(active&&active!==id)clearLayout();active=id;expanded=false;
  document.documentElement.classList.add('pro-theater-active');
  api()?.setTheaterActive?.(id);
  const calcId=host.rooms[id].battle.calcdexRoomId;
  const existing=(calcId&&element(calcId)?.querySelector('[data-showdex-module="calcdex"]'))||element(id).querySelector('[data-showdex-module="calcdex"]');
  if(!visible(existing)){
   const open=element(id).querySelector('button[name="toggleCalcdexOverlay"]');
   if(open)open.click();else window.__showdownProCalcdex?.open(id);
  }
  // Opening the native right-side calculator must not navigate away from
  // the battle. Both room instances retain their native subscription/state.
  host.focusRoom?.(id);sync();return true;
 }
 function toggleMode(id=selected()){return active===id?(exit(),false):enter(id);}
 function control(key,create){if(!chrome.has(key))chrome.set(key,create());const node=chrome.get(key),root=element(active);if(root&&!node.isConnected)root.append(node);return node;}
 function divider(key,axis){return control(key,()=>{const node=document.createElement('div');node.className='pro-theater-divider pro-theater-divider-'+axis;node.setAttribute('role','separator');node.setAttribute('aria-label',axis==='vertical'?'Resize battle utilities':'Resize chat and Calcdex');node.setAttribute('aria-orientation',axis);node.tabIndex=0;
  node.addEventListener('pointerdown',event=>{event.preventDefault();drag={axis,node};node.setPointerCapture(event.pointerId);});
  node.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();if(axis==='vertical')preferences.width=Math.max(260,Math.min(640,preferences.width+(event.key==='ArrowLeft'?20:-20)));else preferences.chatShare=Math.max(0.25,Math.min(0.75,preferences.chatShare+(event.key==='ArrowUp'?-0.04:0.04)));save();schedule();});return node;});}
 function sync(){
  const proto=window.BattlePanel?.prototype;
  if(proto?.chooseLayout&&!nativeLayouts.has(proto)){
   const choose=proto.chooseLayout;nativeLayouts.add(proto);
   proto.chooseLayout=function(...args){if(this.props?.room?.id===active)return {layout:'side-by-side',battleHeight:360,battleWidth:640,overlayControls:false};return choose.apply(this,args);};
  }
  for(const node of marked)if(!node.isConnected)marked.delete(node);
  for(const id of Object.keys(host.rooms))if(id.startsWith('battle-')&&host.rooms[id].battle)ensureToggle(id);
  if(!active)return;
  const room=host.rooms[active],root=element(active);if(!room?.battle||!root?.isConnected){exit();return;}
  const current=selected();if(current&&current!==active){enter(current);return;}
  if(!document.documentElement.classList.contains('pro-theater-active'))document.documentElement.classList.add('pro-theater-active');if(!root.classList.contains('pro-theater-room'))root.classList.add('pro-theater-room');mark(root,'room');
  const calcId=room.battle.calcdexRoomId,calcRoom=calcId&&element(calcId);
  const inPanel=calcRoom?.querySelector('[data-showdex-module="calcdex"]');
  const calc=inPanel||root.querySelector('[data-showdex-module="calcdex"]');
  // Open native IV/EV rows once per Pokémon. The native SHOW/HIDE button
  // continues to own this view state, so a later manual collapse is respected.
  if(calc&&!preferences.calcCollapsed)for(const toggle of calc.querySelectorAll('[data-pro-calc-genetics]')){
   const key=active+':'+toggle.dataset.proCalcPokemon;
   if(!toggle.disabled&&toggle.dataset.proCalcPokemon&&!openedStats.has(key)){
    openedStats.add(key);if(toggle.dataset.proCalcGenetics==='hidden')toggle.click();
   }
  }
  const calcHost=inPanel?calcRoom:calc?.closest('[data-calcdex="overlay"]')||calc;
  if(calcHost){if(!calcHost.classList.contains('pro-theater-calcdex'))calcHost.classList.add('pro-theater-calcdex');if(calcHost.classList.contains('pro-theater-calc-expanded')!==expanded)calcHost.classList.toggle('pro-theater-calc-expanded',expanded);mark(calcHost,'calculator');}
  for(const node of document.querySelectorAll('.ps-room')){const hide=node!==root&&node!==calcHost&&!node.contains(root)&&!node.contains(calcHost)&&!node.closest('.ps-popup');if(hide){if(!node.hasAttribute('data-pro-theater-hidden'))node.dataset.proTheaterHidden='true';}else delete node.dataset.proTheaterHidden;}
  const battle=mark(root.querySelector('.battle'),'battle'),controls=mark(root.querySelector('.battle-controls'),'controls');if(!battle||!controls)return;
  const container=battle.closest('.scrollable-battle-container');if(container)mark(container,'battle-host');
  // Expand only the native scenery; foreground layers keep their original
  // coordinates and a uniform scale, including animation and tooltip targets.
  const scene=room.battle.scene;
  for(const key of ['$sprite','$stat','$fx','$tooltips'])mark(scene?.[key]?.[0],'foreground');
  mark(scene?.$bgEffect?.[0],'field-effects');
  const controlsContainer=controls.closest('.battle-controls-container');if(controlsContainer)mark(controlsContainer,'controls-host');
  // Timer and calculator access are not private move choices. Separate this
  // native action row from the scroller without changing its event handlers.
  const actions=root.querySelector('[data-calcdex-controls="battle-timer"]');if(actions)mark(actions,'battle-actions');
  const log=mark(root.querySelector('.battle-log'),'log'),input=mark(root.querySelector('.battle-log-add,.chat-log-add'),'chat-input');
  const users=mark(root.querySelector('.userlist-minimized,.battle-options,.userlist'),'users');
  const userList=root.querySelector('.userlist-minimized');if(userList&&userList!==users)mark(userList,'users-list');
  const width=innerWidth,height=innerHeight,gap=8;
  const bothCollapsed=preferences.chatCollapsed&&preferences.calcCollapsed;
  const railWidth=36,collapsedHeight=38;
  // Keep the native detail tables readable in Showdex's own zoom units.
  // A saved narrow column expands only while Calcdex is open; small windows
  // still reserve enough width for the battle and its native controls.
  const showdexZoom=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--showdown-pro-showdex-zoom'))||1;
  const detailWidth=preferences.calcCollapsed?260:360*showdexZoom+14;
  const utilityWidth=bothCollapsed?railWidth:Math.min(Math.max(preferences.width,detailWidth),Math.max(260,width*0.36),Math.max(200,width-440));
  const panelWidth=bothCollapsed?0:utilityWidth;
  const mainWidth=Math.max(240,width-utilityWidth-3*gap);
  // Let the browser measure natural flow, including floats and collapsed
  // margins in replay controls. Fixed estimates created a tiny overflow.
  setVar(root,'--pro-theater-main-width',mainWidth+'px');
  const controlsHeight=Math.max(72,Math.ceil(controls.getBoundingClientRect().height));
  const stageHeight=Math.max(100,height-controlsHeight-3*gap);
  const scale=Math.min(mainWidth/640,stageHeight/360);
  const sceneWidth=mainWidth/scale,sceneHeight=stageHeight/scale;
  const chatHeight=preferences.chatCollapsed?0:preferences.calcCollapsed?height-3*gap-collapsedHeight:Math.round((height-3*gap)*preferences.chatShare);
  const calcTop=preferences.chatCollapsed?(bothCollapsed?gap:2*gap+collapsedHeight):chatHeight+2*gap,calcHeight=Math.max(38,height-calcTop-gap);
  const variables={'--pro-theater-stat-columns':room.battle.gen===1?6:7,'--pro-theater-main-width':mainWidth+'px','--pro-theater-utility-width':panelWidth+'px','--pro-theater-utility-left':(mainWidth+2*gap)+'px','--pro-theater-stage-height':stageHeight+'px','--pro-theater-controls-height':controlsHeight+'px','--pro-theater-scale':scale,'--pro-theater-battle-left':gap+'px','--pro-theater-battle-top':gap+'px','--pro-theater-scene-width':sceneWidth+'px','--pro-theater-scene-height':sceneHeight+'px','--pro-theater-scene-x':((sceneWidth-640)/2)+'px','--pro-theater-scene-y':((sceneHeight-360)/2)+'px','--pro-theater-rail-left':(width-gap-railWidth)+'px','--pro-theater-tab-height':((height-3*gap)/2)+'px','--pro-theater-calc-tab-top':((height+gap)/2)+'px','--pro-theater-chat-height':chatHeight+'px','--pro-theater-calc-top':calcTop+'px','--pro-theater-calc-height':calcHeight+'px'};
  for(const node of [root,calcHost].filter(Boolean))for(const [key,value] of Object.entries(variables))setVar(node,key,value);
  root.dataset.proTheaterCollapsed=String(preferences.chatCollapsed);if(calcHost)calcHost.dataset.proTheaterCollapsed=String(preferences.calcCollapsed);
  root.dataset.proTheaterBothCollapsed=String(bothCollapsed);
  const chatHeader=control('chat',()=>{const node=document.createElement('div');node.className='pro-theater-chat-header';node.append(button('Collapse battle chat','fa-minus',()=>{preferences.chatCollapsed=!preferences.chatCollapsed;save();schedule();}));return node;});
  chatHeader.dataset.proTheaterCollapsed=String(preferences.chatCollapsed);const chatButton=chatHeader.firstElementChild;chatButton.title=preferences.chatCollapsed?'Expand battle chat':'Collapse battle chat';chatButton.setAttribute('aria-label',chatButton.title);buttonContent(chatButton,preferences.chatCollapsed?'<i class="fa fa-comment" aria-hidden="true"></i><span>Chat</span><i class="fa '+(bothCollapsed?'fa-chevron-left':'fa-chevron-down')+'" aria-hidden="true"></i>':'<i class="fa fa-chevron-right" aria-hidden="true"></i>');
  const calcHeader=control('calc',()=>{const node=document.createElement('div');node.className='pro-theater-calc-header';node.dataset.showdex='calcdex';const title=document.createElement('strong');title.textContent='Calcdex';node.append(title,button('Collapse Calcdex','fa-minus',()=>{preferences.calcCollapsed=!preferences.calcCollapsed;if(preferences.calcCollapsed)expanded=false;save();schedule();}),button('Enlarge Calcdex','fa-expand',()=>{expanded=!expanded;preferences.calcCollapsed=false;save();schedule();}));return node;});
  calcHeader.dataset.proTheaterCollapsed=String(preferences.calcCollapsed);const calcButtons=calcHeader.querySelectorAll('button');calcButtons[0].title=preferences.calcCollapsed?'Restore Calcdex':'Collapse Calcdex';calcButtons[0].setAttribute('aria-label',calcButtons[0].title);buttonContent(calcButtons[0],preferences.calcCollapsed?'<i class="fa fa-calculator" aria-hidden="true"></i><span>Calcdex</span><i class="fa '+(bothCollapsed?'fa-chevron-left':'fa-chevron-up')+'" aria-hidden="true"></i>':'<i class="fa fa-chevron-right" aria-hidden="true"></i>');calcButtons[1].title=expanded?'Return to docked Calcdex':'Enlarge Calcdex';calcButtons[1].setAttribute('aria-label',calcButtons[1].title);calcButtons[1].querySelector('i').className='fa '+(expanded?'fa-compress':'fa-expand');calcHeader.classList.toggle('pro-theater-calc-expanded',expanded);
  const missing=control('missing',()=>{const node=document.createElement('p');node.className='pro-theater-calc-missing';node.textContent='Enable Showdex in Battle Hub to use Calcdex.';return node;});missing.hidden=!!calc||preferences.calcCollapsed;
  divider('width','vertical').hidden=bothCollapsed;const split=divider('split','horizontal');split.hidden=preferences.chatCollapsed||preferences.calcCollapsed;
  ensureToggle(active);
 }
 function schedule(){if(!queued)queued=requestAnimationFrame(()=>{queued=0;sync();});}
 const observer=new MutationObserver(records=>{if(records.some(record=>record.type==='childList'||(record.type==='attributes'&&record.target.matches?.('.ps-room,.battle-controls'))))schedule();});
 observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
 // Force native inline controls in this room only. Showdown still creates
 // every move/mechanic/targeting control and owns their listeners.
 const refreshNative=()=>{const room=host.rooms[active||selected()];if(window.PS)room?.update?.(null);else room?.updateControls?.();};
 const keydown=event=>{
  if(event.ctrlKey&&event.shiftKey&&event.code==='KeyT'&&!event.altKey){event.preventDefault();toggleMode();refreshNative();return;}
  if(event.key!=='Escape'||!active||event.defaultPrevented||[...document.querySelectorAll('.ps-popup,.popup,.select2-drop-active,[role="dialog"],[role="listbox"],[data-tippy-root]')].some(visible)||event.target?.closest?.('input,textarea,[contenteditable="true"]'))return;
  event.preventDefault();if(expanded){expanded=false;schedule();}else exit();
 };
 window.addEventListener('keydown',keydown);window.addEventListener('resize',schedule);
 window.addEventListener('pointermove',event=>{if(!drag||!active)return;if(drag.axis==='vertical')preferences.width=Math.round(Math.max(260,Math.min(640,innerWidth-event.clientX-8)));else preferences.chatShare=Math.max(0.25,Math.min(0.75,event.clientY/Math.max(1,innerHeight-24)));schedule();});
 window.addEventListener('pointerup',()=>{if(drag){drag=null;save();}});
 window.addEventListener('pointercancel',()=>{if(drag){drag=null;save();}});
 api()?.getTheaterLayout?.().then(value=>{if(value)preferences={...defaultLayout,...value};schedule();}).catch(console.error);
 window.__showdownProTheater={toggle:id=>{const result=toggleMode(id);refreshNative();schedule();return result;},exit,get active(){return active;},get preferences(){return {...preferences};},refresh:schedule};
 schedule();return true;
})();
