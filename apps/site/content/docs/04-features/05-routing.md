---
title: Routing
---

sdocs uses a hash-based router. The current doc is encoded in `window.location.hash`, so any doc page is deep-linkable.

## URL format

```
https://example.com/docs/#/Components/Button
https://example.com/docs/#/Components/Button/WithIcon
https://example.com/docs/#/Patterns/Login-Form
```

The hash is `#` followed by one `/` per title segment.

## Space encoding

Spaces in titles are encoded as hyphens in the URL, and decoded back when reading:

| Title | URL hash |
|---|---|
| `'Components / Button'` | `#/Components/Button` |
| `'Patterns / Login Form'` | `#/Patterns/Login-Form` |
| `'Docs / Getting Started'` | `#/Docs/Getting-Started` |

If a title already contains a hyphen, it'll look the same in the URL — there's no unambiguous round-trip for `"A - B"` vs. `"A B"`. Avoid hyphens in titles if you care.

## Sub-pages

Named snippets get a sub-segment:

| Entry | URL hash |
|---|---|
| `Button` component (main page) | `#/Components/Button` |
| `Button` with snippet `WithIcon` | `#/Components/Button/WithIcon` |

## Deep linking

Because everything is in the hash, any URL can be bookmarked, shared, or linked to:

```html
<a href="/docs/#/Components/Button">See the Button docs</a>
```

The page loads and the selected doc renders, highlighted in the sidebar. (Folders keep their default expand state — deep-linking doesn't auto-expand the path to the entry.)

## Home page

Visiting with no hash (or just `#/`) shows a home page with counts of components, pages, and layouts.

## Fullscreen mode

Clicking the fullscreen button hides the sidebar. This is a UI state only — it doesn't affect the URL, and it isn't persisted.

## See also

- [Sidebar](/docs/features/sidebar) — where titles come from
- [Writing component docs](/docs/writing-docs/component-sdoc) — setting `title`
