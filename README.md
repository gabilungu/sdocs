# sdocs

A lightweight documentation tool for Svelte 5 components. Discover `.sdoc` files in your project and get an interactive component explorer with live previews, prop controls, and code highlighting.

## Quick Start

```bash
# Initialize config
npx sdocs init

# Start dev server
npx sdocs dev
```

## Installation

```bash
npm install sdocs
```

**Requirements:** Svelte 5, Vite 6+, `@sveltejs/vite-plugin-svelte` 5+

## Writing Docs

sdocs supports three types of doc files:

### Component Docs (`.sdoc`)

Document a Svelte component with interactive controls and examples.

```svelte
<!-- Button.sdoc -->
<script lang="ts">
  import Button from './Button.svelte';

  export const meta = {
    component: Button,
    title: 'Components / Button',
    description: 'A flexible button component.',
    args: {
      label: 'Click me',
      size: 'md',
      disabled: false,
    },
  };
</script>

{#snippet Default()}
  <Button {...args} />
{/snippet}

{#snippet WithIcon()}
  <Button>
    <Icon name="settings" /> Settings
  </Button>
{/snippet}
```

- **`component`** — the Svelte component to document (auto-extracts props, events, snippets, methods, state, CSS custom properties)
- **`title`** — slash-separated path for sidebar navigation (e.g. `'Components / Button'`)
- **`args`** — default prop values, used as initial values for interactive controls
- **`Default` snippet** — gets live interactive controls. Auto-generated as `<Component {...args} />` if omitted.
- **Named snippets** — static examples listed in the sidebar

### Page Docs (`.page.sdoc`)

Freeform content pages with auto-generated table of contents.

```svelte
<!-- GettingStarted.page.sdoc -->
<script lang="ts">
  export const meta = {
    title: 'Docs / Getting Started',
    description: 'How to set up sdocs.',
  };
</script>

<h1>Getting Started</h1>
<p>Install sdocs and create your first doc file.</p>

<h2>Installation</h2>
<p>Run <code>npm install sdocs</code>...</p>
```

Table of contents is auto-generated from `<h2>`, `<h3>`, and `<h4>` headings.

### Layout Docs (`.layout.sdoc`)

Component compositions rendered in an isolated iframe.

```svelte
<!-- LoginForm.layout.sdoc -->
<script lang="ts">
  import Card from './Card.svelte';
  import Input from './Input.svelte';
  import Button from './Button.svelte';

  export const meta = {
    title: 'Patterns / Login Form',
    description: 'A login form combining multiple components.',
    settings: { padding: '24px' },
  };
</script>

<Card padding="24px">
  <Input label="Email" type="email" />
  <Input label="Password" type="password" />
  <Button>Sign in</Button>
</Card>
```

## Prop Extraction

sdocs automatically extracts from your Svelte components:

| What | Source |
|------|--------|
| **Props** | `$props()` destructuring + `interface Props {}` |
| **Events** | Callback props (`onclick`, `onchange`, etc.) |
| **Snippets** | Props typed as `Snippet` or `Snippet<[...]>` |
| **Methods** | Exported functions |
| **State** | Exported `$state` / `$derived` values |
| **CSS Custom Properties** | `var(--name)` usages in `<style>` |

JSDoc comments on props are picked up as descriptions.

## Interactive Controls

The Default snippet gets live controls based on prop types:

| Prop Type | Control |
|-----------|---------|
| `string` | Text input |
| `number` | Number input |
| `boolean` | Checkbox |
| Color (`#hex`) | Color picker |
| Dimension (`16px`) | Number + unit |

## Configuration

Create `sdocs.config.js` in your project root (or run `npx sdocs init`):

```js
/** @type {import('sdocs').SdocsConfig} */
export default {
  // Glob pattern(s) to find .sdoc files
  include: ['./src/**/*.sdoc'],

  // Dev server port
  port: 3000,

  // Open browser on start
  open: true,

  // Sidebar logo text
  logo: 'My Design System',

  // CSS loaded in preview iframes
  css: './src/styles/global.css',

  // Sidebar ordering
  sidebar: {
    order: {
      root: ['Components', '*', 'Documentation'],
    },
    open: ['Components'],
  },
};
```

### CSS Stylesheet Switching

Provide named stylesheets to let users switch between them (e.g. light/dark themes):

```js
css: {
  light: './src/styles/light.css',
  dark: './src/styles/dark.css',
}
```

### Sidebar Ordering

Control the order of items in the sidebar with `sidebar.order`. Use `'*'` as a wildcard for remaining items in alphabetical order:

```js
sidebar: {
  order: {
    root: ['Getting Started', 'Components', '*'],
    Components: ['Button', 'Input', '*'],
  },
  open: ['Components'],
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx sdocs dev` | Start dev server with HMR |
| `npx sdocs build` | Build static documentation site |
| `npx sdocs preview` | Preview the built site locally |
| `npx sdocs init` | Scaffold a `sdocs.config.js` file |

## Embedding in a Vite/SvelteKit Project

Instead of the CLI, you can use sdocs as a Vite plugin:

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { sdocsPlugin } from 'sdocs/vite';

export default {
  plugins: [sveltekit(), sdocsPlugin()],
};
```

The plugin exposes a `virtual:sdocs` module with all discovered doc entries.

## Package Exports

| Export | Description |
|--------|-------------|
| `sdocs` | Main entry — `sdocsPlugin` + types |
| `sdocs/vite` | Vite plugin function |
| `sdocs/client` | App.svelte UI component |
| `sdocs/ui` | Reusable UI components (Button, Frame, Icon, Control, NavTree, Stack) |

## License

MIT
