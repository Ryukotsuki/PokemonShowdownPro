(() => {
  // Keep the export tied to its battle. Both clients can have several open.
  function sheets(room) {return [...room.querySelectorAll('.infobox > details')].filter(detail=>detail.querySelector('summary'));}
  function exportSheet(room) {
    const own=room.querySelector('.leftbar .trainer strong')?.textContent.trim() || document.querySelector('.usernametext')?.textContent.trim();
    const sheet=sheets(room).find(detail=>!own || !detail.querySelector('summary').textContent.includes(own));
    if(!sheet)return;
    const copy=sheet.cloneNode(true),title=copy.querySelector('summary').textContent.trim();
    copy.querySelector('summary').remove();
    for(const br of copy.querySelectorAll('br'))br.replaceWith(document.createTextNode('\n'));
    const paste=copy.textContent.trim();
    if(!paste)return;
    const url=new URL('https://pokepast.es/create');url.searchParams.set('paste',paste);url.searchParams.set('title',title);
    window.open(url.href,'_blank');
  }
  function update(rooms) {
    for(const room of rooms) {
      if(!room.isConnected)continue;
      // The new client overlays Users/Battle options on the legacy options
      // element. Keep export in the log's normal flow below that toolbar.
      const newClient=room.querySelector('.userlist button[data-href="battleoptions"]');
      const bar=(newClient && room.querySelector('.battle-log .inner')) || room.querySelector('.battle-options') || room.querySelector('.battle-controls');
      if(!bar)continue;
      let button=room.querySelector('button[name="exportPasteButton"]');
      if(!button) {
        button=document.createElement('button');button.type='button';button.name='exportPasteButton';button.className='button';button.textContent='View Team Sheet';button.style.margin='4px 6px';
        button.addEventListener('click',()=>exportSheet(room));
      }
      if(newClient) {
        let row=bar.querySelector(':scope > .pro-team-sheet-export');
        if(!row) {row=document.createElement('div');row.className='pro-team-sheet-export';bar.prepend(row);}
        if(button.parentElement!==row)row.append(button);
      } else if(button.parentElement!==bar)bar.append(button);
      const available=sheets(room).length>0;
      if(button.disabled===available)button.disabled=!available;
      const title=available ? 'View the opponent’s open team sheet on PokéPaste' : 'Available when an open team sheet is shared in this battle';
      if(button.title!==title)button.title=title;
    }
  }
  const roomSelector='[id^="room-battle-"]',relevant='.battle-options,.battle-controls,.infobox,.userlist,.battle-log .inner';
  const dirty=new Set();let timer=null;
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations) {
      // Ignore our own insertion and unrelated chat/statbar animations. A
      // microtask/global rescan on every mutation can starve the battle UI.
      const nodes=[...mutation.addedNodes,...mutation.removedNodes];
      if(nodes.length && nodes.every(node=>node.nodeType===1 && node.matches('button[name="exportPasteButton"],.pro-team-sheet-export')))continue;
      const target=mutation.target.nodeType===1 ? mutation.target : mutation.target.parentElement;
      const room=target?.closest(roomSelector);
      if(room && (target.closest(relevant) || nodes.some(node=>node.nodeType===1 && (node.matches(relevant) || node.querySelector(relevant)))))dirty.add(room);
      for(const node of mutation.addedNodes) {
        if(node.nodeType!==1)continue;
        if(node.matches(roomSelector))dirty.add(node);
        for(const added of node.querySelectorAll(roomSelector))dirty.add(added);
      }
    }
    if(dirty.size && !timer)timer=setTimeout(()=>{timer=null;const rooms=[...dirty];dirty.clear();update(rooms);},50);
  });
  observer.observe(document.body,{childList:true,subtree:true});update(document.querySelectorAll(roomSelector));
})();
