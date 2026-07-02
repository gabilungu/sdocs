---
title: Layout Docs
---

Layout docs demonstrate a composition of multiple components — a login form, a dashboard shell, a card grid. They render full-width in an isolated iframe so the composition gets a clean stage.

## Example

```svelte
<!-- LoginForm.layout.sdoc -->
<script lang="ts">
  import Card from './Card.svelte';
  import Input from './Input.svelte';
  import Button from './Button.svelte';

  export const meta = {
    title: 'Patterns / Login Form',
    description: 'A login form combining Card, Input, and Button.',
  };
</script>

<Card padding="24px">
  <Input label="Email" type="email" />
  <Input label="Password" type="password" />
  <Button>Sign in</Button>
</Card>
```

## The `meta` object

```ts
{
  title: string;                     // required — sidebar path
  description?: string;              // optional subtitle
  settings?: Record<string, any>;    // reserved for preview settings
}
```

`component` and `args` are ignored on layout docs.

## Content

Everything outside `<script>` and `<style>` tags is the layout. It renders in an isolated iframe, meaning the parent app's styles don't leak in — only the stylesheet configured via `config.css` applies.

Imports from your codebase work normally.

## Layouts vs. component docs

- A **component doc** documents a single component with its props, events, and variants. It has controls.
- A **layout doc** shows many components together. No controls, no prop extraction — just the composition.

A component doc's named snippets (`WithIcon`, `Disabled`) cover small static variants of one component. Reach for a layout doc when you want to show components working together at the page or feature level.

## See also

- [Component docs](/docs/writing-docs/component-sdoc)
- [Page docs](/docs/writing-docs/page-sdoc)
