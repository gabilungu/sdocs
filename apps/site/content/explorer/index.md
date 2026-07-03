---
title: The Explorer
---

The Explorer is the heart of sdocs: an interactive component browser generated
from `.sdoc` files in your project. Write a small doc file next to each Svelte
component and the Explorer gives you live previews, auto-generated prop
controls, extracted prop tables, and a searchable sidebar — with zero build
configuration.

There are two ways to run it:

- **[Standalone](/cli)** — `npx sdocs run` starts the Explorer as its own dev
  server, no host app (or even an sdocs install) required.
- **[Embedded](/explorer/embedded-vite)** — mount the Explorer as a route
  inside your existing Vite or SvelteKit app.

## In this section

- [Getting Started](/explorer/getting-started) — install and write your first doc
- **Writing docs**
  - [Component docs (`.sdoc`)](/explorer/writing-docs/component-sdoc)
  - [Page docs (`.page.sdoc`)](/explorer/writing-docs/page-sdoc)
  - [Layout docs (`.layout.sdoc`)](/explorer/writing-docs/layout-sdoc)
- **Features**
  - [Prop extraction](/explorer/features/prop-extraction)
  - [Interactive controls](/explorer/features/interactive-controls)
  - [Theming & CSS switching](/explorer/features/theming)
  - [Sidebar](/explorer/features/sidebar)
  - [Routing](/explorer/features/routing)
- [Embedded in Vite / SvelteKit](/explorer/embedded-vite)
- [Configuration reference](/explorer/configuration)
- [Types](/explorer/types)

## The other entities

- [CLI](/cli) — run, build, and scaffold from the command line
- [VS Code extension](/extension) — `.sdoc` IntelliSense and one-click docs inside the editor
