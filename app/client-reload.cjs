// Reload through the normal client entry point, then rejoin battle tabs only
// after the server challenge and native login initialization have completed.
function captureReloadState() {
  const host=window.PS||window.app,modern=!!window.PS;
  if(!host?.rooms)return null;
  const selected=[host.room,host.panel,host.leftPanel,host.curRoom,host.curSideRoom].map(room=>room?.id).find(id=>id?.startsWith('battle-'));
  const rooms=Object.values(host.rooms).filter(room=>room?.battle&&/^battle-[a-z0-9-]+$/.test(room.id));
  return {modern,name:modern?(host.user.named?host.user.name:''):(host.user?.get?.('named')?host.user.get('name'):''),selected,
    rooms:rooms.map(room=>({id:room.id,replay:room.proReplayURL||null})).filter(room=>room.replay||/^battle-[a-z0-9]+-\d+(?:-[a-z0-9]+)?$/.test(room.id)).slice(0,30)};
}
async function resumeReloadState(snapshot,{timeout=30000,retryDelay=4000}={}) {
  const start=Date.now();let retried=false,upkeepRetried=false;
  const sameUser=(a,b)=>String(a||'').toLowerCase().replace(/[^a-z0-9]/g,'')===String(b||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const restoreRooms=async(host,modern)=>{
    let selected=snapshot.selected;
    for(const room of snapshot.rooms){
      if(room.replay){const id=await window.__showdownProReplays.open(room.replay);if(room.id===selected)selected=id;continue;}
      if(modern)host.join(room.id);else host.joinRoom(room.id);
    }
    if(selected&&host.rooms[selected])host.focusRoom(selected);
  };
  while(Date.now()-start<timeout){
    const modern=!!window.PS,host=window.PS||window.app,user=host?.user;
    const connected=modern?host?.connection?.connected:host?.socket?.readyState===1;
    const named=modern?user?.named:user?.get?.('named');
    const currentName=modern?user?.name:user?.get?.('name');
    const challenge=user?.challstr;
    const initializing=modern?user?.initializing:!user?.loaded;
    const loginOpen=modern?!!host?.rooms?.login:!!host?.popups?.some(popup=>typeof window.LoginPopup==='function'&&popup instanceof window.LoginPopup);
    const replayReady=!snapshot.rooms.some(room=>room.replay)||!!window.__showdownProReplays;
    if(connected&&window.__showdownPro&&replayReady){
      // If upkeep stalled or returned a guest despite a previously selected
      // account, let the native login code retry with the same saved session.
      if(!modern&&!upkeepRetried&&!loginOpen&&challenge&&initializing&&Date.now()-start>=retryDelay){upkeepRetried=true;user.receiveChallstr(challenge);}
      if(!retried&&!loginOpen&&challenge&&snapshot.name&&(!named||!sameUser(currentName,snapshot.name))&&(modern||user.loaded)&&Date.now()-start>=retryDelay){
        retried=true;if(modern)user.changeName(snapshot.name);else user.rename(snapshot.name);
      }
      const signedIn=!snapshot.name||named&&sameUser(currentName,snapshot.name);
      if(!initializing&&signedIn){
        // Upkeep can change initializing without a subsequent header update.
        if(modern){user.update?.(null);host.update();}else host.topbar?.updateUserbar?.();
        await restoreRooms(host,modern);return {restored:true};
      }
      if(loginOpen){
        // Native authentication UI remains visible on Home. Restore the tabs
        // when the user finishes signing in, without storing any credentials.
        const restore=()=>{
          const ready=modern?user.named:user.get('named');
          const name=modern?user.name:user.get('name');
          if(!ready||snapshot.name&&!sameUser(name,snapshot.name))return;
          if(modern)subscription?.unsubscribe?.();else user.off('change:named',restore);
          void restoreRooms(host,modern).catch(console.error);
        };
        let subscription;if(modern)subscription=user.subscribe(restore);else user.on('change:named',restore);
        return {needsLogin:true};
      }
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Showdown could not finish signing in. Check your connection and try Reload Showdown again.');
}
async function reloadShowdown(contents,{prepare=async()=>{},timeout=30000,retryDelay=4000}={}) {
  const execute=code=>(contents.mainFrame||contents).executeJavaScript(code);
  const snapshot=await execute('('+captureReloadState.toString()+')()').catch(()=>null);
  await prepare();
  if(!snapshot?.rooms.length){contents.reload();return;}
  const allowRequestedReload=event=>event.preventDefault();
  contents.on('will-prevent-unload',allowRequestedReload);
  let timer,ready;
  try {
    // Preserve the existing WebContents and its session cookies/storage.
    await new Promise((resolve,reject)=>{
      ready=()=>resolve();contents.once('dom-ready',ready);
      timer=setTimeout(()=>reject(Error('Showdown did not load. Check your connection and try again.')),timeout);
      contents.loadURL('https://play.pokemonshowdown.com/'+(snapshot.modern?'newclient':'oldclient')).catch(reject);
    });
    clearTimeout(timer);
    return await execute('('+resumeReloadState.toString()+')('+JSON.stringify(snapshot)+','+JSON.stringify({timeout,retryDelay})+')');
  }finally{clearTimeout(timer);if(ready)contents.removeListener('dom-ready',ready);contents.removeListener('will-prevent-unload',allowRequestedReload);}
}
module.exports={reloadShowdown,captureReloadState,resumeReloadState};
