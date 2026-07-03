---
title: Projects View
---

The mascot in the activity bar opens the sdocs Projects view: one card per
sdocs project in your workspace.

## Detection

A folder counts as a project when it contains an `sdocs.config.*` file or any
`.sdoc` files. In monorepos where detection misses a folder, add it to the
`sdocs.scopes` setting (workspace-relative or absolute paths):

```json
{
  "sdocs.scopes": ["packages/design-system"]
}
```

Use the refresh icon in the view's title bar to re-scan after adding files.

## Cards

Each card shows the folder name, its workspace-relative path, live status,
and the port while running, with:

- **Run** — starts the Explorer for that project. Uses the project's own
  sdocs install when present, `npx sdocs` otherwise.
- **Open** — shows the project's [docs tab](/extension/docs-tabs).
- **Browser ↗** — opens the running docs in your default browser.
- **Stop** — stops the server.

Server logs stream to the **sdocs** output channel.
