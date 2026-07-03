---
title: Language Support
---

`.sdoc`, `.page.sdoc`, and `.layout.sdoc` files get the complete `.svelte`
editing experience — they are served by the Svelte language server, so
everything it does in a component works in a doc file too:

- Completion with types and JSDoc
- Hover information
- Live TypeScript and Svelte diagnostics
- Go-to-definition
- Native formatting

## sdocs-specific IntelliSense

On top of the language server, the extension understands the sdocs `meta`
convention:

- **Meta-field autocomplete** — inside `export const meta = { ... }`,
  completions offer the sdocs fields (`title`, `component`, `description`,
  `args`, `settings`) with documentation, and skip fields already present.
- **`component:` value completion** — completing after `component:` suggests
  the identifiers imported in the file.

## Diagnostics

Doc-level problems are flagged as you type:

- Missing `export const meta = { ... }`
- Missing `meta.title` (the one required field)
- A `meta.component` identifier that isn't imported or declared
- Duplicate top-level snippet names (which would collide as sub-pages)

## File icons

Doc files carry their own icons in the explorer — distinct marks for
`.sdoc`, `.page.sdoc`, and `.layout.sdoc`. `sdocs.config.*` files register
as an "sdocs config" language with the mascot as its icon; note that most
file icon themes map `.js`/`.ts` themselves and take precedence in the
explorer for config files.
