// Fixed-origin replay API. Never accept a caller-provided fetch destination.
const origin='https://replay.pokemonshowdown.com';
function replayTarget(value) {
  if(typeof value!=='string'||value.length>500)return null;
  try {
    const url=new URL(value.trim());
    if(url.protocol!=='https:'||url.hostname!=='replay.pokemonshowdown.com'||url.port||url.username||url.password)return null;
    const id=url.pathname.slice(1).replace(/\.(?:json|log)$/,'');
    if(!/^[a-z0-9][a-z0-9-]*-\d+(?:-[a-z0-9]+pw)?$/i.test(id))return null;
    return {id,url:origin+'/'+id,p2:url.searchParams.has('p2')};
  }catch{return null;}
}
function searchURL(query={}) {
  if(!query||typeof query!=='object')throw Error('Invalid replay search.');
  if(query.private!==undefined&&typeof query.private!=='boolean')throw Error('Invalid replay visibility.');
  const username=String(query.username||'').trim(),format=String(query.format||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(username.length>100||String(query.format||'').length>100)throw Error('Replay search is too long.');
  const page=query.page??1;
  if(!Number.isInteger(page)||page<1||page>1000)throw Error('Invalid replay page.');
  if(!username&&!format&&!query.private)return origin+'/api/replays/recent';
  const params=new URLSearchParams({username,format,page:String(page)});
  if(query.sort==='rating'&&format&&!username)params.set('sort','rating');
  return origin+'/api/replays/'+(query.private?'searchprivate':'search')+'?'+params;
}
async function readText(url,fetcher,credentials='omit') {
  const response=await fetcher(url,{credentials,redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(response.status===404?'Replay not found. Check the link or private replay password.':'The replay server is unavailable. Try again.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw Error('Replay response is too large.');chunks.push(Buffer.from(value));}}
  finally {await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks).toString('utf8');
}
async function readJSON(url,fetcher,credentials='omit') {
  const text=(await readText(url,fetcher,credentials)).replace(/^\]/,'');
  try {return JSON.parse(text);}catch{throw Error('The replay server returned an unreadable response.');}
}
async function replayAccount(fetcher=fetch) {
  const text=await readText(origin+'/api/replays/check-login',fetcher,'include');
  const userid=/^\]([a-z0-9]*),/.exec(text)?.[1]||'';
  return {userid};
}
async function searchReplays(query,fetcher=fetch) {
  let value=query;
  if(query?.private){
    const account=await replayAccount(fetcher);
    if(!account.userid)throw Error('Log in to Showdown to view your private replays.');
    value={...query,username:account.userid,sort:'date'};
  }
  const data=await readJSON(searchURL(value),fetcher,value?.private?'include':'omit');
  if(!Array.isArray(data))throw Error(typeof data?.actionerror==='string'?data.actionerror:'Replay search is unavailable.');
  const results=[];
  for(const item of data.slice(0,51)) {
    const target=replayTarget(origin+'/'+item.id+(item.password?'-'+item.password+'pw':''));
    if(!target||!Array.isArray(item.players)||item.players.length<2)continue;
    const own=String(value?.username||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const p2=own&&String(item.players[1]).toLowerCase().replace(/[^a-z0-9]/g,'')===own;
    results.push({url:target.url+(p2?'?p2':''),players:item.players.slice(0,4).map(name=>String(name).slice(0,100)),format:String(item.format||'').slice(0,100),rating:Number(item.rating)||null,uploadtime:Number(item.uploadtime)||null});
  }
  return {results:results.slice(0,50),hasMore:results.length>50&&!!(value?.username||value?.format)};
}
async function loadReplay(url,fetcher=fetch) {
  const target=replayTarget(url);if(!target)throw Error('Enter a Pokémon Showdown replay link.');
  const data=await readJSON(target.url+'.json',fetcher);
  if(typeof data?.log!=='string'||!data.log.includes('|player|')||!Array.isArray(data.players))throw Error('Replay not found or unavailable.');
  // Preserve the public battle/chat log. Private choices and connection/room
  // lifecycle do not belong in a disconnected native replay room.
  const excluded=/^\|(?:request|sentchoice|init|deinit|expire|title|pm|popup|queryresponse|updateuser|challstr)\|/;
  const log=data.log.split('\n').filter(line=>line.startsWith('|')&&!excluded.test(line)).join('\n');
  return {...target,format:String(data.format||'Replay').slice(0,100),players:data.players.slice(0,4).map(name=>String(name).replace(/[\r\n|]/g,'').slice(0,100)),log};
}
module.exports={replayTarget,searchURL,searchReplays,loadReplay,replayAccount};
