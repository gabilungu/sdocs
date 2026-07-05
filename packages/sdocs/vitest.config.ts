import { defineConfig } from 'vitest/config';

// Standalone test config: the package's vite.config.ts is the dogfood dev
// server (it roots Vite in .sdocs/), which is not what tests should inherit.
export default defineConfig({
	test: {
		// Both packages' package.json are named "sdocs"; an explicit project
		// name keeps them distinct in the Vitest workspace / Test Explorer.
		name: 'sdocs',
		include: ['tests/**/*.test.ts'],
		environment: 'node',
	},
});
