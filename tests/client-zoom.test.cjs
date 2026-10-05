const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validZoomPercent,nextZoomPercent,bindClientZoom}=require('../app/client-zoom.cjs');
const {loadPreferences,savePreferences}=require('../app/preferences.cjs');
const {installWindowShortcuts}=require('../app/window-shortcuts.cjs');
test('zoom stays within its limits, resets, and rejects unsupported actions',()=>{
  assert.equal(nextZoomPercent(200,'in'),200);assert.equal(nextZoomPercent(50,'out'),50);
  assert.equal(nextZoomPercent(150,'reset'),100);assert.equal(nextZoomPercent(100,'in'),105);assert.equal(nextZoomPercent(105,'out'),100);
  for(const bad of [0,49,201,103,NaN,Infinity,'120',null])assert.equal(validZoomPercent(bad),false);
  assert.throws(()=>nextZoomPercent(100,'set'),/Invalid zoom action/);
});
test('zoom preferences survive restart and invalid or missing saved values use 100%',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pro-zoom-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'preferences.json');assert.equal(loadPreferences(file).clientZoomPercent,100);assert.equal(loadPreferences(file).showdexZoomPercent,100);
  const prefs=loadPreferences(file);prefs.clientZoomPercent=145;prefs.showdexZoomPercent=85;savePreferences(file,prefs);
  assert.equal(loadPreferences(file).clientZoomPercent,145);
  assert.equal(loadPreferences(file).showdexZoomPercent,85);
  fs.writeFileSync(file,JSON.stringify({clientZoomPercent:130}));
  assert.equal(loadPreferences(file).showdexZoomPercent,130,'Previous combined zoom migrates to both tools');
  fs.writeFileSync(file,JSON.stringify({...prefs,showdexZoomPercent:'120'}));
  assert.equal(loadPreferences(file).showdexZoomPercent,100,'Invalid Showdex zoom does not use the Showdown setting');
  fs.writeFileSync(file,JSON.stringify({...prefs,clientZoomPercent:Infinity}));assert.equal(loadPreferences(file).clientZoomPercent,100);
});
test('navigation reapplies the saved zoom without changing another view',()=>{
  const contents=new EventEmitter();let factor,mode,zoom=120,showdexZoom=80,message;
  contents.send=(channel,value)=>{message={channel,value};};
  contents.isDestroyed=()=>false;contents.setZoomFactor=value=>factor=value;contents.setZoomMode=value=>mode=value;
  bindClientZoom(contents,()=>zoom,()=>showdexZoom);
  assert.equal(mode,'isolated');assert.equal(factor,1.2);
  factor=1;contents.emit('did-finish-load');assert.equal(factor,1.2);
  zoom=130;contents.emit('did-finish-load');assert.equal(factor,1.3);
  assert.deepEqual(message,{channel:'client:zoom-state',value:{clientZoomPercent:130,showdexZoomPercent:80}});
  showdexZoom=150;contents.emit('did-finish-load');assert.equal(factor,1.3);
  assert.equal(message.value.showdexZoomPercent,150);
});
test('zoom shortcuts work on Windows, Linux and macOS, including shifted + and numpad keys',()=>{
  for(const platform of ['win32','linux','darwin']) {
    const contents=new EventEmitter(),actions=[];let allowed=true;
    installWindowShortcuts(contents,{platform,zoom:action=>actions.push(action),canZoom:()=>allowed});
    const press=(key,extra={})=>{let prevented=false;contents.emit('before-input-event',{preventDefault(){prevented=true;}},{type:'keyDown',key,control:platform!=='darwin',meta:platform==='darwin',alt:false,shift:false,...extra});return prevented;};
    for(const [key,extra,action] of [['=',{},'in'],['+',{shift:true},'in'],['+',{code:'NumpadAdd'},'in'],['-',{},'out'],['0',{},'reset']]) {
      assert.equal(press(key,extra),true);assert.equal(actions.at(-1),action);
    }
    const count=actions.length;
    assert.equal(press('+',{isAutoRepeat:true}),true);assert.equal(actions.length,count);
    assert.equal(press('+',{alt:true}),false);assert.equal(press('0',{shift:true}),false);
    assert.equal(press('+',{control:false,meta:false}),false);
    allowed=false;assert.equal(press('+'),false);assert.equal(actions.length,count);
  }
});
