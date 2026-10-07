const path = require('node:path');
const { spawn } = require('node:child_process');

function busyDmgDetach(output) {
  return /Unable to detach device cleanly:[^\r\n]*hdiutil:[^\r\n]*Resource busy/i.test(output);
}
function runBuilder(args, { root, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), '--publish', 'never', ...args], {
      cwd: root, env, shell: false, windowsHide: true, stdio: ['inherit', 'pipe', 'pipe'],
    });
    let output = '';
    const forward = destination => chunk => {
      destination.write(chunk);
      output = (output + chunk.toString()).slice(-65536);
    };
    child.stdout.on('data', forward(process.stdout));
    child.stderr.on('data', forward(process.stderr));
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code: code ?? 1, signal, output }));
  });
}
async function buildRelease(args, { platform = process.platform, root = path.resolve(__dirname, '..'), env = process.env,
  run = runBuilder, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.warn,
  finalizeLinux = options => require('./appimage-release.cjs').prepareAppImage(options) } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await run(args, { root, env });
    if (result.code === 0) {
      if (platform === 'linux' && !args.some(arg => ['--win','--mac','--dir'].includes(arg))) await finalizeLinux({root});
      return;
    }
    if (platform !== 'darwin' || result.signal || !busyDmgDetach(result.output) || attempt === 3) {
      const error = new Error(`App packaging failed${result.signal ? ' with signal ' + result.signal : ' with exit code ' + result.code}`);
      error.exitCode = result.code || 1;
      throw error;
    }
    // dmgbuild already force-detaches its own temporary device on this error.
    // Wait for macOS to release it, then let the builder recreate the DMG. Never
    // detach unrelated volumes or accept an incomplete installer as a success.
    log(`DMG temporary volume was busy. Retrying packaging (${attempt + 1}/3) in ${attempt * 5} seconds…`);
    await wait(attempt * 5000);
  }
}
if (require.main === module) buildRelease(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = error.exitCode || 1; });
module.exports = { busyDmgDetach, buildRelease };
