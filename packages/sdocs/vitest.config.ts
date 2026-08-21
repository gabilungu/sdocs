import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Standalone test config: the package's vite.config.ts is the dogfood dev
// server (it roots Vite in .sdocs/), which is not what tests should inherit.
export default defineConfig({
	// `.svelte.ts` modules are runes source, not plain TypeScript — without the
	// compiler a test that imports one dies on `$state is not defined`.
	plugins: [svelte()],
	// Svelte ships a server build and a client build behind export conditions.
	// Mounting a component needs the client one; without this, `mount()` from
	// 'svelte' resolves to the SSR entry and throws. It is safe for the rest of
	// the suite — this config is test-only, and the node-environment tests do
	// not touch the differing modules.
	resolve: { conditions: ['browser'] },
	test: {
		// Both packages' package.json are named "sdocs"; an explicit project
		// name keeps them distinct in the Vitest workspace / Test Explorer.
		name: 'sdocs',
		include: ['tests/**/*.test.ts'],
		// Node by default — most of this suite is a parser, a scanner and a
		// CLI. A test that needs a DOM opts in with a
		// `// @vitest-environment happy-dom` pragma at the top of the file.
		environment: 'node',
	},
});
