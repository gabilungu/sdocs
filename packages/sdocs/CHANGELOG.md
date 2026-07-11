# Changelog

All notable changes to the `sdocs` package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.93] - 2026-07-11

### Added

- Descriptions render inline markdown: `` `code` `` becomes a styled chip
  (like doc prose), `**bold**` and `*italics*` work, and HTML in the text
  stays escaped — in showcase/doc headers, preview and example descriptions,
  and every API-table row.

## [0.0.92] - 2026-07-11

### Added

- Controls distinguish **set** from **unset**. Every set control gets a small
  ✕: on an optional prop it unsets the prop entirely — the attribute leaves
  the shown code and the component renders its own default — while on a
  required prop it resets to the documented default. A changed CSS custom
  property gets the same ✕, returning it to its `var()` fallback.
- Unset text and number inputs are empty with the prop's default as ghost
  placeholder text, instead of displaying the default as if it were typed.

### Changed

- An empty string is a real value: clearing an input keeps the prop set to
  `""` (the code shows `name=""`); only the ✕ unsets it.

## [0.0.91] - 2026-07-11

### Added

- `[LAYOUT]` entities accept `background` and `minHeight`, so a full-page
  composition can paint its canvas and claim its height without a wrapper
  element; matching `content.layout` config defaults (and completions) ship
  with them.

### Fixed

- A union prop type written across lines (the Prettier wrap: leading-pipe
  members) now generates a select control, exactly like its single-line form.
- A select for an enum prop with no default now shows a disabled
  "Please select…" placeholder instead of silently displaying the first
  option as if it were chosen.
- Prop descriptions keep their whole JSDoc text: hard-wrapped lines rejoin
  into their sentence (list items keep their breaks), and the props table
  renders the description across the full row instead of clipping it to the
  Details column.
- A doc added in a brand-new directory is picked up live: the dev server
  watches each include pattern's root recursively instead of only the
  directories that existed at startup.
- CSS custom properties from the Controls only reach the preview stage once
  they differ from the documented default — a seeded default no longer
  cascades into nested components that read the same variable and override
  their own fallbacks. Clearing a var back to its default also removes it
  from the stage again.

## [0.0.90] - 2026-07-09

### Fixed

- The prop table no longer renders a blank chip for a union type written with a
  leading `|`, as multi-line unions commonly are.
- A `[preview]`/`[example]` stage with a `maxWidth` now honours `contentX` for
  its horizontal position (left by default) instead of always centering.
  Full-page (LAYOUT) stages still center.

## [0.0.89] - 2026-07-09

### Fixed

- Prop extraction now reads a component's instance `<script>` even when a
  `<script module>` block comes first, so components with a module script no
  longer show an empty API table.

## [0.0.88] - 2026-07-09

### Added

- `minHeight` — a stage sizing attribute for `[preview]` and `[example]` blocks
  and the `content.showcase` config. It reserves a minimum height on the preview
  stage so content that overflows the box — an open dropdown, a popover — is no
  longer clipped by the auto-sized iframe. Resolves through the usual
  config → entity → block cascade.

## [0.0.87] - 2026-07-08

### Fixed

- Custom elements whose name merely starts with `style` or `script`
  (`<styled-note>`, `<script-demo>`) are no longer captured as style/script
  tags — previously they triggered a bogus "missing closer" error and silently
  dropped the rest of the body, at file, entity, and block level alike. The
  grammar got the same tag-boundary rule, so they highlight as ordinary markup.
- Reserved-name checking now covers the whole scope ladder: a file
  `<script>` declaring `args`, `__sdocsRef`, or `__sdocsExample` (or calling
  `$props()`), and destructured bindings like `const { args } = …`, are
  diagnosed at parse time instead of breaking every stage at runtime. PAGE
  entity scripts keep their `args` exemption.
- Import scanning is now string-aware everywhere: import-shaped lines inside
  template literals no longer produce false duplicate-import errors, leak
  absolute file paths into runtime strings, or feed the wrong file to props
  extraction.
- `[example title={expression}]` now fails the build like a missing title —
  the mandatory-title rule can no longer be bypassed with a non-string value.
