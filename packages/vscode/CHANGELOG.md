# Changelog

All notable changes to the sdocs VS Code extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.59] - 2026-07-11

### Changed

- `[component]` is the canonical name for the live component block:
  completions insert it, the new-doc template uses it, hovers document it
  (with `[preview]` noted as the old name), the grammar highlights both, and
  the formatter preserves whichever tag a file uses.

## [0.0.58] - 2026-07-09

### Added

- Completion and validation for the `minHeight` stage attribute on `[preview]`
  and `[example]` blocks and in the `content.showcase` config.

## [0.0.57] - 2026-07-08

### Fixed

- The language server no longer crashes when a `.sdoc` file is opened without
  a workspace folder: the embedded Svelte server now roots itself at the first
  opened document's directory instead of the filesystem root, and background
  file-watcher errors can no longer kill the server process.
- Diagnostics are now pulled per edit and stamped with the document version,
  so an edit no longer briefly republishes stale errors at shifted positions
  (or leaks hints about generated code) before correcting itself.
- Format Document no longer deletes authored text on lines with scan errors —
  a duplicate attribute or trailing text after an opener survives formatting
  byte-identical while the rest of the file still formats.
- Formatting a CRLF file keeps CRLF endings throughout instead of emitting a
  mix; formatting is now idempotent (format-on-save no longer produces a
  second diff on the next save).
- Completion no longer offers destructive snippet-wrapper edits on block
  opener lines, and go-to-definition no longer returns garbage ranges for
  generated wrapper code.
- `[DOC]` and `[SHOWCASE]` fold by their markers (the folding rules still
  referenced the old `DOCS` kind).

## [0.0.56] - 2026-07-08

### Added

- **Language intelligence for entity-level `<script>`/`<style>`** (sdocs
  0.0.86): the merged scope chain (file → entity → block) is type-checked as
  one script, block markup sees entity declarations, misplaced entity tags
  are flagged, and entity scripts and styles highlight at every position.
  A block without its own script still gets full intelligence when its
  entity declares one.

## [0.0.55] - 2026-07-08

### Fixed

- **Bracket-pair colorization no longer marks CSS braces red.** The language
  configuration colorized `<` `>` as a bracket pair — angle brackets are
  not reliably pairable in markup (arrows, comparisons, text), which threw
  the matcher off and painted rule braces in embedded CSS as unexpected.
  Colorization now covers `{}`, `[]`, and `()` only, and `[]` joins
  the bracket list proper (block tags match and jump).

### Added

- **`description` completes and lints** on `[preview]` and `[example]`
  (matching sdocs 0.0.85), and `--foo=` component props highlight like
  sibling attributes.

## [0.0.54] - 2026-07-08

### Changed

- **Formatting defaults to `htmlWhitespaceSensitivity: "ignore"`.** Long
  openers with text content no longer wrap into the whitespace-hugging form
  (`…}}\n>text` / `</Tag\n>`) — block bodies are demo code in normal
  flow, where that strictness costs readability and buys nothing. An explicit
  `htmlWhitespaceSensitivity` in the project's `.prettierrc` still wins,
  same as `printWidth`/`tabWidth`/`useTabs`.

## [0.0.53] - 2026-07-08

### Fixed

- **Block-script edge cases from the 0.0.52 feature.** A TS block script
  inside a plain-JS file script keeps its `lang` in the editor projection
  (no more false parse errors); an unclosed block `<script>` reports only
  the unclosed-tag error, without a contradictory position error; the
  component-existence check ignores commented-out imports; and document syncs
  are serialized per file, hardening the block virtual-doc lifecycle.

### Added

- **`background` stage attribute** completes and lints on `[SHOWCASE]`,
  `[preview]`, and `[example]`, and `content.showcase.background`
  completes in `sdocs.config` (matching sdocs 0.0.82).

## [0.0.52] - 2026-07-08

### Added

