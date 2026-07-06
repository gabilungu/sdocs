---
title: Getting Started
---

sdocs is a documentation tool for Svelte 5 components. This page walks you through install, a first `.sdoc` file, and running the dev server.

## Requirements

- Svelte 5
- Vite with `@sveltejs/vite-plugin-svelte`

## Install

```bash
npm install sdocs
```

Or skip the install entirely — once you have `.sdoc` files,
`npx sdocs run` starts the docs server with nothing added to your
project. See [the CLI page](/cli/commands) for details.

## Scaffold a config

```bash
npx sdocs init
```

This creates `sdocs.config.js` at the project root with every option present
but commented out — the defaults already work with zero config. Uncomment and
adjust `include` if your `.sdoc` files live somewhere other than `./src`:

```js
/** @type {import('sdocs').SdocsConfig} */
export default {
  // Glob pattern(s) to find sdoc files
  // include: ['./src/**/*.sdoc'],

  // Dev server port (default: 3000)
  // port: 3000,

  // Header title text (default: 'sdocs')
  // title: 'sdocs',
};
```

See the full [configuration reference](/explorer/configuration) for every option.

## Write a first component doc

Given a Svelte component `src/lib/Button.svelte`, create `src/lib/Button.sdoc` next to it:

```sdoc
<script lang="ts">
  import Button from './Button.svelte';
</script>

[SHOWCASE title="Components / Button" description="A flexible button."]

	[preview component={Button} args={{ label: 'Click me', disabled: false }}]
		<Button {...args} />
	[/preview]

[/SHOWCASE]
```

That's the minimum. The preview gets interactive controls wired up to its `args`.

See [the sdoc language](/language) for the full format — examples, pages, layouts, and multiple previews per page.

## Run the dev server

```bash
npx sdocs dev
```

Serves at `http://localhost:3000` by default (set `open: true` in the config to auto-open the browser). Your `.sdoc` files appear in the sidebar grouped by their `title` path.

## Build a static site

```bash
npx sdocs build
npx sdocs preview
```

`build` outputs a static site to `dist/`. `preview` serves it locally.

## Embed in an existing Vite / SvelteKit app

Rather than running a separate server, you can mount sdocs as a route inside your existing app. See [embedded usage](/explorer/embedded-vite).

## Next steps

- [Write page docs](/language/page-docs) for freeform content with auto-generated table of contents
- [Write layout docs](/language/layout-docs) for component compositions
- [Explore interactive controls](/explorer/features/interactive-controls) to see what prop types get auto-generated UI
