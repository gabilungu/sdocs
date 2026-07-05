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

| Attribute | Required | Meaning |
|---|---|---|
| `title` | yes | Sidebar path, `/`-separated like every entity |
| `maxWidth` | no | Content column width (default from config, `1200px`) |
| `padding` | no | Space around the page content (default `32px`) |
| `toc` | no | `toc="false"` hides the table of contents (default `true`) |

## The markdown dialect

The body is markdown first, with two Svelte conveniences:

- **`{expression}` interpolation** — values from the file's `<script>` drop
  into the prose: `currently {version}`. The inside of a balanced `{…}` is
  passed to Svelte verbatim, so string literals and operators are fine:
  `{format("0.0.1")}`.
- **Svelte islands** — markup blocks that pass to Svelte untouched. A line
  that starts with a component or HTML tag (`<Button`, `<div`) or a Svelte
  block (`{#snippet`, `{@render`), sitting after a blank line, begins an
  island; the island runs until its tags and blocks are balanced — blank
  lines inside are fine. Markdown never reformats or splits an island.

Everything else is plain markdown: headings, links, images, tables, lists,
and code fences. **Fences are inert** — code inside them is displayed and
highlighted, never executed, even if it looks like a component tag. The same
goes for `` `inline code` ``. For a literal brace in prose, escape it:
`\{`.

## Snippets

Pages support [snippets](https://svelte.dev/docs/svelte/snippet) for repeated
markup. Declare one anywhere in the body as its own island, then render it
anywhere — before or after, in any section:

```sdoc
[PAGE title="Colors"]

	{#snippet swatch(color: string)}
		<div style="background: {color}; width: 100px; height: 100px;"></div>
	{/snippet}

	## Reds

	<div style="display: flex;">
		{@render swatch('#ff0000')}
		{@render swatch('#b91c1c')}
	</div>

	## Blues

	<div style="display: flex;">
		{@render swatch('#3b82f6')}
	</div>

[/PAGE]
```

What a page does **not** have: controls and prop extraction. If you find
yourself wanting stateful logic, the content is probably a
[component doc](/language/component-docs) or a
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
