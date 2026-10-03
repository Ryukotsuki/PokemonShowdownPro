const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const APP_CLASS = 'pokemon-showdown-pro';
const FILE_NAME = APP_CLASS + '.desktop';
const MANAGED = 'X-Showdown-Pro-Managed=true';

function configureLinuxRuntime(app, platform = process.platform) {
  if (platform !== 'linux' || !app.isPackaged) return;
  // Portable AppImage/extracted releases cannot install a root-owned SUID helper.
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('class', APP_CLASS);
}
function desktopString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}
function execQuote(value) {
  // Exec arguments have both desktop-string and double-quote escaping.
  return '"' + desktopString(String(value).replace(/%/g, '%%').replace(/[\\"`$]/g, '\\$&')) + '"';
}
function desktopEntry(executable, icon, version, description) {
  return '[Desktop Entry]\n' + [
    'Name=Pokemon Showdown Pro',
    `Exec=${execQuote(executable)} --no-sandbox --class=${APP_CLASS} %U`,
    'Terminal=false', 'Type=Application', `Icon=${desktopString(icon)}`,
    `StartupWMClass=${APP_CLASS}`, `X-AppImage-Version=${desktopString(version)}`,
    `Comment=${desktopString(description)}`, 'Categories=Game;', 'StartupNotify=true', MANAGED,
  ].join('\n') + '\n';
}
function temporaryMount(file) {
  return /(?:^|[\\/])(?:\.mount_[^\\/]+|appimage_extracted_[^\\/]+)(?:[\\/]|$)/.test(file);
}
async function stableExecutable(execPath, env) {
  const candidates = [env.APPIMAGE, env.APPDIR && path.join(env.APPDIR, 'AppRun'),
    path.join(path.dirname(execPath), 'AppRun'), path.join(path.dirname(execPath),APP_CLASS), execPath];
  for (const candidate of candidates) {
    if (!candidate || !path.isAbsolute(candidate) || temporaryMount(candidate)) continue;
    try {if ((await fs.stat(candidate)).isFile()) return candidate;} catch {}
  }
  throw new Error('No persistent Linux executable was found for the shortcut');
}
async function writeManaged(file, text, mode) {
  let current;
  try {current = await fs.readFile(file, 'utf8');} catch (error) {if (error.code !== 'ENOENT') throw error;}
  if (current !== undefined && !current.split(/\r?\n/).includes(MANAGED)) return false;
  await fs.mkdir(path.dirname(file), {recursive:true});
  if (current !== text) await fs.writeFile(file, text, {mode});
  await fs.chmod(file, mode);
  return true;
}
const trustDesktop = file => promisify(execFile)('gio', ['set',file,'metadata::trusted','true'], {timeout:3000,windowsHide:true});
async function installLinuxShortcuts({app,platform=process.platform,env=process.env,execPath=process.execPath,
  icon=path.join(__dirname,'assets/icons/icon.png'),description,trust=trustDesktop}) {
  if (platform !== 'linux' || !app.isPackaged) return null;
  const home = app.getPath('home');
  const desktop = app.getPath('desktop'); // Chromium honors localized XDG user directories.
  const data = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(home,'.local/share');
  const metadata = path.join(app.getPath('userData'),'linux-shortcuts.json');
  let saved = {};
  try {const parsed = JSON.parse(await fs.readFile(metadata,'utf8'));if(parsed && typeof parsed === 'object')saved=parsed;} catch {}
  const executable = await stableExecutable(execPath, env);
  const installedIcon = path.join(data,'icons/hicolor/256x256/apps',APP_CLASS+'.png');
  await fs.mkdir(path.dirname(installedIcon),{recursive:true});
  await fs.copyFile(icon,installedIcon);
  const text = desktopEntry(executable,installedIcon,app.getVersion(),description || 'Official Pokémon Showdown client with Showdex, Pro styling, and optional add-ons');
  const menuFile = path.join(data,'applications',FILE_NAME);
  await writeManaged(menuFile,text,0o644);
  let desktopFile = null;
  if (desktop && path.resolve(desktop) !== path.resolve(home)) {
    desktopFile = path.join(desktop,FILE_NAME);
    let exists = false;
    try {exists = (await fs.stat(desktopFile)).isFile();} catch {}
    // Keep existing shortcuts current after an app move/update; respect a user's
    // deletion instead of creating the desktop icon again on every launch.
    if (!saved.desktopHandled || exists) {
      if (await writeManaged(desktopFile,text,0o755)) {
        try {await trust(desktopFile);} catch { /* Desktop environments without GIO still get an executable entry. */ }
      }
    }
  }
  await fs.mkdir(path.dirname(metadata),{recursive:true});
  await fs.writeFile(metadata,JSON.stringify({desktopHandled:true,executable},null,2));
  return {menuFile,desktopFile,executable,icon:installedIcon};
}
module.exports = {configureLinuxRuntime,installLinuxShortcuts,desktopEntry,execQuote,stableExecutable};
