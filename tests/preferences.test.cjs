const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loadPreferences,savePreferences,addReplay,replayUrl,validMessages,shouldUploadReplay}=require('../app/preferences.cjs');
function fixture(run) {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pro-settings-'));try{run(path.join(dir,'preferences.json'));}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('settings, add-on switches, messages and replay links persist',()=>fixture(file=>{
 const settings=loadPreferences(file);assert.equal(settings.showdexEnabled,true);assert.equal(Object.keys(settings.addons).length,6);
 assert.equal(settings.autoStartTimer,false);assert.equal(settings.saveWinningReplays,false);assert.equal(settings.saveLosingReplays,false);
 settings.autoStartTimer=true;settings.showdexEnabled=false;settings.addons.threeIsland=false;settings.saveLosingReplays=true;
 settings.sidebarCollapsed=true;settings.sidebarTab='messages';settings.messages={startEnabled:true,startText:'Good luck!',endEnabled:true,endText:'Good game!'};
 addReplay(settings,{title:'Win',url:'https://replay.pokemonshowdown.com/gen9randombattle-123',outcome:'win'});
 savePreferences(file,settings);assert.deepEqual(loadPreferences(file),settings);
 assert.equal(replayUrl('https://evil.example/replay'),false);assert.throws(()=>addReplay(settings,{url:'https://evil.example/replay'}),/Invalid replay URL/);
}));
test('migration and saving discard unsupported legacy settings while preserving user data',()=>fixture(file=>{
 const before={...loadPreferences(file),sidebarTab:'automation',addons:{threeIsland:false,unknown:true},obsoleteSetting:true,thinkingSeconds:5};
 before.recentReplays=[{title:'Saved match',url:'https://replay.pokemonshowdown.com/gen9ou-123',outcome:'loss'}];
 fs.writeFileSync(file,JSON.stringify(before));const after=loadPreferences(file);
 assert.equal(after.sidebarTab,'battle');assert.equal(after.obsoleteSetting,undefined);assert.equal(after.thinkingSeconds,undefined);
 assert.equal(after.recentReplays.length,1);assert.equal(after.addons.threeIsland,false);assert.equal(after.addons.unknown,undefined);
 savePreferences(file,before);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),after);
}));
test('winning and losing uploads are independent and exclude ties and spectators',()=>{
 for(const wins of [false,true])for(const losses of [false,true]){
 const settings={saveWinningReplays:wins,saveLosingReplays:losses};assert.equal(shouldUploadReplay(settings,'win'),wins);assert.equal(shouldUploadReplay(settings,'loss'),losses);
 for(const outcome of ['tie',null,undefined,'spectator'])assert.equal(shouldUploadReplay(settings,outcome),false);
 }
});
test('plain messages reject commands, invalid controls and enabled empty text',()=>{
 const settings={startEnabled:true,startText:'Good luck!',endEnabled:true,endText:'Good game!'};
 for(const text of ['/forfeit',' /search gen9ou','hello\n/forfeit','hello\rworld','x'.repeat(281),''])assert.equal(validMessages({...settings,startText:text}),false);
 assert.equal(validMessages({...settings,startEnabled:false,startText:''}),true);
});
