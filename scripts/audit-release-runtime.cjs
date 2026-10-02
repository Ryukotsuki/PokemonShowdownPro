const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async({app,window,client,root,addonUpdates,browserAddons,state})=>{
  assert.equal(app.isPackaged,true,'This audit must run the packaged application');
  for(let i=0;i<600&&state().showdexStatus!=='Showdex loaded';i++)await pause(100);
  assert.equal(state().showdexStatus,'Showdex loaded',JSON.stringify(state()));
  assert.equal(browserAddons.active.size,6);assert.equal(browserAddons.errors.size,0);
  assert.equal(window.webContents.isAudioMuted(),true);assert.equal(client.webContents.isAudioMuted(),true);
  assert.equal(window.getTitle(),'Pokémon Showdown Pro');
  assert.equal(state().appVersion,require('../package.json').version);
  const version=await window.webContents.executeJavaScript('document.getElementById("app-version").textContent');
  assert.equal(version,'v'+app.getVersion());
  for(const directory of [addonUpdates.directory,browserAddons.buildRoot])assert.ok(directory.startsWith(app.getPath('userData')+path.sep),'Generated files must use the isolated app-data profile');
  for(const name of ['showdex','pokemon-showdown-client'])assert.ok(fs.statSync(path.join(root,'build/upstream',name+'-source.zip')).size>0);
  await addonUpdates.check(true);
  if(addonUpdates.saved.failed) {
    const log=path.join(addonUpdates.directory,'last-check.log');
    if(fs.existsSync(log))console.error(fs.readFileSync(log,'utf8'));
  }
  assert.equal(addonUpdates.saved.failed,false,addonUpdates.snapshot().message);
  assert.deepEqual(addonUpdates.snapshot().pending.sort(),['addons','showdex'],'The bundled update worker must validate and stage both components');
  addonUpdates.stop();
  console.log('Packaged app passed: version/title, Showdex, six add-ons, isolated writable storage, muted views, source archives and bundled update worker.');
};
