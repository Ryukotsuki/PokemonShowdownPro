const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalize,valid,defaults}=require('../app/theater-layout.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('Theater layout clamps sizes and rejects invalid IPC settings',()=>{
 for(const value of [undefined,null,[],false,'bad'])assert.deepEqual(normalize(value),defaults);
 assert.deepEqual(normalize({width:900,chatShare:-2,chatCollapsed:true,calcCollapsed:1}),{width:640,chatShare:0.25,chatCollapsed:true,calcCollapsed:false});
 assert.equal(valid({...defaults}),true);
 for(const value of [null,{...defaults,width:100},{...defaults,width:Infinity},{...defaults,calcCollapsed:1},{...defaults,chatShare:0.9},{...defaults,extra:true}])assert.equal(valid(value),false);
});
test('Theater sizes and collapse states persist without enabling Theater at startup',()=>{
 const {loadPreferences,savePreferences}=require('../app/preferences.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pro-theater-'));
 try{
  const file=path.join(directory,'preferences.json'),prefs=loadPreferences(file);
  assert.deepEqual(prefs.theaterLayout,defaults);
  prefs.theaterLayout={width:420,chatShare:0.4,chatCollapsed:true,calcCollapsed:true};savePreferences(file,prefs);
  const restored=loadPreferences(file);assert.deepEqual(restored.theaterLayout,prefs.theaterLayout);assert.equal(restored.theaterMode,undefined);
 }finally{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});}
});
test('Showdex Theater semantic hooks use native components and fail on incompatible source',()=>{
 const {transform}=require('../scripts/showdex-theater.cjs');
 const root=path.join(__dirname,'../vendor/showdex/src');
 for(const [file,role] of [['components/calc/PlayerCalc/PlayerCalc.tsx','player'],['components/calc/PokeInfo/PokeInfo.tsx','info'],['components/calc/PokeMoves/PokeMoves.tsx','moves'],['components/calc/PokeStats/PokeStats.tsx','stats'],['components/calc/FieldCalc/FieldCalc.tsx','field']])assert.ok(transform(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),'/'+file).includes('data-pro-calc="'+role+'"'));
 assert.ok(transform(fs.readFileSync(path.join(root,'components/calc/PokeStats/PokeStats.tsx'),'utf8').replace(/\r\n/g,'\n'),'/components/calc/PokeStats/PokeStats.tsx').includes('data-pro-calc-genetics'));
 assert.throws(()=>transform('changed','/components/calc/PlayerCalc/PlayerCalc.tsx'),/anchor changed/);
});
