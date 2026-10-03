const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const yaml=require('js-yaml');
const workflow=yaml.load(fs.readFileSync(path.join(__dirname,'../.github/workflows/release.yml'),'utf8'));
const run=workflow.jobs.resolve.steps.find(step=>step.id==='release').run;
const source=/^node <<'NODE'\n([\s\S]*?)\nNODE\s*$/.exec(run)?.[1];
assert.ok(source,'Release validation must run the tested inline Node script');
const commit='a'.repeat(40),annotated='b'.repeat(40);
const base='https://api.github.com/repos/Ryukotsuki/PokemonShowdownPro';
const packageFile=version=>({encoding:'base64',content:Buffer.from(JSON.stringify({version})).toString('base64')});

async function resolve({tag='v1.0.0',responses={},fetchError}={}) {
  const calls=[],output=[],messages=[];
  const process={env:{RELEASE_TAG:tag,GITHUB_REPOSITORY:'Ryukotsuki/PokemonShowdownPro',GITHUB_API_URL:'https://api.github.com',GH_TOKEN:'test-token',GITHUB_OUTPUT:'test-output'}};
  const defaults={'':{},'/git/ref/tags/v1.0.0':{object:{type:'commit',sha:commit}},['/contents/package.json?ref='+commit]:packageFile('1.0.0')};
  await vm.runInNewContext(source,{
    process,Buffer,AbortSignal,
    require:name=>{assert.equal(name,'node:fs');return {appendFileSync:(file,data)=>{assert.equal(file,'test-output');output.push(data);}};},
    console:{log:message=>messages.push(message),error:message=>messages.push(message)},
    fetch:async(url,options)=>{
      assert.equal(options.headers.Authorization,'Bearer test-token');
      assert.ok(options.signal);
      assert.ok(url.startsWith(base));
      calls.push(url.slice(base.length));
      if(fetchError)throw fetchError;
      const route=url.slice(base.length),data=Object.hasOwn(responses,route)?responses[route]:defaults[route];
      if(typeof data==='number')return {status:data,ok:false};
      assert.notEqual(data,undefined,`Unexpected request ${route}`);
      return {status:200,ok:true,json:async()=>data};
    }
  },{timeout:1000});
  return {calls,output,messages,exitCode:process.exitCode};
}

test('release validation authenticates private-repository reads and pins every job to the resolved commit',async()=>{
  const result=await resolve();
  assert.equal(result.exitCode,undefined);
  assert.deepEqual(result.output,[`commit=${commit}\n`]);
  assert.match(result.messages.join('\n'),new RegExp(commit));
  assert.equal(workflow.jobs.build.needs,'resolve');
  assert.equal(workflow.jobs.build.with.ref,'${{ needs.resolve.outputs.commit }}');
  assert.deepEqual(workflow.jobs.upload.needs,['resolve','build']);
  const checkout=workflow.jobs.upload.steps.find(step=>step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref,'${{ needs.resolve.outputs.commit }}');
  assert.equal(workflow.permissions.contents,'read');
});

test('missing release tags stop before building with a clear message and no branch fallback',async()=>{
  const result=await resolve({responses:{'/git/ref/tags/v1.0.0':404}});
  assert.equal(result.exitCode,1);
  assert.deepEqual(result.output,[]);
  assert.deepEqual(result.calls,['','/git/ref/tags/v1.0.0']);
  assert.match(result.messages.join('\n'),/Release tag v1.0.0 does not exist/);
});

test('release validation peels annotated tags and rejects tags that do not resolve to commits',async()=>{
  const responses={'/git/ref/tags/v1.0.0':{object:{type:'tag',sha:annotated}},['/git/tags/'+annotated]:{object:{type:'commit',sha:commit}}};
  const valid=await resolve({responses});
  assert.deepEqual(valid.output,[`commit=${commit}\n`]);
  const invalid=await resolve({responses:{'/git/ref/tags/v1.0.0':{object:{type:'tree',sha:commit}}}});
  assert.equal(invalid.exitCode,1);
  assert.deepEqual(invalid.output,[]);
  assert.match(invalid.messages.join('\n'),/must point to a source commit/);
});

test('release validation rejects invalid tag inputs and package version mismatches before publishing a source',async()=>{
  for(const tag of ['1.0.0','main','v1.0.0; echo injected','v1.0.0-beta','v01.0.0']) {
    const result=await resolve({tag});
    assert.equal(result.exitCode,1);
    assert.deepEqual(result.calls,[]);
    assert.deepEqual(result.output,[]);
  }
  const result=await resolve({responses:{['/contents/package.json?ref='+commit]:packageFile('1.0.1')}});
  assert.equal(result.exitCode,1);
  assert.deepEqual(result.output,[]);
  assert.match(result.messages.join('\n'),/must match the package version/);
});

test('repository access and network failures remain failures without exposing authentication',async()=>{
  for(const status of [401,403,404,500]) {
    const result=await resolve({responses:{'':status}});
    assert.equal(result.exitCode,1);
    assert.deepEqual(result.output,[]);
    assert.equal(result.messages.join('\n').includes('test-token'),false);
    assert.deepEqual(result.calls,['']);
  }
  const offline=await resolve({fetchError:new Error('test connection reset')});
  assert.equal(offline.exitCode,1);
  assert.match(offline.messages.join('\n'),/Could not connect to GitHub/);
});
