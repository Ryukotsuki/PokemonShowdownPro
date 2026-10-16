// Replay discovery uses the official replay service; playback stays in native
// battle rooms, disconnected from the game server and Pro's live-battle tracker.
(() => {
 if(window.__showdownProReplays)return true;
 const host=window.PS||window.app;if(!host?.rooms)return false;
 const modern=!!window.PS,opened=new Map();let serial=0,searchVersion=0,loading=false,lastFocus;
 const errorText=error=>String(error?.message||'Unable to load replays. Try again.').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
 const make=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
 const dialog=make('dialog',null,'pro-replays');dialog.setAttribute('aria-labelledby','pro-replays-title');
 const header=make('header'),title=make('h2','Replays');title.id='pro-replays-title';
 const close=make('button','×','button');close.type='button';close.setAttribute('aria-label','Close replays');close.onclick=()=>dialog.close();header.append(title,close);
 const intro=make('p','Browse Pokémon Showdown replays and watch them here in Pro.','pro-replays-intro');
 const linkForm=make('form'),linkLabel=make('label','Replay link'),link=make('input',null,'textbox');link.type='url';link.required=true;link.placeholder='https://replay.pokemonshowdown.com/…';link.setAttribute('aria-label','Replay link');linkLabel.append(link);
 const play=make('button','Watch replay','button');play.type='submit';linkForm.append(linkLabel,play);
 const form=make('form'),filters=make('div',null,'pro-replays-filters');
 function field(label,name,placeholder){const wrapper=make('label',label),input=make('input',null,'textbox');input.name=name;input.type='search';input.placeholder=placeholder;input.maxLength=100;wrapper.append(input);filters.append(wrapper);return input;}
 const username=field('Username','username','Any user (or users separated by commas)'),format=field('Format','format','Any format, e.g. gen9randombattle');
 const sortLabel=make('label','Sort'),sort=make('select',null,'textbox');sort.name='sort';for(const [value,text] of [['date','Newest'],['rating','Highest rated']]){const option=make('option',text);option.value=value;sort.append(option);}sortLabel.append(sort);filters.append(sortLabel);
 const actions=make('div',null,'pro-replays-actions'),search=make('button','Search','button'),recent=make('button','Recent replays','button');search.type='submit';recent.type='button';actions.append(search,recent);form.append(filters,actions);
 const mine=make('button','My replays','button');mine.type='button';mine.hidden=true;actions.append(mine);
 const visibility=make('fieldset',null,'pro-replays-visibility'),legend=make('legend','Visibility');visibility.append(legend);
 const publicLabel=make('label'),publicChoice=make('input');publicChoice.type='radio';publicChoice.name='visibility';publicChoice.value='public';publicChoice.checked=true;publicLabel.append(publicChoice,' Public');
 const privateLabel=make('label'),privateChoice=make('input');privateChoice.type='radio';privateChoice.name='visibility';privateChoice.value='private';privateChoice.disabled=true;privateLabel.append(privateChoice,' Private (your own replays only)');visibility.append(publicLabel,privateLabel);filters.after(visibility);
 const accountNote=make('small',null,'pro-replays-account');visibility.append(accountNote);
 const searchHeading=make('h3','Search replays');form.prepend(searchHeading);
 const status=make('p',null,'pro-replays-status');status.setAttribute('role','status');
 const list=make('div',null,'pro-replays-results');list.setAttribute('aria-label','Replay results');
 const pager=make('nav'),prev=make('button','Previous','button'),pageLabel=make('span'),next=make('button','Next','button');pager.setAttribute('aria-label','Replay pages');prev.type=next.type='button';pager.append(prev,pageLabel,next);pager.hidden=true;
 const resultsHeading=make('h3','Recent replays');
 dialog.append(header,intro,linkForm,form,status,resultsHeading,list,pager);document.body.append(dialog);
 let query={username:'',format:'',sort:'date',page:1},accountUser='',ownName='',accountVersion=0;
 const nativeName=()=>modern?(host.user?.named?host.user.name:''):(host.user?.get?.('named')?host.user.get('name'):'');
 function applyVisibility(){
  username.readOnly=privateChoice.checked;sort.disabled=privateChoice.checked;
  if(privateChoice.checked)username.value=accountUser;
 }
 async function refreshAccount(){
  const version=++accountVersion;ownName=nativeName()||'';mine.hidden=!ownName;mine.textContent=ownName+"'s replays";
  try{
   const account=await window.showdownProEvents.replayAccount();if(version!==accountVersion)return;
   accountUser=account.userid||'';if(accountUser&&ownName.toLowerCase().replace(/[^a-z0-9]/g,'')!==accountUser)ownName=accountUser;
   mine.hidden=!ownName;mine.textContent=ownName+"'s replays";privateChoice.disabled=!accountUser;
   accountNote.textContent=accountUser?'':'Log in to Showdown to view your private replays.';
   if(!accountUser&&privateChoice.checked){publicChoice.checked=true;applyVisibility();void browse({username:username.value,format:format.value,sort:sort.value,page:1});}
   applyVisibility();
  }catch{privateChoice.disabled=true;accountNote.textContent='Private replays are unavailable. Close and reopen Replays to try again.';}
 }
 async function browse(value){
  const version=++searchVersion;query={...value};status.textContent='Loading replays…';list.replaceChildren();pager.hidden=true;
  try {
   const data=await window.showdownProEvents.searchReplays(query);if(version!==searchVersion)return;
   status.textContent=data.results.length?'':'No replays found. Try another username or format.';
   resultsHeading.textContent=query.private?'Your private replays':query.username||query.format?'Search results':'Recent replays';
   for(const replay of data.results){
    const row=make('a',null,'blocklink pro-replay-result');row.href=replay.url;
    row.append(make('small',replay.format+(replay.rating?' · Rating '+replay.rating:'')),make('strong',replay.players.join(' vs. ')));
    if(replay.uploadtime)row.append(make('small',new Date(replay.uploadtime*1000).toLocaleString()));
    row.onclick=event=>{event.preventDefault();event.stopPropagation();void open(replay.url);};list.append(row);
   }
   prev.disabled=query.page===1;next.disabled=!data.hasMore;pageLabel.textContent='Page '+query.page;pager.hidden=!query.username&&!query.format||query.page===1&&!data.hasMore;
  }catch(error){if(version===searchVersion)status.textContent=errorText(error);}
 }
 async function mountReplay(data){
  let id=opened.get(data.url);if(id&&host.rooms[id]){host.focusRoom(id);host.rooms[id].battle.setViewpoint(data.p2?'p2':'p1');return id;}
  const formatId=(data.id.match(/^(gen\d+[a-z0-9]+)/i)?.[1]||'replay').toLowerCase();
  id='battle-'+formatId+'-proreplay'+(++serial);
  const roomTitle='[Replay] '+data.players.join(' vs. ');
  if(modern)host.addRoom({id,type:'battle',title:roomTitle,connected:false,connectMode:null,noURL:true});
  else host.addRoom(id,'battle',true,roomTitle);
  const room=host.rooms[id];room.proReplayURL=data.url;room.expired=true;room.connected=false;
  // Native buttons may offer upload/chat actions after a replay ends. This
  // room is read-only; never send fake room IDs or saved requests to the server.
  if(modern)room.sendDirect=()=>{};else room.send=()=>{};
  host.focusRoom(id);
  for(let i=0;!room.battle&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,30));
  if(!room.battle)throw Error('The replay player could not initialize. Try again.');
  host.receive('>'+id+'\n|init|battle\n|title|'+roomTitle+'\n'+data.log);
  room.connected=false;room.connectMode=null;
  const battle=room.battle;battle.joinButtons=false;battle.isReplay=true;battle.pause();room.battlePaused=true;
  battle.seekTurn(0,true);if(data.p2)battle.setViewpoint('p2');
  room.title=roomTitle;room.updateControls?.();room.update?.(null);host.roomTitleChanged?.(room);host.update?.();
  const root=document.getElementById('room-'+id);if(root)root.dataset.proReplay='true';
  opened.set(data.url,id);return id;
 }
 async function open(url){
  if(loading)return null;loading=true;play.disabled=true;status.textContent='Loading replay…';
  try {
   const data=await window.showdownProEvents.loadReplay(url);
   window.__showdownProTheater?.exit();
   const id=await mountReplay(data);if(dialog.open)dialog.close();status.textContent='';return id;
  }catch(error){show(false);status.textContent=errorText(error);return null;}
  finally{loading=false;play.disabled=false;}
 }
 function show(refresh=true){
  if(!dialog.open){lastFocus=document.activeElement;dialog.showModal();void refreshAccount();}
  if(refresh&&!list.children.length)void browse(query);
 }
 dialog.addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus();});
 dialog.addEventListener('click',event=>{event.stopPropagation();if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 linkForm.onsubmit=event=>{event.preventDefault();void open(link.value.trim());};
 form.onsubmit=event=>{event.preventDefault();void browse({username:username.value,format:format.value,sort:sort.value,private:privateChoice.checked,page:1});};
 recent.onclick=()=>{username.value=format.value='';sort.value='date';publicChoice.checked=true;applyVisibility();void browse({username:'',format:'',sort:'date',page:1});};
 mine.onclick=()=>{username.value=privateChoice.checked?accountUser:ownName;form.requestSubmit();};
 for(const radio of [publicChoice,privateChoice])radio.onchange=()=>{applyVisibility();form.requestSubmit();};
 prev.onclick=()=>void browse({...query,page:query.page-1});next.onclick=()=>void browse({...query,page:query.page+1});
 // Put the entry alongside the native Home actions in either client. The
 // observer only reacts to Home/menu replacements, never scans battle frames.
 function menu(){
  const anchor=document.querySelector('#mainmenu button[name="finduser"],#room- button[name="finduser"],#room- a[href="users"]');
  if(!anchor)return;
  const row=anchor.closest('p');if(!row||row.parentElement.querySelector('.pro-replays-menu'))return;
  const p=make('p'),button=make(modern?'a':'button','Replays',anchor.className.replace(/\b(?:onlineonly|disabled)\b/g,'').trim()+' pro-replays-menu');
  if(modern)button.href='#';else button.type='button';
  button.onclick=event=>{event.preventDefault();event.stopPropagation();show();};p.append(button);row.before(p);
 }
 let queued=false;new MutationObserver(records=>{if(queued||!records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches?.('#mainmenu,#room-,.mainmenuwrapper')||node.querySelector?.('[name="finduser"],a[href="users"]')))))return;queued=true;queueMicrotask(()=>{queued=false;menu();});}).observe(document.body,{childList:true,subtree:true});menu();
 document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||dialog.contains(event.target))return;
  const anchor=event.target.closest?.('a[href]');if(!anchor)return;
  try{const url=new URL(anchor.href);if(url.hostname!=='replay.pokemonshowdown.com'||url.protocol!=='https:'||url.pathname!=='/'&&!/^\/[a-z0-9][a-z0-9-]*-\d+(?:-[a-z0-9]+pw)?(?:\.(?:json|log))?$/i.test(url.pathname))return;event.preventDefault();event.stopImmediatePropagation();if(url.pathname==='/')show();else void open(url.href);}catch{}
 },true);
 window.__showdownProReplays={show,open};return true;
})();
