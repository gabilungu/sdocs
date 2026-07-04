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

## Ordering

By default, entries within each folder are sorted alphabetically. Override this with `sidebar.order` in your config:

```js
sidebar: {
  order: {
    root: ['Getting Started', 'Components', '*'],
    Components: ['Button', 'Input', 'Select', '*'],
  },
}
```

- Keys are folder paths from the root, with `'root'` for the top level (nested folders are slash-joined, e.g. `'Components/Forms'`)
- `'*'` is a wildcard — any items not listed by name go here, alphabetically
- Items not matched by any rule fall back to alphabetical

## Initial open state

Choose which folders are expanded when the app loads:

```js
sidebar: {
  open: ['Components', 'Forms'],
}
```

Users can still collapse/expand any folder; this only sets the initial state.

## Search

The sidebar has a search box that filters the tree in real time. As you type:

- Items are matched case-insensitively against their label
- Folders containing matches are auto-expanded
- Non-matching siblings are hidden

Clear the search to restore the full tree.

## Component sub-pages

A component doc with named snippets expands into sub-entries in the sidebar:

```
Button
  Docs         ← the main component page
  WithIcon     ← named snippet
  Disabled     ← named snippet
```

The "Docs" entry is the component overview (description, props, Default preview). Each named snippet is a standalone sub-page.

## See also

- [Configuration reference](/explorer/configuration) — full `sidebar` option
- [Routing](/explorer/features/routing) — how sidebar selections map to URLs
