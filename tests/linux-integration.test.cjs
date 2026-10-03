const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {configureLinuxRuntime,installLinuxShortcuts,desktopEntry,execQuote,stableExecutable}=require('../app/linux-integration.cjs');
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ps-linux-shortcuts-'));
  t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});});
  const home=path.join(root,'home'),desktop=path.join(home,'Escritorio'),userData=path.join(home,'.config/pro');
  const executable=path.join(home,'Apps with spaces','pokemon-showdown-pro');
  await fs.mkdir(path.dirname(executable),{recursive:true});await fs.writeFile(executable,'fixture');
  const icon=path.join(root,'icon.png');await fs.writeFile(icon,'icon fixture');
  const trusted=[];
  const app={isPackaged:true,getPath:key=>({home,desktop,userData})[key],getVersion:()=> '1.0.0'};
  return {root,home,desktop,userData,executable,app,options:{app,platform:'linux',env:{},execPath:executable,icon,trust:async file=>trusted.push(file)},trusted};
}
test('portable Linux config fixes sandbox/class without affecting development or other operating systems',()=>{
  const calls=[],app={isPackaged:true,commandLine:{appendSwitch:(...args)=>calls.push(args)}};
  configureLinuxRuntime(app,'win32');configureLinuxRuntime(app,'darwin');
  configureLinuxRuntime({...app,isPackaged:false},'linux');assert.deepEqual(calls,[]);
  configureLinuxRuntime(app,'linux');assert.deepEqual(calls,[['no-sandbox'],['class','pokemon-showdown-pro']]);
});
test('desktop Exec quotes paths, escapes literal field codes and blocks extra entry lines',()=>{
  assert.equal(execQuote('/home/user/Apps with spaces/pro.AppImage'),'"/home/user/Apps with spaces/pro.AppImage"');
  assert.equal(execQuote('/home/user/100%/pro.AppImage'),'"/home/user/100%%/pro.AppImage"');
  const file=desktopEntry('/home/user/$cash/"pro"/`name`\\app','/home/user/icon.png','1.0.0','Description\nExec=bad');
  assert.ok(file.includes('Exec="/home/user/\\\\$cash/\\\\"pro\\\\"/\\\\`name\\\\`\\\\\\\\app" --no-sandbox --class=pokemon-showdown-pro %U\n'));
  assert.equal(file.split('\n').filter(line=>line.startsWith('Exec=')).length,1);
  assert.match(file,/Comment=Description\\nExec=bad\n/);
});
test('AppImage shortcuts target the original file instead of temporary mounted executables',async t=>{
  const f=await fixture(t),original=path.join(f.home,'Pro.AppImage'),mount=path.join(f.root,'.mount_ProTest','pokemon-showdown-pro');
  await fs.writeFile(original,'image');await fs.mkdir(path.dirname(mount));await fs.writeFile(mount,'mounted binary');
  assert.equal(await stableExecutable(mount,{APPIMAGE:original}),original);
  await assert.rejects(stableExecutable(mount,{}),/persistent Linux executable/);
  const result=await installLinuxShortcuts({...f.options,execPath:mount,env:{APPIMAGE:original}});
  const text=await fs.readFile(result.desktopFile,'utf8');
  assert.ok(text.includes(execQuote(original)));assert.ok(!text.includes('.mount_'));
  assert.equal(await fs.readFile(result.icon,'utf8'),'icon fixture');
});
test('extracted AppRun and tar releases resolve their current installed paths',async t=>{
  const f=await fixture(t),appRun=path.join(path.dirname(f.executable),'AppRun');await fs.writeFile(appRun,'launcher');
  assert.equal(await stableExecutable(f.executable,{APPDIR:path.dirname(f.executable)}),appRun);
  assert.equal(await stableExecutable(f.executable,{}),appRun);
  await fs.unlink(appRun);assert.equal(await stableExecutable(f.executable,{}),f.executable);
  const binary=f.executable+'.bin';await fs.writeFile(binary,'native binary');
  assert.equal(await stableExecutable(binary,{}),f.executable,'Tar shortcuts must target the portable wrapper');
});
test('Linux packaging wraps the actual executable before Chromium startup and leaves other packages untouched',async t=>{
  const f=await fixture(t),afterPack=require('../scripts/after-pack.cjs'),appOutDir=path.dirname(f.executable);
  await afterPack({electronPlatformName:'win32',appOutDir});assert.equal(await fs.readFile(f.executable,'utf8'),'fixture');
  await afterPack({electronPlatformName:'linux',appOutDir});
  const script=await fs.readFile(f.executable,'utf8');
  assert.ok(script.startsWith('#!/bin/sh\n'));assert.match(script,/exec "\$launcher_dir\/pokemon-showdown-pro\.bin" --no-sandbox --class=pokemon-showdown-pro "\$@"/);
  assert.equal(await fs.readFile(f.executable+'.bin','utf8'),'fixture');
  await afterPack({electronPlatformName:'linux',appOutDir});assert.equal(await fs.readFile(f.executable+'.bin','utf8'),'fixture');
  if(process.platform==='linux'){
    const {spawnSync}=require('node:child_process');
    assert.equal(spawnSync('sh',['-n',f.executable],{encoding:'utf8'}).status,0);
    const argsFile=path.join(f.root,'args.txt');
    await fs.writeFile(f.executable+'.bin','#!/bin/sh\nprintf "%s\\n" "$@" > "$PRO_TEST_ARGS"\n',{mode:0o755});
    const launched=spawnSync(f.executable,['one argument with spaces','literal$variable'],{env:{...process.env,PRO_TEST_ARGS:argsFile},encoding:'utf8'});
    assert.equal(launched.status,0,launched.stderr);
    assert.deepEqual((await fs.readFile(argsFile,'utf8')).trim().split('\n'),['--no-sandbox','--class=pokemon-showdown-pro','one argument with spaces','literal$variable']);
  }
});
test('first run creates a localized desktop shortcut and menu entry, then refreshes moved apps without duplicates',async t=>{
  const f=await fixture(t),data=path.join(f.home,'custom-data');
  const result=await installLinuxShortcuts({...f.options,env:{XDG_DATA_HOME:data}});
  assert.equal(result.desktopFile,path.join(f.desktop,'pokemon-showdown-pro.desktop'));
  assert.equal(result.menuFile,path.join(data,'applications/pokemon-showdown-pro.desktop'));
  assert.equal(await fs.readFile(result.desktopFile,'utf8'),await fs.readFile(result.menuFile,'utf8'));
  assert.deepEqual(f.trusted,[result.desktopFile]);
  if(process.platform==='linux')assert.equal((await fs.stat(result.desktopFile)).mode&0o777,0o755);
  const moved=path.join(f.home,'new location','pokemon-showdown-pro');await fs.mkdir(path.dirname(moved));await fs.writeFile(moved,'new binary');
  await installLinuxShortcuts({...f.options,execPath:moved,env:{XDG_DATA_HOME:data}});
  assert.ok((await fs.readFile(result.desktopFile,'utf8')).includes(execQuote(moved)));
  assert.deepEqual(await fs.readdir(f.desktop),['pokemon-showdown-pro.desktop']);
  await fs.unlink(result.desktopFile);
  await installLinuxShortcuts({...f.options,execPath:moved,env:{XDG_DATA_HOME:data}});
  await assert.rejects(fs.stat(result.desktopFile),{code:'ENOENT'},'Deleting the desktop icon must be respected on subsequent launches');
});
test('existing manually edited desktop entries are preserved and unsupported trust metadata is nonfatal',async t=>{
  const f=await fixture(t),desktopFile=path.join(f.desktop,'pokemon-showdown-pro.desktop');
  await fs.mkdir(f.desktop,{recursive:true});await fs.writeFile(desktopFile,'[Desktop Entry]\nExec="manual AppRun" --custom\n');
  const result=await installLinuxShortcuts({...f.options,trust:async()=>{throw Error('GIO unsupported');}});
  assert.equal(await fs.readFile(result.desktopFile,'utf8'),'[Desktop Entry]\nExec="manual AppRun" --custom\n');
  assert.ok((await fs.readFile(result.menuFile,'utf8')).includes('--no-sandbox'));
  const second=await fixture(t);
  const created=await installLinuxShortcuts({...second.options,trust:async()=>{throw Error('GIO unsupported');}});
  assert.ok((await fs.readFile(created.desktopFile,'utf8')).includes('X-Showdown-Pro-Managed=true'));
});
test('a replacement installation restores a missing icon while explicit repair also works at the same path',async t=>{
  const f=await fixture(t),result=await installLinuxShortcuts(f.options);
  await fs.unlink(result.desktopFile);
  await installLinuxShortcuts(f.options);
  await assert.rejects(fs.stat(result.desktopFile),{code:'ENOENT'});
  await installLinuxShortcuts({...f.options,forceDesktop:true});
  assert.ok((await fs.readFile(result.desktopFile,'utf8')).includes(execQuote(f.executable)));
  await fs.unlink(result.desktopFile);
  const replacement=path.join(f.home,'replacement','pokemon-showdown-pro');
  await fs.mkdir(path.dirname(replacement));await fs.writeFile(replacement,'replacement');
  await installLinuxShortcuts({...f.options,execPath:replacement});
  assert.ok((await fs.readFile(result.desktopFile,'utf8')).includes(execQuote(replacement)));
});
test('older generated installer entries migrate, while manual edits survive explicit repair',async t=>{
  const f=await fixture(t),menu=path.join(f.home,'.local/share/applications/pokemon-showdown-pro.desktop');
  const legacy=desktopEntry('/old/squashfs-root/AppRun','/old/icon.png','1.0.0',
    'Official Pokémon Showdown client with Showdex, Pro styling, and optional add-ons').replace('X-Showdown-Pro-Managed=true\n','');
  await fs.mkdir(path.dirname(menu),{recursive:true});await fs.writeFile(menu,legacy);
  await installLinuxShortcuts(f.options);
  assert.ok((await fs.readFile(menu,'utf8')).includes(execQuote(f.executable)));
  assert.match(await fs.readFile(menu,'utf8'),/X-Showdown-Pro-Managed=true/);
  const manual=legacy.replace('Comment=Official Pokémon Showdown client with Showdex, Pro styling, and optional add-ons','Comment=My custom launcher');
  await fs.writeFile(menu,manual);
  const desktop=path.join(f.desktop,'pokemon-showdown-pro.desktop');await fs.writeFile(desktop,manual);
  await installLinuxShortcuts({...f.options,forceDesktop:true});
  assert.equal(await fs.readFile(menu,'utf8'),manual);assert.equal(await fs.readFile(desktop,'utf8'),manual);
});
test('a disabled desktop does not mark an icon as created before a desktop becomes available',async t=>{
  const f=await fixture(t),app={...f.app,getPath:key=>key==='desktop'?f.home:f.app.getPath(key)};
  await installLinuxShortcuts({...f.options,app});
  assert.equal(JSON.parse(await fs.readFile(path.join(f.userData,'linux-shortcuts.json'),'utf8')).desktopHandled,false);
  const result=await installLinuxShortcuts(f.options);
  assert.ok((await fs.readFile(result.desktopFile,'utf8')).includes(execQuote(f.executable)));
});
test('disabled desktops do not put shortcuts in the home directory and other OS/development launches do not write files',async t=>{
  const f=await fixture(t);
  const app={...f.app,getPath:key=>key==='desktop'?f.home:f.app.getPath(key)};
  const result=await installLinuxShortcuts({...f.options,app});assert.equal(result.desktopFile,null);
  await assert.rejects(fs.stat(path.join(f.home,'pokemon-showdown-pro.desktop')),{code:'ENOENT'});
  assert.equal(await installLinuxShortcuts({...f.options,platform:'win32'}),null);
  assert.equal(await installLinuxShortcuts({...f.options,app:{...f.app,isPackaged:false}}),null);
});
