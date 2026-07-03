import { sveltekit } from '@sveltejs/kit/vite';
import { sdocsPlugin } from 'sdocs/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		sdocsPlugin({
			include: ['./src/lib/ui/**/*.sdoc'],
		}),
	],
	server: {
		fs: {
			// The Explorer's stylesheet pulls fonts from the workspace sdocs package
			allow: ['../..'],
		},
	},
});
