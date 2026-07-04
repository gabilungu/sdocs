import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		globalSetup: ['tests/helpers/build.ts'],
		testTimeout: 120_000,
		hookTimeout: 120_000,
		// The suites drive one server process each; keep them sequential.
		fileParallelism: false,
	},
});
