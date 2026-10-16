const {test}=require('node:test'),assert=require('node:assert/strict');
const {replayTarget,searchURL,searchReplays,loadReplay,replayAccount}=require('../app/replays.cjs');
const response=value=>async()=>new Response(typeof value==='string'?value:JSON.stringify(value));
test('replay URLs accept official public/private links and viewpoint, reject other destinations',()=>{
 assert.deepEqual(replayTarget('https://replay.pokemonshowdown.com/gen9ou-123-Secretpw?p2'),{id:'gen9ou-123-Secretpw',url:'https://replay.pokemonshowdown.com/gen9ou-123-Secretpw',p2:true});
 assert.equal(replayTarget('https://replay.pokemonshowdown.com/gen9ou-123.json').id,'gen9ou-123');
 for(const url of ['https://evil.test/gen9ou-123','http://replay.pokemonshowdown.com/gen9ou-123','https://replay.pokemonshowdown.com.evil.test/gen9ou-123','https://me@replay.pokemonshowdown.com/gen9ou-123','https://replay.pokemonshowdown.com/api/replays/recent','https://replay.pokemonshowdown.com/../foo','https://replay.pokemonshowdown.com/gen9ou-123/extra'])assert.equal(replayTarget(url),null);
});
test('replay discovery uses official recent and paginated search endpoints',async()=>{
 assert.equal(searchURL({}),'https://replay.pokemonshowdown.com/api/replays/recent');
 const url=new URL(searchURL({username:'Player, Opponent',format:'Gen 9 OU',page:2,sort:'rating'}));assert.equal(url.searchParams.get('username'),'Player, Opponent');assert.equal(url.searchParams.get('format'),'gen9ou');assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.has('sort'),false);
 assert.ok(searchURL({format:'gen9ou',sort:'rating'}).endsWith('&sort=rating'));
 for(const page of [-1,0,Infinity,1.5,1001])assert.throws(()=>searchURL({page}));
 const items=Array.from({length:51},(_,i)=>({id:'gen9ou-'+(i+1),players:['A','B'],format:'[Gen 9] OU',uploadtime:123,rating:1600}));
 const data=await searchReplays({username:'A'},response(']'+JSON.stringify(items)));assert.equal(data.results.length,50);assert.equal(data.hasMore,true);assert.equal(data.results[0].url,'https://replay.pokemonshowdown.com/gen9ou-1');
 await assert.rejects(searchReplays({},response({actionerror:'Search is busy'})),/Search is busy/);
});
test('replay logs retain battle mechanics and public chat while excluding private choices and room lifecycle',async()=>{
 const log='|player|p1|A\n|player|p2|B\n|request|{"side":{"id":"p1"}}\n|c|A|Hi\n|raw|<button>bad</button>\n>battle-other-42\n|init|battle\n|start\n|turn|1\n|move|p1a: A|Tackle|p2a: B\n|-damage|p2a: B|50/100\n|win|A';
 const replay=await loadReplay('https://replay.pokemonshowdown.com/gen9ou-123?p2',response({players:['A','B'],format:'OU',log}));
 assert.equal(replay.p2,true);assert.ok(replay.log.includes('|move|'));assert.ok(replay.log.includes('|win|A'));assert.ok(!replay.log.includes('request'));assert.ok(replay.log.includes('|c|A|Hi'));assert.ok(replay.log.includes('|raw|'));assert.ok(!replay.log.includes('>battle-'));assert.ok(!replay.log.includes('|init|'));
 await assert.rejects(loadReplay('https://evil.test/123',()=>assert.fail('No arbitrary fetch')),/replay link/);
 await assert.rejects(loadReplay('https://replay.pokemonshowdown.com/gen9ou-123',response({})),/not found/);
 await assert.rejects(loadReplay('https://replay.pokemonshowdown.com/gen9ou-123',async()=>new Response('',{status:404})),/not found/);
 await assert.rejects(loadReplay('https://replay.pokemonshowdown.com/gen9ou-123',response('not JSON')),/unreadable/);
});
test('oversized replay responses stop reading rather than allocating an unbounded log',async()=>{
 await assert.rejects(loadReplay('https://replay.pokemonshowdown.com/gen9ou-123',response(' '.repeat(8*1024*1024+1))),/too large/);
});
test('private discovery authenticates with the client session and only searches that account',async()=>{
 const requests=[];
 const fetcher=async(url,options)=>{
  requests.push({url,credentials:options.credentials});
  if(url.endsWith('/check-login'))return new Response(']protest,');
  return new Response(']'+JSON.stringify([{id:'gen9ou-123',password:'Secret',players:['Opponent','ProTest'],format:'OU'}]));
 };
 assert.deepEqual(await replayAccount(fetcher),{userid:'protest'});
 const result=await searchReplays({private:true,username:'Someone else',format:'gen9ou',page:2},fetcher);
 const target=new URL(requests.at(-1).url);assert.equal(target.pathname,'/api/replays/searchprivate');assert.equal(target.searchParams.get('username'),'protest');assert.equal(target.searchParams.get('page'),'2');assert.ok(requests.every(request=>request.credentials==='include'));
 assert.equal(result.results[0].url,'https://replay.pokemonshowdown.com/gen9ou-123-Secretpw?p2');
 await assert.rejects(searchReplays({private:true},response('],')),/Log in to Showdown/);
 assert.throws(()=>searchURL({private:'yes'}),/visibility/);
});
