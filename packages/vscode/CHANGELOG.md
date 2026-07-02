# Changelog

All notable changes to the sdocs VS Code extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
