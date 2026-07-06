# Changelog

All notable changes to the `sdocs` package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.62] - 2026-07-06

### Fixed

- **Short pages no longer highlight the last TOC entry.** The scrollspy's
  bottom-of-scroll snap only applies when the page actually scrolls; a page
  that fits the viewport highlights its first section.

## [0.0.61] - 2026-07-06

### Added

- **Sections: full documentation sites in the Explorer.** An `@Section/`
  prefix on any entity title (`[PAGE title="@Guides/Installation"]`) groups
  docs under a full-width top bar, each section with its own sidebar — mix
  pages-only sections with component sections freely. Docs without a prefix
  land in a configurable default section (`defaultSection`, default
  `Docs`); the bar only appears once a second section exists, so existing
  projects look unchanged. Tab order comes from the new `sections` config
  (unlisted sections follow alphabetically).
- **Real URLs (history routing).** Doc routes are now slugified paths —
  `/components/button/sizes` instead of `#/Components/Button/Sizes`. The
  CLI dev server serves the shell for any path, `sdocs build` emits an
  `index.html` per route (deep links work on GitHub Pages with no rewrite
  rules), and old `#/` bookmarks translate on load. Embedding keeps hash
  URLs by default; the new `routing` config/prop switches either way, and
  section-less links resolve into the default section.

### Changed

- **Config/prop rename: `title` + `logo`.** `title` is the header text
  (was `logo`), `logo` the mascot image (was `icon`). Old configs with an
  `icon` key are mapped automatically (with a console note); the `icon`
  Explorer prop still works as an alias.

## [0.0.60] - 2026-07-06

### Added

- **The page table of contents highlights the current section.** As the
  page scrolls, the "On this page" entry for the section in view lights up;
  clicking an entry highlights it immediately and holds it through the
  smooth scroll.

## [0.0.59] - 2026-07-05

### Changed

- **Code blocks render on a dark stage.** Highlighted code — page fences and
  the code panels — always uses the dark syntax theme, so blocks read as
  code at a glance in both app themes (they previously rendered white-on-white
  in light mode).
- **A page's body `#` title matches the entity title size** (24px/700) — it
  is the page title, after all.

### Fixed

- **Every fence gets a themed block.** `bash`, `json`, `markdown`, `yaml`,
  and `diff` fences highlight properly, and unknown languages fall back to a
  plaintext shiki block instead of an unstyled bare `<pre>`.

## [0.0.58] - 2026-07-05

### Added

