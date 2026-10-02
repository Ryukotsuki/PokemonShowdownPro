const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
function run(command, args, cwd = root) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' && /\.cmd$/.test(command) });
  if (result.error || result.status !== 0) throw result.error || new Error(`Command exited with ${result.status}`);
}
try {
  for (const repo of ['showdex', 'pokemon-showdown-client']) {
    if (!fs.existsSync(path.join(root, 'vendor', repo))) throw new Error(`Missing vendor/${repo}. See README.md.`);
  }
  run(process.execPath, [path.join(root,'node_modules/pnpm/bin/pnpm.cjs'), 'install', '--frozen-lockfile', '--ignore-scripts', '--config.manage-package-manager-versions=false'], path.join(root, 'vendor/showdex'));
  run(process.execPath, ['scripts/build-showdex.mjs']);
  console.log('\nSetup complete. Run npm start, or double-click Start Showdown Pro.cmd.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
