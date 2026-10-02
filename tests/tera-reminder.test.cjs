const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function helpers(labels=[]) {
  const room={querySelectorAll:()=>labels.map(label=>({getAttribute:()=>label}))};
  const context={document:room,getUserBar:current=>current?'.leftbar':'.rightbar',beforeMarker:(value,marker)=>value.split(marker)[0],getStyleForUser:()=> 'right:2px;top:135px'};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/addons/tera-reminder.js'),'utf8'),context);
  return {...context,room};
}
test('Tera names use species without stray or nested parentheses and ignore status metadata',()=>{
  for(const label of ['Fish (Vaporeon) (active)', 'Fish ((Vaporeon)) (50%)', 'Fish (Vaporeon) (brn)', 'Fish (Vaporeon) (50%|brn)']) {
    const h=helpers([label]);
    for(const announcement of ['The opposing Fish has Terastallized into the Ghost-type!', '(The opposing Fish has Terastallized into the Ghost-type!)\n']) {
      assert.equal(h.getPkmnName(announcement,false,false,h.room),'Vaporeon');
    }
  }
  const h=helpers(['Vaporeon (0%) (fainted)']);
  assert.equal(h.getPkmnName('The opposing Vaporeon has Terastallized into the Ghost-type!',false,false,h.room),'Vaporeon');
  assert.equal(h.getPkmnName('The opposing (Vaporeon has Terastallized into the Ghost-type!',false,false,h.room),'Vaporeon');
});
test('name lookups stay in the current battle and quoted nicknames do not become CSS selectors',()=>{
  const h=helpers(['Other (Charizard)']),room={querySelectorAll:selector=>{assert.ok(!selector.includes('Water'));return [{getAttribute:()=> 'Water "friend" (Vaporeon) (active)'}];}};
  assert.equal(h.findRealPkmnName('Water "friend"',false,room),'Vaporeon');
  assert.equal(h.findRealPkmnName('Other',false,h.room),'Charizard');
});
test('nickname settings preserve intentional parentheses and names containing punctuation',()=>{
  const h=helpers(['Water (friend) (Vaporeon)']);
  assert.equal(h.getPkmnName('The opposing Water (friend) has Terastallized into the Ghost-type!',false,true,h.room),'Water (friend)');
  assert.equal(h.getPkmnName('The opposing Water (friend) has Terastallized into the Ghost-type!',false,false,h.room),'Vaporeon');
  assert.equal(h.getPkmnName('(The opposing Water (friend) has Terastallized into the Ghost-type!)',false,true,h.room),'Water (friend)');
  assert.equal(h.getPkmnName('(Water (friend) has Terastallized into the Ghost-type!)',true,false,h.room),'Vaporeon');
  assert.equal(h.getPkmnName("Farfetch'd has Terastallized into the Flying-type!",true,false,h.room),"Farfetch'd");
  assert.equal(h.getPkmnName('The opposing Fish (Vaporeon) has Terastallized into the Ghost-type!',false,false,h.room),'Vaporeon');
});
test('reminder markup escapes names and preserves supported custom font and color settings',()=>{
  const h=helpers();const markup=h.getTeraInfo(h.room,'<Vaporeon>','Ghost',13,'#ffcc00',false);
  assert.match(markup,/&lt;Vaporeon&gt;/);assert.match(markup,/font-size:13px/);assert.match(markup,/--dit-text-color:#ffcc00/);assert.match(markup,/aria-label="Dismiss opponent's Tera reminder"/);
  assert.ok(!h.getTeraInfo(h.room,'Vaporeon','Ghost',999,'red;background:url(x)',true).includes('url(x)'));
});