- Preview and example slugs can no longer collide (`x-ray` vs `Ray`):
  colliding example slugs de-collide deterministically with a warning naming
  both titles, so builds stop emitting duplicate chunks.
- A quoted `>` inside a script tag's attributes (e.g. TypeScript
  `generics="Record<string, number>"`) no longer corrupts the captured
  content.
- Markdown fences now follow CommonMark closing rules end to end (scanner,
  projection, page islands, grammar): a ``` line inside a `~~~` fence is
  literal content, a fenced `[/DOC]` no longer ends the entity region in the
  editor's coloring, and fenced component tags stay displayed code.
- A code fence directly after a misplaced DOC `<style>` no longer lets the
  style apply twice; the misplaced style demotes to prose with a diagnostic,
  same as when prose follows it.
- `bind:this` injection for previews no longer fires inside attribute-value
  strings and is only suppressed by a bind on the targeted element itself.
- Escaped `\[` lines unescape at any indentation, not just at the common
  indent.
- Entity styles and DOC prose get full editor intelligence: per-entity virtual
  docs now cover SHOWCASE/DOC entity scripts and styles, an entity import used
  only by a later block no longer grays out as unused, and style tags with
  code on the opening line keep that code in the virtual documents.

## [0.0.86] - 2026-07-08

### Added

- **Entity-level `<script>` and `<style>` — the scope ladder completes.**
  One rule at every level: any container can open with a script and close
  with a style, and scopes nest lexically (file → entity → block). An entity
  script placed after the `[SHOWCASE]`/`[DOC]`/`[PAGE]`/`[LAYOUT]`
  opener is shared by that entity's blocks and body; its style joins the
  entity's stages (and the page component for PAGE/DOC/LAYOUT). Re-importing
  an identifier an outer scope already binds is an error; `component={X}`
  resolves through entity imports too. A `[PAGE]` with its own script and
  style is now a fully self-contained page component.

## [0.0.85] - 2026-07-08

### Added

- **`description` on previews and examples.** A short text rendered above a
  preview's stage or under an example's heading — the block can now say what
  it demonstrates.

### Changed

- **The code panel shows runnable code, not `{...args}`.** A plain spread
  resolves to the current control values as concrete attributes — nothing set
  shows `<X />`, edits appear as real props. A body that uses `args` in
  richer ways (`{args.x}`, `foo={args}`) instead gains a genuine
  `const args = { … }` script line, so the shown code always runs as
  written.
- **Missing example titles fail the build.** `title` on `[example]` was
  always required but only warned; `sdocs build` now fails with the file and
  position, and dev renders a loud "⚠ title required" heading instead of an
  untitled stage.
- **`--foo=` component props color like their sibling attributes** in
  editor and code panels, instead of Svelte's CSS-property scope — values
  keep their own string/expression coloring.

## [0.0.84] - 2026-07-08

## [0.0.84] - 2026-07-08

### Fixed

- **The color control resolves `var()` defaults.** A CSS prop whose default
  is a token reference (`--background` defaulting to `var(--focus)`) used
  to show a black swatch — a native color input can't parse a var(). The
  value is now resolved to its computed color inside the preview iframe,
  where the project's theme actually lives, so the swatch shows the real
  token color.

### Changed

- **Component Source sits under Preview Code.** The component's source panel
  moves from the bottom of the page (below Examples) to directly beneath the
  Preview Code panel — usage first, implementation second, both collapsed
  under the stage.

## [0.0.83] - 2026-07-08

### Fixed

- **Stage assets survive sub-path deploys.** Preview/example pages now carry
  a `<base href>` set to the build's base, so base-relative asset references
  (`src="hero.png"`, `url('hero.png')`, a `path="icons/x.svg"` prop)
  resolve against the static folder in dev and in a build deployed under a
  sub-path (`--base "/repo/"`) alike. Root-absolute `/x` URLs keep their
  usual meaning — the domain root — which is why they broke under GitHub
  project Pages. Applies to dev previews, embedded builds, and CLI builds.

## [0.0.82] - 2026-07-08

### Added

- **Stage `background`.** Preview/example stages accept a background —
  declared in `sdocs.config` (`content.showcase.background`), on the
  entity, or per block (`background="var(--bg)"`), cascading like the other
  stage attributes. The value is a CSS color or a `var()` resolved against
  the project's own css inside the stage iframe.
- **"Mixed" CSS-prop defaults.** When a documented CSS var is used with
  different `var()` fallbacks across properties, the Default column shows
  Mixed with a per-property breakdown on hover, instead of silently picking
  the first fallback. A `--x: value` declaration on the component's root now
  wins as the default, and commented-out CSS no longer counts.

### Changed

- **Grouped titles drop the group from the page title.** A showcase titled
  `:Group / Name` shows just "Name" as its heading and browser-tab title —
  the sidebar already carries the grouping.

## [0.0.81] - 2026-07-08

### Added

- **Block-level `<script>` and `<style>` in previews and examples.** A
  `[preview]`/`[example]` body can open with its own `<script>` and close
  with its own `<style>` — a full mini component. Scoping is lexical: the
  file script/style are visible to every block; a block's script and style are
  visible only in that block, so sibling examples can each declare their own
  state. Block scripts are real scripts (imports, `$state`, functions;
  `args` in scope); re-importing an identifier the file script already
  imports is reported as an error, and a block's `component={X}` can resolve
  through the block's own imports. Styles are injected into the block's stage.
  The grammar highlights block scripts/styles (embedded TS/JS/CSS), and code
  panels show the complete script + markup + style.

### Fixed

- **File-level `<style>` now actually reaches the stages.** It was parsed
  and documented as applying to the file's previews and examples but never
  wired into the generated stage modules — selectors silently did nothing.

## [0.0.80] - 2026-07-08

### Fixed

- **`class` and `...rest` forwarding render as chips, not prop rows.** The
  standard forwarding shape — `interface Props extends HTMLAttributes<…>` with
  a merged `class` and a `{...rest}` spread on the root element — used to
  pollute the props table: `...rest` was mis-read as a prop and `class` showed
  as a required row. Both are now recognized as forwarding infrastructure and
  shown as small chips under the props table ("Also forwarded to the root
  element"), with the rest chip labeled by the extended type when the interface
  declares one. Detection reads the `$props()` destructuring itself, so it
  works identically in TypeScript, plain JS, and JSDoc-typed components; an
  explicit `class?: string` interface member is treated the same way.

## [0.0.79] - 2026-07-07

### Fixed

- **Multi-line block openers highlight correctly.** In the syntax highlighter
  used by the component browser, an opener split across several lines — one
  attribute per line with the closing `]` on its own line — now colors its
  attribute lines and standalone `]`. An expression value on its own line
  (such as `args={{ … }}`) no longer leaks into the block body below it.

## [0.0.78] - 2026-07-07

### Changed

- **Union type badges split per member.** A prop typed `number | string` now
  renders as separate, individually-colored chips (an orange `number` and a
  green `string`) instead of one gray badge — matching how literal unions
  (`'sm' | 'md'`) already split. The splitter is nesting-aware, so a `|`
  inside `Array<A | B>`, an object type, or an arrow's `=>` is left intact.
- **CSS Props lists only `@cssvar`-annotated custom properties.** The table
  is now the component's declared CSS API, not every `var(--…)` the styles
  happen to reference — internal wiring vars (e.g. a mask URL held in a
  `--icon` var) no longer leak into the docs. Documented props still take
  their default from the style's `var(--x, default)` fallback.

## [0.0.77] - 2026-07-07

### Added

- **String-permitting union props get a text control.** A prop typed
  `number | string` (or any union that allows a string) previously showed no
  control at all — only literal-value unions (`'sm' | 'md'`) became a select.
  Such props now render a text box. When the type also allows a number, a
  plain-numeric entry is coerced back to a number, so a `number | string`
  "a bare number means px" convention keeps working through the control.

## [0.0.76] - 2026-07-07

### Added

- **Preview tabs are deep-linkable.** In a component doc with several
  `[preview]` blocks, the selected tab is mirrored in the URL as
  `?tab=<preview-slug>`, so a specific preview can be linked or shared
  (`…/navtree?tab=navtree-item`). Loading such a URL opens that tab; the
  first tab stays the default (clean URL), and navigating to another entity
  drops the parameter. Hydration-safe: the prerendered page shows the
  default tab and switches after mount.

## [0.0.75] - 2026-07-07

### Fixed

- **No light→dark flash on `CodeBlock`.** The pre-highlight fallback (also
  what the prerendered HTML shows until hydration) now matches shiki's dark
  stage instead of a light gray box, so when the highlighter finishes the
  swap only adds syntax colors — the background no longer flips.

## [0.0.74] - 2026-07-07

### Added

- **`sdocs build` prerenders every route.** Each emitted `index.html` now
  contains the page's real HTML — sidebar, prose, Svelte pages — rendered
  through Svelte's server renderer, plus a per-route `<title>` and, for
  showcases, the `description` as the page's meta description. The app
  hydrates on load and behaves as the same SPA afterwards; crawlers,
  link-preview bots, and no-JS readers get full pages. Dev (`sdocs dev`
  / `run`) stays a live client-rendered SPA. A route whose server render
  throws falls back to client rendering with a build warning, and
  `404.html` stays a bare shell so unknown paths boot the app.
- **The tab title follows the route.** Client-side navigation updates
  `document.title` to the same `Page – Site` shape the build prerenders.

## [0.0.73] - 2026-07-06

### Changed

- **An example's own page shows the example itself.** Opening an example
  from the sidebar renders its stage directly under the title — the
  "Preview" accordion wrapper is gone; only the collapsed Code panel
  remains below.
- **Code panels sit flush.** Every collapsible code panel (example Code,
  Preview Code, Component Source) drops the padding around the block and
  the block's rounded corners — the code fills the panel edge to edge.

## [0.0.72] - 2026-07-06

### Changed

- **`[PAGE]` split into `[DOC]` and `[PAGE]`.** The markdown-prose entity is
  now `[DOC]` — same body, same attributes (`toc`, `contentX`, examples,
  islands), new name. `[PAGE]` now means a page you *build*: a plain Svelte
  body rendered as a real page of the docs app — docs-context CSS, no stage
  tooling, no toc — inside the same max-width container DOCs use
  (`maxWidth`, `padding`, `contentX`; `maxWidth="100%"` for full-bleed).
  The config key follows: `content.doc` holds the old `content.page`
  defaults, and `content.page` now sizes Svelte pages.

### Added

- **Sectionless pages.** A `[PAGE]` without a `@section/` title prefix
  routes at the **site root** (`title="Welcome"` → `/welcome`) with no
  sidebar and no active tab — landing pages, `/pricing`-style routes. Point
  `home` at one for a landing page. Only PAGE may be sectionless; a root
  route that shadows a section slug or `/about` is a build error.
- **`CodeBlock` component.** `import { CodeBlock } from 'sdocs/ui'` renders
  highlighted code inside Svelte pages — any bundled shiki language plus
  `sdoc` itself, loaded lazily in the browser. Resolves in standalone
  projects too (the CLI provides its own copy).

### Fixed

- **Import rewriting no longer reaches into string literals.** The script
  prelude's relative-import resolution now anchors to real import
  statements, so an import-shaped line inside a string — a code sample fed
  to `CodeBlock`, say — stays exactly as written.

## [0.0.71] - 2026-07-06

### Added

- **` ```sdoc ` fences highlight in pages.** The shipped sdoc TextMate
  grammar is registered with the highlighter, so fenced code blocks
  labeled `sdoc` render block tags, attributes, and embedded Svelte with
  full colors instead of plaintext.

