const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict');
const {runProcess}=require('../app/update-process.cjs');
const {readRuntime,updateInformation}=require('./appimage-release.cjs');
const glibcVersions=text=>[...text.matchAll(/\bName:\s+GLIBC_(\d+(?:\.\d+)+)\b/g)].map(match=>match[1]);
const compareVersions=(a,b)=>{const av=a.split('.').map(Number),bv=b.split('.').map(Number);for(let i=0;i<Math.max(av.length,bv.length);i++){const difference=(av[i]||0)-(bv[i]||0);if(difference)return difference;}return 0;};
async function linuxRequirements(directory,{run=runProcess}={}) {
 const binaries=[];
 const walk=async folder=>{
  for(const item of await fs.readdir(folder,{withFileTypes:true})) {
   const file=path.join(folder,item.name);
   if(item.isDirectory())await walk(file);
   else if(item.isFile()) {
    const handle=await fs.open(file,'r'),header=Buffer.alloc(4);
    try {await handle.read(header,0,4,0);}finally{await handle.close();}
    if(header.toString('hex')!=='7f454c46')continue;
    const versions=new Set();let partial='',needs=false;
    const collect=text=>{
     partial+=text;const lines=partial.split('\n');partial=lines.pop();
     for(const line of lines){
      if(/^Version .* section /.test(line))needs=line.startsWith('Version needs section ');
      if(needs)for(const version of glibcVersions(line))versions.add(version);
     }
    };
    await run('readelf',['--version-info','--wide',file],{env:{...process.env,LC_ALL:'C'},timeout:30000,onOutput:collect});collect('\n');
    binaries.push({file:path.relative(directory,file).replaceAll(path.sep,'/'),glibc:versions.size?[...versions].sort(compareVersions).at(-1):null});
   }
  }
 };
 await walk(directory);
 if(!binaries.length)throw new Error('No ELF binaries found in the Linux application');
 return {glibc:binaries.map(item=>item.glibc).filter(Boolean).sort(compareVersions).at(-1)||null,binaries};
}
async function verifyAppImage({root=path.resolve(__dirname,'..'),arch=process.arch,run=runProcess}={}) {
 const version=JSON.parse(await fs.readFile(path.join(root,'package.json'))).version;
 const imageArch={x64:'x86_64',arm64:'aarch64'}[arch];if(!imageArch)throw new Error('Unsupported AppImage architecture');
 const dist=path.join(root,'dist'),image=path.join(dist,`PokemonShowdownPro-${version}-${imageArch}.AppImage`);
 const {info}=await readRuntime(image);if(!info.static)throw new Error('AppImage runtime still depends on the system dynamic loader/libraries');
 const output=await run(image,['--appimage-updateinformation'],{timeout:30000});
 if(output.trim()!==updateInformation(imageArch))throw new Error('AppImage runtime cannot read its external-update metadata');
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'pro-appimage-review-'));
 try {
  await run(image,['--appimage-extract'],{cwd:scratch,timeout:180000});
  const requirements=await linuxRequirements(path.join(scratch,'squashfs-root'),{run});
  const report={version,arch:imageArch,appImageRuntime:'static',requiresSystemLibfuse2:false,...requirements};
  await fs.writeFile(path.join(dist,'linux-compatibility.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`AppImage runtime and update metadata verified. Payload requires glibc ${requirements.glibc||'not detected'}; see linux-compatibility.json for each binary.`);
 }finally {
  assert.equal(path.dirname(path.resolve(scratch)),path.resolve(os.tmpdir()));
  await fs.rm(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
if(require.main===module)verifyAppImage().catch(async error=>{
 console.error(error);process.exitCode=1;
 const directory=path.resolve(__dirname,'../test-results/package-verification-linux-'+process.arch);await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'appimage-review.log'),error.stack+'\n');
});
module.exports={verifyAppImage,linuxRequirements,glibcVersions,compareVersions};
