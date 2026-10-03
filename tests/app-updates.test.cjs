const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { AppUpdates, updateMode, releaseDownload, newerVersion } = require('../app/app-updates.cjs');
const { loadPreferences, savePreferences } = require('../app/preferences.cjs');
const { prepare } = require('../scripts/prepare-update-metadata.cjs');
const { merge } = require('../scripts/merge-update-metadata.cjs');
const yaml = require('js-yaml');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-app-update-'));
  t.after(() => { assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
function setup(t, overrides = {}) {
  const directory = fixture(t), native = new EventEmitter();
  let checks = 0, downloads = 0, installs = 0, idle = true, enabled = true, time = 200000000;
  native.checkForUpdates = async () => { checks++; return { updateInfo: { version: '1.1.0' } }; };
  native.downloadUpdate = async () => { downloads++; native.emit('download-progress', { percent: 45 }); native.emit('update-downloaded', { version: '1.1.0' }); };
  native.quitAndInstall = (silent, restart) => { assert.equal(restart, true); installs++; };
  const options = { app: { isPackaged: true, getPath: () => directory, getVersion: () => '1.0.0' },
    distribution: 'public', platform: 'win32', execPath: process.execPath, env: {}, exists: () => true,
    createUpdater: () => native, canInstall: () => idle, enabled: () => enabled, now: () => time, ...overrides };
  const updates = new AppUpdates(options);
  return { updates, native, options, idle: value => { idle = value; }, enabled: value => { enabled = value; }, time: value => { time = value; }, counts: () => ({ checks, downloads, installs }) };
}
test('only installed public Windows and persistent Linux AppImages use automatic installers', () => {
  const base = { packaged: true, distribution: 'public', env: {}, platform: 'win32', execPath: process.execPath, exists: () => true };
  assert.equal(updateMode(base), 'automatic');
  assert.equal(updateMode({ ...base, exists: () => false }), 'manual');
  assert.equal(updateMode({ ...base, platform: 'darwin' }), 'manual');
  assert.equal(updateMode({ ...base, platform: 'linux' }), 'manual');
  assert.equal(updateMode({ ...base, platform: 'linux', env: { APPIMAGE: path.resolve('Pro.AppImage') } }), 'automatic');
  assert.equal(updateMode({ ...base, platform: 'linux', env: { APPIMAGE: path.resolve('.mount_pro/Pro.AppImage') } }), 'manual');
  assert.equal(updateMode({ ...base, distribution: 'private' }), 'private');
  assert.equal(updateMode({ ...base, packaged: false }), 'development');
});
test('downloaded update waits for explicit restart and rechecks battles at installation', async t => {
  const fixture = setup(t);
  await fixture.updates.check();
  assert.equal(fixture.updates.snapshot().status, 'ready');
  assert.equal(fixture.native.autoInstallOnAppQuit, false);
  assert.equal(fixture.native.allowPrerelease, false);
  assert.deepEqual(fixture.counts(), { checks: 1, downloads: 1, installs: 0 });
  fixture.idle(false); assert.equal(fixture.updates.snapshot().canRestart, false);
  await fixture.updates.action(); assert.equal(fixture.counts().installs, 0);
  fixture.idle(true); await fixture.updates.action(); assert.equal(fixture.counts().installs, 1);
});
test('automatic preference, battles and saved daily throttle are respected; manual check overrides them', async t => {
  const fixture = setup(t);
  fixture.enabled(false); await fixture.updates.check(); assert.equal(fixture.counts().checks, 0);
  fixture.enabled(true); fixture.idle(false); await fixture.updates.check(); assert.equal(fixture.counts().checks, 0);
  fixture.native.checkForUpdates = async () => ({ updateInfo: { version: '1.0.0' } });
  await fixture.updates.check(true); assert.equal(fixture.updates.status, 'current');
  const restarted = new AppUpdates(fixture.options);
  fixture.idle(true); await restarted.check(); assert.equal(restarted.status, 'idle');
  fixture.time(200000000 + 86400001); await restarted.check(); assert.equal(restarted.status, 'current');
  const preferences = loadPreferences(path.join(fixture.options.app.getPath(), 'preferences.json'));
  assert.equal(preferences.autoUpdateApp, true);
  preferences.autoUpdateApp = false;
  savePreferences(path.join(fixture.options.app.getPath(), 'preferences.json'), preferences);
  assert.equal(loadPreferences(path.join(fixture.options.app.getPath(), 'preferences.json')).autoUpdateApp, false);
});
test('checksum or network errors preserve current install and can be retried', async t => {
  const fixture = setup(t);
  fixture.native.downloadUpdate = async () => { fixture.native.emit('error', new Error('checksum mismatch')); throw new Error('checksum mismatch'); };
  await fixture.updates.check(true);
  assert.equal(fixture.updates.status, 'error'); assert.equal(fixture.updates.busy, false);
  await fixture.updates.action(); assert.equal(fixture.counts().installs, 0);
  fixture.native.downloadUpdate = async () => fixture.native.emit('update-downloaded', { version: '1.1.0' });
  await fixture.updates.check(true); assert.equal(fixture.updates.status, 'ready');
});
test('only one check runs, and stopping during a download prevents installation', async t => {
  const fixture = setup(t);
  let finish;
  fixture.native.checkForUpdates = () => new Promise(resolve => { finish = resolve; });
  const pending = fixture.updates.check(true);
  await fixture.updates.check(true); assert.equal(fixture.updates.busy, true);
  fixture.updates.stop(); finish({ updateInfo: { version: '1.1.0' } }); await pending;
  await fixture.updates.action(); assert.equal(fixture.counts().downloads, 0); assert.equal(fixture.counts().installs, 0);
});
test('private, development and audit instances never fetch or create an installer', async t => {
  for (const overrides of [{ distribution: 'private' }, { disabled: true }, { app: { isPackaged: false, getPath: () => fixture(t), getVersion: () => '1.0.0' } }]) {
    const fixture = setup(t, { ...overrides, createUpdater: () => { throw new Error('Must not initialize'); }, fetchRelease: () => { throw new Error('Must not fetch'); } });
    await fixture.updates.check(true); assert.equal(fixture.updates.snapshot().supported, false);
    assert.notEqual(fixture.updates.status, 'error');
  }
});
test('unsigned macOS fallback selects the right architecture and opens only a verified project asset', async t => {
  const url = 'https://github.com/Ryukotsuki/PokemonShowdownPro/releases/download/v1.2.0/PokemonShowdownPro-1.2.0-macos-arm64.dmg';
  const release = { tag_name: 'v1.2.0', assets: [{ name: 'PokemonShowdownPro-1.2.0-macos-arm64.dmg', browser_download_url: url }] };
  const opened = [];
  const fixture = setup(t, { platform: 'darwin', arch: 'arm64', fetchRelease: async () => release, openExternal: async url => opened.push(url) });
  await fixture.updates.check(); assert.equal(fixture.updates.status, 'available'); assert.equal(fixture.updates.snapshot().canDownload, true);
  await fixture.updates.action(); assert.deepEqual(opened, [url]); assert.equal(fixture.counts().downloads, 0);
  assert.throws(() => releaseDownload(release, '1.0.0', 'darwin', 'x64'), /compatible/);
  assert.throws(() => releaseDownload({ ...release, assets: [{ ...release.assets[0], browser_download_url: 'https://evil.example/app.dmg' }] }, '1.0.0', 'darwin', 'arm64'), /compatible/);
  assert.equal(releaseDownload({ ...release, prerelease: true }, '1.0.0', 'darwin', 'arm64'), null);
  assert.equal(newerVersion('1.0.0', '1.0.0'), false);
  assert.equal(newerVersion('0.9.0', '1.0.0'), false);
  assert.equal(newerVersion('1.3.0-beta', '1.0.0'), false);
});
test('release metadata merges both Mac architectures without losing downloads or checksums', t => {
  const directory = fixture(t);
  for (const arch of ['x64', 'arm64']) {
    const name = `PokemonShowdownPro-1.0.0-macos-${arch}.zip`;
    fs.writeFileSync(path.join(directory, name), arch);
    fs.writeFileSync(path.join(directory, 'latest-mac.yml'), yaml.dump({ version: '1.0.0', files: [{ url: name, sha512: 'validhash', size: arch.length }] }));
    prepare(directory, 'darwin', arch);
  }
  const metadata = merge(directory);
  assert.equal(metadata.files.length, 2);
  assert.deepEqual(yaml.load(fs.readFileSync(path.join(directory, 'latest-mac.yml'), 'utf8')).files, metadata.files);
  const bad = JSON.parse(fs.readFileSync(path.join(directory, 'update-mac-arm64.json'))); bad.version = '1.1.0';
  fs.writeFileSync(path.join(directory, 'update-mac-arm64.json'), JSON.stringify(bad));
  assert.throws(() => merge(directory), /versions do not match/);
});
