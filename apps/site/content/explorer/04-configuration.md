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
  title?: string;
  logo?: string | false;
  favicon?: string;
  sections?: { slug: string; title?: string; order?: string[] }[];
  home?: string;
  routing?: 'history' | 'hash';
  base?: string;
  static?: string;
  content?: {
    page?: { maxWidth?: string; padding?: string; toc?: boolean; contentX?: string };
    showcase?: { maxWidth?: string; padding?: string; direction?: string; gap?: string; contentX?: string; contentY?: string };
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

Stylesheet(s) loaded into every stage — preview and example iframes and
`[LAYOUT]` pages. Stages are the *only* place this css loads: page prose and
the docs app chrome keep their own styling, so the boundary between "your
product" and "the documentation" stays crisp.

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

### `static`

A folder of static assets, served at the site root in dev and copied into
`dist/` by `sdocs build` — images for pages, files for previews.

- **Type:** `string`
- **Default:** none

```js
static: './static'
```

With `static/hero.png` in the project, a page can write `![hero](/hero.png)`
and a preview can reference `/hero.png` too. The option powers the
standalone CLI flows (`sdocs dev`/`run`/`build`); when embedding the Vite
plugin in an app, use the host's own public directory instead.

### `title`

Text shown in the header (the sidebar header, or the top bar when
[sections](/explorer/features/sidebar#sections-top-bar) are in use).

- **Type:** `string`
- **Default:** `'sdocs'`

### `logo`

Logo shown next to the title text.

- **Type:** `string | false`
- **Default:** `'sdocs'`

`'sdocs'` shows the built-in sdocs mascot. Any other string is used as an
image URL (`/logo.svg` from your static assets, or a full `http(s)://` URL).
`false` hides the logo. A root-absolute path is prefixed with
[`base`](#base) automatically, so it resolves under a sub-path deploy.

```js
logo: '/acme-logo.svg'
```

### `favicon`

The browser-tab icon.

- **Type:** `string`
- **Default:** the built-in sdocs icon

A path (`/logo.svg` from your [`static`](#static) folder) or full URL; point
it at the same file as `logo` for a matching mark. Base-prefixed like other
assets on build.

```js
favicon: '/logo.svg'
```

### `sections`

The site's sections, declared in top-bar order. Each has a URL-safe `slug`
(its identity — the first route segment, and what titles reference via
`title="@slug/…"`), an optional `title` for the tab (defaults to the
capitalized slug), and an optional `order` array of route paths relative to
the section — listed items sort first at their level, everything else
follows alphabetically.

- **Type:** `{ slug, title?, order? }[]`
- **Default:** none — a single implicit `docs` section, and no top bar

```js
sections: [
  { slug: 'guides', title: 'Guides', order: ['introduction', 'colors'] },
  { slug: 'components' },
]
```

Referencing an undeclared section (or writing an unprefixed title when no
`docs` section is declared) is an error: the Explorer shows it full-page and
`sdocs build` fails.

### `home`

Route path of the landing page — what the root URL and the logo show.

- **Type:** `string`
- **Default:** none — the root shows the [About page](/language/page-docs#about-page)

```js
home: 'guides/introduction'
```

The path must resolve to an entity (an unresolvable `home` is an error). The
home entity stays listed in its section's sidebar; add `hide` to its opener
to keep it reachable only via the logo.

### `routing`

URL style.

- **Type:** `'history' | 'hash'`
- **Default:** `'history'` in the standalone CLI, `'hash'` when embedding

`'history'` uses real paths (`/guides/installation`) — the CLI dev server
falls back to the app shell for any path, and `sdocs build` emits a
physical `index.html` per route so static hosts need no rewrite rules.
`'hash'` uses `#/` URLs, which work under any host routing — the right
choice (and the default) when [embedding](/explorer/embedded-vite).

### `base`

The public base path the built site is served under — set it when the site
lives under a sub-path rather than a domain root.

- **Type:** `string`
- **Default:** `'/'`

It's normalized to a leading and trailing slash (`gabi` → `/gabi/`) and
applies to `sdocs build` only; `sdocs dev` always serves at the root. Asset
URLs and history routes are prefixed with it. A GitHub **project** Pages
site is served at `https://<owner>.github.io/<repo>/`, so set
`base: '/<repo>/'` (or pass `--base` on the CLI — handy for deriving it from
the repo name in CI):

```js
base: '/gabi/'
```

`sdocs build` also writes a `404.html` (a copy of the shell), so an unknown
deep link on a static host still boots the app instead of a bare 404.

### `content`

Content sizing per entity kind. Any CSS length works; `padding` takes CSS
shorthand.

- **Type:** `{ page?, showcase?, layout? }`, each `{ maxWidth?: string; padding?: string }`
- **Defaults:**

| kind | option | default | applies to |
|---|---|---|---|
| `page` | `maxWidth` | `1200px` | the page's content column |
| `page` | `padding` | `32px` | space around the page prose |
| `page` | `toc` | `true` | table-of-contents visibility |
| `page` | `contentX` | `left` | aligns the content column: `left`/`center`/`right` |
| `showcase` | `maxWidth` | `1200px` | the showcase content column |
| `showcase` | `padding` | `16px` | preview & example stages (in `[SHOWCASE]` and `[PAGE]`) |
| `showcase` | `direction` | `row` | stage `flex-direction` |
| `showcase` | `gap` | `16px` | stage `gap` |
| `showcase` | `contentX` | `left` | horizontal: `left`/`center`/`right`/`justify` |
| `showcase` | `contentY` | `top` | vertical: `top`/`middle`/`bottom`/`justify` |
| `layout` | `maxWidth` | `100%` | the full-page stage |
| `layout` | `padding` | `0px` | space inside the stage |

A page's `maxWidth` constrains the content column together with its table
of contents; hide the toc and the prose takes the full width. `contentX`
places that column inside the view.

Preview and example stages are flex containers: items line up along
`direction` with `gap` between them (wrapping as needed). `contentX`
(horizontal) and `contentY` (vertical) are *physical* — sdocs maps each to the
right flex property for the current `direction`, so `contentX="center"` centers
horizontally whether the stage is a row or a column. `justify` spreads items
apart (space-between).

```js
content: {
  page: { maxWidth: '900px', toc: false },
  showcase: { padding: '24px', direction: 'column' },
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
  title: 'Acme Design System',
  sections: [
    { slug: 'guides', title: 'Guides', order: ['getting-started'] },
    { slug: 'components', order: ['button', 'input', 'select'] },
  ],
  home: 'guides/getting-started',
  css: {
    light: './src/styles/light.css',
    dark: './src/styles/dark.css',
  },
};
```

## See also

- [Sidebar](/explorer/features/sidebar) — ordering, groups, and search
- [Theming](/explorer/features/theming) — named stylesheets and light/dark
- [Types](/explorer/types) — full `SdocsConfig` type
