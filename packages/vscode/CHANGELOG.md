# Changelog

All notable changes to the sdocs VS Code extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
