# Changelog

All notable changes to the `sdocs` package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.45] - 2026-07-04

### Fixed

- **The sdoc grammar survives multi-block files.** The embedded Svelte
  grammar opens a text region after any line ending in `>` that only closes
  at the next `<` or `{` — it swallowed block closers, leaving everything
  after the first `[preview]` uncolored. Block bodies now embed Svelte
  behind line-guarded regions (the mechanism markdown fences use), so
  closers, sibling blocks, and later entities all highlight correctly.

## [0.0.44] - 2026-07-04

### Changed

- The README documents the block format — the npm listing previously showed
  the retired `export const meta` convention.

## [0.0.43] - 2026-07-04

### Added

- **`projectSdoc` in `sdocs/language`** — a line-preserving projection of a
  `.sdoc` file onto a virtual Svelte document: every authored line keeps its
  exact position, sub-block openers become the same `{#snippet}` wrappers
  the build generates, PAGE prose stays live with code regions masked, and
  a trailer past the authored end marks everything as used. This is the
  foundation of the VS Code extension's sdoc language server.

### Changed

- The Explorer's own UI library docs (`src/lib/ui/*.sdoc`) are converted to
  the block format.

## [0.0.42] - 2026-07-04

### Changed

- **Breaking: `.sdoc` files are the block format.** A doc file is now
  `<script>` on top, `[DOCS]`/`[PAGE]`/`[LAYOUT]` entity blocks in the
  middle, `<style>` at the bottom — the language documented in the site's
  Language section. Each entity is its own sidebar entry, so one file can
  hold several. The `export const meta` convention, `{#snippet}` extraction,
  auto-generated `Default` previews, and the `.page.sdoc`/`.layout.sdoc`
  filename kinds are gone.
- **`[DOCS]` holds any number of previews.** Each
  `[preview component={X} args={{…}}]` is self-contained; several render as
  tabs, each a fully live panel with its own controls, extracted API tables,
  and component source. `[example title="…"]` blocks are frozen and render
  page-level below the tabs.
- **`[PAGE]` bodies are markdown** — GFM with `{expression}` interpolation
  and Svelte component islands; code fences and inline code are inert. The
  table of contents comes from the markdown headings.
- **Parsing never crashes the dev server.** Doc files parse through the
  `sdocs/language` scanner; mistakes surface as file:line warnings and the
  rest of the file keeps working.
- **Breaking for embedders:** `DocEntry` is reshaped (`previews`/`examples`/
  `content` replace `snippets`/`componentData`), and preview URLs address
  entities as `path#slug`.

## [0.0.41] - 2026-07-04

### Added

- **`sdocs/language`** — a scanner and parser for the block-based sdoc
  format: line-anchored `[DOCS]`/`[PAGE]`/`[LAYOUT]` entities with
  `[preview]`/`[example]` sub-blocks, Svelte-style attributes, precise
  source spans, and recoverable diagnostics (it never throws, and keeps
  scanning past mistakes). Groundwork for the format switch — the runtime
  still reads the current `.sdoc` format.
- **A TextMate grammar for sdoc** at `sdocs/grammar/sdoc.tmLanguage.json`,
  usable by any TextMate-compatible highlighter; the documentation site
  uses it to highlight ```` ```sdoc ```` fences.

## [0.0.40] - 2026-07-04

### Fixed

- **Wrapped previews bind to the documented component.** When a preview
  wraps the documented component in another one (a `<Tab>` shown inside
  `<Tabs>`), method calls and live state used to attach to the outer
  wrapper — the first capitalized tag in the snippet. The preview ref now
  binds to the doc's own component wherever it appears in the snippet,
  falling back to the first capitalized tag when it's absent.
- **Usage-code patching matches the component name exactly.** Attribute
  updates from the controls located the root tag with a prefix search, so
  a component like `Tab` could patch a sibling `<Tabs>` tag instead of its
  own. The tag search now requires a whole-name match.

## [0.0.39] - 2026-07-04

### Changed

- **Methods and States join the unified section layout.** Methods render a
  single signature chip (`(params) => returns`, colored like events) with
  the Run button in the control rail; States show their live value in a
  "Current value" rail. The value rail widens to align section right edges
  when it's the last column. All six sections now share one table
  implementation.
- **JSDoc types display like TypeScript types.** `import('module').`
  qualifiers are stripped for display and classification, so
  `import('svelte').Snippet<[…]>` renders as the same pink `Snippet<[…]>`
  chip as in TS components.

## [0.0.38] - 2026-07-04

### Changed

- Names in the API tables are slightly larger (14px), giving each row a
  clearer anchor.

## [0.0.37] - 2026-07-03

### Changed

- **The component page is a live API reference.** The separate Controls
  panel is gone — controls sit inside the API tables, on the row of the
  prop or CSS custom property they drive. Props, CSS Props, Events, and
  Snippets share a composite row layout: name (with a red `*` when
  required), type and description stacked in the middle, an explicit
  Default column (`—` when absent), and a fixed control rail. Reset moved
  next to the Props title.
- **Sections instead of collapsible panels.** The reference sections render
  flat with icon titles; only the preview and its code stay in the bordered
  card (Preview Code still collapses). "State" is now "States", matching
  the plural sibling sections. The page grew to 1120px.
- **Color-coded types and values.** Type chips are tinted by kind — strings
  green, numbers and dimensions amber, booleans purple, callbacks blue,
  snippets pink, colors cyan, `void` slate — union members render as
  individual chips, and default/state literals are colored plain text.
  Both themes are handled explicitly.

### Added

- **Run buttons for methods.** Zero-argument methods can be invoked
  directly from the Methods table and act on the live preview; methods
  with parameters show a disabled button.
- **Live state values.** The States table shows each exported state's
  current value, streamed from the preview as it changes.
- Section icons (sliders, palette, zap, function, database) join the UI
  icon set.

## [0.0.36] - 2026-07-03

### Fixed

- **Usage code is syntax-highlighted in static builds.** The usage snippet
  regenerates in the browser as controls change and used to be highlighted
  through a dev-server endpoint — deployed builds fell back to plain text.
  Highlighting now runs client-side (lazy-loaded Shiki with the JavaScript
  regex engine), identical on the dev server and any static host; the
  dev-server endpoint is gone.

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
