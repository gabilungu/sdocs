import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Standalone test config: the package's vite.config.ts is the dogfood dev
// server (it roots Vite in .sdocs/), which is not what tests should inherit.
export default defineConfig({
	// `.svelte.ts` modules are runes source, not plain TypeScript — without the
	// compiler a test that imports one dies on `$state is not defined`.
	plugins: [svelte()],
	test: {
		// Both packages' package.json are named "sdocs"; an explicit project
		// name keeps them distinct in the Vitest workspace / Test Explorer.
		name: 'sdocs',
		include: ['tests/**/*.test.ts'],
		environment: 'node',
	},
});
