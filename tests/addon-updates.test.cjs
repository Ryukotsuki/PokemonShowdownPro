const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AddonUpdates,contained,treeHash,newer}=require('../app/addon-updates.cjs');
const {crxZip,validateZip}=require('../app/update-downloads.cjs');
function fixture(t,options={}) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pro-updates-'));
 const managers=[];const create=extra=>{const manager=new AddonUpdates({directory,prepare:async()=>({}),...options,...extra});managers.push(manager);return manager;};
 t.after(()=>{for(const manager of managers)manager.stop();assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
 return {directory,create};
}
function candidate(stage,component='addons',version='2.0') {
 const directory=path.join(stage,component==='addons'?'browser-addons':'showdex');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'version.txt'),version);
 return {[component]:{version,sha256:treeHash(directory)}};
}
test('updates stage without replacing current versions, survive restart, and confirm startup',async t=>{
 const {create,directory}=fixture(t,{prepare:async({stage})=>candidate(stage)});const first=create();
 await first.check(true);assert.deepEqual(first.snapshot().pending,['addons']);assert.equal(first.installed('addons','bundled'),'bundled');first.stop();
 const second=create();second.activatePending();assert.ok(second.installed('addons','bundled').startsWith(directory+path.sep));second.confirm('addons');second.stop();
 const third=create();assert.equal(third.saved.current.addons.version,'2.0');
});
test('unconfirmed startup rolls back and keeps the previous validated generation',async t=>{
 const {create}=fixture(t);const first=create({prepare:async({stage})=>candidate(stage,'showdex','2.0')});await first.check(true);first.activatePending();first.confirm('showdex');first.stop();
 const second=create({prepare:async({stage})=>candidate(stage,'showdex','3.0')});await second.check(true);second.activatePending();second.stop();
 const third=create();assert.equal(third.saved.current.showdex.version,'2.0');assert.match(third.snapshot().message,/rolled back/);
});
test('altered staged packages are rejected before activation',async t=>{
 const {create,directory}=fixture(t,{prepare:async({stage})=>candidate(stage)});const manager=create();await manager.check(true);
 fs.writeFileSync(path.join(contained(directory,manager.saved.pending.addons.directory),'version.txt'),'tampered');manager.activatePending();assert.equal(manager.installed('addons','bundled'),'bundled');assert.deepEqual(manager.snapshot().pending,[]);
});
test('network or compatibility failure retains current versions and throttles retries',async t=>{
 let calls=0,now=100000000;const {create}=fixture(t,{now:()=>now,prepare:async()=>{calls++;throw new Error('Incompatible upstream');}});const manager=create();
 await manager.check(true);assert.match(manager.snapshot().message,/Current versions kept/);assert.equal(manager.installed('addons','bundled'),'bundled');await manager.check();assert.equal(calls,1);now+=3600001;await manager.check();assert.equal(calls,2);
});
test('active battles defer checks; normal checks run once per day and concurrent requests share a job',async t=>{
 let idle=false,calls=0,now=100000000,finish;const {create}=fixture(t,{canCheck:()=>idle,now:()=>now,prepare:()=>{calls++;return new Promise(resolve=>finish=resolve);}});const manager=create();
 await manager.check(true);assert.equal(calls,0);assert.equal(manager.manualDeferred,true);assert.match(manager.snapshot().message,/battles finish/);idle=true;
 const a=manager.check(true),b=manager.check(true);assert.equal(calls,1);finish({});await Promise.all([a,b]);await manager.check();assert.equal(calls,1);now+=86400001;const c=manager.check();finish({});await c;assert.equal(calls,2);
});
test('cancellation cannot publish or activate a candidate',async t=>{
 let release;const {create}=fixture(t,{prepare:({stage})=>new Promise(resolve=>release=()=>resolve(candidate(stage)))});const manager=create();const job=manager.check(true);manager.cancel();release();await job;assert.deepEqual(manager.snapshot().pending,[]);assert.equal(manager.installed('addons','bundled'),'bundled');
});
test('a failed add-on validation can leave an independently validated Showdex update pending',async t=>{
 const {create}=fixture(t,{prepare:async({stage})=>({...candidate(stage,'showdex'),errors:['Add-ons failed compatibility checks']})});const manager=create();await manager.check(true);assert.deepEqual(manager.snapshot().pending,['showdex']);assert.equal(manager.installed('showdex','bundled'),'bundled');
});
test('another app instance cannot delete staged data or start a second updater',async t=>{
 const {create}=fixture(t);const first=create();const second=create({prepare:async()=>{throw new Error('Must not run');}});assert.equal(second.lockOwned,false);await second.check(true);assert.match(second.snapshot().message,/another app window/);assert.equal(first.lockOwned,true);
});
test('corrupt state descriptors cannot escape storage or prevent app startup',t=>{
 const {create,directory}=fixture(t);fs.writeFileSync(path.join(directory,'state.json'),JSON.stringify({schema:1,current:{addons:{directory:'../outside',sha256:'a'.repeat(64)}},pending:{showdex:'bad'},previous:null,unconfirmed:{},lastCheckedAt:'bad'}));
 const manager=create();assert.equal(manager.installed('addons','bundled'),'bundled');assert.deepEqual(manager.snapshot().pending,[]);assert.equal(manager.saved.lastCheckedAt,0);
});
test('version comparison rejects downgrades and handles Chrome four-part versions',()=>{
 assert.equal(newer('1.2.1.3','1.2.1.2'),true);assert.equal(newer('1.2','1.2.0.0'),false);assert.equal(newer('1.1','2.0'),false);assert.equal(newer('2.0-beta','1.0'),false);
});
test('update paths cannot escape storage and invalid CRX headers are rejected',()=>{
 assert.throws(()=>contained(os.tmpdir(),'../outside'));assert.throws(()=>contained(os.tmpdir(),path.resolve(os.tmpdir(),'outside')));assert.throws(()=>crxZip(Buffer.from('not an extension')));const crx=Buffer.alloc(20);crx.write('Cr24');crx.writeUInt32LE(3,4);crx.writeUInt32LE(10000,8);assert.throws(()=>crxZip(crx));
});
function zip(name,mode=0,bytes=10) {
 const filename=Buffer.from(name),entry=Buffer.alloc(46+filename.length);entry.writeUInt32LE(0x02014b50);entry.writeUInt32LE(bytes,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE((mode*65536)>>>0,38);filename.copy(entry,46);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(entry.length,12);return Buffer.concat([entry,end]);
}
test('ZIP validation rejects traversal, symlinks, oversized data, and truncated directories',()=>{
 assert.doesNotThrow(()=>validateZip(zip('assets/icon.png')));
 for(const name of ['../outside','/outside','C:/outside','assets\\outside','assets/../outside','assets/escape.'])assert.throws(()=>validateZip(zip(name)));
 assert.throws(()=>validateZip(zip('link',0xa000)));assert.throws(()=>validateZip(zip('large',0,300*1024*1024)));assert.throws(()=>validateZip(zip('a').subarray(0,20)));
});
