const {contextBridge,ipcRenderer}=require('electron');
let latest,ready=false;
function deliver(packet){
 const message={type:'pro-stream-frame',frame:packet},transfer=[];
 for(const part of [packet?.client,packet?.hub])if(part)for(const item of part.pixels?[part]:part.patches){
  const bytes=item.pixels;
  item.pixels=bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes:new Uint8Array(bytes);
  transfer.push(item.pixels.buffer);
 }
 try{window.postMessage(message,'*',transfer);}catch{window.postMessage(message,'*');}
}
ipcRenderer.on('stream:frame',(_event,packet)=>{if(ready)deliver(packet);else latest=packet;});
window.addEventListener('message',event=>{
 if(event.source===window&&event.data?.type==='pro-stream-painted'&&Number.isSafeInteger(event.data.sequence))ipcRenderer.send('stream:painted',event.data.sequence,event.data.reset===true);
});
contextBridge.exposeInMainWorld('stream',{windowControls:process.platform==='win32',control:action=>{if(['minimize','maximize','close'].includes(action))ipcRenderer.send('stream:window-control',action);},start:()=>{if(ready)return;ready=true;if(latest!==undefined){deliver(latest);latest=undefined;}},restart:()=>ipcRenderer.send('stream:restart')});
