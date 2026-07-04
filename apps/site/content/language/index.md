---
title: The sdoc Language
---

Everything sdocs renders starts as a `.sdoc` file. This section documents
the language: what the files contain, how they're structured, and the three
kinds of documents they can express.

## One invariant

**Every `.sdoc` file is a valid Svelte 5 file.** Docs are written with the
exact syntax, tooling, and editing experience of the components they
document — the [VS Code extension](/extension) gives doc files the complete
Svelte IntelliSense experience because of this.

A component doc in full:

```svelte
<script lang="ts">
  import Button from './Button.svelte';

  export const meta = {
    component: Button,
    title: 'Components / Button',
    description: 'A flexible button.',
    args: { label: 'Click me', disabled: false },
  };
</script>

{#snippet Default(args)}
  <Button {...args} />
{/snippet}

{#snippet WithIcon(args)}
  <Button {...args} icon="save" />
{/snippet}
```

The `meta` export declares what's documented and where it lives in the
sidebar; the `Default` snippet is the interactive preview; every other
snippet is a named example.

## The three kinds

| Kind | File | Documents |
|---|---|---|
| [Component docs](/language/component-docs) | `Button.sdoc` | a component: preview, controls, examples, extracted API |
| [Page docs](/language/page-docs) | `About.page.sdoc` | freeform content with an auto-generated table of contents |
| [Layout docs](/language/layout-docs) | `Login.layout.sdoc` | a full-page composition in an isolated frame |

## What sdocs extracts

Beyond what you write, sdocs parses the documented component itself and
extracts its public API — props, events, snippets, methods, states, and CSS
custom properties. See [prop extraction](/explorer/features/prop-extraction)
for what's picked up and how to influence it.
