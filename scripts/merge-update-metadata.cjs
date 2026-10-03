const fs = require('node:fs');
const path = require('node:path');

function merge(directory) {
  const inputs = ['x64', 'arm64'].map(arch => JSON.parse(fs.readFileSync(path.join(directory, `update-mac-${arch}.json`), 'utf8')));
  if (inputs[0].version !== inputs[1].version) throw new Error('macOS update versions do not match');
  const files = inputs.flatMap(info => info.files);
  for (const arch of ['x64', 'arm64']) {
    if (!files.some(file => file.url.endsWith(`-${arch}.zip`))) throw new Error(`Missing ${arch} macOS update zip`);
  }
  for (const file of files) {
    if (path.basename(file.url) !== file.url || !file.sha512 || !fs.existsSync(path.join(directory, file.url))) throw new Error('Missing macOS update package');
  }
  // JSON is valid YAML, so no dependency installation is needed in the upload job.
  const merged = { ...inputs[0], files };
  fs.writeFileSync(path.join(directory, 'latest-mac.yml'), JSON.stringify(merged, null, 2) + '\n');
  return merged;
}
if (require.main === module) merge(path.resolve(process.argv[2] || 'release-files'));
module.exports = { merge };
