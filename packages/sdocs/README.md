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

**Requirements:** Node 22+, Svelte 5, Vite 6+, `@sveltejs/vite-plugin-svelte` 5+

## Usage

sdocs can be used in two ways: as a **standalone CLI tool** or **embedded in your existing project**.

### Standalone (CLI)

Run sdocs as its own dev server:

```bash
npx sdocs dev      # Start dev server with HMR
npx sdocs build    # Build a static site — every route prerendered to real HTML
npx sdocs preview  # Preview the built site locally
npx sdocs init     # Scaffold a sdocs.config.js file
npx sdocs mcp      # Serve the sdocs MCP server on stdio (authoring tools for agents)
```

### MCP server

`sdocs mcp` serves an [MCP](https://modelcontextprotocol.io) server so agent
tooling works against the real parser and extractor instead of guessing at the
format: `validate_sdoc` (parse `.sdoc` text, return diagnostics),
`scaffold_component_doc` (a starter doc from a component's extracted props),
`get_authoring_guide` (the full format reference — also on the web as
[llms.txt](https://gabilungu.github.io/sdocs/llms.txt)), `list_docs` (the
project's docs and the components they document), and `get_component_api` (a
component's full extracted API). Register it as a stdio server in any MCP
client — e.g. `claude mcp add sdocs -- npx -y sdocs mcp` — or, while
`sdocs dev` runs, point a local client at `http://localhost:3000/mcp`. The
[VS Code extension](https://marketplace.visualstudio.com/items?itemName=gabilungu.sdocs)
registers it with the editor automatically. Built sites carry no MCP endpoint.

### Embedded in a SvelteKit / Vite Project

Use sdocs as a Vite plugin inside your existing project. This way sdocs runs alongside your app without needing a separate server.

**1. Add the Vite plugin**

```js
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { sdocsPlugin } from 'sdocs/vite';

export default {
  plugins: [
    sveltekit(),
    sdocsPlugin({
      include: ['./src/lib/**/*.sdoc'],
      css: './src/styles/global.css',
      logo: 'My Design System',
    })
  ],
};
```

The plugin discovers `.sdoc` files and exposes them via a `virtual:sdocs` module.

**2. Create a page that mounts the sdocs app**

```svelte
<!-- src/routes/docs/+page.svelte -->
<script>
  import Explorer from 'sdocs/explorer';
  import { docs, cssNames, pageModules } from 'virtual:sdocs';
</script>

<Explorer {docs} {cssNames} {pageModules} title="My Design System" />
```

`pageModules` is not optional: `[DOC]` and `[PAGE]` bodies compile to their own
components and are loaded through it, so an Explorer mounted without it renders
those pages blank with no error.

**3. Add the virtual module type declaration** (optional, for TypeScript)

```ts
// src/app.d.ts or any .d.ts file
declare module 'virtual:sdocs' {
  import type { DocEntry } from 'sdocs';
  export const docs: DocEntry[];
  export const cssNames: string[];
  export default docs;
}
```

That's it — your docs page lives at `/docs` inside your existing app.

## Writing Docs

A `.sdoc` file is `<script>` at the top, entity blocks in the middle, and an
optional `<style>` at the bottom. Every entity is its own sidebar entry, so
one file can hold several.

### Component docs — `[SHOWCASE]`

```sdoc
<script lang="ts">
	import Button from './Button.svelte';
</script>

[SHOWCASE title="Components / Button" description="A flexible button component."]

	[COMPONENT component={Button} status="ready" args={{ label: 'Click me', disabled: false }}]
		<Button {...args} />
	[/COMPONENT]

	[EXAMPLE title="With icon"]
		<Button><Icon name="settings" /> Settings</Button>
	[/EXAMPLE]

[/SHOWCASE]
```

- **`[COMPONENT]`** — a live showcase with interactive controls.
  `component={X}` names the previewed component (its props, events,
  snippets, methods, state, and CSS custom properties are extracted
  automatically) and `args` sets the control defaults. `status` is optional:
  `draft`, `wip`, `review`, `experimental`, `ready` or `deprecated`, shown as a
  glyph on the component's tab. Two or more `[COMPONENT]` blocks share one tab
  strip and must sit inside a `[COMPONENTS]` wrapper.
- **`[EXAMPLE]`** — frozen showcases rendered exactly as written, shown
  below the preview area. Each needs a unique `title`.
- **`title`** — slash-separated path for sidebar navigation.
- Blocks are UPPERCASE. `[COMPONENT]` and `[EXAMPLE]` are also accepted in
  lowercase for files written before 0.0.139.

### Doc pages — `[DOC]`

Freeform markdown content with `{expression}` interpolation and Svelte
component islands; code fences are inert. The table of contents is generated
from the headings.

```sdoc
[DOC title="Docs / Getting Started"]

	## Installation

	Run `npm install sdocs` and create your first doc file.

[/DOC]
```

### Svelte pages — `[PAGE]`

A page built in plain Svelte, rendered in the docs app's own context — for
landing pages and custom routes. A `[PAGE]` without a `@section/` title
prefix routes at the site root and belongs to no sidebar; point the config's
`home` at it for a landing page.

```sdoc
<script lang="ts">
	import { CodeBlock } from 'sdocs/ui';
</script>

[PAGE title="Welcome" contentX="center" maxWidth="880px"]

	<h1>my-library</h1>
	<CodeBlock code="npm install -D my-library" lang="bash" />

[/PAGE]
```

### Layouts — `[LAYOUT]`

Full-page component compositions rendered on an isolated stage.

```sdoc
<script lang="ts">
	import Card from './Card.svelte';
	import Input from './Input.svelte';
	import Button from './Button.svelte';
</script>

[LAYOUT title="Patterns / Login Form" padding="24px"]

	<Card padding="24px">
		<Input label="Email" type="email" />
		<Input label="Password" type="password" />
		<Button>Sign in</Button>
	</Card>

[/LAYOUT]
```

The full language reference lives at
[gabilungu.github.io/sdocs/language/overview](https://gabilungu.github.io/sdocs/language/overview).

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

Each preview gets live controls based on prop types:

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

  // Header title and logo
  title: 'My Design System',

  // CSS loaded in preview iframes
  css: './src/styles/global.css',

  // Top-bar sections, each with its own sidebar order
  sections: [
    { slug: 'components', title: 'Components', order: ['Button', 'Input'] },
    { slug: 'guides', title: 'Guides' },
  ],
};
```

### Customization Axes

Declare the dimensions your design system varies along, and each gets a control in the top bar:

```js
axes: [
  { id: 'scheme',  label: 'Theme',   values: ['light', 'dark'] },
  { id: 'density', label: 'Density', values: ['airy', 'compact'] },
  { id: 'palette', label: 'Color',   values: ['blue', 'red', 'olive'] },
]
```

The reader's pick lands on every preview, example and layout as a `data-` attribute — `<html data-scheme="dark" data-density="compact">` — and your own CSS gives it meaning:

```css
[data-scheme="dark"]     { color-scheme: dark; --color-bg: #0f1115; }
[data-density="compact"] { --space-md: 8px; }
```

sdocs never interprets an axis, so you can declare any dimensions you like. The first value is the default, and picks persist across sessions.

### CSS Stylesheet Switching

Provide named stylesheets to let users switch between whole files:

```js
css: {
  light: './src/styles/light.css',
  dark: './src/styles/dark.css',
}
```

Reach for **axes** instead when variants multiply — three palettes × two densities is six stylesheets to maintain but two axes to declare, and axes compose where file swaps can't.

### Sidebar Ordering

Sidebar order is per **section**, set by that section's `order` array. Listed
items come first, in the order given; everything else follows alphabetically,
so there is no wildcard to write:

```js
sections: [
  { slug: 'components', title: 'Components', order: ['Button', 'Input'] },
  { slug: 'guides', title: 'Guides', order: ['Getting Started'] },
]
```

Entities join a section through their title's `@slug/` prefix —
`title="@components/Forms / Button"`. An `order` entry names the route path
relative to its section.

## Package Exports

| Export | Description |
|--------|-------------|
| `sdocs` | Main entry — `sdocsPlugin` + types |
| `sdocs/vite` | Vite plugin function |
| `sdocs/explorer` | Explorer.svelte UI component |
| `sdocs/ui` | Reusable UI components (Button, Frame, Icon, Control, NavTree, Stack) |
| `sdocs/language` | The sdoc scanner, parser, and Svelte projection |
| `sdocs/grammar/sdoc.tmLanguage.json` | TextMate grammar for editors and highlighters |

## License

MIT
