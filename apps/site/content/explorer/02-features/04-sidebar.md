---
title: Sidebar
---

The sidebar organizes your docs into a navigable tree. Its structure comes from each doc's `title`, split on `/`.

## Structure from titles

```js
title: 'Components / Button'
title: 'Components / Input'
title: 'Forms / Validation'
```

Produces:

```
Components
  Button
  Input
Forms
  Validation
```

## Groups (`:` prefix)

A *first* title segment prefixed with `:` is rendered as a bold group header — expanded by default, visually separated:

```js
title: ':Design System / Components / Button'
```

The group reads as a section heading but is still collapsible like any folder. The `:` prefix only works on the first segment. Use groups to carve the sidebar into major areas (`:Docs`, `:Components`, `:Patterns`).

## Sections (top bar)

Above folders and groups sits a third level: **sections**, declared in the
config and shown as tabs in a full-width top bar. A title's leading
`@slug/` segment places the entity in that section; each section has its
own sidebar tree:

```js
// sdocs.config.js
sections: [
  { slug: 'guides', title: 'Guides' },
  { slug: 'components' },
]
```

```js
title: '@guides/Installation'
title: '@components/:Form / Button'
title: 'Loose notes'                // no @ → the `docs` section, if declared
```

Titles reference the section **slug** — the stable identity that also forms
the URL — so renaming a tab (`title`) never breaks doc files or links.
Referencing an undeclared section is a full-page error, as is an unprefixed
title when no `docs` section is declared. A project that declares no
sections keeps a single implicit `docs` section — the top bar always
renders (brand, tabs, theme and fullscreen controls), just with one tab.

Sections make full documentation sites: a `guides` section of pure pages
next to a `components` section of component docs, each with its own
sidebar.

## Ordering

Entries at every level sort alphabetically. To pin items first, list their
route paths (relative to the section) in the section's `order` array:

```js
sections: [
  { slug: 'guides', order: ['introduction', 'colors'] },
]
```

Listed paths sort first at their level, in array order; everything else
follows alphabetically. Paths reach nested levels too
(`order: ['form/button']` pins Button inside the Form group).

## Search

The sidebar has a search box that filters the tree in real time. As you type:

- Items are matched case-insensitively against their label
- Folders containing matches are auto-expanded
- Non-matching siblings are hidden

Clear the search to restore the full tree.

## Component sub-pages

A component doc with examples expands into sub-entries in the sidebar:

```
Button
  Docs         ← the main component page
  WithIcon     ← example
  Disabled     ← example
```

The "Docs" entry is the component overview (description, live previews, API tables). Each `[example]` is also a standalone sub-page.

## See also

- [Configuration reference](/explorer/configuration) — full `sidebar` option
- [Routing](/explorer/features/routing) — how sidebar selections map to URLs
