const assert = require('node:assert/strict');

module.exports = async ({wc,evaluate,wait,size,capture,newClient}) => {
  const footer=newClient?'.mainmenu-footer':'.mainmenufooter';
  const prefix=newClient?'new-footer':'old-footer';
  await size(1100);
  if(newClient) await evaluate("PS.closePopupsAbove(null);PS.focusRoom('');PS.update();");
  const theme=async value=>evaluate(newClient
    ? 'PS.prefs.set("theme",'+JSON.stringify(value)+');'
    : 'OptionsPopup.prototype.setTheme({currentTarget:{value:'+JSON.stringify(value)+'}});');
  const sample=()=>evaluate(`
    const footer=document.querySelector(${JSON.stringify(footer)});
    const credit=footer.querySelector('.bgcredit');
    const links=[...footer.querySelectorAll(':scope > small > a, :scope > small > button')];
    return {credit:credit.textContent,creditDisplay:getComputedStyle(credit).display,
      links:links.map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {label:e.textContent.trim(),href:e.getAttribute('href'),background:s.backgroundImage,radius:s.borderRadius,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom};})};
  `);
  await wait('document.querySelector('+JSON.stringify(footer)+')');
  let destinations;
  for(const bg of ['shaymin','charizards','horizon','ocean']) {
    if(newClient) {
      await evaluate("PS.join('changebackground');");
      await wait('document.querySelector(".bglist button[value='+bg+']")');
      await evaluate('document.querySelector(".bglist button[value='+bg+']").click();PS.closePopupsAbove(null);PS.focusRoom("");PS.update();');
    } else await evaluate('Storage.bg.load("",'+JSON.stringify(bg)+');');
    for(const value of ['pro','light','dark']) {
      await theme(value);
      const data=await sample();
      assert.match(data.credit,/background by/,'Actual background attribution rendered');
      assert.ok(data.links.length>=6,'Footer links retained');
      const current=data.links.map(e=>e.href);
      destinations??=current;assert.deepEqual(current,destinations,'Keep link destinations');
      assert.equal(data.creditDisplay==='none',value==='pro',prefix+' '+bg+' credit hidden only in Pro');
      if(value==='pro') data.links.forEach(e=>{assert.equal(e.radius,'6px');assert.ok(e.height>=30,prefix+' '+JSON.stringify(e));assert.match(e.background,/linear-gradient/);});
      else data.links.forEach(e=>assert.notEqual(e.radius,'6px','Native footer restored'));
    }
  }
  await theme('pro');
  for(const width of [1100,430,320]) {
    await size(width);
    await evaluate('document.querySelector('+JSON.stringify(footer)+').scrollIntoView({block:"end"});');
    const data=await sample();
    await capture(prefix,width,null,footer);
    for(const link of data.links) {assert.ok(link.left>=0&&link.right<=width+1,prefix+' '+width+' '+link.label+' within viewport');assert.ok(link.bottom<=950&&link.top>=0,prefix+' '+width+' '+JSON.stringify(link));}
  }
  const selector=footer+' > small > a';
  const {root:dom}=await wc.debugger.sendCommand('DOM.getDocument');
  const {nodeId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:dom.nodeId,selector});
  for(const state of ['hover','focus-visible']) {
    await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[state]});
    const style=await evaluate('const s=getComputedStyle(document.querySelector('+JSON.stringify(selector)+'));return {border:s.borderTopColor,outline:s.outlineWidth};');
    if(state==='hover') assert.equal(style.border,'rgb(128, 196, 232)');
    else assert.equal(style.outline,'2px');
  }
  await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
};
