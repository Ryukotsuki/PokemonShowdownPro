const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const css=require('../scripts/showdex-pro-css.cjs');
const source=require('../scripts/showdex-pro-source.cjs');
test('palette additions are scoped, preserve native rules and never change geometry',()=>{
  const native='.panel.dark{background:#121212;color:#fff;width:240px;padding:8px}@media(max-width:600px){.panel{border:1px solid #888}}';
  const result=css.transform(native,'/Panel.module.scss');
  assert.ok(result.startsWith('.panel.dark{background:#121212;color:#fff;width:240px;padding:8px}'));
  assert.match(result,/:global\(html.showdex-pro\) .panel.dark/);
  assert.equal((result.match(/width:240px/g)||[]).length,1);
  assert.equal((result.match(/padding:/g)||[]).length,1);
  assert.match(result,/@media[^@]+:global\(html.showdex-pro\) .panel/);
});
test('images, semantic colors and transparency survive palette mapping',()=>{
  const image='url("data:image/svg+xml,<svg fill=\'#ffffff\'/>")';
  assert.equal(css.recolor(image,'background'),image);
  assert.equal(css.recolor('#ff0000 #00ff00 #ff9900','color'),'#ff0000 #00ff00 #ff9900');
  assert.equal(css.recolor('rgba(255, 255, 255, 0.15)','background-color'),'rgba(28, 57, 77, 0.15)');
  assert.equal(css.recolor('rgba(0, 0, 0, 0)','background-color'),'rgba(16, 37, 54, 0)');
  for(const component of ['PokeType','PokeStatus','PokeHpBar','MoveCategoryField'])assert.equal(css.transform('.icon{color:#fff}',`/${component}/${component}.module.scss`),'.icon{color:#fff}');
});
test('gradient text retains clipping and hover background positions',()=>{
  const result=css.transform('.logo{background:linear-gradient(#2196f3,#fff);background-clip:text}.logo:hover{background-clip:border-box;background-position:100% 0}','/Logo.module.scss');
  assert.match(result,/:global\(html.showdex-pro\) .logo\{[^}]*background-clip:text !important/);
  assert.match(result,/:global\(html.showdex-pro\) .logo:hover\{background-clip:border-box !important;background-position:100% 0 !important/);
});
test('patches match the pinned upstream files and route Pro through its persisted preference',()=>{
  for(const file of ['interfaces/app/ShowdexSettings.ts','utils/host/getColorScheme.ts','pages/Bootdex/BootdexPreactAdapter.ts','redux/store/showdexSlice.ts','components/layout/PageContainer/PageContainer.tsx','pages/Hellodex/SettingsPane/GeneralSettingsPane.tsx']){
    const content=fs.readFileSync(path.join(__dirname,'../vendor/showdex/src',file),'utf8').replace(/\r\n/g,'\n');
    const result=source.transform(content,'/'+file);
    assert.notEqual(result,content);
    if(file.includes('showdexSlice'))assert.match(result,/forcedScheme === 'pro' \? 'dark'/);
    if(file.includes('GeneralSettings'))assert.match(result,/option === 'pro' \? 'Pro'/);
    if(file.includes('getColorScheme'))assert.match(result,/case 'pro': return 'dark'/);
    if(file.includes('BootdexPreactAdapter'))assert.match(result,/prefs.theme as string\) === 'pro' \? 'dark' : prefs.theme/);
  }
  assert.throws(()=>source.transform('changed upstream','/redux/store/showdexSlice.ts'),/anchor changed/);
});
