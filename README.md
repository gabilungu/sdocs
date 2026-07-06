# sdocs

A lightweight documentation tool for Svelte 5 components. This repository is an npm-workspaces monorepo.

## Packages

| Path | Description |
|------|-------------|
| [packages/sdocs](packages/sdocs) | The `sdocs` npm package — CLI, Vite plugin, and Svelte UI |
| [packages/vscode](packages/vscode) | VS Code extension — `.sdoc` language support |
| [apps/docs](apps/docs) | The documentation website — built with sdocs itself |
| [apps/testapp-embedded](apps/testapp-embedded) | Test app — SvelteKit app with sdocs embedded as a dependency |
| [apps/testapp-standalone](apps/testapp-standalone) | Test app — no sdocs installed, exercises the standalone CLI |

## Development

```bash
npm install            # install all workspaces
npm run build          # build the sdocs library
npm run dev            # sdocs dev server (dogfoods its own docs)
npm run docs:dev          # run the documentation site
npm run docs:build        # build the documentation site
npm run embedded:dev      # run the embedded test app (sdocs as dependency)
npm run standalone:run    # run the standalone test app via the local CLI
npm run standalone:build  # static-build the standalone test app
npm run vscode:build      # build the VS Code extension
```

The VS Code extension is a self-contained package built with esbuild. It is intentionally kept
out of the npm workspace graph so it can keep the npm `name` `sdocs` and preserve its Marketplace
identity (`gabilungu.sdocs`); build it with `npm run vscode:build`.

## Documentation site

The documentation site is built with sdocs itself: every guide in [apps/docs/src/docs](apps/docs/src/docs)
is a `[DOC]` entity, the landing page in [apps/docs/src/pages](apps/docs/src/pages) is a `[PAGE]`,
the top-bar sections come from [apps/docs/sdocs.config.js](apps/docs/sdocs.config.js),
and the Demo section showcases the site's own components ([apps/docs/src/ui](apps/docs/src/ui)) as
live `[SHOWCASE]` docs.

Deployment to GitHub Pages is handled by [deploy-docs.yml](.github/workflows/deploy-docs.yml)
on every push to `main`. The repo's Pages source must be set to "GitHub Actions".

## License

MIT
