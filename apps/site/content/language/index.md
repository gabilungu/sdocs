---
title: The sdoc Language
---

Everything sdocs renders starts as a `.sdoc` file. A `.sdoc` file is a
**documentation format that contains Svelte**: the file's structure is sdoc,
and Svelte code lives inside designated blocks.

## File anatomy

Every `.sdoc` file has the same three-part shape, in this order:

1. **`<script>`** — at the top, optional. Imports and shared values, in
   JavaScript or TypeScript. Available to every entity in the file.
2. **Entities** — the middle. Any number of `[DOCS]`, `[PAGE]`, and
   `[LAYOUT]` blocks, in any mix. Each entity is its own sidebar entry.
3. **`<style>`** — at the bottom, optional. CSS available to the file's
   previews and examples.

Only the entities are required — and a file doesn't have to be attached to a
component at all: `About.sdoc` can hold a single `[PAGE]`, `Dashboard.sdoc` a
single `[LAYOUT]`, and a `[DOCS]` block can even skip the preview and carry
only examples.

```sdoc
<script lang="ts">
	import Button from './Button.svelte';
</script>

[DOCS title="Forms / Button" description="A flexible button."]

	[preview component={Button} args={{ label: 'Click me', disabled: false }}]
		<Button {...args} />
	[/preview]

	[example title="With a very long label"]
		<Button label="This label would never fit in an identifier" />
	[/example]

[/DOCS]

[PAGE title="Forms / Button usage guide"]

	## When to use a button

	Buttons trigger actions. For navigation, use a link — see <Button label="the demo" />
	rendered right here in prose.

[/PAGE]

<style>
	.demo-row { display: flex; gap: 8px; }
</style>
```

## The three entities

| Entity | Documents | Details |
|---|---|---|
| [`[DOCS]`](/language/component-docs) | components | live previews with controls (tabs when several), titled examples, extracted API |
| [`[PAGE]`](/language/page-docs) | freeform content | markdown-first, auto table of contents |
| [`[LAYOUT]`](/language/layout-docs) | a full-page sketch | rendered in an isolated frame |

The `title` attribute places each entity in the sidebar — path segments
separated by `/` create groups, exactly like folders:
`title="Forms / Button"` puts Button inside the Forms group. Within a group,
entities appear in document order, then by file path. Two prefixes on the
first segment add structure above folders: `:` makes a bold sidebar group
(`title=":Forms / Button"`), and `@` assigns the entity to a top-bar
[section](/explorer/features/sidebar#sections-top-bar)
(`title="@Components/Forms / Button"`).

## Multiple entities per file

One file can hold several entities — a component's docs and its usage guide
sharing the same imports, or a family of small related components. House
rules:

- Name the file after its **main entity** (`Button.sdoc`), and put that
  entity first.
- Sidebar order within a group follows the order in the file.
- If a file grows past a handful of entities, consider splitting it — the
  editor will nudge you.

The top `<script>` is shared **source**, not shared state: every preview and
example renders isolated, so each gets its own copy of anything mutable.

## Blocks and attributes

- Tags are line-anchored square brackets: `[DOCS …]` opens, `[/DOCS]` closes,
  each on its own line. Entity tags are UPPERCASE; the blocks inside them
  (`[preview]`, `[example]`) are lowercase. Casing is strict.
- Attributes use Svelte syntax: `title="text"` for strings,
  `component={Button}` for expressions. Openers may span multiple lines.
- Svelte code is valid only **inside** blocks. Body text outside any block is
  an error.
