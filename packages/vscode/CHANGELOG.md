# Changelog

## 0.0.13

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
- Corrected the feature list: `.sdoc` files get syntax highlighting, formatting,
  and meta-field autocomplete — not full Svelte IntelliSense/diagnostics (those
  are language-server features served only for `.svelte` files).
