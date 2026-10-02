const fs=require('node:fs');
const path=require('node:path');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
module.exports=async(wc,root)=>{
  const out=path.join(root,'test-results/builder-theme');fs.mkdirSync(out,{recursive:true});
  if(process.argv.includes('--cached-builder')) return require('./verify-builder.cjs')(root,out);
  const evaluate=code=>wc.executeJavaScript(`(()=>{${code}})()`);
  const capture=async(name,id='teambuilder')=>{
    const data=await evaluate(`const r=app.rooms[${JSON.stringify(id)}].el;return {id:r.id,classes:r.className,html:r.innerHTML};`);
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));console.log('Captured '+name);
  };
  await evaluate("OptionsPopup.prototype.setTheme({currentTarget:{value:'pro'}}); app.joinRoom('view-seasonladder');");
  for(let n=0;n<100;n++){await pause(250);if(await evaluate("return !!app.rooms['view-seasonladder']?.el?.querySelector('a.button');")) break;}
  await capture('seasons','view-seasonladder');
  await evaluate(`app.socket.send=()=>{}; window.__showdownPro.setAutoTimer(false); app.addRoom('teambuilder'); app.focusRoom('teambuilder');
    const sets=[{name:'',species:'Alomomola',item:'Heavy-Duty Boots',ability:'Regenerator',nature:'Bold',teraType:'Water',level:100,evs:{hp:252,def:252,spd:4},ivs:{},moves:['Wish','Protect','Flip Turn','Scald']},{name:'',species:'Dragonite',item:'Heavy-Duty Boots',ability:'Multiscale',nature:'Adamant',teraType:'Normal',level:100,evs:{atk:252,spe:252,spd:4},ivs:{},moves:['Dragon Dance','Extreme Speed','Earthquake','Roost']}];
    window.auditSets=sets;
    Storage.teams=[{name:'Rain balance',format:'gen9ou',capacity:6,team:Storage.packTeam(sets),folder:'',gen:9,dex:Dex.forGen(9)},{name:'A team with a longer name for doubles',format:'gen9doublesou',capacity:6,team:Storage.packTeam(sets),folder:'Doubles',gen:9,dex:Dex.forGen(9)}];
    const r=app.rooms.teambuilder;r.teams=Storage.teams;r.curTeam=null;r.curSet=null;r.update();`);
  await capture('teams');
  await evaluate('const r=app.rooms.teambuilder;r.exportMode=true;r.update();');await capture('backup');
  await evaluate(`const r=app.rooms.teambuilder;r.exportMode=false;r.curTeam=Storage.teams[0];r.curTeamLoc=0;r.curSetList=structuredClone(auditSets);r.formatResources||={};r.updateTeamView();`);
  await capture('team-editor');
  await evaluate('const r=app.rooms.teambuilder;r.curSetList=[];r.updateTeamView();');await capture('empty-team');
  await evaluate('const r=app.rooms.teambuilder;r.curSetList=structuredClone(auditSets);r.updateTeamView();');
  for(const chart of ['pokemon','details','stats','move','item','ability']) {
    await evaluate(`const r=app.rooms.teambuilder;r.curSet=r.curSetList[0];r.curSetLoc=0;r.updateSetView();r.curChartType=${JSON.stringify(chart)};r.curChartName=${JSON.stringify(chart==='move'?'move1':chart)};r.updateChart(true);`);
    await capture('pokemon-'+chart);
  }
  await evaluate('const r=app.rooms.teambuilder;r.curSet=null;r.exportMode=true;r.updateTeamView();');await capture('import-export');
  await evaluate(`const r=app.rooms.teambuilder;r.exportMode=false;r.curSetList.push({name:'',species:'',item:'',ability:'',moves:[]});r.curSetLoc=r.curSetList.length-1;r.curSet=r.curSetList[r.curSetLoc];r.updateSetView();r.curChartType='pokemon';r.curChartName='pokemon';r.updateChart(true);`);
  await capture('pokemon-new');
  for(const mode of ['singles','doubles','triples']) {
    const id='battle-gen9customgame-'+({singles:911,doubles:912,triples:913}[mode]);
    const names=[['Kyogre','Raging Bolt','Dragonite'],['Magmar','Calyrex-Ice','Alomomola']];
    const count={singles:1,doubles:2,triples:3}[mode];
    const lines=['|init|battle','|title|Theme vs. Layout','|gametype|'+mode,'|player|p1|Theme|1','|player|p2|Layout|2','|gen|9','|tier|[Gen 9] Custom Game','|teamsize|p1|3','|teamsize|p2|3','|start'];
    for(let side=0;side<2;side++)for(let slot=0;slot<count;slot++)lines.push(`|switch|p${side+1}${String.fromCharCode(97+slot)}: ${names[side][slot]}|${names[side][slot]}, L84|100/100`);
    lines.push('|turn|1');
    await evaluate(`app.receive(${JSON.stringify('>'+id+'\n'+lines.join('\n'))}); app.focusRoom(${JSON.stringify(id)}); app.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
    await pause(1000);await capture(mode,id);
    if(mode==='doubles') {
      await evaluate(`app.rooms[${JSON.stringify(id)}].battle.switchViewpoint(); app.rooms[${JSON.stringify(id)}].battle.seekTurn(Infinity);`);
      await pause(500);await capture('doubles-reversed',id);
    }
  }
  await require('./verify-builder.cjs')(root,out);
};
