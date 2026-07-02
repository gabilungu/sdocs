---
title: Prop Extraction
---

For each component documented in a `.sdoc` file, sdocs parses the component's source and extracts its public API. This page describes what's extracted and how to influence it.

## What's extracted

| Category | Source |
|---|---|
| **Props** | `interface Props { … }` + `let { … } = $props()` |
| **Events** | Props named `on*` whose type contains `=>` |
| **Snippets** | Props typed as `Snippet` or `Snippet<[…]>` |
| **Methods** | `export function foo() { … }` |
| **State** | `export const x = $state(…)` / `$derived(…)` |
| **CSS custom properties** | `var(--name)` usages in `<style>` + `@cssvar` annotations |

Each appears as its own section on the component's doc page.

## Props

sdocs reads the `Props` interface and `$props()` destructuring together. Default values come from the destructuring:

```svelte
<script lang="ts">
  interface Props {
    label: string;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
  }
  let { label, size = 'md', disabled = false }: Props = $props();
</script>
```

This extracts three props: `label` (string, no default), `size` (union with default `'md'`), `disabled` (boolean with default `false`).

JSDoc comments on interface members are picked up as descriptions:

```ts
interface Props {
  /** The button label text */
  label: string;
}
```

## Events

A prop is classified as an event when:

- Its name starts with `on` (e.g. `onclick`, `onchange`, `onsubmit`)
- Its type contains `=>` (i.e. it's a callback)

```ts
interface Props {
  onclick?: (e: MouseEvent) => void;   // → event
  onchange?: (value: string) => void;  // → event
  oneTime?: boolean;                   // → prop (starts with "on" but the type isn't a function)
}
```

## Snippets

A prop is classified as a snippet when its type is `Snippet` or `Snippet<[…]>`:

```ts
import type { Snippet } from 'svelte';

interface Props {
  children: Snippet;
  item: Snippet<[value: string, index: number]>;
}
```

The parameter tuple is preserved so it appears in the docs.

## Methods

Exported functions:

```svelte
<script lang="ts">
  /** Clears the input value */
  export function clear(): void {
    value = '';
  }
</script>
```

JSDoc comments become the method description.

## State

Exported `$state` and `$derived` variables:

```svelte
<script lang="ts">
  export const count = $state(0);
  export const double = $derived(count * 2);
</script>
```

## CSS custom properties

sdocs scans the `<style>` block for `var(--name, default?)` usages. It picks up:

- The variable name
- The default value from the second `var()` argument (if provided)

```css
.button {
  background: var(--bg, #333);
  padding: var(--padding, 8px 16px);
}
```

This extracts two CSS vars: `--bg` (default `#333`) and `--padding` (default `8px 16px`).

### `@cssvar` annotations

To give a CSS var a type and description — and upgrade its control in the panel — add `@cssvar` annotations in a JSDoc block inside the `<script>`, one per line:

```svelte
<script lang="ts">
  /**
   * @cssvar {color} --bg - Button background (default: #333)
   * @cssvar {dimension} --radius - Corner radius (default: 4px)
   */
</script>
```

The description runs to the end of the line; an optional trailing `(default: …)` sets the default shown in the docs (merged with any default found in `var()` usages).

The supported types are `color` (→ color picker) and `dimension` (→ number + px unit). See [interactive controls](/docs/features/interactive-controls).

Without the annotation, the var is still extracted and gets a plain text input.

## Limitations

- **Plain JS `$props()`** — if you don't type the destructuring or provide a `Props` interface, sdocs can't infer types.
- **Non-`on*` event props** — `handleClick: () => void` is classified as a prop, not an event. Use the `on*` naming convention.
- **Complex TypeScript types** — conditional types, deep generics, or types imported from other files may not be fully understood. They show up in the props table but may not get the best control.
- **External types** — if a prop references a type from another file, only the type name is shown; sdocs doesn't follow the import.

## See also

- [Interactive controls](/docs/features/interactive-controls) — how extracted props become UI controls
- [Writing component docs](/docs/writing-docs/component-sdoc)
