const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../app/addons/team-sheet-import.js'),'utf8');
test('sheet parsing ignores headings, controls and blank formatting without inventing Pokemon',()=>{
 const species=new Set(['Charizard','Iron Treads','Iron Boulder','Miraidon','Rillaboom','Terapagos']);
 const context={Dex:{species:{get:name=>({name,exists:species.has(name)})}},importTeam:text=>[{species:text.split('\n')[0].split(' @ ')[0].replace(/ \([MF]\)$/,''),lines:text.split('\n')}]};
 vm.createContext(context);vm.runInContext(source,context);
 const text='Import\nImport\nOpen team sheet for Player\n\n'+[...species].map(name=>`${name} @ Leftovers\n\nAbility: Pressure\n\nTimid Nature\n\n- Tackle\n\nTera Type: Fairy`).join('\n\n')+'\nSome formatting text\nImport';
 const result=context.proSheetTeam(text);assert.equal(result.length,6);assert.deepEqual(Array.from(result,set=>set.species),[...species]);assert.ok(result.every(set=>set.lines.includes('Tera Type: Fairy')&&set.lines.includes('- Tackle')));
 assert.equal(context.proSheetTeam('Open team sheet\nImport\nAbility: Blaze').length,0);
});
