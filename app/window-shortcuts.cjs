// Keep app and editing shortcuts available without a native menu bar.
function installWindowShortcuts(contents,{toggleFullscreen,reload,devTools,quit,platform=process.platform}) {
  contents.on('before-input-event',(event,input)=>{
    if(input.type!=='keyDown')return;
    const key=input.key.toLowerCase(),primary=platform==='darwin'?input.meta:input.control;
    let action;
    if((key==='f11'&&!input.control&&!input.meta&&!input.alt&&!input.shift)||(platform==='darwin'&&key==='f'&&input.meta&&input.control&&!input.alt&&!input.shift))action=toggleFullscreen;
    else if(primary&&!input.alt&&!(platform==='darwin'?input.control:input.meta)) {
      if(key==='r'&&!input.shift)action=reload;
      else if(key==='i'&&input.shift)action=devTools;
      else if(platform==='darwin') {
        if(key==='q'&&!input.shift)action=quit;
        else {
          const edit=key==='z'?(input.shift?'redo':'undo'):!input.shift?{x:'cut',c:'copy',v:'paste',a:'selectAll'}[key]:null;
          if(edit)action=()=>contents[edit]();
        }
      }
    }
    if(action){event.preventDefault();if(!input.isAutoRepeat)action();}
  });
}

module.exports={installWindowShortcuts};
