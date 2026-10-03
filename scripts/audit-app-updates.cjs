// Exercise electron-updater's real downloader and SHA-512 validation against a
// local release fixture. No installer is executed and no live feed is queried.
require('./mute-test-audio.cjs');
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { AppUpdates } = require('../app/app-updates.cjs');
const { NsisUpdater } = require('electron-updater');
const { appUpdateFixture } = require('./app-update-fixture.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-update-audit-'));
app.setPath('userData', directory);
app.setPath('cache', directory);
let server;
const deadline = setTimeout(() => { console.error('App updater audit timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  let corrupt = false, version = '99.1.0';
  const requests = [], errors = [];
  server = http.createServer(appUpdateFixture({ version: () => version, corrupt: () => corrupt, onRequest: pathname => requests.push(pathname) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = path.join(directory, 'app-update.yml');
  fs.writeFileSync(config, JSON.stringify({ provider: 'generic', url: `http://127.0.0.1:${server.address().port}`, updaterCacheDirName: 'fixture-update' }));
  const createUpdater = () => {
    const native = new NsisUpdater();
    native.forceDevUpdateConfig = true;
    native.updateConfigPath = config;
    native.disableDifferentialDownload = true;
    native.logger = { info() {}, warn() {}, error() {}, debug() {} };
    native.on('error', error => errors.push(error.stack || String(error)));
    native.quitAndInstall = () => { throw new Error('Audit must never execute an installer'); };
    return native;
  };
  const options = { app: { isPackaged: true, getPath: () => directory, getVersion: () => app.getVersion() }, platform: 'win32', env: {}, exists: () => true, createUpdater };
  const updates = new AppUpdates(options);
  await updates.check(true);
  assert.equal(updates.status, 'ready', `${updates.message}\nRequested: ${requests.join(', ')}\n${errors.join('\n')}`);
  assert.equal(updates.updater.autoInstallOnAppQuit, false);
  const channel = process.platform === 'darwin' ? 'latest-mac.yml' : process.platform === 'linux' ? `latest-linux${(process.env.TEST_UPDATER_ARCH || process.arch) === 'x64' ? '' : '-'+(process.env.TEST_UPDATER_ARCH || process.arch)}.yml` : 'latest.yml';
  assert.ok(requests.includes('/' + channel), `Host manifest ${channel} was not requested`);
  updates.stop();
  corrupt = true; version = '99.2.0';
  const invalid = new AppUpdates(options);
  await invalid.check(true);
  assert.equal(invalid.status, 'error', 'Tampered update was accepted');
  assert.ok(errors.some(error => /checksum mismatch/i.test(error)), `Expected a checksum rejection, got: ${errors.join('\n')}`);
  assert.equal(invalid.snapshot().canRestart, false);
  invalid.stop();
  console.log('App updater: real download passed; corrupted SHA-512 download rejected; installation disabled.');
}).then(async () => {
  clearTimeout(deadline);
  if (server) await new Promise(resolve => server.close(resolve));
  // Temp files are scoped to this audit; downloaded installers are inert fixtures.
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
  try { fs.rmSync(directory, { recursive: true, force: true }); }
  catch (error) { if (!['EPERM', 'EBUSY'].includes(error.code)) throw error; /* Chromium can retain its isolated profile lock until exit on Windows. */ }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
