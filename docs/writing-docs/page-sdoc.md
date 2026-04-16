---
title: Page Docs
parent: Writing Docs
nav_order: 2
---

# Page docs (`.page.sdoc`)

Page docs are for freeform prose — install guides, design tokens, principles — anything that isn't documenting a single component. They render as a single page with an auto-generated table of contents.

## Example

```svelte
<!-- GettingStarted.page.sdoc -->
<script lang="ts">
  export const meta = {
    title: 'Docs / Getting Started',
    description: 'How to set up sdocs in your project.',
  };
</script>

<h1>Getting Started</h1>

<p>Install sdocs and create your first doc file.</p>

<h2>Installation</h2>
<p>Run <code>npm install sdocs</code>…</p>

<h2>Configuration</h2>
<p>Create a <code>sdocs.config.js</code> file…</p>

<h3>Include patterns</h3>
<p>Use glob patterns to match your <code>.sdoc</code> files.</p>
```

## The `meta` object

```ts
{
  title: string;         // required — sidebar path
  description?: string;  // optional subtitle
}
```

`component`, `args`, and `settings` are ignored on page docs.

## Content

Everything outside `<script>` and `<style>` tags is rendered as markup. You can use plain HTML or Svelte syntax (components, expressions, blocks). Imports from your codebase work the same as in a regular Svelte file.

## Table of contents

An auto-generated table of contents appears in a sidebar on the right, built from `<h2>`, `<h3>`, and `<h4>` headings.

Heading IDs are slugified: lowercased, non-word characters stripped, spaces replaced with hyphens.

```html
<h2>Getting Started</h2>       <!-- id: "getting-started" -->
<h3>Installation Steps</h3>    <!-- id: "installation-steps" -->
```

`<h1>` headings are not included in the TOC (treated as the page title).

## When to use pages vs. component docs

- Use a **page doc** when the content doesn't map to a single component — install guides, architectural overviews, writing guidelines.
- Use a **component doc** when documenting a specific component with props, events, and variants.
- Use a **layout doc** when showing a composition of multiple components.

## See also

- [Component docs](./component-sdoc.md)
- [Layout docs](./layout-sdoc.md)
