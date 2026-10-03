const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { GenericProvider } = require('electron-updater/out/providers/GenericProvider');
const { appUpdateFixture } = require('../scripts/app-update-fixture.cjs');

test('real update providers resolve Windows, macOS and Linux fixture manifests, including ARM and cache queries', async t => {
  let corrupt = false;
  const requests = [];
  const server = http.createServer(appUpdateFixture({ version: () => '99.1.0', corrupt: () => corrupt, onRequest: pathname => requests.push(pathname) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const previousArch = process.env.TEST_UPDATER_ARCH;
  try {
    for (const [platform, arch, channel] of [['win32', 'x64', 'latest.yml'], ['darwin', 'x64', 'latest-mac.yml'], ['darwin', 'arm64', 'latest-mac.yml'], ['linux', 'x64', 'latest-linux.yml'], ['linux', 'arm64', 'latest-linux-arm64.yml']]) {
      process.env.TEST_UPDATER_ARCH = arch;
      const provider = new GenericProvider({ url }, { isAddNoCacheQuery: true }, { platform, executor: {} });
      provider.httpRequest = async requested => {
        const response = await fetch(requested, { signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200, `${platform}/${arch}: ${requested}`);
        assert.ok(new URL(requested).search, 'Provider cache query must be handled');
        return response.text();
      };
      const metadata = await provider.getLatestVersion();
      assert.equal(metadata.version, '99.1.0');
      assert.ok(requests.includes('/' + channel));
      const download = provider.resolveFiles(metadata)[0];
      const hash = async () => crypto.createHash('sha512').update(Buffer.from(await (await fetch(download.url)).arrayBuffer())).digest('base64');
      assert.equal(await hash(), metadata.files[0].sha512);
      corrupt = true;
      assert.notEqual(await hash(), metadata.files[0].sha512, 'Tampered bytes must fail the original checksum');
      corrupt = false;
    }
    assert.equal((await fetch(url + '/unknown.yml')).status, 404, 'Missing endpoints must still fail');
  } finally {
    if (previousArch === undefined) delete process.env.TEST_UPDATER_ARCH;
    else process.env.TEST_UPDATER_ARCH = previousArch;
  }
});
