const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

function prepare(directory, platform, arch) {
  const name = platform === 'darwin' ? 'latest-mac.yml' : platform === 'linux' ? 'latest-linux.yml' : 'latest.yml';
  const file = path.join(directory, name);
  const metadata = yaml.load(fs.readFileSync(file, 'utf8'));
  if (!metadata.version || !metadata.files?.length) throw new Error('Missing app update metadata');
  for (const item of metadata.files) {
    if (path.basename(item.url) !== item.url || !item.sha512 || !fs.existsSync(path.join(directory, item.url))) throw new Error('Update metadata references a missing package');
  }
  if (platform === 'darwin') {
    // Matrix jobs must not overwrite each other's latest-mac.yml. The release job
    // merges both architectures after all their downloads have been uploaded.
    fs.writeFileSync(path.join(directory, `update-mac-${arch}.json`), JSON.stringify(metadata, null, 2));
    fs.renameSync(file, path.join(directory, `latest-mac-${arch}.yml`));
  }
}
if (require.main === module) prepare(path.resolve(__dirname, '../dist'), process.platform, process.arch);
module.exports = { prepare };
