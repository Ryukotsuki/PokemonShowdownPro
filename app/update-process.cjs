const {spawn}=require('node:child_process');
const path=require('node:path');
const os=require('node:os');
function runProcess(command,args,{cwd,env=process.env,signal,timeout=10*60*1000,onOutput=()=>{}}={}) {
  return new Promise((resolve,reject)=>{
    const detached=process.platform!=='win32'&&!!signal;
    const child=spawn(command,args,{cwd,env,detached,windowsHide:true,shell:process.platform==='win32'&&/\.cmd$/.test(command),stdio:['ignore','pipe','pipe']});
    let output='',done=false;
    const stop=()=>{if(child.pid){if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else if(detached){try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}}else child.kill('SIGTERM');}};
    const timer=setTimeout(stop,timeout);timer.unref();
    const append=data=>{const text=data.toString();output=(output+text).slice(-12000);onOutput(text);};
    child.stdout.on('data',append);child.stderr.on('data',append);
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);error?reject(error):resolve(output);};
    child.on('error',finish);child.on('close',code=>finish(code===0&&!signal?.aborted?null:new Error(signal?.aborted?'Update check cancelled':`Update process exited with ${code}: ${output.slice(-1800)}`)));
    signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  });
}
function prepareUpdates(root,directory) {
  return async({stage,current,signal,notify})=>{
    const fs=require('node:fs'),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'ps-au-'));
    fs.writeFileSync(path.join(stage,'request.json'),JSON.stringify({current,directory,scratch}));
    const bundledNode=path.join(root,'build/update-runtime',process.platform==='win32'?'node.exe':'node');
    const node=fs.existsSync(bundledNode)?bundledNode:process.execPath;
    const env={...process.env,ELECTRON_RUN_AS_NODE:'1',SHOWDOWN_PRO_ELECTRON_EXECUTABLE:process.versions.electron?process.execPath:require('electron'),SHOWDOWN_PRO_APP_ROOT:root};
    let buffered='';
    try {
    await runProcess(node,[path.join(root,'scripts/prepare-addon-updates.cjs'),stage],{cwd:root,env,signal,timeout:20*60*1000,onOutput:text=>{buffered+=text;const lines=buffered.split('\n');buffered=lines.pop();for(const line of lines){try{const status=JSON.parse(line);if(status.message)notify(status.message);}catch{}}}});
    const result=JSON.parse(fs.readFileSync(path.join(stage,'result.json'),'utf8'));
    const logs=fs.readdirSync(stage).filter(file=>file.endsWith('-validation.log')).map(file=>file+'\n'+fs.readFileSync(path.join(stage,file),'utf8').slice(-50000));
    fs.writeFileSync(path.join(directory,'last-check.log'),logs.join('\n\n')||'No newer packages found.');
    return result;
    } finally {
      if(!scratch.startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Invalid temporary update directory');
      fs.rmSync(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:200});
    }
  };
}
module.exports={runProcess,prepareUpdates};
