---
title: Embedded in Vite / SvelteKit
---

Mount sdocs inside your existing Vite or SvelteKit app as a route, rather than running a separate server.

## 1. Add the Vite plugin

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { sdocsPlugin } from 'sdocs/vite';

export default {
  plugins: [
    sveltekit(),
    sdocsPlugin({
      include: ['./src/lib/**/*.sdoc'],
      css: './src/styles/global.css',
      logo: 'My Design System',
    }),
  ],
};
```

The plugin accepts the same options as [`sdocs.config.js`](/docs/usage/configuration). Options passed here override any config file.

The plugin:

- Discovers `.sdoc` files and parses them
- Exposes them as the `virtual:sdocs` module
- Watches for file changes and triggers HMR
- Adds a middleware endpoint for syntax highlighting

## 2. Create a page that mounts the app

```svelte
<!-- src/routes/docs/+page.svelte -->
<script>
  import App from 'sdocs/client';
  import { docs, cssNames } from 'virtual:sdocs';
</script>

<App
  {docs}
  {cssNames}
  logo="My Design System"
  sidebarConfig={{
    order: { root: ['Components', '*'] },
    open: ['Components'],
  }}
/>
```

Your docs are now available at whatever route you mounted the page on (e.g. `/docs`).

## 3. Virtual module type declaration (TypeScript)

```ts
// src/app.d.ts
declare module 'virtual:sdocs' {
  import type { DocEntry } from 'sdocs';
  export const docs: DocEntry[];
  export const cssNames: string[];
  export default docs;
}
```

## App props

The `App` component from `sdocs/client` accepts:

| Prop | Type | Description |
|---|---|---|
| `docs` | `DocEntry[]` | All discovered doc entries. Comes from `virtual:sdocs`. |
| `cssNames` | `string[]` | Stylesheet names if using named CSS. Comes from `virtual:sdocs`. |
| `logo` | `string` | Sidebar logo text. Default: `'sdocs'`. |
| `sidebarConfig` | `{ order?, open? }` | Sidebar ordering & initial open state. See [sidebar](/docs/features/sidebar). |

See [types](/docs/api/types) for `DocEntry`.

## virtual:sdocs

The plugin exposes a virtual module containing all discovered docs. Import from it anywhere in your app:

```ts
import { docs, cssNames } from 'virtual:sdocs';
```

- `docs: DocEntry[]` — flat array of all discovered doc entries
- `cssNames: string[]` — names of available stylesheets (empty if using single or no CSS)

## See also

- [Configuration reference](/docs/usage/configuration) — full list of plugin options
- [Standalone CLI](/docs/usage/standalone-cli) — if you don't need to embed
