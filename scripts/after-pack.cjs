const fs=require('node:fs/promises'),path=require('node:path');
// Put the portability flags on the process command line before Chromium starts,
// including direct tar/extracted launches that bypass AppImage's AppRun.
const launcher=`#!/bin/sh
# Pokemon Showdown Pro portable Linux launcher
launcher_dir=$(CDPATH= cd -P "$(dirname "$0")" && pwd) || exit 1
exec "$launcher_dir/pokemon-showdown-pro.bin" --no-sandbox --class=pokemon-showdown-pro "$@"
`;
module.exports=async({electronPlatformName,appOutDir})=>{
  if(electronPlatformName!=='linux')return;
  const file=path.join(appOutDir,'pokemon-showdown-pro'),binary=file+'.bin';
  const existing=await fs.readFile(file);
  if(existing.subarray(0,128).toString().includes('# Pokemon Showdown Pro portable Linux launcher')) {
    await fs.access(binary);return;
  }
  await fs.rename(file,binary);
  await fs.chmod(binary,0o755);
  await fs.writeFile(file,launcher,{mode:0o755});
};
