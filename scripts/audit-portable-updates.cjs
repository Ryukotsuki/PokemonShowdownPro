// Test the real replacement helper against isolated, inert copies of the
// packaged app. Never install a release into the user's running application.
require('./mute-test-audio.cjs');
const {app,net}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),http=require('node:http');
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const assert=require('node:assert/strict');
const {AppUpdates,launchPortableInstaller}=require('../app/app-updates.cjs');
const {prepareAppUpdate}=require('../app/app-update-package.cjs');
const {packageHash}=require('../app/app-update-install.cjs');
const {zipFixture}=require('../tests/app-update-fixtures.cjs');
const root=path.resolve(__dirname,'..'),platform=process.platform,arch=process.arch;
let directory,server,parent;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// No visual rendering is exercised here; avoid unnecessary CI GPU initialization.
app.disableHardwareAcceleration();
const deadline=setTimeout(()=>{console.error('Portable app update audit timed out');app.exit(1);},300000);
async function waitForResult(stage) {
 const end=Date.now()+120000; // The helper itself allows 90 seconds for startup.
 while(Date.now()<end) {
  try{return JSON.parse(await fs.readFile(path.join(stage,'result.json'),'utf8'));}catch{}
  await sleep(100);
 }
 throw new Error('Helper did not finish within its startup deadline');
}
async function saveDiagnostics() {
 if(!directory)return;
 const out=path.join(root,'test-results',`portable-update-verification-${platform}-${arch}`);await fs.mkdir(out,{recursive:true});
 const base=path.join(directory,'profile/app-update-staging');
 for(const item of await fs.readdir(base).catch(()=>[])) {
  if(!item.startsWith('update-'))continue;
  for(const name of ['result.json','install-error.log','startup.log']) {
   const content=await fs.readFile(path.join(base,item,name),'utf8').catch(()=>null);
   if(content!==null){await fs.writeFile(path.join(out,item+'-'+name),content);console.error(item+' '+name+':\n'+content.slice(-16000));}
  }
 }
 const startup=await fs.readFile(path.join(directory,'profile/audit-startup.json'),'utf8').catch(()=>null);
 if(startup!==null){await fs.writeFile(path.join(out,'audit-startup.json'),startup);console.error('Packaged fixture startup: '+startup);}
}
app.whenReady().then(async()=>{
 directory=await fs.mkdtemp(path.join(os.tmpdir(),'pro-portable-audit-'));
 const bundle=platform==='darwin',original=path.join(root,'dist',platform==='win32'?'win-unpacked':platform==='linux'?'linux-unpacked':arch==='arm64'?'mac-arm64/Pokemon Showdown Pro.app':'mac/Pokemon Showdown Pro.app');
 const target=path.join(directory,bundle?'installed/Pokemon Showdown Pro.app':'installed'),source=path.join(directory,bundle?'candidate/Pokemon Showdown Pro.app':'candidate');
 await fs.cp(original,target,{recursive:true,verbatimSymlinks:true});
 const resources=folder=>path.join(folder,bundle?'Contents/Resources/app':'resources/app');
 const profile=path.join(directory,'profile');await fs.mkdir(profile);await fs.writeFile(path.join(profile,'preferences.json'),'saved audit profile');
 // These fixture apps create no windows, never connect to Showdown and mute
 // audio before any web contents could be created.
 const stub=`require(${JSON.stringify(path.join(root,'scripts/mute-test-audio.cjs'))});const {app}=require('electron');process.on('uncaughtException',error=>{console.error(error);app.exit(1);});app.disableHardwareAcceleration();app.setPath('userData',${JSON.stringify(profile)});app.whenReady().then(async()=>{require('node:fs').writeFileSync(${JSON.stringify(path.join(profile,'audit-startup.json'))},JSON.stringify({version:app.getVersion(),execPath:process.execPath,args:process.argv}));await require('./app/app-update-install.cjs').confirmAppUpdate(app);setTimeout(()=>app.quit(),1500);}).catch(error=>{console.error(error);app.exit(1);});`;
 const pkg=JSON.parse(await fs.readFile(path.join(resources(target),'package.json'),'utf8'));pkg.main='audit-main.cjs';pkg.version='98.0.0';
 await fs.writeFile(path.join(resources(target),'package.json'),JSON.stringify(pkg));
 await fs.writeFile(path.join(resources(target),'audit-main.cjs'),stub);
 await fs.copyFile(path.join(root,'app/app-update-install.cjs'),path.join(resources(target),'app/app-update-install.cjs'));
 await fs.cp(target,source,{recursive:true,verbatimSymlinks:true});pkg.version='99.0.0';await fs.writeFile(path.join(resources(source),'package.json'),JSON.stringify(pkg));
 const name=`PokemonShowdownPro-99.0.0-${bundle?'macos':platform==='win32'?'windows':'linux'}-${arch}.${bundle?'dmg':platform==='win32'?'zip':'tar.gz'}`,archive=path.join(directory,name);
 if(platform==='win32')await zipFixture(source,archive);
 else if(platform==='linux')await require('tar').c({file:archive,gzip:true,cwd:source},['.']);
 else await promisify(execFile)('/usr/bin/hdiutil',['create','-quiet','-srcfolder',path.dirname(source),'-format','UDZO',archive],{timeout:60000});
 const hash=crypto.createHash('sha256');for await(const chunk of require('node:fs').createReadStream(archive))hash.update(chunk);
 const checksum=hash.digest('hex');
 server=http.createServer((request,response)=>{
  if(request.url.endsWith('.sha256'))response.end(checksum+'  '+name+'\n');
  else {require('node:fs').createReadStream(archive).pipe(response);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`https://github.com/Ryukotsuki/PokemonShowdownPro/releases/download/v99.0.0/${name}`;
 const fetchLocal=address=>net.fetch(`http://127.0.0.1:${server.address().port}/${String(address).split('/').at(-1)}`);
 const executable=path.join(target,bundle?'Contents/MacOS/Pokemon Showdown Pro':platform==='win32'?'Pokemon Showdown Pro.exe':'pokemon-showdown-pro.bin');
 // A separate parent process stands in for the currently running app. The
 // helper must wait for it to exit before moving any installed files.
 const runtime=path.join(root,'build/update-runtime',platform==='win32'?'node.exe':'node');
 parent=spawn(runtime,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{parent.once('spawn',resolve);parent.once('error',reject);});
 let prepared;
 const updates=new AppUpdates({app:{isPackaged:true,getVersion:()=> '98.0.0',getPath:()=>profile,quit:()=>parent.kill()},platform,arch,env:{},execPath:executable,exists:()=>false,
  fetchRelease:async()=>({tag_name:'v99.0.0',assets:[{name,browser_download_url:url},{name:name+'.sha256',browser_download_url:url+'.sha256'}]}),
  launchInstaller:async prepared=>{prepared.job.parentPid=parent.pid;await fs.writeFile(path.join(prepared.stage,'job.json'),JSON.stringify(prepared.job));await launchPortableInstaller(prepared);},
  prepareUpdate:async(download,onProgress,signal)=>{
   prepared=await prepareAppUpdate({app:{getPath:()=>profile},root,platform,arch,execPath:executable,download,onProgress,signal,fetch:fetchLocal});
   prepared.job.parentPid=parent.pid;await fs.writeFile(path.join(prepared.stage,'job.json'),JSON.stringify(prepared.job));return prepared;
  }});
 await updates.check(true);assert.equal(updates.status,'ready',updates.message);
 assert.equal(JSON.parse(await fs.readFile(path.join(resources(target),'package.json'))).version,'98.0.0');
 await updates.action();assert.notEqual(updates.status,'error',updates.message);
 let result=await waitForResult(prepared.stage);
 assert.equal(result.installed,true,JSON.stringify(result));
 assert.equal(JSON.parse(await fs.readFile(path.join(resources(target),'package.json'))).version,'99.0.0');
 assert.equal(JSON.parse(await fs.readFile(path.join(resources(result.backup),'package.json'))).version,'98.0.0');
 assert.equal(await fs.readFile(path.join(profile,'preferences.json'),'utf8'),'saved audit profile');
 await sleep(2000);updates.stop();
 // Exercise actual process-start failure too. The candidate intentionally exits
 // without confirmation; the helper must restore and relaunch version 99.
 const sourcePackage=path.join(resources(prepared.job.source),'package.json');
 const failedPkg=JSON.parse(await fs.readFile(sourcePackage));failedPkg.version='100.0.0';await fs.writeFile(sourcePackage,JSON.stringify(failedPkg));
 await fs.writeFile(path.join(resources(prepared.job.source),'audit-main.cjs'),`require(${JSON.stringify(path.join(root,'scripts/mute-test-audio.cjs'))});require('electron').app.exit(2);`);
 parent=spawn(runtime,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{parent.once('spawn',resolve);parent.once('error',reject);});
 prepared.job.version='100.0.0';prepared.job.parentPid=parent.pid;prepared.job.packageHash=await packageHash(prepared.job.source);
 await fs.writeFile(path.join(prepared.stage,'job.json'),JSON.stringify(prepared.job));
 for(const name of ['helper-ready','confirmed','result.json'])await fs.rm(path.join(prepared.stage,name),{force:true});
 await launchPortableInstaller(prepared);parent.kill();result=null;
 result=await waitForResult(prepared.stage);
 assert.equal(result.installed,false,'A candidate without startup confirmation must roll back');
 assert.equal(JSON.parse(await fs.readFile(path.join(resources(target),'package.json'))).version,'99.0.0');
 assert.equal(await fs.readFile(path.join(profile,'preferences.json'),'utf8'),'saved audit profile');
 await sleep(2000);
 console.log('In-app portable update passed: real download/checksum, detached helper, parent exit, replacement, startup confirmation, backup, failed-start rollback and preserved profile.');
}).then(async()=>{
 clearTimeout(deadline);parent?.kill();if(server)await new Promise(resolve=>server.close(resolve));
 if(directory){assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));await fs.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
 app.exit(0);
}).catch(async error=>{console.error(error);await saveDiagnostics().catch(console.error);parent?.kill();app.exit(1);});
