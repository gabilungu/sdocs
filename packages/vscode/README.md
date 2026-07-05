# sdocs for VS Code

Language support for [sdocs](https://www.npmjs.com/package/sdocs) — a lightweight documentation tool for Svelte 5 components.

## Features

`.sdoc` files are served by the extension's own **sdoc language server**: it
projects each file onto a virtual Svelte document (every line at its exact
position) and runs the real Svelte language server over it. You get the full
`.svelte` editing experience inside your previews and examples, with zero
false errors on the block syntax:

- **IntelliSense** — completion for props, variables, and markup; hover info
  with types and JSDoc; go-to-definition into your components; signature
  help. `args` is in scope in every preview and example, exactly like at
  runtime.
- **Diagnostics** — live TypeScript and Svelte errors and warnings, reported
  at the authored line.
- **Syntax highlighting** — a TextMate grammar for the block format:
  `[DOCS]`/`[PAGE]`/`[LAYOUT]` entities, `[preview]`/`[example]` blocks,
  Svelte-style attributes, with embedded TypeScript, Svelte, and CSS
  coloring. ` ```sdoc ` fences highlight in markdown files too, and entity
  blocks fold.
- **Formatting** — Format Document formats the `<script>`, `<style>`, and
  every Svelte block body through prettier independently, reassembled at the
  block's indentation. Block tags and `[PAGE]` prose are never touched.
- **Block completions** — each block's attributes with documentation, and
  imported-component suggestions inside `component={…}`.
- **Block lint** — the same parser the sdocs build runs: unclosed blocks,
  wrong casing, missing or unknown attributes, duplicate titles, non-literal
  `args`, and unimported `component={X}` references.
- **Create Component Documentation** — right-click a `.svelte` file →
  *sdocs: Create Component Documentation* scaffolds a `[DOCS]` block next to
  it, ready to fill in.
- **sdocs view** — the activity-bar icon lists the sdocs projects in your
  workspace; click one to run its docs and browse them inside the editor.
  Add extra folders with the `sdocs.scopes` setting.

## Requirements

- [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)
  — installed automatically as a dependency; it provides the Svelte grammar
  the sdoc highlighting embeds (and the editing experience for your `.svelte`
  components themselves).

## Notes

- Language features need the project's dependencies installed so Svelte 5
  resolves from your project.
- Use **relative imports** inside `.sdoc` files (e.g. `./Button.svelte`).
  `.sdoc` files sit next to the component they document, so relative paths
  are the natural fit.
- `svelte-check` doesn't include `.sdoc` files in CLI runs; diagnostics are
  live in the editor only.
- Code inside `[PAGE]` fences and inline code gets highlighting but no
  language intelligence, and cross-file rename doesn't reach into `.sdoc`
  files that aren't open.