- **Language intelligence for block-level `<script>`/`<style>`.** A
  `[preview]`/`[example]` that declares its own script or style is checked
  as its own mini component — the file script and block script share one
  scope, so completion, hover, and type-checking work inside block scripts,
  markup referencing block-script variables checks cleanly, and a block
  `<style>` gets CSS intelligence. Misplaced block tags are flagged (script
  must open the body, style must close it), re-importing a file-script
  identifier is an error, and `component={X}` resolves through the block's
  own imports too. Format Document formats the body as a mini Svelte file —
  script first, style last. The grammar colors block scripts and styles.

## [0.0.51] - 2026-07-07

### Fixed

- **Wrapped block openers keep their syntax highlighting.** When an entity or
  sub-block opener wraps onto several lines — one attribute per line with the
  closing `]` on its own line — the attribute lines and the standalone `]` are
  now highlighted, matching the inline form. An expression value on its own
  line (such as `args={{ … }}`) no longer bleeds into the block body below it,
  so a formatted `[preview]`/`[example]`/`[SHOWCASE]` opener stays fully
  colored.

## [0.0.50] - 2026-07-07

### Changed

- **Formatting honors the project's Prettier config.** Width and indentation
  now come from the project's `.prettierrc` (`printWidth`, `tabWidth`,
  `useTabs`) when present, so a `.sdoc` island wraps like a sibling `.svelte`
  file; the editor's options are the fallback, `printWidth` 80 the last resort.
- **Block openers wrap when too wide.** An entity or sub-block opener whose
  single-line form exceeds `printWidth` now breaks onto one attribute per line
  (with the closing `]` back at the tag indent); shorter openers stay on one
  line. Attribute values are copied verbatim — never reformatted — and the
  scanner parses the multi-line form back identically.

## [0.0.49] - 2026-07-06

### Changed

- **The `[PAGE]` split lands in the editor.** The markdown-prose entity is
  now `[DOC]`; `[PAGE]` is a plain-Svelte page in the docs context. The
  grammar highlights DOC bodies as markdown and PAGE bodies as Svelte;
  formatting routes the same way (DOC prose through the markdown formatter,
  PAGE bodies as Svelte fragments); block completions offer both entities
  and their attribute sets; tag hovers describe the new semantics.
- **Sectionless pages lint clean.** The section-prefix check skips `[PAGE]`
  entities — a PAGE without `@section/` legitimately routes at the site
  root.

## [0.0.48] - 2026-07-06

### Added

