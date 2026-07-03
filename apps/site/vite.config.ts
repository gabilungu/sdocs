import { sveltekit } from '@sveltejs/kit/vite';
import { sdocsPlugin } from 'sdocs/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		// Options come from sdocs.config.js at the project root
		sdocsPlugin(),
	],
	server: {
		fs: {
			// The Explorer's stylesheet pulls fonts from the workspace sdocs package
			allow: ['../..'],
		},
	},
});
