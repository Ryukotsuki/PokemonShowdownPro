const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {runProcess} = require('../app/update-process.cjs');
const {desktopEntry, execQuote} = require('../app/linux-integration.cjs');

module.exports = async function verifyLinuxShortcuts(dist) {
  if (process.platform !== 'linux') return;
  const files = await fs.readdir(dist);
  const tar = files.find(file => file.endsWith(`-linux-${process.arch}.tar.gz`));
  const image = files.find(file => file.endsWith(`-linux-${process.arch === 'x64' ? 'x86_64' : process.arch}.AppImage`));
  assert.ok(tar && image, 'Both Linux release formats must exist before shortcut verification');
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-linux-release-'));
  try {
    const extracted = path.join(scratch, 'extracted');
    await fs.mkdir(extracted);
    await runProcess('tar', ['-xzf', path.join(dist, tar), '-C', extracted, '--no-same-owner']);
    const entries = await fs.readdir(extracted);
    const tarRoot = entries.includes('pokemon-showdown-pro') ? extracted : path.join(extracted, entries[0]);
    for (const [format, executable] of [['tar.gz', path.join(tarRoot, 'pokemon-showdown-pro')], ['AppImage', path.join(dist, image)]]) {
      const home = path.join(scratch, format, 'home with spaces');
      const config = path.join(home, '.config'), data = path.join(home, '.local/share');
      const desktop = path.join(home, 'Desktop');
      await fs.mkdir(config, {recursive:true});await fs.mkdir(desktop, {recursive:true});
      await fs.writeFile(path.join(config, 'user-dirs.dirs'), 'XDG_DESKTOP_DIR="$HOME/Desktop"\n');
      const menu = path.join(data, 'applications/pokemon-showdown-pro.desktop');
      await fs.mkdir(path.dirname(menu), {recursive:true});
      await fs.writeFile(menu, desktopEntry('/old/squashfs-root/AppRun', '/old/icon.png', '1.0.0',
        'Official Pokémon Showdown client with Showdex, Pro styling, and optional add-ons').replace('X-Showdown-Pro-Managed=true\n', ''));
      const env = {...process.env, HOME:home, XDG_CONFIG_HOME:config, XDG_DATA_HOME:data, APPIMAGE_EXTRACT_AND_RUN:'1'};
      // Do not inherit an enclosing AppImage or Electron's Node-only mode.
      for (const key of ['APPIMAGE', 'APPDIR', 'ELECTRON_RUN_AS_NODE', 'NODE_PATH']) delete env[key];
      const launch = flag => runProcess(executable, [flag], {env, timeout:60000});
      await launch('--audit-linux-shortcuts');
      const desktopFile = path.join(desktop, 'pokemon-showdown-pro.desktop');
      const text = await fs.readFile(desktopFile, 'utf8');
      assert.equal(await fs.readFile(menu, 'utf8'), text);
      assert.ok(text.includes(`Exec=${execQuote(executable)} --no-sandbox --class=pokemon-showdown-pro %U`), `${format}: persistent launch target`);
      assert.ok(!text.includes('.mount_') && !text.includes('appimage_extracted_'));
      const icon = path.join(data, 'icons/hicolor/256x256/apps/pokemon-showdown-pro.png');
      assert.ok(text.includes('Icon=' + icon));
      assert.equal((await fs.readFile(icon)).subarray(0,8).toString('hex'), '89504e470d0a1a0a');
      assert.equal((await fs.stat(desktopFile)).mode & 0o777, 0o755);
      await runProcess('desktop-file-validate', [desktopFile, menu]);
      await fs.unlink(desktopFile);
      await launch('--audit-linux-shortcuts');
      await assert.rejects(fs.stat(desktopFile), {code:'ENOENT'});
      await launch('--install-shortcuts');
      assert.equal(await fs.readFile(desktopFile, 'utf8'), text);
      console.log(`${format}: packaged Linux icon, menu migration, persistent launcher, deletion and repair passed`);
    }
  } finally {
    assert.ok(scratch.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(scratch, {recursive:true, force:true, maxRetries:10, retryDelay:200});
  }
};
