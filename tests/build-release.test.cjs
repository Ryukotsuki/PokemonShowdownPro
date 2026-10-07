const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { buildRelease } = require('../scripts/build-release.cjs');

const busy = { code: 1, output: 'dmgbuild.core.DMGError: Unable to detach device cleanly: hdiutil: couldn\'t eject "disk2" - Resource busy\n' };
test('macOS DMG detach failure retries with bounded waits and preserves build arguments', async () => {
  const calls = [], waits = [];
  await buildRelease(['--x64'], { platform: 'darwin', root: '/project', env: { CI: 'true' }, log: () => {},
    wait: async ms => waits.push(ms), run: async (args, options) => { calls.push({ args, options }); return calls.length < 3 ? busy : { code: 0, output: '' }; } });
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [5000, 10000]);
  assert.deepEqual(calls[2], { args: ['--x64'], options: { root: '/project', env: { CI: 'true' } } });
});
test('persistent DMG failures still fail the build after three attempts', async () => {
  let attempts = 0;
  await assert.rejects(buildRelease(['--arm64'], { platform: 'darwin', log: () => {}, wait: async () => {},
    run: async () => { attempts++; return busy; } }), /packaging failed/);
  assert.equal(attempts, 3);
});
test('other packaging failures and terminated processes are never hidden or retried', async () => {
  for (const [platform, result] of [['darwin', { code: 1, output: 'Code signing failed' }], ['win32', busy], ['linux', busy], ['darwin', { ...busy, signal: 'SIGTERM' }]]) {
    let attempts = 0;
    await assert.rejects(buildRelease([], { platform, run: async () => { attempts++; return result; }, wait: async () => { throw new Error('Unexpected retry'); } }), /packaging failed/);
    assert.equal(attempts, 1);
  }
});
test('DMG excludes indexing before copying the app and retains the Applications shortcut and both downloads', () => {
  const root = path.resolve(__dirname, '..');
  const config = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'));
  assert.deepEqual(config.mac.target, ['dmg', 'zip']);
  assert.equal(config.dmg.contents[0].path, 'app/assets/dmg/.metadata_never_index');
  assert.ok(fs.existsSync(path.join(root, config.dmg.contents[0].path)));
  assert.deepEqual(config.dmg.contents[1], { x: 130, y: 220, type: 'file' });
  assert.equal(config.dmg.contents[2].path, '/Applications');
});
test('Linux release packaging finalizes AppImage updates and preserves a finalization failure',async()=>{
 const roots=[];
 await buildRelease(['--x64'],{platform:'linux',root:'/project',run:async()=>({code:0}),finalizeLinux:async options=>roots.push(options.root)});
 assert.deepEqual(roots,['/project']);
 await assert.rejects(buildRelease(['--x64'],{platform:'linux',run:async()=>({code:0}),finalizeLinux:async()=>{throw new Error('Invalid zsync');}}),/Invalid zsync/);
 await buildRelease(['--dir'],{platform:'linux',run:async()=>({code:0}),finalizeLinux:async()=>{throw new Error('Unpacked builds do not have an AppImage');}});
});
