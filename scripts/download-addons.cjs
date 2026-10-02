const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..', 'vendor/browser-addons');
const addons = [
  ['enhancedTooltips', 'aggbolenhnpdhgcfpknifdiheppbmblb'],
  ['randbatsTooltip', 'cheogdcgfjpolnpnjijnjccjljjclplg'],
  ['threeIsland', 'glhggmffomgbggeobkijjhojkjopfpho'],
  ['didItTera', 'afcoljllhjapfffjlfjjmcbfhhoignpo'],
  ['battleHistory', 'jaopbejgoiaokcpnpjbmoegpomgocaph'],
  ['pokepasteExporter', 'eehioifimidcjcdlaehajhdeaekmmdne'],
];
async function main() {
  const { extract } = await import('@electron-internal/extract-zip');
  await fs.mkdir(root, { recursive: true });
  const results = await Promise.allSettled(addons.map(async ([key, id]) => {
    const url = new URL('https://clients2.google.com/service/update2/crx');
    url.search = new URLSearchParams({response:'redirect',prodversion:'144.0.0.0',acceptformat:'crx2,crx3',x:`id=${id}&installsource=ondemand&uc`});
    const response = await fetch(url, {signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.toString('ascii', 0, 4) !== 'Cr24') throw new Error(`${key}: Not a CRX package (${data.length} bytes)`);
    const version = data.readUInt32LE(4);
    const offset = version === 3 ? 12 + data.readUInt32LE(8) : version === 2 ? 16 + data.readUInt32LE(8) + data.readUInt32LE(12) : 0;
    if (!offset || offset >= data.length || data.readUInt32LE(offset) !== 0x04034b50) throw new Error(`${key}: Invalid CRX archive`);
    const archive = path.join(root, key + '.zip');
    await fs.writeFile(archive, data.subarray(offset));
    const directory = path.join(root, key);
    // Use Electron's pinned native extractor with path/symlink containment.
    await extract(archive, { dir: directory });
    await fs.unlink(archive);
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
    const result = {key,id,name:manifest.name,version:manifest.version,sha256:crypto.createHash('sha256').update(data).digest('hex'),source:url.toString()};
    console.log(JSON.stringify(result));
    return result;
  }));
  await fs.writeFile(path.join(root, 'versions.json'), JSON.stringify(results.filter(r=>r.status==='fulfilled').map(r=>r.value), null, 2));
  for(const result of results) if(result.status==='rejected') {console.error(result.reason);process.exitCode=1;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
