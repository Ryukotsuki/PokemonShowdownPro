const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareUpdates}=require('../app/update-process.cjs');
const {AddonUpdates}=require('../app/addon-updates.cjs');

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pro-update-logs-'));
  const directory=path.join(root,'updates');
  fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
  // A small worker exercises real process failures without networking or test windows.
  fs.writeFileSync(path.join(root,'scripts/prepare-addon-updates.cjs'),`
    const fs=require('node:fs'),path=require('node:path');
    const stage=process.argv[2];
    const scenario=fs.readFileSync(path.join(__dirname,'../scenario'),'utf8');
    if(scenario==='fatal') {
      console.error('worker startup failed: test extractor unavailable');
      process.exit(1);
    }
    const errors=scenario==='failed'?['Showdex: the new version could not pass its update checks.']:[];
    if(errors.length)fs.writeFileSync(path.join(stage,'showdex-validation.log'),'actual audit failure: test client timeout');
    fs.writeFileSync(path.join(stage,'result.json'),JSON.stringify({errors}));
  `);
  const manager=new AddonUpdates({directory,prepare:prepareUpdates(root,directory)});
  t.after(()=>{
    manager.stop();
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(root,{recursive:true,force:true});
  });
  return {root,directory,manager,scenario:value=>fs.writeFileSync(path.join(root,'scenario'),value)};
}

test('add-on audit diagnostics survive generation cleanup and a later successful check',async t=>{
  const {directory,manager,scenario}=fixture(t);
  scenario('failed');await manager.check(true);
  assert.equal(manager.saved.failed,true);
  assert.deepEqual(fs.readdirSync(path.join(directory,'generations')),[]);
  const failure=fs.readFileSync(path.join(directory,'last-failure.log'),'utf8');
  assert.match(failure,/actual audit failure: test client timeout/);
  assert.match(failure,/Showdex: the new version/);
  scenario('current');await manager.check(true);
  assert.equal(manager.saved.failed,false);
  assert.match(manager.snapshot().message,/up to date/);
  assert.match(fs.readFileSync(path.join(directory,'last-check.log'),'utf8'),/No newer packages found/);
  assert.equal(fs.readFileSync(path.join(directory,'last-failure.log'),'utf8'),failure);
});

test('a worker that fails before producing a result retains its process error and output',async t=>{
  const {directory,manager,scenario}=fixture(t);
  scenario('fatal');await manager.check(true);
  assert.equal(manager.saved.failed,true);
  assert.match(fs.readFileSync(path.join(directory,'last-failure.log'),'utf8'),/worker startup failed: test extractor unavailable/);
  assert.match(fs.readFileSync(path.join(directory,'last-check.log'),'utf8'),/Update process exited with 1/);
  assert.deepEqual(fs.readdirSync(path.join(directory,'generations')),[]);
});
