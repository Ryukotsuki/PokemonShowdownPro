<p align="center">
  <img src="app/assets/icons/icon.png" alt="Pokémon Showdown Pro logo" width="156">
</p>

<h1 align="center">✨ Pokémon Showdown Pro ✨</h1>

<p align="center">
  <strong>Your battles. Your tools. One desktop app.</strong><br>
  Play on the official Pokémon Showdown service with Showdex, a matching Pro theme, and your battle tools together.
</p>

<p align="center">🖥️ Windows &nbsp; • &nbsp; 🍎 macOS &nbsp; • &nbsp; 🐧 Linux</p>

<p align="center">
  <a href="https://github.com/Ryukotsuki/PokemonShowdownPro/releases"><img src="https://img.shields.io/github/v/release/Ryukotsuki/PokemonShowdownPro?style=for-the-badge&label=Latest%20Release&color=56bce8" alt="Latest release"></a>
  <a href="https://github.com/Ryukotsuki/PokemonShowdownPro/releases"><img src="https://img.shields.io/github/downloads/Ryukotsuki/PokemonShowdownPro/total?style=for-the-badge&color=56bce8" alt="Downloads"></a>
  <a href="https://github.com/Ryukotsuki/PokemonShowdownPro/stargazers"><img src="https://img.shields.io/github/stars/Ryukotsuki/PokemonShowdownPro.svg?style=for-the-badge&color=56bce8" alt="Stars"></a>
  <a href="https://github.com/Ryukotsuki/PokemonShowdownPro/issues"><img src="https://img.shields.io/github/issues/Ryukotsuki/PokemonShowdownPro.svg?style=for-the-badge&color=56bce8" alt="Issues"></a>
</p>

---

## ✨ Features

- 🎨 **Pro Theme**<br>
  A consistent blue theme across Showdown, Showdex, the Battle Hub, menus, dialogs, and add-on windows. Pro is the default on every platform; Light and Dark are also available.

- 🧮 **Showdex Integration**<br>
  Keep the damage calculator beside your battles, with Showdex's tools built directly into the app.

- ⚔️ **Battle Hub**<br>
  Manage active matches, add-ons, messages, results, and replay links from one collapsible panel. Toggle fullscreen from the Hub or with **F11**.

- 🧩 **Six Included Add-ons**<br>
  Get richer tooltips, random battle set information, PokéPaste previews, Tera reminders, battle records, and team sheet exporting.

- 📊 **Battle History & Replay Tools**<br>
  Review saved battles, rating charts, Pokémon statistics, favorites, and filters. Optionally upload winning or losing replays and access confirmed links from the Hub.

- 💬 **Match Messages**<br>
  Set your own optional greeting and closing message for battles you play.

- 🔄 **App & Add-on Updates**<br>
  Check for new releases between battles. Supported installations download app updates; verified add-on and Showdex updates apply when you restart.

- ⚙️ **Your Setup, Saved**<br>
  Start with the new Showdown client, switch to the classic interface when you prefer, and keep your teams, login, themes, and tool settings between launches.

---

## 📸 Preview

![Pokémon Showdown Pro with Showdex, the Pro theme, and Battle Hub](docs/assets/showcase.gif)

<p align="center"><em>The familiar Showdown experience, with your calculator and battle tools close at hand.</em></p>

---

## 🚀 Getting Started

### ⬇️ Download

