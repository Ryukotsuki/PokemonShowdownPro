const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runProcess}=require('../app/update-process.cjs');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),product='Pokemon Showdown Pro';
let executable,appRoot;
if(process.platform==='win32'){executable=path.join(dist,'win-unpacked',product+'.exe');appRoot=path.join(dist,'win-unpacked/resources/app');}
else if(process.platform==='darwin'){
  const bundle=path.join(dist,process.arch==='arm64'?'mac-arm64':'mac',product+'.app');
  executable=path.join(bundle,'Contents/MacOS',product);appRoot=path.join(bundle,'Contents/Resources/app');
}else{executable=path.join(dist,'linux-unpacked/pokemon-showdown-pro');appRoot=path.join(dist,'linux-unpacked/resources/app');}
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ps-release-'));
const env={...process.env,SHOWDOWN_PRO_VERIFY_PROFILE:profile,SHOWDOWN_PRO_UPDATE_NO_SANDBOX:process.platform==='linux'?'1':'0',PATH:process.platform==='win32'?path.join(process.env.SystemRoot,'System32'):'/usr/bin:/bin'};
delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_PATH;
(async()=>{
  if(!fs.existsSync(executable))throw new Error('Packaged executable missing: '+executable);
  await require('./verify-linux-shortcuts.cjs')(dist);
  const node=path.join(appRoot,'build/update-runtime',process.platform==='win32'?'node.exe':'node');
  const check="import('@electron-internal/extract-zip').then(m=>{if(typeof m.extract!=='function')throw Error('Extractor missing');console.log('Bundled Node and native extractor passed',process.version)}).catch(e=>{console.error(e);process.exitCode=1})";
  await runProcess(node,['-e',check],{cwd:appRoot,env,timeout:30000,onOutput:text=>process.stdout.write(text)});
  // The packaged entry point handles portable Linux startup itself. Do not
  // hide a broken ordinary launch by adding --no-sandbox only in this audit.
  await runProcess(executable,['--verify-release'],{cwd:appRoot,env,timeout:15*60*1000,onOutput:text=>process.stdout.write(text)});
})().catch(error=>{
  console.error(error);process.exitCode=1;
  const diagnostics=path.join(root,'test-results','package-verification-'+process.platform+'-'+process.arch);
  fs.mkdirSync(diagnostics,{recursive:true});
  fs.writeFileSync(path.join(diagnostics,'failure.log'),error.stack+'\n');
  const log=path.join(profile,'addon-updates/last-check.log');
  if(fs.existsSync(log))fs.copyFileSync(log,path.join(diagnostics,'update-check.log'));
  console.error('Package verification diagnostics saved to '+diagnostics);
}).finally(()=>{
  if(!profile.startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Invalid release test profile');
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
});
