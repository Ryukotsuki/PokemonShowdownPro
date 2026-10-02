const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {newer,contained,treeHash}=require('../app/addon-updates.cjs');
const {extensionIds,crxZip,download,unpack,extensionUrl,removeStage,sha256}=require('../app/update-downloads.cjs');
const {runProcess}=require('../app/update-process.cjs');
const root=path.resolve(__dirname,'..'),stage=path.resolve(process.argv[2]);
const request=JSON.parse(fs.readFileSync(path.join(stage,'request.json'),'utf8'));
const result={errors:[]};
const scratch=request.scratch?path.resolve(request.scratch):fs.mkdtempSync(path.join(os.tmpdir(),'ps-au-'));
if(!scratch.startsWith(path.join(path.resolve(os.tmpdir()),'ps-au-')))throw new Error('Invalid temporary update directory');
const say=message=>console.log(JSON.stringify({message}));
const installed=(component,fallback)=>request.current[component]?contained(request.directory,request.current[component].directory):fallback;
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const electron=process.env.SHOWDOWN_PRO_ELECTRON_EXECUTABLE||(process.versions.electron?process.execPath:require('electron'));
const auditArgs=(component,target)=>[root,component==='addons'?'--audit-addon-update':'--audit-showdex-update',...(component==='addons'?['--update-stage',target]:[target]),...(process.env.SHOWDOWN_PRO_UPDATE_NO_SANDBOX==='1'?['--no-sandbox']:[])];
const electronEnv={...process.env};delete electronEnv.ELECTRON_RUN_AS_NODE;
async function audit(component) {
  const log=text=>fs.appendFileSync(path.join(stage,component+'-validation.log'),text);
  const env={...electronEnv,SHOWDOWN_PRO_UPDATE_PROFILE:path.join(scratch,component+'-profile')};
  if(component==='addons')Object.assign(env,{SHOWDOWN_PRO_UPDATE_BUILD_ROOT:path.join(scratch,'addons'),SHOWDOWN_PRO_UPDATE_AUDIT_ROOT:path.join(scratch,'audit-addons')});
  await runProcess(electron,auditArgs(component,stage),{cwd:root,env,timeout:4*60*1000,onOutput:log});
}
async function addons() {
  say('Checking browser add-on versions…');
  const target=path.join(stage,'browser-addons'),versions={},packages=[];
  const source=installed('addons',path.join(root,'vendor/browser-addons'));
  let previousPackages=[];try{previousPackages=read(path.join(source,'versions.json'));}catch{}
  fs.mkdirSync(target,{recursive:true});
  let changed=false;
  for(const key of Object.keys(extensionIds)) {
    const current=read(path.join(source,key,'manifest.json')).version;
    const url=extensionUrl(key),data=await download(url),directory=path.join(target,key);
    await unpack(crxZip(data),directory);
    const manifest=read(path.join(directory,'manifest.json'));
    if(!manifest.version||!manifest.content_scripts?.length)throw new Error(key+': unsupported extension manifest');
    if(newer(manifest.version,current)){changed=true;versions[key]=manifest.version;packages.push({key,id:extensionIds[key],version:manifest.version,sha256:sha256(data),source:url});}
    else {removeStage(target,key);fs.cpSync(path.join(source,key),directory,{recursive:true});versions[key]=current;packages.push(previousPackages.find(item=>item.key===key&&item.version===current)||{key,id:extensionIds[key],version:current,sha256:treeHash(directory),checksumKind:'files'});}
  }
  if(!changed){removeStage(stage,'browser-addons');return;}
  fs.writeFileSync(path.join(target,'versions.json'),JSON.stringify(packages,null,2));
  say('Testing updated add-ons in both clients…');
  await audit('addons');
  result.addons={versions,sha256:treeHash(target)};
}
async function showdex() {
  say('Checking Showdex releases…');
  const release=JSON.parse((await download('https://api.github.com/repos/doshidak/showdex/releases/latest',2*1024*1024)).toString());
  const tag=release.tag_name,version=typeof tag==='string'?tag.replace(/^v\.?/,''):'';
  const current=request.current.showdex?.version||read(path.join(root,'vendor/showdex/package.json')).version;
  if(release.draft||release.prerelease||!newer(version,current))return;
  if(!/^[a-zA-Z0-9._-]+$/.test(tag))throw new Error('Unsupported Showdex release tag');
  const data=await download('https://codeload.github.com/doshidak/showdex/zip/refs/tags/'+encodeURIComponent(tag));
  const unpacked=path.join(scratch,'showdex-archive');await unpack(data,unpacked);
  const directories=fs.readdirSync(unpacked,{withFileTypes:true}).filter(entry=>entry.isDirectory());
  if(directories.length!==1)throw new Error('Unexpected Showdex source archive');
  const source=path.join(scratch,'showdex-source');fs.renameSync(path.join(unpacked,directories[0].name),source);
  if(read(path.join(source,'package.json')).version!==version)throw new Error('Showdex release version mismatch');
  say('Building Showdex with Pro styling…');
  const log=text=>fs.appendFileSync(path.join(stage,'showdex-validation.log'),text);
  const buildEnv={...process.env,CI:'true',PATH:path.dirname(process.execPath)+path.delimiter+(process.env.PATH||process.env.Path||'')};
  await runProcess(process.execPath,[path.join(root,'node_modules/pnpm/bin/pnpm.cjs'),'install','--frozen-lockfile','--ignore-scripts','--config.manage-package-manager-versions=false'],{cwd:source,env:buildEnv,timeout:10*60*1000,onOutput:log});
  await runProcess(process.execPath,[path.join(root,'scripts/build-showdex.mjs'),'--source',source,'--output',path.join(stage,'showdex')],{cwd:root,timeout:6*60*1000,onOutput:log});
  say('Testing updated Showdex in both clients…');
  await audit('showdex');
  fs.writeFileSync(path.join(stage,'showdex/upstream-source.zip'),data);
  fs.copyFileSync(path.join(source,'LICENSE'),path.join(stage,'showdex/UPSTREAM-LICENSE.txt'));
  result.showdex={version,tag,source:'https://github.com/doshidak/showdex/releases/tag/'+encodeURIComponent(tag),archiveSha256:sha256(data),sha256:treeHash(path.join(stage,'showdex'))};
}
async function bundledAddons() {
  say('Validating bundled add-ons through the update worker…');
  const target=path.join(stage,'browser-addons'),versions={};
  fs.cpSync(path.join(root,'vendor/browser-addons'),target,{recursive:true});
  for(const key of Object.keys(extensionIds)) {
    const manifest=read(path.join(target,key,'manifest.json'));
    if(!manifest.version||!manifest.content_scripts?.length)throw new Error(key+': unsupported extension manifest');
    versions[key]=manifest.version;
  }
  await audit('addons');
  result.addons={versions,sha256:treeHash(target)};
}
async function bundledShowdex() {
  say('Validating bundled Showdex and native update tools…');
  const version=read(path.join(root,'vendor/showdex/package.json')).version;
  const source=path.join(scratch,'showdex-source');
  await unpack(fs.readFileSync(path.join(root,'build/upstream/showdex-source.zip')),source);
  if(read(path.join(source,'package.json')).version!==version)throw new Error('Bundled Showdex source version mismatch');
  const pnpmVersion=await runProcess(process.execPath,[path.join(root,'node_modules/pnpm/bin/pnpm.cjs'),'--version'],{cwd:root,timeout:30000});
  if(pnpmVersion.trim()!==read(path.join(root,'package.json')).dependencies.pnpm)throw new Error('Bundled pnpm version mismatch');
  const target=path.join(stage,'showdex');
  fs.cpSync(path.join(root,'build/showdex'),target,{recursive:true});
  await audit('showdex');
  result.showdex={version,sha256:treeHash(target)};
}
(async()=>{
  // Release verification uses the exact shipped candidates, independent of live
  // release APIs. Both modes run the same compatibility audits before staging.
  const candidates=request.verifyBundled?[['addons',bundledAddons],['showdex',bundledShowdex]]:[['addons',addons],['showdex',showdex]];
  // Separate failures let a compatible calculator update survive an add-on failure.
  for(const [name,prepare] of candidates) {
    try{await prepare();}catch(error){fs.appendFileSync(path.join(stage,name+'-validation.log'),'\n'+error.stack+'\n');result.errors.push((name==='addons'?'Add-ons':'Showdex')+': the new version could not pass its update checks.');if(!result[name])removeStage(stage,name==='addons'?'browser-addons':'showdex');}
  }
  for(const relative of ['build','test-results','showdex-source','showdex-archive'])removeStage(stage,relative);
  fs.writeFileSync(path.join(stage,'result.json'),JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{if(!scratch.startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Invalid temporary update directory');fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
