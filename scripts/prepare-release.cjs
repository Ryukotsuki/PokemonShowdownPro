const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
(async()=>{
  if(!['win32','darwin','linux'].includes(process.platform)||!['x64','arm64'].includes(process.arch))throw new Error('Unsupported release platform or architecture.');
  for(const file of ['build/showdex/main.js','vendor/browser-addons/versions.json'])if(!fs.existsSync(path.join(root,file)))throw new Error('Missing '+file+'; run setup and download:addons first.');
  const runtime=path.join(root,'build/update-runtime'),upstream=path.join(root,'build/upstream');
  fs.mkdirSync(runtime,{recursive:true});fs.mkdirSync(upstream,{recursive:true});
  fs.copyFileSync(process.execPath,path.join(runtime,process.platform==='win32'?'node.exe':'node'));
  if(process.platform!=='win32')fs.chmodSync(path.join(runtime,'node'),0o755);
  const response=await fetch('https://raw.githubusercontent.com/nodejs/node/'+process.version+'/LICENSE',{signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('Could not fetch the bundled Node.js license');
  fs.writeFileSync(path.join(runtime,'LICENSE.txt'),await response.text());
  fs.writeFileSync(path.join(runtime,'version.json'),JSON.stringify({version:process.version,platform:process.platform,arch:process.arch},null,2));
  for(const [name,source] of Object.entries(require('../vendor-versions.json'))) {
    execFileSync('git',['-C',path.join(root,'vendor',name),'archive','--format=zip','--output='+path.join(upstream,name+'-source.zip'),source.commit],{stdio:'inherit'});
  }
  console.log('Release assets prepared: bundled update runtime and pinned upstream source archives.');
})().catch(error=>{console.error(error);process.exitCode=1;});