## [0.0.70] - 2026-07-06

### Fixed

- **Root-absolute URLs in page markdown resolve under a sub-path deploy.**
  `![x](/sample.svg)` and `[link](/guides/colors)` in a page refer to the
  site root; on a base deploy (GitHub project Pages) they now get the base
  prefix at build time, so images load and absolute internal links route.

## [0.0.69] - 2026-07-06

### Changed

- **The top bar always renders.** Previously it appeared only with two or
  more declared sections; now every site gets the full-width bar — brand,
  section tabs (a lone "Docs" tab in zero-config projects, highlighted on
  any doc route), stylesheet picker, theme and fullscreen controls — and
  the sidebar is always just search + tree. One consistent layout in every
  project and in embedded mode.

## [0.0.68] - 2026-07-06

### Changed

- **BREAKING: sections are declared, validated, and slug-referenced.** The
  config's `sections` is now an array of `{ slug, title?, order? }` objects
  in top-bar order; titles reference sections by slug
  (`title="@guides/Installation"`). An unknown `@section`, two entities on
  one route, or an unresolvable `home` renders a full-page error in dev and
  **fails `sdocs build`** — a broken structure can't deploy. Route
  collisions no longer auto-number. `defaultSection`, `sidebar.order`, and
  `sidebar.open` are removed: unprefixed titles belong to a declared (or,
  with no sections, the implicit) `docs` section, and sidebar ordering
  lives in each section's `order` array of route paths (listed first,
  alphabetical after).
