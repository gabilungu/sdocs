# Changelog

All notable changes to the `sdocs` package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.35] - 2026-07-03

### Fixed

- **The embedded Explorer guards its typography.** Host apps commonly style
  bare `code`, `pre`, and `a` elements; those rules reached into the
  Explorer's UI (shrinking code blocks, recoloring links). The Explorer now
  pins its own font family, sizing, and link color at the `.sdocs-app`
  boundary. Hosts with higher-specificity global rules should still scope
  them away from `.sdocs-app`.

## [0.0.34] - 2026-07-03

### Fixed

- **Preview paths are short and project-relative.** Preview URLs and emitted
  file names used to encode the doc's absolute filesystem path, which leaked
  the machine's directory layout into published sites and produced path
  segments long enough for GitHub Pages to reject the deployment. Paths are
  now encoded relative to the project root.

## [0.0.33] - 2026-07-03

### Added

- **Embedded apps can deploy under a sub-path.** Preview URLs pick up the
  host Vite `base` automatically; SvelteKit apps (whose base Vite doesn't
  see) pass it explicitly via the new `previewBase` prop on `Explorer` —
  e.g. `previewBase={base}` with `base` from `$app/paths`.

## [0.0.32] - 2026-07-03

### Changed

- **Breaking: the embedded component is the Explorer now.** Import
  `Explorer` from `sdocs/explorer` instead of `App` from `sdocs/client` —
  same component and props, named for what it is. The CLI help and
  generated app use the same naming.

## [0.0.31] - 2026-07-03

### Added

- **`icon` config option** — the sidebar header icon is now configurable:
  `'sdocs'` shows the built-in mascot (the default), any other string is
  used as an image URL, and `false` hides it.

## [0.0.30] - 2026-07-03

### Fixed

- The `sdocs dev`/`run` explorer UI rendered unstyled since 0.0.28: with the
  staging directory under `node_modules`, the Svelte plugin doesn't serve
  virtual CSS modules for the client's components. Styles are now compiled
  into the components in dev. (Static builds were unaffected.)

### Added

- The package exports `./package.json`.

## [0.0.29] - 2026-07-03

### Fixed

- `sdocs dev`/`run` no longer floods the console with unresolved-import
  errors on Vite 8 (its rolldown-based dependency scanner can't walk `.svelte`
  entry graphs). The initial scan is skipped — dependencies are still
  optimized on demand — and `svelte` is pre-bundled up front.

## [0.0.28] - 2026-07-03

### Changed

- **`sdocs dev`/`run`/`build` no longer write a `.sdocs/` directory into the
  project.** The generated app is staged in a unique directory under
  `node_modules/.cache/` (imports resolve exactly as before) and removed on
  exit. This also fixes `sdocs build` breaking a concurrently running dev
  server — they previously shared the same staging directory.

## [0.0.27] - 2026-07-03

### Added

- **`sdocs run`** — same as `dev`, built for `npx sdocs run`: works with no
  local install. The dev server allows sdocs' own files from the npx cache,
  and when the project has its own `svelte`, previews dedupe onto it, so
  components and their dependencies always resolve from the project.

### Changed

- `sdocs build` applies the same svelte dedupe as the dev server.

## [0.0.26] - 2026-07-03

### Fixed

- **Embedded production builds now include working previews.** The Vite
  plugin emits each preview as a static page (plus your `css` stylesheets)
  into the host app's client build under `previews/`, and `virtual:sdocs`
  references those pages — preview iframes no longer 404 in deployed apps.
- The standalone CLI (`sdocs dev`/`sdocs build`) failed from an installed
  package: the client app was staged from a wrong path, and its `ui/` styles
  and fonts were not staged at all.
- The docs UI stops calling the dev-only highlight endpoint after the first
  failure in production and falls back to plain code.

## [0.0.25] - 2026-07-02

### Added

- **JSDoc prop extraction for plain-JS components.** Both `@type {{ ... }}`
  object annotations and `@typedef {Object} Props` with `@property` tags on
  the `$props()` declaration are parsed — types, optionality (bracketed
  names), and descriptions all flow into the docs and interactive controls.
- A prop-parser test suite; `npm test` now runs it.

### Fixed

- Props typed as `import('svelte').Snippet` are classified as snippets.

## [0.0.24] - 2026-07-02

### Changed

- Snippets receive `args` as a real snippet parameter: write
  `{#snippet Default(args)}`. Previews render snippets through `{@render}`,
  so `args` is an explicit, editor-visible binding instead of a value injected
  into scope. Parameterless snippets keep working unchanged.

## [0.0.23] - 2026-04-16

First documented release. `sdocs` is a lightweight documentation tool for Svelte 5
components; this entry describes its capabilities as of 0.0.23.

### Added

- **CLI** — `sdocs dev`, `sdocs build`, `sdocs preview`, and `sdocs init`.
- **Vite plugin** (`sdocs/vite`) for embedding the explorer in an existing Vite or
  SvelteKit app, exposing discovered docs through the `virtual:sdocs` module.
- **Three `.sdoc` kinds** — component docs (`.sdoc`), standalone pages
  (`.page.sdoc`), and full-page layouts (`.layout.sdoc`).
- **Prop extraction** from component types, rendered as a props table.
- **Interactive controls** for live-editing component props and CSS custom
  properties.
- **Theming** with light and dark modes and named-stylesheet switching.
- **Configurable sidebar** ordering and hash-based routing.
- **Syntax highlighting** via Shiki.
- Package entry points: `sdocs`, `sdocs/vite`, `sdocs/client`, and `sdocs/ui`.

## [0.0.20] - 2026-04-15

### Changed

- Redesigned the component view and added snippet-based preview code.

## [0.0.18] - 2026-02-27

### Changed

- Scoped the explorer's CSS under `.sdocs-app` to keep its styles from leaking
  into component previews.

## [0.0.17] - 2026-02-27

### Fixed

- Corrected the `Icon` component imports.

## [0.0.16] - 2026-02-27

### Added

- Rewritten codebase: the current architecture for `.sdoc` discovery, preview
  rendering, and the component explorer UI.
