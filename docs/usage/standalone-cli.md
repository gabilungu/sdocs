---
title: Standalone CLI
---

# Standalone CLI

Run sdocs as its own dev server, no host app required.

## Commands

| Command | Description |
|---|---|
| `npx sdocs init` | Scaffold a `sdocs.config.js` file in the current directory |
| `npx sdocs dev` | Start the dev server with HMR |
| `npx sdocs build` | Build a static documentation site to `dist/` |
| `npx sdocs preview` | Preview the built site locally |

All commands read `sdocs.config.js` (or `sdocs.config.ts` / `sdocs.config.mjs`) from the current directory.

## Flags

| Flag | Description |
|---|---|
| `--version`, `-v` | Print the package version |
| `--help`, `-h` | Print the help message |

Per-command flags are not currently accepted — configure via the config file.

## `sdocs init`

Creates a starter `sdocs.config.js`:

```js
/** @type {import('sdocs').SdocsConfig} */
export default {
  include: ['./src/**/*.sdoc'],
  port: 3000,
  logo: 'sdocs',
};
```

No-op if a config file already exists.

## `sdocs dev`

Starts a Vite dev server on the configured port (default `3000`). Watches:

- `.sdoc` files matching `include`
- Component files referenced by those docs
- The config file

Any change triggers a full reload. See [configuration](./configuration.md) for options like `open`, `css`, and `logo`.

## `sdocs build`

Builds a static site to `dist/`. The output is a single-page app with a pre-rendered iframe preview page per snippet. Deploy anywhere that serves static files (GitHub Pages, Netlify, Vercel, S3).

## `sdocs preview`

Serves the contents of `dist/` locally. Requires `sdocs build` to have run first.

## See also

- [Embedded in Vite / SvelteKit](./embedded-vite.md) — run sdocs inside an existing app
- [Configuration reference](./configuration.md)
