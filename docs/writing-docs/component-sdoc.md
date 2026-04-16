---
title: Component Docs
parent: Writing Docs
nav_order: 1
---

# Component docs (`.sdoc`)

A component doc is a Svelte file with a `.sdoc` extension that documents a single component. It exports a `meta` object and optionally defines snippets for a live preview and static examples.

## Minimum example

```svelte
<!-- Button.sdoc -->
<script lang="ts">
  import Button from './Button.svelte';

  export const meta = {
    component: Button,
    title: 'Components / Button',
  };
</script>
```

That's it. With no snippets, sdocs auto-generates a `Default` snippet as `<Button {...args} />` (using an empty `args` object since none was provided).

## The `meta` object

```ts
{
  component: unknown;          // the imported Svelte component (required for controls)
  title: string;               // slash-separated path, e.g. "Components / Button"
  description?: string;        // short description shown at the top of the page
  args?: Record<string, any>;  // default prop values, bound to interactive controls
  settings?: Record<string, any>; // reserved for preview settings (currently unused)
}
```

### `component`

The imported component. sdocs reads its source to extract props, events, snippets, methods, state, and CSS custom properties. See [prop extraction](../features/prop-extraction.md) for what exactly is parsed.

You can also pass a string path (`'./Button.svelte'`) if you need to defer the import, but the direct import is recommended.

### `title`

Controls where the component appears in the sidebar. Slashes become folders:

```js
title: 'Components / Button'           // → Components ▸ Button
title: 'Forms / Inputs / TextInput'    // → Forms ▸ Inputs ▸ TextInput
```

A segment prefixed with `:` is rendered as a bold group header (always expanded, styled differently):

```js
title: ':Design System / Components / Button'
```

See [sidebar](../features/sidebar.md) for ordering rules.

### `description`

Optional. Shown as a subtitle on the component page.

### `args`

Default values for props. These become the initial values of the interactive controls on the `Default` snippet:

```js
args: {
  label: 'Click me',
  size: 'md',
  disabled: false,
}
```

When the user edits a control, the new value flows into the `Default` snippet and the preview re-renders. The code panel below the preview updates to reflect the change.

See [interactive controls](../features/interactive-controls.md) for which prop types get which control.

## Snippets

Component docs recognize two kinds of snippets:

### The `Default` snippet

This snippet gets the interactive controls. Its `args` parameter is bound to the current control values:

```svelte
{#snippet Default()}
  <Button {...args} />
{/snippet}
```

If you omit the `Default` snippet, sdocs auto-generates `<Component {...args} />`. Define it explicitly when you need to wrap the component, provide child content, or set props that shouldn't be editable:

```svelte
{#snippet Default()}
  <div style="max-width: 400px;">
    <Button {...args}>
      {args.label}
    </Button>
  </div>
{/snippet}
```

### Named snippets (examples)

Any other snippet becomes a static example listed in the sidebar under the component:

```svelte
{#snippet WithIcon()}
  <Button>
    <Icon name="settings" /> Settings
  </Button>
{/snippet}

{#snippet Disabled()}
  <Button disabled>Can't click me</Button>
{/snippet}
```

Named snippets are static — they don't receive `args` and don't get interactive controls. Use them to show meaningful variants.

## What appears on the page

For each component doc, the rendered page contains:

1. **Title & description** from `meta`
2. **Preview** — live render of the `Default` snippet in an iframe
3. **Controls panel** — auto-generated from component props
4. **Code** — snippet source with props patched to reflect current control values
5. **Props table** — extracted from the component
6. **Events, snippets, methods, state, CSS vars** — each in its own section if present
7. **Named snippet examples** — each as its own sub-page

## File placement

sdocs discovers `.sdoc` files via the `include` glob in your config. The file can live anywhere that matches. A common convention is to colocate the doc with the component:

```
src/lib/Button/
├── Button.svelte
└── Button.sdoc
```

## See also

- [Interactive controls](../features/interactive-controls.md) — full list of control types
- [Prop extraction](../features/prop-extraction.md) — what sdocs parses from your component
- [Page docs](./page-sdoc.md) — for freeform prose
- [Layout docs](./layout-sdoc.md) — for component compositions
