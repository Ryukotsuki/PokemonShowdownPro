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

## Publish version 1.0.0

1. Confirm `package.json` and `package-lock.json` both contain version `1.0.0`.
2. Open **Releases → Draft a new release**.
3. Create tag **v1.0.0** targeting the commit with the workflow files.
4. Add your release title and description, then publish the release.
5. **Release apps** builds all four configurations and attaches the downloads and checksums to that release after every job passes.

If the release already exists, open **Actions → Release apps → Run workflow**, and enter `v1.0.0`. The tag must already exist and contain these workflow files. Uploading fixes to the default branch does not change the source of an existing tag.

The release tag must match `v` followed by the package version. For a later release, update both package files before creating its tag. The workflow's built-in `GITHUB_TOKEN` provides release-upload permission; no personal access token is needed.

## Signing

These workflows do not include Windows signing certificates or Apple Developer signing/notarization credentials. The resulting apps are unsigned; operating systems may require users to explicitly approve opening them. Signing and notarization can be added when the required credentials are available.

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
