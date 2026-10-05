const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {applyUpdate,validatePackage,installation,launchApp,confirmAppUpdate,packageHash,cleanupCompletedUpdates}=require('../app/app-update-install.cjs');

const {fixture}=require('./app-update-fixtures.cjs');
test('portable replacement preserves unrelated files and profiles across Windows, Linux and macOS',async t=>{
 for(const platform of ['win32','linux','darwin']) {
  const f=await fixture(t,platform);await fs.writeFile(path.join(f.directory,'profile/preferences.json'),'saved preferences');
  if(platform!=='darwin')await fs.writeFile(path.join(f.job.target,'my-teams.txt'),'user files');
  const launches=[];
  const result=await applyUpdate(f.job,{launch:async(...args)=>{launches.push(args);return null;},confirm:async()=>{}});
  assert.equal(JSON.parse(await fs.readFile(f.package(f.job.target))).version,'1.1.3');
  assert.equal(JSON.parse(await fs.readFile(f.package(result.backup))).version,'1.1.2');
  assert.equal(await fs.readFile(path.join(f.directory,'profile/preferences.json'),'utf8'),'saved preferences');
  if(platform!=='darwin')assert.equal(await fs.readFile(path.join(f.job.target,'my-teams.txt'),'utf8'),'user files');
  assert.equal(launches.length,1);assert.match(launches[0][1][0],/^--pro-update-confirm=[a-f0-9]{32}$/);
 }
});
test('a copy/rename failure restores the original app, including files already replaced',async t=>{
 const f=await fixture(t);let calls=0,launches=0;
 await assert.rejects(applyUpdate(f.job,{move:async(from,to)=>{if(++calls===4)throw new Error('Disk failure');await fs.rename(from,to);},launch:async()=>{launches++;return null;},confirm:async()=>{}}),/Disk failure/);
 assert.equal(JSON.parse(await fs.readFile(f.package(f.job.target))).version,'1.1.2');assert.equal(launches,1);
 assert.equal(await fs.readFile(path.join(f.job.target,'resources/app/app/main.cjs'),'utf8'),'1.1.2');
 assert.equal((await fs.readFile(f.job.execPath)).toString('ascii',0,2),'MZ');
});
test('failed startup rolls back to the previous app and restarts it without an update flag',async t=>{
 for(const platform of ['win32','darwin']) {
  const f=await fixture(t,platform),launches=[];
  await assert.rejects(applyUpdate(f.job,{launch:async(...args)=>{launches.push(args);return null;},confirm:async()=>{throw new Error('Startup failed');}}),/Startup failed/);
  assert.equal(JSON.parse(await fs.readFile(f.package(f.job.target))).version,'1.1.2');
  assert.equal(launches.length,2);assert.deepEqual(launches[1],[f.job.execPath,[]]);
 }
});
test('package identity, version, architecture and job paths are verified before touching installed files',async t=>{
 const f=await fixture(t);
 await assert.rejects(validatePackage(f.job.source,{...f.job,arch:'arm64'}),/architecture/);
 await assert.rejects(validatePackage(f.job.source,{...f.job,version:'1.0.0'}),/version or identity/);
 await assert.rejects(applyUpdate({...f.job,target:f.directory}),/install paths/);
 await fs.writeFile(f.package(f.job.source),JSON.stringify({name:'other-app',version:'1.1.3'}));
 await assert.rejects(applyUpdate(f.job),/version or identity/);
 assert.equal(JSON.parse(await fs.readFile(f.package(f.job.target))).version,'1.1.2');
 assert.throws(()=>installation('/Volumes/Pro/Pokemon Showdown Pro.app/Contents/MacOS/Pokemon Showdown Pro','darwin'),/Applications/);
});
test('a modified staged executable or script is rejected before installed files are moved',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.job.source,'resources/app/app/main.cjs'),'changed after verification');
 await assert.rejects(applyUpdate(f.job),/checksum mismatch/);
 assert.equal(JSON.parse(await fs.readFile(f.package(f.job.target))).version,'1.1.2');
});
test('startup confirmation requires the staged token, matching executable and installed version',async t=>{
 const f=await fixture(t),token='a'.repeat(32),app={getPath:()=>path.join(f.directory,'profile'),getVersion:()=> '1.1.3'};
 await fs.writeFile(path.join(f.stage,'job.json'),JSON.stringify({...f.job,token}));
 await confirmAppUpdate(app,f.job.execPath,['--pro-update-confirm='+'b'.repeat(32)]);
 await assert.rejects(fs.access(path.join(f.stage,'confirmed')));
 await confirmAppUpdate(app,f.job.execPath,['--pro-update-confirm='+token]);
 assert.equal(await fs.readFile(path.join(f.stage,'confirmed'),'utf8'),token);
});

