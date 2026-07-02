# sdocs

A lightweight documentation tool for Svelte 5 components. This repository is an npm-workspaces monorepo.

## Packages

| Path | Description |
|------|-------------|
| [packages/sdocs](packages/sdocs) | The `sdocs` npm package — CLI, Vite plugin, and Svelte UI |
| [packages/vscode](packages/vscode) | VS Code extension — `.sdoc` language support |
| [apps/site](apps/site) | The documentation website — markdown-driven SvelteKit app |
| [apps/testapp](apps/testapp) | Test app — a SvelteKit app exercising the local package |

## Development

```bash
npm install            # install all workspaces
npm run build          # build the sdocs library
npm run dev            # sdocs dev server (dogfoods its own docs)
npm run site:dev       # run the documentation site
npm run site:build     # build the documentation site
npm run testapp:dev    # run the test app against local sdocs
npm run vscode:build   # build the VS Code extension
```

The VS Code extension is a self-contained package built with esbuild. It is intentionally kept
out of the npm workspace graph so it can keep the npm `name` `sdocs` and preserve its Marketplace
identity (`gabilungu.sdocs`); build it with `npm run vscode:build`.

## Documentation site

The site's content lives in [apps/site/content/docs](apps/site/content/docs) as plain markdown —
the single source of truth for the docs. Directory nesting defines the sidebar sections, numeric
filename prefixes (`01-…`) define order (and are stripped from URLs), and each file's frontmatter
carries only a `title`.

Deployment to GitHub Pages is handled by [deploy-site.yml](.github/workflows/deploy-site.yml)
on every push to `main`. The repo's Pages source must be set to "GitHub Actions".

## License

MIT
