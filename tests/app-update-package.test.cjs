const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {fixture,zipFixture}=require('./app-update-fixtures.cjs');
const {checksum,extractArchive,prepareAppUpdate,validateTree}=require('../app/app-update-package.cjs');
const {AppUpdates}=require('../app/app-updates.cjs');

test('real ZIP/tar downloads are streamed, verified and staged without modifying the current app',async t=>{
 for(const platform of ['win32','linux']) {
  const f=await fixture(t,platform),name=platform==='win32'?'app.zip':'app.tar.gz',archive=path.join(f.directory,name);
  if(platform==='win32')await zipFixture(f.job.source,archive);
  else await require('tar').c({file:archive,gzip:true,cwd:f.job.source},['.']);
  const data=await fs.readFile(archive),hash=crypto.createHash('sha256').update(data).digest('hex');let corrupt=false,requests=0;
  const server=http.createServer((request,response)=>{requests++;if(request.url.endsWith('.sha256'))response.end(hash+'  '+name+'\n');else{const bytes=corrupt?Buffer.from('corrupted'):data;response.setHeader('Content-Length',bytes.length);response.end(bytes);}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/${name}`,download={name,url,checksumUrl:url+'.sha256',version:'1.1.3'};
  const root=path.join(f.directory,'old-source');await fs.mkdir(path.join(root,'build/update-runtime'),{recursive:true});await fs.mkdir(path.join(root,'app'));
  await fs.copyFile(process.execPath,path.join(root,'build/update-runtime',platform==='win32'?'node.exe':'node'));
  await fs.copyFile(path.join(__dirname,'../app/app-update-install.cjs'),path.join(root,'app/app-update-install.cjs'));
  const progress=[],options={app:{getPath:()=>path.join(f.directory,'profile')},root,platform,arch:'x64',execPath:f.job.execPath,download,fetch:fetch,onProgress:percent=>progress.push(percent)};
  const prepared=await prepareAppUpdate(options);
  assert.equal(JSON.parse(await fs.readFile(f.package(f.job.target))).version,'1.1.2');
  assert.equal(JSON.parse(await fs.readFile(f.package(prepared.job.source))).version,'1.1.3');
  await fs.access(prepared.node);await fs.access(prepared.helper);assert.ok(progress.includes(100));
  const app={isPackaged:true,getPath:()=>path.join(f.directory,'profile'),getVersion:()=> '1.1.2',quit(){}};
  await fs.writeFile(path.join(app.getPath(),'app-updates.json'),JSON.stringify({lastChecked:Date.now(),prepared}));
  const restored=new AppUpdates({app,platform,arch:'x64',execPath:f.job.execPath,env:{},exists:()=>false,launchInstaller:async pending=>{assert.equal(pending.job.parentPid,process.pid);}});
  await restored.restoring;assert.equal(restored.status,'ready');assert.equal(restored.version,'1.1.3');
  await restored.action();restored.stop();
  await fs.writeFile(path.join(prepared.job.source,'resources/app/app/main.cjs'),'corrupted cached update');
  const rejected=new AppUpdates({app,platform,arch:'x64',execPath:f.job.execPath,env:{},exists:()=>false});
  await rejected.restoring;assert.equal(rejected.status,'error');assert.equal(rejected.snapshot().canRestart,false);rejected.stop();
  corrupt=true;await assert.rejects(prepareAppUpdate(options),/checksum mismatch/);assert.equal(requests,4);
  assert.equal(JSON.parse(await fs.readFile(f.package(f.job.target))).version,'1.1.2');
 }
});
test('tar traversal, symlinks and archives with unsupported entries cannot be extracted',async t=>{
 const f=await fixture(t,'linux'),tar=require('tar'),root=path.join(f.directory,'bad');await fs.mkdir(root);
 await fs.writeFile(path.join(root,'unsafe.txt'),'never extract');
 const archive=path.join(f.directory,'bad.tar.gz');
 await tar.c({file:archive,gzip:true,cwd:root,prefix:'../outside'},['unsafe.txt']);
 const destination=path.join(f.directory,'rejected');
 await assert.rejects(extractArchive(archive,destination,'linux'),/Unsafe app update archive/);
 await assert.rejects(fs.access(path.join(f.directory,'outside/unsafe.txt')));
 if(process.platform!=='win32') {
  await fs.symlink('../bad/unsafe.txt',path.join(root,'link'));
  await tar.c({file:archive,gzip:true,cwd:root},['link']);
  await assert.rejects(extractArchive(archive,destination,'linux'),/Unsafe app update archive/);
 }
});
test('checksum filenames must match and macOS bundle links must stay inside the app',async t=>{
 assert.throws(()=>checksum('a'.repeat(64)+'  other.zip','app.zip'),/checksum/);
 assert.throws(()=>checksum('a'.repeat(64)+'  app.zip\nextra','app.zip'),/checksum/);
 const f=await fixture(t,'darwin');
 if(process.platform!=='win32') {
  await fs.symlink(f.directory,path.join(f.job.source,'outside'));
  await assert.rejects(validateTree(f.job.source,true),/Unsafe app update link/);
 }
});