- **BREAKING: the landing page moves to config.** `home: 'guides/introduction'`
  (a route path) replaces the `home` flag on `[PAGE]`. The home entity stays
  listed in its sidebar; the new bare `hide` flag on any entity keeps it
  routable but unlisted.

### Added

- **`slug` attribute on entities** — overrides the URL segment
  (`slug="my-page"`; lowercase letters, digits, hyphens); the escape hatch
  for route collisions.
- **`hide` attribute on entities** — routable, never listed in a sidebar.

## [0.0.67] - 2026-07-06

### Changed

- **BREAKING: the `[DOCS]` entity is renamed `[SHOWCASE]`.** Component
  documentation blocks are now `[SHOWCASE title="…"] … [/SHOWCASE]`, and the
  `content.docs` config key is now `content.showcase`. Rename both in your
  `.sdoc` files and `sdocs.config`. Everything else — the per-component
  "Docs" overview tab, `[PAGE]`, `[LAYOUT]`, `[preview]`, `[example]` — is
  unchanged. No `[DOCS]` alias is kept.

## [0.0.66] - 2026-07-06

### Added

- **`favicon` config option.** Point the browser-tab icon at a static asset
  (`favicon: '/logo.svg'`) or URL; defaults to the built-in sdocs icon. It's
  base-prefixed on build like other assets.

