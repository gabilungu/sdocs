---
title: Routing
---

Every doc page has its own URL. The standalone CLI uses real paths (history
routing); embedding defaults to `#/` hash URLs. Both modes share the same
route structure.

## URL format

Routes are built from the doc's `title`: one slug per segment, with the
[section](/explorer/features/sidebar#sections-top-bar) first when sections
are in use.

```
https://example.com/components/button
https://example.com/components/button/with-icon
https://example.com/guides/getting-started
```

## Slugs

Each title segment is slugified the same way page headings are: lowercased,
punctuation stripped, spaces as hyphens.

| Title | Route |
|---|---|
| `'Components / Button'` | `/components/button` |
| `'Patterns / Login Form'` | `/patterns/login-form` |
| `'@Guides/Getting Started'` | `/guides/getting-started` |

Two siblings that slugify identically get numbered (`/thing`, `/thing-2`).

## Sub-pages

Examples get a sub-segment:

| Entry | Route |
|---|---|
| `Button` component (main page) | `/components/button` |
| `Button` example `WithIcon` | `/components/button/with-icon` |

## History mode (standalone CLI)

`sdocs dev` / `sdocs run` serve the app shell for any path, and
`sdocs build` writes a physical `index.html` per route into `dist/` — deep
links work on any static host (GitHub Pages included) with no rewrite
rules. Old `#/…` bookmarks from earlier sdocs versions are translated on
load.

## Hash mode (embedded)

When the Explorer is embedded in a host app, its routing defaults to
`#/components/button` under whatever path the host mounts it on — no server
cooperation needed. Override with the
[`routing`](/explorer/configuration#routing) option or the `routing` prop
if your host serves a fallback.

## Deep linking

Any URL can be bookmarked, shared, or linked to. Links written *without* a
section prefix (`/components/button` while sections are active) resolve
into the default section, so URLs from before you introduced sections keep
working. (Folders keep their default expand state — deep-linking doesn't
auto-expand the path to the entry.)

## Home page

Visiting the root shows a home page with counts of components, pages, and
layouts.

## Fullscreen mode

Clicking the fullscreen button hides the sidebar. This is a UI state only —
it doesn't affect the URL, and it isn't persisted.

## See also

- [Sidebar](/explorer/features/sidebar) — where titles, groups, and sections come from
- [Configuration](/explorer/configuration) — the `routing` option
