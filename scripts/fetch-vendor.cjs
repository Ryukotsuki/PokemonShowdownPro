const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),versions=require('../vendor-versions.json');
for(const name of ['showdex','pokemon-showdown-client']) {
  const source=versions[name],directory=path.join(root,'vendor',name);
  if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(source.remote)||!/^[a-f0-9]{40}$/.test(source.commit))throw new Error('Invalid pinned upstream: '+name);
  if(fs.existsSync(directory)) {
    const head=execFileSync('git',['-C',directory,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(head!==source.commit)throw new Error(name+' is at a different commit; existing checkout was left unchanged.');
    console.log(name+': pinned source already present');continue;
  }
  fs.mkdirSync(path.dirname(directory),{recursive:true});
  execFileSync('git',['init',directory],{stdio:'inherit'});
  execFileSync('git',['-C',directory,'remote','add','origin',source.remote],{stdio:'inherit'});
  execFileSync('git',['-C',directory,'fetch','--depth=1','origin',source.commit],{stdio:'inherit'});
  execFileSync('git',['-C',directory,'checkout','--detach','FETCH_HEAD'],{stdio:'inherit'});
}
