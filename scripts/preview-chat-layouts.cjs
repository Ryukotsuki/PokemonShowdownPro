const fs=require('node:fs');
const path=require('node:path');
const {app}=require('electron');
require('./mute-test-audio.cjs');
const root=path.resolve(__dirname,'..');
const profile=path.join(root,'test-results/chat-layout-profile');fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
app.whenReady().then(async()=>{try{await require('./audit-chat-layouts.cjs')(root);app.exit(0);}catch(error){console.error(error);app.exit(1);}});
