---
title: Language Support
---

`.sdoc` files are served by the extension's own **sdoc language server**. It
projects each file onto a virtual Svelte document — every authored line at
its exact position, block tags translated to the same snippet wrappers the
build pipeline generates — and runs the real Svelte language server over
that projection. The result is the full `.svelte` editing experience inside
your previews, examples, and the file `<script>`, with zero false errors on
the block syntax:

- Completion with types and JSDoc
- Hover information
- Live TypeScript and Svelte diagnostics, reported at the authored line
- Go-to-definition
- Signature help

Because the editor sees exactly what the build compiles — `args` in scope
in every preview and example, components resolved through the file's
imports — a clean editor means a clean build.

## Formatting

**Format Document** formats fragment-wise: the file `<script>` and
`<style>` and every `[preview]`/`[example]`/`[LAYOUT]` body run through
prettier with the Svelte plugin independently. In `[PAGE]` bodies, `[example]`
blocks format as Svelte fragments, Svelte islands (snippets, HTML sections,
component tags) too, and the markdown prose between them through prettier's
markdown formatter (markup normalized; prose lines never re-wrapped).
Everything reassembles at the block's indentation. Block tags are never
touched.

## sdoc syntax highlighting

The extension ships a TextMate grammar for the block-based
[sdoc language](/language): `[DOCS]`, `[PAGE]`, and `[LAYOUT]` entities,
`[preview]` and `[example]` blocks, and Svelte-style attributes, with
embedded TypeScript, Svelte, and CSS coloring inside `<script>`, block
bodies, and `<style>`. `[PAGE]` bodies color as markdown — headings, bold,
lists, fences. The grammar also injects into markdown, so
` ```sdoc ` code fences in any README or markdown file highlight properly.
Entity blocks fold, and `.sdoc` files get bracket and comment support.

## sdocs-specific IntelliSense

On top of the language server, the extension understands the block format:

- **Attribute completion** — inside a block opener, completions offer that
  block's attributes with documentation (`title` and `description` on
  `[DOCS]`, `component` / `args` / `title` on `[preview]`, …), skipping
  attributes already present.
- **`component={…}` value completion** — suggests the identifiers imported
  in the file's `<script>`.

## Config completion

`sdocs.config.*` files complete too. When your project has `sdocs`
installed, the config's `/** @type {import('sdocs').SdocsConfig} */`
annotation gives you the real thing — completion, hover, and type-checking
straight off the config type. When `sdocs` isn't installed — a standalone
project driven with `npx sdocs` — the extension fills in from a bundled
schema: keys at every level (`content` → `docs` → `contentX`…), value
suggestions for the enumerated options (`contentX`, `contentY`, `direction`,
`toc`, …), and inline docs. The extension detects which case applies per
project and steps aside when the real types are present.

## Block diagnostics

The extension also runs the sdocs parser directly, so format-level problems
are flagged as you type, exactly as the build pipeline would see them:

- Structural mistakes — unclosed blocks, wrong tag casing, text outside
  blocks, misplaced `<script>`/`<style>`
- Missing required attributes (`title` on entities, `component` on
  previews, `title` on examples)
- Duplicate example titles or preview labels, colliding entity titles
- `args` values that aren't plain literals
- A `component={X}` identifier that isn't imported or declared in the file

## Current limitations

- Code inside `[PAGE]` fences and inline code gets highlighting but no
  language intelligence (it's display-only content).
- Cross-file rename and find-references don't reach into `.sdoc` files that
  aren't open.

## File icons

Doc files keep the sdoc icon in the explorer — open or closed — since
`.sdoc` files now run as their own language. `sdocs.config.*` files register
as an "sdocs config" language with the mascot as its icon; while a config
file is open it runs as JavaScript/TypeScript (for the language service), and
most file icon themes map `.js`/`.ts` themselves and take precedence in the
explorer for config files.