test('startup confirmation accepts the same executable through a directory alias but rejects a different file',async t=>{
 const f=await fixture(t,'darwin'),token='c'.repeat(32),app={getPath:()=>path.join(f.directory,'profile'),getVersion:()=> '1.1.3'};
 const alias=path.join(f.directory,'installed-alias');
 await fs.symlink(f.job.target,alias,process.platform==='win32'?'junction':'dir');
 const aliasedExec=path.join(alias,'Contents/MacOS/Pokemon Showdown Pro');
 await fs.writeFile(path.join(f.stage,'job.json'),JSON.stringify({...f.job,execPath:aliasedExec,token}));
 const differentExec=path.join(f.directory,'different-executable');await fs.copyFile(f.job.execPath,differentExec);
 await confirmAppUpdate(app,differentExec,['--pro-update-confirm='+token]);
 await assert.rejects(fs.access(path.join(f.stage,'confirmed')));
 await confirmAppUpdate({...app,getVersion:()=> '1.1.2'},f.job.execPath,['--pro-update-confirm='+token]);
 await assert.rejects(fs.access(path.join(f.stage,'confirmed')));
 await confirmAppUpdate(app,f.job.execPath,['--pro-update-confirm='+token]);
 assert.equal(await fs.readFile(path.join(f.stage,'confirmed'),'utf8'),token);
});

test('Linux update and rollback relaunches use the portable launcher and preserve the confirmation argument',async t=>{
 for(const platform of ['linux','win32','darwin']) {
  const f=await fixture(t,platform),calls=[],args=['--pro-update-confirm='+'d'.repeat(32)];
  const spawnProcess=(...parameters)=>{calls.push(parameters);const child=new(require('node:events').EventEmitter)();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
  const logFile=path.join(f.stage,'startup.log');
  await launchApp(f.job.execPath,args,{platform,logFile,spawnProcess});
  await launchApp(f.job.execPath,[],{platform,logFile,spawnProcess});
  const command=platform==='linux'?path.join(f.job.target,'pokemon-showdown-pro'):f.job.execPath;
  assert.equal(calls[0][0],command);assert.deepEqual(calls[0][1],args);
  assert.equal(calls[1][0],command);assert.deepEqual(calls[1][1],[]);
  assert.equal(calls[0][2].shell,undefined);assert.equal(calls[0][2].windowsHide,true);
  assert.equal(calls[0][2].env.ELECTRON_RUN_AS_NODE,undefined);
  assert.equal(calls[0][2].stdio[1],calls[0][2].stdio[2]);
  await fs.access(logFile);
 }
});
test('completed updates retain one backup and clean old payloads without touching pending updates or user files',async t=>{
 const f=await fixture(t),app={getPath:()=>path.join(f.directory,'profile')};
 const first=await applyUpdate(f.job,{launch:async()=>null,confirm:async()=>{}});
 const stage=path.join(path.dirname(f.stage),'update-next'),source=path.join(stage,'unpacked');
 await f.writePackage(source,'1.1.4');
 const job={...f.job,stage,source,version:'1.1.4',packageHash:await packageHash(source)};
 const second=await applyUpdate(job,{launch:async()=>null,confirm:async()=>{}});
 const pending=path.join(path.dirname(f.stage),'update-pending');await fs.mkdir(pending);await fs.writeFile(path.join(pending,'download.zip'),'pending');
 await fs.writeFile(path.join(f.job.target,'my-teams.txt'),'keep');
 await cleanupCompletedUpdates(app,f.job.execPath,'win32');
 await assert.rejects(fs.access(first.backup));await assert.rejects(fs.access(source));
 assert.equal(JSON.parse(await fs.readFile(f.package(second.backup))).version,'1.1.3');
 assert.equal(await fs.readFile(path.join(pending,'download.zip'),'utf8'),'pending');
 assert.equal(await fs.readFile(path.join(f.job.target,'my-teams.txt'),'utf8'),'keep');
});