### Fixed

- **A root-absolute `logo` path resolves under a sub-path deploy.** The
  header logo is an image the Explorer renders at runtime, so (unlike assets
  in the HTML) it wasn't getting the `base` prefix and 404'd on a project
  Pages site; it's now prefixed with the base.

## [0.0.65] - 2026-07-06

### Fixed

- **`sdocs build` no longer minifies the project's CSS.** Vite 8's default
  minifier (lightningcss) is a strict parser that rejects custom-property
  names browsers accept (e.g. `--bg+100`), so a project whose stylesheet
  used them failed to build. The project's CSS is served verbatim now; JS is
  still minified.

## [0.0.64] - 2026-07-06

### Added

- **`base` path for `sdocs build`.** Deploy under a sub-path — a GitHub
  project Pages site at `/<repo>/`, say — by setting `base` in the config
  or passing `--base /repo/` on the CLI (which overrides the config, so CI
  can derive it from the repo name). Asset URLs and history routes are
  prefixed with it; `sdocs dev` still serves at the root. The build also
  emits a `404.html` (a copy of the shell) so an unknown deep link boots the
  app on a static host instead of a bare 404.

## [0.0.63] - 2026-07-06

### Added

- **`home` page.** Mark any `[PAGE]` with the bare `home` flag
  (`[PAGE title="Introduction" home]`) to make it the site's landing page:
  it renders at the root route, is linked by the logo/title, and never
  appears in a sidebar. First `home` wins.
- **About page at `/about`.** The former stats/mascot landing screen is now
  an About page — project logo, doc counts, and the sdocs version that
  built the site — always reachable at `/about`. It's the automatic landing
  page whenever no page is marked `home`.

### Fixed

- `sdocs --version` reported `unknown` (wrong package.json path); it now
  prints the real version.

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
