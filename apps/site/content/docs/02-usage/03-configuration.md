---
title: Configuration
---

sdocs reads its configuration from `sdocs.config.js` (or `.ts` / `.mjs`) in the project root. When used as a Vite plugin, options can also be passed directly to `sdocsPlugin()` — those override the config file.

## Config file lookup

Checked in order:

1. `sdocs.config.ts`
2. `sdocs.config.mjs`
3. `sdocs.config.js`

First one found is used. Missing config is fine — sdocs applies defaults.

A `.ts` config loads only on Node versions with native TypeScript type
stripping; on older Node it throws. Since `.ts` is checked first, prefer `.js`
or `.mjs` unless your Node supports it.

## Full schema

```ts
interface SdocsConfig {
  include?: string | string[];
  port?: number;
  open?: boolean;
  css?: string | Record<string, string>;
  logo?: string;
  icon?: string | false;
  sidebar?: {
    order?: Record<string, string[]>;
    open?: string[];
  };
}
```

### `include`

Glob(s) matching `.sdoc` files.

- **Type:** `string | string[]`
- **Default:** `['./src/**/*.sdoc']`

Relative paths are resolved against the project root. Absolute paths are used as-is.

```js
include: ['./src/**/*.sdoc', './packages/**/*.sdoc']
```

### `port`

Dev server port.

- **Type:** `number`
- **Default:** `3000`

Only used by the standalone CLI (`sdocs dev` and `sdocs preview`). Ignored when embedded as a Vite plugin.

### `open`

Whether to open the browser when `sdocs dev` or `sdocs preview` starts.

- **Type:** `boolean`
- **Default:** `false`

### `css`

Stylesheet(s) loaded into the preview iframe for each component/snippet.

- **Type:** `string | Record<string, string>`
- **Default:** `null`

**Single stylesheet:**

```js
css: './src/styles/global.css'
```

**Named stylesheets** (user switches between them via a dropdown):

```js
css: {
  light: './src/styles/light.css',
  dark: './src/styles/dark.css',
}
```

Relative paths resolve from the project root. Absolute paths and `http(s)://` URLs are used as-is.

See [theming](/docs/features/theming) for details on named stylesheets.

### `logo`

Text shown in the sidebar header.

- **Type:** `string`
- **Default:** `'sdocs'`

### `icon`

Icon shown next to the logo text in the sidebar header.

- **Type:** `string | false`
- **Default:** `'sdocs'`

`'sdocs'` shows the built-in sdocs mascot. Any other string is used as an
image URL (`/logo.svg` from your static assets, or a full `http(s)://` URL).
`false` hides the icon.

```js
icon: '/acme-logo.svg'
```

### `sidebar.order`

Per-folder ordering overrides. Key is the folder *path* from the root, slash-joined for nested folders — `'root'` for the top level, `'Components'` for a top-level folder, `'Components/Forms'` for a nested one. Value is an array of labels.

- **Type:** `Record<string, string[]>`
- **Default:** `{}`

`'*'` acts as a wildcard for any items not explicitly listed, in alphabetical order.

```js
sidebar: {
  order: {
    root: ['Getting Started', 'Components', '*', 'Advanced'],
    Components: ['Button', 'Input', '*'],
  },
}
```

### `sidebar.open`

Folders to expand by default.

- **Type:** `string[]`
- **Default:** `[]`

```js
sidebar: {
  open: ['Components', 'Forms'],
}
```

## Full example

```js
/** @type {import('sdocs').SdocsConfig} */
export default {
  include: ['./src/lib/**/*.sdoc'],
  port: 3001,
  open: true,
  logo: 'Acme Design System',
  css: {
    light: './src/styles/light.css',
    dark: './src/styles/dark.css',
  },
  sidebar: {
    order: {
      root: ['Getting Started', 'Components', '*'],
      Components: ['Button', 'Input', 'Select', '*'],
    },
    open: ['Components'],
  },
};
```

## See also

- [Sidebar](/docs/features/sidebar) — ordering, groups, and search
- [Theming](/docs/features/theming) — named stylesheets and light/dark
- [Types](/docs/api/types) — full `SdocsConfig` type
