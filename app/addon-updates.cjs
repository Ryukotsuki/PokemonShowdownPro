const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DAY = 24 * 60 * 60 * 1000;
function contained(base, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Invalid update path');
  const target = path.resolve(base, relative);
  if (!target.startsWith(path.resolve(base) + path.sep)) throw new Error('Update path leaves its directory');
  return target;
}
function treeHash(directory) {
  const hash = crypto.createHash('sha256');
  const walk = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
      const file = path.join(dir, entry.name), relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Update contains a symbolic link');
      if (entry.isDirectory()) walk(file, relative + '/');
      else if (entry.isFile()) { const data=fs.readFileSync(file);hash.update(relative + '\0'+data.length+'\0');hash.update(data); }
      else throw new Error('Unsupported update file');
    }
  };
  walk(directory);
  return hash.digest('hex');
}
function newer(candidate, installed) {
  if (!/^\d+(?:\.\d+){0,3}$/.test(candidate || '') || !/^\d+(?:\.\d+){0,3}$/.test(installed || '')) return false;
  const a=candidate.split('.').map(Number), b=installed.split('.').map(Number);
  for (let i=0;i<4;i++) { if ((a[i]||0)!==(b[i]||0)) return (a[i]||0)>(b[i]||0); }
  return false;
}
class AddonUpdates {
  constructor({directory, prepare, canCheck=()=>true, onChange=()=>{}, now=Date.now}) {
    this.directory=path.resolve(directory); this.prepare=prepare; this.canCheck=canCheck; this.onChange=onChange; this.now=now;
    fs.mkdirSync(this.directory,{recursive:true}); this.file=path.join(this.directory,'state.json');
    this.lockFile=path.join(this.directory,'update.lock');this.stopped=false;
    this.lockOwned=this.acquireLock();
    try {this.saved=JSON.parse(fs.readFileSync(this.file,'utf8'));} catch {this.saved={};}
    if (!this.saved || this.saved.schema!==1) this.saved={schema:1,current:{},previous:{},pending:{},unconfirmed:{},lastCheckedAt:0,message:'Updates have not been checked yet.'};
    for (const key of ['current','previous','pending']) {
      const map=this.saved[key];
      this.saved[key]=Object.fromEntries(['addons','showdex'].filter(component=>map?.[component]&&typeof map[component].directory==='string'&&/^generations[\\/][a-f0-9-]+[\\/](?:browser-addons|showdex)$/.test(map[component].directory)&&/^[a-f0-9]{64}$/.test(map[component].sha256||'')).map(component=>[component,map[component]]));
    }
    this.saved.unconfirmed=Object.fromEntries(['addons','showdex'].filter(component=>this.saved.unconfirmed?.[component]===true).map(component=>[component,true]));
    if(!Number.isFinite(this.saved.lastCheckedAt)||this.saved.lastCheckedAt<0)this.saved.lastCheckedAt=0;
    if(typeof this.saved.message!=='string')this.saved.message='Updates have not been checked yet.';
    this.busy=false; this.job=null; this.controller=null;this.manualDeferred=false;
    if(!this.lockOwned)return;
    for (const component of ['addons','showdex']) {
      if (this.saved.unconfirmed[component]) this.rollback(component,'The previous launch did not finish loading an update.');
      else if (this.saved.current[component] && !this.valid(this.saved.current[component])) this.rollback(component,'Installed update files were incomplete.');
    }
    this.cleanup();
  }
  acquireLock() {
    try {fs.writeFileSync(this.lockFile,JSON.stringify({pid:process.pid}),{flag:'wx'});return true;} catch(error) {
      if(error.code!=='EEXIST')return false;
      try {const {pid}=JSON.parse(fs.readFileSync(this.lockFile,'utf8'));if(!Number.isInteger(pid)||pid<1)return false;process.kill(pid,0);return false;} catch(error) {
        if(error.code!=='ESRCH')return false;
        fs.rmSync(this.lockFile,{force:true});try{fs.writeFileSync(this.lockFile,JSON.stringify({pid:process.pid}),{flag:'wx'});return true;}catch{return false;}
      }
    }
  }
  valid(descriptor) {
    try {return /^generations[\\/][a-f0-9-]+[\\/](?:browser-addons|showdex)$/.test(descriptor.directory) && treeHash(contained(this.directory,descriptor.directory))===descriptor.sha256;} catch {return false;}
  }
  write() {fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.saved,null,2));fs.renameSync(this.file+'.tmp',this.file);this.onChange();}
  snapshot() {return {busy:this.busy,message:this.lockOwned?this.saved.message:'Updates are managed by another app window.',lastCheckedAt:this.saved.lastCheckedAt,pending:Object.keys(this.saved.pending),current:this.saved.current};}
  installed(component, fallback) {const descriptor=this.saved.current[component];return descriptor ? contained(this.directory,descriptor.directory) : fallback;}
  activatePending() {
    if(!this.lockOwned)return;
    for (const component of ['addons','showdex']) {
      const next=this.saved.pending[component]; if (!next) continue;
      if (this.valid(next)) {this.saved.previous[component]=this.saved.current[component]||null;this.saved.current[component]=next;this.saved.unconfirmed[component]=true;this.saved.message='Updates installed. Checking startup…';}
      else this.saved.message='An incomplete update was skipped. Previous versions kept.';
      delete this.saved.pending[component];
    }
    this.write(); this.cleanup();
  }
  confirm(component) {if(this.lockOwned&&this.saved.unconfirmed[component]){delete this.saved.unconfirmed[component];this.saved.message='Updates installed successfully.';this.write();}}
  rollback(component, reason) {
    if(!this.lockOwned)return;
    const previous=this.saved.previous[component];
    if (previous && this.valid(previous)) this.saved.current[component]=previous; else delete this.saved.current[component];
    delete this.saved.previous[component];delete this.saved.pending[component];delete this.saved.unconfirmed[component];
    this.saved.message=`${component==='addons'?'Add-on':'Showdex'} update rolled back. ${reason}`;this.write();
  }
  async check(force=false) {
    if(!this.lockOwned||this.stopped)return this.snapshot();
    if (this.job) return this.job;
    if (!force && this.now()-this.saved.lastCheckedAt < (this.saved.failed ? 60*60*1000 : DAY)) return this.snapshot();
    if (!this.canCheck()) {this.manualDeferred ||= force;this.saved.message='Updates will be checked after your battles finish.';this.onChange();return this.snapshot();}
    if (Object.keys(this.saved.pending).length) return this.snapshot();
    this.manualDeferred=false;
    this.controller=new AbortController();this.busy=true;this.saved.message='Checking for add-on and Showdex updates…';this.onChange();
    const stage=contained(this.directory,path.join('generations',crypto.randomUUID()));fs.mkdirSync(stage,{recursive:true});
    this.job=(async()=>{
      try {
        const result=await this.prepare({stage,current:this.saved.current,signal:this.controller.signal,notify:message=>{this.saved.message=message;this.onChange();}});
        if(this.controller.signal.aborted)throw new Error('Update check cancelled');
        const pending={};
        for(const component of ['addons','showdex']) if(result[component]) {
          const descriptor={...result[component],directory:path.relative(this.directory,path.join(stage,component==='addons'?'browser-addons':'showdex'))};
          if(!this.valid(descriptor))throw new Error('Update validation did not produce a complete package');
          pending[component]=descriptor;
        }
        this.saved.pending=pending;this.saved.failed=!!result.errors?.length;
        this.saved.message=Object.keys(pending).length ? 'Updates ready. Restart Pro to apply them.'+(result.errors?.length?' Some updates failed verification; their current versions were kept.':'') : result.errors?.length ? 'Update check failed. Current versions kept. '+result.errors.join(' ') : 'Add-ons and Showdex are up to date.';
      } catch(error) {this.saved.failed=true;this.saved.message='Update check failed. Current versions kept. '+error.message;}
      finally {this.saved.lastCheckedAt=this.now();this.busy=false;this.controller=null;this.job=null;this.write();this.cleanup();if(this.stopped)this.releaseLock();}
      return this.snapshot();
    })();
    return this.job;
  }
  cancel() {this.controller?.abort();}
  releaseLock() {if(this.lockOwned){fs.rmSync(this.lockFile,{force:true});this.lockOwned=false;}}
  stop() {this.stopped=true;this.cancel();if(!this.busy)this.releaseLock();}
  cleanup() {
    const generations=path.join(this.directory,'generations');if(!this.lockOwned||!fs.existsSync(generations)||this.busy)return;
    const keep=new Set(Object.values(this.saved.current).concat(Object.values(this.saved.previous),Object.values(this.saved.pending)).filter(Boolean).map(d=>d.directory.split(/[\\/]/)[1]));
    for(const entry of fs.readdirSync(generations,{withFileTypes:true})) {
      if(!entry.isDirectory()||keep.has(entry.name)||!/^[a-f0-9-]+$/.test(entry.name))continue;
      fs.rmSync(contained(this.directory,path.join('generations',entry.name)),{recursive:true,force:true});
    }
  }
}
module.exports={AddonUpdates,contained,treeHash,newer};
