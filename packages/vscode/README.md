# sdocs for VS Code

Language support for [sdocs](https://www.npmjs.com/package/sdocs) — a lightweight documentation tool for Svelte 5 components.

## Features

`.sdoc`, `.page.sdoc`, and `.layout.sdoc` files are served by the Svelte language
server, so they get the full `.svelte` editing experience:

- **IntelliSense** — completion for props, variables, and markup; hover info
  with types and JSDoc; go-to-definition into your components.
- **Diagnostics** — live TypeScript and Svelte compiler errors and warnings.
- **Syntax highlighting** — script, markup, and styles, exactly like `.svelte`.
- **Formatting** — Format Document and format-on-save via your Svelte formatter.
- **Meta-field autocomplete** — sdocs-specific suggestions for `component`,
  `title`, `description`, `args`, and `settings` inside `export const meta = { }`,
  plus imported-component suggestions after `component:`.
- **New Component Doc** — right-click a `.svelte` file → *New Component Doc*
  scaffolds an `.sdoc` next to it, ready to fill in.
- **sdocs lint** — warnings for missing/incomplete `meta`, an unimported
  `component` reference, and duplicate snippet names.

## Requirements

- [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) — installed automatically as a dependency; it provides the language server.

## Notes

- Language features need the project's dependencies installed so Svelte 5
  resolves (`{#snippet}` etc.).
- `.sdoc` files follow your Svelte formatter settings. If your global
  `editor.defaultFormatter` is a non-Svelte formatter (e.g. Prettier without
  the Svelte plugin), set the Svelte one for the `svelte` language:

  ```json
  "[svelte]": { "editor.defaultFormatter": "svelte.svelte-vscode" }
  ```
- Use **relative imports** inside `.sdoc` files (e.g. `./Button.svelte`).
  Path aliases like `$lib` don't resolve there — `.sdoc` files sit next to the
  component they document, so relative paths are the natural fit anyway.
- `svelte-check` doesn't include `.sdoc` files in CLI runs; diagnostics are
  live in the editor only.
- Make sure the folder containing your project's `node_modules` is a workspace
  folder (or the opened folder). If `.sdoc` files sit below the workspace root
  but your dependencies don't resolve from it, the language server falls back
  to an older bundled Svelte parser and reports `Expected if, each or await`
  on `{#snippet}` blocks.
