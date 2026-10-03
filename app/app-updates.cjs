const fs = require('node:fs');
const path = require('node:path');

const RELEASES = 'https://github.com/Ryukotsuki/PokemonShowdownPro/releases';
const API = 'https://api.github.com/repos/Ryukotsuki/PokemonShowdownPro/releases/latest';
const DAY = 24 * 60 * 60 * 1000;

function updateMode({ packaged, distribution, platform, env, execPath, exists = fs.existsSync }) {
  if (distribution !== 'public') return 'private';
  if (!packaged) return 'development';
  if (platform === 'win32' && exists(path.join(path.dirname(execPath), 'Uninstall Pokemon Showdown Pro.exe'))) return 'automatic';
  if (platform === 'linux' && env.APPIMAGE && path.isAbsolute(env.APPIMAGE) && exists(env.APPIMAGE) && !/[\\/]\.mount_[^\\/]+/.test(env.APPIMAGE)) return 'automatic';
  return 'manual';
}

function stableVersion(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value || '');
  return match ? match.slice(1).map(Number) : null;
}
function newerVersion(candidate, current) {
  const next = stableVersion(candidate), previous = stableVersion(current);
  if (!next || !previous) return false;
  for (let index = 0; index < 3; index++) if (next[index] !== previous[index]) return next[index] > previous[index];
  return false;
}
function releaseDownload(release, current, platform, arch) {
  if (release?.draft || release?.prerelease || !newerVersion(release?.tag_name, current)) return null;
  const version = release.tag_name.replace(/^v/, '');
  const name = platform === 'darwin' ? `PokemonShowdownPro-${version}-macos-${arch}.dmg`
    : platform === 'win32' ? `PokemonShowdownPro-${version}-windows-${arch}.zip`
      : platform === 'linux' ? `PokemonShowdownPro-${version}-linux-${arch}.tar.gz` : null;
  const asset = release.assets?.find(item => item.name === name);
  // Only open assets on this project's releases, never an API-supplied arbitrary URL.
  const url = `${RELEASES}/download/${release.tag_name}/${name}`;
  if (!asset || asset.browser_download_url !== url) throw new Error('This release does not have a compatible download yet.');
  return { version, url };
}

class AppUpdates {
  constructor({ app, distribution = 'public', platform = process.platform, arch = process.arch, env = process.env,
    execPath = process.execPath, exists, createUpdater, fetchRelease, openExternal, enabled = () => true,
    canInstall = () => true, onChange = () => {}, now = Date.now, disabled = false }) {
    Object.assign(this, { app, platform, arch, openExternal, enabled, canInstall, onChange, now });
    this.mode = disabled ? 'development' : updateMode({ packaged: app.isPackaged, distribution, platform, env, execPath, exists });
    this.file = path.join(app.getPath('userData'), 'app-updates.json');
    try { const saved = JSON.parse(fs.readFileSync(this.file, 'utf8')).lastChecked; this.lastChecked = Number.isFinite(saved) && saved > 0 && saved <= now() ? saved : 0; } catch { this.lastChecked = 0; }
    this.status = 'idle'; this.version = null; this.busy = false; this.stopped = false;
    this.message = this.mode === 'private' ? 'Private builds are kept separate from public releases.'
      : this.mode === 'development' ? 'App updates are available in packaged releases.'
        : this.mode === 'manual' ? 'New releases are checked automatically. Install the download to update this build.'
          : 'App updates have not been checked yet.';
    this.fetchRelease = fetchRelease || (async () => {
      const response = await require('electron').net.fetch(API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Release check returned ${response.status}`);
      return response.json();
    });
    if (this.mode === 'automatic') {
      try {
        this.updater = (createUpdater || (() => require('electron-updater').autoUpdater))();
        this.updater.autoDownload = false;
        // Installation is explicit and battle-aware; ordinary quitting never installs an update.
        this.updater.autoInstallOnAppQuit = false;
        this.updater.autoRunAppAfterInstall = true;
        this.updater.allowPrerelease = false;
        this.updater.allowDowngrade = false;
        this.updater.disableWebInstaller = true;
        this.updater.on('error', () => this.fail());
        this.updater.on('download-progress', progress => {
          if (!this.stopped && this.status !== 'error') this.change('downloading', `Downloading v${this.version}… ${Math.max(0, Math.min(100, Math.round(progress.percent || 0)))}%`);
        });
        this.updater.on('update-downloaded', info => {
          if (!this.stopped) { this.version = info.version; this.change('ready', `v${info.version} is ready. Restart Pro when your battles finish.`); }
        });
      } catch { this.fail(); }
    }
  }
  snapshot() {
    return { mode: this.mode, status: this.status, message: this.message, version: this.version,
      busy: this.busy, supported: ['automatic', 'manual'].includes(this.mode),
      canRestart: this.status === 'ready' && !this.busy && this.canInstall(),
      canDownload: this.mode === 'manual' && this.status === 'available' };
  }
  change(status, message) { if (this.stopped) return; this.status = status; this.message = message; this.onChange(); }
  fail() { this.change('error', 'App update failed. Your current version is still installed. Try checking again.'); }
  recordCheck() {
    this.lastChecked = this.now();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ lastChecked: this.lastChecked }));
    fs.renameSync(temporary, this.file);
  }
  async check(manual = false) {
    if (this.stopped || this.busy || !this.snapshot().supported || this.status === 'ready') return;
    if (!manual && (!this.enabled() || !this.canInstall() || this.now() - this.lastChecked < DAY)) return;
    this.busy = true; this.change('checking', 'Checking for a new Pro release…');
    try {
      this.recordCheck();
      if (this.mode === 'manual') {
        this.download = releaseDownload(await this.fetchRelease(), this.app.getVersion(), this.platform, this.arch);
        if (this.stopped) return;
        this.version = this.download?.version || null;
        this.change(this.download ? 'available' : 'current', this.download ? `v${this.version} is available. Download it to update Pro.` : `You’re up to date (v${this.app.getVersion()}).`);
      } else {
        if (!this.updater) throw new Error('Updater unavailable');
        const result = await this.updater.checkForUpdates();
        if (this.stopped) return;
        if (result && newerVersion(result.updateInfo?.version, this.app.getVersion())) {
          this.version = result.updateInfo.version;
          this.change('downloading', `Downloading v${this.version}…`);
          await this.updater.downloadUpdate();
        } else this.change('current', `You’re up to date (v${this.app.getVersion()}).`);
      }
    } catch { this.fail(); }
    finally { this.busy = false; if (!this.stopped) this.onChange(); }
  }
  async action() {
    if (this.stopped || this.busy) return;
    if (this.status === 'ready') {
      if (!this.canInstall()) { this.change('ready', 'Finish your battles before restarting Pro to install the update.'); return; }
      try { this.updater.quitAndInstall(false, true); } catch { this.fail(); }
    } else if (this.snapshot().canDownload && this.download) await this.openExternal(this.download.url);
  }
  stop() { this.stopped = true; }
}
module.exports = { AppUpdates, updateMode, newerVersion, releaseDownload };
