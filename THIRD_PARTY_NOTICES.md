# Upstream projects

This app is an independent integration, not an official Pokémon Showdown or Showdex release.

- **Pokémon Showdown client**, smogon and contributors — https://github.com/smogon/pokemon-showdown-client — AGPL-3.0. License and authorship remain in `vendor/pokemon-showdown-client`.
- **Showdex**, Keith Choison and contributors — https://github.com/doshidak/showdex — AGPL-3.0. Its full calculator is compiled from `vendor/showdex`, retaining upstream source, patches, assets, and license.
- **Electron**, OpenJS Foundation and contributors — MIT. Runtime notices are distributed with the Electron npm dependency.
- **@electron-internal/extract-zip** — Electron's pinned add-on archive extractor. Its prebuilt binaries and license are included in the npm dependency.
- **electron-updater** — MIT-licensed application release updater from the electron-builder project. Its license and dependency notices are included in the installed npm packages.
- **Node.js**, OpenJS Foundation and contributors — the release includes a matching Node.js runtime for add-on updates. Its license and bundled dependency notices are included in `build/update-runtime/LICENSE.txt`.
- **pnpm**, contributors — MIT. A pinned package-manager runtime is included for rebuilding updated Showdex sources; its license is retained in `node_modules/pnpm/LICENSE`.

Release packages retain the pinned Showdex and Pokémon Showdown client source archives in `build/upstream/`, together with this project's compatibility and styling patches in `app/` and `scripts/`.

The original Chrome packages for these add-ons are retained in `vendor/browser-addons`. Their manifests, bundled notices and authorship remain intact. Versions and package hashes are recorded in `vendor/browser-addons/versions.json`. App compatibility changes are generated separately in `build/browser-addons` by `app/browser-addons.cjs`.

- **Pokémon Showdown Enhanced Tooltips** — [Chrome Web Store](https://chromewebstore.google.com/detail/aggbolenhnpdhgcfpknifdiheppbmblb), [upstream source](https://github.com/generiskk/Pokemon-Showdown-Enhanced-Tooltips).
- **Showdown Randbats Tooltip** — [Chrome Web Store](https://chromewebstore.google.com/detail/cheogdcgfjpolnpnjijnjccjljjclplg), [upstream source](https://github.com/pkmn/randbats).
- **Three Island** — [Chrome Web Store](https://chromewebstore.google.com/detail/glhggmffomgbggeobkijjhojkjopfpho), [upstream source](https://github.com/PartMan7/Three-Island).
- **Did it Tera?** — [Chrome Web Store](https://chromewebstore.google.com/detail/afcoljllhjapfffjlfjjmcbfhhoignpo), [upstream source](https://github.com/DidItTeraDev/Did-It-Tera-).
- **Pokémon Showdown Battle History** — [Chrome Web Store](https://chromewebstore.google.com/detail/jaopbejgoiaokcpnpjbmoegpomgocaph).
- **PokePaste Exporter** — [Chrome Web Store](https://chromewebstore.google.com/detail/eehioifimidcjcdlaehajhdeaekmmdne).

Pokémon names and artwork are used by the upstream client and calculator; their respective owners retain their rights. Third-party dependencies retain their own licenses. Preserve upstream source and notices when redistributing this project.
