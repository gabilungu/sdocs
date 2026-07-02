# sdocs

A lightweight documentation tool for Svelte 5 components. This repository is an npm-workspaces monorepo.

## Packages

| Path | Description |
|------|-------------|
| [packages/sdocs](packages/sdocs) | The `sdocs` npm package — CLI, Vite plugin, and Svelte UI |
| [packages/vscode](packages/vscode) | VS Code extension — `.sdoc` language support |
| [examples/testproj](examples/testproj) | Sample SvelteKit app consuming the local package |

## Development

```bash
npm install            # install all workspaces
npm run build          # build the sdocs library
npm run dev            # sdocs dev server (dogfoods its own docs)
npm run example:dev    # run the example app against local sdocs
npm run vscode:build   # build the VS Code extension
```

The VS Code extension is a self-contained package built with esbuild. It is intentionally kept
out of the npm workspace graph so it can keep the npm `name` `sdocs` and preserve its Marketplace
identity (`gabilungu.sdocs`); build it with `npm run vscode:build`.

See [docs/](docs/) for the published documentation site.

## License

MIT
