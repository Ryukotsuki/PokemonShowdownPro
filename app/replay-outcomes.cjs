const {replayUrl}=require('./preferences.cjs');
const userId=name=>String(name || '').toLowerCase().replace(/[^a-z0-9]/g,'');
function replayOutcome(log, player) {
  const own=userId(player);
  if(!own || typeof log!=='string')return null;
  const lines=log.split('\n'),players=new Set();
  let winner=null,tied=false;
  for(const line of lines) {
    if(line.startsWith('|player|')) {
      const [, , side, name]=line.split('|');
      if(side==='p1' || side==='p2')players.add(userId(name));
    }
    if(line.startsWith('|win|'))winner=userId(line.slice(5));
    if(line==='|tie' || line==='|tie|')tied=true;
  }
  if(!players.has(own))return null;
  if(tied)return 'tie';
  return winner && players.has(winner) ? (winner===own?'win':'loss') : null;
}
async function fetchReplayOutcome(url,player,fetcher=fetch) {
  if(!replayUrl(url) || !userId(player))return null;
  try {
    const response=await fetcher(url+'.log',{credentials:'omit',signal:AbortSignal.timeout(8000)});
    if(!response.ok)return null;
    const log=await response.text();
    if(log.length>8*1024*1024)return null;
    return replayOutcome(log,player);
  } catch { return null; }
}
module.exports={replayOutcome,fetchReplayOutcome};
