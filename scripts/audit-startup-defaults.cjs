const assert = require('node:assert/strict');
module.exports = async ({window,client,state,waitFor}) => {
  const wc=client.webContents;
  // Showdown redirects /newclient to / after setting its client cookie.
  assert.equal(await wc.executeJavaScript('!!window.PS?.prefs?.set'),true,'The new client must be running');
  const appearance=()=>wc.executeJavaScript(`({
    theme: PS.prefs.theme,
    pro: document.documentElement.classList.contains('showdown-pro'),
    showdexPro: document.documentElement.classList.contains('showdex-pro'),
    scheme: document.querySelector('[data-showdex-module]')?.dataset.showdexScheme
  })`);
  await waitFor(async()=> (await appearance()).showdexPro);
  assert.deepEqual(await appearance(), {theme:'pro',pro:true,showdexPro:true,scheme:'dark'});
  assert.equal(state().theme,'pro');
  assert.equal(await window.webContents.executeJavaScript('document.documentElement.dataset.theme'),'pro');
  await wc.executeJavaScript("PS.prefs.set('theme','light');");
  await waitFor(()=>state().theme==='light');
  await waitFor(async()=> (await appearance()).scheme==='light');
  assert.equal((await appearance()).showdexPro,false,'Showdex follows the host Light theme by default');
  wc.reload();
  await waitFor(()=>state().showdexStatus==='Loading…');
  await waitFor(()=>state().showdexStatus==='Showdex loaded');
  await waitFor(async()=> (await appearance()).scheme==='light');
  assert.deepEqual(await appearance(), {theme:'light',pro:false,showdexPro:false,scheme:'light'});
  assert.equal(wc.isAudioMuted(),true);
  assert.equal(window.webContents.isAudioMuted(),true);
  console.log('New client and Pro defaults verified; saved host Light survives reload and Showdex follows it; muted.');
};
