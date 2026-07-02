# testapp-standalone

Test project for the **standalone sdocs CLI**. Unlike `apps/testapp-embedded`
(which embeds sdocs as a dependency inside a SvelteKit app), this project
deliberately does **not** list sdocs in its `package.json` — it exercises the
no-install flow:

```bash
npx sdocs run
```

From the monorepo, run it against the local package instead:

```bash
npm run standalone:run     # from the repo root
npm run standalone:build   # static build to apps/testapp-standalone/dist
```

What it covers:

- `sdocs run` / `dev` / `build` / `preview` from a project that never
  installed sdocs
- Components with **host-only dependencies** (`clsx`) that must resolve from
  this project's `node_modules`, not sdocs'
- Plain-JS components documented via JSDoc
