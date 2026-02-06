# sdocs

A lightweight documentation tool for Svelte 5 components.

Drop `.docs.svelte` files next to your components and get auto-generated interactive documentation with live previews, prop controls, CSS custom property editors, and method listings — all extracted from your source code.

## Features

- Auto-detected props with interactive controls
- CSS custom properties via `@cssvar` JSDoc tags
- Exported function detection (methods panel)
- Snippet-based examples with source code display
- Vite plugin with HMR support
- Zero config — works out of the box

## Quick start

```bash
npm install sdocs
```

```js
// vite.config.ts
import { sdocsPlugin } from 'sdocs/vite';

export default defineConfig({
  plugins: [sveltekit(), sdocsPlugin()]
});
```

```svelte
<!-- +page.svelte -->
<script>
  import { Sdocs } from 'sdocs';
  import { docs } from 'virtual:sdocs';
</script>

<Sdocs {docs} />
```

## License

MIT
