---
title: Page Docs
---

A `[PAGE]` block is freeform prose — install guides, design tokens,
principles — anything that isn't documenting a single component. Its body is
**markdown**, rendered as a page with an auto-generated table of contents.

```sdoc
<script lang="ts">
	import Button from './Button.svelte';
	const version = '2.0';
</script>

[PAGE title="Docs / Getting Started"]

	## Installation

	Install sdocs (currently {version}) and create your first doc file:

	```bash
	npm install -D sdocs
	```

	## Buttons in context

	Components render right in the prose — here's a live one:
	<Button label="the demo" />

	| Command | Does |
	|---|---|
	| `sdocs dev` | dev server |
	| `sdocs build` | static site |

[/PAGE]
```

## Attributes

`[PAGE]` takes a single attribute: `title` (required) — the sidebar path,
`/`-separated like every entity.

## The markdown dialect

The body is markdown first, with two Svelte conveniences:

- **`{expression}` interpolation** — values from the file's `<script>` drop
  into the prose: `currently {version}`.
- **Component islands** — a component tag renders live inside the text,
  like the `<Button />` above. Components come from the file's `<script>`
  imports.

Everything else is plain markdown: headings, links, images, tables, lists,
and code fences. **Fences are inert** — code inside them is displayed and
highlighted, never executed, even if it looks like a component tag.

What a page does **not** have: template logic (`{#if}`, `{#each}`),
controls, and prop extraction. If you find yourself wanting logic, the
content is probably a [component doc](/language/component-docs) or a
[layout](/language/layout-docs).

## Table of contents

A table of contents is generated from the page's `##`–`####` headings and
shown on the right. Heading IDs are slugified — lowercased, non-word
characters stripped, spaces as hyphens — so `## Getting Started` anchors at
`#getting-started`. The page header shows the entity `title`; a top-level
`#` heading in the body is neither required nor listed.

## When to reach for a page

- **Page** — content that doesn't map to one component: guides, overviews,
  conventions.
- **[Component doc](/language/component-docs)** — one component, with
  controls and extracted API.
- **[Layout](/language/layout-docs)** — components composed together on a
  full-page stage.
