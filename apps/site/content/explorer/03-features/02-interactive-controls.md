---
title: Interactive Controls
---

The `Default` snippet of a component doc gets a live controls panel. Each control is chosen automatically based on the prop's TypeScript type.

## Control types

| Prop type | Control | Notes |
|---|---|---|
| `string` | Text input | |
| `number` | Number input | |
| `boolean` | Checkbox | |
| `'a' \| 'b' \| 'c'` (string union) | Select dropdown | Quoted union members only |
| `1 \| 2 \| 3` (number union) | Select dropdown | Bare number union members only |
| CSS custom property — `color` | Color picker | Detected from `@cssvar {color}` JSDoc |
| CSS custom property — `dimension` | Number + px unit | Detected from `@cssvar {dimension}` JSDoc |
| Any other CSS custom property | Text input | |
| Unsupported / complex type | Read-only display | Shows the type, no editor |

## String union → select

If a prop is typed as a union of string literals, sdocs renders a select dropdown with one option per union member:

```svelte
<script lang="ts">
  interface Props {
    size: 'sm' | 'md' | 'lg';
  }
  let { size = 'md' }: Props = $props();
</script>
```

In the controls panel, `size` becomes a dropdown with options `sm`, `md`, `lg`.

**Rules for detection:**

- All members must be string literals wrapped in quotes (`'sm'`, `"md"`).
- Mixed unions (`'sm' | number`) are not supported and fall back to read-only display.

## Number union → select

Same as string unions but for bare numbers:

```ts
interface Props {
  level: 1 | 2 | 3 | 4;
}
```

`level` becomes a dropdown with options `1`, `2`, `3`, `4`.

## CSS custom property controls

For CSS variables, the control type is chosen from `@cssvar` JSDoc annotations, written one per line in a JSDoc block inside the `<script>`:

```svelte
<script lang="ts">
  /**
   * @cssvar {color} --bg - Button background
   * @cssvar {dimension} --radius - Border radius
   */
</script>

<style>
  .button {
    background: var(--bg, #333);
    border-radius: var(--radius, 4px);
  }
</style>
```

- `{color}` → color picker
- `{dimension}` → number input with a `px` unit suffix
- Anything else (or no `@cssvar`) → plain text input

CSS variables found in `var()` usages are always extracted. The `@cssvar` annotation is only needed to upgrade the control type and provide a description.

See [prop extraction](/explorer/features/prop-extraction) for the full extraction rules.

## Default values

Initial control values come from `meta.args`:

```svelte
<script lang="ts">
  export const meta = {
    component: Button,
    title: 'Components / Button',
    args: {
      label: 'Click me',
      size: 'md',
      disabled: false,
    },
  };
</script>
```

For CSS custom properties, set defaults via the `var()` fallback in your component's `<style>` block (`var(--bg, #333)`) — sdocs picks these up automatically.

## Reset

The controls panel has a **Reset** button that restores all controls to the values in `meta.args` (and CSS vars back to their `var()` defaults).

## Unsupported types

Props with types sdocs can't classify (e.g. `Record<string, unknown>`, imported interfaces, complex generics) show up in the controls panel as read-only rows — the name and type, but no editor.

This is intentional: rather than guessing and misrendering, sdocs surfaces the prop so you know it exists but skips the control.

## See also

- [Prop extraction](/explorer/features/prop-extraction) — how sdocs parses your component
- [Writing component docs](/explorer/writing-docs/component-sdoc) — the `Default` snippet and `args`
