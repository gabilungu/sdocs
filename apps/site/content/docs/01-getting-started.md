---
title: Getting Started
---

sdocs is a documentation tool for Svelte 5 components. This page walks you through install, a first `.sdoc` file, and running the dev server.

## Requirements

- Svelte 5
- Vite 6+
- `@sveltejs/vite-plugin-svelte` 5+

## Install

```bash
npm install sdocs
```

## Scaffold a config

```bash
npx sdocs init
```

This creates `sdocs.config.js` at the project root with sensible defaults. Adjust `include` to point at where your `.sdoc` files live.

```js
/** @type {import('sdocs').SdocsConfig} */
export default {
  include: ['./src/**/*.sdoc'],
  port: 3000,
  logo: 'My Design System',
};
```

See the full [configuration reference](/docs/usage/configuration) for every option.

## Write a first component doc

Given a Svelte component `src/lib/Button.svelte`, create `src/lib/Button.sdoc` next to it:

```svelte
<script lang="ts">
  import Button from './Button.svelte';

  export const meta = {
    component: Button,
    title: 'Components / Button',
    description: 'A flexible button.',
    args: {
      label: 'Click me',
      disabled: false,
    },
  };
</script>

{#snippet Default()}
  <Button {...args} />
{/snippet}
```

That's the minimum. `Default` gets interactive controls wired up to `meta.args`. Omit the `Default` snippet entirely and sdocs will auto-generate it as `<Button {...args} />`.

See [writing component docs](/docs/writing-docs/component-sdoc) for named snippets, examples, and the full `meta` object.

## Run the dev server

```bash
npx sdocs dev
```

Opens at `http://localhost:3000` by default. Your `.sdoc` files appear in the sidebar grouped by their `title` path.

## Build a static site

```bash
npx sdocs build
npx sdocs preview
```

`build` outputs a static site to `dist/`. `preview` serves it locally.

## Embed in an existing Vite / SvelteKit app

Rather than running a separate server, you can mount sdocs as a route inside your existing app. See [embedded usage](/docs/usage/embedded-vite).

## Next steps

- [Write page docs](/docs/writing-docs/page-sdoc) for freeform content with auto-generated table of contents
- [Write layout docs](/docs/writing-docs/layout-sdoc) for component compositions
- [Explore interactive controls](/docs/features/interactive-controls) to see what prop types get auto-generated UI
