---
title: Layout Docs
---

A `[LAYOUT]` block is a full-page sketch — a composition of components on a
clean, isolated stage: a login form, a dashboard shell, a card grid.

```sdoc
<script lang="ts">
	import Card from './Card.svelte';
	import Input from './Input.svelte';
	import Button from './Button.svelte';
</script>

[LAYOUT title="Patterns / Login Form" padding="48px"]

	<Card padding="24px">
		<Input label="Email" type="email" />
		<Input label="Password" type="password" />
		<Button label="Sign in" />
	</Card>

[/LAYOUT]
```

## Attributes

| Attribute | Required | Meaning |
|---|---|---|
| `title` | yes | Sidebar path, `/`-separated |
| `maxWidth` | no | Stage width (default `100%`; narrower stages center) |
| `padding` | no | Space around the sketch inside the frame (default `0px`) |

Presentation attributes tune the stage; the sketch itself is whatever you
put in the body. Global defaults live in the config's [`content`
option](/explorer/configuration).

## The body

The body is full Svelte — components, expressions, `{#if}`/`{#each}`
blocks, local `<script>` state — rendered full-width in an **isolated
frame**: the host app's styles don't leak in, only the stylesheet from
[`config.css`](/explorer/configuration) applies, plus the file's own
`<style>`.

No controls, no prop extraction — just the composition.

## Not a SvelteKit layout

Despite the name, `[LAYOUT]` has nothing to do with SvelteKit's
`+layout.svelte`. It doesn't wrap other pages — it **is** a page: a
standalone visual sketch that gets its own sidebar entry.

## Layouts vs. the other entities

- **[Component doc](/language/component-docs)** — one component, with
  controls, examples, and extracted API. Its `[example]` blocks cover small
  variants of that component.
- **[Page](/language/page-docs)** — markdown prose with component islands.
- **Layout** — many components working together at the page or feature
  level, on an isolated full-page stage.
