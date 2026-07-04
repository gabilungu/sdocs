---
title: Component Docs
---

A `[DOCS]` block documents components: live previews wired to interactive
controls, frozen examples, and each previewed component's extracted API.

```sdoc
<script lang="ts">
	import Button from './Button.svelte';
</script>

[DOCS title="Forms / Button" description="A flexible button."]

	[preview component={Button} args={{ label: 'Click me', disabled: false }}]
		<Button {...args} />
	[/preview]

	[example title="Disabled"]
		<Button label="Can't touch this" disabled />
	[/example]

[/DOCS]
```

## `[DOCS]` attributes

| Attribute | Required | Meaning |
|---|---|---|
| `title` | yes | Sidebar path and display name — `"Forms / Button"` nests under Forms |
| `description` | no | Short text under the page title |

## `[preview]`

A preview is a live, interactive showcase. Each `[preview]` names the
component it demonstrates and declares the defaults for its
[interactive controls](/explorer/features/interactive-controls):

| Attribute | Required | Meaning |
|---|---|---|
| `component` | yes | The demonstrated component: an identifier imported in the file's `<script>`. Drives [prop extraction](/explorer/features/prop-extraction) and the controls. |
| `args` | no | This preview's control defaults |
| `title` | no | Tab label — defaults to the component's name |

`args` values are **plain literals** — strings, numbers, booleans. They stay
simple because the controls send them into the isolated preview at runtime.
Anything richer (arrays, objects, imported values) belongs directly in the
body markup, where full Svelte is available.

Inside the body, `args` is in scope — spread it, pick from it, or ignore it.

## Multiple previews — tabs

A `[DOCS]` block holds any number of previews. With one, the page is a plain
component page. With several, the page grows a **tab bar**: each tab is that
preview with its own controls and its component's API tables — every tab
fully live.

```sdoc
[DOCS title="Navigation / Tabs"]

	[preview component={Tabs} args={{ active: 0 }}]
		<Tabs {...args}>
			<Tab label="One">…</Tab>
			<Tab label="Two">…</Tab>
		</Tabs>
	[/preview]

	[preview component={Tab} args={{ label: 'One' }}]
		<Tabs>
			<Tab {...args}>…</Tab>
		</Tabs>
	[/preview]

[/DOCS]
```

Tab labels default to the component name (`Tabs`, `Tab` above); set
`title="…"` on a preview to override it — which is also how two previews of
the *same* component stay distinguishable.

This is made for components that belong together: compound families like
`Tabs`/`Tab` or `Select`/`Option` whose children never stand alone (wrap the
child in its parent inside the body, as above), or a component and its close
twin. Unrelated components read better as separate `[DOCS]` blocks — one
file can hold several.

A block with **zero** previews is valid too: an examples-only page, with no
controls and no API tables.

## `[example]`

Examples are frozen showcases: each renders **exactly what you wrote**,
always — the controls never touch them. Every example requires a `title`
(any text — spaces and punctuation welcome), unique within its `[DOCS]`
block.

Examples belong to the page, not to a tab: they render below the preview
area and stay visible whichever tab is active.

An example may carry its own `<script>` for local state, layered on top of
the file's script — that's how you demo interactive behavior:

```sdoc
[example title="Controlled from outside"]
	<script>
		let open = $state(false);
	</script>
	<button onclick={() => open = !open}>toggle</button>
	<Disclosure bind:open summary="Details">…</Disclosure>
[/example]
```

## What sdocs extracts

For every previewed component, sdocs parses its source and extracts the full
public API — props, events, snippets, methods, states, and CSS custom
properties. See [prop extraction](/explorer/features/prop-extraction).
