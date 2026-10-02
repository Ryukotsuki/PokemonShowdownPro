const path=require('node:path');
const {AddonUpdates}=require('../app/addon-updates.cjs');
const {prepareUpdates}=require('../app/update-process.cjs');
const root=path.resolve(__dirname,'..'),index=process.argv.indexOf('--directory');
const directory=index>=0?path.resolve(process.argv[index+1]):path.join(root,'build/addon-updates');
let updater;
updater=new AddonUpdates({directory,prepare:prepareUpdates(root,directory),onChange:()=>{if(updater?.busy)console.log(updater.snapshot().message);}});
(async()=>{try{const result=await updater.check(true);console.log(JSON.stringify(result,null,2));if(updater.saved.failed)process.exitCode=1;}finally{updater.stop();}})().catch(error=>{console.error(error);process.exitCode=1;});
