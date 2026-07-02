import { defineConfig } from 'vitest/config';

// Standalone test config: the package's vite.config.ts is the dogfood dev
// server (it roots Vite in .sdocs/), which is not what tests should inherit.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
