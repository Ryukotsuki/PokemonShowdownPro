const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async(wc,root)=>{
  wc.setBackgroundThrottling(false);
  const evaluate=code=>wc.executeJavaScript('(async()=>{'+code+'})()');
  const wait=async code=>{for(let n=0;n<160;n++){if(await evaluate('return !!('+code+');').catch(()=>false))return;await pause(250);}throw new Error('Navigation audit timed out: '+code);};
  wc.debugger.attach('1.3');
  await evaluate('OptionsPopup.prototype.setTheme({currentTarget:{value:"pro"}});app.addPopup(OptionsPopup);');
  const newUrl=await evaluate('return document.querySelector(\'.ps-popup a[href="/newclient"]\').href;');
  await evaluate('app.closePopup();app.socket.send=()=>{};app.addRoom("teambuilder");app.addRoom("view-tournaments-all");');
  // Use saved server content locally; the navigation regression does not need account actions.
  const tournament=fs.readFileSync(path.join(root,'test-results/tournaments-theme/view-tournaments-all.html'),'utf8');
  await evaluate('app.rooms["view-tournaments-all"].$el.html('+JSON.stringify(tournament)+');');
  const results=[];
  for(const client of ['old','new']){
    if(client==='new'){
      await wc.loadURL(newUrl);await wait('window.PS?.roomTypes.options&&window.__showdownProTheme&&document.getElementById("showdown-pro-theme")?.sheet');
      await evaluate('PS.send=()=>{};PS.join("teambuilder");PS.join("view-tournaments-all");PS.update();');
      await wait('document.getElementById("room-view-tournaments-all")');
      await evaluate('PS.rooms["view-tournaments-all"].setHTMLData('+JSON.stringify(tournament)+');PS.update();');
    }
    for(const theme of ['pro','dark','light']){
      await evaluate(client==='old'?'OptionsPopup.prototype.setTheme({currentTarget:{value:'+JSON.stringify(theme)+'}});':'PS.prefs.set("theme",'+JSON.stringify(theme)+');');
      for(const width of [1200,430]){
        await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
        await evaluate('window.dispatchEvent(new Event("resize"));');
        for(const room of ['teambuilder','view-tournaments-all']){
          for(let repeat=0;repeat<3;repeat++){
            await evaluate(client==='old'?'app.focusRoom('+JSON.stringify(room)+');':'PS.closePopupsAbove(null);PS.focusRoom('+JSON.stringify(room)+');PS.update();');
            await pause(60);
            assert.ok(await evaluate('return document.getElementById("room-'+room+'").checkVisibility();'),client+' '+room+' opens');
            if(theme==='pro')assert.equal(await evaluate('return getComputedStyle(document.getElementById("room-'+room+'")).display;'),'flex','Active panel keeps Pro layout');
            await evaluate('const home=document.getElementById("roomtab-")||[...document.querySelectorAll(".header a")].find(a=>a.textContent.includes("Home"));if(!home)throw new Error("Home tab missing");home.click();');
            await pause(80);
            const result=await evaluate('const panel=document.getElementById("room-'+room+'"),home=document.getElementById("room-"),tab=document.getElementById("roomtab-")||[...document.querySelectorAll(".header a")].find(a=>a.textContent.includes("Home"));return {panelDisplay:getComputedStyle(panel).display,panelInline:panel.style.display,homeVisible:home.checkVisibility(),homeTab:tab?.classList.contains("cur")||tab?.getAttribute("aria-selected")==="true"};');
            results.push({client,theme,width,room,repeat,...result});
            assert.equal(result.panelDisplay,'none',client+' '+theme+' '+width+' '+room+' hides after Home');
            assert.ok(result.homeVisible&&result.homeTab,'Home content and selected tab agree');
          }
        }
      }
    }
    console.log(client+': Home switching, repeat navigation, desktop/portrait, and Pro/Dark/Light passed.');
  }
  fs.mkdirSync(path.join(root,'test-results/navigation'),{recursive:true});
  fs.writeFileSync(path.join(root,'test-results/navigation/audit.json'),JSON.stringify(results,null,2));
};