Download the latest build from the [Releases page](https://github.com/Ryukotsuki/PokemonShowdownPro/releases).

| Platform | Downloads | Setup |
| --- | --- | --- |
| 🖥️ **Windows** | Installer or portable ZIP · x64 | Run the installer, or extract the entire ZIP and open **Pokemon Showdown Pro.exe**. |
| 🍎 **macOS** | DMG or ZIP · Intel / Apple Silicon | Choose the build for your Mac, then move **Pokemon Showdown Pro.app** to **Applications**. |
| 🐧 **Linux** | AppImage or `.tar.gz` · x64 | Make the AppImage executable and launch it, or extract the archive and run **pokemon-showdown-pro**. |

Release downloads include the app and its tools. You do not need to install Node.js, npm, or a local Showdown server to use them.

### ⚡ Quick Start

1. Open **Pokémon Showdown Pro**.
2. Sign in using Showdown's normal login interface.
3. Choose your format and team, then start or join a battle.
4. Use **Showdex** alongside the match and **Battle Hub** to manage your tools.
5. Open **Add-ons** to choose which extras you want enabled.

The **new client** and **Pro theme** are selected by default on a fresh setup. An internet connection is required to use the live service.

---

## 🧭 Battle Hub

| Tab | What you'll find |
| --- | --- |
| **Battle** | Active matches, the Showdex switch, an optional automatic battle timer, and winning/losing replay upload settings. |
| **Add-ons** | Individual add-on switches, settings windows, Battle History, and app/add-on update controls. |
| **Messages** | Optional greeting and closing messages that you write yourself. |
| **History** | Session and all-time win/loss/tie records, plus your 20 most recent confirmed replay uploads. |

### 🎮 Set Up Your Battles

Open **Battle → Match flow** to enable the automatic timer or choose which results should upload replays. Confirmed replay links appear in **History** after the upload finishes.

### 🧩 Choose Your Tools

Open **Add-ons** to enable or disable individual tools and adjust their settings. Use **Reload Showdown** to apply Showdex or add-on switch changes.

### 🎨 Choose Your Theme

- **New client:** Settings → Appearance → Theme → **Pro**
- **Classic client:** Settings → Graphics → Theme → **Pro**
- **Showdex:** Settings → Color Mode → **Pro**

Showdex's theme can be selected independently. Existing theme choices are preserved.

---

## 🧩 Built-in Add-ons

All six add-ons are included and enabled initially. Choose your favorites in **Battle Hub → Add-ons**.

| Add-on | What it adds |
| --- | --- |
| **Enhanced Tooltips** | Type effectiveness, move details, and optional base stats. |
| **Randbats Tooltip** | Possible random battle sets and probabilities. |
| **Three Island** | PokéPaste previews, team importing, and item/Tera icons. |
| **Did it Tera?** | Compact reminders showing a Pokémon's Tera type, with customizable text. |
| **Battle History** | Local battle records, statistics, rating charts, favorites, and filters. |
| **PokePaste Exporter** | Team sheet viewing and exporting in battles with open team sheets. |

---

## 🔄 Updates

### App Updates

**Battle Hub → Add-ons → App updates** checks stable GitHub releases once a day between battles. Installed Windows builds and original Linux AppImages download updates and verify their checksums. Choose **Restart to update** when your battles finish; closing the app does not install an update automatically.

Windows portable ZIPs, extracted Linux builds, and macOS builds also download and verify updates inside Pro. Choose **Restart to update** to replace the app in its existing location. Your saved profile stays in place, and Pro keeps a backup if replacement or startup fails. The app must be in a writable folder; on macOS, move it out of the DMG and into **Applications** before updating.

App checks require a publicly accessible stable GitHub release with its update metadata and checksums. Until one is available, Pro keeps the installed version. Portable and macOS releases through v1.1.2 need one manual upgrade to a build containing the in-app replacement updater; subsequent updates happen inside Pro.

### Add-on & Showdex Updates

The separate **Add-on updates** section checks the six add-ons and stable Showdex releases. New packages receive the Pro styling and compatibility patches, then are checked against both Showdown clients before they can be installed.

Verified updates apply when you restart Pro. Failed checks keep the installed versions; a failed startup restores the previous version. Use **Check now** for a manual check, or turn off **Automatic updates** to check only when you choose.

---

## 📝 Notes

- 🌐 **Live service:** Pro connects to the official Pokémon Showdown service. Sign-in, battles, and online features need internet access.
- 📂 **Portable setup:** Keep the entire extracted folder together; the executable needs its accompanying resources.
- 🍎 **macOS builds:** Releases are currently unsigned. Choose **x64** for Intel Macs or **arm64** for Apple Silicon.
- 🐧 **Linux shortcuts:** The first successful launch creates an application-menu entry and a desktop shortcut where supported. If prompted, choose **Allow Launching**. Manually edited shortcuts are preserved.
- 💬 **Optional actions:** Automatic match messages and replay uploads are controlled by your Battle Hub settings.
- 🛡️ **Troubleshooting:** Report your OS, app version, package type, and the error you saw when opening an issue.

<details>
<summary><strong>🐧 Restore a Linux shortcut</strong></summary>

Run your AppImage with `--install-shortcuts`, or use the executable inside an extracted release:

```sh
./PokemonShowdownPro-1.0.0-linux-x64.AppImage --install-shortcuts
# For an extracted .tar.gz release:
./pokemon-showdown-pro --install-shortcuts
```

This refreshes generated launchers and their persistent icon. Desktop environments with desktop icons disabled still provide the application-menu entry. If you renamed your AppImage, use its current filename.

</details>

<details>
<summary><strong>🛡️ Find updater diagnostics</strong></summary>

The app's user data folder stores these files:

| File | Contents |
| --- | --- |
| `app-update.log` | Latest app update failure. |
| `addon-updates/last-check.log` | Latest add-on and Showdex check. |
| `addon-updates/last-failure.log` | Latest failed add-on check, retained after successful retries. |

On Windows, the folder is `%APPDATA%\pokemon-showdown-pro`.

</details>

---

## 🛠️ Running from Source

<details>
<summary><strong>Setup, checks, and packaging</strong></summary>

Install **Node.js 24 or later** and **Git**, then clone the repository:

```sh
git clone https://github.com/Ryukotsuki/PokemonShowdownPro.git
cd PokemonShowdownPro
npm ci
npm run fetch:vendor
npm run setup
npm run download:addons
npm start
```

Upstream sources are pinned in [vendor-versions.json](vendor-versions.json). On Windows, **Start Showdown Pro.cmd** also launches the app after setup.

Run the available checks from the repository root:

```sh
npm test
npm run audit:hub
npm run audit:addons
```

Electron tests and previews run muted in isolated profiles. Source checkouts do not update the app itself.

To package for your current platform:

```sh
npm run dist
```

GitHub Actions builds Windows x64, macOS Intel and Apple Silicon, and Linux x64. To publish, create a release with a tag matching `package.json` (for example, **v1.0.0**). The release workflow builds and attaches the downloads after every platform passes its checks. Existing tags must contain the workflow and source changes you want to release.

</details>

---

## 💖 Support

If Pro makes your battles easier to manage, a star helps others find it.

- ⭐ [Star the repository](https://github.com/Ryukotsuki/PokemonShowdownPro/stargazers)
- 🐛 [Report a bug](https://github.com/Ryukotsuki/PokemonShowdownPro/issues)
- 💡 [Suggest a feature](https://github.com/Ryukotsuki/PokemonShowdownPro/issues)

---

## 💬 Community

Have questions, feedback, or want to share your setup? Join the Discord:

<p align="center">
  <a href="https://discord.gg/HdfjKbPNc9">
    <img src="https://github.com/user-attachments/assets/09fb5822-5e82-431b-b9cc-bbd4111ba48b" alt="Join the Discord community" width="520">
  </a>
</p>

---

## 📜 Credits & License

Built on [Pokémon Showdown](https://github.com/smogon/pokemon-showdown-client), [Showdex](https://github.com/doshidak/showdex), [Electron](https://github.com/electron/electron), and the work of the included add-on creators. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for their credits and licenses.

Pokémon Showdown Pro is an independent fan-made project. It is not affiliated with or endorsed by Pokémon Showdown, Nintendo, Game Freak, or The Pokémon Company.

Licensed under [AGPL-3.0-or-later](LICENSE). Third-party code and assets retain their respective licenses and ownership.

---