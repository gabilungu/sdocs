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
  content?: {
    page?: { maxWidth?: string; padding?: string; toc?: boolean };
    docs?: { maxWidth?: string; padding?: string; direction?: string; gap?: string };
    layout?: { maxWidth?: string; padding?: string };
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

In embedded production builds the file is copied verbatim into the build
output, so keep it self-contained: `@import` and relative `url()` references
won't resolve from the copied location. Inline what the previews need (fonts
can be data URIs) or use absolute `http(s)://` URLs.

See [theming](/explorer/features/theming) for details on named stylesheets.

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

### `content`

Content sizing per entity kind. Any CSS length works; `padding` takes CSS
shorthand.

- **Type:** `{ page?, docs?, layout? }`, each `{ maxWidth?: string; padding?: string }`
- **Defaults:**

| kind | option | default | applies to |
|---|---|---|---|
| `page` | `maxWidth` | `1200px` | the page's content column |
| `page` | `padding` | `32px` | space around the page prose |
| `page` | `toc` | `true` | table-of-contents visibility |
| `docs` | `maxWidth` | `1200px` | the docs content column |
| `docs` | `padding` | `16px` | preview & example stages |
| `docs` | `direction` | `row` | stage `flex-direction` |
| `docs` | `gap` | `16px` | stage `gap` |
| `layout` | `maxWidth` | `100%` | the full-page stage |
| `layout` | `padding` | `0px` | space inside the stage |

Preview and example stages are flex containers: items line up along
`direction` with `gap` between them (wrapping as needed).

```js
content: {
  page: { maxWidth: '900px', toc: false },
  docs: { padding: '24px', direction: 'column' },
}
```

Entities and blocks override these in place with the same attributes:
`[PAGE title="…" maxWidth="800px" toc="false"]`,
`[preview component={X} direction="column" gap="8px"]` — block beats
entity beats config.

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

- [Sidebar](/explorer/features/sidebar) — ordering, groups, and search
- [Theming](/explorer/features/theming) — named stylesheets and light/dark
- [Types](/explorer/types) — full `SdocsConfig` type