- **Section references are checked against `sdocs.config`.** An
  `@section/` title prefix that names an undeclared section — or an
  unprefixed title when no `docs` section is declared — gets a diagnostic
  on the title attribute (matching sdocs 0.0.68's declared sections).
- **`slug` and `hide` attributes** complete, lint, and appear in entity
  hovers; the config completion offers the new `sections` object shape and
  `home` (and drops `defaultSection`/`sidebar`).

## [0.0.47] - 2026-07-06

### Changed

- **BREAKING: `[DOCS]` is renamed `[SHOWCASE]`** in grammar highlighting,
  diagnostics, attribute completion, hovers, the Create Component
  Documentation scaffolder, and formatting — matching sdocs 0.0.67. The
  config completion offers `content.showcase` (was `content.docs`).

## [0.0.46] - 2026-07-06

### Added

- **`favicon` config key** offered in `sdocs.config` completion.

## [0.0.45] - 2026-07-06

### Added

- **`base` config key** offered in `sdocs.config` completion (build sub-path
  for GitHub project Pages).

## [0.0.44] - 2026-07-06

### Added

- **`home` attribute on `[PAGE]`.** Recognized in diagnostics and offered in
  attribute completion (a bare flag) — marks a page as the site landing page.

## [0.0.43] - 2026-07-06

### Changed

- **Formatting normalizes block-tag indentation.** Entity tags (`[PAGE]`,
  `[DOCS]`, `[LAYOUT]` and their closers) sit at column 0,
  `[preview]`/`[example]` tags one level in, bodies one level deeper — a
  misplaced `[/example]` or `[/PAGE]` snaps back into place on format. Tag
  attributes are still never reformatted, and unclosed blocks stay verbatim.

## [0.0.42] - 2026-07-05

### Added

- **Restart button in the Projects panel.** Each running project card gains
  ↻ Restart between Browser and Stop — same behavior as the docs tab's
  restart: the server relaunches and any open docs tab reloads when it's
  ready.

### Changed

- A formatting regression fixture pins the fence behavior on a feature-rich
  page (fences never split, tags never join) — the failure mode of the
  pre-0.0.41 island segmentation.

## [0.0.41] - 2026-07-05

### Added

- **`contentX` on `[PAGE]`** lints, completes, and appears in the hover —
  it aligns the page's content column (`left`/`center`/`right`).
- **`static` completes in `sdocs.config.*`** — the bundled config schema
  gained the new static-assets option.

### Fixed

- **Format Document no longer treats fenced component tags as islands.** A
  `<Component />` line inside a markdown fence stayed at the mercy of the
  Svelte fragment formatter; fences now shield island segmentation.

## [0.0.40] - 2026-07-05

### Added

- **`[example]` blocks inside `[PAGE]`** are fully supported: `[` inside a
  page offers the example block, its body gets Svelte language intelligence
  (completion, hover, diagnostics at authored lines), the grammar colors it
  as Svelte within the markdown body, and Format Document formats it as a
  Svelte fragment while the prose around it stays markdown. Diagnostics
  validate titles (required, unique per page) and reject `[preview]` in
  pages with a pointed message; block syntax inside markdown fences stays
  content.

### Changed

- `[PAGE]` and `[example]` hovers describe the styling boundary: page prose
  is docs-styled, example stages load the project's css.

## [0.0.39] - 2026-07-05

### Added

- **Config completion for `sdocs.config.*`.** Completes config keys at every
  level (`content` → `docs` → `contentX`…), value suggestions for the
  enumerated options (`contentX`, `contentY`, `direction`, `toc`, …), and
  inline docs. In projects with `sdocs` installed the TypeScript server
  drives it from the `SdocsConfig` type (with type-checking); where `sdocs`
  isn't installed the extension fills in from a bundled schema — detected per
  project.

## [0.0.38] - 2026-07-05

### Changed

- The stage alignment attributes are now **`contentX`**/**`contentY`** (were
  `align`/`alignY`) in diagnostics, completions, and hovers.

## [0.0.37] - 2026-07-05

### Added

- **Stage alignment attributes.** `align` (horizontal) and `alignY`
  (vertical) lint, complete, and appear in `[preview]`/`[example]`/`[DOCS]`
  hovers, alongside the existing stage-layout attributes.

## [0.0.36] - 2026-07-05

### Fixed

- **Attribute autocomplete offers every allowed attribute.** Completions were
  a hardcoded list that had drifted from validation, so `maxWidth`, `padding`,
  `direction`, `gap`, and `toc` were flagged as unknown yet never suggested.
  Completions now derive from the same parser rules diagnostics use, so the two
  can't diverge again; each item shows its value hint and whether it's required.

## [0.0.35] - 2026-07-05

### Added

- **The stage layout attributes lint and complete.** `maxWidth`, `padding`,
  `direction`, `gap`, and `toc` (each where the language allows them) are
  known to diagnostics, attribute completions, and the block tag hovers.
- **Hover documentation for block tags.** Hovering `[DOCS]`, `[PAGE]`,
  `[LAYOUT]`, `[preview]`, or `[example]` — opener or closer — shows the
  tag's purpose and attributes with a link to the language reference,
  instead of nothing.

## [0.0.34] - 2026-07-05

### Fixed

- **Format Document can no longer break a page — and it indents islands
  properly.** `[PAGE]` formatting now recognizes Svelte islands — snippets,
  HTML sections, component tags — and formats each as a Svelte fragment
  (canonical indentation, one that doesn't parse stays exactly as written),
  while the markdown prose between them formats as markdown. Previously
  prettier's markdown pass could re-indent island lines into a shape that
  failed to compile.
- **Svelte islands color as Svelte in page bodies.** `{#snippet}` blocks get
  Svelte highlighting throughout — keywords, typed params, and the markup
  inside them — and `{@render …}` tags color as keywords with TypeScript
  interiors, instead of HTML-guess colors, via the updated sdoc grammar.

## [0.0.33] - 2026-07-05

### Added

- **Markdown highlighting in `[PAGE]` bodies.** Page prose now colors as
  markdown — headings, bold, lists, fences — instead of rendering plain.
- **Format Document covers `[PAGE]` bodies.** Page prose formats through
  prettier's markdown formatter: markup is normalized (bullets, spacing) and
  re-indented at the block level; prose lines are never re-wrapped, and
  Svelte islands and `{expressions}` pass through untouched.

### Changed

- The scaffolding command is now **sdocs: Create Component Documentation**
  (was "sdocs: New Component Doc") — in the `.svelte` context menu and the
  command palette.

### Fixed

- **Hovering a block tag no longer shows `{#snippet}` documentation.** Block
  openers project to snippet wrappers in the virtual Svelte document; hover,
  go-to-definition, and signature help on those generated lines are now
  answered locally instead of forwarded.

## [0.0.32] - 2026-07-05

### Added

- **Restart button on the docs tab.** Alongside refresh, a restart action in
  the tab's title bar stops the project's dev server and starts it again, then
  reloads the tab once it's back — for a clean boot after editing
  `sdocs.config.*`, installing dependencies, or if the server wedges (refresh
  only reloads the page).

### Changed

- The docs-tab reload command is now **Refresh sdocs Tab** (was "Refresh Docs
  Tab").

## [0.0.31] - 2026-07-05

### Fixed

- **The Output dropdown no longer shows two identical "sdocs" channels.**
  The docs-server runner and the language client both named their channel
  "sdocs"; the language client's is now "sdocs Language Server".

## [0.0.30] - 2026-07-05

### Fixed

- **Completions failed in projects without prettier installed.** The
  embedded Svelte server resolves prettier from disk inside every
  completion request (TypeScript format settings); the packaged extension
  shipped no copy, so in workspaces without their own prettier each request
  threw `Cannot find module 'prettier/package.json'` and the editor showed
  "No suggestions". prettier and prettier-plugin-svelte now ship beside the
  server bundle; a workspace's own copies still win.

## [0.0.29] - 2026-07-04

### Fixed

- **Component prop autocomplete inside block bodies.** The server
  advertised space as a completion trigger character, but the embedded
  Svelte server returns nothing for a space-triggered request — so typing
  `<Button ` cached an empty result and left you with "No suggestions" as
  you typed attribute names (Ctrl+Space still worked). The server now
  mirrors exactly the trigger characters the embedded Svelte server
  answers, so props complete as you type.

## [0.0.28] - 2026-07-04

### Fixed

- **Highlighting no longer dies after the first `[preview]`.** Multi-block
  files (several examples, several entities) lost all sdoc coloring past
  the first sub-block; block bodies now embed Svelte behind line-guarded
  regions so every closer and sibling block colors correctly.

### Changed

- **Block completions insert bare skeletons.** `[` completions no longer
  pre-populate placeholder content ("Group / Name", a preview block) —
  just the opener with an empty attribute, the closer, and the cursor in
  place.

## [0.0.27] - 2026-07-04

### Fixed

- **False errors everywhere in installed copies.** The embedded TypeScript
  service loads its standard-library `.d.ts` files and svelte2tsx's shim
  declarations from disk; the packaged extension shipped neither, so every
  `.sdoc` file drew `ts(2697)` "include ES2015 in your --lib" and
  `ts(2304)` "Cannot find name '__sveltets_2_…'" errors. Both now ship
  beside the server bundle.

## [0.0.26] - 2026-07-04

### Added

- **Block completions on `[`.** Typing `[` on a new line offers whole block
  skeletons: `DOCS`/`PAGE`/`LAYOUT` at the top level, `preview`/`example`
  inside a `[DOCS]` entity — each inserted with its closer and cursor in
  the right spot (the auto-closed `]` is cleaned up).

## [0.0.25] - 2026-07-04

### Fixed

- **The language server crashed on startup in installed copies.** The
  embedded Svelte language server resolves a fallback `svelte` package from
  disk at runtime; the packaged extension shipped none, so the server died
  immediately ("crashed 5 times in the last 3 minutes"). The fallback
  package now ships beside the server bundle. Projects with their own
  `svelte` installed still get their version, as before.

## [0.0.24] - 2026-07-04

### Changed

- The README describes the sdoc language server and block format — the
  Marketplace listing previously showed the retired meta convention.

## [0.0.23] - 2026-07-04

### Added

- **The sdoc language server.** `.sdoc` files now run as their own language,
  served by a bundled language server that projects each file onto a
  line-preserving virtual Svelte document (block tags become the same
  snippet wrappers the build pipeline generates) and runs the embedded
  Svelte language server over it. Completion, hover, diagnostics,
  go-to-definition, and signature help work inside `<script>` and every
  block body — reported at the authored position, with zero false errors
  on block syntax.
- **Format Document for .sdoc.** Fragment-wise: the file `<script>`/`<style>`
  and every Svelte block body format through prettier independently and
  reassemble at the block's indentation. Block tags and `[PAGE]` prose are
  never touched.

### Changed

- **The language-flip hack is gone for `.sdoc`.** Files keep the `sdoc`
  language id, so the sdoc grammar is the active editor grammar and the
  explorer file icon no longer reverts to Svelte while a doc is open. (The
  flip remains only for `sdocs.config.*`, which runs as JS/TS.)

## [0.0.22] - 2026-07-04

### Changed

- **IntelliSense and diagnostics speak the block format.** The extension
  now runs the same `sdocs/language` parser as the build pipeline:
  structural and semantic problems (unclosed blocks, casing, missing or
  unknown attributes, duplicate titles, non-literal `args`) are flagged
  with precise ranges as you type, plus a check that `component={X}` is
  imported in the file. Completions offer each block's attributes and
  imported identifiers inside `component={…}`; **New Component Doc**
  scaffolds a `[DOCS]` block. The `export const meta` lint and completions
  are gone, along with the `sdoc (page)` / `sdoc (layout)` language
  variants — one `.sdoc` language covers every file.

## [0.0.21] - 2026-07-04

### Added

- **sdoc syntax highlighting.** A TextMate grammar for the block-based
  sdoc format: `[DOCS]`/`[PAGE]`/`[LAYOUT]` entities, `[preview]`/
  `[example]` blocks, and Svelte-style attributes, with embedded
  TypeScript, JavaScript, CSS, and Svelte coloring in the right places.
  The grammar injects into markdown, so ```` ```sdoc ```` fences highlight
  in any markdown file. `.sdoc` files also gain a language configuration:
  comments, bracket pairs, and folding on entity blocks.

## [0.0.20] - 2026-07-03

### Changed

- The project card's Open button tooltip now says "Open the Explorer tab",
  matching the Explorer naming across sdocs.

## [0.0.19] - 2026-07-03

### Changed

- The `sdocs config` language icon is now the mini mascot. File icon themes
  that map `.js`/`.ts` (most do) still control the explorer icon for
  `sdocs.config.*` files; the mascot appears in the language picker and
  under themes without such a mapping.

## [0.0.18] - 2026-07-03

### Added

- **Refresh for the docs tab** — a refresh button in the tab's title bar,
  plus `Cmd+R` (macOS) / `Ctrl+R` reload the preview while the docs tab is
  active. Outside the docs tab the keys keep their normal meaning.

## [0.0.17] - 2026-07-03

### Changed

- The docs preview tab icon is now an SVG mascot, crisp at any zoom level.

## [0.0.16] - 2026-07-03

### Added

- **Per-variant file icons are back.** `.sdoc`, `.page.sdoc`, `.layout.sdoc`,
  and `sdocs.config.*` files show their own icons in the explorer again
  (removed in 0.0.14 when `.sdoc` moved to the `svelte` language id). The
  icon-bearing language ids are contributed for the static file mapping, and
  each document is switched to `svelte` (or `javascript`/`typescript` for
  config files) as it opens, so the language server experience is unchanged.
- The docs preview tab shows the sdocs mascot instead of the generic
  webview icon. The activity bar icon is the mascot silhouette instead of
  a generic book.
- **sdocs view in the activity bar.** Project cards for every sdocs project
  in the workspace — folders with an `sdocs.config` file or `.sdoc` files,
  plus any added via the new `sdocs.scopes` setting (handy in monorepos).
  Each card shows the folder name, path, live status, and port, with
  Run / Open / Browser / Stop actions. Running docs open in an editor tab —
  one per project, re-focused instead of duplicated. Uses the project's own
  sdocs install when present, `npx sdocs` otherwise. Server logs stream to
  the "sdocs" output channel.

## [0.0.15] - 2026-07-02

### Added

- **"sdocs: New Component Doc" command** — right-click a `.svelte` file in the
  explorer (or run from the palette) to scaffold `X.sdoc` next to it, pre-filled
  with the component import, meta, and a `Default(args)` snippet. Opens the
  existing doc if one is already there.
- **`component:` value completion** — inside `export const meta`, completing
  after `component:` suggests the identifiers imported in the file.
- **sdocs diagnostics** — warnings for: missing `export const meta`, missing
  `meta.title`, a `meta.component` identifier that isn't imported or declared,
  and duplicate top-level snippet names (which collide as sub-pages).

### Changed

- Meta-field completion no longer fires in value positions (those belong to
  the language server).

## [0.0.14] - 2026-07-02

### Added

- **Full Svelte IntelliSense in `.sdoc` files.** `.sdoc`, `.page.sdoc`, and
  `.layout.sdoc` are now served by the Svelte language server: completion,
  hover with types and JSDoc, live TypeScript and Svelte diagnostics,
  go-to-definition, and native formatting — the complete `.svelte` editing
  experience.
- Meta-field autocomplete now also works in `.page.sdoc` and `.layout.sdoc`
  files, inserts `field: ` ready to type, and no longer suggests fields the
  meta object already has.

### Fixed

- Meta-field autocomplete no longer misfires inside strings (e.g. a `}` in a
  `title` value) or pops up in markup after an unclosed `{`.
- `sdocs.config.ts`/`.js` files get their TypeScript/JavaScript IntelliSense
  back — the extension no longer claims them as a custom language.

### Removed

- The scratch-file formatter — obsolete now that the Svelte language server
  formats `.sdoc` files natively. Leftover scratch files from earlier versions
  (`node_modules/.cache/sdocs-format/`) are cleaned up on activation.
- Per-variant file icons for `.sdoc` files, and the `[sdoc]`, `[sdoc-page]`,
  and `[sdoc-layout]` settings scopes: `.sdoc` files now use the `svelte`
  language id, which is what enables the language server. Settings previously
  scoped to those ids (and the formatter default the extension used to ship)
  move to the `[svelte]` scope — see the README note on formatters. The
  `sdocs.config.*` icon is gone for the same reason.

## [0.0.13] - 2026-07-02

### Added

- **Formatting for `.sdoc` files.** Format Document and format-on-save now reflow
  `.sdoc`, `.page.sdoc`, and `.layout.sdoc` files using your installed Svelte
  formatter — script and markup, exactly like a `.svelte` file. `.sdoc` is
  registered as its own default formatter, so there's no "Configure Default
  Formatter" prompt even if Prettier is your global default.

### Notes

- Formatting a file that uses Svelte 5 syntax (e.g. `{#snippet}`) needs the
  project's dependencies installed so Svelte 5 resolves. A `.sdoc` opened outside
  any project is left unchanged rather than mis-formatted.
- `.sdoc` files get syntax highlighting, formatting, and meta-field autocomplete —
  not full Svelte IntelliSense or diagnostics (those are language-server features
  served only for `.svelte` files).
