---
title: VS Code Extension
---

The sdocs extension brings `.sdoc` files and the [Explorer](/explorer) into
VS Code: full Svelte IntelliSense in doc files, sdocs-aware completions and
diagnostics, and a Projects view that runs your docs and opens them in an
editor tab — no terminal, no browser.

## Install

Search for **sdocs** in the Extensions view, or install from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=gabilungu.sdocs).
The [Svelte extension](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)
is required and installs automatically as a dependency.

## What you get

- **[Language support](/extension/language-support)** — `.sdoc` files run as
  their own language, served by a bundled language server that gives block
  bodies full Svelte intelligence (completion, hover, diagnostics,
  go-to-definition) and fragment-wise formatting, plus block-format
  completions and the same parser diagnostics the build uses.
- **[Projects view](/extension/projects-view)** — every sdocs project in your
  workspace as a card, with Run / Open / Stop controls and live status.
- **[Docs tabs](/extension/docs-tabs)** — the Explorer opens in an editor tab,
  one per project, with a refresh button and `Cmd+R` support.

## Scaffolding new docs

Right-click any `.svelte` file in the explorer (or run **sdocs: New Component
Doc** from the palette) to scaffold a matching `.sdoc` next to it, pre-filled
with the component import and a `[DOCS]` block wrapping a `[preview]`. If the
doc already exists, it opens instead.
