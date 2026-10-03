# Building and releasing Pokémon Showdown Pro

The workflows build the public app for four native runner configurations:

| Platform | Architecture | Download formats |
| --- | --- | --- |
| Windows | x64 | Setup `.exe` and portable `.zip` |
| macOS | Intel x64 | `.dmg` and `.zip` |
| macOS | Apple Silicon arm64 | `.dmg` and `.zip` |
| Linux | x64 | `.AppImage` and `.tar.gz` |

Each file has a SHA-256 checksum. Builds include the app, Showdex, six add-ons, a Node.js runtime and pnpm for updates, third-party notices, and pinned upstream source archives. End users do not need Node.js or npm installed.

## Upload the workflow files

Extract `Github-Workflow-Upload.zip` and upload its contents into the existing repository root, preserving the folders and replacing files with the same names. The upload includes the workflow YAML files, packaging configuration, updated package files, and runtime support changes. Upload all of them together.

The workflow files belong at:

```text
.github/workflows/build.yml
.github/workflows/release.yml
```

`electron-builder.yml` belongs beside `package.json`. Do not upload generated `dist/`, `build/`, `vendor/`, or `node_modules/` folders. The workflows fetch upstream sources using `vendor-versions.json`, install locked dependencies, and generate those folders on each runner.

## Try a build first

1. Commit the uploaded files to the default branch.
2. Open the repository's **Actions** tab.
3. Select **Build apps**, then **Run workflow**.
4. Wait for Windows, both macOS architectures, and Linux to finish.
5. Download each platform's artifact from the completed workflow run.

Builds also run on pushes to `main`/`master` and on pull requests. Each job runs unit tests, packages the app, and checks the actual packaged runtime in an isolated, muted profile. Packaged checks validate the shipped Showdex and add-ons through the update worker, including both client compatibility audits, native source extraction, and bundled pnpm. They require access to Pokémon Showdown; downloading newer releases is reserved for normal app update checks. If package verification fails, download the `Package-verification` artifact for detailed diagnostics.

Audit sessions block the site's advertising bootstrap and its trackers so unrelated advertising requests cannot stall client navigation. Each navigation has a 45-second limit and one retry; real client load failures and compatibility failures still fail verification. This applies only to test windows.

Each platform also checks that Pro styling is available while a page resource is deliberately held open, including both clients, the new client's redirected root URL, and saved Light, Dark, and System selections. Packaged checks verify that a fresh profile opens the new client with Pro selected for Showdown, Showdex, and the Battle Hub. All checks run muted.

Linux portable launchers include `--no-sandbox` and a consistent window class. The Linux packaging hook keeps the native binary as `pokemon-showdown-pro.bin` and creates an executable `pokemon-showdown-pro` shell launcher that supplies these flags before Chromium starts. The packaged entry point also applies the flags before creating windows. Package verification deliberately launches without adding the sandbox flag itself, so a broken normal Linux launch fails the build. First-run desktop integration uses each user's XDG paths and the original AppImage, extracted `AppRun`, or portable launcher; it never stores a temporary AppImage mount path.

Linux verification also extracts the shipped tar archive and runs the shipped AppImage in isolated homes. It checks real desktop and menu entries, PNG installation, desktop-file validity, migration of older generated launchers, deletion behavior, and explicit repair with `--install-shortcuts`. AppImage checks use the runtime's extraction fallback so FUSE is not required on CI. A new installation path restores a missing desktop shortcut; repeated launches at the same path respect deletion. Linux verification requires `desktop-file-validate` (the `desktop-file-utils` package).

The Showdex startup audit holds a real client image request open while initializing the production bridge, theme, and shipped calculator through the ready main frame. It verifies that Showdex Pro renders before the page finishes loading.

## Publish version 1.0.0

1. Confirm `package.json` and `package-lock.json` both contain version `1.0.0`.
2. Open **Releases → Draft a new release**.
3. Create tag **v1.0.0** targeting the commit with the workflow files.
4. Add your release title and description, then publish the release.
5. **Release apps** builds all four configurations and attaches the downloads and checksums to that release after every job passes.

If the release already exists, open **Actions → Release apps → Run workflow**, and enter `v1.0.0`. The tag must already exist and contain these workflow files. Uploading fixes to the default branch does not change the source of an existing tag.

The release tag must match `v` followed by the package version. For a later release, update both package files before creating its tag. The workflow's built-in `GITHUB_TOKEN` provides release-upload permission; no personal access token is needed.

## Signing

macOS DMGs include `.metadata_never_index` before copying the app to reduce background indexing of the temporary build volume. The packaging wrapper retries the specific `Unable to detach device cleanly` / `Resource busy` failure up to three total attempts, with 5- and 10-second pauses. Persistent failures, code-signing errors, other build errors, and terminated processes still fail the workflow. Both Intel and Apple Silicon retain DMG and ZIP downloads.

These workflows do not include Windows signing certificates or Apple Developer signing/notarization credentials. The resulting apps are unsigned; operating systems may require users to explicitly approve opening them. Signing and notarization can be added when the required credentials are available.

## App self-updates

`electron-updater` uses this project's public GitHub releases. `electron-builder.yml` generates update metadata with the GitHub provider; `--publish never` keeps publication in the release workflow. Upload the updated `app/`, `scripts/`, `tests/`, `.github/workflows/`, `electron-builder.yml`, `package.json`, and `package-lock.json` together.

The release workflow uploads installers, archives, checksums and blockmaps first, then `latest.yml`, `latest-linux.yml`, and the combined `latest-mac.yml`. Each macOS matrix job creates separate metadata so Intel and Apple Silicon downloads cannot overwrite each other. The build workflow tests the actual downloader against a local fixture and rejects a corrupted SHA-512 download without running an installer.

Installed Windows builds and original Linux AppImages download updates automatically. Installation requires the Battle Hub's **Restart to update** action and no active battles. Ordinary application exit does not install updates. Unsigned macOS, Windows ZIP and extracted Linux builds check releases and offer their matching downloads instead. macOS automatic installation requires Apple code signing and a signed update path; this configuration deliberately keeps unsigned builds on the manual installation path.

Publish a higher stable version to deliver an update; update both package files and create the matching tag as usual. A released tag must contain these changes, not just the workflow files. Already installed 1.0.0 builds without this updater cannot acquire it automatically: users must install the first updater-enabled release once. Source checkouts and audit profiles never download app installers. `app/update-distribution.cjs` is `public` in this repository; private copies use `private` to prevent replacement by a public installer.

## Local builds

Use a native machine matching the target operating system and architecture, with Node.js 24 and Git:

```text
npm ci
npm run fetch:vendor
npm run setup
npm run download:addons
npm test
npm run dist
npm run verify:package
```

On a headless Linux machine, use `xvfb-run -a npm run verify:package` for the last command. Packaged verification is silent and uses a temporary profile; it does not change your saved app settings.
