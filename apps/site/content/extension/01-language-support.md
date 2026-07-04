---
title: Language Support
---

`.sdoc` files get the complete `.svelte` editing experience — they are
served by the Svelte language server, so everything it does in a component
works inside your previews and examples too:

- Completion with types and JSDoc
- Hover information
- Live TypeScript and Svelte diagnostics
- Go-to-definition
- Native formatting

## sdoc syntax highlighting

The extension ships a TextMate grammar for the block-based
[sdoc language](/language): `[DOCS]`, `[PAGE]`, and `[LAYOUT]` entities,
`[preview]` and `[example]` blocks, and Svelte-style attributes, with
embedded TypeScript, Svelte, and CSS coloring inside `<script>`, block
bodies, and `<style>`. The grammar also injects into markdown, so
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

## Diagnostics

The extension runs the same parser as the sdocs build pipeline, so problems
are flagged as you type, exactly as the Explorer would see them:

- Structural mistakes — unclosed blocks, wrong tag casing, text outside
  blocks, misplaced `<script>`/`<style>`
- Missing required attributes (`title` on entities, `component` on
  previews, `title` on examples)
- Duplicate example titles or preview labels, colliding entity titles
- `args` values that aren't plain literals
- A `component={X}` identifier that isn't imported or declared in the file

## File icons

Doc files carry the sdoc icon in the explorer. While a doc file is open in
an editor it runs as the Svelte language (that's what powers the language
server), so icon themes that map the Svelte language show the Svelte icon
for it; after closing the file, the sdoc icon returns the next time the
explorer redraws the row (a window reload always does it). `sdocs.config.*`
files register as an "sdocs config" language with the mascot as its icon;
note that most file icon themes map `.js`/`.ts` themselves and take
precedence in the explorer for config files.
