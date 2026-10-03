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

function updateFailure(error, phase = 'check') {
  const detail = `${error?.code || ''} ${error?.message || ''} ${error?.cause?.code || ''} ${error?.cause?.message || ''}`;
  const status = error?.statusCode || error?.cause?.statusCode;
  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/.test(detail)) return {
    status: 'unavailable', message: 'The latest release is missing its update files. Check again after the release finishes publishing.'
  };
  if (phase === 'check' && (status === 404 || /HTTP_ERROR_404|\b404\b|ERR_UPDATER_NO_PUBLISHED_VERSIONS|No published versions on GitHub/.test(detail))) return {
    status: 'unavailable', message: 'No public app release is accessible. Updates require a public GitHub release.'
  };
  if (status === 403 || status === 429 || /HTTP_ERROR_(403|429)|rate limit/i.test(detail)) return {
    status: 'error', message: 'GitHub limited or denied this update check. Try again later. Your current version is still installed.'
  };
  if (/checksum|sha512|ERR_UPDATER_INVALID_SIGNATURE/i.test(detail)) return {
    status: 'error', message: 'The app update failed verification. Your current version is still installed. Try checking again.'
  };
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|TimeoutError|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_NETWORK|fetch failed/i.test(detail)) return {
    status: 'error', message: 'Could not connect to the app update service. Check your connection and try again. Your current version is still installed.'
  };
  return { status: 'error', message: 'App update failed. Your current version is still installed. Try checking again.' };
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
      if (!response.ok) throw Object.assign(new Error(`Release check returned ${response.status}`), { statusCode: response.status });
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
        this.updater.on('error', error => this.fail(error));
        this.updater.on('download-progress', progress => {
          if (!this.stopped && this.status !== 'error') this.change('downloading', `Downloading v${this.version}… ${Math.max(0, Math.min(100, Math.round(progress.percent || 0)))}%`);
        });
        this.updater.on('update-downloaded', info => {
          if (!this.stopped) { this.version = info.version; this.change('ready', `v${info.version} is ready. Restart Pro when your battles finish.`); }
        });
      } catch (error) { this.fail(error); }
    }
  }
  snapshot() {
    return { mode: this.mode, status: this.status, message: this.message, version: this.version,
      busy: this.busy, supported: ['automatic', 'manual'].includes(this.mode),
      canRestart: this.status === 'ready' && !this.busy && this.canInstall(),
      canDownload: this.mode === 'manual' && this.status === 'available' };
  }
  change(status, message) { if (this.stopped) return; this.status = status; this.message = message; this.onChange(); }
  fail(error) {
    if (this.stopped) return;
    const failure = updateFailure(error, this.phase);
    // Keep the last failure even after a successful retry; diagnostics never block the app.
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const details = `${error?.code || ''} ${error?.statusCode || ''}\n${error?.stack || error?.message || String(error)}\n${error?.cause?.stack || ''}`;
      fs.writeFileSync(path.join(path.dirname(this.file), 'app-update.log'), `${new Date(this.now()).toISOString()}\n${this.platform}/${this.arch}, ${this.mode}, v${this.app.getVersion()}, ${this.phase || 'initialization'}\n${failure.message}\n${details.slice(-50000)}\n`);
    } catch {}
    this.change(failure.status, failure.message);
  }
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
    this.phase = 'check'; this.busy = true; this.change('checking', 'Checking for a new Pro release…');
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
          this.phase = 'download';
          this.change('downloading', `Downloading v${this.version}…`);
          await this.updater.downloadUpdate();
        } else this.change('current', `You’re up to date (v${this.app.getVersion()}).`);
      }
    } catch (error) { this.fail(error); }
    finally { this.busy = false; if (!this.stopped) this.onChange(); }
  }
  async action() {
    if (this.stopped || this.busy) return;
    if (this.status === 'ready') {
      if (!this.canInstall()) { this.change('ready', 'Finish your battles before restarting Pro to install the update.'); return; }
      this.phase = 'install';
      try { this.updater.quitAndInstall(false, true); } catch (error) { this.fail(error); }
    } else if (this.snapshot().canDownload && this.download) await this.openExternal(this.download.url);
  }
  stop() { this.stopped = true; }
}
module.exports = { AppUpdates, updateMode, newerVersion, releaseDownload, updateFailure };
