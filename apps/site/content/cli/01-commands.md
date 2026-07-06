---
title: Commands
---

Full reference for every sdocs command and flag.

## Commands

| Command | Description |
|---|---|
| `npx sdocs init` | Scaffold a `sdocs.config.js` file in the current directory |
| `npx sdocs dev` | Start the dev server with live reload |
| `npx sdocs run` | Same as `dev` — works without installing sdocs (see below) |
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

Creates a starter `sdocs.config.js` with every option commented out (the
defaults work without any of them):

```js
/** @type {import('sdocs').SdocsConfig} */
export default {
  // include: ['./src/**/*.sdoc'],
  // port: 3000,
  // open: false,
  // css: './src/styles/global.css',
  // title: 'sdocs',
  // sidebar: { ... },
};
```

No-op if a config file already exists.

## `sdocs dev`

Starts a Vite dev server on the configured port (default `3000`). Watches:

- `.sdoc` files matching `include`
- Each doc's `meta.component` file

Any change triggers a full reload. The config file itself is read once at
startup — restart the server after editing it. See
[configuration](/explorer/configuration) for options like `open`, `css`, and `title`.

## `sdocs run` — no install needed

Try sdocs in any project without adding it as a dependency:

```bash
npx sdocs run
```

npm fetches sdocs (and its tooling) into the npx cache and starts the dev
server against the `.sdoc` files in the current project. Your components'
dependencies — Tailwind, three.js, anything in the project's `node_modules` —
resolve from the project as usual, and when the project has its own `svelte`,
previews use it rather than the cached copy.

You still need `.sdoc` files for it to have something to show; see
[getting started](/explorer/getting-started).

## `sdocs build`

Builds a static site to `dist/`. Site-structure errors — an unknown
`@section`, two entities on one route, an unresolvable `home` — fail the
build with a non-zero exit, so a broken structure can't deploy. The output is a single-page app with a pre-rendered iframe preview page per snippet, plus an `index.html` per doc route (and a `404.html` fallback) — deep links work with no rewrite rules. Deploy anywhere that serves static files (GitHub Pages, Netlify, Vercel, S3).

Pass `--base <path>` when the site is served under a sub-path (a GitHub project Pages site lives at `/<repo>/`); it overrides the [`base`](/explorer/configuration#base) config, which lets CI derive it from the repo name:

```bash
npx sdocs build --base "/my-repo/"
```

Because `sdocs run`/`build` need no local install, a docs site can deploy from a project that doesn't depend on sdocs at all — a CI job runs `npx --yes sdocs build` and publishes `dist/`.

## `sdocs preview`

Serves the contents of `dist/` locally. Requires `sdocs build` to have run first.

## See also

- [Embedded in Vite / SvelteKit](/explorer/embedded-vite) — run sdocs inside an existing app
- [Configuration reference](/explorer/configuration)
