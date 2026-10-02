const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
module.exports = async ({root,wc,evaluate,wait,size,capture}) => {
  const report = [];
  const record = async name => {
    const data = await evaluate(`
      const style=e=>e&&{background:getComputedStyle(e).backgroundColor,image:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).color,radius:getComputedStyle(e).borderRadius,overflow:e.scrollWidth>e.clientWidth+1};
      const divider=e=>e&&{background:getComputedStyle(e,'::after').backgroundColor,border:getComputedStyle(e,'::after').borderTopColor,height:getComputedStyle(e,'::after').height};
      const room=document.getElementById('room-'+dropdownTeamId);
      const card=room.querySelector('.set-form > table');
      const coverage=room.querySelector('.details:has(>summary>.details-preview.table)');
      return {card:style(card),nickname:style(room.querySelector('.set-nickname')),sprite:card?.style.backgroundImage,
        divider:divider(room.querySelector('.teameditor .tabbar')),
        result:style(room.querySelector('.set-searchresults .result a')),sort:style(room.querySelector('.set-searchresults .sortcol.cur')),
        heading:style(room.querySelector('.set-searchresults .dexlist h3')),
        groups:[...room.querySelectorAll('select[name=ivspread] optgroup')].map(style),
        coverage:style(coverage),summary:style(coverage?.querySelector('summary')),table:style(coverage?.querySelector('table')),
        public:style(room.querySelector('input[name=public]')?.closest('label'))};
    `);
    report.push({name,...data});
    fs.writeFileSync(path.join(root,'test-results/dropdown-controls/builder-surfaces.json'),JSON.stringify(report,null,2));
    return data;
  };
  const focus = async type => evaluate('const e=PS.rooms[dropdownTeamId].editor;e.innerFocus={setIndex:0,type:'+JSON.stringify(type)+',typeIndex:-1};e.update();PS.rooms[dropdownTeamId].update(null);');
  await size(1100);
  await focus('stats');
  const populated=await record('populated');
  assert.equal(populated.card.background,'rgb(27, 57, 77)');
  assert.equal(populated.nickname.background,'rgb(27, 57, 77)');
  assert.match(populated.sprite,/ceruledge/,'Keep the Pokémon sprite');
  assert.ok(populated.groups.length>=3);
  populated.groups.forEach(group=>assert.equal(group.background,'rgba(0, 0, 0, 0)','IV heading blends with the picker'));
  for(const width of [1100,430]) {await size(width);await capture('pro-iv-picker',width,'.set-stats-form select[name=ivspread]');}
  await size(1100);
  await evaluate("PS.rooms[dropdownTeamId].editor.innerFocus=null;PS.rooms[dropdownTeamId].editor.update();PS.rooms[dropdownTeamId].update(null);");
  const closed=await record('coverage-closed');
  assert.equal(closed.divider.background,'rgb(23, 39, 52)','Form tabs use the Pro divider');
  assert.equal(closed.divider.border,'rgb(49, 74, 93)');
  assert.equal(closed.divider.height,'6px','Keep the native tab layout');
  assert.equal(closed.coverage.background,'rgb(25, 52, 72)');
  assert.equal(closed.coverage.radius,'8px');assert.equal(closed.summary.background,'rgba(0, 0, 0, 0)');
  for(const width of [1100,430]) {await size(width);await capture('pro-coverage-closed',width);}
  await evaluate("document.querySelector('.teameditor .details:has(>summary>.details-preview.table) > summary').click();");
  assert.equal(await evaluate("return document.querySelector('.teameditor .details:has(>summary>.details-preview.table)').open;"),true);
  for(const width of [1100,430]) {await size(width);const data=await record('coverage-open-'+width);assert.equal(data.coverage.overflow,false);await capture('pro-coverage-open',width);}
  await size(1100);
  const force = async (selector,states) => {
    const {root:dom}=await wc.debugger.sendCommand('DOM.getDocument');
    const {nodeId}=await wc.debugger.sendCommand('DOM.querySelector',{nodeId:dom.nodeId,selector});
    assert.ok(nodeId,'Find '+selector);
    await wc.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:states});
  };
  // The native Public flag is only checked visually; it is never activated.
  await evaluate("const label=[...document.querySelectorAll('.teameditor label.checkbox')].find(e=>e.textContent.includes('Public'));if(!label)throw new Error('Public control missing');label.dataset.publicAudit='true';");
  for(const state of ['hover','focus-within']) {
    await force('[data-public-audit]',[state]);
    assert.equal(await evaluate("return getComputedStyle(document.querySelector('[data-public-audit]')).backgroundColor;"),'rgb(42, 77, 99)');
  }
  await force('[data-public-audit]',[]);
  await evaluate("document.querySelector('.teameditor button[name=addpokemon]').click();");
  await wait(`document.querySelector('.set-form input[name="pokemon"][value=""]')`);
  await evaluate("const input=document.querySelector('.set-form input[name=pokemon]');input.focus();const search=document.querySelector('.searchboxwrapper input[name=value]');search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));");
  await wait("document.querySelector('.set-searchresults .result a')");
  const empty=await record('empty-pokemon');assert.equal(empty.card.background,'rgb(27, 57, 77)');
  assert.equal(empty.divider.background,'rgb(23, 39, 52)','Pokémon tabs use the Pro divider');
  assert.equal(empty.heading.background,'rgb(44, 83, 107)');
  assert.equal(await evaluate("return getComputedStyle(document.querySelector('.set-searchresults .result a[aria-selected=true]')).backgroundColor;"),'rgb(40, 85, 112)','Native keyboard selection uses Pro highlight');
  await force('.set-searchresults .result a',['hover']);
  const hover=await record('pokemon-hover');assert.equal(hover.result.background,'rgb(40, 85, 112)');
  await force('.set-searchresults .result a',[]);
  const sort=await evaluate("return getComputedStyle(document.querySelector('.set-searchresults .sortcol.cur')).backgroundColor;");
  assert.equal(sort,'rgb(46, 96, 125)');
  for(const width of [1100,430]) {await size(width);await capture('pro-add-pokemon',width);}
  for(const theme of ['light','dark']) {
    await evaluate('PS.prefs.set("theme",'+JSON.stringify(theme)+');');
    const native=await record(theme+'-native');
    assert.notEqual(native.card.background,'rgb(27, 57, 77)');
    assert.notEqual(native.divider.background,'rgb(23, 39, 52)');
  }
  console.log('IV picker headings, Pokémon cards/search, Public hover/focus, coverage toggle/layout and native themes passed.');
};