- **Richer page markdown.** GitHub-style alerts (`> [!NOTE]`, `[!TIP]`,
  `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) render as tinted callouts;
  task lists get proper checkboxes; table columns honor `:---:` alignment;
  external links open in a new tab (internal ones stay in the app); images
  render lazily and Svelte-safe.
- **`static` config option.** A folder of static assets served at the site
  root in dev and copied into `dist/` by `sdocs build` — `![hero](/hero.png)`
  in a page just works. Powers the standalone CLI flows; embedded apps keep
  using the host's public directory.
- **Page column alignment.** `content.page.contentX` (config) and
  `contentX` on `[PAGE]` align the content column `left`/`center`/`right`.
- **A body `#` heading takes over as the page title** — the header no longer
  duplicates it; the entity `title` keeps naming the sidebar entry.

### Changed

- **A page's `maxWidth` now bounds the content column together with its
  table of contents**; when the toc is hidden the prose takes its space.

### Fixed

- **Code fences can show component tags.** A `<Component />` line inside a
  markdown fence, preceded by a blank line, was treated as a live Svelte
  island and rendered (or crashed the page) instead of staying highlighted
  code. Fences now shield island detection, matching the scanner and the
  editor projection.

## [0.0.57] - 2026-07-05

### Added

- **`[example]` blocks inside `[PAGE]`.** Pages can now stage real code in
  the project's context, mid-prose: an example renders in place on an
  isolated iframe stage that loads the configured `css`, with a collapsed
  code panel — exactly like an example in `[DOCS]`. Stage attributes
  (`maxWidth`, `padding`, `direction`, `gap`, `contentX`, `contentY`)
  cascade from `content.docs`. Titles are required and unique per page;
  markdown fences shield block syntax, so a fence may show `[example]`
  without escaping.

### Changed

- **Page prose renders natively in the Explorer**, with the docs app's own
  typography — no longer inside an iframe that loads the project `css`. The
  boundary is now crisp: documentation is docs-styled, stages are
  project-styled. Pages gain real markdown styling (headings, lists, tables,
  code), direct table-of-contents scrolling, and native text flow. Svelte
  islands still work and run in the docs context — showcase code belongs in
  `[example]` blocks.
- **Embedded hosts pass `pageModules`.** `virtual:sdocs` now exports
  `pageModules`; forward it to `<Explorer {docs} {cssNames} {pageModules}>`
  so pages render their content. Hosts that don't pass it show page examples
  and headers but no body.

## [0.0.56] - 2026-07-05

### Added

- **`configSchema` in `sdocs/language`** — a structured description of the
  `sdocs.config.*` shape (keys, documentation, and value enums) mirroring
  `SdocsConfig`. Editor tooling reads it to complete the config file in
  projects that don't install `sdocs`, so config completion can't drift from
  the config type.

## [0.0.55] - 2026-07-05

### Changed

- **Renamed the stage alignment attributes** `align`/`alignY` (added in
  0.0.54) to **`contentX`**/**`contentY`** — for horizontal/vertical content
  alignment on `[preview]`/`[example]` and their `content.docs` and `[DOCS]`
  defaults. Values and direction-aware behavior are unchanged.

## [0.0.54] - 2026-07-05

### Added

- **Stage alignment on previews and examples.** Two direction-aware
  attributes (also settable per-kind in `content.docs` and on `[DOCS]`):
  `align` — horizontal (`left`/`center`/`right`/`justify`) — and `alignY` —
  vertical (`top`/`middle`/`bottom`/`justify`). sdocs maps each to the right
  flex property for the current `direction`, so `align="center"` centers
  horizontally in a row or a column; `justify` spreads items along the flow.
- **`attributeRules(kind)` in `sdocs/language`** — the allowed attributes and
  value shapes for a block kind, the single source of truth behind both
  diagnostics and the VS Code extension's attribute completions.

## [0.0.53] - 2026-07-05

### Added

- **Content layout is configurable — globally and in place.** The config's
  `content` option sets per-kind defaults, and the same names work as entity
  and block attributes (block beats entity beats config):
  - `maxWidth` — the content column for `[DOCS]`/`[PAGE]` (default `1200px`),
    the stage for `[LAYOUT]` (default `100%`) and for `[preview]`/`[example]`
    (default `100%`; narrower stages center).
  - `padding` — page content `32px`, preview/example stages `16px`
    (settable on `[DOCS]` as the entity default), layout stages `0px`.
  - `direction` / `gap` — preview/example stages are flex containers:
    `flex-direction` (default `row`) and `gap` (default `16px`).
  - `toc` — `[PAGE]` table-of-contents visibility (default `true`;
    `toc="false"` hides it).

## [0.0.52] - 2026-07-05

### Added

- **Svelte islands in `[PAGE]` bodies.** A line opening a component/HTML tag
  or a Svelte block (`{#snippet`, `{@render`) after a blank line starts an
  island that passes to Svelte verbatim, until its tags and blocks balance —
  blank lines inside are fine. Markdown can no longer split a snippet across
  paragraphs or cut an HTML section in half. Snippets declared anywhere on
  the page are renderable from anywhere (they land at the top level of the
  compiled fragment), so one `{#snippet}` can serve many sections.
- **Svelte coloring inside page bodies.** `{#…}…{/…}` blocks highlight as
  Svelte throughout — keywords, typed params, and the markup inside them —
  and `{@…}` tags color as keywords with TypeScript interiors, instead of
  HTML-guess colors. Fenced code and inline code stay inert.

## [0.0.51] - 2026-07-05

### Changed

- **The sdoc grammar colors `[PAGE]` bodies as markdown.** Headings, bold,
  lists, and fences highlight in page prose (the body's block indent is
  accounted for, so indented bodies don't read as code blocks). Applies
  everywhere the grammar is used — the VS Code extension and ` ```sdoc `
  fences on the site.

### Fixed

- **Page expressions with string literals no longer break the page.** The
  markdown pass HTML-escaped quotes (and `&&`, `<`) inside `{…}` expressions,
  so `{@render colorBox("#ff0000")}` or `{format("x")}` in a `[PAGE]` body
  failed to compile. Balanced `{…}` spans now pass through verbatim; prose
  around them escapes exactly as before, and code fences and inline code stay
  inert.

### Added

- **`\{` escapes a literal brace in page prose.** Previously a lone brace
  written in prose could break the page; a backslash-escaped brace now renders
  as an inert literal `{`.

## [0.0.50] - 2026-07-05

### Fixed

- **The last block of a page no longer gets clipped.** Preview iframes size
  themselves to the preview root's `scrollHeight`, but the first and last
  child's margins collapsed through that root and weren't counted — so the
  final block of `[PAGE]` content (a closing paragraph, a raw HTML block)
  was cut off. The preview root is now a block formatting context
  (`display: flow-root`), so the reported height includes everything.

## [0.0.49] - 2026-07-05

### Fixed

- **The `:` group marker no longer leaks into page headings.** A title like
  `:Group / Name` groups an entry in the sidebar, but the leading colon was
  rendered verbatim in the component/page `<h1>`. Headings now strip it, so the
  title reads `Group / Name`.

## [0.0.48] - 2026-07-05

### Changed

- **Empty API sections are hidden on component pages.** Props, CSS Props,
  Events, Snippets, Methods, and States sections now render only when the
  component actually has entries for them, instead of every section always
  showing with a "None" placeholder.

## [0.0.47] - 2026-07-05

### Fixed

- **Shared values in the file `<script>` reach previews and examples.** The
  pipeline lifted only `import` lines into a preview, so a shared value like
  `const options = […]` was `undefined` at render time even though the
  language reference promises the file script's shared values are available
  to every entity. The whole file script (imports and declarations) is now
  lifted, with its relative imports resolved.

### Changed

- Test files moved out of `src/lib` into `tests/` — they no longer ship
  compiled inside the published package.

## [0.0.46] - 2026-07-04

### Fixed

- **`npx sdocs` works in projects without a local install again.** The
  Explorer's lazy syntax highlighter (added in 0.0.36) imports `shiki`,
  which a bare project couldn't resolve from the staging directory — the
  dev server failed with `Failed to resolve import "shiki/core"`. The
  staging directory now links sdocs' own `shiki` (and `svelte`, when the
  project has none) into place; a project-local `svelte` still wins.

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
