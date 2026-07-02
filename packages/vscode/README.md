# sdocs for VS Code

Language support for [sdocs](https://www.npmjs.com/package/sdocs) — a lightweight documentation tool for Svelte 5 components.

## Features

- **Syntax highlighting** for `.sdoc`, `.page.sdoc`, and `.layout.sdoc` files — reuses the Svelte grammar, so script and markup are highlighted just like a `.svelte` file.
- **Formatting** — Format Document and format-on-save reflow `.sdoc` files using your installed Svelte formatter (script + markup), exactly like a `.svelte` file. `.sdoc` is registered as its own default formatter, so there's no "Configure Default Formatter" prompt.
- **Meta-field autocomplete** — suggestions for `component`, `title`, `description`, `args`, and `settings` inside `export const meta = { }`.
- **File icons** for `.sdoc`, `*.page.sdoc`, `*.layout.sdoc`, and `sdocs.config.*`.

## Requirements

- [Svelte for VS Code](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) — installed automatically as a dependency; it provides the formatting engine.

## Notes

- Formatting a file that uses Svelte 5 syntax (e.g. `{#snippet}`) requires the project's dependencies to be installed so Svelte 5 resolves. A `.sdoc` opened outside any project is left unchanged rather than mis-formatted.
- Rich Svelte IntelliSense (prop/variable completion, hover, type diagnostics) is **not** provided inside `.sdoc` files — those are Svelte language-server features and the server only attaches to `.svelte` files. Open the underlying `.svelte` component for deep editing.
